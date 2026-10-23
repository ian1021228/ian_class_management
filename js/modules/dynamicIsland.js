/**
 * 班級經營系統 - 模組 7：可收合浮動教師快捷島 (dynamicIsland.js)
 * 支援：
 * 1. 浮動膠囊 (Dynamic Island)：常駐畫面頂端，收合時展示「即時時間」與「今日到校出勤速報 (例: 28/30)」
 * 2. 邊緣磁吸與指標拖曳：6px 拖曳容差 deadzone、邊緣磁吸貼齊 (Magnetic Snap)、支援 Alt + 方向鍵鍵盤微調
 * 3. 展開式教師快捷中控島：
 *    - 快速切換點收方式（手動點收 / 條碼掃描）
 *    - 一鍵開啟【出勤簽到中樞】
 *    - 一鍵開啟【抽籤問答與加分】
 *    - 一鍵開啟【座位與分組編排】
 *    - 一鍵開啟【考試計時系統】
 *    - 一鍵切換全螢幕
 * 4. 全域快捷鍵：Cmd/Ctrl + K 隨時喚醒/收合快捷島
 */

import { state } from '../state.js';
import { formatDate } from '../utils.js';
import { applyCheckMode } from '../navigation.js';
import { getAttendanceSummaryForClass } from './attendanceHub.js';

let isIslandExpanded = false;
let isDragging = false;
let startX = 0, startY = 0;
let initialLeft = 0, initialTop = 0;
let hasMovedBeyondDeadzone = false;

export function refreshDynamicIsland() {
    const island = document.getElementById('aurora-dynamic-island');
    if (!island) return;

    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    const summary = getAttendanceSummaryForClass(currentClass, formatDate(new Date(), 'YYYY-MM-DD'));

    const timeText = document.getElementById('island-live-clock');
    if (timeText) {
        timeText.textContent = new Date().toTimeString().slice(0, 5);
    }

    const attPill = document.getElementById('island-att-summary-pill');
    if (attPill) {
        attPill.innerHTML = `<i class="fa-solid fa-users text-emerald-400 mr-1"></i><span>${summary.actualArrived}/${summary.expected}</span>`;
    }

    // 更新快捷島內的當前點收模式按鈕文字
    const modeLabel = document.getElementById('island-check-mode-label');
    if (modeLabel) {
        modeLabel.textContent = state.currentCheckMode === 'scan' ? '條碼掃描' : '手動點收';
    }
}

export function toggleDynamicIsland(expandState) {
    const island = document.getElementById('aurora-dynamic-island');
    const compactView = document.getElementById('island-compact-view');
    const expandedView = document.getElementById('island-expanded-view');
    if (!island || !compactView || !expandedView) return;

    if (expandState !== undefined) {
        isIslandExpanded = expandState;
    } else {
        isIslandExpanded = !isIslandExpanded;
    }

    if (isIslandExpanded) {
        compactView.classList.add('hidden');
        expandedView.classList.remove('hidden');
        island.classList.remove('aurora-glass-pill');
        island.classList.add('aurora-glass', 'rounded-3xl', 'p-4', 'shadow-2xl');
    } else {
        expandedView.classList.add('hidden');
        compactView.classList.remove('hidden');
        island.classList.remove('rounded-3xl', 'p-4', 'shadow-2xl');
        island.classList.add('aurora-glass-pill', 'rounded-full');
    }
    refreshDynamicIsland();
}

/**
 * 邊緣磁吸計算
 */
function snapIslandToEdge(island) {
    island.classList.add('island-snapping');
    const rect = island.getBoundingClientRect();
    const margin = 16;
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    let targetLeft = rect.left;
    let targetTop = Math.max(margin, Math.min(winH - rect.height - margin, rect.top));

    // 水平靠左、居中或靠右吸附
    if (rect.left < winW * 0.25) {
        targetLeft = margin;
    } else if (rect.left > winW * 0.75 - rect.width) {
        targetLeft = winW - rect.width - margin;
    } else {
        targetLeft = (winW - rect.width) / 2;
    }

    island.style.left = `${targetLeft}px`;
    island.style.top = `${targetTop}px`;

    setTimeout(() => {
        island.classList.remove('island-snapping');
    }, 450);
}

