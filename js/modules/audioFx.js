/**
 * 班級經營系統 3.0 - 課堂專業音效引擎 (Web Audio API 合成音效)
 * 100% 純原生合成、離線即時播放、零外部音檔依賴、極致低延遲
 */

let audioCtx = null;
let soundEnabled = localStorage.getItem('app_sound_enabled') !== 'false';

function getAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
    return audioCtx;
}

export function isSoundEnabled() {
    return soundEnabled;
}

export function setSoundEnabled(enabled) {
    soundEnabled = !!enabled;
    localStorage.setItem('app_sound_enabled', soundEnabled ? 'true' : 'false');
    updateSoundToggleUI();
    return soundEnabled;
}

export function toggleSound() {
    return setSoundEnabled(!soundEnabled);
}

export function updateSoundToggleUI() {
    const soundToggles = document.querySelectorAll('.sound-toggle-btn');
    soundToggles.forEach(btn => {
        const icon = btn.querySelector('i');
        const text = btn.querySelector('.sound-toggle-text');
        if (soundEnabled) {
            if (icon) icon.className = 'fa-solid fa-volume-high text-emerald-600';
            if (text) text.textContent = '音效：開啟';
            btn.title = '點擊關閉音效（靜音模式）';
        } else {
            if (icon) icon.className = 'fa-solid fa-volume-xmark text-stone-400';
            if (text) text.textContent = '音效：靜音';
            btn.title = '點擊開啟課堂音效';
        }
    });
}

/**
 * 抽籤隨機滾動音效 (Tick)
 */
export function playLotteryTick() {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        // 隨機在 750~950Hz 輕微擺盪，仿真指針轉盤聲
        osc.frequency.setValueAtTime(800 + Math.random() * 150, now);
        osc.type = 'triangle';

        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.035);
    } catch(e) {}
}

/**
 * 抽中得獎者 / 選中學生歡呼和弦 (Win Chime)
 */
export function playLotteryWinner() {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        // C大調華麗和弦 (C5, E5, G5, C6)
        const freqs = [523.25, 659.25, 783.99, 1046.50];
        freqs.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const startDelay = idx * 0.08;

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + startDelay);

            gain.gain.setValueAtTime(0, now + startDelay);
            gain.gain.linearRampToValueAtTime(0.12, now + startDelay + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + startDelay + 0.9);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(now + startDelay);
            osc.stop(now + startDelay + 0.9);
        });
    } catch(e) {}
}

/**
 * 學生 / 全班加分音效 (Level-Up / Coin Chime)
 */
export function playPointAdd() {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880, now + 0.08); // A5
        osc.frequency.setValueAtTime(1174.66, now + 0.16); // D6

        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.4);
    } catch(e) {}
}

/**
 * 扣分溫和提示音 (Soft Down)
 */
export function playPointDeduct() {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(330, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.18);

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.2);
    } catch(e) {}
}

/**
 * 班級目標 CLASS GOAL 達成 / 大歡慶樂章 (Fanfare)
 */
export function playGoalAchieved() {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        const notes = [
            { f: 523.25, d: 0.12, t: 0 },
            { f: 523.25, d: 0.12, t: 0.14 },
            { f: 523.25, d: 0.12, t: 0.28 },
            { f: 659.25, d: 0.25, t: 0.42 },
            { f: 783.99, d: 0.25, t: 0.70 },
            { f: 1046.50, d: 0.6, t: 1.0 }
        ];

        notes.forEach(note => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(note.f, now + note.t);

            gain.gain.setValueAtTime(0.12, now + note.t);
            gain.gain.exponentialRampToValueAtTime(0.001, now + note.t + note.d);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(now + note.t);
            osc.stop(now + note.t + note.d);
        });
    } catch(e) {}
}

/**
 * 考試計時結束下課鐘聲 (Ding-Dong School Bell Chime)
 */
export function playTimerAlarm() {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        // 叮咚鐘聲連響 2 次
        [0, 1.3].forEach(offset => {
            // "Ding" (G5, 783.99 Hz)
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(783.99, now + offset);
            gain1.gain.setValueAtTime(0.18, now + offset);
            gain1.gain.exponentialRampToValueAtTime(0.0001, now + offset + 1.1);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now + offset);
            osc1.stop(now + offset + 1.1);

            // "Dong" (E5, 659.25 Hz)
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(659.25, now + offset + 0.45);
            gain2.gain.setValueAtTime(0.18, now + offset + 0.45);
            gain2.gain.exponentialRampToValueAtTime(0.0001, now + offset + 1.6);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + offset + 0.45);
            osc2.stop(now + offset + 1.6);
        });
    } catch(e) {}
}

if (typeof window !== 'undefined') {
    window.isSoundEnabled = isSoundEnabled;
    window.setSoundEnabled = setSoundEnabled;
    window.toggleSound = toggleSound;
    window.playLotteryTick = playLotteryTick;
    window.playLotteryWinner = playLotteryWinner;
    window.playPointAdd = playPointAdd;
    window.playPointDeduct = playPointDeduct;
    window.playGoalAchieved = playGoalAchieved;
    window.playTimerAlarm = playTimerAlarm;
}
