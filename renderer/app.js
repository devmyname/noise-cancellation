/**
 * Denoise AI - Three Model AI Noise Cancellation
 *
 * Model 1: Shiguredo RNNoise - @shiguredo/rnnoise-wasm v2025, ~85K params (default)
 * Model 2: RNNoise (sapphi)  - @sapphi-red/web-noise-suppressor, ~85K params
 * Model 3: DeepFilterNet3    - LSTM stateful, INTERSPEECH 2023, WASM AudioWorklet (high quality)
 *
 * User can select model from within the app.
 */

class DenoiseAIApp {
  constructor() {
    this.audioCtx = null;
    this.stream = null;
    this.shiguredoNode = null;    // Shiguredo RNNoise AudioWorklet
    this.workletNode = null;      // RNNoise (sapphi) AudioWorklet
    this.deepFilterNode = null;   // DeepFilterNet3 AudioWorklet
    this.deepFilterCore = null;   // DeepFilterNet3Core instance
    this.inputAnalyser = null;
    this.outputAnalyser = null;
    this.micGainNode = null;
    this.gainNode = null;
    this.stereoMerger = null;
    this.isRunning = false;
    this.isNCEnabled = true;
    this.outputMode = 'mute';
    this.meterFrame = null;
    this.sourceNode = null;

    // DeepFilter warmup: avoid thin/robotic sound during first seconds after enabling
    this.deepFilterWarmupTimer = null;
    this.deepFilterWarmupNeeded = false;

    // DeepFilter suppression ramping (prevents artifacts when slider moves)
    this._dfSuppressionRampTimer = null;
    this._dfSuppressionCurrent = null;
    this._dfSuppressionTarget = null;

    // Model selection
    this.currentModel = 'shiguredo'; // 'shiguredo' | 'rnnoise' | 'deepfilter'
    // Virtual microphone output
    this.virtualMicDest = null;
    this.virtualMicAudio = null;
    this.virtualStereoMerger = null;

    // Virtual cable output rendering (preferred path when supported)
    this.virtualOutCtx = null;
    this.virtualOutSource = null;

    // Measurement data
    this.inputTimeDomain = null;
    this.smoothInputRMS = 0;
    this.smoothOutputRMS = 0;
    this.noiseFloor = 0.001;
    this.frameCount = 0;

    this.init();
  }

  _clearDeepFilterSuppressionRamp() {
    if (this._dfSuppressionRampTimer) {
      clearInterval(this._dfSuppressionRampTimer);
      this._dfSuppressionRampTimer = null;
    }
  }

  _rampDeepFilterSuppressionTo(target) {
    // Only applicable when DeepFilter is active and core exists
    if (!this.deepFilterCore) return;

    const clampedTarget = Math.max(0, Math.min(100, Math.floor(target)));
    this._dfSuppressionTarget = clampedTarget;

    if (this._dfSuppressionCurrent == null) {
      // Initialize current from UI to avoid jump
      this._dfSuppressionCurrent = parseInt(this.dfLevelSlider?.value ?? String(clampedTarget), 10) || clampedTarget;
    }

    if (this._dfSuppressionRampTimer) return;

    const stepDb = 2;      // dB per tick
    const tickMs = 20;     // ~50 updates/sec

    this._dfSuppressionRampTimer = setInterval(() => {
      if (!this.deepFilterCore) {
        this._clearDeepFilterSuppressionRamp();
        return;
      }

      const cur = this._dfSuppressionCurrent ?? 0;
      const tgt = this._dfSuppressionTarget ?? cur;
      if (cur === tgt) {
        this._clearDeepFilterSuppressionRamp();
        return;
      }

      const diff = tgt - cur;
      const delta = Math.abs(diff) <= stepDb ? diff : Math.sign(diff) * stepDb;
      const next = cur + delta;
      this._dfSuppressionCurrent = next;
      this.deepFilterCore.setSuppressionLevel(next);
    }, tickMs);
  }

  async _stopVirtualMicOutput() {
    // Stop HTMLAudioElement path
    if (this.virtualMicAudio) {
      try {
        this.virtualMicAudio.pause();
      } catch (e) {}
      this.virtualMicAudio.srcObject = null;
    }

    // Stop AudioContext sink path
    if (this.virtualOutSource) {
      try {
        this.virtualOutSource.disconnect();
      } catch (e) {}
      this.virtualOutSource = null;
    }
    if (this.virtualOutCtx) {
      try {
        await this.virtualOutCtx.close();
      } catch (e) {}
      this.virtualOutCtx = null;
    }
  }

  _setModelWarmupVisible(visible) {
    if (!this.modelWarmupEl) return;
    this.modelWarmupEl.style.display = visible ? '' : 'none';
  }

  _clearDeepFilterWarmup() {
    if (this.deepFilterWarmupTimer) {
      clearTimeout(this.deepFilterWarmupTimer);
      this.deepFilterWarmupTimer = null;
    }
  }

