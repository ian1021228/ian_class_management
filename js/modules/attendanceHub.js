/**
 * 班級經營系統 - 模組 2：自主遲到簽到與出勤中樞 (attendanceHub.js) ★核心功能
 *
 * 核心特色：
 * 1. 【學生觸控自助簽到 (Touch Kiosk)】：投放在教室電子白板或平板，學生進教室點選自己座號即可簽到。
 * 2. 【自動遲到判定】：依設定基準時間 (預設 07:50)，超過時間打卡自動判定為「遲到」並標註橙色，否則為「準時出席」。
 * 3. 【自訂應到與實到即時統計】：頂部提供應到人數微調器 (±)，自動統計實到人數與到校百分比。
 * 4. 【已簽到狀態快速切換】：點選已簽到學生卡片彈出快速選單，支援切換「出席 / 遲到 / 請假 / 缺席 / 取消未到」，並可填寫備註。
 * 5. 【一鍵全員到齊 & Excel 雙工作表匯出】。
 */

import { state } from '../state.js';
import { formatDate, showToast, escapeHtml, showConfirmModal } from '../utils.js';
import { saveData } from '../storage.js';
import { getActiveSeatsForClass, getStudentDisplayName, getStudentNameOnly, spawnScorePop } from './classWizard.js';

export const ATTENDANCE_STATUS_META = {
    present: {
        key: 'present',
        label: '準時出席',
        short: '出席',
        icon: 'fa-circle-check',
        bgClass: 'bg-emerald-500 text-white border-emerald-600 shadow-emerald-500/20',
        softClass: 'bg-emerald-50 text-emerald-700 border-emerald-200'
    },
    late: {
        key: 'late',
        label: '遲到',
        short: '遲到',
        icon: 'fa-clock',
        bgClass: 'bg-amber-500 text-white border-amber-600 shadow-amber-500/20',
        softClass: 'bg-amber-50 text-amber-800 border-amber-300'
    },
    leave: {
        key: 'leave',
        label: '請假',
        short: '請假',
        icon: 'fa-notes-medical',
        bgClass: 'bg-sky-500 text-white border-sky-600 shadow-sky-500/20',
        softClass: 'bg-sky-50 text-sky-700 border-sky-200'
    },
    absent: {
        key: 'absent',
        label: '缺席曠課',
        short: '缺席',
        icon: 'fa-circle-exclamation',
        bgClass: 'bg-rose-500 text-white border-rose-600 shadow-rose-500/20',
        softClass: 'bg-rose-50 text-rose-700 border-rose-200'
    },
    unmarked: {
        key: 'unmarked',
        label: '尚未簽到',
        short: '未到',
        icon: 'fa-user',
        bgClass: 'bg-white text-slate-700 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/30',
        softClass: 'bg-slate-100 text-slate-600 border-slate-200'
    }
};

let selectedAttendanceDate = formatDate(new Date(), 'YYYY-MM-DD');
let clockIntervalId = null;
let currentModalSeat = null;

/**
 * 確保目前班級的出勤資料結構完整
 */
export function ensureClassAttendanceData(classObj) {
    if (!classObj) return;
    if (!classObj.attendanceRecords || typeof classObj.attendanceRecords !== 'object') {
        classObj.attendanceRecords = {};
    }
    if (!classObj.attendanceSettings || typeof classObj.attendanceSettings !== 'object') {
        classObj.attendanceSettings = {
            lateTime: '07:50'
        };
    }
    if (!classObj.attendanceRecords[selectedAttendanceDate]) {
        classObj.attendanceRecords[selectedAttendanceDate] = {};
    }
}

/**
 * 取得特定學生在特定日期的出勤紀錄
 */
export function getStudentAttendanceForDate(classId, seat, dateStr = formatDate(new Date(), 'YYYY-MM-DD')) {
    const c = (state.appData?.classes || []).find(cls => cls.id === classId);
    if (!c || !c.attendanceRecords || !c.attendanceRecords[dateStr]) return null;
    return c.attendanceRecords[dateStr][String(seat)] || null;
}

/**
 * 跨模組輔助：判斷學生今日是否「請假」或「缺席」
 */
export function isStudentAbsentOrLeaveToday(classId, seat) {
    const rec = getStudentAttendanceForDate(classId, seat);
    if (!rec) return false;
    return rec.status === 'leave' || rec.status === 'absent';
}

/**
 * 統計某班今日出勤摘要（供頂部抽屜、考試計時器與出勤面板共用）
 */
