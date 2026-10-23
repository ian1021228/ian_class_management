/**
 * 班級經營系統 - 模組 3：智慧擬真黑板聯絡簿升級 (smartBoard.js)
 * 支援：
 * 1. 直式 (Vertical 由右至左排版) 與 橫式 (Horizontal) 一鍵無縫切換
 * 2. 班級值日生指派（1~4 人，支援手動選擇與每日座號自動輪替）
 * 3. 電子白板「全螢幕投影」Zen Mode（自動隱藏多餘導覽列與操作按鈕，純淨展示黑板內文）
 */

import { state } from '../state.js';
import { formatDate, showToast, escapeHtml } from '../utils.js';
import { saveData } from '../storage.js';
import { getActiveSeatsForClass, getStudentDisplayName, getStudentNameOnly } from './classWizard.js';

let isProjectorZenMode = false;

function ensureClassBoardConfig(classObj) {
    if (!classObj) return null;
    if (!classObj.blackboardConfig || typeof classObj.blackboardConfig !== 'object') {
        classObj.blackboardConfig = {
            writingMode: 'horizontal',
            theme: 'green'
        };
    }
    if (!classObj.dutyConfig || typeof classObj.dutyConfig !== 'object') {
        classObj.dutyConfig = {
            count: 2,
            seats: [1, 2],
            cycleMode: 'daily',
            customDays: 2,
            announcement: '',
            autoRotate: true,
            lastRotatedDate: '',
            lastRotatedWeek: ''
        };
    } else {
        if (!classObj.dutyConfig.cycleMode) classObj.dutyConfig.cycleMode = 'daily';
        if (typeof classObj.dutyConfig.announcement !== 'string') classObj.dutyConfig.announcement = '';
        if (!classObj.dutyConfig.customDays) classObj.dutyConfig.customDays = 2;
    }
    return classObj;
}

/**
 * 輪替計算下一組有效座號
 */
/**
 * 智慧輪更至下一組值日生座號
 * 規則：
 * 1. 若當前值日生座號為連續序號（例如 1、2 或 3、4）：整組以區塊跨步輪替，下一組接續（例如 1、2 的下一組是 3、4；3、4 的下一組是 5、6）。
 * 2. 若當前值日生座號為非連續自訂組合（例如 2、5，可能為男女雙軌或自訂搭配）：各座號分別順延 +1 位有效學生（例如 2、5 的下一組是 3、6；3、6 的下一組是 4、7）。
 * 3. 自動適配全班有效座號陣列（自動排除轉出/缺號）並支援循環回 1 號。
 */
export function rotateDutySeats(classObj) {
    if (!classObj) return;
    ensureClassBoardConfig(classObj);
    const cfg = classObj.dutyConfig;
    const activeSeats = getActiveSeatsForClass(classObj);
    if (activeSeats.length === 0) return;

    const count = Math.min(Math.max(parseInt(cfg.count, 10) || 2, 1), 4);
    const currentSeats = Array.isArray(cfg.seats) && cfg.seats.length > 0
        ? cfg.seats
        : activeSeats.slice(0, count);

    // 取得當前每位學生在 activeSeats 中的索引位置
    const rawIndices = currentSeats.map(s => activeSeats.indexOf(Number(s))).filter(idx => idx !== -1);
    if (rawIndices.length === 0) {
        cfg.seats = activeSeats.slice(0, count);
        return;
    }

    // 檢查是否為連續座號區塊 (sorted)
    const sortedIndices = [...rawIndices].sort((a, b) => a - b);
    let isConsecutive = true;
    for (let i = 0; i < sortedIndices.length - 1; i++) {
        if (sortedIndices[i + 1] !== sortedIndices[i] + 1) {
            isConsecutive = false;
            break;
        }
    }

    const nextSeats = [];
    if (isConsecutive) {
        // 連續區塊：整組依組人數跨步順延（例如 1, 2 -> 3, 4）
        const step = sortedIndices.length;
        sortedIndices.forEach(idx => {
            const nextIdx = (idx + step) % activeSeats.length;
            nextSeats.push(activeSeats[nextIdx]);
        });
    } else {
        // 非連續組合：各自順延 +1 位有效學生（例如 2, 5 -> 3, 6）
        rawIndices.forEach(idx => {
            const nextIdx = (idx + 1) % activeSeats.length;
            nextSeats.push(activeSeats[nextIdx]);
        });
    }

    cfg.seats = nextSeats;
}

