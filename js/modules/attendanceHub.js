/**
 * 班級經營系統 - 模組 2：多軌遲到簽到與出勤中樞 (attendanceHub.js) ★重點核心功能
 *
 * 支援三大到校簽到軌道：
 * 1. 【條碼/QR 極速感應簽到】：支援實體條碼掃描槍或輸入座號/條碼，自動比對遲到基準時間 (預設 07:50) 判定「準時出席」或「遲到」並記錄精確秒數。
 * 2. 【學生觸控自助簽到看板 (Kiosk Mode)】：投放在教室大螢幕或平板，學生進教室輕觸自己座號即可完成簽到，系統依當下時間自動判定準時或遲到。
 * 3. 【導師 30 秒極速點名矩陣】：一鍵全班全勤、快速切換「出席 / 遲到 / 請假 / 缺席」，支援填寫遲到原因或請假備註。
 *
 * 跨模組智慧連動：
 * - 匯出 `getTodayStudentAttendanceStatus(classId, seat)` 與 `isStudentAbsentOrLeaveToday(classId, seat)`
 * - 當日請假或缺席學生，在「作業點收」自動顯示請假/缺席徽章，在「全班加分」時自動跳過！
 * - 支援一鍵匯出雙工作表 Excel (`.xlsx`)：「出勤彙總」與「出勤明細 (自動排除週末)」。
 */

import { state } from '../state.js';
import { formatDate, showToast, openModal, closeModal, escapeHtml } from '../utils.js';
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
        short: '未簽到',
        icon: 'fa-hourglass-start',
        bgClass: 'bg-slate-100 text-slate-600 border-slate-200',
        softClass: 'bg-slate-100 text-slate-500 border-slate-200'
    }
};

let currentAttendanceMode = 'kiosk'; // 'kiosk' (觸控簽到自動判遲到) | 'scan' (條碼極速簽到) | 'teacher' (導師批次點名)
let currentTeacherBrush = 'late';    // 導師快速塗抹畫筆：'present' | 'late' | 'leave' | 'absent'
let selectedAttendanceDate = formatDate(new Date(), 'YYYY-MM-DD');
let clockIntervalId = null;

function ensureClassAttendanceData(classObj) {
    if (!classObj) return null;
    if (!classObj.attendanceSettings || typeof classObj.attendanceSettings !== 'object') {
        classObj.attendanceSettings = {
            lateTime: '07:50',
            earlyBirdBonus: true
        };
    }
    if (!classObj.attendanceSettings.lateTime) {
        classObj.attendanceSettings.lateTime = '07:50';
    }
    if (!classObj.attendanceRecords || typeof classObj.attendanceRecords !== 'object') {
        classObj.attendanceRecords = {};
    }
    if (!classObj.attendanceRecords[selectedAttendanceDate]) {
        classObj.attendanceRecords[selectedAttendanceDate] = {};
    }
    return classObj;
}

/**
 * 查詢某班某座號今日（或指定日期）的出勤狀態物件
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
 * 統計某班今日出勤摘要（供頂部快捷島、考試計時器與出勤面板共用）
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

    return {
        expected: seats.length,
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
 * 執行學生簽到或導師點名狀態變更
 */
export function markStudentAttendance(seat, mode = currentAttendanceMode, clientEvent = null) {
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

    const existing = dayMap[String(seat)];

    if (mode === 'kiosk' || mode === 'scan') {
        // 若已簽到過且在觸控模式點擊，提供取消簽到或改狀態確認
        if (existing && (existing.status === 'present' || existing.status === 'late') && mode === 'kiosk') {
            delete dayMap[String(seat)];
            saveData();
            renderAttendanceHub();
            if (window.refreshDynamicIsland) window.refreshDynamicIsland();
            showToast(`已重設 ${getStudentDisplayName(currentClass, seat, true)} 的簽到狀態`, 'info');
            return;
        }

        const isLate = isTimeAfterLateCutoff(`${hh}:${mm}`, cutoff);
        const newStatus = isLate ? 'late' : 'present';
        dayMap[String(seat)] = {
            status: newStatus,
            time: timeStr,
            note: isLate ? `超過 ${cutoff} 遲到簽到` : '準時到校'
        };

        // 若開啟早鳥準時加分且為準時簽到
        if (!isLate && currentClass.attendanceSettings.earlyBirdBonus) {
            if (!currentClass.pointsBySeat) currentClass.pointsBySeat = {};
            currentClass.pointsBySeat[String(seat)] = (currentClass.pointsBySeat[String(seat)] || 0) + 1;
            if (clientEvent) {
                spawnScorePop(clientEvent.clientX, clientEvent.clientY, '準時 +1', true);
            }
        } else if (isLate && clientEvent) {
            spawnScorePop(clientEvent.clientX, clientEvent.clientY, `遲到 ${hh}:${mm}`, false);
        }

        saveData();
        renderAttendanceHub();
        if (window.refreshDynamicIsland) window.refreshDynamicIsland();
        const disp = getStudentDisplayName(currentClass, seat, true);
        showToast(
            isLate
                ? `${disp} 已簽到（${timeStr} 遲到，基準 ${cutoff}）`
                : `${disp} 準時簽到成功（${timeStr}）！`,
            isLate ? 'info' : 'success'
        );
    } else {
        // 導師點名畫筆模式
        if (existing && existing.status === currentTeacherBrush) {
            delete dayMap[String(seat)];
        } else {
            dayMap[String(seat)] = {
                status: currentTeacherBrush,
                time: timeStr,
                note: existing?.note || ''
            };
        }
        saveData();
        renderAttendanceHub();
        if (window.refreshDynamicIsland) window.refreshDynamicIsland();
    }
}

