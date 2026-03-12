/* ========== LOCATION / ENVIRONMENT MANAGEMENT ========== */

const Locations = {
    currentEditId: null,
    editImages: [],
    _cache: null,

    getAll() {
        if (this._cache) return this._cache;
        return Storage.get('locations', []);
    },

    setAll(locs) {
        this._cache = locs;
        try { Storage.set('locations', locs); } catch (e) { /* localStorage may be full */ }
    },

    save(loc) {
        const locs = this.getAll();
        if (loc.id) {
            const idx = locs.findIndex(l => l.id === loc.id);
            if (idx >= 0) locs[idx] = loc;
            else locs.push(loc);
        } else {
            loc.id = 'loc-' + Date.now().toString();
            locs.push(loc);
        }
        this.setAll(locs);
        FirebaseSync.saveLocation(loc);
        return loc;
    },

    delete(id) {
        const locs = this.getAll().filter(l => l.id !== id);
        this.setAll(locs);
        FirebaseSync.deleteLocation(id);
    },

    getById(id) {
        return this.getAll().find(l => l.id === id) || null;
    },

    // Build environment lock prompt prefix with explicit @img references
    buildEnvironmentPrompt(locId, charImageCount = 0) {
        const loc = this.getById(locId);
        if (!loc) return '';
        const locImages = loc.images || [];
        if (locImages.length === 0) return '';

        // Build explicit @img references, respecting 14 image API limit
        const startIdx = charImageCount + 1;
        const maxLocImages = Math.min(locImages.length, 14 - charImageCount);
        if (maxLocImages <= 0) return '';
        const envRefs = Array.from({ length: maxLocImages }, (_, i) => `@img${startIdx + i}`).join(', ');

        return `ABSOLUTE ENVIRONMENT LOCK — The images ${envRefs} are ENVIRONMENT REFERENCE PHOTOS of the location "${loc.name}". The background, setting, and environment in the generated image MUST EXACTLY replicate this specific location. These environment reference images (${envRefs}) define the ENTIRE visual identity of the space: architectural structure, room layout, spatial dimensions, wall colors and textures, flooring material and pattern, ceiling details, lighting fixtures and light temperature, equipment placement and exact models, mirrors and reflective surfaces, signage and branding, decorative elements, window positions, door frames. The generated scene must be IMMEDIATELY RECOGNIZABLE as the SAME SPECIFIC real-world location shown in ${envRefs}. Do NOT substitute with generic or similar-looking environments. Do NOT alter the color palette, equipment brands, lighting temperature, or spatial arrangement. Camera angle and framing may vary but the physical space MUST remain identical to ${envRefs}. `;
    },

    // Render location dropdown
    renderDropdown() {
        const select = document.getElementById('imgLocationSelect');
        if (!select) return;
        const current = select.value;
        select.innerHTML = '<option value="">--- None ---</option>';
        this.getAll().forEach(loc => {
            const opt = document.createElement('option');
            opt.value = loc.id;
            opt.textContent = loc.name;
            select.appendChild(opt);
        });
        if (current) select.value = current;
    },

    // Get image count for a location
    getImageCount(locId) {
        if (!locId) return 0;
        const loc = this.getById(locId);
        if (!loc) return 0;
        return (loc.images || []).length;
    },

    // Open editor modal
    openEditor(locId = null) {
        this.currentEditId = locId;
        this.editImages = [];

        const modal = document.getElementById('modalLocEditor');
        const title = document.getElementById('locEditorTitle');
        const nameInput = document.getElementById('locName');
        const deleteBtn = document.getElementById('btnLocDelete');

        if (locId) {
            const loc = this.getById(locId);
            title.textContent = `Edit: ${loc.name}`;
            nameInput.value = loc.name;
            deleteBtn.classList.remove('hidden');

            let images = [...(loc.images || [])];
            images = [...new Set(images)];
            images.forEach((url, i) => {
                this.editImages.push({ dataUrl: url, label: `@env${i + 1}` });
            });
        } else {
            title.textContent = 'New Location';
            nameInput.value = '';
            deleteBtn.classList.add('hidden');
        }

        this.renderEditPreviews();
        this.updateDropzoneVisibility();
        modal.classList.remove('hidden');
    },

    closeEditor() {
        document.getElementById('modalLocEditor').classList.add('hidden');
        this.currentEditId = null;
        this.editImages = [];
    },

    async addEditImages(files) {
        for (const file of files) {
            if (this.editImages.length >= 14) break;
            if (!file.type.startsWith('image/')) continue;
            const dataUrl = await API.fileToBase64(file);
            const idx = this.editImages.length + 1;
            this.editImages.push({ dataUrl, label: `@env${idx}` });
        }
        this.renderEditPreviews();
        this.updateDropzoneVisibility();
    },

    removeEditImage(idx) {
        this.editImages.splice(idx, 1);
        this.editImages.forEach((img, i) => {
            img.label = `@env${i + 1}`;
        });
        this.renderEditPreviews();
        this.updateDropzoneVisibility();
    },

    updateDropzoneVisibility() {
        const dropzone = document.getElementById('locDropzone');
        dropzone.style.display = this.editImages.length >= 14 ? 'none' : 'block';
    },

    renderEditPreviews() {
        const container = document.getElementById('locImagesPreview');
        container.innerHTML = '';

        this.editImages.forEach((img, i) => {
            const thumb = document.createElement('div');
            thumb.className = 'char-img-thumb';
            thumb.innerHTML = `
                <img src="${img.dataUrl}" alt="${img.label}">
                <span class="char-img-label" style="background:#22c55e;">${img.label}</span>
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
        const name = document.getElementById('locName').value.trim();
        if (!name) return alert('Enter a location name');

        const saveBtn = document.getElementById('btnLocSave');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            const locId = this.currentEditId || 'loc-' + Date.now().toString();

            const loc = {
                id: locId,
                name,
                images: this.editImages.map(img => img.dataUrl)
            };

            // Upload to Firebase
            await FirebaseSync.saveLocation(loc, (done, total) => {
                saveBtn.textContent = `Saving ${done}/${total}...`;
            });

            const locs = this.getAll();
            if (this.currentEditId) {
                const idx = locs.findIndex(l => l.id === locId);
                if (idx >= 0) locs[idx] = loc;
                else locs.push(loc);
            } else {
                locs.push(loc);
            }
            this.setAll(locs);

            this.closeEditor();
            this.renderDropdown();
        } catch (err) {
            console.error('Error saving location:', err);
            alert('Error saving location: ' + err.message);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
        }
    },

    deleteFromEditor() {
        if (!this.currentEditId) return;
        if (!confirm('Delete this location?')) return;
        this.delete(this.currentEditId);
        this.closeEditor();
        this.renderDropdown();
    }
};
