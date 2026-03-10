/* ========== METADATA CLEANER (100% Client-Side) ========== */

const MetadataCleaner = {
    images: [], // { file, dataUrl, name, size, selected, cleaned }

    init() {
        this.bindEvents();
    },

    bindEvents() {
        const dropzone = document.getElementById('metaDropzone');
        const fileInput = document.getElementById('metaFileInput');

        // Upload button
        document.getElementById('btnMetaUpload').addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
        });

        // Dropzone click
        dropzone.addEventListener('click', () => fileInput.click());

        // Drag & drop
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('drag-over');
        });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('drag-over');
            this.addImages(e.dataTransfer.files);
        });

        // File input
        fileInput.addEventListener('change', (e) => {
            this.addImages(e.target.files);
            fileInput.value = '';
        });

        // Add more
        document.getElementById('btnMetaAddMore').addEventListener('click', () => fileInput.click());

        // Select all
        document.getElementById('btnMetaSelectAll').addEventListener('click', () => {
            this.images.forEach(img => img.selected = true);
            this.render();
        });

        // Deselect all
        document.getElementById('btnMetaDeselectAll').addEventListener('click', () => {
            this.images.forEach(img => img.selected = false);
            this.render();
        });

        // Reset
        document.getElementById('btnMetaReset').addEventListener('click', () => {
            this.images = [];
            this.render();
            document.getElementById('metaDropzone').style.display = 'block';
            document.getElementById('metaToolbar').classList.add('hidden');
            document.getElementById('metaImagesGrid').classList.add('hidden');
            document.getElementById('metaBottomActions').classList.add('hidden');
            document.getElementById('metaProgress').classList.add('hidden');
        });

        // Clean
        document.getElementById('btnMetaClean').addEventListener('click', () => this.cleanSelected());
    },

    async addImages(files) {
        for (const file of files) {
            if (!file.type.startsWith('image/')) continue;
            const dataUrl = await API.fileToBase64(file);
            this.images.push({
                file,
                dataUrl,
                name: file.name,
                size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
                selected: true,
                cleaned: false
            });
        }

        document.getElementById('metaDropzone').style.display = 'none';
        document.getElementById('metaToolbar').classList.remove('hidden');
        document.getElementById('metaImagesGrid').classList.remove('hidden');
        document.getElementById('metaBottomActions').classList.remove('hidden');
        this.render();
    },

    render() {
        const grid = document.getElementById('metaImagesGrid');
        grid.innerHTML = '';

        const selectedCount = this.images.filter(i => i.selected).length;
        document.getElementById('metaSelectedCount').textContent = `${selectedCount} of ${this.images.length} selected`;
        document.getElementById('metaCleanCount').textContent = `${selectedCount} image${selectedCount !== 1 ? 's' : ''} selected to clean`;

        this.images.forEach((img, idx) => {
            const card = document.createElement('div');
            card.className = `meta-image-card${img.selected ? ' selected' : ''}`;
            card.innerHTML = `
                <div class="meta-check">${img.selected ? '✓' : ''}</div>
                <button class="meta-card-remove" data-idx="${idx}">✕</button>
                <img src="${img.dataUrl}" alt="${img.name}">
                ${img.cleaned ? '<div class="meta-status clean">Clean</div>' : ''}
                <div class="meta-card-info">
                    <div class="meta-filename" title="${img.name}">${img.name}</div>
                    <div class="meta-filesize">${img.size}</div>
                </div>
            `;

            card.addEventListener('click', (e) => {
                if (e.target.closest('.meta-card-remove')) {
                    this.images.splice(idx, 1);
                    if (this.images.length === 0) {
                        document.getElementById('metaDropzone').style.display = 'block';
                        document.getElementById('metaToolbar').classList.add('hidden');
                        document.getElementById('metaImagesGrid').classList.add('hidden');
                        document.getElementById('metaBottomActions').classList.add('hidden');
                    }
                    this.render();
                    return;
                }
                img.selected = !img.selected;
                this.render();
            });

            grid.appendChild(card);
        });
    },

    async cleanSelected() {
        const selected = this.images.filter(i => i.selected && !i.cleaned);
        if (selected.length === 0) return;

        const progressEl = document.getElementById('metaProgress');
        const fillEl = document.getElementById('metaProgressFill');
        const countEl = document.getElementById('metaProgressCount');
        const cleanBtn = document.getElementById('btnMetaClean');

        progressEl.classList.remove('hidden');
        cleanBtn.disabled = true;
        cleanBtn.textContent = 'Cleaning...';

        for (let i = 0; i < selected.length; i++) {
            const img = selected[i];
            countEl.textContent = `${i + 1}/${selected.length}`;
            fillEl.style.width = `${((i + 1) / selected.length) * 100}%`;

            try {
                const cleanedDataUrl = await this.stripMetadata(img.dataUrl);
                img.dataUrl = cleanedDataUrl;
                img.cleaned = true;
            } catch (err) {
                console.error('Failed to clean:', img.name, err);
            }

            this.render();
        }

        cleanBtn.disabled = false;
        cleanBtn.textContent = 'Clean Metadata';

        // Show download all button
        this.showDownloadAll();
    },

    showDownloadAll() {
        const cleaned = this.images.filter(i => i.cleaned);
        if (cleaned.length === 0) return;

        let dlBtn = document.getElementById('btnMetaDownloadAll');
        if (!dlBtn) {
            dlBtn = document.createElement('button');
            dlBtn.id = 'btnMetaDownloadAll';
            dlBtn.className = 'btn-accent';
            dlBtn.style.marginTop = '12px';
            document.getElementById('metaBottomActions').appendChild(dlBtn);
        }
        dlBtn.textContent = `Download All (${cleaned.length})`;
        dlBtn.onclick = () => this.downloadAll();
    },

    async downloadAll() {
        const cleaned = this.images.filter(i => i.cleaned);
        if (cleaned.length === 0) return;

        if (cleaned.length === 1) {
            this.downloadCleanedImage(cleaned[0].dataUrl, cleaned[0].name);
            return;
        }

        // Download each with small delay to avoid browser blocking
        for (let i = 0; i < cleaned.length; i++) {
            this.downloadCleanedImage(cleaned[i].dataUrl, cleaned[i].name);
            if (i < cleaned.length - 1) {
                await new Promise(r => setTimeout(r, 300));
            }
        }
    },

    stripMetadata(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                // Re-export as PNG (no EXIF)
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = reject;
            img.src = dataUrl;
        });
    },

    downloadCleanedImage(dataUrl, originalName) {
        const ext = originalName.replace(/\.[^.]+$/, '');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${ext}_clean.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
};