/**
 * 渲染遲到簽到與出勤中樞主畫面
 */
export function renderAttendanceHub() {
    const modal = document.getElementById('attendance-hub-modal');
    if (!modal) return;

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

    const earlyBonusToggle = document.getElementById('attendance-early-bonus-toggle');
    if (earlyBonusToggle) {
        earlyBonusToggle.checked = Boolean(currentClass.attendanceSettings.earlyBirdBonus);
    }

    // 更新摘要數字
    const summary = getAttendanceSummaryForClass(currentClass, selectedAttendanceDate);
    const setElText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    setElText('att-stat-expected', summary.expected);
    setElText('att-stat-present', summary.present);
    setElText('att-stat-late', summary.late);
    setElText('att-stat-leave', summary.leave);
    setElText('att-stat-absent', summary.absent);
    setElText('att-stat-unmarked', summary.unmarked);

    // 切換三大模式按鈕視覺
    ['kiosk', 'scan', 'teacher'].forEach(m => {
        const btn = document.getElementById(`att-mode-btn-${m}`);
        if (!btn) return;
        if (m === currentAttendanceMode) {
            btn.className = 'att-mode-tab py-2 px-4 rounded-xl font-black text-xs sm:text-sm bg-indigo-600 text-white shadow-md shadow-indigo-500/20 transition-all cursor-pointer flex items-center gap-1.5';
        } else {
            btn.className = 'att-mode-tab py-2 px-4 rounded-xl font-bold text-xs sm:text-sm bg-white/80 text-slate-600 hover:bg-slate-100 border border-slate-200/80 transition-all cursor-pointer flex items-center gap-1.5';
        }
    });

    const scanBar = document.getElementById('attendance-scan-bar');
    const teacherBar = document.getElementById('attendance-teacher-brush-bar');
    if (scanBar) {
        scanBar.classList.toggle('hidden', currentAttendanceMode !== 'scan');
        if (currentAttendanceMode === 'scan') {
            setTimeout(() => document.getElementById('attendance-barcode-input')?.focus(), 60);
        }
    }
    if (teacherBar) {
        teacherBar.classList.toggle('hidden', currentAttendanceMode !== 'teacher');
    }

    // 更新導師畫筆按鈕樣式
    document.querySelectorAll('.att-brush-btn').forEach(btn => {
        const bKey = btn.dataset.brush;
        const active = bKey === currentTeacherBrush;
        btn.classList.toggle('ring-4', active);
        btn.classList.toggle('ring-indigo-500/30', active);
        btn.classList.toggle('scale-105', active);
    });

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
        card.className = `ios-spring relative rounded-2xl p-3 sm:p-3.5 border text-left flex flex-col justify-between min-h-[88px] cursor-pointer select-none shadow-xs ${meta.bgClass}`;
        card.dataset.seat = seat;

        card.innerHTML = `
            <div class="flex items-center justify-between w-full gap-1">
                <span class="text-lg sm:text-xl font-black font-mono leading-none">${seat}<span class="text-xs font-bold ml-0.5">號</span></span>
                <span class="text-[11px] font-black px-2 py-0.5 rounded-full bg-black/15 backdrop-blur-xs flex items-center gap-1">
                    <i class="fa-solid ${meta.icon} text-[10px]"></i>
                    <span>${meta.short}</span>
                </span>
            </div>
            <div class="mt-1.5 truncate font-extrabold text-xs sm:text-sm ${stKey === 'unmarked' ? 'text-slate-700' : 'text-white'}">
                ${sName ? escapeHtml(sName) : `學生 ${seat} 號`}
            </div>
            <div class="mt-1 flex items-center justify-between text-[10px] font-mono opacity-85">
                <span>${rec?.time ? `<i class="fa-regular fa-clock mr-0.5"></i>${rec.time}` : '點擊簽到'}</span>
            </div>
        `;

        card.addEventListener('click', (e) => {
            markStudentAttendance(seat, currentAttendanceMode, e);
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
            logList.innerHTML = `<div class="text-xs text-slate-400 font-bold py-3 text-center"><i class="fa-solid fa-wand-magic-sparkles text-emerald-500 mr-1"></i>目前無遲到或缺勤紀錄</div>`;
        } else {
            logList.innerHTML = exceptions.map(({ seat, rec }) => {
                const meta = ATTENDANCE_STATUS_META[rec.status] || ATTENDANCE_STATUS_META.unmarked;
                return `
                    <div class="flex items-center justify-between gap-2 p-2 rounded-xl bg-white border border-slate-200/80 text-xs">
                        <div class="flex items-center gap-2 min-w-0">
                            <span class="px-2 py-0.5 rounded-lg font-black ${meta.softClass}">${meta.short}</span>
                            <span class="font-black text-slate-800 truncate">${escapeHtml(getStudentDisplayName(currentClass, seat, true))}</span>
                            <span class="font-mono text-slate-400 text-[11px]">${rec.time || ''}</span>
                        </div>
                        <input type="text" data-note-seat="${seat}" value="${escapeHtml(rec.note || '')}" placeholder="原因備註(例:病假/公車誤點)" class="att-note-input w-36 sm:w-44 text-xs px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-500 font-medium">
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
 * 匯出雙工作表出勤 Excel 報表（出勤彙總 + 出勤明細，自動排除週末）
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

    // 過濾掉週六(6)、週日(0)
    const weekdayDates = allDates.filter(dStr => {
        const d = new Date(dStr);
        if (isNaN(d.getTime())) return true;
        const day = d.getDay();
        return day !== 0 && day !== 6;
    });

    if (weekdayDates.length === 0 && !weekdayDates.includes(selectedAttendanceDate)) {
        weekdayDates.push(selectedAttendanceDate);
    }

    // Sheet 1: 出勤彙總
    const summaryRows = [
        ['座號', '學生姓名', '準時出席(天)', '遲到(次)', '請假(天)', '缺席(天)', '出席率(%)']
    ];

    seats.forEach(seat => {
        let p = 0, l = 0, lv = 0, ab = 0;
        weekdayDates.forEach(dStr => {
            const st = recordsByDate[dStr]?.[String(seat)]?.status;
            if (st === 'present') p++;
            else if (st === 'late') l++;
            else if (st === 'leave') lv++;
            else if (st === 'absent') ab++;
        });
        const totalRecorded = p + l + lv + ab;
        const rate = totalRecorded > 0 ? (((p + l) / totalRecorded) * 100).toFixed(1) + '%' : '100.0%';
        summaryRows.push([
            seat,
            getStudentNameOnly(currentClass, seat) || `${seat}號`,
            p,
            l,
            lv,
            ab,
            rate
        ]);
    });

    // Sheet 2: 出勤明細
    const detailRows = [
        ['日期', '座號', '學生姓名', '出勤狀態', '簽到時間', '原因與備註']
    ];

    weekdayDates.forEach(dStr => {
        const dayMap = recordsByDate[dStr] || {};
        seats.forEach(seat => {
            const rec = dayMap[String(seat)];
            if (!rec) return;
            const meta = ATTENDANCE_STATUS_META[rec.status] || ATTENDANCE_STATUS_META.unmarked;
            detailRows.push([
                dStr,
                seat,
                getStudentNameOnly(currentClass, seat) || `${seat}號`,
                meta.label,
                rec.time || '--',
                rec.note || ''
            ]);
        });
    });

    const wb = window.XLSX.utils.book_new();
    const wsSummary = window.XLSX.utils.aoa_to_sheet(summaryRows);
    const wsDetail = window.XLSX.utils.aoa_to_sheet(detailRows);

    window.XLSX.utils.book_append_sheet(wb, wsSummary, '出勤彙總');
    window.XLSX.utils.book_append_sheet(wb, wsDetail, '出勤明細');

    const filename = `${currentClass.name}_出勤簽到報表_${selectedAttendanceDate}.xlsx`;
    window.XLSX.writeFile(wb, filename);
    showToast(`已成功匯出「${filename}」（含出勤彙總與明細雙工作表）`, 'success');
}

/**
 * 開啟出勤簽到中樞彈窗
 */
export function openAttendanceHubModal() {
    const modal = document.getElementById('attendance-hub-modal');
    if (!modal) return;
    selectedAttendanceDate = formatDate(new Date(), 'YYYY-MM-DD');
    renderAttendanceHub();
    openModal(modal);

    if (clockIntervalId) clearInterval(clockIntervalId);
    const updateClock = () => {
        const clockEl = document.getElementById('attendance-live-clock');
        if (!clockEl) return;
        const now = new Date();
        clockEl.textContent = now.toTimeString().slice(0, 8);
    };
    updateClock();
    clockIntervalId = setInterval(updateClock, 1000);
}

export function initAttendanceHub() {
    document.getElementById('open-attendance-hub-btn')?.addEventListener('click', openAttendanceHubModal);
    document.getElementById('mobile-sheet-attendance-btn')?.addEventListener('click', () => {
        document.getElementById('mobile-more-sheet')?.classList.add('hidden');
        openAttendanceHubModal();
    });
    document.getElementById('close-attendance-hub-btn')?.addEventListener('click', () => {
        if (clockIntervalId) clearInterval(clockIntervalId);
        closeModal(document.getElementById('attendance-hub-modal'));
        if (window.reRenderCurrentPage) window.reRenderCurrentPage();
    });

    // 模式切換
    ['kiosk', 'scan', 'teacher'].forEach(m => {
        document.getElementById(`att-mode-btn-${m}`)?.addEventListener('click', () => {
            currentAttendanceMode = m;
            renderAttendanceHub();
        });
    });

    // 導師畫筆切換
    document.querySelectorAll('.att-brush-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentTeacherBrush = btn.dataset.brush || 'late';
            renderAttendanceHub();
        });
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

    // 準時早鳥自動 +1 開關
    document.getElementById('attendance-early-bonus-toggle')?.addEventListener('change', (e) => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (!currentClass) return;
        ensureClassAttendanceData(currentClass);
        currentClass.attendanceSettings.earlyBirdBonus = e.target.checked;
        saveData();
        showToast(e.target.checked ? '已開啟「準時簽到自動 +1 分」激勵機制' : '已關閉準時簽到自動加分', 'info');
    });

    // 一鍵全班準時出席（僅針對尚未標記的座號，保留已請假/遲到者）
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
                dayMap[String(seat)] = { status: 'present', time: nowTime, note: '全班批次簽到' };
                count++;
            }
        });
        saveData();
        renderAttendanceHub();
        if (window.refreshDynamicIsland) window.refreshDynamicIsland();
        showToast(`已將剩餘 ${count} 位未簽到學生標記為「準時出席」`, 'success');
    });

    // 清空本日簽到紀錄
    document.getElementById('att-batch-reset-day-btn')?.addEventListener('click', () => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (!currentClass) return;
        ensureClassAttendanceData(currentClass);
        currentClass.attendanceRecords[selectedAttendanceDate] = {};
        saveData();
        renderAttendanceHub();
        if (window.refreshDynamicIsland) window.refreshDynamicIsland();
        showToast('已重置本日出勤簽到紀錄', 'info');
    });

    // 條碼槍或座號極速輸入簽到
    const barcodeForm = document.getElementById('attendance-barcode-form');
    if (barcodeForm) {
        barcodeForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const inp = document.getElementById('attendance-barcode-input');
            if (!inp) return;
            const code = inp.value.trim();
            inp.value = '';
            if (!code) return;

            const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
            if (!currentClass) return;

            // 先比對學生條碼表，若無則嘗試直接解析為座號
            let matchedSeat = null;
            if (currentClass.studentBarcodes) {
                for (const [seatStr, bCode] of Object.entries(currentClass.studentBarcodes)) {
                    if (String(bCode).trim() === code) {
                        matchedSeat = parseInt(seatStr, 10);
                        break;
                    }
                }
            }
            if (!matchedSeat) {
                const num = parseInt(code, 10);
                const activeSeats = getActiveSeatsForClass(currentClass);
                if (!isNaN(num) && activeSeats.includes(num)) {
                    matchedSeat = num;
                }
            }

            if (matchedSeat) {
                markStudentAttendance(matchedSeat, 'scan');
            } else {
                showToast(`找不到條碼或座號「${code}」對應的學生`, 'error');
            }
        });
    }

    // 匯出 Excel
    document.getElementById('att-export-excel-btn')?.addEventListener('click', exportAttendanceExcel);
}
