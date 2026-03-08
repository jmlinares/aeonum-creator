/* ========== CHARACTER MANAGEMENT ========== */

const Characters = {
    currentEditId: null,
    editImages: [], // { dataUrl, label } — max 2

    getAll() {
        return Storage.getCharacters();
    },

    save(char) {
        const chars = this.getAll();
        if (char.id) {
            const idx = chars.findIndex(c => c.id === char.id);
            if (idx >= 0) chars[idx] = char;
        } else {
            char.id = Date.now().toString();
            chars.push(char);
        }
        Storage.saveCharacters(chars);
        FirebaseSync.saveCharacter(char);
        return char;
    },

    delete(id) {
        const chars = this.getAll().filter(c => c.id !== id);
        Storage.saveCharacters(chars);
        FirebaseSync.deleteCharacter(id);
    },

    getById(id) {
        return this.getAll().find(c => c.id === id) || null;
    },

    // Build identity lock prompt prefix from character
    buildIdentityPrompt(charId) {
        const char = this.getById(charId);
        if (!char) return '';
        return `ABSOLUTE IDENTITY LOCK — USE ONLY THE PROVIDED REFERENCE IMAGES. The female subject must EXACTLY match the face, bone structure, facial proportions, eye spacing, nose shape, lip volume, jawline, cheek structure, forehead height, skin tone, freckles placement, body proportions, shoulder width, waist-to-hip ratio, hip width, torso length, chest volume and overall anatomy from the uploaded reference images. Do NOT alter proportions. Do NOT beautify facial structure. Do NOT change ethnicity. Do NOT modify bone structure. Preserve natural anatomy exactly as reference. The reference images define 100% of the subject's identity. Hairstyle and makeup may change. Identity and proportions must remain identical. { "reference_image": "${char.name} face reference", "${char.name} body reference", "reference_adherence": "STRICT_VISUAL_FIDELITY", "identity_lock": { "priority": "ABSOLUTE", "instruction": "Use EXACT same person from the provided reference images. Same face, same freckles pattern, same eye color, same smile, same body proportions, same skin tone. No face drift, no beautification, no modification." } } `;
    },

    // Render character grid
    renderGrid() {
        const grid = document.getElementById('characterGrid');
        if (!grid) return;
        grid.innerHTML = '';

        const chars = this.getAll();
        chars.forEach(char => {
            const card = document.createElement('div');
            card.className = 'character-card';
            const charImages = char.images && char.images.length > 0
                ? char.images.slice(0, 4)
                : [char.faceImage, char.bodyImage].filter(Boolean);
            card.innerHTML = `
                <div class="char-card-name">${char.name}</div>
                <div class="char-card-images">
                    ${charImages.length > 0
                        ? charImages.map(url => `<img src="${url}" alt="ref">`).join('')
                        : `<div class="char-card-body-icon">👤</div>`}
                </div>
                <button class="btn-edit-char" data-id="${char.id}">Edit</button>
            `;
            grid.appendChild(card);
        });
    },

    // Render character dropdown
    renderDropdown() {
        const select = document.getElementById('imgCharacterSelect');
        if (!select) return;
        const current = select.value;
        select.innerHTML = '<option value="">--- None ---</option>';
        this.getAll().forEach(char => {
            const opt = document.createElement('option');
            opt.value = char.id;
            opt.textContent = char.name;
            select.appendChild(opt);
        });
        if (current) select.value = current;
    },

    // Open editor modal
    openEditor(charId = null) {
        this.currentEditId = charId;
        this.editImages = [];

        const modal = document.getElementById('modalCharEditor');
        const title = document.getElementById('charEditorTitle');
        const nameInput = document.getElementById('charName');
        const dropzone = document.getElementById('charDropzone');
        const deleteBtn = document.getElementById('btnCharDelete');

        if (charId) {
            const char = this.getById(charId);
            title.textContent = `Edit: ${char.name}`;
            nameInput.value = char.name;
            deleteBtn.classList.remove('hidden');

            // Load existing images
            const images = char.images || [];
            // Backwards compat: old format had faceImage/bodyImage
            if (images.length === 0) {
                if (char.faceImage) images.push(char.faceImage);
                if (char.bodyImage) images.push(char.bodyImage);
            }
            images.forEach((url, i) => {
                this.editImages.push({ dataUrl: url, label: `@img${i + 1}` });
            });
        } else {
            title.textContent = 'New Character';
            nameInput.value = '';
            deleteBtn.classList.add('hidden');
        }

        this.renderEditPreviews();
        this.updateDropzoneVisibility();
        modal.classList.remove('hidden');
    },

    closeEditor() {
        document.getElementById('modalCharEditor').classList.add('hidden');
        this.currentEditId = null;
        this.editImages = [];
    },

    async addEditImages(files) {
        for (const file of files) {
            if (this.editImages.length >= 14) break;
            if (!file.type.startsWith('image/')) continue;
            const dataUrl = await API.fileToBase64(file);
            const idx = this.editImages.length + 1;
            this.editImages.push({ dataUrl, label: `@img${idx}` });
        }
        this.renderEditPreviews();
        this.updateDropzoneVisibility();
    },

    removeEditImage(idx) {
        this.editImages.splice(idx, 1);
        // Relabel
        this.editImages.forEach((img, i) => {
            img.label = `@img${i + 1}`;
        });
        this.renderEditPreviews();
        this.updateDropzoneVisibility();
    },

    updateDropzoneVisibility() {
        const dropzone = document.getElementById('charDropzone');
        dropzone.style.display = this.editImages.length >= 14 ? 'none' : 'block';
    },

    renderEditPreviews() {
        const container = document.getElementById('charImagesPreview');
        container.innerHTML = '';

        this.editImages.forEach((img, i) => {
            const thumb = document.createElement('div');
            thumb.className = 'char-img-thumb';
            thumb.innerHTML = `
                <img src="${img.dataUrl}" alt="${img.label}">
                <span class="char-img-label">${img.label}</span>
                <button class="btn-remove" data-idx="${i}">✕</button>
            `;
            thumb.querySelector('.btn-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeEditImage(i);
            });
            container.appendChild(thumb);
        });
    },

    async saveFromEditor() {
        const name = document.getElementById('charName').value.trim();
        if (!name) return alert('Enter a character name');

        const saveBtn = document.getElementById('btnCharSave');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            const charId = this.currentEditId || Date.now().toString();

            const char = {
                id: charId,
                name,
                images: this.editImages.map(img => img.dataUrl),
                faceImage: this.editImages[0]?.dataUrl || '',
                bodyImage: this.editImages[1]?.dataUrl || ''
            };

            // Save to Firebase (uploads images to Storage in parallel, replaces base64 with URLs)
            await FirebaseSync.saveCharacter(char, (done, total) => {
                saveBtn.textContent = `Saving ${done}/${total}...`;
            });

            // Now char.images contains Firebase URLs (not base64) — safe for localStorage
            const chars = this.getAll();
            if (this.currentEditId) {
                const idx = chars.findIndex(c => c.id === charId);
                if (idx >= 0) chars[idx] = char;
                else chars.push(char);
            } else {
                chars.push(char);
            }

            try {
                Storage.saveCharacters(chars);
            } catch (e) {
                console.warn('localStorage full, chars saved to Firebase only');
            }

            this.closeEditor();
            this.renderGrid();
            this.renderDropdown();
        } catch (err) {
            console.error('Error saving character:', err);
            alert('Error saving character: ' + err.message);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
        }
    },

    deleteFromEditor() {
        if (!this.currentEditId) return;
        if (!confirm('Delete this character?')) return;
        this.delete(this.currentEditId);
        this.closeEditor();
        this.renderGrid();
        this.renderDropdown();
    }
};
