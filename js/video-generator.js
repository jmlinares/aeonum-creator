/* ========== VIDEO GENERATOR - ALL VIA WAVESPEED ========== */

const VideoGenerator = {
    currentMode: 'text-to-video',
    sourceImageData: null, // base64 dataUrl for image-to-video
    motionVideoData: null, // base64 dataUrl or CDN URL for motion control
    motionVideoFile: null, // File object for motion control upload
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
            'kling-3.0-pro-text-to-video':  { badge: 'K3T',  name: 'Kling 3.0 Pro - Text to Video' },
            'kling-3.0-pro-image-to-video': { badge: 'K3P',  name: 'Kling 3.0 Pro - Image to Video' },
            'kling-2.6-pro-text-to-video':  { badge: 'K2T',  name: 'Kling 2.6 Pro - Text to Video' },
            'kling-2.6-pro-image-to-video': { badge: 'K26',  name: 'Kling 2.6 Pro - Image to Video' },
            'kling-2.6-pro-motion-control': { badge: 'MOT',  name: 'Kling 2.6 Pro - Motion Control' },
            'kling-3.0-std-motion-control': { badge: 'M30',  name: 'Kling 3.0 Std - Motion Control' },
            'kling-3.0-pro-motion-control': { badge: 'MP3',  name: 'Kling 3.0 Pro - Motion Control' },
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
        sourceDrop.addEventListener('dragover', (e) => {
            e.preventDefault();
            sourceDrop.classList.add('drag-over');
        });
        sourceDrop.addEventListener('dragleave', () => sourceDrop.classList.remove('drag-over'));
        sourceDrop.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            sourceDrop.classList.remove('drag-over');

            // Try files first (local drag from desktop)
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                const isImage = file.type.startsWith('image/') || file.name.match(/\.(png|jpg|jpeg|webp|gif)$/i);
                const isVideo = file.type.startsWith('video/') || file.name.match(/\.(mp4|mov)$/i);
                if (isImage || isVideo) {
                    await this.setSourceImage(file);
                    return;
                }
            }
            // Fallback: check for URL
            const textData = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list') || '';
            if (textData.startsWith('http')) {
                this.setSourceImageFromUrl(textData);
            }
        });
        sourceFile.addEventListener('change', (e) => {
            if (e.target.files[0]) this.setSourceImage(e.target.files[0]);
        });

        document.getElementById('btnRemoveVidSource').addEventListener('click', () => {
            this.sourceImageData = null;
            document.getElementById('vidSourcePreview').style.display = 'none';
            document.getElementById('vidSourceDrop').style.display = 'block';
        });

        // Motion control: video upload
        const motionDrop = document.getElementById('vidMotionDrop');
        const motionFile = document.getElementById('vidMotionFile');

        motionDrop.addEventListener('click', () => motionFile.click());
        motionDrop.addEventListener('dragover', (e) => {
            e.preventDefault();
            motionDrop.classList.add('drag-over');
        });
        motionDrop.addEventListener('dragleave', () => motionDrop.classList.remove('drag-over'));
        motionDrop.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            motionDrop.classList.remove('drag-over');
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                if (file.type.startsWith('video/') || file.name.match(/\.(mp4|mov)$/i)) {
                    await this.setMotionVideo(file);
                    return;
                }
            }
            const textData = e.dataTransfer.getData('text/plain') || '';
            if (textData.startsWith('http')) this.setMotionVideoFromUrl(textData);
        });
        motionFile.addEventListener('change', (e) => {
            if (e.target.files[0]) this.setMotionVideo(e.target.files[0]);
        });

        document.getElementById('btnRemoveVidMotion').addEventListener('click', () => {
            this.motionVideoData = null;
            this.motionVideoFile = null;
            document.getElementById('vidMotionPreview').style.display = 'none';
            document.getElementById('vidMotionDrop').style.display = 'block';
        });

        // Motion control: character orientation toggle
        document.querySelectorAll('#vidCharOrientation .btn-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#vidCharOrientation .btn-toggle').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const orientation = btn.dataset.value;
                const sourceSection = document.getElementById('vidSourceImageSection');
                const sourceFileInput = document.getElementById('vidSourceFile');
                sourceSection.classList.remove('hidden');
                if (orientation === 'image') {
                    sourceSection.querySelector('.section-label').textContent = 'Character Image';
                    sourceFileInput.accept = 'image/*';
                } else {
                    sourceSection.querySelector('.section-label').textContent = 'Character Video';
                    sourceFileInput.accept = 'video/mp4,video/quicktime,video/*';
                }
                // Clear current source when switching orientation
                this.sourceImageData = null;
                document.getElementById('vidSourcePreview').style.display = 'none';
                document.getElementById('vidSourceDrop').style.display = 'block';
            });
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
        const motionOrientationSection = document.getElementById('vidMotionOrientationSection');
        const motionVideoSection = document.getElementById('vidMotionVideoSection');
        const isSora = modelId.startsWith('sora-2');
        const isMotionControl = modelId.includes('motion-control');

        // Hide "Extender" tab — no current model supports it
        const extendTab = document.querySelector('.mode-tab[data-mode="extend"]');
        if (extendTab) extendTab.style.display = 'none';

        // If currently on extend mode, switch back to default
        if (this.currentMode === 'extend') {
            this.currentMode = modelId.includes('image-to-video') || modelId.includes('reference-to-video') || isMotionControl
                ? 'image-to-video' : 'text-to-video';
            document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
            const defaultTab = document.querySelector(`.mode-tab[data-mode="${this.currentMode}"]`);
            if (defaultTab) defaultTab.classList.add('active');
        }

        // Motion control: show special sections, hide mode tabs
        if (isMotionControl) {
            motionOrientationSection.classList.remove('hidden');
            motionVideoSection.classList.remove('hidden');
            sourceSection.classList.remove('hidden');
            sourceSection.querySelector('.section-label').textContent = 'Character Image';
            // Hide mode tabs for motion control
            document.querySelectorAll('.mode-tab').forEach(t => t.style.display = 'none');
            // Hide standard video settings (aspect, resolution, duration)
            document.getElementById('vidAspect').closest('.setting-row').style.display = 'none';
            document.getElementById('vidResolution').closest('.setting-row').style.display = 'none';
            durationSelect.closest('.setting-row').style.display = 'none';
        } else {
            motionOrientationSection.classList.add('hidden');
            motionVideoSection.classList.add('hidden');
            // Restore mode tabs
            document.querySelectorAll('.mode-tab').forEach(t => t.style.display = '');
            // Restore standard video settings
            document.getElementById('vidAspect').closest('.setting-row').style.display = '';
            document.getElementById('vidResolution').closest('.setting-row').style.display = '';
            durationSelect.closest('.setting-row').style.display = '';

            // Image-to-video and reference models need source image section
            if (modelId.includes('image-to-video') || modelId.includes('reference-to-video')) {
                sourceSection.classList.remove('hidden');
                sourceSection.querySelector('.section-label').textContent = 'Source Image';
            } else {
                sourceSection.classList.add('hidden');
            }
        }

        // Sora 2 and Kling 2.6 I2V don't support separate audio/dialogue
        const isKling26 = modelId === 'kling-2.6-pro-image-to-video';
        if (isSora || isKling26 || isMotionControl) {
            audioSection.classList.add('hidden');
        } else {
            audioSection.classList.remove('hidden');
        }

        // Update duration options based on model
        if (modelId === 'kling-2.6-pro-text-to-video' || modelId === 'kling-2.6-pro-image-to-video') {
            durationSelect.innerHTML = `
                <option value="5" selected>5 segundos</option>
                <option value="10">10 segundos</option>
            `;
        } else if (modelId === 'kling-3.0-pro-text-to-video' || modelId === 'kling-3.0-pro-image-to-video') {
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
        } else if (!isMotionControl) {
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
        const imgEl = document.getElementById('vidSourceImg');
        // For video files, swap to a video element display
        if (file.type.startsWith('video/')) {
            imgEl.style.display = 'none';
            let vidEl = document.getElementById('vidSourceVidEl');
            if (!vidEl) {
                vidEl = document.createElement('video');
                vidEl.id = 'vidSourceVidEl';
                vidEl.style.cssText = 'width:100%;max-height:300px;border-radius:var(--radius);';
                vidEl.muted = true;
                vidEl.controls = true;
                imgEl.parentElement.insertBefore(vidEl, imgEl);
            }
            vidEl.src = dataUrl;
            vidEl.style.display = 'block';
        } else {
            imgEl.src = dataUrl;
            imgEl.style.display = '';
            const vidEl = document.getElementById('vidSourceVidEl');
            if (vidEl) vidEl.style.display = 'none';
        }
        document.getElementById('vidSourcePreview').style.display = 'block';
        document.getElementById('vidSourceDrop').style.display = 'none';
    },

    setSourceImageFromUrl(url) {
        this.sourceImageData = url;
        document.getElementById('vidSourceImg').src = url;
        document.getElementById('vidSourcePreview').style.display = 'block';
        document.getElementById('vidSourceDrop').style.display = 'none';
    },

    async setMotionVideo(file) {
        this.motionVideoFile = file;
        const dataUrl = await API.fileToBase64(file);
        this.motionVideoData = dataUrl;
        document.getElementById('vidMotionVideo').src = dataUrl;
        document.getElementById('vidMotionPreview').style.display = 'block';
        document.getElementById('vidMotionDrop').style.display = 'none';
    },

    setMotionVideoFromUrl(url) {
        this.motionVideoData = url;
        this.motionVideoFile = null;
        document.getElementById('vidMotionVideo').src = url;
        document.getElementById('vidMotionPreview').style.display = 'block';
        document.getElementById('vidMotionDrop').style.display = 'none';
    },

    async generate() {
        const prompt = document.getElementById('vidPrompt').value.trim();
        const modelId = Storage.getSelectedVideoModel();
        const isMotionControl = modelId.includes('motion-control');
        if (!prompt && !isMotionControl) return alert('Enter a video prompt');
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
            } else if (modelId === 'kling-2.6-pro-text-to-video') {
                // Kling 2.6 Pro T2V: prompt, duration (5/10), cfg_scale, sound, aspect_ratio
                params = {
                    prompt: audio ? prompt + `\nSample Dialogue:\n${audio}` : prompt,
                    duration: duration,
                    cfg_scale: 0.5,
                    sound: true,
                    aspect_ratio: aspect,
                };
                if (negPrompt) params.negative_prompt = negPrompt;

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
            } else if (modelId === 'kling-2.6-pro-motion-control') {
                // Motion Control: image (or video as character), video (motion reference)
                const orientationBtn = document.querySelector('#vidCharOrientation .btn-toggle.active');
                const charOrientation = orientationBtn ? orientationBtn.dataset.value : 'image';
                const keepSound = document.getElementById('vidKeepOriginalSound').checked;

                params = {
                    character_orientation: charOrientation,
                    keep_original_sound: keepSound,
                };
                if (prompt) params.prompt = prompt;
                if (negPrompt) params.negative_prompt = negPrompt;

                // Upload character image/video to CDN
                if (this.sourceImageData) {
                    if (this.sourceImageData.startsWith('data:')) {
                        const blob = await (await fetch(this.sourceImageData)).blob();
                        const ext = charOrientation === 'video' ? 'mp4' : 'png';
                        const file = new File([blob], `source.${ext}`, { type: blob.type });
                        params.image = await API.uploadFile(file);
                    } else {
                        params.image = this.sourceImageData;
                    }
                } else {
                    throw new Error('Upload a character image (or video) first.');
                }

                // Upload motion reference video to CDN
                if (this.motionVideoFile) {
                    params.video = await API.uploadFile(this.motionVideoFile);
                } else if (this.motionVideoData) {
                    if (this.motionVideoData.startsWith('data:')) {
                        const blob = await (await fetch(this.motionVideoData)).blob();
                        const file = new File([blob], 'motion.mp4', { type: blob.type || 'video/mp4' });
                        params.video = await API.uploadFile(file);
                    } else {
                        params.video = this.motionVideoData;
                    }
                } else {
                    throw new Error('Upload a motion reference video first.');
                }

            } else if (modelId === 'kling-3.0-std-motion-control' || modelId === 'kling-3.0-pro-motion-control') {
                // Kling 3.0 Std/Pro Motion Control: same as 2.6 + element_list
                const orientationBtn = document.querySelector('#vidCharOrientation .btn-toggle.active');
                const charOrientation = orientationBtn ? orientationBtn.dataset.value : 'image';
                const keepSound = document.getElementById('vidKeepOriginalSound').checked;

                params = {
                    character_orientation: charOrientation,
                    keep_original_sound: keepSound,
                    element_list: [],
                };
                if (prompt) params.prompt = prompt;
                if (negPrompt) params.negative_prompt = negPrompt;

                // Upload character image/video to CDN
                if (this.sourceImageData) {
                    if (this.sourceImageData.startsWith('data:')) {
                        const blob = await (await fetch(this.sourceImageData)).blob();
                        const ext = charOrientation === 'video' ? 'mp4' : 'png';
                        const file = new File([blob], `source.${ext}`, { type: blob.type });
                        params.image = await API.uploadFile(file);
                    } else {
                        params.image = this.sourceImageData;
                    }
                } else {
                    throw new Error('Upload a character image (or video) first.');
                }

                // Upload motion reference video to CDN
                if (this.motionVideoFile) {
                    params.video = await API.uploadFile(this.motionVideoFile);
                } else if (this.motionVideoData) {
                    if (this.motionVideoData.startsWith('data:')) {
                        const blob = await (await fetch(this.motionVideoData)).blob();
                        const file = new File([blob], 'motion.mp4', { type: blob.type || 'video/mp4' });
                        params.video = await API.uploadFile(file);
                    } else {
                        params.video = this.motionVideoData;
                    }
                } else {
                    throw new Error('Upload a motion reference video first.');
                }

            } else if (modelId === 'kling-3.0-pro-text-to-video') {
                // Kling 3.0 Pro T2V: prompt, duration (3-15), cfg_scale, sound, aspect_ratio, shot_type, element_list
                params = {
                    prompt: audio ? prompt + `\nSample Dialogue:\n${audio}` : prompt,
                    duration: duration,
                    cfg_scale: 0.5,
                    sound: true,
                    aspect_ratio: aspect,
                    shot_type: 'customize',
                    element_list: [],
                    multi_prompt: [],
                };
                if (negPrompt) params.negative_prompt = negPrompt;

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
