/**
 * 班級經營系統 - 模組 6：考試計時與考程排程系統 (examTimer.js)
 * 支援：
 * 1. 考程設定畫面：
 *    - 手動輸入考試內容（無選擇科目區塊）
 *    - 開始時間、結束時間與時長雙向連動推算
 *    - 快捷分鐘按鈕 (40, 45, 50)
 *    - 多考程排程清單 (新增、編輯、刪除、一鍵清除全部)
 *    - 考試小叮嚀注意事項
 *    - 右側深色即時投影預覽卡片、人數設定、投影開關
 * 2. 考試進行中大看板畫面：
 *    - 返回設定按鈕
 *    - 全螢幕按鈕（進入時變更為「離開全螢幕」與 fa-compress，並自動隱藏頁尾）
 *    - 左側今日考程場次清單
 *    - 右側大型投影看板：即時時鐘、狀態指示、超大考試標題、超大倒數計時外框、到考人數統計、注意事項卡片、微調按鈕
 *    - Web Audio API 考畢下課和弦鐘聲
 */

import { state } from '../state.js';
import { formatDate, generateId, showToast, escapeHtml, toggleAppFullscreen, showConfirmModal } from '../utils.js';
import { saveData } from '../storage.js';
import { isSoundEnabled } from './audioFx.js';
import { getAttendanceSummaryForClass } from './attendanceHub.js';

let isExamRunning = false;
let examTimerInterval = null;
let clockInterval = null;
let remainingSeconds = 45 * 60;
let totalDurationSeconds = 45 * 60;
let activeScheduleIndex = 0;

let editingScheduleId = null;

function ensureClassExamData(classObj) {
    if (!classObj) return null;
    if (!Array.isArray(classObj.examSchedules)) {
        classObj.examSchedules = [];
    } else {
        // 清除舊版本預設之示範測試考程 (避免造成使用者誤會)
        if (classObj.examSchedules.length === 1 &&
            classObj.examSchedules[0].content === '數學第一單元' &&
            classObj.examSchedules[0].startTime === '08:40' &&
            classObj.examSchedules[0].endTime === '09:25' &&
            !classObj.examSchedules[0].isCustomCreated) {
            classObj.examSchedules = [];
        }
    }
    if (typeof classObj.examNotes !== 'string') {
        classObj.examNotes = '';
    }
    if (!classObj.examSettings || typeof classObj.examSettings !== 'object') {
        classObj.examSettings = {
            showAttendance: true,
            showNotes: true,
            expected: 30,
            arrived: 30
        };
    }
    return classObj;
}

/**
 * 驗證 24 小時制時間字串 (HH:mm)
 */