export function getAttendanceSummaryForClass(classObj, dateStr = formatDate(new Date(), 'YYYY-MM-DD')) {
    if (!classObj) return { expected: 0, present: 0, late: 0, leave: 0, absent: 0, unmarked: 0, actualArrived: 0 };
    const seats = getActiveSeatsForClass(classObj);
    const dayRecords = classObj.attendanceRecords?.[dateStr] || {};

    let present = 0, late = 0, leave = 0, absent = 0, unmarked = 0;
    seats.forEach(seat => {
        const st = dayRecords[String(seat)]?.status || 'unmarked';
        if (st === 'present') present++;
        else if (st === 'late') late++;
        else if (st === 'leave') leave++;
        else if (st === 'absent') absent++;
        else unmarked++;
    });

    const expected = seats.length;

    return {
        expected,
        present,
        late,
        leave,
        absent,
        unmarked,
        actualArrived: present + late
    };
}

/**
 * 判斷打卡時間字串 ("HH:MM:SS") 是否超過遲到基準 ("HH:MM")
 */
function isTimeAfterLateCutoff(nowTimeHHMM, cutoffHHMM) {
    if (!cutoffHHMM) return false;
    return nowTimeHHMM > cutoffHHMM;
}

/**
 * 學生自助簽到
 */
export function markStudentAttendance(seat, clientEvent = null) {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassAttendanceData(currentClass);

    const dayMap = currentClass.attendanceRecords[selectedAttendanceDate];
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const timeStr = `${hh}:${mm}:${ss}`;
    const cutoff = currentClass.attendanceSettings.lateTime || '07:50';

    const isLate = isTimeAfterLateCutoff(`${hh}:${mm}`, cutoff);
    const newStatus = isLate ? 'late' : 'present';
    dayMap[String(seat)] = {
        status: newStatus,
        time: timeStr,
        note: isLate ? `超過 ${cutoff} 遲到簽到` : '準時到校'
    };

    if (isLate && clientEvent) {
        spawnScorePop(clientEvent.clientX, clientEvent.clientY, `遲到 ${hh}:${mm}`, false);
    } else if (!isLate && clientEvent) {
        spawnScorePop(clientEvent.clientX, clientEvent.clientY, '準時出席', true);
    }

    saveData();
    renderAttendanceHub();
    const disp = getStudentDisplayName(currentClass, seat, true);
    showToast(
        isLate
            ? `${disp} 已簽到（${timeStr} 遲到，基準 ${cutoff}）`
            : `${disp} 準時簽到成功（${timeStr}）！`,
        isLate ? 'info' : 'success'
    );
}

// ==========================================
// 24小時制出勤時間滾輪 (24hr Time Wheel Picker)
// ==========================================
let wheelHour = 7;
let wheelMinute = 50;
let wheelSecond = 0;
let isWheelInitialized = false;
let isProgrammaticWheelScroll = false;

export function initAttendanceTimeWheel() {
    const hourList = document.getElementById('att-wheel-hour-list');
    const minList = document.getElementById('att-wheel-minute-list');
    const secList = document.getElementById('att-wheel-second-list');
    if (!hourList || !minList || !secList) return;
    if (isWheelInitialized && hourList.children.length > 0) return;

    hourList.innerHTML = '';
    for (let h = 0; h < 24; h++) {
        const item = document.createElement('div');
        item.className = 'att-wheel-item h-9 flex items-center justify-center font-mono font-bold text-sm text-stone-400 hover:text-amber-800 cursor-pointer snap-center transition-colors select-none';
        item.dataset.val = h;
        item.textContent = String(h).padStart(2, '0');
        item.addEventListener('click', () => setWheelTime(h, wheelMinute, wheelSecond, true));
        hourList.appendChild(item);
    }

    minList.innerHTML = '';
    for (let m = 0; m < 60; m++) {
        const item = document.createElement('div');
        item.className = 'att-wheel-item h-9 flex items-center justify-center font-mono font-bold text-sm text-stone-400 hover:text-amber-800 cursor-pointer snap-center transition-colors select-none';
        item.dataset.val = m;
        item.textContent = String(m).padStart(2, '0');
        item.addEventListener('click', () => setWheelTime(wheelHour, m, wheelSecond, true));
        minList.appendChild(item);
    }

    secList.innerHTML = '';
    for (let s = 0; s < 60; s++) {
        const item = document.createElement('div');
        item.className = 'att-wheel-item h-9 flex items-center justify-center font-mono font-bold text-sm text-stone-400 hover:text-amber-800 cursor-pointer snap-center transition-colors select-none';
        item.dataset.val = s;
        item.textContent = String(s).padStart(2, '0');
        item.addEventListener('click', () => setWheelTime(wheelHour, wheelMinute, s, true));
        secList.appendChild(item);
    }

    const bindScroll = (container, onSnap) => {
        let scrollTimeout = null;
        container.addEventListener('scroll', () => {
            if (isProgrammaticWheelScroll) return;
            if (scrollTimeout) clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                const itemHeight = 36;
                const idx = Math.max(0, Math.min(container.children.length - 1, Math.round(container.scrollTop / itemHeight)));
                container.scrollTop = idx * itemHeight;
                onSnap(idx);
            }, 90);
        }, { passive: true });
    };

    bindScroll(hourList, (h) => setWheelTime(h, wheelMinute, wheelSecond, false));
    bindScroll(minList, (m) => setWheelTime(wheelHour, m, wheelSecond, false));
    bindScroll(secList, (s) => setWheelTime(wheelHour, wheelMinute, s, false));

    isWheelInitialized = true;
}