export function initDynamicIsland() {
    const island = document.getElementById('aurora-dynamic-island');
    if (!island) return;

    // 初始居中定位在視窗頂端
    island.style.top = '16px';
    island.style.left = '50%';
    island.style.transform = 'translateX(-50%)';

    // 指標拖曳 (Pointer Events 跨桌面與觸控手機)
    island.addEventListener('pointerdown', (e) => {
        // 若點擊的是裡面的按鈕，不觸發拖曳
        if (e.target.closest('button, a, input, select')) return;

        isDragging = true;
        hasMovedBeyondDeadzone = false;
        startX = e.clientX;
        startY = e.clientY;

        const rect = island.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        island.setPointerCapture(e.pointerId);
        island.style.transform = 'none';
        island.style.left = `${initialLeft}px`;
        island.style.top = `${initialTop}px`;
    });

    island.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (!hasMovedBeyondDeadzone && Math.hypot(dx, dy) > 6) {
            hasMovedBeyondDeadzone = true;
            island.classList.add('island-dragging');
        }

        if (hasMovedBeyondDeadzone) {
            island.style.left = `${initialLeft + dx}px`;
            island.style.top = `${initialTop + dy}px`;
        }
    });

    const finishDrag = (e) => {
        if (!isDragging) return;
        isDragging = false;
        island.classList.remove('island-dragging');

        try {
            island.releasePointerCapture(e.pointerId);
        } catch (err) {}

        if (hasMovedBeyondDeadzone) {
            snapIslandToEdge(island);
        } else {
            // 單擊未拖曳：展開或收合
            toggleDynamicIsland();
        }
    };

    island.addEventListener('pointerup', finishDrag);
    island.addEventListener('pointercancel', finishDrag);

    // 鍵盤微調 Alt + 方向鍵
    window.addEventListener('keydown', (e) => {
        if (e.altKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
            const step = 20;
            const rect = island.getBoundingClientRect();
            island.style.transform = 'none';
            if (e.key === 'ArrowUp') island.style.top = `${Math.max(10, rect.top - step)}px`;
            if (e.key === 'ArrowDown') island.style.top = `${rect.top + step}px`;
            if (e.key === 'ArrowLeft') island.style.left = `${Math.max(10, rect.left - step)}px`;
            if (e.key === 'ArrowRight') island.style.left = `${rect.left + step}px`;
        }
        // Cmd/Ctrl + K 快速開啟/收合快捷島
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            toggleDynamicIsland();
        }
    });

    // 快捷島內功能按鈕連動
    document.getElementById('island-close-expand-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDynamicIsland(false);
    });

    // 切換點收模式
    document.getElementById('island-toggle-check-mode-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const nextMode = state.currentCheckMode === 'scan' ? 'manual' : 'scan';
        applyCheckMode(nextMode);
        refreshDynamicIsland();
    });

    // 快捷工具開啟按鈕
    document.getElementById('island-btn-attendance')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDynamicIsland(false);
        document.getElementById('open-attendance-hub-btn')?.click();
    });

    document.getElementById('island-btn-draw')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDynamicIsland(false);
        document.getElementById('open-draw-points-modal-btn')?.click();
    });

    document.getElementById('island-btn-seating')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDynamicIsland(false);
        document.getElementById('open-classroom-studio-btn')?.click();
    });

    document.getElementById('island-btn-timer')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDynamicIsland(false);
        document.getElementById('open-exam-timer-btn')?.click();
    });

    document.getElementById('island-btn-blackboard')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDynamicIsland(false);
        document.getElementById('contact-book-btn')?.click();
    });

    // 定時刷新時鐘
    setInterval(refreshDynamicIsland, 30000);
    refreshDynamicIsland();
}

window.refreshDynamicIsland = refreshDynamicIsland;
