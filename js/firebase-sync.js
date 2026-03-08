/* ========== FIREBASE PERSISTENCE ========== */

const FirebaseSync = {
    db: null,
    storage: null,
    initialized: false,

    // ===== INITIALIZE =====
    init() {
        if (this.initialized) return;

        const firebaseConfig = {
            apiKey: "AIzaSyBGrBcp7GGE-Jc8GajDbzM7ZXtcagyRilU",
            authDomain: "aeonum-creator.firebaseapp.com",
            projectId: "aeonum-creator",
            storageBucket: "aeonum-creator.firebasestorage.app",
            messagingSenderId: "509044316388",
            appId: "1:509044316388:web:fb3e6b8f5ed6b20703f4f1"
        };

        firebase.initializeApp(firebaseConfig);
        this.db = firebase.firestore();
        this.storage = firebase.storage();
        this.initialized = true;

        console.log('Firebase initialized');
    },

    // ===== IMAGE STORAGE =====

    // Upload image from URL to Firebase Storage, return permanent download URL
    async uploadImageFromUrl(imageUrl, fileName) {
        if (!this.initialized) return imageUrl;

        try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const ref = this.storage.ref(`images/${fileName}`);
            await ref.put(blob);
            return await ref.getDownloadURL();
        } catch (err) {
            console.error('Firebase upload error:', err);
            return imageUrl; // fallback to original URL
        }
    },

    // Upload video from URL to Firebase Storage
    async uploadVideoFromUrl(videoUrl, fileName) {
        if (!this.initialized) return videoUrl;

        try {
            const response = await fetch(videoUrl);
            const blob = await response.blob();
            const ref = this.storage.ref(`videos/${fileName}`);
            await ref.put(blob);
            return await ref.getDownloadURL();
        } catch (err) {
            console.error('Firebase video upload error:', err);
            return videoUrl;
        }
    },

    // ===== FIRESTORE - IMAGE HISTORY =====

    async saveImageRecord(item) {
        if (!this.initialized) return;
        try {
            await this.db.collection('image_history').doc(item.id).set(item);
        } catch (err) {
            console.error('Firestore save error:', err);
        }
    },

    async deleteImageRecord(id) {
        if (!this.initialized) return;
        try {
            await this.db.collection('image_history').doc(id).delete();
        } catch (err) {
            console.error('Firestore delete error:', err);
        }
    },

    async loadImageHistory() {
        if (!this.initialized) return [];
        try {
            const snap = await this.db.collection('image_history')
                .orderBy('timestamp', 'desc')
                .limit(500)
                .get();
            return snap.docs.map(d => d.data());
        } catch (err) {
            console.error('Firestore load error:', err);
            return [];
        }
    },

    // ===== FIRESTORE - VIDEO HISTORY =====

    async saveVideoRecord(item) {
        if (!this.initialized) return;
        try {
            await this.db.collection('video_history').doc(item.id).set(item);
        } catch (err) {
            console.error('Firestore save error:', err);
        }
    },

    async deleteVideoRecord(id) {
        if (!this.initialized) return;
        try {
            await this.db.collection('video_history').doc(id).delete();
        } catch (err) {
            console.error('Firestore delete error:', err);
        }
    },

    async loadVideoHistory() {
        if (!this.initialized) return [];
        try {
            const snap = await this.db.collection('video_history')
                .orderBy('timestamp', 'desc')
                .limit(100)
                .get();
            return snap.docs.map(d => d.data());
        } catch (err) {
            console.error('Firestore load error:', err);
            return [];
        }
    },

    // ===== CHARACTER IMAGE UPLOAD =====

    async uploadCharacterImage(dataUrl, charId, index) {
        if (!this.initialized) return dataUrl;
        try {
            // Convert base64 dataUrl to blob
            const response = await fetch(dataUrl);
            const blob = await response.blob();
            const ref = this.storage.ref(`characters/${charId}/img${index}.png`);
            await ref.put(blob);
            return await ref.getDownloadURL();
        } catch (err) {
            console.error('Firebase char image upload error:', err);
            return dataUrl; // fallback
        }
    },

    // ===== FIRESTORE - CHARACTERS =====

    async saveCharacter(char) {
        if (!this.initialized) return;
        try {
            // Upload base64 images to Storage, replace with URLs
            const uploadedImages = [];
            for (let i = 0; i < (char.images || []).length; i++) {
                const img = char.images[i];
                if (img && img.startsWith('data:')) {
                    const url = await this.uploadCharacterImage(img, char.id, i);
                    uploadedImages.push(url);
                } else {
                    uploadedImages.push(img);
                }
            }
            const charToSave = {
                ...char,
                images: uploadedImages,
                faceImage: uploadedImages[0] || '',
                bodyImage: uploadedImages[1] || ''
            };
            await this.db.collection('characters').doc(char.id).set(charToSave);

            // Update in-memory with Firebase URLs
            char.images = uploadedImages;
            char.faceImage = uploadedImages[0] || '';
            char.bodyImage = uploadedImages[1] || '';
        } catch (err) {
            console.error('Firestore save char error:', err);
        }
    },

    async deleteCharacter(id) {
        if (!this.initialized) return;
        try {
            await this.db.collection('characters').doc(id).delete();
        } catch (err) {
            console.error('Firestore delete char error:', err);
        }
    },

    async loadCharacters() {
        if (!this.initialized) return [];
        try {
            const snap = await this.db.collection('characters').get();
            return snap.docs.map(d => d.data());
        } catch (err) {
            console.error('Firestore load chars error:', err);
            return [];
        }
    }
};
