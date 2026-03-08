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

            // Clean metadata by re-drawing on canvas (strips EXIF)
            try {
                const cleanedDataUrl = await this.stripMetadata(img.dataUrl);
                img.dataUrl = cleanedDataUrl;
                img.cleaned = true;

                // Create download
                this.downloadCleanedImage(cleanedDataUrl, img.name);
            } catch (err) {
                console.error('Failed to clean:', img.name, err);
            }

            this.render();
        }

        cleanBtn.disabled = false;
        cleanBtn.textContent = 'Clean Metadata';
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
