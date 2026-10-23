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
import { formatDate, showToast, escapeHtml } from '../utils.js';
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

    const customExp = dayRecords.customExpected;
    const expected = (typeof customExp === 'number' && customExp >= 0) ? customExp : seats.length;

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
    const timeInp = document.getElementById('att-modal-time-input');
    if (timeInp) {
        timeInp.value = existing?.time ? existing.time.substring(0, 8) : '';
    }

    modal.classList.remove('hidden');
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
    // 應到人數自訂微調
    document.getElementById('att-expected-minus-btn')?.addEventListener('click', () => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (!currentClass) return;
        ensureClassAttendanceData(currentClass);
        const dayMap = currentClass.attendanceRecords[selectedAttendanceDate];
        const seats = getActiveSeatsForClass(currentClass);
        const curExp = (typeof dayMap.customExpected === 'number') ? dayMap.customExpected : seats.length;
        dayMap.customExpected = Math.max(0, curExp - 1);
        saveData();
        renderAttendanceHub();
    });

    document.getElementById('att-expected-plus-btn')?.addEventListener('click', () => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (!currentClass) return;
        ensureClassAttendanceData(currentClass);
        const dayMap = currentClass.attendanceRecords[selectedAttendanceDate];
        const seats = getActiveSeatsForClass(currentClass);
        const curExp = (typeof dayMap.customExpected === 'number') ? dayMap.customExpected : seats.length;
        dayMap.customExpected = curExp + 1;
        saveData();
        renderAttendanceHub();
    });

    document.getElementById('att-expected-input')?.addEventListener('change', (e) => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (!currentClass) return;
        ensureClassAttendanceData(currentClass);
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val) && val >= 0) {
            currentClass.attendanceRecords[selectedAttendanceDate].customExpected = val;
            saveData();
            renderAttendanceHub();
        }
    });

    // 日期切換
    document.getElementById('attendance-date-input')?.addEventListener('change', (e) => {
        if (e.target.value) {
            selectedAttendanceDate = e.target.value;
            renderAttendanceHub();
        }
    });

    // 遲到基準時間設定
    document.getElementById('attendance-late-time-input')?.addEventListener('change', (e) => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (!currentClass) return;
        ensureClassAttendanceData(currentClass);
        currentClass.attendanceSettings.lateTime = e.target.value || '07:50';
        saveData();
        showToast(`已更新遲到基準時間為 ${currentClass.attendanceSettings.lateTime}`, 'success');
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

    // 清空重置本日簽到紀錄
    document.getElementById('att-batch-reset-day-btn')?.addEventListener('click', () => {
        if (!confirm('確定要清空本日的所有出勤簽到紀錄嗎？此動作將清除今日打卡時間與備註。')) return;
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

    document.getElementById('att-modal-now-time-btn')?.addEventListener('click', () => {
        const now = new Date();
        const timeInp = document.getElementById('att-modal-time-input');
        if (timeInp) {
            timeInp.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        }
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

// 註冊全域供跨模組與導覽使用
window.renderAttendanceHub = renderAttendanceHub;
window.openAttendanceStatusModal = openAttendanceStatusModal;
window.closeAttendanceStatusModal = closeAttendanceStatusModal;
window.markStudentAttendance = markStudentAttendance;