/**
 * 檢查並依週期規則執行值日生自動輪替 (每日/每週/自訂天數)
 */
export function checkAutoRotateDuty(classObj) {
    if (!classObj) return;
    ensureClassBoardConfig(classObj);
    const cfg = classObj.dutyConfig;
    const mode = cfg.cycleMode || (cfg.autoRotate ? 'daily' : 'manual');
    if (mode === 'manual') return;

    const today = new Date();
    const todayStr = formatDate(today, 'YYYY-MM-DD');

    let shouldRotate = false;
    if (mode === 'daily') {
        if (cfg.lastRotatedDate !== todayStr) {
            shouldRotate = true;
        }
    } else if (mode === 'weekly') {
        const year = today.getFullYear();
        const firstDayOfYear = new Date(year, 0, 1);
        const pastDaysOfYear = (today - firstDayOfYear) / 86400000;
        const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
        const currentWeekStr = `${year}-W${weekNum}`;
        if (cfg.lastRotatedWeek !== currentWeekStr) {
            shouldRotate = true;
            cfg.lastRotatedWeek = currentWeekStr;
        }
    } else if (mode === 'custom') {
        const customDays = parseInt(cfg.customDays, 10) || 2;
        if (!cfg.lastRotatedDate) {
            shouldRotate = true;
        } else {
            const lastDate = new Date(cfg.lastRotatedDate);
            const diffDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
            if (diffDays >= customDays) {
                shouldRotate = true;
            }
        }
    }

    if (!shouldRotate) return;

    rotateDutySeats(classObj);
    cfg.lastRotatedDate = todayStr;
    saveData();
}

/**
 * 渲染增強型黑板（支援直式/橫式、直書 Flex 排版、值日生標籤）
 */
