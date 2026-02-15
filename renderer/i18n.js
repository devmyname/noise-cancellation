/**
 * Denoise AI - Internationalization (i18n)
 *
 * Supports EN and TR languages.
 * Auto-detects system language on startup.
 * Allows in-app switching; persists preference in localStorage.
 */

const translations = {
  en: {
    // App
    'app.title': 'Denoise AI',

    // Status bar
    'status.ready': 'Ready',
    'status.active': 'Active',
    'status.loading': 'Loading',
    'status.stopped': 'Stopped',

    // AI Model section
    'ai.title': 'AI Model',
    'model.shiguredo': 'Shiguredo RNNoise (Default)',
    'model.rnnoise': 'RNNoise Sapphi (Low Latency)',
    'model.deepfilter': 'DeepFilterNet3 (High Quality)',
    'ai.architecture': 'Architecture',
    'ai.parameters': 'Parameters',
    'model.loading': 'Loading model...',

    // DeepFilter settings
    'df.suppression': 'Suppression',

    // Level meters
    'level.input': 'Input',
    'level.output': 'Output',
    'level.noise': 'Noise',
    'level.reduction': 'Reduction:',

    // VAD
    'vad.speech': 'Speech',
    'vad.silent': 'Silent',

    // Devices
    'device.inputLabel': 'Microphone Input',
    'device.outputLabel': 'Microphone Output',
    'device.loading': 'Loading...',
    'device.selectCable': 'Select Virtual Cable...',
    'device.mic': 'Microphone {id}',
    'device.virtual': 'Virtual {id}',
    'device.output': 'Output {id}',
    'device.otherOutputs': '── Other Outputs ──',

    // Gain
    'gain.label': 'Gain',

    // VB-Cable
    'vbcable.help': 'VB-Cable required. After installing, "CABLE Input" appears here.<br>Select "CABLE Output" as microphone in Discord/Zoom.',

    // Virtual mic status
    'vm.found': '🔌 Virtual cable found — auto-selected',
    'vm.notFound': '⚠ No virtual cable found — install VB-Cable',
    'vm.noCable': 'No virtual cable selected',
    'vm.pressStart': '⚠ Press "Start" first',
    'vm.active': '✅ Active → Select "CABLE Output" in Discord/Zoom',
    'vm.notVirtual': '⚠ "{name}" is not a virtual cable — may output to speaker',
    'vm.noSetSinkId': '❌ setSinkId not supported',

    // Monitor
    'monitor.listen': '🎧 Listen',
    'monitor.listening': '🎧 Listening...',

    // Controls
    'btn.start': '▶ Start',
    'btn.stop': '■ Stop',

    // Info
    'info.default': 'Grant microphone permission and press "Start".',
    'info.loading': '{model} loading...',
    'info.active': '{model} AI noise cancellation active.',
    'info.dfLoading': 'DeepFilterNet3 model loading...',
    'info.error': 'Error: {msg}',
    'info.micDenied': 'Microphone access denied.',
    'info.pipeline': 'Mic → NC → {name} → Other apps',
    'info.outputNotVirtual': 'Output: {name} (not a virtual cable)',
    'info.activeNoVirtual': '{model} active — virtual output off.',

    // Donate
    'donate.btn': '💜 Donate',
    'donate.title': 'Support the Developer',
    'donate.network': 'USDT (TRC20 — Tron Network)',
    'donate.copyHint': 'Click address to copy',
    'donate.copied': 'Copied!',

    // Tray (used by main process via IPC)
    'tray.show': 'Show',
    'tray.nc': 'Noise Cancellation',
    'tray.exit': 'Exit',
  },

  tr: {
    // App
    'app.title': 'Denoise AI',

    // Status bar
    'status.ready': 'Hazır',
    'status.active': 'Aktif',
    'status.loading': 'Yükleniyor',
    'status.stopped': 'Durduruldu',

    // AI Model section
    'ai.title': 'AI Model',
    'model.shiguredo': 'Shiguredo RNNoise (Varsayılan)',
    'model.rnnoise': 'RNNoise Sapphi (Düşük Gecikme)',
    'model.deepfilter': 'DeepFilterNet3 (Yüksek Kalite)',
    'ai.architecture': 'Mimari',
    'ai.parameters': 'Parametre',
    'model.loading': 'Model yükleniyor...',

    // DeepFilter settings
    'df.suppression': 'Bastırma',

    // Level meters
    'level.input': 'Giriş',
    'level.output': 'Çıkış',
    'level.noise': 'Gürültü',
    'level.reduction': 'Azaltma:',

    // VAD
    'vad.speech': 'Konuşma',
    'vad.silent': 'Sessiz',

    // Devices
    'device.inputLabel': 'Mikrofon Girişi',
    'device.outputLabel': 'Mikrofon Çıkışı',
    'device.loading': 'Yükleniyor...',
    'device.selectCable': 'Sanal Kablo Seçin...',
    'device.mic': 'Mikrofon {id}',
    'device.virtual': 'Sanal {id}',
    'device.output': 'Çıkış {id}',
    'device.otherOutputs': '── Diğer Çıkışlar ──',

    // Gain
    'gain.label': 'Gain',

    // VB-Cable
    'vbcable.help': 'VB-Cable gerekli. Kurulduktan sonra burada "CABLE Input" görünür.<br>Discord/Zoom\'da mikrofon olarak "CABLE Output" seçin.',

    // Virtual mic status
    'vm.found': '🔌 Sanal kablo bulundu — otomatik seçildi',
    'vm.notFound': '⚠ Sanal kablo bulunamadı — VB-Cable kurun',
    'vm.noCable': 'Sanal kablo seçilmedi',
    'vm.pressStart': '⚠ Önce "Başla" tuşuna basın',
    'vm.active': '✅ Aktif → Discord/Zoom\'da "CABLE Output" seçin',
    'vm.notVirtual': '⚠ "{name}" sanal kablo değil — hoparlörden çıkabilir',
    'vm.noSetSinkId': '❌ setSinkId desteklenmiyor',

    // Monitor
    'monitor.listen': '🎧 Dinle',
    'monitor.listening': '🎧 Dinleniyor...',

    // Controls
    'btn.start': '▶ Başla',
    'btn.stop': '■ Durdur',

    // Info
    'info.default': 'Mikrofon izni verin ve "Başla" tuşuna basın.',
    'info.loading': '{model} yükleniyor...',
    'info.active': '{model} AI gürültü engelleme aktif.',
    'info.dfLoading': 'DeepFilterNet3 model yükleniyor...',
    'info.error': 'Hata: {msg}',
    'info.micDenied': 'Mikrofon erişimi reddedildi.',
    'info.pipeline': 'Mikrofon → NC → {name} → Diğer uygulamalar',
    'info.outputNotVirtual': 'Çıkış: {name} (sanal kablo değil)',
    'info.activeNoVirtual': '{model} aktif — sanal çıkış kapalı.',

    // Donate
    'donate.btn': '💜 Bağış',
    'donate.title': 'Geliştiriciye Destek Ol',
    'donate.network': 'USDT (TRC20 — Tron Ağı)',
    'donate.copyHint': 'Adresi kopyalamak için tıklayın',
    'donate.copied': 'Kopyalandı!',

    // Tray
    'tray.show': 'Göster',
    'tray.nc': 'Gürültü Engelleme',
    'tray.exit': 'Çıkış',
  }
};

