/**
 * 班級經營系統 - 模組 6：考試計時系統 (examTimer.js)
 * 支援：
 * 1. 專業電子白板小考/段考計時大螢幕介面
 * 2. 測驗科目切換、考試時間預設（40分、45分、50分、自訂）
 * 3. 即時到考狀況看板（自動連動今日出勤中樞：應到 / 實到 / 缺考座號自動帶入！）
 * 4. 考試注意事項跑馬燈與溫馨提醒
 * 5. 倒數結束鈴聲（Web Audio API 溫和提醒聲，免載入外部音檔）
 * 6. 全螢幕投影專用模式
 */

import { state } from '../state.js';
import { formatDate, showToast, openModal, closeModal, escapeHtml } from '../utils.js';
import { getAttendanceSummaryForClass } from './attendanceHub.js';

let timerInterval = null;
let totalDurationSeconds = 45 * 60;
let remainingSeconds = 45 * 60;
let isTimerRunning = false;
let currentSubject = '國語文';

const PRESET_MINUTES = [15, 20, 30, 40, 45, 50, 60];

/**
 * 使用 Web Audio API 合成考試結束下課鐘聲
 */
function playChimeBell() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();

        const playTone = (freq, startTime, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, startTime);
            gain.gain.setValueAtTime(0.3, startTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + duration);
        };

        const now = ctx.currentTime;
        // 經典鐘聲和弦 (叮咚叮咚)
        playTone(554.37, now, 0.8);        // C#5
        playTone(659.25, now + 0.35, 0.8);  // E5
        playTone(554.37, now + 0.7, 0.8);   // C#5
        playTone(440.00, now + 1.05, 1.4);  // A4
    } catch (e) {
        console.warn('Audio bell error:', e);
    }
}

function formatClockTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * 更新倒數計時畫面顯示
 */
export function updateTimerDisplay() {
    const timeDisplay = document.getElementById('exam-timer-digits');
    const progressBar = document.getElementById('exam-timer-progress-bar');
    const liveTimeText = document.getElementById('exam-timer-realtime-clock');

    if (timeDisplay) {
        timeDisplay.textContent = formatClockTime(remainingSeconds);
        timeDisplay.classList.toggle('text-rose-500', remainingSeconds <= 300 && remainingSeconds > 0);
        timeDisplay.classList.toggle('animate-pulse', remainingSeconds <= 60 && remainingSeconds > 0);
    }

    if (progressBar && totalDurationSeconds > 0) {
        const pct = Math.max(0, Math.min(100, (remainingSeconds / totalDurationSeconds) * 100));
        progressBar.style.width = `${pct}%`;
        if (pct < 15) {
            progressBar.className = 'h-full bg-gradient-to-r from-rose-500 to-amber-500 transition-all duration-300';
        } else {
            progressBar.className = 'h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-300';
        }
    }

    if (liveTimeText) {
        const now = new Date();
        liveTimeText.textContent = `現在時間：${now.toTimeString().slice(0, 8)}`;
    }
}

/**
 * 啟動計時
 */
export function startExamTimer() {
    if (isTimerRunning) return;
    if (remainingSeconds <= 0) remainingSeconds = totalDurationSeconds;

    isTimerRunning = true;
    updateTimerControlButtons();

    timerInterval = setInterval(() => {
        if (remainingSeconds > 0) {
            remainingSeconds--;
            updateTimerDisplay();
        } else {
            pauseExamTimer();
            playChimeBell();
            showToast(`時間到！「${currentSubject}」測驗結束，請停筆並依序收卷`, 'success');
        }
    }, 1000);
}

/**
 * 暫停計時
 */
export function pauseExamTimer() {
    isTimerRunning = false;
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    updateTimerControlButtons();
}

/**
 * 重設計時
 */
export function resetExamTimer() {
    pauseExamTimer();
    remainingSeconds = totalDurationSeconds;
    updateTimerDisplay();
    showToast('計時器已重設', 'info');
}

/**
 * 調整時間（增減分鐘）
 */
export function addTimerMinutes(mins) {
    const delta = mins * 60;
    totalDurationSeconds = Math.max(60, totalDurationSeconds + delta);
    remainingSeconds = Math.max(0, remainingSeconds + delta);
    updateTimerDisplay();
}

