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

    // Generate a thumbnail blob from an image URL (max 400px wide)
    generateThumbnail(imageUrl, maxWidth = 400) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const scale = Math.min(1, maxWidth / img.naturalWidth);
                const w = Math.round(img.naturalWidth * scale);
                const h = Math.round(img.naturalHeight * scale);
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Canvas toBlob failed'));
                }, 'image/webp', 0.80);
            };
            img.onerror = () => reject(new Error('Failed to load image for thumbnail'));
            img.src = imageUrl;
        });
    },

    // Upload thumbnail to Firebase Storage thumbnails/ folder
    async uploadThumbnail(imageUrl, fileName) {
        if (!this.initialized) return null;
        try {
            const blob = await this.generateThumbnail(imageUrl);
            const thumbName = fileName.replace(/\.[^.]+$/, '') + '.webp';
            const ref = this.storage.ref(`thumbnails/${thumbName}`);
            await ref.put(blob, { contentType: 'image/webp' });
            return await ref.getDownloadURL();
        } catch (err) {
            console.error('Thumbnail upload error:', err);
            return null;
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
            // Use unique filename to avoid cache/collision issues
            const uniqueId = Date.now() + '_' + index;
            const ref = this.storage.ref(`characters/${charId}/img_${uniqueId}.png`);
            await ref.put(blob);
            const url = await ref.getDownloadURL();
            console.log(`[CharUpload] img${index} → ${url.substring(0, 80)}...`);
            return url;
        } catch (err) {
            console.error('Firebase char image upload error:', err);
            return dataUrl; // fallback
        }
    },

    // ===== FIRESTORE - CHARACTERS =====

    async saveCharacter(char, onProgress) {
        if (!this.initialized) return;
        try {
            // Upload base64 images to Storage in parallel
            const total = (char.images || []).length;
            let done = 0;
            const uploadPromises = (char.images || []).map((img, i) => {
                if (img && img.startsWith('data:')) {
                    return this.uploadCharacterImage(img, char.id, i).then(url => {
                        done++;
                        if (onProgress) onProgress(done, total);
                        return url;
                    });
                } else {
                    done++;
                    if (onProgress) onProgress(done, total);
                    return Promise.resolve(img);
                }
            });
            const uploadedImages = await Promise.all(uploadPromises);
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
    },

    // ===== FIRESTORE - COLLECTIONS =====

    async saveCollection(col) {
        if (!this.initialized) return;
        try {
            await this.db.collection('collections').doc(col.id).set(col);
        } catch (err) {
            console.error('Firestore save collection error:', err);
        }
    },

    async deleteCollection(id) {
        if (!this.initialized) return;
        try {
            await this.db.collection('collections').doc(id).delete();
        } catch (err) {
            console.error('Firestore delete collection error:', err);
        }
    },

    async loadCollections() {
        if (!this.initialized) return [];
        try {
            const snap = await this.db.collection('collections')
                .orderBy('createdAt', 'desc')
                .get();
            return snap.docs.map(d => d.data());
        } catch (err) {
            console.error('Firestore load collections error:', err);
            return [];
        }
    },

    // ===== FIRESTORE - STORIES =====

    async saveStory(story) {
        if (!this.initialized) return;
        try {
            await this.db.collection('stories').doc(story.id).set(story);
        } catch (err) {
            console.error('Firestore save story error:', err);
        }
    },

    async deleteStory(id) {
        if (!this.initialized) return;
        try {
            await this.db.collection('stories').doc(id).delete();
        } catch (err) {
            console.error('Firestore delete story error:', err);
        }
    },

    async loadStories() {
        if (!this.initialized) return [];
        try {
            const snap = await this.db.collection('stories')
                .orderBy('createdAt', 'asc')
                .get();
            return snap.docs.map(d => d.data());
        } catch (err) {
            console.error('Firestore load stories error:', err);
            return [];
        }
    },

    // ===== FIRESTORE - LOCATIONS =====

    async saveLocation(loc, onProgress) {
        if (!this.initialized) return;
        try {
            const total = (loc.images || []).length;
            let done = 0;
            const uploadPromises = (loc.images || []).map((img, i) => {
                if (img && img.startsWith('data:')) {
                    return this.uploadCharacterImage(img, loc.id, i).then(url => {
                        done++;
                        if (onProgress) onProgress(done, total);
                        return url;
                    });
                } else {
                    done++;
                    if (onProgress) onProgress(done, total);
                    return Promise.resolve(img);
                }
            });
            const uploadedImages = await Promise.all(uploadPromises);
            const locToSave = { ...loc, images: uploadedImages };
            await this.db.collection('locations').doc(loc.id).set(locToSave);
            loc.images = uploadedImages;
        } catch (err) {
            console.error('Firestore save location error:', err);
        }
    },

    async deleteLocation(id) {
        if (!this.initialized) return;
        try {
            await this.db.collection('locations').doc(id).delete();
        } catch (err) {
            console.error('Firestore delete location error:', err);
        }
    },

    async loadLocations() {
        if (!this.initialized) return [];
        try {
            const snap = await this.db.collection('locations').get();
            return snap.docs.map(d => d.data());
        } catch (err) {
            console.error('Firestore load locations error:', err);
            return [];
        }
    }
};