class I18n {
  constructor() {
    this.lang = this._detectLanguage();
    this._listeners = [];
  }

  _detectLanguage() {
    const saved = localStorage.getItem('denoise-ai-lang');
    if (saved && translations[saved]) return saved;
    const browserLang = (navigator.language || '').toLowerCase();
    return browserLang.startsWith('tr') ? 'tr' : 'en';
  }

  get currentLang() {
    return this.lang;
  }

  setLanguage(lang) {
    if (!translations[lang] || lang === this.lang) return;
    this.lang = lang;
    localStorage.setItem('denoise-ai-lang', lang);
    this._updateDOM();
    this._listeners.forEach(fn => fn(lang));
  }

  t(key, params = {}) {
    let str = translations[this.lang]?.[key] ?? translations.en[key] ?? key;
    for (const [k, v] of Object.entries(params)) {
      str = str.replaceAll(`{${k}}`, v);
    }
    return str;
  }

  _updateDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const val = this.t(key);
      if (el.hasAttribute('data-i18n-html')) {
        el.innerHTML = val;
      } else {
        el.textContent = val;
      }
    });
    document.documentElement.lang = this.lang === 'tr' ? 'tr' : 'en';
  }

  onChange(fn) {
    this._listeners.push(fn);
  }

  applyInitial() {
    this._updateDOM();
  }
}

window.i18n = new I18n();
