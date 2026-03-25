/* ========== METADATA CLEANER (100% Client-Side) ========== */
/* Supports images (EXIF strip via canvas) and videos (deep MP4 sanitization:
   metadata atoms, encoder fingerprints, handler names, timestamps, compressor IDs) */

const MetadataCleaner = {
    files: [], // { file, previewUrl, name, size, type:'image'|'video', selected, cleaned, cleanedBlob }

    // MP4 epoch: seconds between 1904-01-01 and 1970-01-01
    _MP4_EPOCH_OFFSET: 2082844800,

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
            let posterUrl = null;
            if (isImage) {
                previewUrl = await this._fileToDataUrl(file);
            } else {
                previewUrl = URL.createObjectURL(file);
                posterUrl = await this._generateVideoPoster(previewUrl);
            }

            this.files.push({
                file,
                previewUrl,
                posterUrl,
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

    _generateVideoPoster(videoUrl) {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.muted = true;
            video.preload = 'auto';
            video.crossOrigin = 'anonymous';

            const timeout = setTimeout(() => {
                video.removeAttribute('src');
                video.load();
                resolve(null);
            }, 5000);

            video.addEventListener('seeked', () => {
                clearTimeout(timeout);
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    canvas.getContext('2d').drawImage(video, 0, 0);
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                } catch (e) {
                    resolve(null);
                }
            }, { once: true });

            video.addEventListener('loadeddata', () => {
                video.currentTime = 0.1;
            }, { once: true });

            video.addEventListener('error', () => {
                clearTimeout(timeout);
                resolve(null);
            }, { once: true });

            video.src = videoUrl;
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
                if (item.posterUrl) {
                    previewHtml = `<img src="${item.posterUrl}" alt="${item.name}">
                                   <div class="meta-type-badge">VIDEO</div>`;
                } else {
                    previewHtml = `<video src="${item.previewUrl}" muted preload="metadata"></video>
                                   <div class="meta-type-badge">VIDEO</div>`;
                }
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
                    item.posterUrl = await this._generateVideoPoster(item.previewUrl);
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

    // Metadata atom types to neutralize (replaced with 'free' boxes to preserve offsets)
    _isMetadataBox(type) {
        const strip = [
            // Standard metadata containers
            'udta', 'meta', 'ilst', 'keys',
            // iTunes-style tags
            '\xa9nam', '\xa9ART', '\xa9alb', '\xa9cmt', '\xa9day', '\xa9too',
            '\xa9gen', '\xa9enc', '\xa9wrt', '\xa9grp', '\xa9lyr', '\xa9des',
            // Copyright / description / location
            'cprt', 'desc', 'loci', 'titl', 'auth', 'perf', 'gnre', 'dscp',
            // XMP / UUID extensions / ID3
            'XMP_', 'uuid', 'ID32',
            // FFmpeg / libav specifics
            'ISFT', 'IART', 'ICMT', 'INAM', 'ISRC', 'ICRD',
            // GPS / location
            '\xa9xyz',
            // Windows Media / Chapter markers
            'Xtra', 'chpl',
        ];
        return strip.includes(type);
    },

    // Padding boxes — zero out their content but keep their size
    _isPaddingBox(type) {
        return ['free', 'skip', 'wide'].includes(type);
    },

    // Container boxes that may contain metadata children — recurse into them
    _isContainerBox(type) {
        return ['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf'].includes(type);
    },

    // Create a 'free' box of exact size (zeroed payload, preserves byte offsets)
    _makeFreeBox(size) {
        const box = new Uint8Array(size);
        const view = new DataView(box.buffer);
        view.setUint32(0, size);
        box[4] = 0x66; // 'f'
        box[5] = 0x72; // 'r'
        box[6] = 0x65; // 'e'
        box[7] = 0x65; // 'e'
        // Rest is already zeroed
        return box;
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

            if (this._isMetadataBox(box.type) || this._isPaddingBox(box.type)) {
                // Replace with a 'free' box of same size — zeroed content, offsets preserved
                console.log(`[MetaCleaner] Neutralizing ${box.type} box (${box.size} bytes)`);
                output.push(this._makeFreeBox(box.size));
            } else if (this._isContainerBox(box.type)) {
                // Recurse into container — children may contain metadata to neutralize
                const childParts = [];
                this._walkBoxes(bytes, pos + box.headerSize, pos + box.size, childParts, depth + 1);
                // Container keeps exact same size since children are replaced, not removed
                const header = bytes.slice(pos, pos + box.headerSize);
                output.push(header);
                output.push(...childParts);
            } else if (this._isPatchableBox(box.type)) {
                // Patch specific fields (dates, encoder ID, handler names) preserving structure
                const boxData = bytes.slice(pos, pos + box.size);
                output.push(this._patchBox(boxData, box.type));
            } else {
                // Non-metadata, non-container: copy as-is
                output.push(bytes.slice(pos, pos + box.size));
            }

            pos += box.size;
        }
    },

    // ===== DEEP CLEANING: field-level patching =====

    // Boxes requiring field-level patching (not removal — they contain essential playback structure)
    _isPatchableBox(type) {
        return ['mvhd', 'tkhd', 'mdhd', 'hdlr', 'stsd'].includes(type);
    },

    // Visual codec sample entry types (contain the compressor_name field)
    _isVisualSampleEntry(type) {
        return ['avc1', 'avc3', 'hvc1', 'hev1', 'vp08', 'vp09', 'av01', 'mp4v'].includes(type);
    },

    // Generate a plausible MP4 timestamp (current time in MP4 epoch)
    _generateTimestamp() {
        return Math.floor(Date.now() / 1000) + this._MP4_EPOCH_OFFSET;
    },

    // Dispatch box patching based on type
    _patchBox(data, type) {
        const patched = new Uint8Array(data.length);
        patched.set(data);
        const view = new DataView(patched.buffer);

        switch (type) {
            case 'mvhd': this._patchDates(patched, view, 'mvhd'); break;
            case 'tkhd': this._patchDates(patched, view, 'tkhd'); break;
            case 'mdhd': this._patchDates(patched, view, 'mdhd'); break;
            case 'hdlr': this._patchHdlr(patched); break;
            case 'stsd': this._patchStsd(patched, view); break;
        }

        return patched;
    },

    // Patch creation/modification dates in mvhd, tkhd, mdhd to current time
    _patchDates(data, view, boxType) {
        const version = data[8];
        const ts = this._generateTimestamp();

        if (version === 0) {
            // 32-bit timestamps at fixed offsets (same layout for mvhd, tkhd, mdhd)
            view.setUint32(12, ts);  // creation_time
            view.setUint32(16, ts);  // modification_time
        } else {
            // 64-bit timestamps (version 1)
            view.setUint32(12, 0);   // creation_time high word
            view.setUint32(16, ts);  // creation_time low word
            view.setUint32(20, 0);   // modification_time high word
            view.setUint32(24, ts);  // modification_time low word
        }
        console.log(`[MetaCleaner] Patched ${boxType} dates`);
    },

    // Patch handler name in hdlr box — removes "VideoHandler"/"SoundHandler" FFmpeg fingerprint
    _patchHdlr(data) {
        // hdlr layout: box_header(8) + version+flags(4) + pre_defined(4) +
        //              handler_type(4, 'vide'/'soun') + reserved(12) + name(variable)
        // handler_type at offset 16-19 is preserved, name from offset 32 onwards is zeroed
        if (data.length > 33) {
            for (let i = 32; i < data.length; i++) {
                data[i] = 0;
            }
            console.log('[MetaCleaner] Patched hdlr handler name');
        }
    },

    // Patch sample entries within stsd box — zeros compressor_name in video codec entries
    _patchStsd(data, view) {
        // stsd (FullBox): header(8) + version+flags(4) + entry_count(4) → entries at offset 16
        let headerSize = 8;
        if (view.getUint32(0) === 1) headerSize = 16; // 64-bit extended size

        const entriesStart = headerSize + 4 + 4;
        if (data.length <= entriesStart + 8) return;

        // Walk sample entries within stsd
        let pos = entriesStart;
        while (pos + 8 <= data.length) {
            const entrySize = view.getUint32(pos);
            if (entrySize < 8 || pos + entrySize > data.length) break;

            const entryType = String.fromCharCode(data[pos+4], data[pos+5], data[pos+6], data[pos+7]);

            if (this._isVisualSampleEntry(entryType)) {
                // VisualSampleEntry layout: box_header(8) + reserved(6) + data_ref_idx(2) +
                //   pre_defined(2) + reserved(2) + pre_defined(12) + width(2) + height(2) +
                //   horiz_res(4) + vert_res(4) + reserved(4) + frame_count(2) +
                //   compressor_name(32 @ offset 50) + depth(2) + pre_defined(2)
                const nameOffset = pos + 50;
                if (nameOffset + 32 <= data.length) {
                    for (let i = 0; i < 32; i++) {
                        data[nameOffset + i] = 0;
                    }
                    console.log(`[MetaCleaner] Patched compressor_name in ${entryType}`);
                }
            }

            pos += entrySize;
        }
    }
};