export function setWheelTime(h, m, s, scrollUI = true) {
    const displayEl = document.getElementById('att-wheel-display');
    const inputEl = document.getElementById('att-modal-time-input');
    const hourList = document.getElementById('att-wheel-hour-list');
    const minList = document.getElementById('att-wheel-minute-list');
    const secList = document.getElementById('att-wheel-second-list');

    if (h === null || h === undefined || isNaN(h)) {
        if (displayEl) displayEl.textContent = '-- : -- : --';
        if (inputEl) inputEl.value = '';
        return;
    }

    wheelHour = Math.max(0, Math.min(23, Number(h)));
    wheelMinute = Math.max(0, Math.min(59, Number(m)));
    wheelSecond = Math.max(0, Math.min(59, Number(s || 0)));

    const hStr = String(wheelHour).padStart(2, '0');
    const mStr = String(wheelMinute).padStart(2, '0');
    const sStr = String(wheelSecond).padStart(2, '0');

    if (displayEl) displayEl.textContent = `${hStr} : ${mStr} : ${sStr}`;
    if (inputEl) inputEl.value = `${hStr}:${mStr}:${sStr}`;

    const updateActiveItem = (list, activeVal) => {
        if (!list || list.children.length === 0) return;
        Array.from(list.children).forEach(child => {
            const val = Number(child.dataset.val);
            if (val === activeVal) {
                child.className = 'att-wheel-item h-9 flex items-center justify-center font-mono font-black text-base text-amber-950 snap-center transition-colors select-none';
            } else {
                child.className = 'att-wheel-item h-9 flex items-center justify-center font-mono font-bold text-sm text-stone-400 hover:text-stone-700 snap-center transition-colors select-none';
            }
        });
        if (scrollUI) {
            isProgrammaticWheelScroll = true;
            list.scrollTop = activeVal * 36;
            setTimeout(() => {
                isProgrammaticWheelScroll = false;
            }, 60);
        }
    };

    updateActiveItem(hourList, wheelHour);
    updateActiveItem(minList, wheelMinute);
    updateActiveItem(secList, wheelSecond);
}

/**
 * 開啟出勤狀態切換選單彈窗
 */
export function openAttendanceStatusModal(seat) {
    const modal = document.getElementById('attendance-status-modal');
    if (!modal) return;
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    currentModalSeat = seat;

    const sName = getStudentDisplayName(currentClass, seat, true);
    const seatEl = document.getElementById('att-modal-student-seat');
    const nameEl = document.getElementById('att-modal-student-name');
    const statusEl = document.getElementById('att-modal-current-status');
    const noteInp = document.getElementById('att-modal-note-input');

    if (seatEl) seatEl.textContent = `${seat}號`;
    if (nameEl) nameEl.textContent = sName;

    const dayMap = currentClass.attendanceRecords[selectedAttendanceDate] || {};
    const existing = dayMap[String(seat)];
    const meta = ATTENDANCE_STATUS_META[existing?.status] || ATTENDANCE_STATUS_META.unmarked;
    if (statusEl) statusEl.textContent = `目前狀態：${meta.label} (${existing?.time || '尚未打卡'}${existing?.isModified ? ' · 已修改' : ''})`;
    if (noteInp) noteInp.value = existing?.note || '';

    modal.classList.remove('hidden');

    // 初始化並同步 24hr 時間滾輪（彈窗顯示後執行，以保證正確計算元素高度與滾動偏移）
    initAttendanceTimeWheel();
    if (existing?.time) {
        const parts = existing.time.split(':');
        const h = parseInt(parts[0], 10) || 0;
        const m = parseInt(parts[1], 10) || 0;
        const s = parseInt(parts[2], 10) || 0;
        setWheelTime(h, m, s, false);
        setTimeout(() => setWheelTime(h, m, s, true), 40);
    } else {
        const now = new Date();
        setWheelTime(now.getHours(), now.getMinutes(), now.getSeconds(), false);
        setTimeout(() => setWheelTime(now.getHours(), now.getMinutes(), now.getSeconds(), true), 40);
    }
}