  _scheduleDeepFilterEnableAfterWarmup() {
    this._clearDeepFilterWarmup();

    const warmupMs = 5000;
    // Keep UI hint visible during warmup (user reports "thin" until model stabilizes)
    this.setInfo(i18n.t('info.dfLoading'));
    this._setModelWarmupVisible(true);
    this.deepFilterWarmupTimer = setTimeout(() => {
      this.deepFilterWarmupTimer = null;
      if (!this.isRunning) return;
      if (this.currentModel !== 'deepfilter') return;
      if (!this.isNCEnabled) return;
      if (!this.deepFilterWarmupNeeded) return;
      if (!this.micGainNode || !this.deepFilterNode) return;

      try {
        // Warmup done: pre-gain (micGainNode) -> DeepFilter -> output
        this.micGainNode.disconnect();
        this.micGainNode.connect(this.deepFilterNode);
        if (this.deepFilterCore) {
          this.deepFilterCore.setNoiseSuppressionEnabled(true);
        }
        this.deepFilterWarmupNeeded = false;
        this._setModelWarmupVisible(false);
        this.setInfo(i18n.t('info.active', { model: 'DeepFilterNet3' }));
      } catch (err) {
        console.error('DeepFilter warmup routing error:', err);
      }
    }, warmupMs);
  }

  async init() {
    this.cacheElements();
    this.bindEvents();
    await this.loadDevices();
    this._startRenderLoop();
    this.updateModelInfo();
    // Show/hide DeepFilter settings based on model selection
    this.dfSettings.style.display = (this.currentModel === 'deepfilter') ? '' : 'none';

    this._setModelWarmupVisible(false);

    // Microphone gain value
    if (this.micGainSlider && this.micGainValue) {
      const db = parseInt(this.micGainSlider.value, 10) || 0;
      this.micGainValue.textContent = `+${db} dB`;
    }

    // Apply i18n to DOM and set initial dynamic text
    i18n.applyInitial();
    this.setStatus(i18n.t('status.ready'));
    this.setInfo(i18n.t('info.default'));
    this.btnStart.textContent = i18n.t('btn.start');
    this.aiStatus.textContent = i18n.t('status.ready');

    // Set language selector to current language
    if (this.langSelect) {
      this.langSelect.value = i18n.currentLang;
    }

    // Send language to main process for tray menu
    window.denoiseAPI.setLanguage(i18n.currentLang);

    // Listen for language changes to refresh dynamic text
    i18n.onChange((lang) => {
      this._refreshDynamicText();
      window.denoiseAPI.setLanguage(lang);
      if (this.langSelect && this.langSelect.value !== lang) {
        this.langSelect.value = lang;
      }
    });
  }

  _dbToLinear(db) {
    return Math.pow(10, db / 20);
  }

  // ==================== MODEL INFO ====================

  _getModelLabel() {
    return this.currentModel === 'shiguredo' ? 'Shiguredo RNNoise'
      : this.currentModel === 'rnnoise' ? 'RNNoise' : 'DeepFilterNet3';
  }

  updateModelInfo() {
    if (this.currentModel === 'shiguredo') {
      this.aiArch.textContent = 'Shiguredo RNNoise GRU';
      this.aiParams.textContent = '~85.000';
    } else if (this.currentModel === 'rnnoise') {
      this.aiArch.textContent = 'RNNoise GRU (sapphi)';
      this.aiParams.textContent = '~85.000';
    } else {
      this.aiArch.textContent = 'DeepFilterNet3 LSTM';
      this.aiParams.textContent = '~2.000.000';
    }
    this.aiStatus.textContent = this.isRunning ? i18n.t('status.active') : i18n.t('status.ready');
  }

  _refreshDynamicText() {
    // Refresh all dynamic text that isn't covered by data-i18n attributes
    this.updateModelInfo();
    this.btnStart.textContent = this.isRunning ? i18n.t('btn.stop') : i18n.t('btn.start');
    // Update monitor button text based on state
    if (this.monitorBtn) {
      const isMonitoring = this.monitorBtn.classList.contains('active');
      this.monitorBtn.textContent = isMonitoring ? i18n.t('monitor.listening') : i18n.t('monitor.listen');
    }
    if (this.isRunning) {
      this.setStatus(i18n.t('status.active'));
      const modelLabel = this._getModelLabel();
      if (this.currentModel === 'deepfilter' && this.deepFilterWarmupNeeded) {
        this.setInfo(i18n.t('info.dfLoading'));
      } else {
        this.setInfo(i18n.t('info.active', { model: modelLabel }));
      }
      this.aiStatus.textContent = i18n.t('status.active');
      this.aiStatus.style.background = 'rgba(74,222,128,0.2)';
      this.aiStatus.style.color = '#4ade80';
    } else {
      this.setStatus(i18n.t('status.ready'));
      this.setInfo(i18n.t('info.default'));
      this.aiStatus.textContent = i18n.t('status.ready');
      this.aiStatus.style.background = '';
      this.aiStatus.style.color = '';
    }
    // Update dynamically-populated select default options
    const cableOpt = this.outputDeviceSelect.querySelector('option[value=""]');
    if (cableOpt) cableOpt.textContent = i18n.t('device.selectCable');
  }

