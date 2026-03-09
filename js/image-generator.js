/* ========== IMAGE GENERATOR ========== */

const ImageGenerator = {
    refImages: [], // { file, dataUrl, label }
    generatedImages: [], // from history
    currentViewIndex: -1,
    isGenerating: false,
    activeRequestIds: [], // track polling request IDs for cancellation
    viewerZoom: 1,

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
        this.updateResolutionButtons(modelId);
    },

    updateResolutionButtons(modelId) {
        const container = document.getElementById('imgResolution');
        const resolutions = API.getAvailableResolutions(modelId);
        container.innerHTML = '';
        resolutions.forEach((res, i) => {
            const btn = document.createElement('button');
            btn.className = 'btn-toggle' + (i === 0 ? ' active' : '');
            btn.dataset.value = res;
            btn.textContent = res.toUpperCase();
            container.appendChild(btn);
        });
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

        // Mention autocomplete
        const promptInput = document.getElementById('imgPrompt');
        const mentionDropdown = document.getElementById('mentionDropdown');
        let mentionSelectedIdx = 0;

        promptInput.addEventListener('input', () => {
            this.updateMentionDropdown(promptInput, mentionDropdown);

        });


        promptInput.addEventListener('keydown', (e) => {
            if (mentionDropdown.classList.contains('hidden')) return;
            const items = mentionDropdown.querySelectorAll('.mention-item');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                mentionSelectedIdx = Math.min(mentionSelectedIdx + 1, items.length - 1);
                items.forEach((el, i) => el.classList.toggle('selected', i === mentionSelectedIdx));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                mentionSelectedIdx = Math.max(mentionSelectedIdx - 1, 0);
                items.forEach((el, i) => el.classList.toggle('selected', i === mentionSelectedIdx));
            } else if (e.key === 'Enter' && items.length > 0) {
                e.preventDefault();
                items[mentionSelectedIdx]?.click();
            } else if (e.key === 'Escape') {
                mentionDropdown.classList.add('hidden');
            }
        });

        // Hide dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!promptInput.contains(e.target) && !mentionDropdown.contains(e.target)) {
                mentionDropdown.classList.add('hidden');
            }
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
            // Check if a URL was dropped (e.g. from external source)
            const textData = e.dataTransfer.getData('text/plain') || '';
            if (textData.startsWith('http')) {
                this.addRefFromUrl(textData);
                return;
            }
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
            // Re-label omni references to account for character images offset
            this.relabelRefImages();
            this.renderRefPreviews();
        });

        // Quick add character
        document.getElementById('btnCharAddQuick').addEventListener('click', () => {
            Characters.openEditor(null);
        });

        // Generate / Cancel
        document.getElementById('btnImgGenerate').addEventListener('click', () => {
            if (this.isGenerating) {
                this.cancelGeneration();
            } else {
                this.generate();
            }
        });

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
        document.getElementById('btnViewerZoomIn').addEventListener('click', () => this.viewerZoomChange(0.25));
        document.getElementById('btnViewerZoomOut').addEventListener('click', () => this.viewerZoomChange(-0.25));
        document.getElementById('btnViewerRefresh').addEventListener('click', () => this.viewerZoomReset());
        document.getElementById('btnReuseSettings').addEventListener('click', () => this.reuseSettings());
        document.getElementById('btnViewerDownload').addEventListener('click', () => {
            this.downloadImage(this.currentViewIndex);
        });
        document.getElementById('btnViewerSendVideo').addEventListener('click', () => {
            this.sendToVideo(this.currentViewIndex);
            document.getElementById('modalImageViewer').classList.add('hidden');
        });
        document.getElementById('btnViewerRemix').addEventListener('click', () => {
            this.remixImage(this.currentViewIndex);
            document.getElementById('modalImageViewer').classList.add('hidden');
        });
        document.getElementById('btnViewerDelete').addEventListener('click', () => {
            this.deleteImage(this.currentViewIndex);
            document.getElementById('modalImageViewer').classList.add('hidden');
        });
        document.getElementById('btnUseImage').addEventListener('click', () => {
            const img = this.generatedImages[this.currentViewIndex];
            if (img && img.prompt) {
                navigator.clipboard.writeText(img.prompt);
                const btn = document.getElementById('btnUseImage');
                btn.textContent = 'Copied!';
                setTimeout(() => btn.textContent = 'Copy Prompt', 1500);
            }
        });
    },

    getCharImageCount() {
        const charId = document.getElementById('imgCharacterSelect')?.value;
        if (!charId) return 0;
        const char = Characters.getById(charId);
        if (!char) return 0;
        const imgs = char.images || [];
        return imgs.length > 0 ? imgs.length : [char.faceImage, char.bodyImage].filter(Boolean).length;
    },

    relabelRefImages() {
        const offset = this.getCharImageCount();
        this.refImages.forEach((img, i) => {
            img.label = `@img${offset + i + 1}`;
        });
    },

    addRefFromUrl(url) {
        if (this.refImages.length >= 14) return;
        this.refImages.push({ file: null, dataUrl: url, label: '' });
        this.relabelRefImages();
        this.renderRefPreviews();
    },

    async addRefImages(files) {
        for (const file of files) {
            if (this.refImages.length >= 14) break;
            const dataUrl = await API.fileToBase64(file);
            this.refImages.push({ file, dataUrl, label: '' });
        }
        this.relabelRefImages();
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
                this.relabelRefImages();
                this.renderRefPreviews();
            });
            container.appendChild(thumb);
        });
    },

    getAllImageRefs() {
        const refs = [];
        // Character images
        const charId = document.getElementById('imgCharacterSelect')?.value;
        if (charId) {
            const char = Characters.getById(charId);
            if (char) {
                const imgs = char.images && char.images.length > 0
                    ? char.images
                    : [char.faceImage, char.bodyImage].filter(Boolean);
                imgs.forEach((url, i) => {
                    refs.push({ label: `@img${i + 1}`, thumb: url, source: char.name });
                });
            }
        }
        // Omni reference images
        this.refImages.forEach(img => {
            refs.push({ label: img.label, thumb: img.dataUrl, source: 'Omni Ref' });
        });
        return refs;
    },

    updateMentionDropdown(textarea, dropdown) {
        const val = textarea.value;
        const pos = textarea.selectionStart;
        // Find @ trigger before cursor
        const before = val.slice(0, pos);
        const atMatch = before.match(/@(\w*)$/);

        if (!atMatch) {
            dropdown.classList.add('hidden');
            return;
        }

        const query = atMatch[1].toLowerCase();
        const refs = this.getAllImageRefs();
        const filtered = refs.filter(r => r.label.toLowerCase().includes('@' + query) || r.label.toLowerCase().startsWith('@' + query));

        if (filtered.length === 0) {
            dropdown.classList.add('hidden');
            return;
        }

        dropdown.innerHTML = '';
        filtered.forEach((ref, i) => {
            const item = document.createElement('div');
            item.className = 'mention-item' + (i === 0 ? ' selected' : '');
            item.innerHTML = `
                <img src="${ref.thumb}" alt="">
                <span class="mention-label">${ref.label}</span>
                <span style="color:var(--text-secondary);font-size:11px;">${ref.source}</span>
            `;
            item.addEventListener('click', () => {
                // Replace @query with the full label
                const start = pos - atMatch[0].length;
                textarea.value = val.slice(0, start) + ref.label + ' ' + val.slice(pos);
                textarea.selectionStart = textarea.selectionEnd = start + ref.label.length + 1;
                textarea.focus();
                dropdown.classList.add('hidden');
    
            });
            dropdown.appendChild(item);
        });

        // Reset selection
        dropdown.querySelector('.mention-item')?.classList.add('selected');
        dropdown.classList.remove('hidden');
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
        this.isGenerating = true;
        this.activeRequestIds = [];
        btn.textContent = 'Cancel';
        btn.classList.add('cancel-mode');

        try {
            for (let i = 0; i < count; i++) {
                if (!this.isGenerating) break; // cancelled

                const placeholderId = 'gen-' + Date.now() + '-' + i;
                this.addGeneratingCard(placeholderId);

                // Build params
                const params = {
                    prompt: fullPrompt,
                    output_format: 'png'
                };

                if (size) params.aspect_ratio = size;
                if (resolution) params.resolution = resolution;

                // For edit models, add images (convert URLs to base64 for API)
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
                        // Convert all URLs to base64 for WaveSpeed API compatibility
                        const base64Images = await Promise.all(
                            imageUrls.map(url => API.urlToBase64(url))
                        );
                        params.images = base64Images;
                    }
                }

                // For Nano Banana 2 Edit, add enable_web_search
                if (modelId === 'nano-banana-2-edit') {
                    params.enable_web_search = false;
                }

                // For WAN 2.6 Image Edit
                if (modelId === 'wan-2.6-image-edit') {
                    params.seed = -1;
                    params.enable_prompt_expansion = false;
                }

                try {
                    console.log(`[Generate ${i+1}/${count}] Submitting...`);
                    const submitResult = await API.submit(modelId, params);
                    const requestId = submitResult.data?.id || submitResult.id;
                    console.log(`[Generate ${i+1}/${count}] requestId: ${requestId}`);

                    if (!requestId) {
                        // Sync mode - immediate result
                        const outputs = this.extractOutputs(submitResult);
                        console.log(`[Generate ${i+1}/${count}] Sync outputs:`, outputs);
                        for (const url of outputs) {
                            await this.addToHistory(url, fullPrompt, modelId, size, resolution);
                        }
                        this.removeGeneratingCard(placeholderId);
                        this.renderGrid();
                        continue;
                    }

                    // Track for cancellation
                    this.activeRequestIds.push(requestId);

                    // Poll for result
                    const result = await API.poll(requestId, (elapsed) => {
                        this.updateGeneratingTime(placeholderId, elapsed);
                    });

                    const outputs = this.extractOutputs(result);
                    console.log(`[Generate ${i+1}/${count}] Poll outputs:`, outputs);
                    for (const url of outputs) {
                        await this.addToHistory(url, fullPrompt, modelId, size, resolution);
                    }
                    this.removeGeneratingCard(placeholderId);
                    this.renderGrid();
                } catch (err) {
                    console.error(`[Generate ${i+1}/${count}] Error:`, err);
                    this.removeGeneratingCard(placeholderId);
                    if (err.message === 'CANCELLED') continue;
                    throw err;
                }
            }
        } catch (err) {
            if (err.message !== 'CANCELLED') {
                alert('Error: ' + err.message);
            }
        } finally {
            this.isGenerating = false;
            this.activeRequestIds = [];
            btn.textContent = 'Generate Image';
            btn.classList.remove('cancel-mode');
            if (window.refreshBalance) window.refreshBalance();
        }
    },

    extractOutputs(result) {
        // WaveSpeed responses can be { data: { outputs: [...] } } or { data: { data: { outputs: [...] } } }
        const d = result.data || result;
        const outputs = d.outputs || d.output || d.data?.outputs || d.data?.output || [];
        return Array.isArray(outputs) ? outputs : [outputs];
    },

    cancelGeneration() {
        this.isGenerating = false;
        // Cancel all active polling requests
        for (const reqId of this.activeRequestIds) {
            API.cancelPolling(reqId);
        }
        this.activeRequestIds = [];
        // Remove all generating cards
        document.querySelectorAll('.image-card.generating').forEach(c => c.remove());
        // Check if grid is empty
        if (this.generatedImages.length === 0) {
            document.getElementById('imgEmptyState').style.display = 'flex';
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
                    <button class="btn-card" title="Use as Reference" data-action="add-ref" data-idx="${idx}">＋</button>
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
                    else if (action === 'add-ref') this.addRefFromUrl(this.generatedImages[idx].url);
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

        this.viewerZoomReset();
        document.getElementById('viewerImage').src = img.url;
        document.getElementById('viewerModel').textContent = img.model;
        document.getElementById('viewerPrompt').textContent = img.prompt;
        document.getElementById('modalImageViewer').classList.remove('hidden');
    },

    viewerZoomChange(delta) {
        this.viewerZoom = Math.max(0.25, Math.min(5, this.viewerZoom + delta));
        const img = document.getElementById('viewerImage');
        img.style.transform = `scale(${this.viewerZoom})`;
        img.style.transformOrigin = 'center center';
    },

    viewerZoomReset() {
        this.viewerZoom = 1;
        const img = document.getElementById('viewerImage');
        img.style.transform = 'scale(1)';
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