export function renderEnhancedBlackboard() {
    const blackboard = document.getElementById('blackboard-content');
    if (!blackboard) return;

    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassBoardConfig(currentClass);
    checkAutoRotateDuty(currentClass);

    const isVertical = currentClass.blackboardConfig.writingMode === 'vertical';
    blackboard.classList.toggle('blackboard-vertical-mode', isVertical);

    const dateDisplay = document.getElementById('contact-book-date');
    if (dateDisplay) dateDisplay.textContent = formatDate(state.selectedDate);

    // 更新日期膠囊導航按鈕組 (對照截圖：◀ [ 2026/10/23 📅 ] ▶ [ 回到今天 ])
    const dateTextEl = document.getElementById('bb-current-date-text');
    if (dateTextEl) {
        dateTextEl.textContent = formatDate(state.selectedDate, 'YYYY/MM/DD');
    }
    const hiddenDatePicker = document.getElementById('bb-hidden-date-picker');
    if (hiddenDatePicker) {
        hiddenDatePicker.value = formatDate(state.selectedDate, 'YYYY-MM-DD');
    }

    const dateString = formatDate(state.selectedDate, 'YYYY-MM-DD');
    const items = currentClass.contactBook?.[dateString] || [];

    // 更新值日生展示徽章
    const dutyContainer = document.getElementById('bb-duty-badge-container');
    if (dutyContainer) {
        const dutySeats = currentClass.dutyConfig.seats || [];
        const dutyNames = dutySeats
            .map(seat => `<strong class="text-amber-200">${escapeHtml(getStudentDisplayName(currentClass, seat, true))}</strong>`)
            .join('、');
        dutyContainer.innerHTML = dutyNames
            ? `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-black/30 border border-white/15 text-amber-200 text-xs font-bold shadow-xs"><i class="fa-solid fa-user-check text-amber-400"></i>今日值日生：${dutyNames}</span>`
            : '';
    }

    blackboard.innerHTML = '';
    blackboard.style.fontSize = `${state.blackboardFontSize || 1.25}rem`;
    blackboard.style.lineHeight = `${state.blackboardLineHeight || 1.75}`;

    if (items.length === 0) {
        blackboard.innerHTML = `<div class="flex items-center justify-center h-full w-full py-16"><p class="text-white/30 italic text-center text-sm font-sans select-none"><i class="fa-solid fa-chalkboard mr-1.5 text-white/20"></i>今日無聯絡記事。可在下方輸入寫上黑板...</p></div>`;
        return;
    }

    items.forEach((item, index) => {
        const itemEl = document.createElement('div');
        const isFirst = index === 0;
        const isLast = index === items.length - 1;

        if (isVertical) {
            // 直式由右至左排版
            itemEl.className = 'bb-item-row group';
            itemEl.innerHTML = `
                <div class="bb-item-text-wrap text-slate-100 font-mono chalk-text select-text">
                    <span class="text-amber-300 font-black mb-1 opacity-90 inline-block font-sans">${index + 1}.</span>
                    <span>${escapeHtml(item)}</span>
                </div>
                <div class="bb-item-actions flex gap-1 bg-black/40 backdrop-blur-md rounded-xl p-1 border border-white/10 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-all">
                    <button type="button" class="move-up-contact-btn w-6 h-6 rounded flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10" data-index="${index}" ${isFirst ? 'disabled style="opacity:0.2;"' : ''} title="向前"><i class="fa-solid fa-arrow-right text-[10px]"></i></button>
                    <button type="button" class="move-down-contact-btn w-6 h-6 rounded flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10" data-index="${index}" ${isLast ? 'disabled style="opacity:0.2;"' : ''} title="向後"><i class="fa-solid fa-arrow-left text-[10px]"></i></button>
                    <button type="button" class="to-hw-btn w-6 h-6 rounded flex items-center justify-center text-teal-300 hover:bg-teal-500/20" data-index="${index}" title="轉作業"><i class="fa-solid fa-book text-[10px]"></i></button>
                    <button type="button" class="edit-contact-btn w-6 h-6 rounded flex items-center justify-center text-amber-300 hover:bg-amber-500/20" data-index="${index}" title="編輯"><i class="fa-solid fa-pen text-[10px]"></i></button>
                    <button type="button" class="delete-contact-item-btn w-6 h-6 rounded flex items-center justify-center text-rose-300 hover:bg-rose-500/20" data-index="${index}" title="擦除">&times;</button>
                </div>
            `;
        } else {
            // 橫式排版
            itemEl.className = 'flex items-start justify-between group p-3 rounded-2xl hover:bg-white/5 transition-all border border-transparent hover:border-white/10';
            itemEl.innerHTML = `
                <div class="flex-grow pt-0.5"><span class="mr-2 font-bold opacity-60 text-amber-200">${index + 1}.</span><span class="whitespace-pre-wrap">${escapeHtml(item)}</span></div>
                <div class="flex gap-1.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all ml-3 flex-shrink-0 bg-slate-900/60 backdrop-blur-md rounded-xl p-1 border border-white/10 shadow-xl">
                    <button class="move-up-contact-btn hide-on-admin-view w-7 h-7 flex items-center justify-center rounded-lg ${isFirst ? 'bg-white/5 text-white/20 cursor-not-allowed opacity-30' : 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500 hover:text-white cursor-pointer active:scale-90'} transition-all font-bold text-xs" data-index="${index}" ${isFirst ? 'disabled' : ''} title="向上移動"><i class="fa-solid fa-arrow-up text-xs"></i></button>
                    <button class="move-down-contact-btn hide-on-admin-view w-7 h-7 flex items-center justify-center rounded-lg ${isLast ? 'bg-white/5 text-white/20 cursor-not-allowed opacity-30' : 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500 hover:text-white cursor-pointer active:scale-90'} transition-all font-bold text-xs" data-index="${index}" ${isLast ? 'disabled' : ''} title="向下移動"><i class="fa-solid fa-arrow-down text-xs"></i></button>
                    <button class="to-hw-btn hide-on-admin-view w-7 h-7 flex items-center justify-center rounded-lg bg-teal-500/20 text-teal-300 hover:bg-teal-500 hover:text-white transition-all font-bold text-sm cursor-pointer" data-index="${index}" title="轉為作業"><i class="fa-solid fa-book text-xs"></i></button>
                    <button class="edit-contact-btn hide-on-admin-view w-7 h-7 flex items-center justify-center rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500 hover:text-white transition-all font-bold text-sm cursor-pointer" data-index="${index}" title="編輯內文"><i class="fa-solid fa-pen text-xs"></i></button>
                    <button class="delete-contact-item-btn w-7 h-7 flex items-center justify-center rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500 hover:text-white transition-all font-bold text-base leading-none cursor-pointer" data-index="${index}" title="擦除">&times;</button>
                </div>
            `;
        }

        blackboard.appendChild(itemEl);
    });
}

