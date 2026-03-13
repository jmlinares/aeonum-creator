/* ========== API LAYER - ALL VIA WAVESPEED ========== */

const API = {
    WAVESPEED_BASE: 'https://api.wavespeed.ai/api/v3',

    // ===== IMAGE MODELS =====
    IMAGE_MODELS: {
        'nano-banana-text-to-image':           '/google/nano-banana/text-to-image',
        'nano-banana-edit':                    '/google/nano-banana/edit',
        'nano-banana-2-text-to-image':         '/google/nano-banana-2/text-to-image',
        'nano-banana-2-edit':                  '/google/nano-banana-2/edit',
        'nano-banana-pro-text-to-image':       '/google/nano-banana-pro/text-to-image',
        'nano-banana-pro-text-to-image-ultra': '/google/nano-banana-pro/text-to-image-ultra',
        'nano-banana-pro-edit':                '/google/nano-banana-pro/edit',
        'nano-banana-pro-edit-ultra':          '/google/nano-banana-pro/edit-ultra',
        'wan-2.6-image-edit':                  '/alibaba/wan-2.6/image-edit',
        'seedream-4.5-edit':                   '/bytedance/seedream-v4.5/edit',
    },

    // ===== VIDEO MODELS =====
    VIDEO_MODELS: {
        'veo-3.1-text-to-video':         '/google/veo3.1/text-to-video',
        'veo-3.1-fast-text-to-video':    '/google/veo3.1-fast/text-to-video',
        'veo-3.1-fast-image-to-video':   '/google/veo3.1-fast/image-to-video',
        'veo-3.1-reference-to-video':    '/google/veo3.1/reference-to-video',
        'sora-2-image-to-video':         '/openai/sora-2/image-to-video',
        'kling-3.0-pro-image-to-video':  '/kwaivgi/kling-v3.0-pro/image-to-video',
        'kling-2.6-pro-image-to-video':  '/kwaivgi/kling-v2.6-pro/image-to-video',
    },

    // ===== PRICING (USD per generation) =====
    IMAGE_PRICING: {
        'nano-banana-text-to-image':           { '1k': 0.038, '2k': 0.038, '4k': 0.038 },
        'nano-banana-edit':                    { '1k': 0.038, '2k': 0.038, '4k': 0.038 },
        'nano-banana-2-text-to-image':         { '0.5k': 0.035, '1k': 0.07, '2k': 0.10, '4k': 0.14 },
        'nano-banana-2-edit':                  { '1k': 0.07,  '2k': 0.10,  '4k': 0.14 },
        'nano-banana-pro-text-to-image':       { '1k': 0.14,  '2k': 0.14,  '4k': 0.24 },
        'nano-banana-pro-text-to-image-ultra': { '4k': 0.15,  '8k': 0.18 },
        'nano-banana-pro-edit':                { '1k': 0.14,  '2k': 0.14,  '4k': 0.24 },
        'nano-banana-pro-edit-ultra':          { '4k': 0.15,  '8k': 0.18 },
        'wan-2.6-image-edit':                  { '1k': 0.07,  '2k': 0.07 },
        'seedream-4.5-edit':                   { '1k': 0.07,  '2k': 0.07,  '4k': 0.14 },
    },

    VIDEO_PRICING: {
        'veo-3.1-text-to-video':        { perSec: 0.40, perSecNoAudio: 0.20 },
        'veo-3.1-fast-text-to-video':   { flat: 1.20, flatNoAudio: 0.80 },
        'veo-3.1-fast-image-to-video':  { flat: 1.20, flatNoAudio: 0.80 },
        'veo-3.1-reference-to-video':   { perSec: 0.40, perSecNoAudio: 0.20 },
        'sora-2-image-to-video':        { perSec: 0.10 },
        'kling-3.0-pro-image-to-video': { flat: 0.84, flatNoAudio: 0.56 },
        'kling-2.6-pro-image-to-video': { flat: 0.56, flatNoAudio: 0.38 },
    },

    getImageCost(modelId, resolution) {
        const prices = this.IMAGE_PRICING[modelId];
        if (!prices) return 0;
        return prices[resolution] || prices['1k'] || prices['4k'] || 0;
    },

    getAvailableResolutions(modelId) {
        const prices = this.IMAGE_PRICING[modelId];
        if (!prices) return ['1k', '2k', '4k'];
        return Object.keys(prices);
    },

    getVideoCost(modelId, duration, withAudio = true) {
        const prices = this.VIDEO_PRICING[modelId];
        if (!prices) return 0;
        if (prices.flat) return withAudio ? prices.flat : (prices.flatNoAudio || prices.flat);
        const rate = withAudio ? prices.perSec : (prices.perSecNoAudio || prices.perSec);
        return rate * duration;
    },

    // Determine if a model is text-only (no input image required)
    isTextToImage(modelId) {
        return modelId.includes('text-to-image');
    },

    // ========== SUBMIT REQUEST ==========
    async submit(modelId, params) {
        const apiKey = Storage.getWavespeedKey();
        if (!apiKey) throw new Error('WaveSpeed API key not configured. Click the gear icon to set it.');

        const endpoint = this.IMAGE_MODELS[modelId] || this.VIDEO_MODELS[modelId];
        if (!endpoint) throw new Error(`Unknown model: ${modelId}`);

        const url = `${this.WAVESPEED_BASE}${endpoint}`;

        const body = {
            enable_base64_output: false,
            enable_sync_mode: false,
            ...params
        };

        console.log(`[API Submit] ${modelId} →`, url, body);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`WaveSpeed API error (${response.status}): ${err}`);
        }

        const result = await response.json();
        console.log(`[API Submit] Response:`, result);
        return result;
    },

    // ========== POLL FOR RESULT ==========
    _cancelledRequests: new Set(),

    cancelPolling(requestId) {
        if (requestId) {
            this._cancelledRequests.add(requestId);
        }
    },

    async poll(requestId, onProgress) {
        const apiKey = Storage.getWavespeedKey();
        const url = `${this.WAVESPEED_BASE}/predictions/${requestId}/result`;
        const startTime = Date.now();
        const MAX_POLL_TIME = 1800000; // 30 min timeout
        let networkErrors = 0;
        const MAX_NETWORK_ERRORS = 10; // allow up to 10 consecutive network failures before giving up

        while (true) {
            if (this._cancelledRequests.has(requestId)) {
                this._cancelledRequests.delete(requestId);
                throw new Error('CANCELLED');
            }

            const elapsedMs = Date.now() - startTime;
            const elapsed = (elapsedMs / 1000).toFixed(1);
            if (onProgress) onProgress(elapsed);

            if (elapsedMs > MAX_POLL_TIME) {
                throw new Error('Generation timed out after 30 minutes');
            }

            try {
                const response = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });

                if (!response.ok) {
                    // Don't throw on transient server errors (5xx), retry instead
                    if (response.status >= 500) {
                        networkErrors++;
                        console.warn(`[Poll ${requestId}] Server error ${response.status}, retry ${networkErrors}/${MAX_NETWORK_ERRORS}`);
                        if (networkErrors >= MAX_NETWORK_ERRORS) {
                            throw new Error(`Server error ${response.status} after ${MAX_NETWORK_ERRORS} retries`);
                        }
                        await new Promise(r => setTimeout(r, 3000));
                        continue;
                    }
                    const err = await response.text();
                    throw new Error(`Polling error (${response.status}): ${err}`);
                }

                // Reset network error counter on success
                networkErrors = 0;

                const data = await response.json();
                const status = data.status || data.data?.status;
                console.log(`[Poll ${requestId}] status: ${status}`);

                if (status === 'completed' || status === 'succeeded') {
                    return data;
                } else if (status === 'failed' || status === 'error' || status === 'canceled' || status === 'cancelled') {
                    throw new Error(`Generation failed: ${data.error || data.data?.error || status}`);
                }
                // Also check if outputs are already available (some models skip status)
                const outputs = data.data?.outputs || data.data?.output || data.outputs || data.output;
                if (outputs && (Array.isArray(outputs) ? outputs.length > 0 : outputs)) {
                    return data;
                }

                // Warn on unknown status
                if (status && !['pending', 'processing', 'queued', 'starting', 'in_progress'].includes(status)) {
                    console.warn(`[Poll] Unknown status: "${status}"`, data);
                }
            } catch (err) {
                // Network/fetch error — retry instead of crashing
                if (err.message === 'CANCELLED') throw err;
                if (err.message.includes('Generation failed') || err.message.includes('Polling error')) throw err;
                networkErrors++;
                console.warn(`[Poll ${requestId}] Network error, retry ${networkErrors}/${MAX_NETWORK_ERRORS}:`, err.message);
                if (networkErrors >= MAX_NETWORK_ERRORS) {
                    throw new Error(`Network error after ${MAX_NETWORK_ERRORS} retries: ${err.message}`);
                }
                await new Promise(r => setTimeout(r, 3000));
                continue;
            }

            // Wait 2 seconds before next poll
            await new Promise(r => setTimeout(r, 2000));
        }
    },

    // ========== URL TO BASE64 ==========
    async urlToBase64(url) {
        // If already base64, return as-is
        if (url.startsWith('data:')) return url;
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        } catch (err) {
            console.error('Failed to convert URL to base64:', err);
            return url; // fallback to URL
        }
    },

    // ========== UPLOAD FILE TO WAVESPEED CDN ==========
    async uploadFile(file) {
        const apiKey = Storage.getWavespeedKey();
        if (!apiKey) throw new Error('WaveSpeed API key not configured.');

        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${this.WAVESPEED_BASE}/media/upload/binary`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: formData
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Upload error (${response.status}): ${err}`);
        }

        const data = await response.json();
        return data.data?.download_url || data.download_url;
    },

    // ========== BALANCE ==========
    async getBalance() {
        const apiKey = Storage.getWavespeedKey();
        if (!apiKey) return null;

        const response = await fetch(`${this.WAVESPEED_BASE}/balance`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (!response.ok) return null;

        const data = await response.json();
        return data.data?.balance ?? null;
    },

    // ========== UTILS ==========
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },

    fileToBase64Raw(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },

    // Ensure image meets minimum dimension requirements (e.g. WAN 2.6 needs 240-8000px)
    ensureMinDimensions(imageUrl, minSize = 240) {
        // Skip processing for remote URLs (Firebase, CDN, etc.) — send directly to API
        if (imageUrl.startsWith('http')) {
            return Promise.resolve(imageUrl);
        }
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                if (img.naturalWidth >= minSize && img.naturalHeight >= minSize) {
                    resolve(imageUrl);
                    return;
                }
                const scale = Math.max(minSize / img.naturalWidth, minSize / img.naturalHeight);
                const newW = Math.round(img.naturalWidth * scale);
                const newH = Math.round(img.naturalHeight * scale);
                const canvas = document.createElement('canvas');
                canvas.width = newW;
                canvas.height = newH;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, newW, newH);
                console.log(`[ensureMinDimensions] Upscaled ${img.naturalWidth}x${img.naturalHeight} → ${newW}x${newH}`);
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => resolve(imageUrl);
            img.src = imageUrl;
        });
    },

    // Resize image to exact target dimensions (for models like WAN 2.6, NB2 that derive output size from input)
    async resizeImageToTarget(imageUrl, targetWidth, targetHeight) {
        try {
            // For remote URLs, fetch as blob first to avoid CORS canvas tainting
            let imgSrc = imageUrl;
            if (imageUrl.startsWith('http')) {
                const resp = await fetch(imageUrl);
                const blob = await resp.blob();
                imgSrc = await new Promise((res) => {
                    const reader = new FileReader();
                    reader.onloadend = () => res(reader.result);
                    reader.readAsDataURL(blob);
                });
            }

            return await new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    // If already at or above target, return as base64 (clean for canvas)
                    if (img.naturalWidth >= targetWidth && img.naturalHeight >= targetHeight) {
                        resolve(imgSrc);
                        return;
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = targetWidth;
                    canvas.height = targetHeight;
                    const ctx = canvas.getContext('2d');
                    // Draw image covering the canvas (center crop + scale)
                    const srcRatio = img.naturalWidth / img.naturalHeight;
                    const tgtRatio = targetWidth / targetHeight;
                    let sw, sh, sx, sy;
                    if (srcRatio > tgtRatio) {
                        sh = img.naturalHeight;
                        sw = sh * tgtRatio;
                        sx = (img.naturalWidth - sw) / 2;
                        sy = 0;
                    } else {
                        sw = img.naturalWidth;
                        sh = sw / tgtRatio;
                        sx = 0;
                        sy = (img.naturalHeight - sh) / 2;
                    }
                    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
                    console.log(`[resizeImageToTarget] ${img.naturalWidth}x${img.naturalHeight} → ${targetWidth}x${targetHeight}`);
                    resolve(canvas.toDataURL('image/png'));
                };
                img.onerror = () => resolve(imgSrc);
                img.src = imgSrc;
            });
        } catch (err) {
            console.error('[resizeImageToTarget] Error:', err);
            return imageUrl; // fallback
        }
    }
};