/**
 * 關閉出勤狀態切換選單彈窗
 */
export function closeAttendanceStatusModal() {
    const modal = document.getElementById('attendance-status-modal');
    if (modal) modal.classList.add('hidden');
    currentModalSeat = null;
}

/**
 * 渲染遲到簽到與出勤中樞主畫面
 */
export function renderAttendanceHub() {
    const page = document.getElementById('attendance-page') || document.getElementById('attendance-hub-modal');
    if (!page) return;

    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassAttendanceData(currentClass);

    const classBadge = document.getElementById('attendance-class-badge');
    if (classBadge) classBadge.textContent = currentClass.name;

    const dateDisplay = document.getElementById('attendance-date-display');
    if (dateDisplay) dateDisplay.textContent = selectedAttendanceDate;

    const lateTimeDisplay = document.getElementById('attendance-late-time-display');
    if (lateTimeDisplay) {
        lateTimeDisplay.textContent = currentClass.attendanceSettings.lateTime || '07:50';
    }

    const dateInput = document.getElementById('attendance-date-input');
    if (dateInput && dateInput.value !== selectedAttendanceDate) {
        dateInput.value = selectedAttendanceDate;
    }

    const lateTimeInput = document.getElementById('attendance-late-time-input');
    if (lateTimeInput) {
        lateTimeInput.value = currentClass.attendanceSettings.lateTime || '07:50';
    }

    // 更新摘要數字與應到/實到比例
    const summary = getAttendanceSummaryForClass(currentClass, selectedAttendanceDate);
    const setElText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    setElText('att-stat-expected', summary.expected);
    setElText('att-stat-expected-display', summary.expected);
    setElText('att-stat-present-total', summary.actualArrived);
    setElText('att-stat-present', summary.present);
    setElText('att-stat-late', summary.late);
    setElText('att-stat-leave', summary.leave);
    setElText('att-stat-absent', summary.absent);
    setElText('att-stat-unmarked', summary.unmarked);

    const expInput = document.getElementById('att-expected-input');
    if (expInput) expInput.value = summary.expected;

    const rateText = document.getElementById('att-stat-rate-text');
    if (rateText) {
        const rate = summary.expected > 0 ? Math.round((summary.actualArrived / summary.expected) * 100) : 0;
        rateText.textContent = `出席率: ${rate}% (${summary.actualArrived}/${summary.expected})`;
    }

    // 啟動實時時鐘
    if (!clockIntervalId) {
        const updateClock = () => {
            const clockEl = document.getElementById('attendance-live-clock');
            if (clockEl) {
                clockEl.textContent = new Date().toTimeString().slice(0, 8);
            }
        };
        updateClock();
        clockIntervalId = setInterval(updateClock, 1000);
    }

    // 渲染學生打卡網格
    const grid = document.getElementById('attendance-seat-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const seats = getActiveSeatsForClass(currentClass);
    const dayRecords = currentClass.attendanceRecords[selectedAttendanceDate] || {};

    seats.forEach(seat => {
        const rec = dayRecords[String(seat)];
        const stKey = rec?.status || 'unmarked';
        const meta = ATTENDANCE_STATUS_META[stKey] || ATTENDANCE_STATUS_META.unmarked;
        const sName = getStudentNameOnly(currentClass, seat);

        const card = document.createElement('button');
        card.type = 'button';
        card.className = `ios-spring relative rounded-2xl p-3.5 sm:p-4 border text-left flex flex-col justify-between min-h-[96px] cursor-pointer select-none shadow-xs transition-all ${meta.bgClass}`;
        card.dataset.seat = seat;

        card.innerHTML = `
            <div class="flex items-center justify-between w-full gap-1">
                <span class="text-xl sm:text-2xl font-black font-mono leading-none">${seat}<span class="text-xs font-bold ml-0.5">號</span></span>
                <span class="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-black/15 backdrop-blur-xs flex items-center gap-1">
                    <i class="fa-solid ${meta.icon} text-[10px]"></i>
                    <span>${meta.short}</span>
                </span>
            </div>
            <div class="mt-2 truncate font-extrabold text-sm sm:text-base ${stKey === 'unmarked' ? 'text-slate-800' : 'text-white'}">
                ${sName ? escapeHtml(sName) : `學生 ${seat} 號`}
            </div>
            <div class="mt-1 flex items-center justify-between text-[11px] font-mono opacity-85">
                <span>${rec?.time ? `<i class="fa-regular fa-clock mr-1"></i>${rec.time}${rec.isModified ? ' <span class="text-[9px] bg-black/25 px-1 py-0.5 rounded text-white font-black ml-1">已修改</span>' : ''}` : '點擊簽到'}</span>
            </div>
        `;

        card.addEventListener('click', (e) => {
            const existing = dayRecords[String(seat)];
            if (!existing || existing.status === 'unmarked') {
                markStudentAttendance(seat, e);
            } else {
                openAttendanceStatusModal(seat);
            }
        });

        grid.appendChild(card);
    });

    // 渲染今日遲到與缺勤名單速覽
    const logList = document.getElementById('attendance-exception-list');
    if (logList) {
        const exceptions = seats
            .map(seat => ({ seat, rec: dayRecords[String(seat)] }))
            .filter(item => item.rec && item.rec.status !== 'present');

        if (exceptions.length === 0) {
            logList.innerHTML = `<div class="text-xs text-slate-400 font-bold py-3 text-center"><i class="fa-solid fa-wand-magic-sparkles text-emerald-500 mr-1.5"></i>目前全班到齊，無遲到或缺勤紀錄</div>`;
        } else {
            logList.innerHTML = exceptions.map(({ seat, rec }) => {
                const meta = ATTENDANCE_STATUS_META[rec.status] || ATTENDANCE_STATUS_META.unmarked;
                return `
                    <div class="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-white border border-slate-200/80 text-xs shadow-xs">
                        <div class="flex items-center gap-2 min-w-0">
                            <span class="px-2.5 py-1 rounded-xl font-black ${meta.softClass}">${meta.short}</span>
                            <span class="font-black text-slate-800 truncate">${escapeHtml(getStudentDisplayName(currentClass, seat, true))}</span>
                            <span class="font-mono text-slate-400 text-[11px]">${rec.time || ''}${rec.isModified ? ' <span class="text-amber-600 font-bold">(已修改)</span>' : ''}</span>
                        </div>
                        <input type="text" data-note-seat="${seat}" value="${escapeHtml(rec.note || '')}" placeholder="原因備註(例:病假/看牙醫)" class="att-note-input w-36 sm:w-48 text-xs px-2.5 py-1 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-500 font-medium">
                    </div>
                `;
            }).join('');

            logList.querySelectorAll('.att-note-input').forEach(inp => {
                inp.addEventListener('change', (e) => {
                    const seat = e.target.dataset.noteSeat;
                    if (dayRecords[String(seat)]) {
                        dayRecords[String(seat)].note = e.target.value.trim();
                        saveData();
                        showToast('已儲存出勤備註', 'success');
                    }
                });
            });
        }
    }
}

/**
 * 匯出雙工作表出勤 Excel 報表
 */
export function exportAttendanceExcel() {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassAttendanceData(currentClass);

    if (typeof window.XLSX === 'undefined') {
        showToast('Excel 匯出引擎載入中，請稍候再試', 'error');
        return;
    }

    const seats = getActiveSeatsForClass(currentClass);
    const recordsByDate = currentClass.attendanceRecords || {};
    const allDates = Object.keys(recordsByDate).sort();

    const weekdayDates = allDates.filter(dStr => {
        const d = new Date(dStr);
        if (isNaN(d.getTime())) return true;
        const day = d.getDay();
        return day !== 0 && day !== 6;
    });

    if (weekdayDates.length === 0 && !weekdayDates.includes(selectedAttendanceDate)) {
        weekdayDates.push(selectedAttendanceDate);
    }

    const summaryRows = [
        ['班級', currentClass.name],
        ['匯出日期', selectedAttendanceDate],
        [''],
        ['座號', '姓名', '準時出席天數', '遲到次數', '請假次數', '缺席次數', '出席率']
    ];

    seats.forEach(seat => {
        const sName = getStudentNameOnly(currentClass, seat) || `學生 ${seat}`;
        let pres = 0, late = 0, leave = 0, abs = 0;
        weekdayDates.forEach(dStr => {
            const rec = recordsByDate[dStr]?.[String(seat)];
            if (rec) {
                if (rec.status === 'present') pres++;
                else if (rec.status === 'late') late++;
                else if (rec.status === 'leave') leave++;
                else if (rec.status === 'absent') abs++;
            }
        });
        const totalValidDays = weekdayDates.length;
        const rate = totalValidDays > 0 ? `${Math.round(((pres + late) / totalValidDays) * 100)}%` : '0%';
        summaryRows.push([seat, sName, pres, late, leave, abs, rate]);
    });

    const detailHeader = ['座號', '姓名', ...weekdayDates];
    const detailRows = [detailHeader];

    seats.forEach(seat => {
        const sName = getStudentNameOnly(currentClass, seat) || `學生 ${seat}`;
        const row = [seat, sName];
        weekdayDates.forEach(dStr => {
            const rec = recordsByDate[dStr]?.[String(seat)];
            if (!rec) {
                row.push('-');
            } else {
                const meta = ATTENDANCE_STATUS_META[rec.status] || ATTENDANCE_STATUS_META.unmarked;
                row.push(`${meta.short}${rec.time ? ` (${rec.time})` : ''}${rec.note ? ` [${rec.note}]` : ''}`);
            }
        });
        detailRows.push(row);
    });

    const wb = window.XLSX.utils.book_new();
    const wsSummary = window.XLSX.utils.aoa_to_sheet(summaryRows);
    const wsDetail = window.XLSX.utils.aoa_to_sheet(detailRows);

    window.XLSX.utils.book_append_sheet(wb, wsSummary, '出勤彙總');
    window.XLSX.utils.book_append_sheet(wb, wsDetail, '出勤明細');

    const filename = `${currentClass.name}_出勤簽到報表_${selectedAttendanceDate}.xlsx`;
    window.XLSX.writeFile(wb, filename);
    showToast(`已成功匯出「${filename}」`, 'success');
}

/**
 * 相容舊程式呼叫，直接導向全畫面
 */
export function openAttendanceHubModal() {
    if (window.showAttendancePage) {
        window.showAttendancePage();
    } else {
        renderAttendanceHub();
    }
}

/**
 * 初始化出勤中樞事件綁定
 */
export function initAttendanceHub() {
    // 初始化 24hr 時間滾輪（預先建立 DOM 項目）
    initAttendanceTimeWheel();

    // 日期選擇按鈕（使用自訂日曆彈窗，零原生日曆）
    document.getElementById('att-date-select-btn')?.addEventListener('click', () => {
        if (typeof window.openCustomDatePickerModal === 'function') {
            window.openCustomDatePickerModal((dateStr) => {
                selectedAttendanceDate = dateStr;
                renderAttendanceHub();
            }, selectedAttendanceDate);
        } else {
            // 相容現有 date-picker-modal
            const dateModal = document.getElementById('date-picker-modal');
            if (dateModal) {
                window.customDatePickerCallback = (dateStr) => {
                    selectedAttendanceDate = dateStr;
                    renderAttendanceHub();
                };
                state.calendarDate = new Date(selectedAttendanceDate);
                if (typeof window.renderCalendar === 'function') window.renderCalendar();
                dateModal.classList.remove('hidden');
            }
        }
    });

    // 遲到基準時間設定（自訂彈窗，零原生時間輸入）
    document.getElementById('att-late-threshold-btn')?.addEventListener('click', openLateThresholdModal);
    document.getElementById('close-att-threshold-modal-btn')?.addEventListener('click', closeLateThresholdModal);
    document.getElementById('cancel-att-threshold-btn')?.addEventListener('click', closeLateThresholdModal);

    // 遲到基準快速預設標籤按鈕
    document.querySelectorAll('.att-preset-thresh-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const timeVal = btn.dataset.time;
            if (!timeVal) return;
            const parts = timeVal.split(':');
            const h = document.getElementById('att-thresh-hour-input');
            const m = document.getElementById('att-thresh-min-input');
            if (h) h.textContent = parts[0];
            if (m) m.textContent = parts[1];
        });
    });

    // 遲到基準微調按鈕
    document.getElementById('att-thresh-h-up')?.addEventListener('click', () => {
        const el = document.getElementById('att-thresh-hour-input');
        if (!el) return;
        let v = (parseInt(el.textContent, 10) + 1) % 24;
        el.textContent = String(v).padStart(2, '0');
    });
    document.getElementById('att-thresh-h-down')?.addEventListener('click', () => {
        const el = document.getElementById('att-thresh-hour-input');
        if (!el) return;
        let v = (parseInt(el.textContent, 10) + 23) % 24;
        el.textContent = String(v).padStart(2, '0');
    });
    document.getElementById('att-thresh-m-up')?.addEventListener('click', () => {
        const el = document.getElementById('att-thresh-min-input');
        if (!el) return;
        let v = (parseInt(el.textContent, 10) + 5) % 60;
        el.textContent = String(v).padStart(2, '0');
    });
    document.getElementById('att-thresh-m-down')?.addEventListener('click', () => {
        const el = document.getElementById('att-thresh-min-input');
        if (!el) return;
        let v = (parseInt(el.textContent, 10) + 55) % 60;
        el.textContent = String(v).padStart(2, '0');
    });

    // 確認套用新遲到基準並自動重新歸類
    document.getElementById('save-att-threshold-btn')?.addEventListener('click', () => {
        const h = document.getElementById('att-thresh-hour-input')?.textContent.trim() || '07';
        const m = document.getElementById('att-thresh-min-input')?.textContent.trim() || '50';
        const newLateTime = `${h}:${m}`;

        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (!currentClass) return;
        ensureClassAttendanceData(currentClass);
        currentClass.attendanceSettings.lateTime = newLateTime;

        // 【使用者規範執行】：若改變遲到基準，則重新檢查當日所有學生簽到時間一次，再重新歸類狀態，請假或曠課則不受影響
        reclassifyDayAttendanceByLateThreshold(newLateTime);
        saveData();
        closeLateThresholdModal();
        showToast(`已更新遲到門檻為 ${newLateTime}，並完成當日簽到學生狀態重新歸類！`, 'success');
    });

    // 遲到基準時間設定 (相容舊 input 事件)
    document.getElementById('attendance-late-time-input')?.addEventListener('change', (e) => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (!currentClass) return;
        ensureClassAttendanceData(currentClass);
        const newTime = e.target.value || '07:50';
        currentClass.attendanceSettings.lateTime = newTime;
        reclassifyDayAttendanceByLateThreshold(newTime);
        saveData();
        showToast(`已更新遲到基準時間為 ${currentClass.attendanceSettings.lateTime}，並重新檢查當日簽到`, 'success');
    });

    // 一鍵全班未到者全數準時出席
    document.getElementById('att-batch-all-present-btn')?.addEventListener('click', () => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (!currentClass) return;
        ensureClassAttendanceData(currentClass);
        const dayMap = currentClass.attendanceRecords[selectedAttendanceDate];
        const seats = getActiveSeatsForClass(currentClass);
        const nowTime = new Date().toTimeString().slice(0, 8);
        let count = 0;
        seats.forEach(seat => {
            if (!dayMap[String(seat)]) {
                dayMap[String(seat)] = { status: 'present', time: nowTime, note: '批次到齊' };
                count++;
            }
        });
        saveData();
        renderAttendanceHub();
        showToast(`已將剩餘 ${count} 位未簽到學生標記為「準時出席」`, 'success');
    });

    // 清空重置本日簽到紀錄 (零原生 confirm，使用系統毛玻璃彈窗)
    document.getElementById('att-batch-reset-day-btn')?.addEventListener('click', async () => {
        const ok = await showConfirmModal(
            '清空本日出勤簽到紀錄',
            '確定要清空本日的所有出勤簽到紀錄嗎？此動作將清除今日打卡時間與備註，請假與曠課紀錄亦將一併重置。'
        );
        if (!ok) return;
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (!currentClass) return;
        ensureClassAttendanceData(currentClass);
        currentClass.attendanceRecords[selectedAttendanceDate] = {};
        saveData();
        renderAttendanceHub();
        showToast('已重置本日出勤簽到紀錄', 'info');
    });

    // 狀態切換選單彈窗事件
    document.getElementById('close-att-status-modal-btn')?.addEventListener('click', closeAttendanceStatusModal);
    document.getElementById('attendance-status-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'attendance-status-modal') closeAttendanceStatusModal();
    });

    // 24hr 時間滾輪微調與預設按鈕
    document.getElementById('att-wheel-hour-up')?.addEventListener('click', () => {
        setWheelTime((wheelHour + 1) % 24, wheelMinute, wheelSecond, true);
    });
    document.getElementById('att-wheel-hour-down')?.addEventListener('click', () => {
        setWheelTime((wheelHour + 23) % 24, wheelMinute, wheelSecond, true);
    });
    document.getElementById('att-wheel-minute-up')?.addEventListener('click', () => {
        setWheelTime(wheelHour, (wheelMinute + 1) % 60, wheelSecond, true);
    });
    document.getElementById('att-wheel-minute-down')?.addEventListener('click', () => {
        setWheelTime(wheelHour, (wheelMinute + 59) % 60, wheelSecond, true);
    });
    document.getElementById('att-wheel-second-up')?.addEventListener('click', () => {
        setWheelTime(wheelHour, wheelMinute, (wheelSecond + 1) % 60, true);
    });
    document.getElementById('att-wheel-second-down')?.addEventListener('click', () => {
        setWheelTime(wheelHour, wheelMinute, (wheelSecond + 59) % 60, true);
    });

    document.getElementById('att-modal-now-time-btn')?.addEventListener('click', () => {
        const now = new Date();
        setWheelTime(now.getHours(), now.getMinutes(), now.getSeconds(), true);
    });

    document.getElementById('att-modal-preset-late-btn')?.addEventListener('click', () => {
        setWheelTime(7, 50, 0, true);
    });

    document.querySelectorAll('.att-status-pick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!currentModalSeat) return;
            const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
            if (!currentClass) return;
            ensureClassAttendanceData(currentClass);
            const dayMap = currentClass.attendanceRecords[selectedAttendanceDate];
            const status = btn.dataset.status;
            const note = document.getElementById('att-modal-note-input')?.value.trim() || '';
            const customTime = document.getElementById('att-modal-time-input')?.value.trim();
            const existingRec = dayMap[String(currentModalSeat)];
            const now = new Date();
            const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
            let finalTime = existingRec?.time || timeStr;
            let isModified = existingRec?.isModified || false;

            if (customTime) {
                const formattedCustomTime = customTime.length === 5 ? `${customTime}:00` : customTime;
                if (!existingRec || formattedCustomTime !== existingRec.time) {
                    finalTime = formattedCustomTime;
                    isModified = true;
                }
            }

            if (status === 'unmarked') {
                delete dayMap[String(currentModalSeat)];
                showToast(`已重設 ${currentModalSeat} 號學生出勤狀態為未到`, 'info');
            } else {
                dayMap[String(currentModalSeat)] = {
                    status,
                    time: finalTime,
                    note,
                    isModified
                };
                const meta = ATTENDANCE_STATUS_META[status];
                showToast(`已將 ${currentModalSeat} 號學生標記為「${meta.label}」${isModified ? '（自訂時間已修改）' : ''}`, 'success');
            }
            saveData();
            renderAttendanceHub();
            closeAttendanceStatusModal();
        });
    });

    // 匯出 Excel
    document.getElementById('att-export-excel-btn')?.addEventListener('click', exportAttendanceExcel);
}