/**
 * 開啟電子白板「全螢幕投影」Zen Mode
 */
export function toggleProjectorZenMode() {
    const page = document.getElementById('contact-book-page');
    if (!page) return;

    isProjectorZenMode = !isProjectorZenMode;
    page.classList.toggle('blackboard-projector-zen', isProjectorZenMode);

    if (isProjectorZenMode) {
        if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        }
        showToast('已開啟「電子白板全螢幕投影模式」，按 ESC 或右上角按鈕即可退出', 'info');
    } else {
        if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        }
    }

    const zenBtn = document.getElementById('bb-projector-zen-btn');
    if (zenBtn) {
        zenBtn.innerHTML = isProjectorZenMode
            ? `<i class="fa-solid fa-compress mr-1"></i><span>退出投影</span>`
            : `<i class="fa-solid fa-expand mr-1"></i><span>全螢幕投影</span>`;
    }
}

/**
 * 監聽全螢幕狀態同步
 */
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && isProjectorZenMode) {
        toggleProjectorZenMode();
    }
});

/**
 * 開啟值日生與注意事項設定彈窗
 */
export function openDutyModal() {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassBoardConfig(currentClass);

    const activeSeats = getActiveSeatsForClass(currentClass);
    const cfg = currentClass.dutyConfig;

    const countInput = document.getElementById('duty-count-input');
    const cycleModeSelect = document.getElementById('duty-cycle-mode-select');
    const customDaysWrapper = document.getElementById('duty-custom-days-wrapper');
    const customDaysInput = document.getElementById('duty-custom-days-input');
    const announcementInput = document.getElementById('duty-announcement-input');
    const pickerGrid = document.getElementById('duty-seat-picker-grid');

    if (countInput) countInput.value = cfg.count || 2;
    if (cycleModeSelect) {
        cycleModeSelect.value = cfg.cycleMode || 'daily';
        if (customDaysWrapper) {
            customDaysWrapper.classList.toggle('hidden', cycleModeSelect.value !== 'custom');
        }
    }
    if (customDaysInput) customDaysInput.value = cfg.customDays || 2;
    if (announcementInput) announcementInput.value = cfg.announcement || '';

    if (pickerGrid) {
        pickerGrid.innerHTML = '';
        activeSeats.forEach(seat => {
            const isSelected = (cfg.seats || []).includes(seat);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `p-2 sm:p-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${isSelected ? 'bg-amber-600 text-white border-amber-700 shadow-md ring-2 ring-amber-300' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'}`;
            btn.innerHTML = `<span class="font-mono">${seat}號</span> <span class="truncate block text-[11px]">${escapeHtml(getStudentNameOnly(currentClass, seat) || '')}</span>`;

            btn.addEventListener('click', () => {
                let cur = cfg.seats || [];
                if (cur.includes(seat)) {
                    cur = cur.filter(s => s !== seat);
                } else {
                    const max = parseInt(countInput ? countInput.value : 2, 10) || 2;
                    if (cur.length >= max) {
                        cur = [...cur.slice(1), seat];
                    } else {
                        cur = [...cur, seat];
                    }
                }
                cfg.seats = cur;
                openDutyModal();
            });
            pickerGrid.appendChild(btn);
        });
    }

    const modal = document.getElementById('duty-manager-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

/**
 * 一屏全景極簡總覽 (Zero-Scroll Dashboard) 渲染核心
 */
export function renderZeroScrollDashboard() {
    const dashboard = document.getElementById('zero-scroll-dashboard');
    if (!dashboard) return;

    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassBoardConfig(currentClass);
    checkAutoRotateDuty(currentClass);

    // 模組一：本日值日生與重要注意事項橫幅
    const dutyContainer = document.getElementById('dashboard-duty-students');
    const cycleBadge = document.getElementById('dashboard-duty-cycle-badge');
    const announcementText = document.getElementById('dashboard-announcement-text');

    if (dutyContainer) {
        const dutySeats = currentClass.dutyConfig.seats || [];
        const dutyNames = dutySeats
            .map(seat => escapeHtml(getStudentDisplayName(currentClass, seat, true)))
            .join('、');
        dutyContainer.textContent = dutyNames || '尚未指定';
    }

    if (cycleBadge) {
        const mode = currentClass.dutyConfig.cycleMode || 'daily';
        let modeLabel = '每日輪替';
        if (mode === 'weekly') modeLabel = '每週輪替';
        else if (mode === 'custom') modeLabel = `每 ${currentClass.dutyConfig.customDays || 2} 天輪替`;
        else if (mode === 'manual') modeLabel = '手動輪更';
        cycleBadge.textContent = modeLabel;
    }

    if (announcementText) {
        const ann = currentClass.dutyConfig.announcement || '尚無常態注意事項，點擊「編輯設定」新增班級提醒';
        announcementText.textContent = ann;
        announcementText.title = ann;
    }

    // 模組二：聯絡簿與值日生（即時板書卡）
    const contactList = document.getElementById('dashboard-contact-list');
    const contactDate = document.getElementById('dashboard-contact-date');
    if (contactDate) {
        const today = new Date();
        const days = ['日', '一', '二', '三', '四', '五', '六'];
        contactDate.textContent = `${formatDate(today)} (${days[today.getDay()]})`;
    }

    if (contactList) {
        const dateString = formatDate(state.selectedDate || new Date(), 'YYYY-MM-DD');
        const items = currentClass.contactBook?.[dateString] || [];
        contactList.innerHTML = '';
        if (items.length === 0) {
            contactList.innerHTML = `
                <div class="h-full flex flex-col items-center justify-center py-6 text-center text-slate-300 font-sans select-none">
                    <i class="fa-solid fa-chalkboard text-2xl mb-2 text-slate-400 opacity-60"></i>
                    <p class="text-xs">今日尚無聯絡記事</p>
                    <p class="text-[11px] text-slate-400 mt-1">點擊下方按鈕可直達黑板書寫或複製 LINE 通報</p>
                </div>
            `;
        } else {
            items.forEach((item, idx) => {
                const row = document.createElement('div');
                row.className = 'flex items-start gap-2 py-1.5 px-2 border-b border-white/10 last:border-0 rounded-lg hover:bg-white/5 transition-colors';
                row.innerHTML = `
                    <span class="text-amber-300 font-black shrink-0 text-xs">${idx + 1}.</span>
                    <span class="text-slate-100 text-xs sm:text-sm font-sans whitespace-pre-wrap leading-relaxed select-text">${escapeHtml(item)}</span>
                `;
                contactList.appendChild(row);
            });
        }
    }

    // 模組三：待完成作業清單卡
    const hwListEl = document.getElementById('dashboard-homework-list');
    const pendingBadge = document.getElementById('dashboard-pending-count-badge');
    if (hwListEl) {
        const activeSeats = getActiveSeatsForClass(currentClass);
        const classHws = (state.appData.homeworks || []).filter(hw => hw.classId === currentClass.id);

        const pendingItems = [];
        classHws.forEach(hw => {
            const submittedSet = new Set(Array.isArray(hw.submitted) ? hw.submitted : []);
            const missingSeats = activeSeats.filter(s => !submittedSet.has(s));
            if (missingSeats.length > 0) {
                pendingItems.push({
                    hw,
                    missingSeats,
                    missingCount: missingSeats.length
                });
            }
        });

        // 依缺交人數多到少排序
        pendingItems.sort((a, b) => b.missingCount - a.missingCount);

        if (pendingBadge) {
            if (pendingItems.length > 0) {
                pendingBadge.textContent = `待收：${pendingItems.length} 項`;
                pendingBadge.className = 'px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-100 text-rose-700 border border-rose-200';
            } else {
                pendingBadge.textContent = '今日已全清';
                pendingBadge.className = 'px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-700 border border-emerald-200';
            }
        }

        hwListEl.innerHTML = '';
        if (pendingItems.length === 0) {
            // 成就勳章全達成大圖章 (FontAwesome circle-check 向量成就圖章)
            hwListEl.innerHTML = `
                <div class="h-full flex flex-col items-center justify-center py-8 px-4 text-center select-none">
                    <div class="relative flex items-center justify-center mb-3">
                        <div class="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-emerald-500 text-white flex items-center justify-center text-3xl sm:text-4xl shadow-xl shadow-emerald-500/25 ring-8 ring-emerald-100">
                            <i class="fa-solid fa-circle-check"></i>
                        </div>
                    </div>
                    <h4 class="text-base sm:text-lg font-black text-stone-900 mb-1">今日作業全數清點完畢，全班全員到齊！</h4>
                    <p class="text-xs sm:text-sm text-stone-500 font-bold max-w-sm leading-relaxed">
                        目前班級所有作業均已全數繳清，沒有任何缺交名單。
                    </p>
                </div>
            `;
        } else {
            pendingItems.forEach(({ hw, missingSeats, missingCount }) => {
                const itemEl = document.createElement('div');
                itemEl.className = 'p-3 sm:p-3.5 rounded-2xl bg-white border border-stone-200/90 shadow-xs hover:border-indigo-300 hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5';

                const chipsHtml = missingSeats.slice(0, 10).map(seat => `
                    <span class="text-[10px] font-bold bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded border border-stone-200">${seat}號</span>
                `).join('');
                const moreText = missingSeats.length > 10 ? `<span class="text-[10px] font-bold text-stone-400">+${missingSeats.length - 10}位...</span>` : '';

                itemEl.innerHTML = `
                    <div class="space-y-1.5 min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                            <span class="px-2 py-0.5 rounded-lg text-[11px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">${escapeHtml(hw.type || '作業')}</span>
                            <h4 class="text-xs sm:text-sm font-black text-stone-900 truncate" title="${escapeHtml(hw.name)}">${escapeHtml(hw.name)}</h4>
                            <span class="text-[10px] text-stone-400 font-medium shrink-0">${escapeHtml(hw.date || '')}</span>
                        </div>
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="text-[11px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200 shrink-0">
                                <i class="fa-solid fa-clock mr-1"></i>缺交：${missingCount} 人
                            </span>
                            <div class="flex items-center gap-1 flex-wrap">
                                ${chipsHtml}
                                ${moreText}
                            </div>
                        </div>
                    </div>
                    <button type="button" class="dashboard-hw-check-btn px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-xs flex items-center justify-center gap-1.5 shrink-0 transition-all cursor-pointer active:scale-95" data-hw-id="${hw.id}">
                        <i class="fa-solid fa-hand-pointer text-xs"></i>
                        <span>點收</span>
                    </button>
                `;

                hwListEl.appendChild(itemEl);
            });

            // 綁定點收按鈕點擊直接跳轉詳細座號矩陣
            hwListEl.querySelectorAll('.dashboard-hw-check-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const hwId = btn.getAttribute('data-hw-id');
                    if (hwId && window.showDetailPage) {
                        window.showDetailPage(hwId);
                    }
                });
            });
        }
    }
}

