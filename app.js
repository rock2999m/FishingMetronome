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
        
        // Web Audio API
        this.audioContext = null;
        this.mediaStreamDestination = null;
        this.audioElement = null;
        
        // スケジューラ
        this.nextNoteTime = 0;
        this.scheduleAheadTime = 0.1; // 100ms前にスケジュール
        this.lookAhead = 25.0; // 25msごとにチェック
        this.schedulerID = null;
        
        // Wake Lock
        this.wakeLock = null;
        
        // DOM要素
        this.elements = {
            currentRpm: document.getElementById('currentRpm'),
            lureSpeed: document.getElementById('lureSpeed'),
            rpmSlider: document.getElementById('rpmSlider'),
            playBtn: document.getElementById('playBtn'),
            increaseBtn: document.getElementById('increaseBtn'),
            decreaseBtn: document.getElementById('decreaseBtn'),
            reelRetrieve: document.getElementById('reelRetrieve'),
            boatSpeed: document.getElementById('boatSpeed'),
            boatSpeedIncreaseBtn: document.getElementById('boatSpeedIncreaseBtn'),
            boatSpeedDecreaseBtn: document.getElementById('boatSpeedDecreaseBtn'),
            targetSpeed: document.getElementById('targetSpeed'),
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
        this.updateDisplay();
        this.requestWakeLock();
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
            
            // MediaStreamを<audio>要素に接続
            this.elements.audioElement.srcObject = this.mediaStreamDestination.stream;
            this.elements.audioElement.play().catch(err => {
                console.warn('Audio play failed:', err);
            });

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

        // RPM制御
        this.elements.rpmSlider.addEventListener('input', (e) => {
            this.currentRpm = parseInt(e.target.value);
            this.updateDisplay();
            if (this.isPlaying) {
                this.updateMediaSession();
            }
        });

        this.elements.increaseBtn.addEventListener('click', () => this.adjustRpm(5));
        this.elements.decreaseBtn.addEventListener('click', () => this.adjustRpm(-5));
        this.elements.setBtn.addEventListener('click', () => this.setRpmFromTargetSpeed());

        // 船速制御
        this.elements.boatSpeedIncreaseBtn.addEventListener('click', () => this.adjustBoatSpeed(0.1));
        this.elements.boatSpeedDecreaseBtn.addEventListener('click', () => this.adjustBoatSpeed(-0.1));

        // 入力値変更
        this.elements.reelRetrieve.addEventListener('change', (e) => {
            this.reelRetrieve = parseFloat(e.target.value) || 75;
            this.updateDisplay();
        });

        this.elements.boatSpeed.addEventListener('change', (e) => {
            const kmh = parseFloat(e.target.value) || 0;
            this.boatSpeed = kmh / 3.6; // km/h -> m/s
            this.updateDisplay();
        });

        this.elements.targetSpeed.addEventListener('change', (e) => {
            this.targetSpeed = parseFloat(e.target.value) || 1.0;
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
        this.nextNoteTime = this.audioContext.currentTime;
        this.elements.playBtn.textContent = '停止';
        this.elements.playBtn.style.backgroundColor = '#FF6B6B';
        
        // 入力フィールドを無効化
        this.disableInputs(true);
        
        // スケジューラ開始
        this.scheduler();
        
        this.updateStatus('再生中...');
        this.updateMediaSession();
        this.requestWakeLock();
    }

    stop() {
        if (!this.isPlaying) return;

        this.isPlaying = false;
        this.elements.playBtn.textContent = '再生';
        this.elements.playBtn.style.backgroundColor = '#FFD700';

        // スケジューラ停止
        if (this.schedulerID) {
            clearTimeout(this.schedulerID);
            this.schedulerID = null;
        }

        // 入力フィールドを有効化
        this.disableInputs(false);

        this.updateStatus('停止');
        this.releaseWakeLock();
    }

    // ========================================
    // オーディオスケジューリング
    // ========================================
    scheduler() {
        // スケジュール可能な全てのノートをスケジュール
        while (this.nextNoteTime < this.audioContext.currentTime + this.scheduleAheadTime) {
            this.scheduleNote(this.nextNoteTime);
            this.advance();
        }

        if (this.isPlaying) {
            this.schedulerID = setTimeout(() => this.scheduler(), this.lookAhead);
        }
    }

    advance() {
        const secondsPerBeat = 60.0 / this.currentRpm;
        this.nextNoteTime += secondsPerBeat;
    }

    scheduleNote(time) {
        // クリック音の合成
        const osc = this.audioContext.createOscillator();
        const env = this.audioContext.createGain();
        
        osc.connect(env);
        env.connect(this.mediaStreamDestination);

        // 短いクリック音
        osc.frequency.value = 800;
        osc.type = 'sine';

        env.gain.setValueAtTime(0.3, time);
        env.gain.exponentialRampToValueAtTime(0.01, time + 0.1);

        osc.start(time);
        osc.stop(time + 0.1);
    }

    // ========================================
    // RPM制御
    // ========================================
    adjustRpm(delta) {
        this.currentRpm = Math.max(30, Math.min(200, this.currentRpm + delta));
        this.elements.rpmSlider.value = this.currentRpm;
        this.updateDisplay();
        
        if (this.isPlaying) {
            this.updateMediaSession();
        }
    }

    adjustBoatSpeed(deltaKmh) {
        // deltaKmh を m/s に変換
        const deltaMs = deltaKmh / 3.6;
        const newBoatSpeedMs = Math.max(0, Math.min(5, this.boatSpeed + deltaMs));
        this.boatSpeed = Math.round(newBoatSpeedMs * 100) / 100; // m/s
        const boatSpeedKmh = Math.round(this.boatSpeed * 3.6 * 10) / 10; // km/h に変換して表示
        this.elements.boatSpeed.value = boatSpeedKmh;
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
        if (this.isPlaying) {
            this.updateStatus('再生中はセットできません');
            return;
        }
        
        const rpm = this.calculateRpmFromTargetSpeed();
        if (rpm !== null) {
            this.currentRpm = rpm;
            this.elements.rpmSlider.value = this.currentRpm;
            this.updateDisplay();
            this.updateStatus(`RPMをセットしました: ${this.currentRpm} RPM`);
        }
    }

    updateDisplay() {
        this.elements.currentRpm.textContent = this.currentRpm;
        
        const lureSpeed = this.calculateLureSpeed();
        this.elements.lureSpeed.textContent = lureSpeed.toFixed(2);
        
        this.elements.rpmSlider.value = this.currentRpm;
        
        // 船速をkm/hで表示
        const boatSpeedKmh = Math.round(this.boatSpeed * 3.6 * 10) / 10;
        this.elements.boatSpeed.value = boatSpeedKmh;

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
        this.elements.targetSpeed.disabled = disabled;
        this.elements.savePresetBtn.disabled = disabled;
        this.elements.presetName.disabled = disabled;
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

        this.elements.rpmSlider.value = this.currentRpm;
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
    }
});

// 可視性変更時の処理
document.addEventListener('visibilitychange', () => {
    if (document.hidden && window.metronome && window.metronome.isPlaying) {
        // ページが非表示になったが、Audio要素は継続再生される
        console.log('Page hidden, audio continues playing');
    }
});
