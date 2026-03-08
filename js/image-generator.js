/* ========== IMAGE GENERATOR ========== */

const ImageGenerator = {
    refImages: [], // { file, dataUrl, label }
    generatedImages: [], // from history
    currentViewIndex: -1,

    async init() {
        // Try loading from Firebase first, fallback to localStorage
        const firebaseImages = await FirebaseSync.loadImageHistory();
        if (firebaseImages.length > 0) {
            this.generatedImages = firebaseImages;
            Storage.set('image_history', firebaseImages);
        } else {
            this.generatedImages = Storage.getImageHistory();
        }
        this.renderGrid();
        this.loadModelState();
        this.bindEvents();
    },

    loadModelState() {
        const modelId = Storage.getSelectedImageModel();
        const select = document.getElementById('imgModelSelect');
        if (select) select.value = modelId;
        this.updateModelDisplay(modelId);
    },

    updateModelDisplay(modelId) {
        const select = document.getElementById('imgModelSelect');
        const option = select ? select.querySelector(`option[value="${modelId}"]`) : null;
        const badge = document.getElementById('imgModelBadge');
        const name = document.getElementById('imgModelName');

        if (option) {
            badge.textContent = option.dataset.badge || 'NB2';
            name.textContent = option.textContent;
        }
    },

    bindEvents() {
        // Model config
        document.getElementById('btnImgModelConfig').addEventListener('click', () => {
            document.getElementById('modalImgModel').classList.remove('hidden');
        });
        document.getElementById('btnImgModelCancel').addEventListener('click', () => {
            document.getElementById('modalImgModel').classList.add('hidden');
        });
        document.getElementById('btnImgModelSave').addEventListener('click', () => {
            const select = document.getElementById('imgModelSelect');
            Storage.setSelectedImageModel(select.value);
            this.updateModelDisplay(select.value);
            document.getElementById('modalImgModel').classList.add('hidden');
        });

        // Prompt actions
        document.getElementById('btnImgClear').addEventListener('click', () => {
            document.getElementById('imgPrompt').value = '';
        });
        document.getElementById('btnImgEnhance').addEventListener('click', () => {
            this.enhancePrompt();
        });

        // Resolution toggles
        document.getElementById('imgResolution').addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-toggle');
            if (!btn) return;
            document.querySelectorAll('#imgResolution .btn-toggle').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });

        // Image count slider
        document.getElementById('imgCount').addEventListener('input', (e) => {
            document.getElementById('imgCountVal').textContent = e.target.value;
        });

        // Dropzone
        const dropzone = document.getElementById('imgDropzone');
        const fileInput = document.getElementById('imgRefFiles');

        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('drag-over');
        });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('drag-over');
            this.addRefImages(e.dataTransfer.files);
        });
        fileInput.addEventListener('change', (e) => {
            this.addRefImages(e.target.files);
            fileInput.value = '';
        });

        // Character select
        document.getElementById('imgCharacterSelect').addEventListener('change', (e) => {
            const charId = e.target.value;
            const info = document.getElementById('identityLockInfo');
            const thumbs = document.getElementById('characterThumbs');

            if (charId) {
                const char = Characters.getById(charId);
                thumbs.innerHTML = '';
                const charImages = char.images || [];
                if (charImages.length > 0) {
                    charImages.forEach(url => {
                        const img = document.createElement('img');
                        img.src = url;
                        thumbs.appendChild(img);
                    });
                } else {
                    // Backwards compat: old format
                    if (char.faceImage) {
                        const img = document.createElement('img');
                        img.src = char.faceImage;
                        thumbs.appendChild(img);
                    }
                    if (char.bodyImage) {
                        const img = document.createElement('img');
                        img.src = char.bodyImage;
                        thumbs.appendChild(img);
                    }
                }
                info.style.display = 'flex';
            } else {
                info.style.display = 'none';
            }
        });

        // Quick add character
        document.getElementById('btnCharAddQuick').addEventListener('click', () => {
            Characters.openEditor(null);
        });

        // Generate
        document.getElementById('btnImgGenerate').addEventListener('click', () => this.generate());

        // Sub-tabs
        document.querySelectorAll('#image-generator .sub-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('#image-generator .sub-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                const subtab = tab.dataset.subtab;
                const genGrid = document.getElementById('imgGenerationGrid');
                const charManager = document.getElementById('imgCharacterManager');
                const searchBar = document.getElementById('imgSearchBar');

                if (subtab === 'character') {
                    genGrid.classList.add('hidden');
                    charManager.classList.remove('hidden');
                    searchBar.classList.add('hidden');
                    Characters.renderGrid();
                } else {
                    genGrid.classList.remove('hidden');
                    charManager.classList.add('hidden');
                    searchBar.classList.remove('hidden');
                }
            });
        });

        // Character grid events (delegated)
        document.getElementById('characterGrid').addEventListener('click', (e) => {
            const editBtn = e.target.closest('.btn-edit-char');
            if (editBtn) Characters.openEditor(editBtn.dataset.id);
        });

        document.getElementById('btnNewCharacter').addEventListener('click', () => {
            Characters.openEditor(null);
        });

        // Character editor
        document.getElementById('btnCharSave').addEventListener('click', () => Characters.saveFromEditor());
        document.getElementById('btnCharCancel').addEventListener('click', () => Characters.closeEditor());
        document.getElementById('btnCharDelete').addEventListener('click', () => Characters.deleteFromEditor());

        // Character dropzone
        const charDropzone = document.getElementById('charDropzone');
        const charFileInput = document.getElementById('charFileInput');

        charDropzone.addEventListener('click', () => charFileInput.click());
        charDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            charDropzone.classList.add('drag-over');
        });
        charDropzone.addEventListener('dragleave', () => charDropzone.classList.remove('drag-over'));
        charDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            charDropzone.classList.remove('drag-over');
            Characters.addEditImages(e.dataTransfer.files);
        });
        charFileInput.addEventListener('change', (e) => {
            Characters.addEditImages(e.target.files);
            charFileInput.value = '';
        });

        // Image viewer
        document.getElementById('btnCloseViewer').addEventListener('click', () => {
            document.getElementById('modalImageViewer').classList.add('hidden');
        });
        document.getElementById('btnViewerPrev').addEventListener('click', () => this.viewPrev());
        document.getElementById('btnViewerNext').addEventListener('click', () => this.viewNext());
        document.getElementById('btnReuseSettings').addEventListener('click', () => this.reuseSettings());
    },

    async addRefImages(files) {
        for (const file of files) {
            if (this.refImages.length >= 14) break;
            const dataUrl = await API.fileToBase64(file);
            const idx = this.refImages.length + 1;
            this.refImages.push({ file, dataUrl, label: `@img${idx}` });
        }
        this.renderRefPreviews();
    },

    renderRefPreviews() {
        const container = document.getElementById('refImagesPreview');
        container.innerHTML = '';
        this.refImages.forEach((img, i) => {
            const thumb = document.createElement('div');
            thumb.className = 'ref-thumb';
            thumb.innerHTML = `
                <img src="${img.dataUrl}" alt="ref">
                <span class="ref-label">${img.label}</span>
                <button class="btn-remove" data-idx="${i}">✕</button>
            `;
            thumb.querySelector('.btn-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                this.refImages.splice(i, 1);
                this.refImages.forEach((img, j) => img.label = `@img${j + 1}`);
                this.renderRefPreviews();
            });
            container.appendChild(thumb);
        });
    },

    enhancePrompt() {
        const textarea = document.getElementById('imgPrompt');
        const current = textarea.value.trim();
        if (!current) return;
        textarea.value = current + '. Ultra-realistic, high detail, professional photography, 8K resolution, perfect lighting, cinematic composition.';
    },

    async generate() {
        const prompt = document.getElementById('imgPrompt').value.trim();
        if (!prompt) return alert('Enter a prompt');

        const modelId = Storage.getSelectedImageModel();
        const size = document.getElementById('imgSize').value;
        const resolution = document.querySelector('#imgResolution .btn-toggle.active').dataset.value;
        const count = parseInt(document.getElementById('imgCount').value);
        const charId = document.getElementById('imgCharacterSelect').value;

        // Build full prompt with identity lock
        let fullPrompt = prompt;
        if (charId) {
            fullPrompt = Characters.buildIdentityPrompt(charId) + ' ' + prompt;
        }

        const btn = document.getElementById('btnImgGenerate');
        btn.disabled = true;
        btn.textContent = 'Generating...';

        try {
            for (let i = 0; i < count; i++) {
                const placeholderId = 'gen-' + Date.now() + '-' + i;
                this.addGeneratingCard(placeholderId);

                // Build params
                const params = {
                    prompt: fullPrompt,
                    output_format: 'png'
                };

                if (size) params.aspect_ratio = size;
                if (resolution) params.resolution = resolution;

                // For edit models, add images
                if (!API.isTextToImage(modelId)) {
                    const imageUrls = [];

                    // Character reference images
                    if (charId) {
                        const char = Characters.getById(charId);
                        const charImages = char.images || [];
                        if (charImages.length > 0) {
                            charImages.forEach(url => imageUrls.push(url));
                        } else {
                            // Backwards compat
                            if (char.faceImage) imageUrls.push(char.faceImage);
                            if (char.bodyImage) imageUrls.push(char.bodyImage);
                        }
                    }

                    // Omni reference images
                    for (const ref of this.refImages) {
                        imageUrls.push(ref.dataUrl);
                    }

                    if (imageUrls.length > 0) {
                        params.images = imageUrls;
                    }
                }

                // For Nano Banana 2 Edit, add enable_web_search
                if (modelId === 'nano-banana-2-edit') {
                    params.enable_web_search = false;
                }

                try {
                    const submitResult = await API.submit(modelId, params);
                    const requestId = submitResult.data?.id || submitResult.id;

                    if (!requestId) {
                        // Sync mode - immediate result
                        const outputs = submitResult.data?.outputs || submitResult.outputs ||
                                        (submitResult.data?.output ? [].concat(submitResult.data.output) : []);
                        for (const url of outputs) {
                            this.addToHistory(url, fullPrompt, modelId, size, resolution);
                        }
                        this.removeGeneratingCard(placeholderId);
                        this.renderGrid();
                        continue;
                    }

                    // Poll for result
                    const result = await API.poll(requestId, (elapsed) => {
                        this.updateGeneratingTime(placeholderId, elapsed);
                    });

                    const outputs = result.data?.outputs || result.outputs ||
                                    (result.data?.output ? [].concat(result.data.output) : []);
                    for (const url of outputs) {
                        this.addToHistory(url, fullPrompt, modelId, size, resolution);
                    }
                    this.removeGeneratingCard(placeholderId);
                    this.renderGrid();
                } catch (err) {
                    this.removeGeneratingCard(placeholderId);
                    throw err;
                }
            }
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Generate Image';
            if (window.refreshBalance) window.refreshBalance();
        }
    },

    async addToHistory(url, prompt, model, size, resolution) {
        const cost = API.getImageCost(model, resolution);
        const item = {
            id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
            url,
            prompt,
            model,
            size,
            resolution,
            cost,
            timestamp: new Date().toISOString()
        };

        // Upload to Firebase Storage for permanent URL
        const firebaseUrl = await FirebaseSync.uploadImageFromUrl(url, `${item.id}.png`);
        if (firebaseUrl !== url) item.url = firebaseUrl;

        this.generatedImages.unshift(item);
        Storage.addImageToHistory(item);
        FirebaseSync.saveImageRecord(item);
    },

    addGeneratingCard(id) {
        document.getElementById('imgEmptyState').style.display = 'none';
        const grid = document.getElementById('imageGrid');
        const card = document.createElement('div');
        card.className = 'image-card generating';
        card.id = id;
        card.innerHTML = `
            <div class="gen-progress">
                <div class="gen-ring"></div>
                <span class="gen-time">0.0s</span>
                <span class="gen-turbo">⚡ Turbo On</span>
            </div>
        `;
        grid.prepend(card);
    },

    updateGeneratingTime(id, elapsed) {
        const card = document.getElementById(id);
        if (card) {
            const timeEl = card.querySelector('.gen-time');
            if (timeEl) timeEl.textContent = elapsed + 's';
        }
    },

    removeGeneratingCard(id) {
        const card = document.getElementById(id);
        if (card) card.remove();
    },

    renderGrid() {
        const grid = document.getElementById('imageGrid');
        const emptyState = document.getElementById('imgEmptyState');

        const genCards = grid.querySelectorAll('.generating');
        grid.innerHTML = '';
        genCards.forEach(c => grid.appendChild(c));

        if (this.generatedImages.length === 0 && genCards.length === 0) {
            emptyState.style.display = 'flex';
            return;
        }

        emptyState.style.display = 'none';

        this.generatedImages.forEach((img, idx) => {
            const card = document.createElement('div');
            card.className = 'image-card';
            const costLabel = img.cost ? `$${img.cost.toFixed(3)}` : '';
            const isFav = img.starred ? 'starred' : '';
            card.innerHTML = `
                <img src="${img.url}" alt="Generated" loading="lazy">
                ${costLabel ? `<span class="card-cost">${costLabel}</span>` : ''}
                <div class="card-actions-right">
                    <button class="btn-card ${isFav}" title="Favorite" data-action="star" data-idx="${idx}">☆</button>
                    <button class="btn-card" title="Download" data-action="download" data-idx="${idx}">⬇</button>
                    <button class="btn-card" title="Delete" data-action="delete" data-idx="${idx}">🗑</button>
                </div>
                <div class="card-actions-left">
                    <button class="btn-card" title="Send to Video" data-action="to-video" data-idx="${idx}">▶</button>
                    <button class="btn-card" title="Edit / Remix" data-action="remix" data-idx="${idx}">🎬</button>
                </div>
            `;
            card.addEventListener('click', (e) => {
                const actionBtn = e.target.closest('[data-action]');
                if (actionBtn) {
                    const action = actionBtn.dataset.action;
                    if (action === 'download') this.downloadImage(idx);
                    else if (action === 'delete') this.deleteImage(idx);
                    else if (action === 'star') this.toggleStar(idx);
                    else if (action === 'to-video') this.sendToVideo(idx);
                    else if (action === 'remix') this.remixImage(idx);
                    return;
                }
                this.openViewer(idx);
            });
            grid.appendChild(card);
        });
    },

    openViewer(idx) {
        this.currentViewIndex = idx;
        const img = this.generatedImages[idx];
        if (!img) return;

        document.getElementById('viewerImage').src = img.url;
        document.getElementById('viewerModel').textContent = img.model;
        document.getElementById('viewerPrompt').textContent = img.prompt;
        document.getElementById('modalImageViewer').classList.remove('hidden');
    },

    viewPrev() {
        if (this.currentViewIndex > 0) this.openViewer(this.currentViewIndex - 1);
    },

    viewNext() {
        if (this.currentViewIndex < this.generatedImages.length - 1) this.openViewer(this.currentViewIndex + 1);
    },

    reuseSettings() {
        const img = this.generatedImages[this.currentViewIndex];
        if (!img) return;
        document.getElementById('imgPrompt').value = img.prompt;
        document.getElementById('modalImageViewer').classList.add('hidden');
    },

    downloadImage(idx) {
        const img = this.generatedImages[idx];
        if (!img) return;
        const a = document.createElement('a');
        a.href = img.url;
        a.download = `generated_${img.id}.png`;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    },

    toggleStar(idx) {
        const img = this.generatedImages[idx];
        if (!img) return;
        img.starred = !img.starred;
        Storage.set('image_history', this.generatedImages);
        FirebaseSync.saveImageRecord(img);
        this.renderGrid();
    },

    sendToVideo(idx) {
        const img = this.generatedImages[idx];
        if (!img) return;

        // Switch to video tab
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('[data-tab="video-generator"]').classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById('video-generator').classList.add('active');

        // Set model to image-to-video
        Storage.setSelectedVideoModel('veo-3.1-fast-image-to-video');
        VideoGenerator.updateModelDisplay('veo-3.1-fast-image-to-video');
        VideoGenerator.updateUIForModel('veo-3.1-fast-image-to-video');

        // Set the source image
        VideoGenerator.sourceImageData = img.url;
        document.getElementById('vidSourceImg').src = img.url;
        document.getElementById('vidSourcePreview').style.display = 'block';
        document.getElementById('vidSourceDrop').style.display = 'none';
    },

    remixImage(idx) {
        const img = this.generatedImages[idx];
        if (!img) return;

        // Load the prompt back
        document.getElementById('imgPrompt').value = img.prompt || '';

        // Add the image as a reference in Omni Reference
        this.refImages = [{
            file: null,
            dataUrl: img.url,
            label: '@img1'
        }];
        this.renderRefPreviews();
    },

    deleteImage(idx) {
        if (!confirm('Delete this image?')) return;
        const removed = this.generatedImages.splice(idx, 1)[0];
        Storage.set('image_history', this.generatedImages);
        if (removed) FirebaseSync.deleteImageRecord(removed.id);
        this.renderGrid();
    }
};