/**
 * 重新檢查當日所有學生簽到時間並依新遲到基準歸類狀態
 * 【使用者全域規範】：若改變遲到基準，則重新檢查當日所有學生簽到時間一次，再重新歸類狀態，請假或曠課則不受影響
 */
export function reclassifyDayAttendanceByLateThreshold(newLateTime = null) {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return 0;
    ensureClassAttendanceData(currentClass);

    const cutoff = newLateTime || currentClass.attendanceSettings?.lateTime || '07:50';
    const dayRecords = currentClass.attendanceRecords[selectedAttendanceDate];
    if (!dayRecords) return 0;

    let reclassifiedCount = 0;
    const seats = getActiveSeatsForClass(currentClass);

    // 格式化門檻為 HH:MM:SS 用於字串精準比對 (如 07:50:00)
    const cutoffStandard = cutoff.length === 5 ? `${cutoff}:00` : cutoff;

    seats.forEach(seat => {
        const rec = dayRecords[String(seat)];
        if (!rec || !rec.time) return;

        // 【嚴格遵循規範】：請假 (leave) 或 缺席/曠課 (absent) 絕對不受影響！
        if (rec.status === 'leave' || rec.status === 'absent' || rec.status === 'unmarked') {
            return;
        }

        // 僅針對 present (出席) 與 late (遲到) 重新審視
        const recTimeStandard = rec.time.length === 5 ? `${rec.time}:00` : rec.time;
        const newStatus = recTimeStandard <= cutoffStandard ? 'present' : 'late';

        if (rec.status !== newStatus) {
            rec.status = newStatus;
            reclassifiedCount++;
        }
    });

    saveData();
    renderAttendanceHub();

    if (reclassifiedCount > 0) {
        showToast(`已依新門檻 (${cutoff}) 重新歸類 ${reclassifiedCount} 位學生狀態（請假/曠課保留不受影響）`, 'info');
    }
    return reclassifiedCount;
}

