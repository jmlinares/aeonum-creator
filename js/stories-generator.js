/* ========== STORIES GENERATOR ========== */

const StoriesGenerator = {
    stories: [],
    // Each story: { id, characterId, prompt, aspectRatio, resolution, count,
    //               images: [{ url, width, height }], currentImageIdx, approved, instagramDesc,
    //               isGenerating, generatingTime, createdAt }

    async init() {
        // Load from Firebase first, fallback to localStorage
        const fbStories = await FirebaseSync.loadStories();
        if (fbStories.length > 0) {
            this.stories = fbStories;
            Storage.set('stories', fbStories);
        } else {
            this.stories = Storage.get('stories', []);
        }
        this.bindEvents();
        this.render();
    },

    bindEvents() {
        document.getElementById('btnAddStory').addEventListener('click', () => this.addStory());

        document.getElementById('btnGenerateAll').addEventListener('click', () => this.generateAll());

        document.getElementById('btnClearApproved').addEventListener('click', () => this.clearApproved());

        // Global model selector — persist selection
        const modelSelect = document.getElementById('storiesModelSelect');
        const savedModel = Storage.get('stories_model', 'nano-banana-2-edit');
        if (modelSelect) {
            modelSelect.value = savedModel;
            modelSelect.addEventListener('change', () => {
                Storage.set('stories_model', modelSelect.value);
            });
        }

        // Scroll arrows
        document.getElementById('btnStoriesScrollLeft').addEventListener('click', () => {
            document.getElementById('storiesScroll').scrollBy({ left: -370, behavior: 'smooth' });
        });
        document.getElementById('btnStoriesScrollRight').addEventListener('click', () => {
            document.getElementById('storiesScroll').scrollBy({ left: 370, behavior: 'smooth' });
        });
    },

    addStory(template) {
        const story = {
            id: 'story-' + Date.now() + Math.random().toString(36).slice(2, 5),
            characterId: template?.characterId || '',
            prompt: template?.prompt || '',
            aspectRatio: template?.aspectRatio || '9:16',
            resolution: template?.resolution || '2k',
            count: 1,
            images: template?.images ? [...template.images] : [],
            currentImageIdx: 0,
            approved: false,
            instagramDesc: template?.instagramDesc || '',
            isGenerating: false,
            generatingTime: '0.0',
            createdAt: new Date().toISOString()
        };
        this.stories.push(story);
        this.persist();
        this.render();

        // Scroll to the new card
        setTimeout(() => {
            const scroll = document.getElementById('storiesScroll');
            scroll.scrollLeft = scroll.scrollWidth;
        }, 50);
    },

    removeStory(id) {
        this.stories = this.stories.filter(s => s.id !== id);
        this.persist();
        FirebaseSync.deleteStory(id);
        this.render();
    },

    duplicateStory(id) {
        const orig = this.stories.find(s => s.id === id);
        if (!orig) return;
        this.addStory({
            characterId: orig.characterId,
            prompt: orig.prompt,
            aspectRatio: orig.aspectRatio,
            resolution: orig.resolution,
            instagramDesc: ''
        });
    },

    clearApproved() {
        const approved = this.stories.filter(s => s.approved);
        if (approved.length === 0) return;
        if (!confirm(`Remove ${approved.length} approved stories?`)) return;
        approved.forEach(s => FirebaseSync.deleteStory(s.id));
        this.stories = this.stories.filter(s => !s.approved);
        this.persist();
        this.render();
    },

    toggleApprove(id) {
        const story = this.stories.find(s => s.id === id);
        if (!story) return;
        story.approved = !story.approved;
        this.persist();
        this.render();
    },

    clearImage(id) {
        const story = this.stories.find(s => s.id === id);
        if (!story) return;
        story.images = [];
        story.currentImageIdx = 0;
        story.approved = false;
        this.persist();
        this.render();
    },

    prevImage(id) {
        const story = this.stories.find(s => s.id === id);
        if (!story || story.images.length <= 1) return;
        story.currentImageIdx = Math.max(0, story.currentImageIdx - 1);
        this.renderCard(id);
    },

    nextImage(id) {
        const story = this.stories.find(s => s.id === id);
        if (!story || story.images.length <= 1) return;
        story.currentImageIdx = Math.min(story.images.length - 1, story.currentImageIdx + 1);
        this.renderCard(id);
    },

    // ===== GENERATION =====

    async generateSingle(id) {
        const story = this.stories.find(s => s.id === id);
        if (!story || story.isGenerating) return;

        if (!story.prompt.trim()) return alert('Write a prompt for this story');

        const modelId = document.getElementById('storiesModelSelect').value;
        story.isGenerating = true;
        this.renderCard(id);

        try {
            // Build prompt with identity lock
            let fullPrompt = story.prompt;
            if (story.characterId) {
                fullPrompt = Characters.buildIdentityPrompt(story.characterId) + ' ' + story.prompt;
            }

            const params = {
                prompt: fullPrompt,
                output_format: 'png',
                aspect_ratio: story.aspectRatio,
                resolution: story.resolution
            };

            // Add character images for edit models — upload to CDN
            if (!API.isTextToImage(modelId) && story.characterId) {
                const char = Characters.getById(story.characterId);
                if (char) {
                    const charImages = char.images && char.images.length > 0
                        ? char.images
                        : [char.faceImage, char.bodyImage].filter(Boolean);
                    if (charImages.length > 0) {
                        params.images = await Promise.all(
                            charImages.map(url => API.uploadImageToCDN(url))
                        );
                    }
                }
            }

            // ===== MODEL-SPECIFIC PARAMS (per official WaveSpeed API docs) =====

            // NB Edit/T2I: NO resolution param
            if (modelId === 'nano-banana-edit' || modelId === 'nano-banana-text-to-image') {
                delete params.resolution;
            }

            // NB2 Edit: add enable_web_search
            if (modelId === 'nano-banana-2-edit') {
                params.enable_web_search = false;
            }

            // NBP, NBP Ultra, NB2 T2I: all default params are correct

            // WAN 2.6: ONLY images, prompt, seed, enable_prompt_expansion
            if (modelId === 'wan-2.6-image-edit') {
                delete params.output_format;
                delete params.aspect_ratio;
                delete params.resolution;
                params.seed = -1;
                params.enable_prompt_expansion = false;
                const wanSizeMap = {
                    '1k': { '9:16': [576, 1024], '16:9': [1024, 576], '1:1': [1024, 1024], '4:5': [816, 1024], '3:4': [768, 1024] },
                    '2k': { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1440, 1440], '4:5': [1296, 1620], '3:4': [1260, 1680] },
                };
                const wanDims = wanSizeMap[story.resolution]?.[story.aspectRatio];
                if (wanDims && params.images && params.images.length > 0) {
                    params.images = await Promise.all(
                        params.images.map(url => API.resizeImageToTarget(url, wanDims[0], wanDims[1]))
                    );
                }
            }

            // Seedream 4.5: ONLY images, prompt, size(WxH)
            if (modelId === 'seedream-4.5-edit') {
                delete params.output_format;
                delete params.aspect_ratio;
                delete params.resolution;
                const sdSizeMap = {
                    '1k': { '9:16': '768x1376', '16:9': '1376x768', '1:1': '1024x1024', '4:5': '880x1104', '3:4': '896x1152' },
                    '2k': { '9:16': '1536x2752', '16:9': '2752x1536', '1:1': '2048x2048', '4:5': '1760x2208', '3:4': '1792x2304' },
                    '4k': { '9:16': '2736x4864', '16:9': '4864x2736', '1:1': '4096x4096', '4:5': '3648x4560', '3:4': '3536x4720' },
                };
                const sdSize = sdSizeMap[story.resolution]?.[story.aspectRatio];
                if (sdSize) params.size = sdSize;
            }

            // Qwen Image Edit 2511: images(max 3), prompt, size(WxH), seed, output_format
            if (modelId === 'qwen-image-edit-2511') {
                delete params.aspect_ratio;
                delete params.resolution;
                params.seed = -1;
                const qwSizeMap = {
                    '9:16': '768x1376', '16:9': '1376x768', '1:1': '1024x1024',
                    '4:5': '880x1104', '3:4': '896x1152'
                };
                const qwSize = qwSizeMap[story.aspectRatio];
                if (qwSize) params.size = qwSize;
            }

            const genCount = story.count || 1;
            for (let gi = 0; gi < genCount; gi++) {
                if (!story.isGenerating) break; // cancelled

                const submitResult = await API.submit(modelId, params);
                const requestId = submitResult.data?.id || submitResult.id;

                if (!requestId) {
                    // Sync mode
                    const outputs = this._extractOutputs(submitResult);
                    for (const url of outputs) {
                        const storyFileName = `story_${story.id}_${Date.now()}.png`;
                        const firebaseUrl = await FirebaseSync.uploadImageFromUrl(url, storyFileName);
                        const finalUrl = firebaseUrl !== url ? firebaseUrl : url;
                        const thumbUrl = await FirebaseSync.uploadThumbnail(finalUrl, storyFileName);
                        story.images.push({ url: finalUrl, thumbnailUrl: thumbUrl || finalUrl });
                    }
                } else {
                    // Poll
                    const result = await API.poll(requestId, (elapsed) => {
                        story.generatingTime = `${elapsed} (${gi + 1}/${genCount})`;
                        this.updateGeneratingTime(id, `${elapsed} (${gi + 1}/${genCount})`);
                    });
                    const outputs = this._extractOutputs(result);
                    for (const url of outputs) {
                        const storyFileName = `story_${story.id}_${Date.now()}.png`;
                        const firebaseUrl = await FirebaseSync.uploadImageFromUrl(url, storyFileName);
                        const finalUrl = firebaseUrl !== url ? firebaseUrl : url;
                        const thumbUrl = await FirebaseSync.uploadThumbnail(finalUrl, storyFileName);
                        story.images.push({ url: finalUrl, thumbnailUrl: thumbUrl || finalUrl });
                    }
                }

                // Update card after each image
                story.currentImageIdx = story.images.length - 1;
                this.renderCard(id);
            }
        } catch (err) {
            if (err.message !== 'CANCELLED') {
                console.error('[Stories] Generate error:', err);
                alert('Story generation error: ' + err.message);
            }
        } finally {
            story.isGenerating = false;
            this.persist();
            this.render();
            if (window.refreshBalance) window.refreshBalance();
        }
    },

    async generateAll() {
        const pending = this.stories.filter(s => !s.approved && !s.isGenerating && s.prompt.trim());
        if (pending.length === 0) return alert('No pending stories to generate');
        if (!confirm(`Generate ${pending.length} stories?`)) return;

        // Generate sequentially to avoid API rate limits
        for (const story of pending) {
            if (!story.prompt.trim()) continue;
            await this.generateSingle(story.id);
        }
    },

    _extractOutputs(result) {
        const d = result.data || result;
        const outputs = d.outputs || d.output || d.data?.outputs || d.data?.output || [];
        return Array.isArray(outputs) ? outputs : [outputs];
    },

    // ===== PERSISTENCE =====

    persist() {
        // Save without transient state
        const toSave = this.stories.map(s => ({
            ...s,
            isGenerating: false,
            generatingTime: '0.0'
        }));
        Storage.set('stories', toSave);
        toSave.forEach(s => FirebaseSync.saveStory(s));
    },

    updateField(id, field, value) {
        const story = this.stories.find(s => s.id === id);
        if (!story) return;
        story[field] = value;
        // Debounce persist
        clearTimeout(this._persistTimer);
        this._persistTimer = setTimeout(() => this.persist(), 800);
    },

    // ===== RENDERING =====

    render() {
        const scroll = document.getElementById('storiesScroll');
        if (!scroll) return;
        scroll.innerHTML = '';

        // Update counter
        const counter = document.getElementById('storiesCounter');
        const approvedCount = this.stories.filter(s => s.approved).length;
        counter.textContent = `${this.stories.length} stories · ${approvedCount} approved`;

        this.stories.forEach(story => {
            scroll.appendChild(this.createCardElement(story));
        });

        // Add empty state if no stories
        if (this.stories.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'story-image-empty';
            empty.style.padding = '60px';
            empty.innerHTML = `
                <span class="empty-icon">📸</span>
                <p>No stories yet. Click <strong>+ Add Story</strong> to start.</p>
            `;
            scroll.appendChild(empty);
        }
    },

    createCardElement(story) {
        const card = document.createElement('div');
        card.className = 'story-card' + (story.isGenerating ? ' generating' : '') + (story.approved ? ' approved' : '');
        card.id = 'card-' + story.id;

        // Character info
        const chars = Characters.getAll();
        const selectedChar = story.characterId ? Characters.getById(story.characterId) : null;
        const avatarUrl = selectedChar?.images?.[0] || selectedChar?.faceImage || '';

        // Character options
        let charOptions = '<option value="">— No character —</option>';
        chars.forEach(c => {
            charOptions += `<option value="${c.id}" ${c.id === story.characterId ? 'selected' : ''}>${c.name}</option>`;
        });

        // Image area
        let imageHTML = '';
        if (story.isGenerating) {
            imageHTML = `
                <div class="story-generating">
                    <div class="gen-ring"></div>
                    <span class="gen-time" id="gen-time-${story.id}">${story.generatingTime}s</span>
                </div>
            `;
        } else if (story.images.length > 0) {
            const currentImg = story.images[story.currentImageIdx] || story.images[0];
            imageHTML = `
                <img src="${currentImg.thumbnailUrl || currentImg.url}" alt="Story" loading="lazy">
                ${story.images.length > 1 ? `<button class="story-img-nav left" data-action="prev-img">❮</button>` : ''}
                ${story.images.length > 1 ? `<button class="story-img-nav right" data-action="next-img">❯</button>` : ''}
                <div class="story-image-actions">
                    <button class="story-btn-approve ${story.approved ? 'approved' : ''}" data-action="approve" title="Approve">✓</button>
                    <button class="story-btn-delete-img" data-action="clear-img" title="Delete image">🗑</button>
                </div>
            `;
        } else {
            imageHTML = `
                <div class="story-image-empty">
                    <span class="empty-icon">🖼</span>
                    <span>No image yet</span>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="story-header">
                <div class="story-char-row">
                    ${avatarUrl ? `<img class="story-char-avatar" src="${avatarUrl}" alt="">` : `<div class="story-char-avatar"></div>`}
                    <select class="story-char-select" data-field="characterId">${charOptions}</select>
                </div>
                <textarea class="story-prompt" data-field="prompt" placeholder="Describe the Instagram story...">${story.prompt}</textarea>
            </div>
            <div class="story-settings">
                <select class="story-setting-select" data-field="count">
                    <option value="1" ${story.count === 1 ? 'selected' : ''}>1</option>
                    <option value="2" ${story.count === 2 ? 'selected' : ''}>2</option>
                    <option value="3" ${story.count === 3 ? 'selected' : ''}>3</option>
                    <option value="4" ${story.count === 4 ? 'selected' : ''}>4</option>
                </select>
                <select class="story-setting-select" data-field="aspectRatio">
                    <option value="9:16" ${story.aspectRatio === '9:16' ? 'selected' : ''}>Story 9:16</option>
                    <option value="16:9" ${story.aspectRatio === '16:9' ? 'selected' : ''}>Landscape 16:9</option>
                    <option value="1:1" ${story.aspectRatio === '1:1' ? 'selected' : ''}>Square 1:1</option>
                    <option value="4:5" ${story.aspectRatio === '4:5' ? 'selected' : ''}>Portrait 4:5</option>
                    <option value="3:4" ${story.aspectRatio === '3:4' ? 'selected' : ''}>Photo 3:4</option>
                </select>
                <select class="story-setting-select" data-field="resolution">
                    <option value="1k" ${story.resolution === '1k' ? 'selected' : ''}>1K</option>
                    <option value="2k" ${story.resolution === '2k' ? 'selected' : ''}>2K</option>
                    <option value="4k" ${story.resolution === '4k' ? 'selected' : ''}>4K</option>
                </select>
                <button class="story-btn-generate ${story.isGenerating ? 'generating-state' : ''}" data-action="generate" ${story.isGenerating ? 'disabled' : ''}>
                    ${story.isGenerating ? 'Generating...' : 'Generate'}
                </button>
            </div>
            <div class="story-image-area">${imageHTML}</div>
            <div class="story-footer">
                <textarea class="story-ig-desc" data-field="instagramDesc" placeholder="Instagram description...">${story.instagramDesc}</textarea>
            </div>
            <div class="story-card-actions">
                <button class="story-btn-duplicate" data-action="duplicate" title="Duplicate">⎘ Duplicate</button>
                <button class="story-btn-remove" data-action="remove" title="Remove story">✕ Remove</button>
            </div>
        `;

        // Bind events
        this._bindCardEvents(card, story);

        return card;
    },

    _bindCardEvents(card, story) {
        const id = story.id;

        // Field changes (prompt, instagramDesc, character, settings)
        card.querySelectorAll('[data-field]').forEach(el => {
            const field = el.dataset.field;
            const event = el.tagName === 'SELECT' ? 'change' : 'input';
            el.addEventListener(event, (e) => {
                let value = e.target.value;
                if (field === 'count') value = parseInt(value);
                this.updateField(id, field, value);
                // Update avatar if character changed
                if (field === 'characterId') this.renderCard(id);
            });
        });

        // Action buttons
        card.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            if (action === 'generate') this.generateSingle(id);
            else if (action === 'approve') this.toggleApprove(id);
            else if (action === 'clear-img') this.clearImage(id);
            else if (action === 'prev-img') this.prevImage(id);
            else if (action === 'next-img') this.nextImage(id);
            else if (action === 'remove') this.removeStory(id);
            else if (action === 'duplicate') this.duplicateStory(id);
        });
    },

    renderCard(id) {
        const oldCard = document.getElementById('card-' + id);
        if (!oldCard) return;
        const story = this.stories.find(s => s.id === id);
        if (!story) return;
        const newCard = this.createCardElement(story);
        oldCard.replaceWith(newCard);
    },

    updateGeneratingTime(id, elapsed) {
        const el = document.getElementById('gen-time-' + id);
        if (el) el.textContent = elapsed + 's';
    }
};