export function isValid24HourTime(str) {
    if (!str || typeof str !== 'string') return false;
    const parts = str.trim().split(':');
    if (parts.length !== 2) return false;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return false;
    return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/**
 * 格式化為標準 24 小時制 HH:mm
 */
export function formatTime24(str) {
    if (!str || typeof str !== 'string') return '08:40';
    const clean = str.trim().replace('：', ':');
    const parts = clean.split(':');
    if (parts.length !== 2) return '08:40';
    const h = Math.min(23, Math.max(0, parseInt(parts[0], 10) || 0));
    const m = Math.min(59, Math.max(0, parseInt(parts[1], 10) || 0));
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * 將 HH:mm 轉換為當日第幾分鐘 (0 ~ 1439)
 */
export function timeToMinutes(str) {
    if (!str || !str.includes(':')) return 0;
    const [h, m] = str.split(':').map(x => parseInt(x, 10) || 0);
    return h * 60 + m;
}

/**
 * 將分鐘數轉換為 24 小時制 HH:mm
 */
export function minutesToTime(totalMins) {
    const wrapped = ((totalMins % 1440) + 1440) % 1440;
    const h = Math.floor(wrapped / 60);
    const m = wrapped % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * 依現有考程智慧推算下一場建議開始時間 (上一場結束 + 10 分鐘下課休息)
 */
export function getNextSuggestedStartTime(schedules) {
    if (!schedules || schedules.length === 0) {
        const now = new Date();
        const curMins = now.getHours() * 60 + now.getMinutes();
        const rounded = Math.ceil(curMins / 5) * 5;
        return minutesToTime(rounded);
    }
    const endMinutesList = schedules.map(s => timeToMinutes(s.endTime));
    const maxEnd = Math.max(...endMinutesList);
    return minutesToTime(maxEnd + 10);
}

/**
 * Web Audio API 合成經典考試下課鐘聲 (叮咚叮咚)
 */
function playExamBell() {
    if (typeof isSoundEnabled === 'function' && !isSoundEnabled()) return;
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();

        const playTone = (freq, startTime, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, startTime);
            gain.gain.setValueAtTime(0.35, startTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + duration);
        };

        const now = ctx.currentTime;
        playTone(554.37, now, 0.7);        // C#5
        playTone(659.25, now + 0.35, 0.7);  // E5
        playTone(554.37, now + 0.7, 0.7);   // C#5
        playTone(440.00, now + 1.05, 1.4);  // A4
    } catch (e) {
        console.warn('Exam audio bell error:', e);
    }
}

/**
 * 格式化秒數為 MM:SS 或 HH:MM:SS
 */
function formatCountdown(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * 計算 HH:mm 加上分鐘數後的 HH:mm
 */
function addMinutesToTime(timeStr, mins) {
    if (!timeStr || !timeStr.includes(':')) return '09:00';
    const [h, m] = timeStr.split(':').map(x => parseInt(x, 10));
    const totalM = (h * 60 + m + mins) % (24 * 60);
    const newH = Math.floor(totalM / 60);
    const newM = totalM % 60;
    return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

/**
 * 計算兩組 HH:mm 間的分鐘差
 */
function getMinutesBetween(startStr, endStr) {
    if (!startStr || !endStr || !startStr.includes(':') || !endStr.includes(':')) return 45;
    const [h1, m1] = startStr.split(':').map(x => parseInt(x, 10));
    const [h2, m2] = endStr.split(':').map(x => parseInt(x, 10));
    let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diff <= 0) diff += 24 * 60;
    return diff;
}

/**
 * 渲染考程設定畫面
 */
export function renderExamTimerSetup() {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassExamData(currentClass);

    // 班級標籤
    const classBadge = document.getElementById('exam-timer-class-badge');
    if (classBadge) classBadge.textContent = currentClass.name;

    // 1. 已排定考程清單
    const schedulesList = document.getElementById('exam-schedules-list');
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    if (schedulesList) {
        schedulesList.innerHTML = '';
        if (currentClass.examSchedules.length === 0) {
            schedulesList.innerHTML = `
                <div class="py-6 text-center text-stone-400 font-bold text-xs bg-stone-50 rounded-2xl border border-dashed border-stone-200">
                    尚無排定考程，請於上方輸入內容並新增考程
                </div>
            `;
        } else {
            currentClass.examSchedules.forEach((sch, idx) => {
                const sMin = timeToMinutes(sch.startTime);
                const eMin = timeToMinutes(sch.endTime);
                let statusBadge = '';
                if (nowMinutes < sMin) {
                    statusBadge = `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">未開始</span>`;
                } else if (nowMinutes >= sMin && nowMinutes <= eMin) {
                    statusBadge = `<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">進行中</span>`;
                } else {
                    statusBadge = `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-500">已結束</span>`;
                }

                const item = document.createElement('div');
                item.className = `p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 bg-white hover:border-amber-400 shadow-2xs ${
                    idx === activeScheduleIndex ? 'border-amber-400 ring-2 ring-amber-300/40 bg-amber-50/20' : 'border-stone-200'
                }`;

                item.innerHTML = `
                    <div class="flex items-center gap-3 min-w-0">
                        <span class="w-6 h-6 rounded-lg bg-stone-100 text-stone-700 flex items-center justify-center font-mono font-bold text-xs shrink-0">${idx + 1}</span>
                        <div class="min-w-0">
                            <div class="flex items-center gap-1.5 flex-wrap">
                                <h4 class="font-black text-stone-900 text-sm truncate">${escapeHtml(sch.content)}</h4>
                                ${statusBadge}
                            </div>
                            <p class="text-xs text-stone-500 font-mono">${sch.startTime} ~ ${sch.endTime} (${sch.durationMins} 分鐘)</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                        <button type="button" class="btn-select-schedule px-2.5 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs cursor-pointer active:scale-95" data-id="${sch.id}" title="選定為投影場次">
                            選擇
                        </button>
                        <button type="button" class="btn-edit-schedule p-1.5 rounded-xl hover:bg-stone-100 text-stone-500 hover:text-stone-800 transition-colors cursor-pointer" data-id="${sch.id}" title="編輯考程">
                            <i class="fa-solid fa-pen-to-square text-xs"></i>
                        </button>
                        <button type="button" class="btn-delete-schedule p-1.5 rounded-xl hover:bg-rose-50 text-stone-400 hover:text-rose-600 transition-colors cursor-pointer" data-id="${sch.id}" title="刪除考程">
                            <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                    </div>
                `;

                // 綁定項目操作
                item.querySelector('.btn-select-schedule')?.addEventListener('click', () => {
                    activeScheduleIndex = idx;
                    renderExamTimerSetup();
                    showToast(`已選定第 ${idx + 1} 場「${sch.content}」`, 'info');
                });

                item.querySelector('.btn-edit-schedule')?.addEventListener('click', () => {
                    editingScheduleId = sch.id;
                    const contentInput = document.getElementById('exam-setup-content-input');
                    const startInput = document.getElementById('exam-setup-start-time');
                    const endInput = document.getElementById('exam-setup-end-time');
                    const addBtn = document.getElementById('exam-add-schedule-btn');

                    if (contentInput) contentInput.value = sch.content;
                    if (startInput) startInput.value = sch.startTime;
                    if (endInput) endInput.value = sch.endTime;
                    if (addBtn) addBtn.innerHTML = `<i class="fa-solid fa-check mr-1.5"></i><span>儲存修改考程</span>`;
                    contentInput?.focus();
                });

                item.querySelector('.btn-delete-schedule')?.addEventListener('click', () => {
                    currentClass.examSchedules = currentClass.examSchedules.filter(s => s.id !== sch.id);
                    if (activeScheduleIndex >= currentClass.examSchedules.length) {
                        activeScheduleIndex = Math.max(0, currentClass.examSchedules.length - 1);
                    }
                    saveData();
                    renderExamTimerSetup();
                    showToast('已刪除該考程場次', 'info');
                });

                schedulesList.appendChild(item);
            });
        }
    }

    // 2. 右側投影預覽
    const hasSchedules = currentClass.examSchedules.length > 0;
    const activeSch = hasSchedules ? (currentClass.examSchedules[activeScheduleIndex] || currentClass.examSchedules[0]) : null;

    const prevTitle = document.getElementById('exam-preview-subject-title');
    const prevDigits = document.getElementById('exam-preview-digits');
    const prevAtt = document.getElementById('exam-preview-attendance-text');
    const prevNotes = document.getElementById('exam-preview-notes-box');

    if (prevTitle) prevTitle.textContent = activeSch ? activeSch.content : '尚未排定考程';
    if (prevDigits) prevDigits.textContent = activeSch ? `${activeSch.durationMins}:00` : '--:--';

    // 自動連動出勤中樞計算人數
    const attSummary = getAttendanceSummaryForClass(currentClass, formatDate(new Date(), 'YYYY-MM-DD'));
    const expectedInput = document.getElementById('exam-setup-expected-input');
    const arrivedInput = document.getElementById('exam-setup-arrived-input');

    if (expectedInput && !expectedInput.dataset.modified) {
        expectedInput.value = attSummary.expected || 30;
    }
    if (arrivedInput && !arrivedInput.dataset.modified) {
        arrivedInput.value = attSummary.actualArrived || attSummary.expected || 30;
    }

    const expVal = parseInt(expectedInput?.value, 10) || 30;
    const arrVal = parseInt(arrivedInput?.value, 10) || 30;

    if (prevAtt) prevAtt.textContent = `應到 ${expVal} · 實到 ${arrVal}`;

    const notesTextarea = document.getElementById('exam-setup-notes-textarea');
    if (notesTextarea && document.activeElement !== notesTextarea) {
        notesTextarea.value = currentClass.examNotes;
    }
    if (prevNotes) {
        prevNotes.textContent = currentClass.examNotes || '請專心作答';
    }
}

/**
 * 切換目前投影進行中的考試場次
 */
function switchRunningSchedule(idx) {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass || !currentClass.examSchedules[idx]) return;
    activeScheduleIndex = idx;
    const sch = currentClass.examSchedules[idx];

    const runningTitle = document.getElementById('exam-running-title');
    if (runningTitle) runningTitle.textContent = sch.content;

    totalDurationSeconds = (sch.durationMins || 45) * 60;
    remainingSeconds = totalDurationSeconds;

    updateCountdownUI();
    renderRunningSchedulesList(currentClass);
    showToast(`已切換投影場次為第 ${idx + 1} 場「${sch.content}」`, 'info');
}

/**
 * 渲染執行中左側考程清單
 */
function renderRunningSchedulesList(currentClass) {
    const runningList = document.getElementById('exam-running-schedules-list');
    if (!runningList) return;
    runningList.innerHTML = '';
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    currentClass.examSchedules.forEach((sch, idx) => {
        const isCur = idx === activeScheduleIndex;
        const sMin = timeToMinutes(sch.startTime);
        const eMin = timeToMinutes(sch.endTime);

        let statusBadge = '';
        if (nowMinutes < sMin) {
            statusBadge = `<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-black">未開始</span>`;
        } else if (nowMinutes >= sMin && nowMinutes <= eMin) {
            statusBadge = `<span class="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-black animate-pulse">進行中</span>`;
        } else {
            statusBadge = `<span class="px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 text-[10px] font-black">已結束</span>`;
        }

        const el = document.createElement('button');
        el.type = 'button';
        el.className = `w-full p-3 rounded-2xl border text-left transition-all cursor-pointer ${
            isCur ? 'bg-amber-50 border-amber-400 shadow-xs ring-2 ring-amber-300/40' : 'bg-white border-stone-200 hover:border-amber-300'
        }`;
        el.innerHTML = `
            <div class="flex items-center justify-between gap-1">
                <span class="text-xs font-black truncate ${isCur ? 'text-amber-900' : 'text-stone-800'}">${idx + 1}. ${escapeHtml(sch.content)}</span>
                ${statusBadge}
            </div>
            <p class="text-[11px] text-stone-500 font-mono mt-0.5">${sch.startTime} ~ ${sch.endTime} (${sch.durationMins}分)</p>
        `;
        el.addEventListener('click', () => {
            if (activeScheduleIndex !== idx) {
                switchRunningSchedule(idx);
            }
        });
        runningList.appendChild(el);
    });
}

/**
 * 進入大看板考試計時執行畫面
 */
export function startExamSession() {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassExamData(currentClass);

    if (currentClass.examSchedules.length === 0) {
        showToast('尚無排定任何考試考程，請先新增考程！', 'warning');
        return;
    }

    const activeSch = currentClass.examSchedules[activeScheduleIndex] || currentClass.examSchedules[0];

    // 切換畫面 View
    document.getElementById('exam-timer-setup-view')?.classList.add('hidden');
    document.getElementById('exam-timer-running-view')?.classList.remove('hidden');

    const runningClassBadge = document.getElementById('exam-running-class-badge');
    if (runningClassBadge) runningClassBadge.textContent = currentClass.name;

    const runningTitle = document.getElementById('exam-running-title');
    if (runningTitle) runningTitle.textContent = activeSch.content;

    totalDurationSeconds = (activeSch.durationMins || 45) * 60;
    remainingSeconds = totalDurationSeconds;

    // 左側今日考程清單 (支援即時點選切換)
    renderRunningSchedulesList(currentClass);

    // 人數設定與開關
    const showAtt = document.getElementById('exam-toggle-show-attendance')?.checked !== false;
    const expVal = parseInt(document.getElementById('exam-setup-expected-input')?.value, 10) || 30;
    const arrVal = parseInt(document.getElementById('exam-setup-arrived-input')?.value, 10) || 30;
    const absentVal = Math.max(0, expVal - arrVal);

    const attEl = document.getElementById('exam-running-attendance');
    if (attEl) {
        attEl.style.display = showAtt ? 'block' : 'none';
        attEl.textContent = `應到 ${expVal} · 實到 ${arrVal} · 缺席 ${absentVal}`;
    }

    // 注意事項
    const showNotes = document.getElementById('exam-toggle-show-notes')?.checked !== false;
    const notesEl = document.getElementById('exam-running-notes');
    if (notesEl) {
        notesEl.style.display = showNotes && currentClass.examNotes ? 'block' : 'none';
        notesEl.textContent = currentClass.examNotes || '';
    }

    // 啟動即時系統時鐘
    if (clockInterval) clearInterval(clockInterval);
    const updateRealClock = () => {
        const clockEl = document.getElementById('exam-running-clock');
        if (clockEl) {
            const now = new Date();
            clockEl.textContent = now.toTimeString().slice(0, 8);
        }
    };
    updateRealClock();
    clockInterval = setInterval(updateRealClock, 1000);

    // 啟動倒數計時
    isExamRunning = true;
    updateRunningDigits();
    updatePlayPauseButtonUI();

    if (examTimerInterval) clearInterval(examTimerInterval);
    examTimerInterval = setInterval(() => {
        if (isExamRunning) {
            if (remainingSeconds > 0) {
                remainingSeconds--;
                updateRunningDigits();
            } else {
                isExamRunning = false;
                clearInterval(examTimerInterval);
                examTimerInterval = null;
                updatePlayPauseButtonUI();
                playExamBell();
                showToast(`考試時間到！請停筆並依序收卷`, 'success');
            }
        }
    }, 1000);
}

function updateRunningDigits() {
    const digitsEl = document.getElementById('exam-running-digits');
    if (digitsEl) {
        digitsEl.textContent = formatCountdown(remainingSeconds);
        if (remainingSeconds <= 300 && remainingSeconds > 0) {
            digitsEl.classList.add('text-rose-600');
        } else {
            digitsEl.classList.remove('text-rose-600');
        }
    }
}

function updatePlayPauseButtonUI() {
    const btn = document.getElementById('exam-running-play-pause-btn');
    if (!btn) return;
    if (isExamRunning) {
        btn.innerHTML = `<i class="fa-solid fa-pause"></i><span>暫停</span>`;
        btn.className = 'px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs sm:text-sm shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95';
    } else {
        btn.innerHTML = `<i class="fa-solid fa-play"></i><span>繼續</span>`;
        btn.className = 'px-5 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-900 text-white font-black text-xs sm:text-sm shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95';
    }
}

/**
 * 返回考程設定畫面
 */
export function returnToExamSetup() {
    if (examTimerInterval) {
        clearInterval(examTimerInterval);
        examTimerInterval = null;
    }
    if (clockInterval) {
        clearInterval(clockInterval);
        clockInterval = null;
    }
    isExamRunning = false;

    document.getElementById('exam-timer-running-view')?.classList.add('hidden');
    document.getElementById('exam-timer-setup-view')?.classList.remove('hidden');
    renderExamTimerSetup();
}

/**
 * 全螢幕圖標與文字切換監聽
 */
export function updateExamFullscreenButtonUI() {
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const fsIcon = document.getElementById('exam-fs-icon');
    const fsText = document.getElementById('exam-fs-text');
    const fsBtn = document.getElementById('exam-timer-fullscreen-btn');

    if (fsIcon) {
        fsIcon.className = isFs ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
    }
    if (fsText) {
        fsText.textContent = isFs ? '離開全螢幕' : '全螢幕';
    }
    if (fsBtn) {
        if (isFs) {
            fsBtn.classList.remove('bg-rose-600', 'hover:bg-rose-700', 'border-rose-500');
            fsBtn.classList.add('bg-stone-800', 'hover:bg-stone-900', 'border-stone-700');
        } else {
            fsBtn.classList.add('bg-rose-600', 'hover:bg-rose-700', 'border-rose-500');
            fsBtn.classList.remove('bg-stone-800', 'hover:bg-stone-900', 'border-stone-700');
        }
    }
}

function updatePresetDurationUI(mins) {
    document.querySelectorAll('.exam-duration-preset-btn').forEach(btn => {
        const btnMins = parseInt(btn.dataset.mins, 10);
        if (btnMins === mins) {
            btn.className = 'exam-duration-preset-btn px-3 py-1.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 font-black text-xs transition-all cursor-pointer shadow-xs ring-2 ring-amber-300/40';
        } else {
            btn.className = 'exam-duration-preset-btn px-3 py-1.5 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 font-bold text-xs transition-colors cursor-pointer';
        }
    });
}

/**
 * 初始化考試計時模組與雙向連動事件
 */
export function initExamTimer() {
    const startInput = document.getElementById('exam-setup-start-time');
    const endInput = document.getElementById('exam-setup-end-time');
    const customDurationInput = document.getElementById('exam-setup-duration-input');

    // 預設當前時間與 +45 分鐘
    if (startInput && !startInput.value) {
        const now = new Date();
        startInput.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        if (endInput && !endInput.value) {
            endInput.value = addMinutesToTime(startInput.value, 45);
        }
    }
    const initDur = parseInt(customDurationInput?.value, 10) || 45;
    updatePresetDurationUI(initDur);

    // 1. 開始時間修改 -> 自動連動結束時間
    startInput?.addEventListener('change', () => {
        const dur = parseInt(customDurationInput?.value, 10) || 45;
        if (endInput) {
            endInput.value = addMinutesToTime(startInput.value, dur);
        }
        renderExamTimerSetup();
    });

    // 2. 結束時間修改 -> 自動計算時長
    endInput?.addEventListener('change', () => {
        if (startInput && endInput) {
            const diff = getMinutesBetween(startInput.value, endInput.value);
            if (customDurationInput) customDurationInput.value = diff;
            updatePresetDurationUI(diff);
        }
        renderExamTimerSetup();
    });

    // 3. 快捷時長按鈕 (40, 45, 50)
    document.querySelectorAll('.exam-duration-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mins = parseInt(btn.dataset.mins, 10);
            if (customDurationInput) customDurationInput.value = mins;
            updatePresetDurationUI(mins);
            if (startInput && endInput) {
                endInput.value = addMinutesToTime(startInput.value, mins);
            }
            renderExamTimerSetup();
        });
    });

    // 4. 自訂時長輸入
    customDurationInput?.addEventListener('input', () => {
        const mins = parseInt(customDurationInput.value, 10) || 45;
        updatePresetDurationUI(mins);
        if (startInput && endInput) {
            endInput.value = addMinutesToTime(startInput.value, mins);
        }
        renderExamTimerSetup();
    });
    customDurationInput?.addEventListener('change', () => {
        const mins = parseInt(customDurationInput.value, 10) || 45;
        updatePresetDurationUI(mins);
        if (startInput && endInput) {
            endInput.value = addMinutesToTime(startInput.value, mins);
        }
        renderExamTimerSetup();
    });

    // 5. 新增/儲存考程按鈕
    document.getElementById('exam-add-schedule-btn')?.addEventListener('click', () => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (!currentClass) return;
        ensureClassExamData(currentClass);

        const contentInput = document.getElementById('exam-setup-content-input');
        const content = contentInput?.value.trim() || '測驗考程';
        const sTime = startInput?.value || '08:40';
        const eTime = endInput?.value || '09:25';
        const dur = parseInt(customDurationInput?.value, 10) || getMinutesBetween(sTime, eTime);

        if (editingScheduleId) {
            const target = currentClass.examSchedules.find(s => s.id === editingScheduleId);
            if (target) {
                target.content = content;
                target.startTime = sTime;
                target.endTime = eTime;
                target.durationMins = dur;
                showToast(`已更新考程「${content}」`, 'success');
            }
            editingScheduleId = null;
            const addBtn = document.getElementById('exam-add-schedule-btn');
            if (addBtn) addBtn.innerHTML = `<i class="fa-solid fa-plus mr-1.5"></i><span>新增考程</span>`;
        } else {
            currentClass.examSchedules.push({
                id: generateId(),
                content,
                startTime: sTime,
                endTime: eTime,
                durationMins: dur
            });
            showToast(`已新增考程「${content}」(${dur}分鐘)`, 'success');
        }

        if (contentInput) contentInput.value = '';
        saveData();
        renderExamTimerSetup();
    });

    // 6. 清除全部考程
    document.getElementById('exam-clear-all-schedules-btn')?.addEventListener('click', () => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (!currentClass) return;
        if (confirm('確定要清除所有已排定的考程場次嗎？')) {
            currentClass.examSchedules = [];
            activeScheduleIndex = 0;
            editingScheduleId = null;
            saveData();
            renderExamTimerSetup();
            showToast('已清空所有考程排程', 'info');
        }
    });

    // 7. 小叮嚀注意事項保存
    document.getElementById('exam-setup-notes-textarea')?.addEventListener('change', (e) => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (!currentClass) return;
        ensureClassExamData(currentClass);
        currentClass.examNotes = e.target.value;
        saveData();
        renderExamTimerSetup();
    });

    // 8. 人數修改監聽
    ['exam-setup-expected-input', 'exam-setup-arrived-input'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', (e) => {
            e.target.dataset.modified = 'true';
            renderExamTimerSetup();
        });
    });

    // 9. 一鍵開啟段考模式
    document.getElementById('exam-start-session-btn')?.addEventListener('click', startExamSession);

    // 10. 返回設定
    document.getElementById('exam-return-setup-btn')?.addEventListener('click', returnToExamSetup);

    // 11. 全螢幕切換按鈕
    document.getElementById('exam-timer-fullscreen-btn')?.addEventListener('click', () => {
        toggleAppFullscreen();
    });

    // 12. 大看板操作列
    document.getElementById('exam-running-play-pause-btn')?.addEventListener('click', () => {
        isExamRunning = !isExamRunning;
        updatePlayPauseButtonUI();
    });

    document.getElementById('exam-running-reset-btn')?.addEventListener('click', () => {
        remainingSeconds = totalDurationSeconds;
        updateRunningDigits();
        showToast('已重設計時時間', 'info');
    });

    document.getElementById('exam-running-add1-btn')?.addEventListener('click', () => {
        remainingSeconds += 60;
        updateRunningDigits();
        showToast('延長 1 分鐘', 'info');
    });

    document.getElementById('exam-running-add5-btn')?.addEventListener('click', () => {
        remainingSeconds += 300;
        updateRunningDigits();
        showToast('延長 5 分鐘', 'info');
    });

    // 監聽全域全螢幕事件，自動更新按鈕文字與圖標
    document.addEventListener('fullscreenchange', updateExamFullscreenButtonUI);
    document.addEventListener('webkitfullscreenchange', updateExamFullscreenButtonUI);
}

window.renderExamTimerModal = renderExamTimerSetup;
