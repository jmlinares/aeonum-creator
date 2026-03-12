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
            document.getElementById('imgPromptHighlight').innerHTML = '';
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

        const highlightDiv = document.getElementById('imgPromptHighlight');

        promptInput.addEventListener('input', () => {
            this.updateMentionDropdown(promptInput, mentionDropdown);
            this.updatePromptHighlight(promptInput, highlightDiv);
        });

        promptInput.addEventListener('scroll', () => {
            highlightDiv.scrollTop = promptInput.scrollTop;
            highlightDiv.scrollLeft = promptInput.scrollLeft;
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

        // Click on @img in textarea opens dropdown to replace it
        promptInput.addEventListener('click', () => {
            const pos = promptInput.selectionStart;
            const val = promptInput.value;
            // Find if cursor is inside an @imgN token
            const regex = /@(img|env)\d+/g;
            let match;
            while ((match = regex.exec(val)) !== null) {
                const start = match.index;
                const end = start + match[0].length;
                if (pos >= start && pos <= end) {
                    // Cursor is inside this mention - show dropdown to replace
                    this._replacingMention = { start, end, original: match[0] };
                    const refs = this.getAllImageRefs();
                    if (refs.length === 0) break;
                    mentionDropdown.innerHTML = '';
                    refs.forEach((ref, i) => {
                        const item = document.createElement('div');
                        item.className = 'mention-item' + (i === 0 ? ' selected' : '');
                        item.innerHTML = `
                            <img src="${ref.thumb}" alt="">
                            <span class="mention-label">${ref.label}</span>
                            <span style="color:var(--text-secondary);font-size:11px;">${ref.source}</span>
                        `;
                        item.addEventListener('click', () => {
                            const v = promptInput.value;
                            promptInput.value = v.slice(0, start) + ref.label + v.slice(end);
                            promptInput.selectionStart = promptInput.selectionEnd = start + ref.label.length;
                            promptInput.focus();
                            mentionDropdown.classList.add('hidden');
                            this._replacingMention = null;
                            this.updatePromptHighlight(promptInput, highlightDiv);
                        });
                        mentionDropdown.appendChild(item);
                    });
                    mentionSelectedIdx = 0;
                    mentionDropdown.classList.remove('hidden');
                    return;
                }
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

        // Location select
        document.getElementById('imgLocationSelect').addEventListener('change', (e) => {
            const locId = e.target.value;
            const info = document.getElementById('locationLockInfo');
            const thumbs = document.getElementById('locationThumbs');

            if (locId) {
                const loc = Locations.getById(locId);
                thumbs.innerHTML = '';
                (loc.images || []).forEach(url => {
                    const img = document.createElement('img');
                    img.src = url;
                    thumbs.appendChild(img);
                });
                info.style.display = 'flex';
            } else {
                info.style.display = 'none';
            }
            this.relabelRefImages();
            this.renderRefPreviews();
        });

        // Quick add location
        document.getElementById('btnLocAddQuick').addEventListener('click', () => {
            Locations.openEditor(null);
        });

        // Location editor
        document.getElementById('btnLocSave').addEventListener('click', () => Locations.saveFromEditor());
        document.getElementById('btnLocCancel').addEventListener('click', () => Locations.closeEditor());
        document.getElementById('btnLocDelete').addEventListener('click', () => Locations.deleteFromEditor());

        // Location dropzone
        const locDropzone = document.getElementById('locDropzone');
        const locFileInput = document.getElementById('locFileInput');

        locDropzone.addEventListener('click', () => locFileInput.click());
        locDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            locDropzone.classList.add('drag-over');
        });
        locDropzone.addEventListener('dragleave', () => locDropzone.classList.remove('drag-over'));
        locDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            locDropzone.classList.remove('drag-over');
            Locations.addEditImages(e.dataTransfer.files);
        });
        locFileInput.addEventListener('change', (e) => {
            Locations.addEditImages(e.target.files);
            locFileInput.value = '';
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
                const colManager = document.getElementById('imgCollectionsManager');
                const searchBar = document.getElementById('imgSearchBar');

                genGrid.classList.add('hidden');
                charManager.classList.add('hidden');
                colManager.classList.add('hidden');
                searchBar.classList.add('hidden');

                if (subtab === 'character') {
                    charManager.classList.remove('hidden');
                    Characters.renderGrid();
                } else if (subtab === 'collections') {
                    colManager.classList.remove('hidden');
                    Collections.renderView();
                } else {
                    genGrid.classList.remove('hidden');
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
        document.getElementById('btnViewerAddToCol').addEventListener('click', () => {
            const img = this.generatedImages[this.currentViewIndex];
            if (img) Collections.showAddToCollectionModal(img.id);
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
        let count = 0;
        // Character images
        const charId = document.getElementById('imgCharacterSelect')?.value;
        if (charId) {
            const char = Characters.getById(charId);
            if (char) {
                const imgs = char.images || [];
                count += imgs.length > 0 ? imgs.length : [char.faceImage, char.bodyImage].filter(Boolean).length;
            }
        }
        // Location images
        const locId = document.getElementById('imgLocationSelect')?.value;
        if (locId) {
            count += Locations.getImageCount(locId);
        }
        return count;
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
        // Location images
        const locId = document.getElementById('imgLocationSelect')?.value;
        if (locId) {
            const loc = Locations.getById(locId);
            if (loc && loc.images) {
                loc.images.forEach((url, i) => {
                    refs.push({ label: `@img${refs.length + 1}`, thumb: url, source: loc.name });
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
                const hl = document.getElementById('imgPromptHighlight');
                if (hl) this.updatePromptHighlight(textarea, hl);
            });
            dropdown.appendChild(item);
        });

        // Reset selection
        dropdown.querySelector('.mention-item')?.classList.add('selected');
        dropdown.classList.remove('hidden');
    },

    updatePromptHighlight(textarea, highlightDiv) {
        const text = textarea.value;
        // Escape HTML and wrap @imgN references with highlight span
        const escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/@(img|env)\d+/g, '<span class="mention-tag">$&</span>');
        highlightDiv.innerHTML = escaped + '\n';
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
        const locId = document.getElementById('imgLocationSelect').value;

        // Build full prompt with identity lock + environment lock
        let fullPrompt = prompt;
        if (charId) {
            fullPrompt = Characters.buildIdentityPrompt(charId) + ' ' + fullPrompt;
        }
        if (locId) {
            // Calculate character image count for correct @img offset
            let charImgCount = 0;
            if (charId) {
                const char = Characters.getById(charId);
                if (char) {
                    const imgs = char.images || [];
                    charImgCount = imgs.length > 0 ? imgs.length : [char.faceImage, char.bodyImage].filter(Boolean).length;
                }
            }
            fullPrompt = Locations.buildEnvironmentPrompt(locId, charImgCount) + ' ' + fullPrompt;
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

                    // Location reference images
                    if (locId) {
                        const loc = Locations.getById(locId);
                        if (loc && loc.images) {
                            loc.images.forEach(url => imageUrls.push(url));
                        }
                    }

                    // Omni reference images
                    for (const ref of this.refImages) {
                        imageUrls.push(ref.dataUrl);
                    }

                    // API limit: max 14 images
                    if (imageUrls.length > 14) {
                        imageUrls.length = 14;
                    }

                    if (imageUrls.length > 0) {
                        // Ensure all images meet minimum dimension requirements (240px for WAN 2.6, etc.)
                        params.images = await Promise.all(
                            imageUrls.map(url => API.ensureMinDimensions(url, 240))
                        );
                    }
                }

                // For Nano Banana 2 Edit, add enable_web_search
                if (modelId === 'nano-banana-2-edit') {
                    params.enable_web_search = false;
                }

                // For WAN 2.6 Image Edit - output size derived from input images
                if (modelId === 'wan-2.6-image-edit') {
                    params.seed = -1;
                    params.enable_prompt_expansion = false;
                    const sizeMap = {
                        '1k': { '9:16': '576x1024', '16:9': '1024x576', '1:1': '1024x1024', '4:5': '816x1024', '3:4': '768x1024' },
                        '2k': { '9:16': '1080x1920', '16:9': '1920x1080', '1:1': '1440x1440', '4:5': '1296x1620', '3:4': '1260x1680' },
                    };
                    const imageSize = sizeMap[resolution]?.[size];
                    if (imageSize) {
                        params.image_size = imageSize;
                        params.size = imageSize;
                        const [w, h] = imageSize.split('x').map(Number);
                        params.width = w;
                        params.height = h;
                        // Resize reference images to target dimensions so output matches
                        if (params.images && params.images.length > 0) {
                            params.images = await Promise.all(
                                params.images.map(url => API.resizeImageToTarget(url, w, h))
                            );
                        }
                    }
                    delete params.resolution;
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
        if (!confirm('Cancelling stops waiting for results, but WaveSpeed still charges credits for requests already submitted. Continue?')) return;
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

        // Detect real image dimensions
        try {
            const dims = await this.getImageDimensions(url);
            item.width = dims.width;
            item.height = dims.height;
        } catch (e) { /* ignore */ }

        // Upload to Firebase Storage for permanent URL
        const firebaseUrl = await FirebaseSync.uploadImageFromUrl(url, `${item.id}.png`);
        if (firebaseUrl !== url) item.url = firebaseUrl;

        this.generatedImages.unshift(item);
        Storage.addImageToHistory(item);
        FirebaseSync.saveImageRecord(item);
    },

    getImageDimensions(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
            img.onerror = reject;
            img.crossOrigin = 'anonymous';
            img.src = url;
        });
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
            const dimsLabel = img.width && img.height ? `${img.width}×${img.height}` : '';
            const isFav = img.starred ? 'starred' : '';
            const cleanBtn = img.metaCleaned
                ? `<button class="btn-card cleaned" title="Metadata Cleaned" data-action="clean-meta" data-idx="${idx}" disabled>✅</button>`
                : `<button class="btn-card" title="Clean Metadata" data-action="clean-meta" data-idx="${idx}">🧹</button>`;
            card.innerHTML = `
                <img src="${img.url}" alt="Generated" loading="lazy">
                ${costLabel ? `<span class="card-cost">${costLabel}</span>` : ''}
                ${dimsLabel ? `<span class="card-dims">${dimsLabel}</span>` : ''}
                <div class="card-actions-right">
                    <button class="btn-card ${isFav}" title="Favorite" data-action="star" data-idx="${idx}">☆</button>
                    ${cleanBtn}
                    <button class="btn-card" title="Download" data-action="download" data-idx="${idx}">⬇</button>
                    <button class="btn-card" title="Delete" data-action="delete" data-idx="${idx}">🗑</button>
                </div>
                <div class="card-actions-left">
                    <button class="btn-card" title="Add to Collection" data-action="add-to-col" data-idx="${idx}">📁</button>
                    <button class="btn-card" title="Use as Reference" data-action="add-ref" data-idx="${idx}">＋</button>
                    <button class="btn-card" title="Send to Video" data-action="to-video" data-idx="${idx}">▶</button>
                    <button class="btn-card" title="Edit / Remix" data-action="remix" data-idx="${idx}">🎬</button>
                </div>
            `;
            // Lazy-detect dimensions for old images without them
            if (!img.width || !img.height) {
                const cardImg = card.querySelector('img');
                cardImg.addEventListener('load', () => {
                    if (cardImg.naturalWidth && cardImg.naturalHeight) {
                        img.width = cardImg.naturalWidth;
                        img.height = cardImg.naturalHeight;
                        const dimsEl = card.querySelector('.card-dims');
                        if (!dimsEl) {
                            const span = document.createElement('span');
                            span.className = 'card-dims';
                            span.textContent = `${img.width}×${img.height}`;
                            card.appendChild(span);
                        }
                    }
                });
            }
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
                    else if (action === 'add-to-col') Collections.showAddToCollectionModal(this.generatedImages[idx].id);
                    else if (action === 'clean-meta') this.cleanMetadata(idx, actionBtn);
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

    async cleanMetadata(idx, btnElement) {
        const img = this.generatedImages[idx];
        if (!img) return;
        if (img.metaCleaned) return;
        if (btnElement) { btnElement.textContent = '⏳'; btnElement.disabled = true; }
        try {
            let dataUrl;
            if (img.url.startsWith('data:')) {
                dataUrl = img.url;
            } else {
                // Fetch image as blob to avoid CORS tainted canvas
                const resp = await fetch(img.url);
                const blob = await resp.blob();
                dataUrl = await new Promise((res) => {
                    const reader = new FileReader();
                    reader.onloadend = () => res(reader.result);
                    reader.readAsDataURL(blob);
                });
            }
            const cleanedUrl = await MetadataCleaner.stripMetadata(dataUrl);
            img.url = cleanedUrl;
            img.metaCleaned = true;
            Storage.set('image_history', this.generatedImages);
            this.renderGrid();
        } catch (err) {
            alert('Error cleaning metadata: ' + err.message);
            if (btnElement) { btnElement.textContent = '🧹'; btnElement.disabled = false; }
        }
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
