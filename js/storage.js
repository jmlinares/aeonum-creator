/* ========== LOCAL STORAGE MANAGER ========== */
const Storage = {
    get(key, fallback = null) {
        try {
            const val = localStorage.getItem(key);
            return val ? JSON.parse(val) : fallback;
        } catch {
            return fallback;
        }
    },

    set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    },

    remove(key) {
        localStorage.removeItem(key);
    },

    // API Keys
    getWavespeedKey() {
        return this.get('wavespeed_api_key', '');
    },

    setWavespeedKey(key) {
        this.set('wavespeed_api_key', key);
    },

    getAnthropicKey() {
        return this.get('anthropic_api_key', '');
    },

    setAnthropicKey(key) {
        this.set('anthropic_api_key', key);
    },

    // Characters
    getCharacters() {
        return this.get('characters', []);
    },

    saveCharacters(chars) {
        this.set('characters', chars);
    },

    // Generated images history
    getImageHistory() {
        return this.get('image_history', []);
    },

    addImageToHistory(item) {
        const history = this.getImageHistory();
        history.unshift(item);
        if (history.length > 200) history.length = 200;
        this.set('image_history', history);
    },

    // Generated videos history
    getVideoHistory() {
        return this.get('video_history', []);
    },

    addVideoToHistory(item) {
        const history = this.getVideoHistory();
        history.unshift(item);
        if (history.length > 50) history.length = 50;
        this.set('video_history', history);
    },

    // Selected models
    getSelectedImageModel() {
        return this.get('selected_image_model', 'nano-banana-2-edit');
    },

    setSelectedImageModel(model) {
        this.set('selected_image_model', model);
    },

    getSelectedVideoModel() {
        return this.get('selected_video_model', 'veo-3.1');
    },

    setSelectedVideoModel(model) {
        this.set('selected_video_model', model);
    }
};
