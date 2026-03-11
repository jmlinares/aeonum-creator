/* ========== COLLECTIONS MANAGER ========== */

const Collections = {
    collections: [], // { id, name, description, imageIds[], createdAt, updatedAt }
    currentCollectionId: null, // when viewing a collection's images

    async init() {
        // Load from Firebase first, fallback to localStorage
        const fbCollections = await FirebaseSync.loadCollections();
        if (fbCollections.length > 0) {
            this.collections = fbCollections;
            Storage.set('collections', fbCollections);
        } else {
            this.collections = Storage.get('collections', []);
        }
        this.bindEvents();
    },

    bindEvents() {
        // Create new collection from the grid card
        document.getElementById('btnNewCollection').addEventListener('click', () => {
            this.openEditor(null);
        });

        // Collection editor modal
        document.getElementById('btnCollectionSave').addEventListener('click', () => this.saveFromEditor());
        document.getElementById('btnCollectionCancel').addEventListener('click', () => this.closeEditor());
        document.getElementById('btnCollectionDelete').addEventListener('click', () => this.deleteFromEditor());

        // Back button when viewing a collection
        document.getElementById('btnCollectionBack').addEventListener('click', () => {
            this.currentCollectionId = null;
            this.renderView();
        });

        // Add-to-collection modal
        document.getElementById('btnAddToColCancel').addEventListener('click', () => {
            document.getElementById('modalAddToCollection').classList.add('hidden');
        });
        document.getElementById('btnAddToColNew').addEventListener('click', () => {
            document.getElementById('modalAddToCollection').classList.add('hidden');
            this.openEditor(null, this._pendingImageId);
        });
    },

    // ===== EDITOR =====

    openEditor(collectionId, autoAddImageId) {
        const modal = document.getElementById('modalCollectionEditor');
        const title = document.getElementById('collectionEditorTitle');
        const nameInput = document.getElementById('collectionName');
        const descInput = document.getElementById('collectionDesc');
        const deleteBtn = document.getElementById('btnCollectionDelete');

        this._autoAddImageId = autoAddImageId || null;

        if (collectionId) {
            const col = this.getById(collectionId);
            title.textContent = 'Edit Collection';
            nameInput.value = col.name;
            descInput.value = col.description || '';
            deleteBtn.classList.remove('hidden');
            deleteBtn.dataset.id = collectionId;
            modal._editingId = collectionId;
        } else {
            title.textContent = 'New Collection';
            nameInput.value = '';
            descInput.value = '';
            deleteBtn.classList.add('hidden');
            modal._editingId = null;
        }

        modal.classList.remove('hidden');
        nameInput.focus();
    },

    closeEditor() {
        document.getElementById('modalCollectionEditor').classList.add('hidden');
        this._autoAddImageId = null;
    },

    async saveFromEditor() {
        const modal = document.getElementById('modalCollectionEditor');
        const name = document.getElementById('collectionName').value.trim();
        if (!name) return alert('Enter a collection name');

        const desc = document.getElementById('collectionDesc').value.trim();
        const editingId = modal._editingId;

        if (editingId) {
            // Update existing
            const col = this.getById(editingId);
            col.name = name;
            col.description = desc;
            col.updatedAt = new Date().toISOString();
        } else {
            // Create new
            const newCol = {
                id: 'col-' + Date.now() + Math.random().toString(36).slice(2, 6),
                name,
                description: desc,
                imageIds: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // Auto-add image if pending
            if (this._autoAddImageId) {
                newCol.imageIds.push(this._autoAddImageId);
            }

            this.collections.unshift(newCol);
        }

        this.persist();
        this.closeEditor();
        this.renderView();
    },

    async deleteFromEditor() {
        const modal = document.getElementById('modalCollectionEditor');
        const id = modal._editingId;
        if (!id) return;
        if (!confirm('Delete this collection? Images won\'t be deleted.')) return;

        this.collections = this.collections.filter(c => c.id !== id);
        this.persist();
        FirebaseSync.deleteCollection(id);
        this.closeEditor();
        this.currentCollectionId = null;
        this.renderView();
    },

    // ===== DATA =====

    getById(id) {
        return this.collections.find(c => c.id === id);
    },

    async addImageToCollection(collectionId, imageId) {
        const col = this.getById(collectionId);
        if (!col) return;
        if (col.imageIds.includes(imageId)) return; // already in
        col.imageIds.push(imageId);
        col.updatedAt = new Date().toISOString();
        this.persist();
    },

    removeImageFromCollection(collectionId, imageId) {
        const col = this.getById(collectionId);
        if (!col) return;
        col.imageIds = col.imageIds.filter(id => id !== imageId);
        col.updatedAt = new Date().toISOString();
        this.persist();
    },

    persist() {
        Storage.set('collections', this.collections);
        // Save each collection to Firebase
        this.collections.forEach(col => FirebaseSync.saveCollection(col));
    },

    // ===== ADD TO COLLECTION MODAL =====

    showAddToCollectionModal(imageId) {
        this._pendingImageId = imageId;
        const modal = document.getElementById('modalAddToCollection');
        const list = document.getElementById('addToColList');
        list.innerHTML = '';

        if (this.collections.length === 0) {
            list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:16px;">No collections yet. Create one first.</p>';
        } else {
            this.collections.forEach(col => {
                const alreadyIn = col.imageIds.includes(imageId);
                const item = document.createElement('div');
                item.className = 'add-to-col-item' + (alreadyIn ? ' already-in' : '');
                const count = col.imageIds.length;
                item.innerHTML = `
                    <div class="add-to-col-info">
                        <span class="add-to-col-name">${col.name}</span>
                        <span class="add-to-col-count">${count} image${count !== 1 ? 's' : ''}</span>
                    </div>
                    <span class="add-to-col-status">${alreadyIn ? '✓ Added' : ''}</span>
                `;
                if (!alreadyIn) {
                    item.addEventListener('click', () => {
                        this.addImageToCollection(col.id, imageId);
                        item.classList.add('already-in');
                        item.querySelector('.add-to-col-status').textContent = '✓ Added';
                    });
                }
                list.appendChild(item);
            });
        }

        modal.classList.remove('hidden');
    },

    // ===== RENDERING =====

    renderView() {
        const container = document.getElementById('imgCollectionsManager');
        if (this.currentCollectionId) {
            this.renderCollectionDetail(container);
        } else {
            this.renderGrid(container);
        }
    },

    renderGrid(container) {
        if (!container) container = document.getElementById('imgCollectionsManager');
        const grid = document.getElementById('collectionsGrid');
        const detailView = document.getElementById('collectionDetailView');
        grid.classList.remove('hidden');
        detailView.classList.add('hidden');
        grid.innerHTML = '';

        this.collections.forEach(col => {
            const card = document.createElement('div');
            card.className = 'collection-card';

            // Get cover: first image's thumbnail
            const coverImg = this.getCoverImage(col);
            const count = col.imageIds.length;

            card.innerHTML = `
                <div class="collection-cover">
                    ${coverImg
                        ? `<img src="${coverImg}" alt="${col.name}" loading="lazy">`
                        : `<div class="collection-cover-empty">📁</div>`
                    }
                    <span class="collection-count">${count}</span>
                </div>
                <div class="collection-info">
                    <span class="collection-name">${col.name}</span>
                    <button class="btn-edit-collection" data-id="${col.id}" title="Edit">✎</button>
                </div>
            `;

            // Click to open collection
            card.addEventListener('click', (e) => {
                if (e.target.closest('.btn-edit-collection')) {
                    this.openEditor(e.target.closest('.btn-edit-collection').dataset.id);
                    return;
                }
                this.currentCollectionId = col.id;
                this.renderView();
            });

            grid.appendChild(card);
        });

        // Append the "New Collection" button card
        const newBtn = document.getElementById('btnNewCollection');
        grid.appendChild(newBtn);
    },

    renderCollectionDetail(container) {
        const grid = document.getElementById('collectionsGrid');
        const detailView = document.getElementById('collectionDetailView');
        grid.classList.add('hidden');
        detailView.classList.remove('hidden');

        const col = this.getById(this.currentCollectionId);
        if (!col) return;

        document.getElementById('collectionDetailName').textContent = col.name;
        const imageGrid = document.getElementById('collectionImageGrid');
        imageGrid.innerHTML = '';

        if (col.imageIds.length === 0) {
            imageGrid.innerHTML = '<p class="empty-state" style="display:flex;">No images in this collection yet. Add images from the Generation tab.</p>';
            return;
        }

        // Resolve image objects from ImageGenerator history
        col.imageIds.forEach(imgId => {
            const img = ImageGenerator.generatedImages.find(i => i.id === imgId);
            if (!img) return; // image was deleted from history

            const card = document.createElement('div');
            card.className = 'image-card';
            const costLabel = img.cost ? `$${img.cost.toFixed(3)}` : '';
            card.innerHTML = `
                <img src="${img.url}" alt="Collection image" loading="lazy">
                ${costLabel ? `<span class="card-cost">${costLabel}</span>` : ''}
                <div class="card-actions-right">
                    <button class="btn-card" title="Remove from collection" data-action="remove-from-col">✕</button>
                    <button class="btn-card" title="Download" data-action="download">⬇</button>
                </div>
            `;
            card.addEventListener('click', (e) => {
                const actionBtn = e.target.closest('[data-action]');
                if (actionBtn) {
                    const action = actionBtn.dataset.action;
                    if (action === 'remove-from-col') {
                        this.removeImageFromCollection(this.currentCollectionId, imgId);
                        this.renderCollectionDetail(container);
                    } else if (action === 'download') {
                        ImageGenerator.downloadImage(ImageGenerator.generatedImages.indexOf(img));
                    }
                    return;
                }
                // Open in viewer
                const globalIdx = ImageGenerator.generatedImages.indexOf(img);
                if (globalIdx >= 0) ImageGenerator.openViewer(globalIdx);
            });
            imageGrid.appendChild(card);
        });
    },

    getCoverImage(col) {
        if (!col.imageIds || col.imageIds.length === 0) return null;
        // Use last added image as cover
        const lastId = col.imageIds[col.imageIds.length - 1];
        const img = ImageGenerator.generatedImages.find(i => i.id === lastId);
        return img ? img.url : null;
    }
};
