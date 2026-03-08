/* ========== MAIN APP CONTROLLER ========== */

document.addEventListener('DOMContentLoaded', () => {
    // ===== TAB NAVIGATION =====
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            const target = document.getElementById(tab.dataset.tab);
            if (target) target.classList.add('active');
        });
    });

    // ===== API SETTINGS MODAL =====
    document.getElementById('btnOpenSettings').addEventListener('click', () => {
        document.getElementById('inputWavespeedKey').value = Storage.getWavespeedKey();
        document.getElementById('inputAnthropicKey').value = Storage.getAnthropicKey();
        document.getElementById('modalSettings').classList.remove('hidden');
    });

    document.getElementById('btnSettingsCancel').addEventListener('click', () => {
        document.getElementById('modalSettings').classList.add('hidden');
    });

    document.getElementById('btnSettingsSave').addEventListener('click', () => {
        const wsKey = document.getElementById('inputWavespeedKey').value.trim();
        Storage.setWavespeedKey(wsKey);
        const anthropicKey = document.getElementById('inputAnthropicKey').value.trim();
        Storage.setAnthropicKey(anthropicKey);
        document.getElementById('modalSettings').classList.add('hidden');
    });

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.add('hidden');
        });
    });

    // Close modals on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
        }
    });

    // ===== INIT FIREBASE =====
    FirebaseSync.init();

    // ===== INIT MODULES =====
    // Load characters from Firebase first, fallback to localStorage
    FirebaseSync.loadCharacters().then(fbChars => {
        if (fbChars && fbChars.length > 0) {
            try { Storage.saveCharacters(fbChars); } catch (e) { /* localStorage may be full */ }
        }
        Characters.renderDropdown();
        Characters.renderGrid();
    });
    ImageGenerator.init();
    VideoGenerator.init();
    MetadataCleaner.init();

    // ===== BALANCE DISPLAY =====
    async function refreshBalance() {
        const el = document.getElementById('balanceValue');
        try {
            const balance = await API.getBalance();
            if (balance !== null) {
                el.textContent = `$${balance.toFixed(4)}`;
                el.classList.toggle('low', balance < 1);
            } else {
                el.textContent = '--';
            }
        } catch {
            el.textContent = '--';
        }
    }

    // Refresh balance on load, after saving settings, and every 60s
    if (Storage.getWavespeedKey()) refreshBalance();
    setInterval(() => {
        if (Storage.getWavespeedKey()) refreshBalance();
    }, 60000);

    // Refresh balance after saving API key
    const origSaveHandler = document.getElementById('btnSettingsSave');
    origSaveHandler.addEventListener('click', () => {
        setTimeout(refreshBalance, 500);
    });

    // Expose for use after generation
    window.refreshBalance = refreshBalance;

    // ===== TRANSLATOR PANEL =====
    let translatorDirection = 'es-en'; // 'es-en' or 'en-es'

    function updateTranslatorUI() {
        const isEsEn = translatorDirection === 'es-en';
        document.getElementById('translatorTitle').textContent = isEsEn ? 'Traductor ES > EN' : 'Translator EN > ES';
        document.getElementById('translatorInputLabel').textContent = isEsEn ? 'Texto en Español' : 'English Text';
        document.getElementById('translatorOutputLabel').textContent = isEsEn ? 'English Translation' : 'Traducción en Español';
        document.getElementById('translatorInput').placeholder = isEsEn ? 'Escribe aquí en español...' : 'Type here in English...';
        document.getElementById('translatorOutput').placeholder = isEsEn ? 'Translation will appear here...' : 'La traducción aparecerá aquí...';
        document.getElementById('btnTranslate').textContent = isEsEn ? 'Traducir' : 'Translate';
        document.getElementById('btnToggleTranslator').textContent = isEsEn ? 'ES>EN' : 'EN>ES';
    }

    document.getElementById('btnToggleTranslator').addEventListener('click', () => {
        document.getElementById('translatorPanel').classList.toggle('hidden');
    });

    document.getElementById('btnCloseTranslator').addEventListener('click', () => {
        document.getElementById('translatorPanel').classList.add('hidden');
    });

    document.getElementById('btnTranslatorSwap').addEventListener('click', () => {
        translatorDirection = translatorDirection === 'es-en' ? 'en-es' : 'es-en';
        // Swap input/output text
        const input = document.getElementById('translatorInput');
        const output = document.getElementById('translatorOutput');
        const temp = output.value;
        output.value = input.value;
        input.value = temp;
        updateTranslatorUI();
    });

    document.getElementById('btnTranslate').addEventListener('click', async () => {
        const input = document.getElementById('translatorInput').value.trim();
        if (!input) return;

        const apiKey = Storage.getAnthropicKey();
        if (!apiKey) return alert('Set your Anthropic API key in Settings first.');

        const btn = document.getElementById('btnTranslate');
        const output = document.getElementById('translatorOutput');
        btn.disabled = true;
        btn.textContent = translatorDirection === 'es-en' ? 'Traduciendo...' : 'Translating...';
        output.value = '';

        const isEsEn = translatorDirection === 'es-en';
        const prompt = isEsEn
            ? `Translate the following Spanish text to English. Return ONLY the translation, no explanations or notes:\n\n${input}`
            : `Translate the following English text to Spanish. Return ONLY the translation, no explanations or notes:\n\n${input}`;

        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify({
                    model: 'claude-haiku-4-5-20251001',
                    max_tokens: 4096,
                    messages: [{ role: 'user', content: prompt }]
                })
            });

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`Anthropic API error (${response.status}): ${err}`);
            }

            const data = await response.json();
            const translation = data.content?.[0]?.text || '';
            output.value = translation;
        } catch (err) {
            alert('Translation error: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = isEsEn ? 'Traducir' : 'Translate';
        }
    });

    document.getElementById('btnTranslatorCopy').addEventListener('click', () => {
        const text = document.getElementById('translatorOutput').value;
        if (text) {
            navigator.clipboard.writeText(text);
        }
    });

    document.getElementById('btnTranslatorUse').addEventListener('click', () => {
        const text = document.getElementById('translatorOutput').value;
        if (!text) return;

        // Paste into whichever prompt is visible
        const imgTab = document.getElementById('image-generator');
        const vidTab = document.getElementById('video-generator');

        if (imgTab.classList.contains('active')) {
            const ta = document.getElementById('imgPrompt');
            ta.value = ta.value ? ta.value + '\n' + text : text;
        } else if (vidTab.classList.contains('active')) {
            const ta = document.getElementById('vidPrompt');
            ta.value = ta.value ? ta.value + '\n' + text : text;
        }
    });

    // ===== CHECK API KEY ON FIRST LOAD =====
    if (!Storage.getWavespeedKey()) {
        setTimeout(() => {
            document.getElementById('inputWavespeedKey').value = '';
            document.getElementById('modalSettings').classList.remove('hidden');
        }, 500);
    }
});
