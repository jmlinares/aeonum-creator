/* ========== VIDEO GENERATOR - ALL VIA WAVESPEED ========== */

const VideoGenerator = {
    currentMode: 'text-to-video',
    sourceImageData: null, // base64 dataUrl for image-to-video
    refImages: [], // for reference-to-video (up to 3)
    generatedVideos: [],

    async init() {
        const firebaseVideos = await FirebaseSync.loadVideoHistory();
        if (firebaseVideos.length > 0) {
            this.generatedVideos = firebaseVideos;
            Storage.set('video_history', firebaseVideos);
        } else {
            this.generatedVideos = Storage.getVideoHistory();
        }
        this.renderGrid();
        this.loadModelState();
        this.bindEvents();
    },

    loadModelState() {
        const modelId = Storage.getSelectedVideoModel();
        this.updateModelDisplay(modelId);
        this.updateUIForModel(modelId);
    },

    updateModelDisplay(modelId) {
        const badge = document.getElementById('vidModelBadge');
        const name = document.getElementById('vidModelName');

        const models = {
            'veo-3.1-text-to-video':       { badge: 'V3.1', name: 'Veo 3.1 - Text to Video' },
            'veo-3.1-fast-text-to-video':   { badge: 'FAST', name: 'Veo 3.1 Fast - Text to Video' },
            'veo-3.1-fast-image-to-video':  { badge: 'I2V',  name: 'Veo 3.1 Fast - Image to Video' },
            'veo-3.1-reference-to-video':   { badge: 'REF',  name: 'Veo 3.1 - Reference to Video' },
            'sora-2-image-to-video':        { badge: 'SORA', name: 'Sora 2 - Image to Video' },
            'kling-3.0-pro-image-to-video': { badge: 'K3P',  name: 'Kling 3.0 Pro - Image to Video' },
            'kling-2.6-pro-image-to-video': { badge: 'K26',  name: 'Kling 2.6 Pro - Image to Video' },
        };

        const m = models[modelId] || models['veo-3.1-text-to-video'];
        badge.textContent = m.badge;
        name.textContent = m.name;
    },

    bindEvents() {
        // Model change
        document.getElementById('btnVidModelChange').addEventListener('click', () => {
            const modal = document.getElementById('modalVidModel');
            modal.classList.remove('hidden');
            const currentModel = Storage.getSelectedVideoModel();
            document.querySelectorAll('.model-option').forEach(opt => {
                opt.classList.toggle('active', opt.dataset.model === currentModel);
            });
        });

        document.getElementById('btnVidModelCancel').addEventListener('click', () => {
            document.getElementById('modalVidModel').classList.add('hidden');
        });

        document.getElementById('btnVidModelSave').addEventListener('click', () => {
            const active = document.querySelector('.model-option.active');
            if (active) {
                const modelId = active.dataset.model;
                Storage.setSelectedVideoModel(modelId);
                this.updateModelDisplay(modelId);
                this.updateUIForModel(modelId);
            }
            document.getElementById('modalVidModel').classList.add('hidden');
        });

        // Model option clicks
        document.querySelectorAll('.model-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('.model-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
            });
        });

        // Mode tabs
        document.querySelectorAll('.mode-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentMode = tab.dataset.mode;

                const sourceSection = document.getElementById('vidSourceImageSection');
                if (this.currentMode === 'image-to-video' || this.currentMode === 'extend') {
                    sourceSection.classList.remove('hidden');
                } else {
                    sourceSection.classList.add('hidden');
                }
            });
        });

        // Source image upload
        const sourceDrop = document.getElementById('vidSourceDrop');
        const sourceFile = document.getElementById('vidSourceFile');

        sourceDrop.addEventListener('click', () => sourceFile.click());
        sourceDrop.addEventListener('dragover', (e) => { e.preventDefault(); });
        sourceDrop.addEventListener('drop', (e) => {
            e.preventDefault();
            if (e.dataTransfer.files[0]) this.setSourceImage(e.dataTransfer.files[0]);
        });
        sourceFile.addEventListener('change', (e) => {
            if (e.target.files[0]) this.setSourceImage(e.target.files[0]);
        });

        document.getElementById('btnRemoveVidSource').addEventListener('click', () => {
            this.sourceImageData = null;
            document.getElementById('vidSourcePreview').style.display = 'none';
            document.getElementById('vidSourceDrop').style.display = 'block';
        });

        // Prompt actions
        document.getElementById('btnVidClear').addEventListener('click', () => {
            document.getElementById('vidPrompt').value = '';
        });
        document.getElementById('btnVidEnhance').addEventListener('click', () => {
            const ta = document.getElementById('vidPrompt');
            if (ta.value.trim()) {
                ta.value += '. Ultra-realistic handheld smartphone video. Vertical 9:16.';
            }
        });

        // Negative prompt toggle
        document.getElementById('vidNegPromptToggle').addEventListener('click', () => {
            const ta = document.getElementById('vidNegPrompt');
            ta.classList.toggle('hidden');
            const label = document.getElementById('vidNegPromptToggle');
            label.textContent = ta.classList.contains('hidden') ? 'Negative Prompt ▸' : 'Negative Prompt ▾';
        });

        // Generate
        document.getElementById('btnVidGenerate').addEventListener('click', () => this.generate());

        // Video info modal
        document.getElementById('btnCloseVideoInfo').addEventListener('click', () => {
            document.getElementById('modalVideoInfo').classList.add('hidden');
        });
        document.getElementById('btnVideoInfoClose').addEventListener('click', () => {
            document.getElementById('modalVideoInfo').classList.add('hidden');
        });
        document.getElementById('btnVideoInfoCopyPrompt').addEventListener('click', () => {
            if (this._infoPrompt) {
                navigator.clipboard.writeText(this._infoPrompt);
                const btn = document.getElementById('btnVideoInfoCopyPrompt');
                btn.textContent = 'Copied!';
                setTimeout(() => btn.textContent = 'Copy Prompt', 1500);
            }
        });
    },

    updateUIForModel(modelId) {
        const sourceSection = document.getElementById('vidSourceImageSection');
        const audioSection = document.getElementById('vidAudioSection');
        const durationSelect = document.getElementById('vidDuration');
        const isSora = modelId.startsWith('sora-2');

        // Hide "Extender" tab — no current model supports it
        const extendTab = document.querySelector('.mode-tab[data-mode="extend"]');
        if (extendTab) extendTab.style.display = 'none';

        // If currently on extend mode, switch back to default
        if (this.currentMode === 'extend') {
            this.currentMode = modelId.includes('image-to-video') || modelId.includes('reference-to-video')
                ? 'image-to-video' : 'text-to-video';
            document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
            const defaultTab = document.querySelector(`.mode-tab[data-mode="${this.currentMode}"]`);
            if (defaultTab) defaultTab.classList.add('active');
        }

        // Image-to-video and reference models need source image section
        if (modelId.includes('image-to-video') || modelId.includes('reference-to-video')) {
            sourceSection.classList.remove('hidden');
        } else {
            sourceSection.classList.add('hidden');
        }

        // Sora 2 and Kling 2.6 don't support separate audio/dialogue
        const isKling26 = modelId === 'kling-2.6-pro-image-to-video';
        if (isSora || isKling26) {
            audioSection.classList.add('hidden');
        } else {
            audioSection.classList.remove('hidden');
        }

        // Update duration options based on model
        if (modelId === 'kling-2.6-pro-image-to-video') {
            durationSelect.innerHTML = `
                <option value="5" selected>5 segundos</option>
                <option value="10">10 segundos</option>
            `;
        } else if (modelId === 'kling-3.0-pro-image-to-video') {
            durationSelect.innerHTML = `
                <option value="3">3 segundos</option>
                <option value="5" selected>5 segundos</option>
                <option value="8">8 segundos</option>
                <option value="10">10 segundos</option>
                <option value="15">15 segundos</option>
            `;
        } else if (isSora) {
            durationSelect.innerHTML = `
                <option value="4">4 segundos</option>
                <option value="8" selected>8 segundos</option>
                <option value="12">12 segundos</option>
            `;
        } else {
            durationSelect.innerHTML = `
                <option value="4">4 segundos</option>
                <option value="6">6 segundos</option>
                <option value="8" selected>8 segundos</option>
            `;
        }
    },

    async setSourceImage(file) {
        const dataUrl = await API.fileToBase64(file);
        this.sourceImageData = dataUrl;
        document.getElementById('vidSourceImg').src = dataUrl;
        document.getElementById('vidSourcePreview').style.display = 'block';
        document.getElementById('vidSourceDrop').style.display = 'none';
    },

    async generate() {
        const prompt = document.getElementById('vidPrompt').value.trim();
        if (!prompt) return alert('Enter a video prompt');

        const modelId = Storage.getSelectedVideoModel();
        const aspect = document.getElementById('vidAspect').value;
        const resolution = document.getElementById('vidResolution').value;
        const duration = parseInt(document.getElementById('vidDuration').value);
        const audio = document.getElementById('vidAudio')?.value?.trim() || '';
        const negPrompt = document.getElementById('vidNegPrompt')?.value?.trim() || '';

        const btn = document.getElementById('btnVidGenerate');
        btn.disabled = true;
        btn.textContent = 'Generating...';

        const placeholderId = 'vidgen-' + Date.now();
        this.addGeneratingCard(placeholderId);

        try {
            let params;

            if (modelId === 'sora-2-image-to-video') {
                // Sora 2: image, prompt, duration (4/8/12)
                params = {
                    prompt: audio ? prompt + `\nSample Dialogue:\n${audio}` : prompt,
                    duration: duration,
                };
                if (this.sourceImageData) {
                    // Upload base64 to CDN for better compatibility
                    if (this.sourceImageData.startsWith('data:')) {
                        const blob = await (await fetch(this.sourceImageData)).blob();
                        const file = new File([blob], 'source.png', { type: blob.type });
                        params.image = await API.uploadFile(file);
                    } else {
                        params.image = this.sourceImageData;
                    }
                }
            } else if (modelId === 'kling-2.6-pro-image-to-video') {
                // Kling 2.6 Pro: image, prompt, duration (5/10), cfg_scale, sound, voice_list
                params = {
                    prompt: audio ? prompt + `\nSample Dialogue:\n${audio}` : prompt,
                    duration: duration,
                    cfg_scale: 0.5,
                    sound: true,
                    voice_list: [],
                };
                if (negPrompt) params.negative_prompt = negPrompt;
                if (this.sourceImageData) {
                    if (this.sourceImageData.startsWith('data:')) {
                        const blob = await (await fetch(this.sourceImageData)).blob();
                        const file = new File([blob], 'source.png', { type: blob.type });
                        params.image = await API.uploadFile(file);
                    } else {
                        params.image = this.sourceImageData;
                    }
                }
            } else if (modelId === 'kling-3.0-pro-image-to-video') {
                // Kling 3.0 Pro: image, prompt, duration (3-15), cfg_scale, sound
                params = {
                    prompt: audio ? prompt + `\nSample Dialogue:\n${audio}` : prompt,
                    duration: duration,
                    cfg_scale: 0.5,
                    sound: true,
                };
                if (negPrompt) params.negative_prompt = negPrompt;
                if (this.sourceImageData) {
                    // Upload base64 to CDN for better compatibility
                    if (this.sourceImageData.startsWith('data:')) {
                        const blob = await (await fetch(this.sourceImageData)).blob();
                        const file = new File([blob], 'source.png', { type: blob.type });
                        params.image = await API.uploadFile(file);
                    } else {
                        params.image = this.sourceImageData;
                    }
                }
            } else {
                // Veo models
                params = {
                    prompt: audio ? prompt + `\nSample Dialogue:\n${audio}` : prompt,
                    aspect_ratio: aspect,
                    duration: duration,
                    resolution: resolution,
                    generate_audio: true,
                };

                if (negPrompt) params.negative_prompt = negPrompt;

                // Image-to-video: single image
                if (modelId.includes('image-to-video') && this.sourceImageData) {
                    params.image = this.sourceImageData;
                }

                // Reference-to-video: images array
                if (modelId.includes('reference-to-video') && this.sourceImageData) {
                    params.images = [this.sourceImageData];
                }
            }

            const submitResult = await API.submit(modelId, params);
            const requestId = submitResult.data?.id || submitResult.id;

            if (!requestId) {
                this.removeGeneratingCard(placeholderId);
                throw new Error('No request ID returned');
            }

            const result = await API.poll(requestId, (elapsed) => {
                this.updateGeneratingTime(placeholderId, elapsed);
            });

            const d = result.data || result;
            const rawOutputs = d.outputs || d.output || d.data?.outputs || d.data?.output || [];
            const outputs = Array.isArray(rawOutputs) ? rawOutputs : [rawOutputs];
            for (const url of outputs) {
                const cost = API.getVideoCost(modelId, duration, true);
                const item = {
                    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
                    url,
                    prompt,
                    model: modelId,
                    duration,
                    aspect,
                    cost,
                    timestamp: new Date().toISOString()
                };

                // Upload to Firebase Storage
                const firebaseUrl = await FirebaseSync.uploadVideoFromUrl(url, `${item.id}.mp4`);
                if (firebaseUrl !== url) item.url = firebaseUrl;

                this.generatedVideos.unshift(item);
                Storage.addVideoToHistory(item);
                FirebaseSync.saveVideoRecord(item);
            }

            this.removeGeneratingCard(placeholderId);
            this.renderGrid();
        } catch (err) {
            alert('Error: ' + err.message);
            this.removeGeneratingCard(placeholderId);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Generate Video';
            if (window.refreshBalance) window.refreshBalance();
        }
    },

    addGeneratingCard(id) {
        document.getElementById('vidEmptyState').style.display = 'none';
        const grid = document.getElementById('videoGrid');
        const card = document.createElement('div');
        card.className = 'video-card generating';
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
        const grid = document.getElementById('videoGrid');
        const emptyState = document.getElementById('vidEmptyState');

        const genCards = grid.querySelectorAll('.generating');
        grid.innerHTML = '';
        genCards.forEach(c => grid.appendChild(c));

        if (this.generatedVideos.length === 0 && genCards.length === 0) {
            emptyState.style.display = 'flex';
            return;
        }

        emptyState.style.display = 'none';

        this.generatedVideos.forEach((vid, idx) => {
            const card = document.createElement('div');
            card.className = 'video-card';

            const isVideoUrl = vid.url && (vid.url.endsWith('.mp4') || vid.url.includes('video'));

            const costLabel = vid.cost ? `$${vid.cost.toFixed(2)}` : '';
            card.innerHTML = `
                ${isVideoUrl
                    ? `<video src="${vid.url}" preload="metadata" muted></video>`
                    : `<img src="${vid.url}" alt="Video thumbnail">`
                }
                <span class="vid-duration">${vid.duration || '?'}s</span>
                ${costLabel ? `<span class="card-cost">${costLabel}</span>` : ''}
                <div class="vid-overlay">
                    <button data-action="play" data-idx="${idx}">▶ Play</button>
                    <button data-action="info" data-idx="${idx}">Info</button>
                    <button data-action="download" data-idx="${idx}">⬇</button>
                    <button data-action="delete" data-idx="${idx}">🗑</button>
                </div>
            `;

            card.addEventListener('click', (e) => {
                const actionBtn = e.target.closest('[data-action]');
                if (!actionBtn) return;
                const action = actionBtn.dataset.action;
                const i = parseInt(actionBtn.dataset.idx);

                if (action === 'play') this.playVideo(i);
                else if (action === 'download') this.downloadVideo(i);
                else if (action === 'delete') this.deleteVideo(i);
                else if (action === 'info') this.showVideoInfo(i);
            });

            grid.appendChild(card);
        });
    },

    playVideo(idx) {
        const vid = this.generatedVideos[idx];
        if (!vid) return;
        window.open(vid.url, '_blank');
    },

    downloadVideo(idx) {
        const vid = this.generatedVideos[idx];
        if (!vid) return;
        const a = document.createElement('a');
        a.href = vid.url;
        a.download = `video_${vid.id}.mp4`;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    },

    showVideoInfo(idx) {
        const vid = this.generatedVideos[idx];
        if (!vid) return;

        const container = document.getElementById('videoInfoContent');
        const rows = [
            { label: 'Model', value: vid.model || '—' },
            { label: 'Aspect Ratio', value: vid.aspect || '—' },
            { label: 'Duration', value: vid.duration ? `${vid.duration}s` : '—' },
            { label: 'Cost', value: vid.cost ? `$${vid.cost.toFixed(2)}` : '—' },
            { label: 'Generated', value: vid.timestamp ? new Date(vid.timestamp).toLocaleString() : '—' },
        ];

        container.innerHTML = rows.map(r =>
            `<div class="detail-row"><span>${r.label}:</span><span class="detail-value">${r.value}</span></div>`
        ).join('') +
            `<div class="detail-row" style="flex-direction:column;align-items:flex-start;margin-top:8px;">
                <label style="margin-bottom:4px;">Prompt:</label>
                <p class="detail-prompt" style="white-space:pre-wrap;max-height:300px;overflow-y:auto;">${vid.prompt || '—'}</p>
            </div>`;

        this._infoPrompt = vid.prompt || '';
        document.getElementById('modalVideoInfo').classList.remove('hidden');
    },

    deleteVideo(idx) {
        if (!confirm('Delete this video?')) return;
        const removed = this.generatedVideos.splice(idx, 1)[0];
        Storage.set('video_history', this.generatedVideos);
        if (removed) FirebaseSync.deleteVideoRecord(removed.id);
        this.renderGrid();
    }
};