  cacheElements() {
    // Status
    this.statusDot = document.getElementById('status-dot');
    this.statusText = document.getElementById('status-text');

    // NC toggle
    this.ncToggle = document.getElementById('nc-toggle');

    // AI
    this.aiStatus = document.getElementById('ai-status');
    this.aiArch = document.getElementById('ai-arch');
    this.aiParams = document.getElementById('ai-params');
    this.vadDot = document.getElementById('vad-dot');
    this.vadText = document.getElementById('vad-text');
    this.modelWarmupEl = document.getElementById('model-warmup');

    // Levels
    this.inputLevel = document.getElementById('input-level');
    this.outputLevel = document.getElementById('output-level');
    this.noiseLevel = document.getElementById('noise-level');
    this.inputDb = document.getElementById('input-db');
    this.outputDb = document.getElementById('output-db');
    this.noiseDb = document.getElementById('noise-db');
    this.reductionAmount = document.getElementById('reduction-amount');

    // Devices
    this.micSelect = document.getElementById('mic-select');
    this.monitorBtn = document.getElementById('monitor-btn');

    // Model selection
    this.modelSelect = document.getElementById('model-select');

    // DeepFilter settings
    this.dfSettings = document.getElementById('df-settings');
    this.dfLevelSlider = document.getElementById('df-level');
    this.dfLevelValue = document.getElementById('df-level-value');

    // Microphone gain
    this.micGainSlider = document.getElementById('mic-gain');
    this.micGainValue = document.getElementById('mic-gain-value');

    // Virtual microphone output
    this.outputDeviceSelect = document.getElementById('output-device');
    this.virtualMicHelp = document.getElementById('virtual-mic-help');
    this.virtualMicStatus = document.getElementById('virtual-mic-status');

    // Controls
    this.btnStart = document.getElementById('btn-start');

    // Info
    this.infoText = document.getElementById('info-text');

    // Waveform
    this.waveformCanvas = document.getElementById('waveform-canvas');
    this.waveformCtx = this.waveformCanvas.getContext('2d');

    // Title bar
    this.btnMinimize = document.getElementById('btn-minimize');
    this.btnClose = document.getElementById('btn-close');

    // Language dropdown
    this.langSelect = document.getElementById('lang-select');

    // Donate button
    this.btnDonate = document.getElementById('btn-donate');
  }