function updateTimerControlButtons() {
    const playPauseBtn = document.getElementById('exam-timer-play-btn');
    if (!playPauseBtn) return;
    if (isTimerRunning) {
        playPauseBtn.innerHTML = `<i class="fa-solid fa-pause mr-1.5 text-base"></i><span>暫停計時</span>`;
        playPauseBtn.className = 'px-8 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black text-base shadow-lg shadow-amber-500/25 transition-all cursor-pointer flex items-center justify-center';
    } else {
        playPauseBtn.innerHTML = `<i class="fa-solid fa-play mr-1.5 text-base"></i><span>開始考試</span>`;
        playPauseBtn.className = 'px-8 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-black text-base shadow-lg shadow-indigo-600/30 transition-all cursor-pointer flex items-center justify-center';
    }
}

/**
 * 渲染考試計時器全景畫面並連動出勤中樞
 */
export function renderExamTimerModal() {
    const modal = document.getElementById('exam-timer-modal');
    if (!modal) return;

    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;

    const classBadge = document.getElementById('exam-timer-class-badge');
    if (classBadge) classBadge.textContent = currentClass.name;

    // 自動連動出勤中樞：取得應到、實到與缺席名單
    const summary = getAttendanceSummaryForClass(currentClass, formatDate(new Date(), 'YYYY-MM-DD'));
    const expectedEl = document.getElementById('exam-att-expected');
    const arrivedEl = document.getElementById('exam-att-arrived');
    const absentEl = document.getElementById('exam-att-absent');
    const absentListEl = document.getElementById('exam-att-absent-list');

    if (expectedEl) expectedEl.textContent = summary.expected;
    if (arrivedEl) arrivedEl.textContent = summary.actualArrived;
    if (absentEl) absentEl.textContent = summary.leave + summary.absent;

    if (absentListEl) {
        const todayRecords = currentClass.attendanceRecords?.[formatDate(new Date(), 'YYYY-MM-DD')] || {};
        const missingSeats = Object.entries(todayRecords)
            .filter(([_, rec]) => rec.status === 'leave' || rec.status === 'absent')
            .map(([s]) => `${s}號`);

        absentListEl.textContent = missingSeats.length > 0 ? `缺考/請假：${missingSeats.join('、')}` : '全班到齊無缺考';
    }

    // 渲染預設分鐘按鈕列
    const presetContainer = document.getElementById('exam-timer-presets-container');
    if (presetContainer) {
        presetContainer.innerHTML = '';
        PRESET_MINUTES.forEach(mins => {
            const isCur = Math.round(totalDurationSeconds / 60) === mins;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `px-3.5 py-1.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
                isCur ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`;
            btn.textContent = `${mins} 分鐘`;
            btn.addEventListener('click', () => {
                totalDurationSeconds = mins * 60;
                remainingSeconds = totalDurationSeconds;
                pauseExamTimer();
                renderExamTimerModal();
            });
            presetContainer.appendChild(btn);
        });
    }

    updateTimerDisplay();
    updateTimerControlButtons();
}

export function openExamTimerModal() {
    const modal = document.getElementById('exam-timer-modal');
    if (!modal) return;
    renderExamTimerModal();
    openModal(modal);
}

export function initExamTimer() {
    document.getElementById('open-exam-timer-btn')?.addEventListener('click', openExamTimerModal);
    document.getElementById('mobile-sheet-timer-btn')?.addEventListener('click', () => {
        document.getElementById('mobile-more-sheet')?.classList.add('hidden');
        openExamTimerModal();
    });
    document.getElementById('close-exam-timer-btn')?.addEventListener('click', () => {
        pauseExamTimer();
        closeModal(document.getElementById('exam-timer-modal'));
    });

    // 播放/暫停
    document.getElementById('exam-timer-play-btn')?.addEventListener('click', () => {
        if (isTimerRunning) {
            pauseExamTimer();
        } else {
            startExamTimer();
        }
    });

    // 重設
    document.getElementById('exam-timer-reset-btn')?.addEventListener('click', resetExamTimer);

    // 快捷加時間
    document.getElementById('exam-timer-add-1m-btn')?.addEventListener('click', () => addTimerMinutes(1));
    document.getElementById('exam-timer-add-5m-btn')?.addEventListener('click', () => addTimerMinutes(5));

    // 科目變更
    document.getElementById('exam-timer-subject-select')?.addEventListener('change', (e) => {
        currentSubject = e.target.value;
        showToast(`已切換測驗科目為「${currentSubject}」`, 'info');
    });

    // 全螢幕投影切換
    document.getElementById('exam-timer-fullscreen-btn')?.addEventListener('click', () => {
        const modal = document.getElementById('exam-timer-modal');
        if (!modal) return;
        if (!document.fullscreenElement) {
            modal.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    });
}