if (typeof window !== 'undefined') {
    window.renderZeroScrollDashboard = renderZeroScrollDashboard;
    window.openDutyModal = openDutyModal;
    window.rotateDutySeats = rotateDutySeats;
}

export function initSmartBoard() {
    // 日期導航按鈕組 (◀, ▶, 日期選擇器, 回到今天)
    document.getElementById('bb-prev-day-btn')?.addEventListener('click', () => {
        const d = new Date(state.selectedDate || new Date());
        d.setDate(d.getDate() - 1);
        state.selectedDate = d;
        renderEnhancedBlackboard();
    });

    document.getElementById('bb-next-day-btn')?.addEventListener('click', () => {
        const d = new Date(state.selectedDate || new Date());
        d.setDate(d.getDate() + 1);
        state.selectedDate = d;
        renderEnhancedBlackboard();
    });

    document.getElementById('bb-today-btn')?.addEventListener('click', () => {
        state.selectedDate = new Date();
        renderEnhancedBlackboard();
    });

    document.getElementById('bb-hidden-date-picker')?.addEventListener('change', (e) => {
        if (e.target.value) {
            state.selectedDate = new Date(e.target.value + 'T00:00:00');
            renderEnhancedBlackboard();
        }
    });

    // 全螢幕投影按鈕
    document.getElementById('bb-projector-zen-btn')?.addEventListener('click', toggleProjectorZenMode);
    document.getElementById('bb-zen-exit-btn')?.addEventListener('click', toggleProjectorZenMode);

    // 值日生管理入口
    document.getElementById('bb-open-duty-btn')?.addEventListener('click', openDutyModal);
    document.getElementById('dashboard-edit-duty-btn')?.addEventListener('click', openDutyModal);
    document.getElementById('close-duty-modal-btn')?.addEventListener('click', () => {
        document.getElementById('duty-manager-modal')?.classList.add('hidden');
        renderZeroScrollDashboard();
        renderEnhancedBlackboard();
    });

    // 週期模式選單切換 (顯示/隱藏自訂天數)
    document.getElementById('duty-cycle-mode-select')?.addEventListener('change', (e) => {
        const wrapper = document.getElementById('duty-custom-days-wrapper');
        if (wrapper) {
            wrapper.classList.toggle('hidden', e.target.value !== 'custom');
        }
    });

    // 儲存值日生與注意事項設定
    document.getElementById('save-duty-config-btn')?.addEventListener('click', () => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (!currentClass) return;
        ensureClassBoardConfig(currentClass);

        const countInput = document.getElementById('duty-count-input');
        const cycleModeSelect = document.getElementById('duty-cycle-mode-select');
        const customDaysInput = document.getElementById('duty-custom-days-input');
        const announcementInput = document.getElementById('duty-announcement-input');

        currentClass.dutyConfig.count = parseInt(countInput?.value || 2, 10);
        currentClass.dutyConfig.cycleMode = cycleModeSelect?.value || 'daily';
        currentClass.dutyConfig.customDays = parseInt(customDaysInput?.value || 2, 10);
        currentClass.dutyConfig.announcement = announcementInput?.value?.trim() || '';
        currentClass.dutyConfig.autoRotate = currentClass.dutyConfig.cycleMode !== 'manual';

        saveData();
        document.getElementById('duty-manager-modal')?.classList.add('hidden');
        renderZeroScrollDashboard();
        renderEnhancedBlackboard();
        showToast('已更新值日生與注意事項設定', 'success');
    });

    // 輪替至下一組值日生
    document.getElementById('duty-force-next-btn')?.addEventListener('click', () => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (!currentClass) return;
        rotateDutySeats(currentClass);
        currentClass.dutyConfig.lastRotatedDate = formatDate(new Date(), 'YYYY-MM-DD');
        saveData();
        openDutyModal();
        renderZeroScrollDashboard();
        renderEnhancedBlackboard();
        showToast('已即時輪更至下一組值日生', 'info');
    });
}
