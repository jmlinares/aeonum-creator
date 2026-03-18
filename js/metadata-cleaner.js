/* ========== METADATA CLEANER (100% Client-Side) ========== */
/* Supports images (EXIF strip via canvas) and videos (MP4 udta atom removal) */

const MetadataCleaner = {
    files: [], // { file, previewUrl, name, size, type:'image'|'video', selected, cleaned, cleanedBlob }

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
            this.addFiles(e.dataTransfer.files);
        });

        // File input
        fileInput.addEventListener('change', (e) => {
            this.addFiles(e.target.files);
            fileInput.value = '';
        });

        // Add more
        document.getElementById('btnMetaAddMore').addEventListener('click', () => fileInput.click());

        // Select all
        document.getElementById('btnMetaSelectAll').addEventListener('click', () => {
            this.files.forEach(f => f.selected = true);
            this.render();
        });

        // Deselect all
        document.getElementById('btnMetaDeselectAll').addEventListener('click', () => {
            this.files.forEach(f => f.selected = false);
            this.render();
        });

        // Reset
        document.getElementById('btnMetaReset').addEventListener('click', () => {
            // Revoke object URLs to free memory
            this.files.forEach(f => {
                if (f.previewUrl && f.previewUrl.startsWith('blob:')) URL.revokeObjectURL(f.previewUrl);
                if (f.cleanedBlob) URL.revokeObjectURL(f._cleanedObjUrl);
            });
            this.files = [];
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

    async addFiles(fileList) {
        for (const file of fileList) {
            const isImage = file.type.startsWith('image/');
            const isVideo = file.type.startsWith('video/');
            if (!isImage && !isVideo) continue;

            let previewUrl;
            if (isImage) {
                previewUrl = await this._fileToDataUrl(file);
            } else {
                previewUrl = URL.createObjectURL(file);
            }

            this.files.push({
                file,
                previewUrl,
                name: file.name,
                size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
                type: isImage ? 'image' : 'video',
                selected: true,
                cleaned: false,
                cleanedBlob: null,
                _cleanedObjUrl: null
            });
        }

        document.getElementById('metaDropzone').style.display = 'none';
        document.getElementById('metaToolbar').classList.remove('hidden');
        document.getElementById('metaImagesGrid').classList.remove('hidden');
        document.getElementById('metaBottomActions').classList.remove('hidden');
        this.render();
    },

    _fileToDataUrl(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(file);
        });
    },

    render() {
        const grid = document.getElementById('metaImagesGrid');
        grid.innerHTML = '';

        const selectedCount = this.files.filter(f => f.selected).length;
        document.getElementById('metaSelectedCount').textContent = `${selectedCount} of ${this.files.length} selected`;
        document.getElementById('metaCleanCount').textContent = `${selectedCount} file${selectedCount !== 1 ? 's' : ''} selected to clean`;

        this.files.forEach((item, idx) => {
            const card = document.createElement('div');
            card.className = `meta-image-card${item.selected ? ' selected' : ''}`;

            let previewHtml;
            if (item.type === 'video') {
                previewHtml = `<video src="${item.previewUrl}" muted preload="metadata" class="meta-video-preview"></video>
                               <div class="meta-type-badge">VIDEO</div>`;
            } else {
                previewHtml = `<img src="${item.previewUrl}" alt="${item.name}">`;
            }

            card.innerHTML = `
                <div class="meta-check">${item.selected ? '✓' : ''}</div>
                <button class="meta-card-remove" data-idx="${idx}">✕</button>
                ${previewHtml}
                ${item.cleaned ? '<div class="meta-status clean">Clean</div>' : ''}
                <div class="meta-card-info">
                    <div class="meta-filename" title="${item.name}">${item.name}</div>
                    <div class="meta-filesize">${item.size}</div>
                </div>
            `;

            card.addEventListener('click', (e) => {
                if (e.target.closest('.meta-card-remove')) {
                    if (item.previewUrl && item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
                    this.files.splice(idx, 1);
                    if (this.files.length === 0) {
                        document.getElementById('metaDropzone').style.display = 'block';
                        document.getElementById('metaToolbar').classList.add('hidden');
                        document.getElementById('metaImagesGrid').classList.add('hidden');
                        document.getElementById('metaBottomActions').classList.add('hidden');
                    }
                    this.render();
                    return;
                }
                item.selected = !item.selected;
                this.render();
            });

            grid.appendChild(card);
        });
    },

    async cleanSelected() {
        const selected = this.files.filter(f => f.selected && !f.cleaned);
        if (selected.length === 0) return;

        const progressEl = document.getElementById('metaProgress');
        const fillEl = document.getElementById('metaProgressFill');
        const countEl = document.getElementById('metaProgressCount');
        const cleanBtn = document.getElementById('btnMetaClean');

        progressEl.classList.remove('hidden');
        cleanBtn.disabled = true;
        cleanBtn.textContent = 'Cleaning...';

        for (let i = 0; i < selected.length; i++) {
            const item = selected[i];
            countEl.textContent = `${i + 1}/${selected.length}`;
            fillEl.style.width = `${((i + 1) / selected.length) * 100}%`;

            try {
                if (item.type === 'image') {
                    const cleanedDataUrl = await this._stripImageMetadata(item.previewUrl);
                    item.previewUrl = cleanedDataUrl;
                    item.cleaned = true;
                } else {
                    const cleanedBlob = await this._stripVideoMetadata(item.file);
                    item.cleanedBlob = cleanedBlob;
                    // Update preview to cleaned version
                    if (item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
                    item.previewUrl = URL.createObjectURL(cleanedBlob);
                    item._cleanedObjUrl = item.previewUrl;
                    item.cleaned = true;
                }
            } catch (err) {
                console.error('Failed to clean:', item.name, err);
            }

            this.render();
        }

        cleanBtn.disabled = false;
        cleanBtn.textContent = 'Clean Metadata';
        this.showDownloadAll();
    },

    showDownloadAll() {
        const cleaned = this.files.filter(f => f.cleaned);
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
        const cleaned = this.files.filter(f => f.cleaned);
        if (cleaned.length === 0) return;

        for (let i = 0; i < cleaned.length; i++) {
            this._downloadItem(cleaned[i]);
            if (i < cleaned.length - 1) {
                await new Promise(r => setTimeout(r, 300));
            }
        }
    },

    _downloadItem(item) {
        const baseName = item.name.replace(/\.[^.]+$/, '');
        const a = document.createElement('a');

        if (item.type === 'video' && item.cleanedBlob) {
            a.href = URL.createObjectURL(item.cleanedBlob);
            a.download = `${baseName}_clean.mp4`;
        } else {
            a.href = item.previewUrl;
            a.download = `${baseName}_clean.png`;
        }

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    },

    // ===== IMAGE: strip EXIF via canvas re-export =====
    _stripImageMetadata(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = reject;
            img.src = dataUrl;
        });
    },

    // ===== VIDEO: strip metadata by removing udta/meta atoms from MP4 =====
    async _stripVideoMetadata(file) {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        // Parse MP4 box structure and rebuild without metadata atoms
        const cleanedParts = [];
        this._walkBoxes(bytes, 0, bytes.length, cleanedParts, /* depth */ 0);

        return new Blob(cleanedParts, { type: 'video/mp4' });
    },

    // Metadata atom types to remove
    _isMetadataBox(type) {
        const strip = ['udta', 'meta', '\xa9nam', '\xa9ART', '\xa9alb', '\xa9cmt',
                        '\xa9day', '\xa9too', '\xa9gen', 'cprt', 'desc', 'loci',
                        'XMP_', 'uuid'];
        return strip.includes(type);
    },

    // Container boxes that may contain metadata children — recurse into them
    _isContainerBox(type) {
        return ['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf'].includes(type);
    },

    _readBoxHeader(bytes, offset) {
        if (offset + 8 > bytes.length) return null;
        const view = new DataView(bytes.buffer, bytes.byteOffset);
        let size = view.getUint32(offset);
        const type = String.fromCharCode(bytes[offset+4], bytes[offset+5], bytes[offset+6], bytes[offset+7]);
        let headerSize = 8;

        if (size === 1) {
            // 64-bit extended size
            if (offset + 16 > bytes.length) return null;
            const hi = view.getUint32(offset + 8);
            const lo = view.getUint32(offset + 12);
            size = hi * 0x100000000 + lo;
            headerSize = 16;
        } else if (size === 0) {
            // Box extends to end of file
            size = bytes.length - offset;
        }

        return { size, type, headerSize, offset };
    },

    _walkBoxes(bytes, start, end, output, depth) {
        let pos = start;
        while (pos < end) {
            const box = this._readBoxHeader(bytes, pos);
            if (!box || box.size < 8 || pos + box.size > end) {
                // Remaining bytes — copy as-is
                if (pos < end) output.push(bytes.slice(pos, end));
                break;
            }

            if (this._isMetadataBox(box.type)) {
                // Skip this entire box (strip it)
                console.log(`[MetaCleaner] Stripping ${box.type} box (${box.size} bytes)`);
            } else if (this._isContainerBox(box.type)) {
                // Recurse: rebuild container without metadata children
                const childParts = [];
                this._walkBoxes(bytes, pos + box.headerSize, pos + box.size, childParts, depth + 1);
                const childBlob = new Blob(childParts);

                // Rewrite container header with new size
                const newSize = box.headerSize + childBlob.size;
                const header = new Uint8Array(box.headerSize);
                const hView = new DataView(header.buffer);
                if (box.headerSize === 16) {
                    hView.setUint32(0, 1); // marker for 64-bit
                    header[4] = bytes[pos+4]; header[5] = bytes[pos+5];
                    header[6] = bytes[pos+6]; header[7] = bytes[pos+7];
                    hView.setUint32(8, Math.floor(newSize / 0x100000000));
                    hView.setUint32(12, newSize & 0xFFFFFFFF);
                } else {
                    hView.setUint32(0, newSize);
                    header[4] = bytes[pos+4]; header[5] = bytes[pos+5];
                    header[6] = bytes[pos+6]; header[7] = bytes[pos+7];
                }
                output.push(header);
                output.push(...childParts);
            } else {
                // Non-metadata, non-container: copy as-is
                output.push(bytes.slice(pos, pos + box.size));
            }

            pos += box.size;
        }
    }
};