/**
 * 開啟自訂遲到基準時間設定彈窗 (Zero Native Time Picker)
 */
export function openLateThresholdModal() {
    const modal = document.getElementById('att-late-threshold-modal');
    if (!modal) return;
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    const curLate = currentClass?.attendanceSettings?.lateTime || '07:50';
    const parts = curLate.split(':');
    const h = parseInt(parts[0], 10) || 7;
    const m = parseInt(parts[1], 10) || 50;

    const hourInp = document.getElementById('att-thresh-hour-input');
    const minInp = document.getElementById('att-thresh-min-input');
    if (hourInp) hourInp.textContent = String(h).padStart(2, '0');
    if (minInp) minInp.textContent = String(m).padStart(2, '0');

    modal.classList.remove('hidden');
}

export function closeLateThresholdModal() {
    const modal = document.getElementById('att-late-threshold-modal');
    if (modal) modal.classList.add('hidden');
}

// 註冊全域
window.renderAttendanceHub = renderAttendanceHub;
window.initAttendanceTimeWheel = initAttendanceTimeWheel;
window.setWheelTime = setWheelTime;
window.reclassifyDayAttendanceByLateThreshold = reclassifyDayAttendanceByLateThreshold;
window.openLateThresholdModal = openLateThresholdModal;
window.closeLateThresholdModal = closeLateThresholdModal;
window.openAttendanceStatusModal = openAttendanceStatusModal;
window.closeAttendanceStatusModal = closeAttendanceStatusModal;
window.markStudentAttendance = markStudentAttendance;
