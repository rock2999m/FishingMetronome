// ========================================
// タイラバメトロノーム - メインアプリケーション
// ========================================

class TiravaMetronome {
    constructor() {
        // 状態管理
        this.isPlaying = false;
        this.currentRpm = 60;
        this.reelRetrieve = 75; // cm
        this.boatSpeed = 0; // m/s
        this.targetSpeed = 1.0; // m/s
        this.indicatorMinSpeed = 0.2; // m/s
        this.indicatorMaxSpeed = 3.0; // m/s
        this.controlMode = 'fixed'; // fixed | variable
        this.volumeLevel = 20; // 20%を現行基準
        this.audioEngine = 'webaudio'; // webaudio | htmlaudio
        this.toneVariant = 'sharp'; // sharp | soft | beep | wood | bell
        
        // Web Audio API
        this.audioContext = null;
        this.mediaStreamDestination = null;
        this.audioElement = null;
        this.masterGain = null;
        this.clickSource = null;
        this.clickLoopUrl = null;
        
        // スケジューラ
        this.nextNoteTime = 0;
        this.scheduleAheadTime = 0.03; // 30ms前にスケジュール
        this.lookAhead = 20.0; // 20msごとにチェック
        this.schedulerID = null;
        
        // Wake Lock
        this.wakeLock = null;
        
        // DOM要素
        this.elements = {
            currentRpm: document.getElementById('currentRpm'),
            lureSpeed: document.getElementById('lureSpeed'),
            playBtn: document.getElementById('playBtn'),
            increaseBtn: document.getElementById('increaseBtn'),
            decreaseBtn: document.getElementById('decreaseBtn'),
            fixedModeBtn: document.getElementById('fixedModeBtn'),
            variableModeBtn: document.getElementById('variableModeBtn'),
            reelRetrieve: document.getElementById('reelRetrieve'),
            boatSpeed: document.getElementById('boatSpeed'),
            boatSpeedIncreaseBtn: document.getElementById('boatSpeedIncreaseBtn'),
            boatSpeedDecreaseBtn: document.getElementById('boatSpeedDecreaseBtn'),
            targetSpeed: document.getElementById('targetSpeed'),
            targetSpeedIncreaseBtn: document.getElementById('targetSpeedIncreaseBtn'),
            targetSpeedDecreaseBtn: document.getElementById('targetSpeedDecreaseBtn'),
            presetName: document.getElementById('presetName'),
            savePresetBtn: document.getElementById('savePresetBtn'),
            presetList: document.getElementById('presetList'),
            audioElement: document.getElementById('audioElement'),
            setBtn: document.getElementById('setBtn'),
            indicatorMarker: document.getElementById('indicatorMarker'),
            indicatorMinLabel: document.getElementById('indicatorMinLabel'),
            indicatorMaxLabel: document.getElementById('indicatorMaxLabel'),
            settingsBtn: document.getElementById('settingsBtn'),
            settingsModal: document.getElementById('settingsModal'),
            closeSettingsBtn: document.getElementById('closeSettingsBtn'),
            indicatorMin: document.getElementById('indicatorMin'),
            indicatorMax: document.getElementById('indicatorMax'),
            indicatorResetBtn: document.getElementById('indicatorResetBtn'),
            volumeLevel: document.getElementById('volumeLevel'),
            volumeLabel: document.getElementById('volumeLabel'),
            audioEngine: document.getElementById('audioEngine'),
            toneVariant: document.getElementById('toneVariant'),
            tipsBtn: document.getElementById('tipsBtn'),
            tipsModal: document.getElementById('tipsModal'),
            closeTipsBtn: document.getElementById('closeTipsBtn')
        };
        
        this.init();
    }

    init() {
        this.setupAudioContext();
        this.attachEventListeners();
        this.attachSettingsListeners();
        this.attachTipsListeners();
        this.loadPresets();
        this.loadIndicatorSettings();
        this.loadControlMode();
        this.loadAudioSettings();
        this.updateDisplay();
        this.requestWakeLock();

        // Safari復帰時の再生復旧
        window.addEventListener('pageshow', () => this.resumeAudioIfNeeded());
        window.addEventListener('focus', () => this.resumeAudioIfNeeded());
    }

