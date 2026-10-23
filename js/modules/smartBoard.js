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
            autoRotate: true,
            lastRotatedDate: ''
        };
    }
    return classObj;
}

/**
 * 檢查並執行值日生每日自動輪替
 */
export function checkAutoRotateDuty(classObj) {
    if (!classObj) return;
    ensureClassBoardConfig(classObj);
    const cfg = classObj.dutyConfig;
    if (!cfg.autoRotate) return;

    const todayStr = formatDate(new Date(), 'YYYY-MM-DD');
    if (cfg.lastRotatedDate === todayStr) return;

    const activeSeats = getActiveSeatsForClass(classObj);
    if (activeSeats.length === 0) return;

    const count = Math.min(Math.max(cfg.count || 2, 1), 4);
    const currentSeats = Array.isArray(cfg.seats) ? cfg.seats : [activeSeats[0]];
    const lastSeat = currentSeats[currentSeats.length - 1] || activeSeats[0];

    let lastIdx = activeSeats.indexOf(lastSeat);
    if (lastIdx === -1) lastIdx = 0;

    const nextSeats = [];
    for (let i = 1; i <= count; i++) {
        const nextIdx = (lastIdx + i) % activeSeats.length;
        nextSeats.push(activeSeats[nextIdx]);
    }

    cfg.seats = nextSeats;
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

    const dateString = formatDate(state.selectedDate, 'YYYY-MM-DD');
    const items = currentClass.contactBook?.[dateString] || [];

    // 更新直/橫切換按鈕文字與圖示
    const toggleOrientationBtn = document.getElementById('bb-toggle-orientation-btn');
    if (toggleOrientationBtn) {
        toggleOrientationBtn.innerHTML = isVertical
            ? `<i class="fa-solid fa-arrows-left-right text-indigo-400 mr-1"></i><span>切換橫式</span>`
            : `<i class="fa-solid fa-arrows-up-down text-indigo-400 mr-1"></i><span>切換直式</span>`;
    }

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
 * 開啟值日生指派彈窗
 */
export function openDutyModal() {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassBoardConfig(currentClass);

    const activeSeats = getActiveSeatsForClass(currentClass);
    const cfg = currentClass.dutyConfig;

    const countInput = document.getElementById('duty-count-input');
    const autoRotateToggle = document.getElementById('duty-autorotate-toggle');
    const pickerGrid = document.getElementById('duty-seat-picker-grid');

    if (countInput) countInput.value = cfg.count || 2;
    if (autoRotateToggle) autoRotateToggle.checked = Boolean(cfg.autoRotate);

    if (pickerGrid) {
        pickerGrid.innerHTML = '';
        activeSeats.forEach(seat => {
            const isSelected = (cfg.seats || []).includes(seat);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `p-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${isSelected ? 'bg-indigo-600 text-white border-indigo-700 shadow-md ring-2 ring-indigo-300' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'}`;
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

export function initSmartBoard() {
    // 直橫排切換按鈕
    document.getElementById('bb-toggle-orientation-btn')?.addEventListener('click', () => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (!currentClass) return;
        ensureClassBoardConfig(currentClass);
        const cur = currentClass.blackboardConfig.writingMode;
        currentClass.blackboardConfig.writingMode = cur === 'vertical' ? 'horizontal' : 'vertical';
        saveData();
        renderEnhancedBlackboard();
        showToast(`已切換為「${currentClass.blackboardConfig.writingMode === 'vertical' ? '直式排版 (由右至左)' : '橫式排版'}」`, 'success');
    });

    // 全螢幕投影按鈕
    document.getElementById('bb-projector-zen-btn')?.addEventListener('click', toggleProjectorZenMode);
    document.getElementById('bb-zen-exit-btn')?.addEventListener('click', toggleProjectorZenMode);

    // 值日生管理入口
    document.getElementById('bb-open-duty-btn')?.addEventListener('click', openDutyModal);
    document.getElementById('close-duty-modal-btn')?.addEventListener('click', () => {
        document.getElementById('duty-manager-modal')?.classList.add('hidden');
        renderEnhancedBlackboard();
    });

    // 儲存值日生設定
    document.getElementById('save-duty-config-btn')?.addEventListener('click', () => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (!currentClass) return;
        const countInput = document.getElementById('duty-count-input');
        const autoRotateToggle = document.getElementById('duty-autorotate-toggle');
        currentClass.dutyConfig.count = parseInt(countInput?.value || 2, 10);
        currentClass.dutyConfig.autoRotate = autoRotateToggle ? autoRotateToggle.checked : true;
        saveData();
        document.getElementById('duty-manager-modal')?.classList.add('hidden');
        renderEnhancedBlackboard();
        showToast('已更新值日生設定', 'success');
    });

    // 輪替至下一組值日生
    document.getElementById('duty-force-next-btn')?.addEventListener('click', () => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (!currentClass) return;
        currentClass.dutyConfig.lastRotatedDate = '';
        checkAutoRotateDuty(currentClass);
        openDutyModal();
        showToast('已輪替至下一批值日生', 'info');
    });
}