  bindEvents() {
    // Title bar
    this.btnMinimize.addEventListener('click', () => window.denoiseAPI.minimize());
    this.btnClose.addEventListener('click', () => window.denoiseAPI.close());

    // Donate
    this._donateTooltip = null;
    this.btnDonate.addEventListener('click', (e) => this._toggleDonateTooltip(e));
    document.addEventListener('click', (e) => {
      if (this._donateTooltip && !this._donateTooltip.contains(e.target) && e.target !== this.btnDonate) {
        this._closeDonateTooltip();
      }
    });

    // Start/Stop
    this.btnStart.addEventListener('click', async () => {
      if (this.isRunning) await this.stopAudio();
      else this.startAudio();
    });

    // NC toggle
    this.ncToggle.addEventListener('change', (e) => {
      this.isNCEnabled = e.target.checked;
      this.updateNCRouting();
      window.denoiseAPI.sendNCStatus(this.isNCEnabled);
    });

    // Monitor (self-listening through headphones)
    this.monitorBtn.addEventListener('click', () => {
      const isActive = this.monitorBtn.classList.contains('active');
      if (isActive) {
        this.monitorBtn.classList.remove('active');
        this.monitorBtn.textContent = i18n.t('monitor.listen');
        this.outputMode = 'mute';
      } else {
        this.monitorBtn.classList.add('active');
        this.monitorBtn.textContent = i18n.t('monitor.listening');
        this.outputMode = 'monitor';
      }
      if (this.gainNode) {
        this.gainNode.gain.value = this.outputMode === 'monitor' ? 1.0 : 0.0;
      }
    });

    // Microphone gain slider
    if (this.micGainSlider) {
      this.micGainSlider.addEventListener('input', (e) => {
        const db = parseInt(e.target.value, 10) || 0;
        if (this.micGainValue) {
          this.micGainValue.textContent = `+${db} dB`;
        }
        if (this.micGainNode) {
          this.micGainNode.gain.value = this._dbToLinear(db);
        }
      });
    }

    // Microphone change
    this.micSelect.addEventListener('change', async () => {
      if (this.isRunning) {
        await this.stopAudio();
        setTimeout(() => this.startAudio(), 300);
      }
    });

    // Model change
    this.modelSelect.addEventListener('change', async (e) => {
      const newModel = e.target.value;
      if (newModel === this.currentModel) return;
      const wasRunning = this.isRunning;
      if (wasRunning) await this.stopAudio();
      this.currentModel = newModel;
      this.updateModelInfo();
      // Show/hide DeepFilter settings panel
      this.dfSettings.style.display = (newModel === 'deepfilter') ? '' : 'none';
      this._setModelWarmupVisible(false);
      if (wasRunning) setTimeout(() => this.startAudio(), 300);
    });

    // DeepFilter suppression level slider
    this.dfLevelSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.dfLevelValue.textContent = val;
      if (this.deepFilterCore) {
        this._rampDeepFilterSuppressionTo(val);
      }
    });

    // Virtual microphone output device
    this.outputDeviceSelect.addEventListener('change', (e) => {
      this._updateVirtualMicOutput(e.target.value);
    });

    // NC toggle from system tray
    window.denoiseAPI.onToggleNC((val) => {
      this.isNCEnabled = val;
      this.ncToggle.checked = val;
      this.updateNCRouting();
    });

    // Language selector (dropdown)
    if (this.langSelect) {
      this.langSelect.addEventListener('change', (e) => {
        const newLang = e.target.value;
        if (newLang && newLang !== i18n.currentLang) {
          i18n.setLanguage(newLang);
        }
      });
    }
  }

  // ==================== NC ROUTING ====================

  updateNCRouting() {
    if (!this.isRunning || !this.micGainNode) return;

    try {
      this.micGainNode.disconnect();

      const ncNode = this.currentModel === 'rnnoise' ? this.workletNode
        : this.currentModel === 'shiguredo' ? this.shiguredoNode
        : this.deepFilterNode;

      if (this.isNCEnabled && ncNode) {
        // DeepFilter: first seconds can sound thin while warming up
        if (this.currentModel === 'deepfilter' && this.deepFilterWarmupNeeded) {
          this.micGainNode.connect(this.outputAnalyser);
          if (this.deepFilterCore) {
            this.deepFilterCore.setNoiseSuppressionEnabled(false);
          }
          this._setModelWarmupVisible(true);
          this._scheduleDeepFilterEnableAfterWarmup();
        } else {
          // NC on: input -> model node -> output
          this.micGainNode.connect(ncNode);
          if (this.deepFilterCore) {
            this.deepFilterCore.setNoiseSuppressionEnabled(true);
          }
          this._setModelWarmupVisible(false);
        }
      } else {
        // NC off: input -> direct output (bypass)
        this.micGainNode.connect(this.outputAnalyser);
        // DeepFilterNet3 bypass notification
        if (this.deepFilterCore) {
          this.deepFilterCore.setNoiseSuppressionEnabled(false);
        }
        this._setModelWarmupVisible(false);
      }

    } catch (err) {
      console.error('NC routing error:', err);
    }
  }

  // ==================== AUDIO DEVICES ====================

  async loadDevices() {
    let permStream = null;
    try {
      // Request permission so device labels are available, then immediately stop.
      // Not stopping can keep the mic active and hold resources for hours.
      permStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter(d => d.kind === 'audioinput');

      this.micSelect.innerHTML = '';
      mics.forEach(mic => {
        const opt = document.createElement('option');
        opt.value = mic.deviceId;
        opt.textContent = mic.label || i18n.t('device.mic', { id: mic.deviceId.slice(0, 4) });
        this.micSelect.appendChild(opt);
      });

      // List output devices (for virtual microphone output)
      const outputs = devices.filter(d => d.kind === 'audiooutput');
      this.outputDeviceSelect.innerHTML = `<option value="">${i18n.t('device.selectCable')}</option>`;

      // Find virtual cable devices and add them first
      const virtualCableRegex = /cable|virtual|vb-audio|voicemeeter|blackhole|soundflower/i;
      const virtualDevices = outputs.filter(d => virtualCableRegex.test(d.label));
      const regularDevices = outputs.filter(d => !virtualCableRegex.test(d.label));

      if (virtualDevices.length > 0) {
        virtualDevices.forEach(dev => {
          const opt = document.createElement('option');
          opt.value = dev.deviceId;
          opt.textContent = '🔌 ' + (dev.label || i18n.t('device.virtual', { id: dev.deviceId.slice(0, 4) }));
          opt.classList.add('virtual-cable-option');
          this.outputDeviceSelect.appendChild(opt);
        });
        // Auto-select first virtual cable device
        this.outputDeviceSelect.value = virtualDevices[0].deviceId;
        this.virtualMicHelp.style.display = 'none';
        this._setVirtualMicStatus(i18n.t('vm.found'), 'connected');
      } else {
        this.virtualMicHelp.style.display = '';
        this._setVirtualMicStatus(i18n.t('vm.notFound'), 'warning');
      }

      // Also add other output devices (for advanced users)
      if (regularDevices.length > 0) {
        const sep = document.createElement('option');
        sep.disabled = true;
        sep.textContent = i18n.t('device.otherOutputs');
        this.outputDeviceSelect.appendChild(sep);
        regularDevices.forEach(dev => {
          const opt = document.createElement('option');
          opt.value = dev.deviceId;
          opt.textContent = dev.label || i18n.t('device.output', { id: dev.deviceId.slice(0, 4) });
          this.outputDeviceSelect.appendChild(opt);
        });
      }
    } catch (err) {
      this.setInfo(i18n.t('info.micDenied'));
      console.error('Device enumeration failed:', err);
    } finally {
      if (permStream) {
        try {
          permStream.getTracks().forEach(t => t.stop());
        } catch (e) {}
      }
    }
  }

  // ==================== AUDIO PIPELINE ====================

  async startAudio() {
    try {
      const modelLabel = this._getModelLabel();
      this.setInfo(i18n.t('info.loading', { model: modelLabel }));
      this.statusDot.classList.add('processing');
      this.setStatus(i18n.t('status.loading'));

      this.audioCtx = new AudioContext({
        sampleRate: 48000,
        latencyHint: 'interactive'
      });

      // Activate AudioContext (autoplay policy)
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }


      const constraints = {
        audio: {
          deviceId: this.micSelect.value ? { exact: this.micSelect.value } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
          channelCount: 1,
          latency: 0
        }
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.sourceNode = this.audioCtx.createMediaStreamSource(this.stream);

      // ---- Analyser (input) ----
      this.inputAnalyser = this.audioCtx.createAnalyser();
      this.inputAnalyser.fftSize = 2048;
      this.inputAnalyser.smoothingTimeConstant = 0.3;

      // ---- Analyser (output) ----
      this.outputAnalyser = this.audioCtx.createAnalyser();
      this.outputAnalyser.fftSize = 2048;
      this.outputAnalyser.smoothingTimeConstant = 0.3;

      // ---- Gain ----
      // Microphone gain: applied BEFORE noise cancellation (pre-gain)
      this.micGainNode = this.audioCtx.createGain();
      const micGainDb = (this.micGainSlider ? (parseInt(this.micGainSlider.value, 10) || 0) : 0);
      this.micGainNode.gain.value = this._dbToLinear(micGainDb);

      // Monitor gain: only enables/disables self-listening through headphones
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = this.outputMode === 'monitor' ? 1.0 : 0.0;

      // ---- Stereo Merger (mono -> stereo to both headphone channels) ----
      // ChannelMergerNode(2) explicitly copies mono signal to both L and R channels
      this.stereoMerger = this.audioCtx.createChannelMerger(2);

      // ---- Model-specific pipeline ----
      if (this.currentModel === 'shiguredo') {
        await this._setupShiguredo();
      } else if (this.currentModel === 'rnnoise') {
        await this._setupRNNoise();
      } else {
        await this._setupDeepFilter();
      }

      // ---- Common connection: source -> inputAnalyser ----
      this.sourceNode.connect(this.inputAnalyser);

      // Pre-gain: inputAnalyser -> micGain
      this.inputAnalyser.connect(this.micGainNode);

      // ---- NC routing: inputAnalyser -> NC node ----
      const ncNode = this.currentModel === 'rnnoise' ? this.workletNode
        : this.currentModel === 'shiguredo' ? this.shiguredoNode
        : this.deepFilterNode;
      if (this.isNCEnabled && ncNode) {
        if (this.currentModel === 'deepfilter' && this.deepFilterWarmupNeeded) {
          // During warmup, keep raw audio; enable DeepFilter after a short delay.
          this.micGainNode.connect(this.outputAnalyser);
          if (this.deepFilterCore) {
            this.deepFilterCore.setNoiseSuppressionEnabled(false);
          }
          this._setModelWarmupVisible(true);
          this._scheduleDeepFilterEnableAfterWarmup();
        } else {
          this.micGainNode.connect(ncNode);
          this._setModelWarmupVisible(false);
        }
      } else {
        this.micGainNode.connect(this.outputAnalyser);
        this._setModelWarmupVisible(false);
      }

      // ---- Output chain: outputAnalyser -> monitorGain -> stereoMerger -> destination ----
      this.outputAnalyser.connect(this.gainNode);
      // Copy mono signal to both channels (L + R headphone)
      this.gainNode.connect(this.stereoMerger, 0, 0); // mono -> left channel
      this.gainNode.connect(this.stereoMerger, 0, 1); // mono -> right channel
      this.stereoMerger.connect(this.audioCtx.destination);

      // ---- Virtual mic output: outputAnalyser -> stereo -> MediaStreamDestination ----
      // Processed audio is converted to MediaStream here and
      // routed to the virtual cable's input side via setSinkId().
      // Other apps (Discord/Zoom) select the cable's output side as their microphone.
      this.virtualMicDest = this.audioCtx.createMediaStreamDestination();
      // Mono -> Stereo: fill both channels (fixes left-channel-only issue)
      this.virtualStereoMerger = this.audioCtx.createChannelMerger(2);
      this.outputAnalyser.connect(this.virtualStereoMerger, 0, 0); // mono -> left
      this.outputAnalyser.connect(this.virtualStereoMerger, 0, 1); // mono -> right
      this.virtualStereoMerger.connect(this.virtualMicDest);
      if (this.outputDeviceSelect.value) {
        await this._updateVirtualMicOutput(this.outputDeviceSelect.value);
      }

      // ---- Measurement buffers ----
      this.inputTimeDomain = new Float32Array(this.inputAnalyser.fftSize);
      this.noiseFloor = 0.001;
      this.frameCount = 0;
      this.smoothInputRMS = 0;
      this.smoothOutputRMS = 0;

      // ---- Update state ----
      this.isRunning = true;
      window.denoiseAPI.sendAudioRunning(true);
      this.btnStart.textContent = i18n.t('btn.stop');
      this.btnStart.classList.add('active');
      this.statusDot.classList.remove('processing');
      this.statusDot.classList.add('active');
      this.setStatus(i18n.t('status.active'));
      this.updateModelInfo();

      this.aiStatus.textContent = i18n.t('status.active');
      this.aiStatus.style.background = 'rgba(74,222,128,0.2)';
      this.aiStatus.style.color = '#4ade80';

      // If DeepFilter is still warming up, keep the loading message visible.
      if (this.currentModel === 'deepfilter' && this.isNCEnabled && this.deepFilterWarmupNeeded) {
        this.setInfo(i18n.t('info.dfLoading'));
        this._setModelWarmupVisible(true);
      } else {
        this.setInfo(i18n.t('info.active', { model: modelLabel }));
        this._setModelWarmupVisible(false);
      }
      window.denoiseAPI.sendNCStatus(this.isNCEnabled);

      // Metering: unified render loop already started in init

    } catch (err) {
      console.error('Audio start failed:', err);
      this.setInfo(i18n.t('info.error', { msg: err.message }));
      this.statusDot.classList.remove('processing');
      // Clean up on error
      if (this.audioCtx || this.stream) {
        await this.stopAudio();
      }
    }
  }

  // ==================== SHIGUREDO RNNOISE PIPELINE ====================

  async _setupShiguredo() {
    const wasmResp = await fetch('worklets/shiguredo_rnnoise.wasm');
    const wasmBinary = await wasmResp.arrayBuffer();

    // Compile WASM module on main thread (async, no size limit)
    const wasmModule = await WebAssembly.compile(wasmBinary);

    await this.audioCtx.audioWorklet.addModule('worklets/shiguredo-rnnoise-processor.js');

    this.shiguredoNode = new AudioWorkletNode(
      this.audioCtx,
      'shiguredo-rnnoise',
      {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
        processorOptions: {
          wasmModule: wasmModule,
          wasmBinary: wasmBinary
        }
      }
    );

    // shiguredoNode -> outputAnalyser connection
    this.shiguredoNode.connect(this.outputAnalyser);
  }

  // ==================== RNNOISE PIPELINE ====================

  async _setupRNNoise() {
    // Check SIMD support
    const simdSupported = await WebAssembly.validate(new Uint8Array([
      0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11
    ]));
    const wasmFile = simdSupported ? 'worklets/rnnoise_simd.wasm' : 'worklets/rnnoise.wasm';

    const wasmResp = await fetch(wasmFile);
    const wasmBinary = await wasmResp.arrayBuffer();

    await this.audioCtx.audioWorklet.addModule('worklets/rnnoise-processor.js');

    this.workletNode = new AudioWorkletNode(
      this.audioCtx,
      '@sapphi-red/web-noise-suppressor/rnnoise',
      {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
        processorOptions: {
          wasmBinary: wasmBinary,
          maxChannels: 1
        }
      }
    );

    // workletNode -> outputAnalyser connection
    this.workletNode.connect(this.outputAnalyser);
  }

  // ==================== DEEPFILTERNET3 PIPELINE ====================

  async _setupDeepFilter() {
    // Create DeepFilterNet3Core instance (48kHz native, no resampling needed)
    // attenLim: taken from slider value (default 80)
    const attenLim = parseInt(this.dfLevelSlider.value, 10) || 80;
    this.deepFilterCore = new window.DeepFilterNet3Core({
      sampleRate: 48000,
      attenLim: attenLim
    });

    // Load WASM and model files from local files (no CDN required)
    this.setInfo(i18n.t('info.dfLoading'));
    await this.deepFilterCore.initialize();

    // Create AudioWorklet node (worklet registered via inline blob URL)
    this.deepFilterNode = await this.deepFilterCore.createAudioWorkletNode(this.audioCtx);
    // Mark warmup needed on every new DeepFilter instance
    this.deepFilterWarmupNeeded = true;

    // deepFilterNode -> outputAnalyser connection
    this.deepFilterNode.connect(this.outputAnalyser);
  }

  async stopAudio() {
    this._clearDeepFilterWarmup();
    this._clearDeepFilterSuppressionRamp();
    this.deepFilterWarmupNeeded = false;
    window.denoiseAPI.sendAudioRunning(false);
    // Shiguredo RNNoise cleanup
    if (this.shiguredoNode) {
      try { this.shiguredoNode.port.postMessage('destroy'); } catch(e) {}
    }
    // RNNoise cleanup
    if (this.workletNode) {
      try { this.workletNode.port.postMessage('destroy'); } catch(e) {}
    }
    // DeepFilterNet3 cleanup
    if (this.deepFilterCore) {
      this.deepFilterCore.destroy();
      this.deepFilterCore = null;
    }

    // Virtual microphone cleanup (await to ensure resources freed before closing main context)
    await this._stopVirtualMicOutput();
    this.virtualMicDest = null;
    this.virtualStereoMerger = null;

    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.audioCtx) {
      await this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.shiguredoNode = null;
    this.workletNode = null;
    this.deepFilterNode = null;
    this.sourceNode = null;
    this.inputAnalyser = null;
    this.outputAnalyser = null;
    this.micGainNode = null;
    this.gainNode = null;
    this.stereoMerger = null;
    this.isRunning = false;

    // Render loop stops automatically via isRunning=false check.

    this.btnStart.textContent = i18n.t('btn.start');
    this.btnStart.classList.remove('active');
    this.statusDot.classList.remove('active', 'processing');
    this.setStatus(i18n.t('status.stopped'));
    this.setInfo(i18n.t('info.default'));

    this.updateModelInfo();
    this.aiStatus.style.background = '';
    this.aiStatus.style.color = '';

    this._setModelWarmupVisible(false);

    this.resetMeters();
  }

  // ==================== VIRTUAL MICROPHONE ====================

  async _updateVirtualMicOutput(deviceId) {
    try {
      if (!deviceId) {
        // Virtual microphone disabled
        await this._stopVirtualMicOutput();
        this._setVirtualMicStatus(i18n.t('vm.noCable'), '');
        if (this.isRunning) {
          const modelLabel = this._getModelLabel();
          this.setInfo(i18n.t('info.activeNoVirtual', { model: modelLabel }));
        }
        return;
      }

      if (!this.virtualMicDest) {
        this._setVirtualMicStatus(i18n.t('vm.pressStart'), 'warning');
        return;
      }

      // Prefer AudioContext.setSinkId() when available (often lower buffering than HTMLAudioElement)
      const canUseSinkCtx = (typeof AudioContext !== 'undefined') &&
        (typeof AudioContext.prototype.setSinkId === 'function');

      if (canUseSinkCtx) {
        try {
          if (!this.virtualOutCtx) {
            this.virtualOutCtx = new AudioContext({
              sampleRate: 48000,
              latencyHint: 'interactive'
            });
          }
          if (this.virtualOutCtx.state === 'suspended') {
            await this.virtualOutCtx.resume();
          }
          await this.virtualOutCtx.setSinkId(deviceId);

          if (!this.virtualOutSource) {
            this.virtualOutSource = this.virtualOutCtx.createMediaStreamSource(this.virtualMicDest.stream);
            this.virtualOutSource.connect(this.virtualOutCtx.destination);
          }

          // Make sure HTMLAudioElement path is stopped to avoid double-output
          if (this.virtualMicAudio) {
            try { this.virtualMicAudio.pause(); } catch (e) {}
            this.virtualMicAudio.srcObject = null;
          }

          const selectedOption = this.outputDeviceSelect.selectedOptions[0];
          const deviceName = selectedOption ? selectedOption.textContent.replace('🔌 ', '') : deviceId;
          const isVirtualCable = /cable|virtual|vb-audio|voicemeeter/i.test(deviceName);
          if (isVirtualCable) {
            this._setVirtualMicStatus(i18n.t('vm.active'), 'connected');
            this.setInfo(i18n.t('info.pipeline', { name: deviceName }));
          } else {
            this._setVirtualMicStatus(i18n.t('vm.notVirtual', { name: deviceName }), 'warning');
            this.setInfo(i18n.t('info.outputNotVirtual', { name: deviceName }));
          }

          return;
        } catch (e) {
          console.warn('[virtual-mic] AudioContext.setSinkId failed, falling back to HTMLAudioElement:', e);
          await this._stopVirtualMicOutput();
        }
      }

      if (!this.virtualMicAudio) {
        this.virtualMicAudio = document.createElement('audio');
        this.virtualMicAudio.autoplay = true;
      }

      this.virtualMicAudio.srcObject = this.virtualMicDest.stream;

      if (typeof this.virtualMicAudio.setSinkId === 'function') {
        await this.virtualMicAudio.setSinkId(deviceId);
        await this.virtualMicAudio.play();
        const selectedOption = this.outputDeviceSelect.selectedOptions[0];
        const deviceName = selectedOption ? selectedOption.textContent.replace('🔌 ', '') : deviceId;

        // Virtual cable stream info
        const isVirtualCable = /cable|virtual|vb-audio|voicemeeter/i.test(deviceName);
        if (isVirtualCable) {
          this._setVirtualMicStatus(i18n.t('vm.active'), 'connected');
          this.setInfo(i18n.t('info.pipeline', { name: deviceName }));
        } else {
          this._setVirtualMicStatus(i18n.t('vm.notVirtual', { name: deviceName }), 'warning');
          this.setInfo(i18n.t('info.outputNotVirtual', { name: deviceName }));
        }

      } else {
        this._setVirtualMicStatus(i18n.t('vm.noSetSinkId'), 'error');
        console.warn('setSinkId not available');
      }
    } catch (err) {
      console.error('Virtual mic output error:', err);
      this._setVirtualMicStatus(`❌ ${err.message}`, 'error');
    }
  }

  _setVirtualMicStatus(text, className) {
    if (!this.virtualMicStatus) return;
    this.virtualMicStatus.textContent = text;
    this.virtualMicStatus.className = 'virtual-mic-status';
    if (className) this.virtualMicStatus.classList.add(className);
  }

  // ==================== METERING ====================
  // Metering is now done in the unified render loop (_startRenderLoop).

  updateUI(inputRMS, outputRMS, noiseLevel, isVoice) {
    // Input level
    const inDb = inputRMS > 1e-6 ? 20 * Math.log10(inputRMS) : -100;
    const inPct = Math.max(0, Math.min(100, (inDb + 60) / 60 * 100));
    this.inputLevel.style.width = inPct + '%';
    this.inputDb.textContent = inDb > -95 ? inDb.toFixed(1) + ' dB' : '-∞ dB';

    // Output level
    const outDb = outputRMS > 1e-6 ? 20 * Math.log10(outputRMS) : -100;
    const outPct = Math.max(0, Math.min(100, (outDb + 60) / 60 * 100));
    this.outputLevel.style.width = outPct + '%';
    this.outputDb.textContent = outDb > -95 ? outDb.toFixed(1) + ' dB' : '-∞ dB';

    // Noise level
    const nDb = noiseLevel > 1e-6 ? 20 * Math.log10(noiseLevel) : -100;
    const nPct = Math.max(0, Math.min(100, (nDb + 60) / 60 * 100));
    this.noiseLevel.style.width = nPct + '%';
    this.noiseDb.textContent = nDb > -95 ? nDb.toFixed(1) + ' dB' : '--';

    // Reduction
    const reduction = inDb - outDb;
    if (reduction > 0.5 && inputRMS > 0.001) {
      this.reductionAmount.textContent = reduction.toFixed(1) + ' dB';
    } else {
      this.reductionAmount.textContent = '-- dB';
    }

    // VAD
    if (isVoice) {
      this.vadDot.classList.add('active');
      this.vadText.textContent = i18n.t('vad.speech');
    } else {
      this.vadDot.classList.remove('active');
      this.vadText.textContent = i18n.t('vad.silent');
    }
  }

  resetMeters() {
    this.inputLevel.style.width = '0%';
    this.outputLevel.style.width = '0%';
    this.noiseLevel.style.width = '0%';
    this.inputDb.textContent = '-∞ dB';
    this.outputDb.textContent = '-∞ dB';
    this.noiseDb.textContent = '--';
    this.reductionAmount.textContent = '-- dB';
    this.vadDot.classList.remove('active');
    this.vadText.textContent = '--';
  }

  // ==================== HELPERS ====================

  setStatus(text) {
    this.statusText.textContent = text;
  }

  setInfo(text) {
    this.infoText.textContent = text;
  }

  // ==================== UNIFIED RENDER LOOP ====================
  // Waveform + metering run in a single rAF loop.
  // Pauses when window is hidden (minimized to tray) to save CPU.

  _startRenderLoop() {
    const canvas = this.waveformCanvas;
    const ctx = this.waveformCtx;
    const w = canvas.width;
    const h = canvas.height;
    const waveData = new Float32Array(2048);
    const mid = h / 2;
    const step = Math.ceil(waveData.length / w);

    // Pause loop when window is hidden
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !this.meterFrame) {
        this.meterFrame = requestAnimationFrame(tick);
      }
    });

    const tick = () => {
      // Skip rendering when window is hidden to save CPU
      if (document.hidden) {
        this.meterFrame = null;
        return;
      }
      this.meterFrame = requestAnimationFrame(tick);

      // ---- Waveform drawing ----
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(0, 0, w, h);

      const hasOutput = this.outputAnalyser != null;
      if (hasOutput) {
        this.outputAnalyser.getFloatTimeDomainData(waveData);
      }

      ctx.beginPath();
      ctx.strokeStyle = '#7c3aed';
      ctx.lineWidth = 1.5;
      for (let x = 0; x < w; x++) {
        const v = hasOutput ? (waveData[x * step] || 0) : 0;
        const y = mid + v * mid * 3;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(124, 58, 237, 0.15)';
      ctx.lineWidth = 0.5;
      ctx.moveTo(0, mid);
      ctx.lineTo(w, mid);
      ctx.stroke();

      // ---- Metering (only when audio is active) ----
      if (!this.isRunning || !this.inputAnalyser || !this.outputAnalyser) return;

      this.inputAnalyser.getFloatTimeDomainData(this.inputTimeDomain);
      let inSum = 0;
      for (let i = 0; i < this.inputTimeDomain.length; i++) {
        const s = this.inputTimeDomain[i];
        inSum += s * s;
      }
      const inputRMS = Math.sqrt(inSum / this.inputTimeDomain.length);

      // Output RMS: waveData was already read from outputAnalyser, no need to read again
      let outSum = 0;
      for (let i = 0; i < waveData.length; i++) {
        const s = waveData[i] || 0;
        outSum += s * s;
      }
      const outputRMS = Math.sqrt(outSum / waveData.length);

      const alpha = 0.15;
      this.smoothInputRMS = alpha * inputRMS + (1 - alpha) * this.smoothInputRMS;
      this.smoothOutputRMS = alpha * outputRMS + (1 - alpha) * this.smoothOutputRMS;

      this.frameCount++;
      if (this.frameCount > 20) {
        if (this.smoothOutputRMS < this.smoothInputRMS * 0.3 && inputRMS > 0.001) {
          this.noiseFloor = 0.95 * this.noiseFloor + 0.05 * this.smoothInputRMS;
        } else if (this.smoothInputRMS < 0.005) {
          this.noiseFloor = 0.98 * this.noiseFloor + 0.02 * this.smoothInputRMS;
        }
      }

      const vadThreshold = 0.008;
      const isVoice = this.smoothOutputRMS > vadThreshold && this.isNCEnabled;
      this.updateUI(this.smoothInputRMS, this.smoothOutputRMS, this.noiseFloor, isVoice);
    };

    this.meterFrame = requestAnimationFrame(tick);
  }

  /* ── Donate Tooltip ── */

  _toggleDonateTooltip(e) {
    if (this._donateTooltip) { this._closeDonateTooltip(); return; }

    const USDT_ADDRESS = 'TLApWJzFVDTDHLtSL18atRuzhEgjzirtAZ';
    const t = window.i18n.t.bind(window.i18n);

    const tip = document.createElement('div');
    tip.className = 'donate-tooltip';
    tip.innerHTML = `
      <div class="donate-title">${t('donate.title')}</div>
      <div style="margin-bottom:4px;">${t('donate.network')}</div>
      <code class="donate-address" id="donate-addr">${USDT_ADDRESS}</code>
      <div class="donate-copy-hint" id="donate-hint">${t('donate.copyHint')}</div>
    `;

    document.body.appendChild(tip);

    // Position below the button
    const rect = this.btnDonate.getBoundingClientRect();
    tip.style.top = (rect.bottom + 6) + 'px';
    tip.style.right = (window.innerWidth - rect.right) + 'px';

    // Copy on click
    tip.querySelector('#donate-addr').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(USDT_ADDRESS);
        const hint = tip.querySelector('#donate-hint');
        hint.textContent = t('donate.copied');
        hint.classList.add('donate-copied');
        setTimeout(() => {
          hint.textContent = t('donate.copyHint');
          hint.classList.remove('donate-copied');
        }, 2000);
      } catch (_) { /* clipboard not available */ }
    });

    this._donateTooltip = tip;
  }

  _closeDonateTooltip() {
    if (this._donateTooltip) {
      this._donateTooltip.remove();
      this._donateTooltip = null;
    }
  }
}

// Application startup
document.addEventListener('DOMContentLoaded', () => {
  new DenoiseAIApp();
});
