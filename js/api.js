/* ========== API LAYER - ALL VIA WAVESPEED ========== */

const API = {
    WAVESPEED_BASE: 'https://api.wavespeed.ai/api/v3',

    // ===== IMAGE MODELS =====
    IMAGE_MODELS: {
        'nano-banana-text-to-image':           '/google/nano-banana/text-to-image',
        'nano-banana-edit':                    '/google/nano-banana/edit',
        'nano-banana-2-edit':                  '/google/nano-banana-2/edit',
        'nano-banana-pro-text-to-image':       '/google/nano-banana-pro/text-to-image',
        'nano-banana-pro-text-to-image-ultra': '/google/nano-banana-pro/text-to-image-ultra',
        'nano-banana-pro-edit':                '/google/nano-banana-pro/edit',
        'nano-banana-pro-edit-ultra':          '/google/nano-banana-pro/edit-ultra',
    },

    // ===== VIDEO MODELS =====
    VIDEO_MODELS: {
        'veo-3.1-text-to-video':         '/google/veo3.1/text-to-video',
        'veo-3.1-fast-text-to-video':    '/google/veo3.1-fast/text-to-video',
        'veo-3.1-fast-image-to-video':   '/google/veo3.1-fast/image-to-video',
        'veo-3.1-reference-to-video':    '/google/veo3.1/reference-to-video',
    },

    // ===== PRICING (USD per generation) =====
    IMAGE_PRICING: {
        'nano-banana-text-to-image':           { '1k': 0.038, '2k': 0.038, '4k': 0.038 },
        'nano-banana-edit':                    { '1k': 0.038, '2k': 0.038, '4k': 0.038 },
        'nano-banana-2-edit':                  { '1k': 0.07,  '2k': 0.105, '4k': 0.14 },
        'nano-banana-pro-text-to-image':       { '1k': 0.14,  '2k': 0.14,  '4k': 0.24 },
        'nano-banana-pro-text-to-image-ultra': { '4k': 0.15,  '8k': 0.18 },
        'nano-banana-pro-edit':                { '1k': 0.14,  '2k': 0.14,  '4k': 0.24 },
        'nano-banana-pro-edit-ultra':          { '4k': 0.15,  '8k': 0.18 },
    },

    VIDEO_PRICING: {
        'veo-3.1-text-to-video':        { perSec: 0.40, perSecNoAudio: 0.20 },
        'veo-3.1-fast-text-to-video':   { flat: 1.20, flatNoAudio: 0.80 },
        'veo-3.1-fast-image-to-video':  { flat: 1.20, flatNoAudio: 0.80 },
        'veo-3.1-reference-to-video':   { perSec: 0.40, perSecNoAudio: 0.20 },
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
        if (prices.flat) return withAudio ? prices.flat : prices.flatNoAudio;
        return (withAudio ? prices.perSec : prices.perSecNoAudio) * duration;
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
        const MAX_POLL_TIME = 300000; // 5 min timeout

        while (true) {
            if (this._cancelledRequests.has(requestId)) {
                this._cancelledRequests.delete(requestId);
                throw new Error('CANCELLED');
            }

            const elapsedMs = Date.now() - startTime;
            const elapsed = (elapsedMs / 1000).toFixed(1);
            if (onProgress) onProgress(elapsed);

            if (elapsedMs > MAX_POLL_TIME) {
                throw new Error('Generation timed out after 5 minutes');
            }

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`Polling error (${response.status}): ${err}`);
            }

            const data = await response.json();
            const status = data.status || data.data?.status;
            console.log(`[Poll ${requestId}] status: ${status}`, data);

            if (status === 'completed' || status === 'succeeded') {
                return data;
            } else if (status === 'failed' || status === 'error') {
                throw new Error(`Generation failed: ${data.error || data.data?.error || 'Unknown error'}`);
            }
            // Also check if outputs are already available (some models skip status)
            const outputs = data.data?.outputs || data.data?.output || data.outputs || data.output;
            if (outputs && (Array.isArray(outputs) ? outputs.length > 0 : outputs)) {
                return data;
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
    }
};