    // ========================================
    // Web Audio APIの初期化
    // ========================================
    setupAudioContext() {
        if (this.audioContext) return;

        // AudioContextの作成（最初のユーザー操作時に起動）
        const initAudio = () => {
            if (this.audioContext) return;

            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.mediaStreamDestination = this.audioContext.createMediaStreamDestination();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.connect(this.mediaStreamDestination);
            this.applyVolumeSetting();

            if (this.audioEngine === 'webaudio') {
                this.attachMediaStream();
            }

            // Media Session APIの設定
            this.setupMediaSession();

            document.removeEventListener('touchstart', initAudio);
            document.removeEventListener('click', initAudio);
        };

        document.addEventListener('touchstart', initAudio, { once: true });
        document.addEventListener('click', initAudio, { once: true });
    }

    // ========================================
    // Media Session API設定
    // ========================================
    setupMediaSession() {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('play', () => this.play());
            navigator.mediaSession.setActionHandler('pause', () => this.stop());
            this.updateMediaSession();
        }
    }

    updateMediaSession() {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: 'タイラバメトロノーム',
                artist: `${this.currentRpm} RPM`,
                album: `ルアー速度: ${this.calculateLureSpeed().toFixed(2)} m/s`,
                artwork: [
                    {
                        src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><circle cx="96" cy="96" r="90" fill="%23FFD700"/></svg>',
                        sizes: '192x192',
                        type: 'image/svg+xml'
                    }
                ]
            });
        }
    }

    // ========================================
    // Wake Lock API
    // ========================================
    async requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                this.wakeLock = await navigator.wakeLock.request('screen');
                this.updateStatus('Wake Lock取得成功');
            } catch (err) {
                console.warn('Wake Lock request failed:', err);
                this.updateStatus('Wake Lock非対応');
            }
        }
    }

    async releaseWakeLock() {
        if (this.wakeLock) {
            try {
                await this.wakeLock.release();
                this.wakeLock = null;
            } catch (err) {
                console.warn('Wake Lock release failed:', err);
            }
        }
    }

    // ========================================
    // イベントリスナー
    // ========================================
    attachEventListeners() {
        // 再生・停止
        this.elements.playBtn.addEventListener('click', () => this.togglePlayback());

        // モード切り替え
        this.elements.fixedModeBtn.addEventListener('click', () => this.setControlMode('fixed'));
        this.elements.variableModeBtn.addEventListener('click', () => this.setControlMode('variable'));

        this.elements.increaseBtn.addEventListener('click', () => this.adjustRpm(5));
        this.elements.decreaseBtn.addEventListener('click', () => this.adjustRpm(-5));
        this.elements.setBtn.addEventListener('click', () => this.setRpmFromTargetSpeed());

        // 船速制御
        this.elements.boatSpeedIncreaseBtn.addEventListener('click', () => this.adjustBoatSpeed(0.1));
        this.elements.boatSpeedDecreaseBtn.addEventListener('click', () => this.adjustBoatSpeed(-0.1));
        this.elements.targetSpeedIncreaseBtn.addEventListener('click', () => this.adjustTargetSpeed(0.1));
        this.elements.targetSpeedDecreaseBtn.addEventListener('click', () => this.adjustTargetSpeed(-0.1));

        // 入力値変更
        this.elements.reelRetrieve.addEventListener('change', (e) => {
            this.reelRetrieve = parseFloat(e.target.value) || 75;
            if (this.controlMode === 'variable') {
                this.autoAdjustRpm('巻き取り量変更');
            }
            this.updateDisplay();
        });

        this.elements.boatSpeed.addEventListener('change', (e) => {
            const kmh = parseFloat(e.target.value) || 0;
            this.boatSpeed = kmh / 3.6; // km/h -> m/s
            if (this.controlMode === 'variable') {
                this.autoAdjustRpm('船速変更');
            }
            this.updateDisplay();
        });

        this.elements.targetSpeed.addEventListener('change', (e) => {
            this.targetSpeed = parseFloat(e.target.value) || 1.0;
            if (this.controlMode === 'variable') {
                this.autoAdjustRpm('目標速度変更');
            }
            this.updateDisplay();
        });

        // プリセット保存
        this.elements.savePresetBtn.addEventListener('click', () => this.savePreset());
        this.elements.presetName.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.savePreset();
        });
    }

    // ========================================
    // 設定モーダル
    // ========================================
    attachSettingsListeners() {
        // 設定ボタン
        this.elements.settingsBtn.addEventListener('click', () => this.openSettings());
        
        // クローズボタン
        this.elements.closeSettingsBtn.addEventListener('click', () => this.closeSettings());
        
        // モーダルオーバーレイクリック
        this.elements.settingsModal.querySelector('.modal-overlay').addEventListener('click', () => this.closeSettings());
        
        // タブ切り替え
        const tabs = this.elements.settingsModal.querySelectorAll('.modal-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });
        
        // インジケーター設定
        this.elements.indicatorMin.addEventListener('change', (e) => {
            this.indicatorMinSpeed = parseFloat(e.target.value) || 0.2;
            this.saveIndicatorSettings();
            this.updateDisplay();
        });
        
        this.elements.indicatorMax.addEventListener('change', (e) => {
            this.indicatorMaxSpeed = parseFloat(e.target.value) || 3.0;
            this.saveIndicatorSettings();
            this.updateDisplay();
        });
        
        this.elements.indicatorResetBtn.addEventListener('click', () => this.resetIndicatorSettings());

        this.elements.volumeLevel.addEventListener('input', (e) => {
            this.volumeLevel = parseInt(e.target.value, 10) || 20;
            this.applyVolumeSetting();
            this.saveAudioSettings();
            this.elements.volumeLabel.textContent = this.volumeLevel;
        });

        this.elements.audioEngine.addEventListener('change', (e) => {
            this.audioEngine = e.target.value;
            this.saveAudioSettings();
            this.applyVolumeSetting();
            if (this.isPlaying) {
                this.startActiveEngine();
            }
        });

        this.elements.toneVariant.addEventListener('change', (e) => {
            this.toneVariant = e.target.value;
            if (this.clickLoopUrl) {
                URL.revokeObjectURL(this.clickLoopUrl);
                this.clickLoopUrl = null;
            }
            this.saveAudioSettings();
            if (this.isPlaying) {
                this.startActiveEngine();
            }
        });
    }

    openSettings() {
        this.elements.settingsModal.style.display = 'flex';
    }

    closeSettings() {
        this.elements.settingsModal.style.display = 'none';
    }

    switchTab(tabName) {
        // タブボタンの切り替え
        const tabs = this.elements.settingsModal.querySelectorAll('.modal-tab');
        tabs.forEach(tab => tab.classList.remove('active'));
        this.elements.settingsModal.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        
        // コンテンツの切り替え
        const contents = this.elements.settingsModal.querySelectorAll('.modal-tab-content');
        contents.forEach(content => content.classList.remove('active'));
        const contentId = tabName === 'presets' ? 'presetsTab' : 'indicatorTab';
        document.getElementById(contentId).classList.add('active');
    }

    loadIndicatorSettings() {
        const settings = JSON.parse(localStorage.getItem('indicatorSettings') || '{"min":0.2,"max":3.0}');
        this.indicatorMinSpeed = settings.min || 0.2;
        this.indicatorMaxSpeed = settings.max || 3.0;
        
        this.elements.indicatorMin.value = this.indicatorMinSpeed;
        this.elements.indicatorMax.value = this.indicatorMaxSpeed;
    }

    saveIndicatorSettings() {
        const settings = {
            min: this.indicatorMinSpeed,
            max: this.indicatorMaxSpeed
        };
        localStorage.setItem('indicatorSettings', JSON.stringify(settings));
        this.updateStatus('インジケーター設定を保存しました');
    }

    resetIndicatorSettings() {
        this.indicatorMinSpeed = 0.2;
        this.indicatorMaxSpeed = 3.0;
        this.elements.indicatorMin.value = 0.2;
        this.elements.indicatorMax.value = 3.0;
        this.saveIndicatorSettings();
    }

    loadControlMode() {
        const savedMode = localStorage.getItem('controlMode');
        const mode = savedMode === 'variable' ? 'variable' : 'fixed';
        this.setControlMode(mode, { fromLoad: true });
    }

    setControlMode(mode, options = {}) {
        this.controlMode = mode === 'variable' ? 'variable' : 'fixed';
        localStorage.setItem('controlMode', this.controlMode);
        document.body.classList.toggle('mode-fixed', this.controlMode === 'fixed');
        document.body.classList.toggle('mode-variable', this.controlMode === 'variable');

        this.elements.fixedModeBtn.classList.toggle('active', this.controlMode === 'fixed');
        this.elements.variableModeBtn.classList.toggle('active', this.controlMode === 'variable');

        if (this.controlMode === 'variable' && !options.fromLoad) {
            // モード切り替え時は現在の実ルアー速度を基準に固定
            this.targetSpeed = this.calculateLureSpeed();
            this.elements.targetSpeed.value = this.targetSpeed.toFixed(2);
            this.autoAdjustRpm('モード切替');
        }

        if (this.isPlaying) {
            this.disableInputs(true);
        }

        this.updateStatus(this.controlMode === 'fixed' ? '一定RPMモード' : '可変RPMモード');
        this.updateDisplay();
    }

    autoAdjustRpm(reason = '') {
        const rpm = this.calculateRpmFromTargetSpeed();
        if (rpm !== null) {
            this.currentRpm = rpm;
            if (this.isPlaying) {
                if (this.audioEngine === 'htmlaudio') {
                    this.elements.audioElement.playbackRate = this.currentRpm / 60;
                } else {
                    this.startClickLoop();
                }
            }
            if (reason) {
                this.updateStatus(`可変RPM自動調整: ${this.currentRpm} RPM (${reason})`);
            }
        }
    }

    loadAudioSettings() {
        const settings = JSON.parse(localStorage.getItem('audioSettings') || '{"volumeLevel":20,"audioEngine":"webaudio","toneVariant":"sharp"}');
        this.volumeLevel = Math.max(20, Math.min(150, parseInt(settings.volumeLevel, 10) || 20));
        this.audioEngine = settings.audioEngine === 'htmlaudio' ? 'htmlaudio' : 'webaudio';
        const allowedTones = ['sharp', 'soft', 'beep', 'wood', 'bell'];
        this.toneVariant = allowedTones.includes(settings.toneVariant) ? settings.toneVariant : 'sharp';
        this.elements.volumeLevel.value = this.volumeLevel;
        this.elements.volumeLabel.textContent = this.volumeLevel;
        this.elements.audioEngine.value = this.audioEngine;
        this.elements.toneVariant.value = this.toneVariant;
        this.applyVolumeSetting();
    }

    saveAudioSettings() {
        localStorage.setItem('audioSettings', JSON.stringify({
            volumeLevel: this.volumeLevel,
            audioEngine: this.audioEngine,
            toneVariant: this.toneVariant
        }));
    }

    getToneProfile() {
        switch (this.toneVariant) {
            case 'soft':
                return { freq: 1200, clickSec: 0.012, wave: 'sine' };
            case 'beep':
                return { freq: 2000, clickSec: 0.006, wave: 'square' };
            case 'wood':
                return { freq: 900, clickSec: 0.010, wave: 'triangle' };
            case 'bell':
                return { freq: 1500, clickSec: 0.014, wave: 'sine-bell' };
            case 'sharp':
            default:
                return { freq: 1800, clickSec: 0.008, wave: 'square' };
        }
    }

    getWaveSample(wave, phase) {
        if (wave === 'sine') return Math.sin(phase);
        if (wave === 'triangle') return (2 / Math.PI) * Math.asin(Math.sin(phase));
        if (wave === 'sine-bell') {
            const s1 = Math.sin(phase);
            const s2 = Math.sin(phase * 2);
            return (s1 * 0.75) + (s2 * 0.25);
        }
        return Math.sin(phase) >= 0 ? 1 : -1;
    }

    getVolumeRatio() {
        const ratio = (this.volumeLevel - 20) / 130;
        return Math.max(0, Math.min(1, ratio));
    }

    getVolumeMultiplier() {
        // WebAudio側は最大1.5まで許容（元波形にヘッドルームあり）
        const ratio = this.getVolumeRatio();
        const perceptual = Math.pow(ratio, 1.6);
        return 0.12 + (1.38 * perceptual);
    }

    getHtmlAudioVolume() {
        // HTMLAudio要素は仕様上1.0が上限
        const cappedLevel = Math.min(this.volumeLevel, 100);
        const ratio = (cappedLevel - 20) / 80;
        const perceptual = Math.pow(ratio, 1.6);
        return 0.12 + (0.88 * perceptual);
    }

    applyVolumeSetting() {
        if (this.masterGain) {
            this.masterGain.gain.value = this.getVolumeMultiplier();
        }

        if (this.audioEngine === 'htmlaudio') {
            this.elements.audioElement.volume = this.getHtmlAudioVolume();
        } else {
            this.elements.audioElement.volume = 1.0;
        }
    }

    attachTipsListeners() {
        // Tipsボタン
        this.elements.tipsBtn.addEventListener('click', () => this.openTips());
        
        // クローズボタン
        this.elements.closeTipsBtn.addEventListener('click', () => this.closeTips());
        
        // モーダルオーバーレイクリック
        this.elements.tipsModal.querySelector('.modal-overlay').addEventListener('click', () => this.closeTips());
    }

    openTips() {
        this.elements.tipsModal.style.display = 'flex';
    }

    closeTips() {
        this.elements.tipsModal.style.display = 'none';
    }

    // ========================================
    // 再生・停止制御
    // ========================================
    togglePlayback() {
        if (this.isPlaying) {
            this.stop();
        } else {
            this.play();
        }
    }

    play() {
        if (this.isPlaying) return;
        if (!this.audioContext) {
            this.setupAudioContext();
            // AudioContextの初期化を待つ
            setTimeout(() => this.play(), 100);
            return;
        }

        // AudioContextが中断されている場合は再開
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(err => console.error('Resume failed:', err));
        }

        this.isPlaying = true;
        this.elements.playBtn.textContent = '停止';
        this.elements.playBtn.style.backgroundColor = '#FF6B6B';
        this.elements.playBtn.style.borderColor = '#FF6B6B';
        this.elements.playBtn.style.boxShadow = '0 0 10px rgba(255, 107, 107, 0.45)';
        
        // 入力フィールドを無効化
        this.disableInputs(true);
        
        // エンジン別に再生開始
        this.startActiveEngine();
        
        this.updateStatus('再生中...');
        this.updateMediaSession();
        this.requestWakeLock();
    }

    stop() {
        if (!this.isPlaying) return;

        this.isPlaying = false;
        this.elements.playBtn.textContent = '再生';
        this.elements.playBtn.style.backgroundColor = '';
        this.elements.playBtn.style.borderColor = '';
        this.elements.playBtn.style.boxShadow = '';

        // エンジン別に停止
        this.stopActiveEngine();

        // 入力フィールドを有効化
        this.disableInputs(false);

        this.updateStatus('停止');
        this.releaseWakeLock();
    }

    // ========================================
    // 音声エンジン
    // ========================================
    startActiveEngine() {
        if (this.audioEngine === 'htmlaudio') {
            this.startHtmlAudioLoop();
        } else {
            this.startClickLoop();
        }
    }

    stopActiveEngine() {
        this.stopClickLoop();
        this.stopHtmlAudioLoop();
    }

    attachMediaStream() {
        if (!this.mediaStreamDestination) return;

        const audio = this.elements.audioElement;
        if (audio.srcObject !== this.mediaStreamDestination.stream) {
            audio.pause();
            audio.removeAttribute('src');
            audio.srcObject = this.mediaStreamDestination.stream;
        }

        audio.loop = false;
        audio.play().catch(err => {
            console.warn('Audio play failed:', err);
        });
    }

    detachMediaStream() {
        const audio = this.elements.audioElement;
        if (audio.srcObject) {
            audio.pause();
            audio.srcObject = null;
        }
    }

    createClickLoopUrl() {
        const sampleRate = 44100;
        const durationSec = 1.0; // 60RPM基準で1秒周期
        const totalSamples = Math.floor(sampleRate * durationSec);
        const tone = this.getToneProfile();
        const clickSamples = Math.floor(sampleRate * tone.clickSec);
        const freq = tone.freq;
        const fadeSamples = Math.max(8, Math.floor(sampleRate * 0.0005)); // 0.5ms
        const peakInt16 = 14000; // ヘッドルームを確保して歪みを回避

        const pcm = new Int16Array(totalSamples);
        for (let i = 0; i < clickSamples; i++) {
            const phase = (2 * Math.PI * freq * i) / sampleRate;
            const sample = this.getWaveSample(tone.wave, phase);

            // クリック開始/終了の不連続を抑えてループ境界の音色変化を軽減
            let env = 1;
            if (i < fadeSamples) {
                env = i / fadeSamples;
            } else if (i >= clickSamples - fadeSamples) {
                env = (clickSamples - i - 1) / fadeSamples;
            }

            pcm[i] = Math.max(-peakInt16, Math.min(peakInt16, Math.round(sample * env * peakInt16)));
        }

        // 先頭・末尾をゼロに固定してループ接続時の段差を最小化
        pcm[0] = 0;
        pcm[clickSamples - 1] = 0;
        pcm[totalSamples - 1] = 0;

        const bytesPerSample = 2;
        const dataSize = pcm.length * bytesPerSample;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);

        const writeString = (offset, str) => {
            for (let i = 0; i < str.length; i++) {
                view.setUint8(offset + i, str.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * bytesPerSample, true);
        view.setUint16(32, bytesPerSample, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, dataSize, true);

        let offset = 44;
        for (let i = 0; i < pcm.length; i++, offset += 2) {
            view.setInt16(offset, pcm[i], true);
        }

        const blob = new Blob([buffer], { type: 'audio/wav' });
        return URL.createObjectURL(blob);
    }

    createClickBuffer(rpm) {
        const sampleRate = this.audioContext.sampleRate;
        const periodSec = 60.0 / rpm;
        const bufferLength = Math.max(1, Math.floor(sampleRate * periodSec));
        const buffer = this.audioContext.createBuffer(1, bufferLength, sampleRate);
        const data = buffer.getChannelData(0);

        const tone = this.getToneProfile();
        const clickSamples = Math.min(bufferLength, Math.floor(sampleRate * tone.clickSec));
        const freq = tone.freq;
        const fadeSamples = Math.max(8, Math.floor(sampleRate * 0.0005));
        const sourceAmp = 0.55; // 元波形を抑えてクリップ耐性を上げる
        for (let i = 0; i < clickSamples; i++) {
            const phase = (2 * Math.PI * freq * i) / sampleRate;
            let env = 1;
            if (i < fadeSamples) {
                env = i / fadeSamples;
            } else if (i >= clickSamples - fadeSamples) {
                env = (clickSamples - i - 1) / fadeSamples;
            }
            data[i] = this.getWaveSample(tone.wave, phase) * env * sourceAmp;
        }

        return buffer;
    }

    startClickLoop() {
        if (!this.audioContext || !this.masterGain) return;

        this.attachMediaStream();

        this.stopClickLoop();

        const source = this.audioContext.createBufferSource();
        source.buffer = this.createClickBuffer(this.currentRpm);
        source.loop = true;
        source.connect(this.masterGain);
        source.onended = () => {
            if (this.clickSource === source) {
                this.clickSource = null;
            }
        };

        source.start();
        this.clickSource = source;
    }

    stopClickLoop() {
        if (!this.clickSource) return;
        try {
            this.clickSource.stop(0);
        } catch (err) {
            console.warn('Click source stop failed:', err);
        }
        this.clickSource.disconnect();
        this.clickSource = null;
    }

    startHtmlAudioLoop() {
        const audio = this.elements.audioElement;
        this.stopClickLoop();
        this.detachMediaStream();

        if (!this.clickLoopUrl) {
            this.clickLoopUrl = this.createClickLoopUrl();
        }

        if (audio.src !== this.clickLoopUrl) {
            audio.src = this.clickLoopUrl;
        }

        audio.loop = true;
        audio.playbackRate = this.currentRpm / 60;
        audio.currentTime = 0;
        this.applyVolumeSetting();
        audio.play().catch(err => {
            console.warn('HTMLAudio loop play failed:', err);
        });
    }

    stopHtmlAudioLoop() {
        if (this.audioEngine !== 'htmlaudio' && this.elements.audioElement.srcObject) return;

        const audio = this.elements.audioElement;
        if (!audio.paused || audio.currentTime > 0) {
            audio.pause();
            audio.currentTime = 0;
        }
    }

    async resumeAudioIfNeeded() {
        if (!this.isPlaying || !this.audioContext) return;

        try {
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            if (this.audioEngine === 'htmlaudio') {
                this.elements.audioElement.playbackRate = this.currentRpm / 60;
                await this.elements.audioElement.play();
            } else {
                await this.elements.audioElement.play();
                if (!this.clickSource) {
                    this.startClickLoop();
                }
            }
        } catch (err) {
            console.warn('Audio resume after sleep failed:', err);
        }
    }

    // ========================================
    // RPM制御
    // ========================================
    adjustRpm(delta) {
        this.currentRpm = Math.max(30, Math.min(200, this.currentRpm + delta));

        this.updateDisplay();
        
        if (this.isPlaying) {
            if (this.audioEngine === 'htmlaudio') {
                this.elements.audioElement.playbackRate = this.currentRpm / 60;
            } else {
                this.startClickLoop();
            }
            this.updateMediaSession();
        }
    }

    adjustBoatSpeed(deltaKmh) {
        // deltaKmh を m/s に変換
        const deltaMs = deltaKmh / 3.6;
        const newBoatSpeedMs = Math.max(0, Math.min(5, this.boatSpeed + deltaMs));
        this.boatSpeed = Math.round(newBoatSpeedMs * 100) / 100; // m/s

        if (this.controlMode === 'variable') {
            this.autoAdjustRpm('船速ボタン変更');
        }

        const boatSpeedKmh = Math.round(this.boatSpeed * 3.6 * 10) / 10; // km/h に変換して表示
        this.elements.boatSpeed.value = boatSpeedKmh;
        this.updateDisplay();
    }

    adjustTargetSpeed(delta) {
        const newTargetSpeed = Math.max(0, Math.min(5, this.targetSpeed + delta));
        this.targetSpeed = Math.round(newTargetSpeed * 10) / 10;

        if (this.controlMode === 'variable') {
            this.autoAdjustRpm('目標速度ボタン変更');
        }

        this.updateDisplay();
    }

    // ========================================
    // 計算・表示更新
    // ========================================
    calculateLureSpeed() {
        // リール回転数（RPM） -> 単位時間あたりの糸巻取り量
        // ルアー移動速度 = (ハンドル1回転の巻き取り量(cm) / 100 * RPM / 60) + 船速
        const reelSpeedMs = (this.reelRetrieve / 100) * (this.currentRpm / 60); // m/s
        const lureSpeed = reelSpeedMs + this.boatSpeed;
        return lureSpeed;
    }

    calculateRpmFromTargetSpeed() {
        // 目標ルアー移動速度から必要なRPMを逆算
        // RPM = ((目標速度 - 船速) / (巻き取り量cm / 100)) * 60
        const targetSpeed = this.targetSpeed;
        const boatSpeed = this.boatSpeed;
        const reelRetrieveMeter = this.reelRetrieve / 100;
        
        if (reelRetrieveMeter === 0) {
            this.updateStatus('巻き取り量が0です');
            return null;
        }
        
        const relativeSpeed = targetSpeed - boatSpeed;
        
        if (relativeSpeed < 0) {
            this.updateStatus('目標速度 < 船速です。目標速度を高くしてください');
            return null;
        }
        
        const rpm = (relativeSpeed / reelRetrieveMeter) * 60;
        return Math.max(30, Math.min(200, Math.round(rpm)));
    }

    setRpmFromTargetSpeed() {
        if (this.controlMode === 'variable') {
            // 可変RPMモード: 目標速度ベースで船速を加味し、再生中も即反映
            this.autoAdjustRpm('セット');
            this.updateDisplay();
            return;
        }

        if (this.isPlaying) {
            this.updateStatus('再生中はセットできません');
            return;
        }

        const rpm = this.calculateRpmFromTargetSpeed();
        if (rpm !== null) {
            this.currentRpm = rpm;
            this.updateDisplay();
            this.updateStatus(`RPMをセットしました: ${this.currentRpm} RPM`);
        }
    }

    updateDisplay() {
        this.elements.currentRpm.textContent = this.currentRpm;
        
        const lureSpeed = this.calculateLureSpeed();
        this.elements.lureSpeed.textContent = lureSpeed.toFixed(2);
        
        // 船速をkm/hで表示
        const boatSpeedKmh = Math.round(this.boatSpeed * 3.6 * 10) / 10;
        this.elements.boatSpeed.value = boatSpeedKmh;
        this.elements.targetSpeed.value = this.targetSpeed.toFixed(1);

        // インジケーター目盛り表示を設定値に同期
        this.elements.indicatorMinLabel.textContent = this.indicatorMinSpeed.toFixed(1);
        this.elements.indicatorMaxLabel.textContent = this.indicatorMaxSpeed.toFixed(1);
        
        // インジケーターバー更新
        this.updateSpeedIndicator(lureSpeed);
    }

    updateSpeedIndicator(lureSpeed) {
        // 範囲: indicatorMinSpeed ~ indicatorMaxSpeed
        const minSpeed = this.indicatorMinSpeed;
        const maxSpeed = this.indicatorMaxSpeed;
        
        let percentage = 0;
        if (lureSpeed <= minSpeed) {
            percentage = 0;
        } else if (lureSpeed >= maxSpeed) {
            percentage = 100;
        } else {
            percentage = ((lureSpeed - minSpeed) / (maxSpeed - minSpeed)) * 100;
        }
        
        this.elements.indicatorMarker.style.left = percentage + '%';
    }

    updateStatus(message) {
        console.log(message);
    }

    disableInputs(disabled) {
        this.elements.reelRetrieve.disabled = disabled;
        this.elements.targetSpeed.disabled = this.controlMode === 'fixed' ? disabled : false;
        this.elements.targetSpeedIncreaseBtn.disabled = this.controlMode === 'fixed' ? disabled : false;
        this.elements.targetSpeedDecreaseBtn.disabled = this.controlMode === 'fixed' ? disabled : false;
        this.elements.savePresetBtn.disabled = disabled;
        this.elements.presetName.disabled = disabled;
        this.elements.setBtn.disabled = this.controlMode === 'fixed' ? disabled : false;
    }

    // ========================================
    // プリセット管理
    // ========================================
    savePreset() {
        const name = this.elements.presetName.value.trim();
        if (!name) {
            this.updateStatus('プリセット名を入力してください');
            return;
        }

        const preset = {
            name: name,
            rpm: this.currentRpm,
            reelRetrieve: this.reelRetrieve,
            boatSpeed: this.boatSpeed,
            targetSpeed: this.targetSpeed,
            controlMode: this.controlMode,
            timestamp: Date.now()
        };

        let presets = JSON.parse(localStorage.getItem('tiravaPresets') || '[]');
        presets = presets.filter(p => p.name !== name); // 同名を削除
        presets.push(preset);
        localStorage.setItem('tiravaPresets', JSON.stringify(presets));

        this.elements.presetName.value = '';
        this.loadPresets();
        this.updateStatus(`プリセット「${name}」を保存しました`);
    }

    loadPresets() {
        const presets = JSON.parse(localStorage.getItem('tiravaPresets') || '[]');
        this.elements.presetList.innerHTML = '';

        presets.forEach(preset => {
            const item = document.createElement('div');
            item.className = 'preset-item';

            const name = document.createElement('div');
            name.className = 'preset-item-name';
            name.textContent = `${preset.name} (${preset.rpm} RPM)`;
            name.addEventListener('click', () => this.loadPreset(preset));

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'preset-item-delete';
            deleteBtn.textContent = '削除';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deletePreset(preset.name);
            });

            item.appendChild(name);
            item.appendChild(deleteBtn);
            this.elements.presetList.appendChild(item);
        });
    }

    loadPreset(preset) {
        if (this.isPlaying) this.stop();
        
        this.currentRpm = preset.rpm;
        this.reelRetrieve = preset.reelRetrieve;
        this.boatSpeed = preset.boatSpeed;
        this.targetSpeed = preset.targetSpeed;

        this.setControlMode(preset.controlMode === 'variable' ? 'variable' : 'fixed', { fromLoad: true });
        if (this.controlMode === 'variable') {
            this.autoAdjustRpm('プリセット読込');
        }

        this.elements.reelRetrieve.value = this.reelRetrieve;
        this.elements.boatSpeed.value = this.boatSpeed;
        this.elements.targetSpeed.value = this.targetSpeed;

        this.updateDisplay();
        this.updateStatus(`プリセット「${preset.name}」をロードしました`);
    }

    deletePreset(name) {
        let presets = JSON.parse(localStorage.getItem('tiravaPresets') || '[]');
        presets = presets.filter(p => p.name !== name);
        localStorage.setItem('tiravaPresets', JSON.stringify(presets));
        this.loadPresets();
        this.updateStatus(`プリセット「${name}」を削除しました`);
    }
}

// ========================================
// アプリケーション起動
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    window.metronome = new TiravaMetronome();
});

// ページを離れる時のクリーンアップ
window.addEventListener('beforeunload', () => {
    if (window.metronome) {
        window.metronome.stop();
        window.metronome.releaseWakeLock();
        if (window.metronome.clickLoopUrl) {
            URL.revokeObjectURL(window.metronome.clickLoopUrl);
            window.metronome.clickLoopUrl = null;
        }
    }
});

// 可視性変更時の処理
document.addEventListener('visibilitychange', () => {
    if (document.hidden && window.metronome && window.metronome.isPlaying) {
        // ページが非表示になったが、Audio要素は継続再生される
        console.log('Page hidden, audio continues playing');
    } else if (!document.hidden && window.metronome) {
        window.metronome.resumeAudioIfNeeded();
    }
});
