/**
 * 班級經營系統 - 模組 5：座位安排與課堂小組工作台 (classroomStudio.js)
 * 支援：
 * 1. 教室座位安排畫布（對照最新標準版面）：
 *    - 講台位置切換（【講台在上方 ⇄】與【講台在下方 ⇄】，座號 180° 完全翻轉）
 *    - 依座號安排、隨機安排、重排全部（所有人座號全數移至待安排區塊）
 *    - 復原 (Undo) 與 重做 (Redo) 歷史堆疊
 *    - 儲存配置與載入已存配置
 *    - 待安排學生清單、搜尋座號姓名、拖曳放置 (Drag & Drop) 與點選交換
 *    - 教室配置設定：排數、列數、個人網格 / 雙人併桌、走道與停用座位模式
 *    - 固定座位鎖定 (◇)
 * 2. 課堂小組團隊競賽：自訂組數平均分組、小組答題積分看板與榮譽頒獎台
 */

import { state } from '../state.js';
import { showToast, escapeHtml, openModal, closeModal } from '../utils.js';
import { saveData } from '../storage.js';
import { getActiveSeatsForClass, getStudentDisplayName, getStudentNameOnly } from './classWizard.js';

// 模組狀態
let currentStudioTab = 'seating'; // 'seating' | 'groups'
let podiumPosition = 'top'; // 'top' (講台在上方) | 'bottom' (講台在下方)
let onlySeatNumber = false;
let disableSeatMode = false;
let layoutType = 'individual'; // 'individual' | 'pairs'

// 選取中與拖曳狀態
let selectedSource = null; // { type: 'unassigned'|'seat', seat: number, r?: number, c?: number }
let draggedSource = null;

// 復原 / 重做 堆疊 (Undo / Redo Stack)
let historyStack = [];
let historyIndex = -1;
const MAX_HISTORY = 30;

function pushHistory(classObj) {
    if (!classObj || !classObj.seatingConfig) return;
    const snapshot = JSON.stringify({
        rows: classObj.seatingConfig.rows,
        cols: classObj.seatingConfig.cols,
        layout: classObj.seatingConfig.layout,
        lockedSeats: classObj.seatingConfig.lockedSeats || [],
        disabledSeats: classObj.seatingConfig.disabledSeats || []
    });

    if (historyIndex >= 0 && historyStack[historyIndex] === snapshot) return;

    historyStack = historyStack.slice(0, historyIndex + 1);
    historyStack.push(snapshot);
    if (historyStack.length > MAX_HISTORY) {
        historyStack.shift();
    }
    historyIndex = historyStack.length - 1;
    updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('studio-undo-btn');
    const redoBtn = document.getElementById('studio-redo-btn');
    if (undoBtn) undoBtn.disabled = historyIndex <= 0;
    if (redoBtn) redoBtn.disabled = historyIndex >= historyStack.length - 1;
}

export function undoSeating() {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass || historyIndex <= 0) return;

    historyIndex--;
    const stateObj = JSON.parse(historyStack[historyIndex]);
    currentClass.seatingConfig = {
        ...currentClass.seatingConfig,
        rows: stateObj.rows,
        cols: stateObj.cols,
        layout: stateObj.layout,
        lockedSeats: stateObj.lockedSeats,
        disabledSeats: stateObj.disabledSeats
    };
    saveData();
    renderClassroomStudio();
    updateUndoRedoButtons();
    showToast('已復原上一步操作', 'info');
}

export function redoSeating() {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass || historyIndex >= historyStack.length - 1) return;

    historyIndex++;
    const stateObj = JSON.parse(historyStack[historyIndex]);
    currentClass.seatingConfig = {
        ...currentClass.seatingConfig,
        rows: stateObj.rows,
        cols: stateObj.cols,
        layout: stateObj.layout,
        lockedSeats: stateObj.lockedSeats,
        disabledSeats: stateObj.disabledSeats
    };
    saveData();
    renderClassroomStudio();
    updateUndoRedoButtons();
    showToast('已重做下一步操作', 'info');
}

/**
 * 確保班級具備合法的 seatingConfig 與 groupsConfig
 */
export function ensureClassStudioData(classObj) {
    if (!classObj) return null;
    const activeSeats = getActiveSeatsForClass(classObj);

    if (!classObj.seatingConfig || typeof classObj.seatingConfig !== 'object') {
        const rows = 5;
        const cols = 6;
        const layout = [];
        let seatIdx = 0;
        for (let r = 0; r < rows; r++) {
            const rowArr = [];
            for (let c = 0; c < cols; c++) {
                if (seatIdx < activeSeats.length) {
                    rowArr.push(activeSeats[seatIdx++]);
                } else {
                    rowArr.push(null);
                }
            }
            layout.push(rowArr);
        }
        classObj.seatingConfig = {
            rows,
            cols,
            layout,
            lockedSeats: [],
            disabledSeats: []
        };
    }

    if (!Array.isArray(classObj.seatingConfig.lockedSeats)) {
        classObj.seatingConfig.lockedSeats = [];
    }
    if (!Array.isArray(classObj.seatingConfig.disabledSeats)) {
        classObj.seatingConfig.disabledSeats = [];
    }
    if (!classObj.seatingConfig.rows) classObj.seatingConfig.rows = 5;
    if (!classObj.seatingConfig.cols) classObj.seatingConfig.cols = 6;

    if (!classObj.groupsConfig || typeof classObj.groupsConfig !== 'object') {
        classObj.groupsConfig = {
            groupCount: 6,
            groups: [],
            groupScores: {}
        };
    }
    return classObj;
}

/**
 * 取得目前未分配座位的待安排學生座號清單
 */
function getUnassignedStudents(classObj) {
    if (!classObj) return [];
    const activeSeats = getActiveSeatsForClass(classObj);
    const assignedSet = new Set();

    if (classObj.seatingConfig && Array.isArray(classObj.seatingConfig.layout)) {
        classObj.seatingConfig.layout.forEach(row => {
            if (Array.isArray(row)) {
                row.forEach(seat => {
                    if (seat !== null && seat !== undefined) {
                        assignedSet.add(Number(seat));
                    }
                });
            }
        });
    }

    return activeSeats.filter(s => !assignedSet.has(Number(s)));
}

/**
 * 依座號安排全班座位 (升冪排入非停用空位)
 */
export function autoAssignBySeatNumber() {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassStudioData(currentClass);

    const cfg = currentClass.seatingConfig;
    const activeSeats = getActiveSeatsForClass(currentClass);
    const lockedSet = new Set(cfg.lockedSeats || []);
    const disabledSet = new Set(cfg.disabledSeats || []);

    // 收集所有尚未被固定在原位的學生座號
    const remainingStudents = activeSeats.filter(s => !lockedSet.has(s)).sort((a, b) => a - b);
    let sIdx = 0;

    for (let r = 0; r < cfg.rows; r++) {
        if (!cfg.layout[r]) cfg.layout[r] = [];
        for (let c = 0; c < cfg.cols; c++) {
            const cellKey = `${r}_${c}`;
            if (disabledSet.has(cellKey)) {
                cfg.layout[r][c] = null;
                continue;
            }
            const currentSeat = cfg.layout[r][c];
            if (currentSeat && lockedSet.has(currentSeat)) {
                // 固定座位保留
                continue;
            }
            if (sIdx < remainingStudents.length) {
                cfg.layout[r][c] = remainingStudents[sIdx++];
            } else {
                cfg.layout[r][c] = null;
            }
        }
    }

    pushHistory(currentClass);
    saveData();
    renderClassroomStudio();
    showToast('已依座號順序安排全班座位', 'success');
}

/**
 * 隨機安排全班座位（保留固定座位 ◇）
 */
export function randomAssignSeats() {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassStudioData(currentClass);

    const cfg = currentClass.seatingConfig;
    const activeSeats = getActiveSeatsForClass(currentClass);
    const lockedSet = new Set(cfg.lockedSeats || []);
    const disabledSet = new Set(cfg.disabledSeats || []);

    // 可移動的學生
    const movableStudents = activeSeats.filter(s => !lockedSet.has(s));

    // Fisher-Yates 洗牌
    for (let i = movableStudents.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [movableStudents[i], movableStudents[j]] = [movableStudents[j], movableStudents[i]];
    }

    let mIdx = 0;
    for (let r = 0; r < cfg.rows; r++) {
        if (!cfg.layout[r]) cfg.layout[r] = [];
        for (let c = 0; c < cfg.cols; c++) {
            const cellKey = `${r}_${c}`;
            if (disabledSet.has(cellKey)) {
                cfg.layout[r][c] = null;
                continue;
            }
            const currentSeat = cfg.layout[r][c];
            if (currentSeat && lockedSet.has(currentSeat)) {
                continue; // 保留固定座位
            }
            if (mIdx < movableStudents.length) {
                cfg.layout[r][c] = movableStudents[mIdx++];
            } else {
                cfg.layout[r][c] = null;
            }
        }
    }

    pushHistory(currentClass);
    saveData();
    renderClassroomStudio();
    showToast(`已隨機安排座位（已保留 ${lockedSet.size} 個固定座位）`, 'success');
}

/**
 * 重排全部：將所有人座號清空，全數移動至待安排區塊
 */
export function clearAllSeatsToUnassigned() {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassStudioData(currentClass);

    const cfg = currentClass.seatingConfig;
    for (let r = 0; r < cfg.rows; r++) {
        if (!cfg.layout[r]) cfg.layout[r] = [];
        for (let c = 0; c < cfg.cols; c++) {
            cfg.layout[r][c] = null;
        }
    }
    cfg.lockedSeats = [];

    pushHistory(currentClass);
    saveData();
    renderClassroomStudio();
    showToast('已重排全部，所有學生已移至待安排區塊', 'info');
}

/**
 * 切換講台位置（講台在上方 ⇄ 講台在下方）
 */
export function togglePodiumPosition() {
    podiumPosition = podiumPosition === 'top' ? 'bottom' : 'top';
    renderClassroomStudio();
    showToast(`已切換為「${podiumPosition === 'top' ? '講台在上方' : '講台在下方'}」`, 'info');
}

/**
 * 切換特定座位的固定狀態
 */
function toggleSeatLocked(seatNum) {
    if (!seatNum) return;
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassStudioData(currentClass);

    const cfg = currentClass.seatingConfig;
    const idx = cfg.lockedSeats.indexOf(seatNum);
    if (idx >= 0) {
        cfg.lockedSeats.splice(idx, 1);
        showToast(`已解除座號 ${seatNum} 號的固定位置`, 'info');
    } else {
        cfg.lockedSeats.push(seatNum);
        showToast(`已將座號 ${seatNum} 號設為固定位置 (◇)`, 'success');
    }
    pushHistory(currentClass);
    saveData();
    renderClassroomStudio();
}

/**
 * 切換單元格的停用/走道狀態
 */
function toggleCellDisabled(r, c) {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassStudioData(currentClass);

    const cfg = currentClass.seatingConfig;
    const cellKey = `${r}_${c}`;
    const idx = cfg.disabledSeats.indexOf(cellKey);

    if (idx >= 0) {
        cfg.disabledSeats.splice(idx, 1);
    } else {
        const student = cfg.layout[r]?.[c];
        if (student && cfg.lockedSeats.includes(student)) {
            showToast('該座位為固定座位，請先解除固定再設為走道', 'error');
            return;
        }
        cfg.disabledSeats.push(cellKey);
        if (cfg.layout[r]) cfg.layout[r][c] = null;
    }

    pushHistory(currentClass);
    saveData();
    renderClassroomStudio();
}

/**
 * 將學生指派或移動到指定格 (r, c)
 */
function placeStudentAtCell(seatNum, targetR, targetC) {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassStudioData(currentClass);

    const cfg = currentClass.seatingConfig;
    const cellKey = `${targetR}_${targetC}`;
    if (cfg.disabledSeats.includes(cellKey)) {
        showToast('該位置為走道停用空位，無法安排座位', 'error');
        return;
    }

    // 檢查該學生原本是否在某個座位上，若有則清空原位置或互換
    let originR = null, originC = null;
    for (let r = 0; r < cfg.rows; r++) {
        for (let c = 0; c < cfg.cols; c++) {
            if (cfg.layout[r]?.[c] === seatNum) {
                originR = r;
                originC = c;
                break;
            }
        }
        if (originR !== null) break;
    }

    const targetOldStudent = cfg.layout[targetR]?.[targetC];

    // 填入目標位置
    if (!cfg.layout[targetR]) cfg.layout[targetR] = [];
    cfg.layout[targetR][targetC] = seatNum;

    // 若原本有座位，將目標原本的學生移到原位置（互換）
    if (originR !== null && originC !== null) {
        cfg.layout[originR][originC] = targetOldStudent || null;
    }

    selectedSource = null;
    pushHistory(currentClass);
    saveData();
    renderClassroomStudio();

    const studentName = getStudentNameOnly(currentClass, seatNum);
    const targetLabel = `${targetR + 1}排 ${targetC + 1}列`;
    if (targetOldStudent && originR !== null) {
        showToast(`已將 ${seatNum} 號與 ${targetOldStudent} 號座位互換`, 'info');
    } else {
        showToast(`已將 ${seatNum} 號${studentName ? ' ' + studentName : ''} 安排至【${targetLabel}】`, 'success');
    }
}

/**
 * 渲染座位安排與小組工作室主介面
 */
export function renderClassroomStudio() {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassStudioData(currentClass);

    // 班級標籤
    const classBadge = document.getElementById('studio-class-badge');
    if (classBadge) classBadge.textContent = currentClass.name;

    // 標籤頁切換樣式
    const seatingTabBtn = document.getElementById('studio-tab-btn-seating');
    const groupsTabBtn = document.getElementById('studio-tab-btn-groups');
    const seatingView = document.getElementById('studio-view-seating');
    const groupsView = document.getElementById('studio-view-groups');

    if (currentStudioTab === 'seating') {
        seatingTabBtn?.classList.add('bg-stone-800', 'text-white');
        seatingTabBtn?.classList.remove('bg-white', 'text-stone-600');
        groupsTabBtn?.classList.remove('bg-stone-800', 'text-white');
        groupsTabBtn?.classList.add('bg-white', 'text-stone-600');
        seatingView?.classList.remove('hidden');
        groupsView?.classList.add('hidden');
        renderSeatingView(currentClass);
    } else {
        groupsTabBtn?.classList.add('bg-stone-800', 'text-white');
        groupsTabBtn?.classList.remove('bg-white', 'text-stone-600');
        seatingTabBtn?.classList.remove('bg-stone-800', 'text-white');
        seatingTabBtn?.classList.add('bg-white', 'text-stone-600');
        groupsView?.classList.remove('hidden');
        seatingView?.classList.add('hidden');
        renderGroupsView(currentClass);
    }
}

/**
 * 渲染座位畫布 (Seating Canvas) 與 右側待安排/配置面板
 */
function renderSeatingView(currentClass) {
    const cfg = currentClass.seatingConfig;
    const lockedSet = new Set(cfg.lockedSeats || []);
    const disabledSet = new Set(cfg.disabledSeats || []);

    // 1. 講台指示與按鈕文字
    const podiumToggleText = document.getElementById('studio-podium-toggle-text');
    const podiumTop = document.getElementById('studio-podium-top');
    const podiumBottom = document.getElementById('studio-podium-bottom');

    if (podiumPosition === 'top') {
        if (podiumToggleText) podiumToggleText.textContent = '講台在上方';
        podiumTop?.classList.remove('hidden');
        podiumTop?.classList.add('flex');
        podiumBottom?.classList.add('hidden');
        podiumBottom?.classList.remove('flex');
    } else {
        if (podiumToggleText) podiumToggleText.textContent = '講台在下方';
        podiumTop?.classList.add('hidden');
        podiumTop?.classList.remove('flex');
        podiumBottom?.classList.remove('hidden');
        podiumBottom?.classList.add('flex');
    }

    // 停用座位核取方塊
    const disableSeatCheckbox = document.getElementById('studio-disable-seat-mode-checkbox');
    if (disableSeatCheckbox) disableSeatCheckbox.checked = disableSeatMode;

    // 排數與列數輸入框
    const rowsInput = document.getElementById('studio-rows-input');
    const colsInput = document.getElementById('studio-cols-input');
    if (rowsInput) rowsInput.value = cfg.rows;
    if (colsInput) colsInput.value = cfg.cols;

    // 排列選單
    const layoutSelect = document.getElementById('studio-layout-type-select');
    if (layoutSelect) layoutSelect.value = layoutType;

    // 2. 渲染座位網格 (Seats Grid)
    const seatsGrid = document.getElementById('studio-seats-grid');
    if (seatsGrid) {
        seatsGrid.innerHTML = '';
        seatsGrid.style.gridTemplateColumns = `repeat(${cfg.cols}, minmax(80px, 1fr))`;

        // 判定遍歷順序 (講台在上方 vs 講台在下方 180° 完全旋轉)
        const rowIndices = [];
        const colIndices = [];

        if (podiumPosition === 'top') {
            for (let r = 0; r < cfg.rows; r++) rowIndices.push(r);
            for (let c = 0; c < cfg.cols; c++) colIndices.push(c);
        } else {
            // 講台在下方：第 5 排在最上方、第 6 列在最左側
            for (let r = cfg.rows - 1; r >= 0; r--) rowIndices.push(r);
            for (let c = cfg.cols - 1; c >= 0; c--) colIndices.push(c);
        }

        let emptyCount = 0;

        rowIndices.forEach(r => {
            colIndices.forEach(c => {
                const cellKey = `${r}_${c}`;
                const isDisabled = disabledSet.has(cellKey);
                const studentSeat = cfg.layout[r]?.[c];
                const isLocked = studentSeat && lockedSet.has(studentSeat);
                const isSelected = selectedSource && selectedSource.type === 'seat' && selectedSource.r === r && selectedSource.c === c;

                if (!isDisabled && !studentSeat) emptyCount++;

                const cell = document.createElement('div');
                cell.className = `relative rounded-2xl border transition-all select-none p-2 sm:p-2.5 flex flex-col items-center justify-between min-h-[92px] ${
                    isDisabled 
                        ? 'bg-stone-100 border-dashed border-stone-300 opacity-60 cursor-pointer'
                        : isSelected
                            ? 'bg-amber-50 border-2 border-amber-500 shadow-md ring-2 ring-amber-400/30'
                            : studentSeat
                                ? 'bg-white border-stone-200/90 shadow-2xs hover:border-emerald-500 hover:shadow-xs cursor-pointer'
                                : 'bg-white border-stone-200/90 hover:border-stone-400 hover:bg-stone-50/50 cursor-pointer'
                }`;

                cell.dataset.r = r;
                cell.dataset.c = c;

                // 標題顯示：X排 Y列（始終展示真實排與列）
                const posLabel = `${r + 1}排 ${c + 1}列`;

                if (isDisabled) {
                    cell.innerHTML = `
                        <span class="text-[10px] font-bold text-stone-400">${posLabel}</span>
                        <div class="my-auto text-xs font-bold text-stone-400 flex items-center gap-1">
                            <i class="fa-solid fa-ban text-[11px]"></i>
                            <span>走道</span>
                        </div>
                        <span class="text-[10px] text-stone-400 font-medium">停用</span>
                    `;
                } else if (studentSeat) {
                    const studentName = getStudentNameOnly(currentClass, studentSeat);
                    cell.draggable = true;

                    if (isSelected) {
                        cell.innerHTML = `
                            <div class="w-full flex items-center justify-between">
                                <span class="text-[10px] font-bold text-amber-700">${posLabel}</span>
                                ${isLocked ? `<span class="text-amber-500 font-black text-xs cursor-pointer" title="固定座位 (點擊解除)"><i class="fa-solid fa-diamond"></i></span>` : ''}
                            </div>
                            <div class="my-auto text-center w-full flex flex-col items-center justify-center gap-1.5 py-1">
                                <div class="flex items-center justify-center gap-1">
                                    <strong class="font-mono text-xl font-black text-rose-700 leading-none">${studentSeat}</strong>
                                    ${studentName ? `<span class="text-xs font-bold text-stone-700 truncate max-w-[65px]">${escapeHtml(studentName)}</span>` : ''}
                                </div>
                                <button type="button" class="studio-remove-to-unassigned-btn px-2.5 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-90 text-white font-black text-xs shadow-md shadow-rose-600/30 flex items-center justify-center gap-1 transition-all cursor-pointer select-none" data-seat="${studentSeat}" data-r="${r}" data-c="${c}" title="移至待安排">
                                    <i class="fa-solid fa-arrow-right-from-bracket text-[10px]"></i>
                                    <span>移至待安排</span>
                                </button>
                            </div>
                            <span class="text-[10px] text-rose-600 font-black">已選定</span>
                        `;
                    } else {
                        cell.innerHTML = `
                            <div class="w-full flex items-center justify-between">
                                <span class="text-[10px] font-bold text-stone-400">${posLabel}</span>
                                ${isLocked ? `<span class="text-amber-500 font-black text-xs cursor-pointer" title="固定座位 (點擊解除)"><i class="fa-solid fa-diamond"></i></span>` : ''}
                            </div>
                            <div class="my-auto text-center w-full">
                                <strong class="font-mono text-2xl font-black text-stone-800 leading-none block">${studentSeat}</strong>
                                ${!onlySeatNumber && studentName ? `<span class="text-xs font-bold text-stone-600 truncate max-w-full block mt-0.5">${escapeHtml(studentName)}</span>` : ''}
                            </div>
                            <span class="text-[10px] text-emerald-700 font-bold">${isLocked ? '已固定' : '已就座'}</span>
                        `;
                    }

                    // 拖曳來源
                    cell.addEventListener('dragstart', (e) => {
                        draggedSource = { type: 'seat', seat: studentSeat, r, c };
                        e.dataTransfer.setData('text/plain', String(studentSeat));
                    });
                    cell.addEventListener('dragend', () => {
                        draggedSource = null;
                        setUnassignedDragHighlight(false);
                    });
                } else {
                    // 空位
                    const isUnassignedSelected = selectedSource && selectedSource.type === 'unassigned';
                    if (isUnassignedSelected) {
                        cell.className = `relative rounded-2xl border-2 border-dashed border-emerald-500 bg-emerald-50/80 hover:bg-emerald-100 hover:border-emerald-600 shadow-xs cursor-pointer transition-all select-none p-2 sm:p-2.5 flex flex-col items-center justify-between min-h-[92px] group`;
                        cell.innerHTML = `
                            <span class="text-[10px] font-black text-emerald-700">${posLabel}</span>
                            <div class="my-auto flex flex-col items-center justify-center text-emerald-800">
                                <i class="fa-solid fa-arrow-down text-sm mb-0.5 group-hover:scale-110 transition-transform"></i>
                                <span class="text-xs font-black">點擊安排</span>
                            </div>
                            <span class="text-[10px] text-emerald-600 font-bold">${selectedSource.seat} 號入座</span>
                        `;
                    } else {
                        cell.className = `relative rounded-2xl border transition-all select-none p-2 sm:p-2.5 flex flex-col items-center justify-between min-h-[92px] bg-white border-stone-200/90 hover:border-emerald-400 hover:bg-emerald-50/30 cursor-pointer group`;
                        cell.innerHTML = `
                            <span class="text-[10px] font-bold text-stone-400">${posLabel}</span>
                            <div class="my-auto text-center">
                                <strong class="font-black text-2xl text-stone-300 group-hover:text-emerald-600 leading-none block transition-colors">+</strong>
                                <span class="text-[10px] text-stone-400 group-hover:text-emerald-700 font-bold block mt-0.5 transition-colors">點擊選座號</span>
                            </div>
                            <span class="text-[11px] font-bold text-stone-400">空位</span>
                        `;
                    }
                }

                // 點擊事件
                cell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (disableSeatMode) {
                        toggleCellDisabled(r, c);
                        return;
                    }

                    // 若點擊移至待安排按鈕
                    const removeBtn = e.target.closest('.studio-remove-to-unassigned-btn');
                    if (removeBtn && studentSeat) {
                        moveStudentToUnassigned(studentSeat, r, c);
                        return;
                    }

                    // 若點擊的是固定菱形圖標
                    if (e.target.closest('.fa-diamond') && studentSeat) {
                        toggleSeatLocked(studentSeat);
                        return;
                    }

                    // 若目前已有選取來源
                    if (selectedSource) {
                        if (selectedSource.type === 'unassigned') {
                            placeStudentAtCell(selectedSource.seat, r, c);
                        } else if (selectedSource.type === 'seat') {
                            if (selectedSource.r === r && selectedSource.c === c) {
                                // 點同一個座位：取消選取
                                selectedSource = null;
                                renderClassroomStudio();
                            } else {
                                // 互換座位或移到空位
                                placeStudentAtCell(selectedSource.seat, r, c);
                            }
                        }
                    } else {
                        // 首次選取該座位
                        if (studentSeat) {
                            selectedSource = { type: 'seat', seat: studentSeat, r, c };
                            renderClassroomStudio();
                        } else if (!isDisabled) {
                            // 直接按下空位 -> 跳出待安排座號選擇彈窗！
                            openSeatPickerModal(r, c);
                        }
                    }
                });

                // 拖曳放置目標
                cell.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    cell.classList.add('border-emerald-500', 'bg-emerald-50/40');
                });
                cell.addEventListener('dragleave', () => {
                    cell.classList.remove('border-emerald-500', 'bg-emerald-50/40');
                });
                cell.addEventListener('drop', (e) => {
                    e.preventDefault();
                    cell.classList.remove('border-emerald-500', 'bg-emerald-50/40');
                    if (draggedSource) {
                        placeStudentAtCell(draggedSource.seat, r, c);
                        draggedSource = null;
                    }
                });

                seatsGrid.appendChild(cell);
            });
        });

        // 3. 更新右側摘要
        const summaryText = document.getElementById('studio-summary-text');
        if (summaryText) {
            summaryText.textContent = `空位 ${emptyCount} · 固定 ${lockedSet.size} · `;
        }
    }

    // 4. 渲染右側待安排學生清單
    const unassignedList = getUnassignedStudents(currentClass);
    const unassignedCountBadge = document.getElementById('studio-unassigned-count');
    if (unassignedCountBadge) unassignedCountBadge.textContent = unassignedList.length;

    const unassignedContainer = document.getElementById('studio-unassigned-list');
    const searchVal = (document.getElementById('studio-unassigned-search')?.value || '').trim().toLowerCase();

    if (unassignedContainer) {
        unassignedContainer.innerHTML = '';
        if (unassignedList.length === 0) {
            unassignedContainer.innerHTML = `
                <div class="text-center py-4 w-full text-xs text-stone-400 font-bold flex items-center justify-center gap-1.5">
                    <i class="fa-solid fa-circle-check text-emerald-500"></i>
                    <span>全員皆已安排座位</span>
                </div>
            `;
        } else {
            const filtered = unassignedList.filter(seat => {
                if (!searchVal) return true;
                const name = getStudentNameOnly(currentClass, seat) || '';
                return String(seat).includes(searchVal) || name.toLowerCase().includes(searchVal);
            });

            if (filtered.length === 0) {
                unassignedContainer.innerHTML = `<span class="text-xs text-stone-400 font-bold p-2">查無符合的學生</span>`;
            } else {
                filtered.forEach(seat => {
                    const name = getStudentNameOnly(currentClass, seat) || '';
                    const isSelected = selectedSource && selectedSource.type === 'unassigned' && selectedSource.seat === seat;

                    const chip = document.createElement('button');
                    chip.type = 'button';
                    chip.draggable = true;
                    chip.className = `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer active:scale-95 select-none ${
                        isSelected 
                            ? 'bg-amber-100 border-amber-500 text-amber-900 shadow-xs ring-2 ring-amber-400/40'
                            : 'bg-stone-50 hover:bg-emerald-50 border-stone-200 text-stone-700 hover:border-emerald-300'
                    }`;

                    chip.innerHTML = `
                        <strong class="font-mono text-sm ${isSelected ? 'text-amber-900 font-black' : 'text-stone-900'}">${seat}</strong>
                        <span class="truncate max-w-[80px]">${escapeHtml(name)}</span>
                        ${isSelected ? '<span class="text-[9px] bg-amber-600 text-white font-black px-1.5 py-0.5 rounded-full ml-0.5 shadow-2xs">已選</span>' : ''}
                    `;

                    chip.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (selectedSource && selectedSource.type === 'unassigned' && selectedSource.seat === seat) {
                            selectedSource = null;
                        } else {
                            selectedSource = { type: 'unassigned', seat };
                            showToast(`已選取 ${seat} 號，請點選座位表中任意「空位」入座`, 'info');
                        }
                        renderClassroomStudio();
                    });

                    chip.addEventListener('dragstart', (e) => {
                        draggedSource = { type: 'unassigned', seat };
                        e.dataTransfer.setData('text/plain', String(seat));
                    });

                    unassignedContainer.appendChild(chip);
                });
            }
        }
    }
}

let isUnassignedDragHovered = false;
export function setUnassignedDragHighlight(active) {
    const sec = document.getElementById('studio-unassigned-section');
    if (!sec) return;
    if (active) {
        if (!isUnassignedDragHovered) {
            isUnassignedDragHovered = true;
            sec.classList.add('bg-rose-50/70', 'border-rose-400', 'border-dashed');
        }
    } else {
        if (isUnassignedDragHovered) {
            isUnassignedDragHovered = false;
            sec.classList.remove('bg-rose-50/70', 'border-rose-400', 'border-dashed');
        }
    }
}

/**
 * 將指定座位上的學生移回待安排區塊
 */
export function moveStudentToUnassigned(seat, r, c) {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass || !currentClass.seatingConfig) return;
    const cfg = currentClass.seatingConfig;
    if (cfg.layout && cfg.layout[r] && cfg.layout[r][c] === seat) {
        cfg.layout[r][c] = null;
    }
    const lIdx = cfg.lockedSeats ? cfg.lockedSeats.indexOf(seat) : -1;
    if (lIdx >= 0) cfg.lockedSeats.splice(lIdx, 1);
    selectedSource = null;
    draggedSource = null;
    setUnassignedDragHighlight(false);
    pushHistory(currentClass);
    saveData();
    renderClassroomStudio();
    showToast(`已將 ${seat} 號移回待安排名單`, 'info');
}

/**
 * 渲染分組團隊競賽畫面 (Groups View)
 */
function renderGroupsView(currentClass) {
    const container = document.getElementById('studio-groups-container');
    if (!container) return;
    container.innerHTML = '';

    const groupsCfg = currentClass.groupsConfig || {};
    const groups = groupsCfg.groups || [];
    const scores = groupsCfg.groupScores || {};

    // 0. 同步分組競賽工具列組數與 Stepper 按鈕狀態
    const toolbarGroupCountDisplay = document.getElementById('studio-toolbar-group-count-display');
    if (toolbarGroupCountDisplay) {
        toolbarGroupCountDisplay.textContent = `${groups.length || 6} 組`;
    }
    const decBtn = document.getElementById('studio-toolbar-group-dec-btn');
    if (decBtn) {
        const isMin = groups.length <= 2;
        decBtn.disabled = isMin;
        decBtn.classList.toggle('opacity-40', isMin);
        decBtn.classList.toggle('cursor-not-allowed', isMin);
    }
    const incBtn = document.getElementById('studio-toolbar-group-inc-btn');
    if (incBtn) {
        const isMax = groups.length >= 16;
        incBtn.disabled = isMax;
        incBtn.classList.toggle('opacity-40', isMax);
        incBtn.classList.toggle('cursor-not-allowed', isMax);
    }

    if (groups.length === 0) {
        container.innerHTML = `
            <div class="col-span-full py-12 text-center text-stone-400 font-bold space-y-3">
                <i class="fa-solid fa-people-group text-4xl text-stone-300"></i>
                <p>尚未建立小組分組，請點擊上方「隨機分組」或「手動設定組員」按鈕開始分組</p>
            </div>
        `;
        return;
    }

    // 計算名次
    const sortedGroups = [...groups].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
    const rankMap = new Map();
    sortedGroups.forEach((g, idx) => rankMap.set(g.id, idx + 1));

    groups.forEach(g => {
        const score = scores[g.id] || 0;
        const rank = rankMap.get(g.id) || 1;
        const isPodium = rank <= 3;
        const medalColors = ['text-amber-500', 'text-stone-400', 'text-amber-700'];

        const card = document.createElement('div');
        card.className = `p-4 sm:p-5 rounded-3xl border transition-all shadow-xs flex flex-col justify-between ${
            isPodium ? 'bg-gradient-to-br from-amber-50/80 via-white to-amber-50/40 border-amber-300' : 'bg-white border-stone-200/90'
        }`;

        const membersHtml = (g.seats || []).map(seat => `
            <span class="inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-stone-50 border border-stone-200/80 text-xs font-bold text-stone-700">
                <strong class="font-mono text-stone-900">${seat}號</strong>
                <span class="truncate max-w-[65px]">${escapeHtml(getStudentNameOnly(currentClass, seat) || '')}</span>
                <button type="button" class="studio-remove-group-member-btn text-stone-400 hover:text-rose-600 transition-colors p-0.5 cursor-pointer ml-0.5" data-gid="${g.id}" data-seat="${seat}" title="自此組移出">
                    <i class="fa-solid fa-xmark text-[10px]"></i>
                </button>
            </span>
        `).join('');

        const addMemberBtnHtml = `
            <button type="button" class="studio-add-member-btn inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 border border-dashed border-amber-300 text-xs font-black text-amber-800 cursor-pointer active:scale-95" data-gid="${g.id}" title="加入組員">
                <i class="fa-solid fa-plus text-[10px]"></i>
                <span>加入組員</span>
            </button>
        `;

        card.innerHTML = `
            <div>
                <div class="flex items-center justify-between pb-2 border-b border-stone-100 mb-3">
                    <div class="flex items-center gap-2">
                        ${isPodium ? `<i class="fa-solid fa-trophy ${medalColors[rank - 1]} text-lg"></i>` : `<span class="w-6 h-6 rounded-full bg-stone-100 text-stone-600 flex items-center justify-center font-mono font-bold text-xs">${rank}</span>`}
                        <h4 class="font-black text-stone-900 text-base">${escapeHtml(g.name)}</h4>
                        <button type="button" class="studio-edit-group-btn text-stone-400 hover:text-amber-800 p-1 text-xs font-bold transition-colors cursor-pointer" data-gid="${g.id}" title="手動設定此組成員">
                            <i class="fa-solid fa-user-pen"></i>
                        </button>
                    </div>
                    <div class="flex items-center gap-1">
                        <span class="font-black font-mono text-xl text-stone-900">${score}</span>
                        <span class="text-[10px] text-stone-400 font-bold">分</span>
                    </div>
                </div>
                <div class="flex flex-wrap gap-1.5 mb-4 items-center">
                    ${membersHtml}
                    ${addMemberBtnHtml}
                </div>
            </div>
            <div class="pt-3 border-t border-stone-100 flex items-center justify-between gap-1">
                <span class="text-xs font-bold text-stone-400">小組計分：</span>
                <div class="flex items-center gap-1.5">
                    <button type="button" data-gid="${g.id}" data-delta="-1" class="group-score-btn px-2.5 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-black text-xs cursor-pointer active:scale-95">-1</button>
                    <button type="button" data-gid="${g.id}" data-delta="1" class="group-score-btn px-3 py-1 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 font-black text-xs cursor-pointer active:scale-95">+1</button>
                    <button type="button" data-gid="${g.id}" data-delta="2" class="group-score-btn px-3 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-black text-xs cursor-pointer active:scale-95">+2</button>
                </div>
            </div>
        `;

        card.querySelectorAll('.group-score-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const gid = btn.dataset.gid;
                const d = parseInt(btn.dataset.delta, 10);
                if (!currentClass.groupsConfig.groupScores) currentClass.groupsConfig.groupScores = {};
                currentClass.groupsConfig.groupScores[gid] = (currentClass.groupsConfig.groupScores[gid] || 0) + d;
                saveData();
                renderClassroomStudio();
            });
        });

        card.querySelectorAll('.studio-remove-group-member-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeStudentFromGroup(btn.dataset.gid, parseInt(btn.dataset.seat, 10));
            });
        });

        card.querySelectorAll('.studio-edit-group-btn, .studio-add-member-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openManualGroupModal(btn.dataset.gid);
            });
        });

        container.appendChild(card);
    });
}

let activePickerTarget = null; // { r, c }

/**
 * 開啟空位座號快速指派彈窗
 */
export function openSeatPickerModal(r, c) {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassStudioData(currentClass);

    activePickerTarget = { r, c };
    const badge = document.getElementById('studio-seat-picker-pos-badge');
    if (badge) badge.textContent = `${r + 1}排 ${c + 1}列`;

    const searchInp = document.getElementById('studio-seat-picker-search');
    if (searchInp) searchInp.value = '';

    const modal = document.getElementById('studio-seat-picker-modal');
    if (modal) {
        openModal(modal);
        renderSeatPickerModalContent();
    }
}

/**
 * 渲染空位座號指派彈窗內容
 */
function renderSeatPickerModalContent() {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass || !activePickerTarget) return;

    const unassignedList = getUnassignedStudents(currentClass);
    const statsEl = document.getElementById('studio-seat-picker-unassigned-stats');
    if (statsEl) statsEl.textContent = `共 ${unassignedList.length} 人`;

    const searchVal = (document.getElementById('studio-seat-picker-search')?.value || '').trim().toLowerCase();
    const grid = document.getElementById('studio-seat-picker-students-grid');
    if (!grid) return;

    grid.innerHTML = '';

    if (unassignedList.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full py-8 text-center text-xs text-stone-400 font-bold space-y-2">
                <i class="fa-solid fa-circle-check text-2xl text-emerald-500"></i>
                <p>目前待安排名單無學生（全班皆已就座）</p>
                <p class="text-[11px] text-stone-400 font-normal">若需微調，可直接在座位表點選已就座學生進行對調</p>
            </div>
        `;
        return;
    }

    const filtered = unassignedList.filter(seat => {
        if (!searchVal) return true;
        const name = getStudentNameOnly(currentClass, seat) || '';
        return String(seat).includes(searchVal) || name.toLowerCase().includes(searchVal);
    });

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="col-span-full py-6 text-center text-xs text-stone-400 font-bold">查無相符的待安排學生</div>`;
        return;
    }

    filtered.forEach(seat => {
        const name = getStudentNameOnly(currentClass, seat) || '';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `p-2.5 rounded-2xl border border-stone-200 hover:border-emerald-500 hover:bg-emerald-50/70 hover:shadow-xs text-left transition-all cursor-pointer flex items-center gap-2.5 group active:scale-95 bg-white select-none`;
        btn.innerHTML = `
            <span class="w-8 h-8 rounded-xl bg-stone-100 group-hover:bg-emerald-100 text-stone-800 group-hover:text-emerald-800 font-mono font-black text-sm flex items-center justify-center shrink-0">
                ${seat}
            </span>
            <div class="min-w-0 flex-1">
                <span class="block text-xs font-black text-stone-800 group-hover:text-emerald-950 truncate">${escapeHtml(name || seat + '號')}</span>
                <span class="text-[10px] text-stone-400 group-hover:text-emerald-600 font-bold">點擊安排</span>
            </div>
        `;
        btn.addEventListener('click', () => {
            const target = activePickerTarget;
            closeModal(document.getElementById('studio-seat-picker-modal'));
            if (target) {
                placeStudentAtCell(seat, target.r, target.c);
            }
            activePickerTarget = null;
        });
        grid.appendChild(btn);
    });
}

/**
 * 匯出座位表為高解析度 PNG 圖檔 (Retina 2x)
 */
export function exportSeatingChartToPNG() {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassStudioData(currentClass);

    showToast('正在產生高畫質座位表圖檔...', 'info');

    const cfg = currentClass.seatingConfig;
    const lockedSet = new Set(cfg.lockedSeats || []);
    const disabledSet = new Set(cfg.disabledSeats || []);

    const cols = cfg.cols;
    const rows = cfg.rows;

    const cellWidth = 130;
    const cellHeight = 85;
    const cellGap = 12;
    const padding = 36;
    const headerHeight = 90;
    const podiumHeight = 44;
    const podiumMargin = 16;
    const footerHeight = 40;

    const gridWidth = cols * cellWidth + (cols - 1) * cellGap;
    const totalWidth = Math.max(680, gridWidth + padding * 2);
    const gridOffsetX = padding + (totalWidth - padding * 2 - gridWidth) / 2;

    const totalHeight = padding * 2 + headerHeight + podiumHeight + podiumMargin * 2 + rows * cellHeight + (rows - 1) * cellGap + footerHeight;

    const scale = 2; // Retina 2x for sharp print quality
    const canvas = document.createElement('canvas');
    canvas.width = totalWidth * scale;
    canvas.height = totalHeight * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    // 1. 背景底色
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, totalWidth, totalHeight);

    // 2. 頁首 (Header)
    ctx.fillStyle = '#1c1917';
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`【${currentClass.name}】課堂座位表`, padding, padding);

    ctx.fillStyle = '#78716c';
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    const todayStr = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
    ctx.fillText(`規格：${rows} 排 × ${cols} 列 · 講台方向：${podiumPosition === 'top' ? '講台在上方' : '講台在下方'} · 匯出時間：${todayStr}`, padding, padding + 32);

    ctx.strokeStyle = '#e7e5e4';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding + 60);
    ctx.lineTo(totalWidth - padding, padding + 60);
    ctx.stroke();

    let curY = padding + headerHeight;

    function drawBox(x, y, w, h, r, fillColor, strokeColor, isDashed = false) {
        ctx.save();
        if (isDashed) ctx.setLineDash([4, 4]);
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(x, y, w, h, r);
        } else {
            ctx.rect(x, y, w, h);
        }
        if (fillColor) {
            ctx.fillStyle = fillColor;
            ctx.fill();
        }
        if (strokeColor) {
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawPodium(y) {
        const pWidth = 180;
        const pHeight = 36;
        const pX = (totalWidth - pWidth) / 2;
        drawBox(pX, y, pWidth, pHeight, 10, '#24483B', '#163026');
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 15px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('講  台', totalWidth / 2, y + pHeight / 2);
    }

    if (podiumPosition === 'top') {
        drawPodium(curY);
        curY += podiumHeight + podiumMargin;
    }

    const rowIndices = [];
    const colIndices = [];
    if (podiumPosition === 'top') {
        for (let r = 0; r < rows; r++) rowIndices.push(r);
        for (let c = 0; c < cols; c++) colIndices.push(c);
    } else {
        for (let r = rows - 1; r >= 0; r--) rowIndices.push(r);
        for (let c = cols - 1; c >= 0; c--) colIndices.push(c);
    }

    rowIndices.forEach((r, rIdx) => {
        colIndices.forEach((c, cIdx) => {
            const cellKey = `${r}_${c}`;
            const isDisabled = disabledSet.has(cellKey);
            const studentSeat = cfg.layout[r]?.[c];
            const isLocked = studentSeat && lockedSet.has(studentSeat);

            const x = gridOffsetX + cIdx * (cellWidth + cellGap);
            const y = curY + rIdx * (cellHeight + cellGap);

            if (isDisabled) {
                drawBox(x, y, cellWidth, cellHeight, 12, '#f5f5f4', '#d6d3d1', true);
                ctx.fillStyle = '#a8a29e';
                ctx.font = '10px system-ui, -apple-system, sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(`${r + 1}排 ${c + 1}列`, x + 8, y + 8);

                ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('走 道', x + cellWidth / 2, y + cellHeight / 2);
            } else if (studentSeat) {
                const studentName = getStudentNameOnly(currentClass, studentSeat);
                drawBox(x, y, cellWidth, cellHeight, 12, isLocked ? '#fffbeb' : '#ffffff', isLocked ? '#f59e0b' : '#cbd5e1');

                ctx.fillStyle = '#94a3b8';
                ctx.font = '10px system-ui, -apple-system, sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(`${r + 1}排 ${c + 1}列`, x + 8, y + 8);

                if (isLocked) {
                    ctx.fillStyle = '#d97706';
                    ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
                    ctx.textAlign = 'right';
                    ctx.fillText('固定', x + cellWidth - 8, y + 8);
                }

                ctx.fillStyle = '#0f172a';
                ctx.font = 'bold 24px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const seatY = studentName ? y + cellHeight / 2 - 8 : y + cellHeight / 2;
                ctx.fillText(String(studentSeat), x + cellWidth / 2, seatY);

                if (studentName) {
                    ctx.fillStyle = '#334155';
                    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(studentName, x + cellWidth / 2, y + cellHeight / 2 + 15);
                }
            } else {
                drawBox(x, y, cellWidth, cellHeight, 12, '#fafaf9', '#e2e8f0', true);
                ctx.fillStyle = '#cbd5e1';
                ctx.font = '10px system-ui, -apple-system, sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(`${r + 1}排 ${c + 1}列`, x + 8, y + 8);

                ctx.fillStyle = '#94a3b8';
                ctx.font = '13px system-ui, -apple-system, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('+ 空位', x + cellWidth / 2, y + cellHeight / 2);
            }
        });
    });

    curY += rows * cellHeight + (rows - 1) * cellGap;

    if (podiumPosition === 'bottom') {
        curY += podiumMargin;
        drawPodium(curY);
        curY += podiumHeight;
    }

    ctx.strokeStyle = '#e7e5e4';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, totalHeight - footerHeight);
    ctx.lineTo(totalWidth - padding, totalHeight - footerHeight);
    ctx.stroke();

    ctx.fillStyle = '#a8a29e';
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PalClass 班級經營系統 · 全方位智慧班級管理工作台', totalWidth / 2, totalHeight - footerHeight / 2);

    const dateFileStr = new Date().toISOString().slice(0, 10);
    const fileName = `${currentClass.name}_課堂座位表_${dateFileStr}.png`;
    const dataUrl = canvas.toDataURL('image/png');
    const downloadLink = document.createElement('a');
    downloadLink.href = dataUrl;
    downloadLink.download = fileName;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    showToast(`已成功匯出高畫質圖檔【${fileName}】！`, 'success');
}

let currentEditingGroupId = null;

export function removeStudentFromGroup(gid, seat) {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass || !currentClass.groupsConfig) return;
    const g = (currentClass.groupsConfig.groups || []).find(grp => grp.id === gid);
    if (!g || !Array.isArray(g.seats)) return;
    g.seats = g.seats.filter(s => s !== seat);
    saveData();
    renderClassroomStudio();
    showToast(`已將 ${seat} 號自【${g.name}】移出`, 'info');
}

export function openManualGroupModal(targetGid = null) {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassStudioData(currentClass);

    let groups = currentClass.groupsConfig.groups;
    if (!Array.isArray(groups) || groups.length === 0) {
        groups = [];
        for (let i = 1; i <= 6; i++) {
            groups.push({ id: `group_${i}`, name: `第 ${i} 組`, seats: [] });
        }
        currentClass.groupsConfig.groups = groups;
        currentClass.groupsConfig.groupCount = 6;
    }

    currentEditingGroupId = targetGid || groups[0].id;
    const modal = document.getElementById('studio-manual-group-modal');
    if (!modal) return;
    openModal(modal);

    renderManualGroupModalContent();
}

/**
 * 依目標組數調整小組配置（支援 2 ~ 16 組）
 */
export function setManualGroupCount(targetCount) {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassStudioData(currentClass);

    let groups = currentClass.groupsConfig.groups;
    if (!Array.isArray(groups)) groups = [];
    const count = Math.max(2, Math.min(16, parseInt(targetCount, 10) || 6));

    if (count === groups.length) return;

    if (count > groups.length) {
        const diff = count - groups.length;
        for (let i = 0; i < diff; i++) {
            const nextIdx = groups.length + 1;
            const newGid = `group_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            groups.push({
                id: newGid,
                name: `第 ${nextIdx} 組`,
                seats: []
            });
        }
        currentClass.groupsConfig.groups = groups;
        currentClass.groupsConfig.groupCount = groups.length;
        renderManualGroupModalContent();
        showToast(`已將小組組數調整為 ${groups.length} 組`, 'info');
    } else {
        const removingGroups = groups.slice(count);
        const totalMembers = removingGroups.reduce((acc, g) => acc + (g.seats ? g.seats.length : 0), 0);
        if (totalMembers > 0) {
            const confirmed = confirm(`縮減為 ${count} 組將會移除後續 ${groups.length - count} 個小組，組內共 ${totalMembers} 名成員將移回「未分組」，是否確定？`);
            if (!confirmed) {
                renderManualGroupModalContent();
                return;
            }
        }
        groups = groups.slice(0, count);
        currentClass.groupsConfig.groups = groups;
        currentClass.groupsConfig.groupCount = groups.length;

        if (!groups.some(g => g.id === currentEditingGroupId)) {
            currentEditingGroupId = groups[0] ? groups[0].id : null;
        }

        renderManualGroupModalContent();
        showToast(`已將小組組數縮減為 ${groups.length} 組`, 'info');
    }
}

/**
 * 快速新增一個小組
 */
export function addOneManualGroup() {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassStudioData(currentClass);

    let groups = currentClass.groupsConfig.groups;
    if (!Array.isArray(groups)) groups = [];

    if (groups.length >= 16) {
        showToast('小組組數已達上限（最多 16 組）', 'warning');
        return;
    }

    const nextIdx = groups.length + 1;
    const newGid = `group_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newGroup = {
        id: newGid,
        name: `第 ${nextIdx} 組`,
        seats: []
    };
    groups.push(newGroup);
    currentClass.groupsConfig.groups = groups;
    currentClass.groupsConfig.groupCount = groups.length;
    currentEditingGroupId = newGroup.id;

    renderManualGroupModalContent();
    showToast(`已成功新增【${newGroup.name}】`, 'success');
}

/**
 * 刪除目前正在編輯的小組
 */
export function deleteCurrentManualGroup() {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassStudioData(currentClass);

    let groups = currentClass.groupsConfig.groups;
    if (!Array.isArray(groups) || groups.length <= 2) {
        showToast('至少需保留 2 個小組，無法再刪除', 'warning');
        return;
    }

    const curIdx = groups.findIndex(g => g.id === currentEditingGroupId);
    if (curIdx === -1) return;
    const curGroup = groups[curIdx];

    if (curGroup.seats && curGroup.seats.length > 0) {
        const confirmed = confirm(`確定要刪除【${curGroup.name}】嗎？組內 ${curGroup.seats.length} 名成員將移回「未分組」。`);
        if (!confirmed) return;
    }

    groups.splice(curIdx, 1);
    currentClass.groupsConfig.groups = groups;
    currentClass.groupsConfig.groupCount = groups.length;

    const nextGroup = groups[Math.min(curIdx, groups.length - 1)];
    currentEditingGroupId = nextGroup ? nextGroup.id : null;

    renderManualGroupModalContent();
    showToast(`已刪除【${curGroup.name}】`, 'info');
}

/**
 * 自訂當前小組名稱
 */
export function renameCurrentManualGroup() {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;

    const groups = currentClass.groupsConfig?.groups || [];
    const curGroup = groups.find(g => g.id === currentEditingGroupId);
    if (!curGroup) return;

    const newName = prompt('請輸入小組新名稱：', curGroup.name);
    if (newName && newName.trim() && newName.trim() !== curGroup.name) {
        curGroup.name = newName.trim();
        renderManualGroupModalContent();
        showToast(`已將小組名稱更名為【${curGroup.name}】`, 'success');
    }
}

function renderManualGroupModalContent() {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass || !currentClass.groupsConfig) return;

    const groups = currentClass.groupsConfig.groups || [];
    const curGroup = groups.find(g => g.id === currentEditingGroupId) || groups[0];
    if (!curGroup) return;
    currentEditingGroupId = curGroup.id;

    // 0. 同步組數選擇器與狀態
    const groupCountSelect = document.getElementById('studio-group-count-select');
    if (groupCountSelect) {
        const exists = Array.from(groupCountSelect.options).some(opt => opt.value === String(groups.length));
        if (!exists && groups.length >= 2 && groups.length <= 16) {
            const opt = document.createElement('option');
            opt.value = String(groups.length);
            opt.textContent = `${groups.length} 組`;
            groupCountSelect.appendChild(opt);
        }
        groupCountSelect.value = String(groups.length);
    }

    const totalLabel = document.getElementById('studio-manual-group-total-label');
    if (totalLabel) {
        totalLabel.textContent = `共 ${groups.length} 組`;
    }

    const decBtn = document.getElementById('studio-group-count-dec-btn');
    if (decBtn) {
        const isMin = groups.length <= 2;
        decBtn.disabled = isMin;
        decBtn.classList.toggle('opacity-40', isMin);
        decBtn.classList.toggle('cursor-not-allowed', isMin);
    }

    const incBtn = document.getElementById('studio-group-count-inc-btn');
    if (incBtn) {
        const isMax = groups.length >= 16;
        incBtn.disabled = isMax;
        incBtn.classList.toggle('opacity-40', isMax);
        incBtn.classList.toggle('cursor-not-allowed', isMax);
    }

    const addOneBtn = document.getElementById('studio-add-one-group-btn');
    if (addOneBtn) {
        const isMax = groups.length >= 16;
        addOneBtn.disabled = isMax;
        addOneBtn.classList.toggle('opacity-40', isMax);
        addOneBtn.classList.toggle('cursor-not-allowed', isMax);
    }

    const delCurrentBtn = document.getElementById('studio-manual-group-delete-current-btn');
    if (delCurrentBtn) {
        const isMin = groups.length <= 2;
        delCurrentBtn.disabled = isMin;
        delCurrentBtn.classList.toggle('opacity-40', isMin);
        delCurrentBtn.classList.toggle('cursor-not-allowed', isMin);
    }

    // 1. 渲染小組切換 Tabs
    const tabsContainer = document.getElementById('studio-manual-group-tabs');
    if (tabsContainer) {
        tabsContainer.innerHTML = '';
        groups.forEach(g => {
            const isCur = g.id === currentEditingGroupId;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer select-none ${
                isCur 
                    ? 'bg-amber-600 text-white shadow-xs' 
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
            }`;
            btn.textContent = `${g.name} (${g.seats ? g.seats.length : 0}人)`;
            btn.addEventListener('click', () => {
                currentEditingGroupId = g.id;
                renderManualGroupModalContent();
            });
            tabsContainer.appendChild(btn);
        });
    }

    // 2. 標題與統計
    const labelEl = document.getElementById('studio-manual-group-current-label');
    if (labelEl) labelEl.textContent = `當前正在編輯：${curGroup.name}`;

    const activeSeats = getActiveSeatsForClass(currentClass);
    const seatToGroupMap = new Map();
    groups.forEach(g => {
        (g.seats || []).forEach(s => seatToGroupMap.set(s, g));
    });

    const unassignedCount = activeSeats.filter(s => !seatToGroupMap.has(s)).length;
    const statsEl = document.getElementById('studio-manual-group-stats');
    if (statsEl) {
        statsEl.textContent = `本組共 ${curGroup.seats ? curGroup.seats.length : 0} 人 · 全班未分組 ${unassignedCount} 人`;
    }

    // 3. 學生網格
    const searchVal = (document.getElementById('studio-manual-group-search')?.value || '').trim().toLowerCase();
    const grid = document.getElementById('studio-manual-group-students-grid');
    if (grid) {
        grid.innerHTML = '';
        const filteredSeats = activeSeats.filter(seat => {
            if (!searchVal) return true;
            const name = getStudentNameOnly(currentClass, seat) || '';
            return String(seat).includes(searchVal) || name.toLowerCase().includes(searchVal);
        });

        if (filteredSeats.length === 0) {
            grid.innerHTML = `<div class="col-span-full py-6 text-center text-xs text-stone-400 font-bold">查無相符學生</div>`;
        } else {
            filteredSeats.forEach(seat => {
                const name = getStudentNameOnly(currentClass, seat) || '';
                const assignedGroup = seatToGroupMap.get(seat);
                const isInCurrent = curGroup.seats && curGroup.seats.includes(seat);

                const card = document.createElement('button');
                card.type = 'button';
                card.className = `p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between select-none ${
                    isInCurrent
                        ? 'bg-emerald-50 border-emerald-500 shadow-2xs ring-2 ring-emerald-400/40'
                        : assignedGroup
                            ? 'bg-amber-50/50 border-amber-200 text-stone-700 hover:border-amber-400'
                            : 'bg-white border-stone-200 text-stone-800 hover:border-stone-400'
                }`;

                card.innerHTML = `
                    <div class="flex items-center justify-between w-full">
                        <strong class="font-mono text-sm ${isInCurrent ? 'text-emerald-900' : 'text-stone-900'}">${seat} 號</strong>
                        <span class="text-[10px] font-black px-1.5 py-0.5 rounded ${
                            isInCurrent 
                                ? 'bg-emerald-200 text-emerald-900' 
                                : assignedGroup 
                                    ? 'bg-amber-100 text-amber-800' 
                                    : 'bg-stone-100 text-stone-500'
                        }">
                            ${isInCurrent ? '本組' : assignedGroup ? assignedGroup.name : '未分組'}
                        </span>
                    </div>
                    <span class="text-xs font-bold text-stone-600 truncate max-w-full block mt-1">${escapeHtml(name)}</span>
                `;

                card.addEventListener('click', () => {
                    if (isInCurrent) {
                        curGroup.seats = curGroup.seats.filter(s => s !== seat);
                    } else {
                        if (assignedGroup && Array.isArray(assignedGroup.seats)) {
                            assignedGroup.seats = assignedGroup.seats.filter(s => s !== seat);
                        }
                        if (!Array.isArray(curGroup.seats)) curGroup.seats = [];
                        curGroup.seats.push(seat);
                        curGroup.seats.sort((a, b) => a - b);
                    }
                    renderManualGroupModalContent();
                });

                grid.appendChild(card);
            });
        }
    }
}

/**
 * 自動劃分小組
 */
export function autoGenerateGroups(groupCount = 6, method = 'random') {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassStudioData(currentClass);

    const activeSeats = getActiveSeatsForClass(currentClass);
    const shuffled = [...activeSeats];
    if (method === 'random') {
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
    }

    const groups = [];
    for (let i = 1; i <= groupCount; i++) {
        groups.push({ id: `group_${i}`, name: `第 ${i} 組`, seats: [] });
    }

    shuffled.forEach((seat, idx) => {
        groups[idx % groupCount].seats.push(seat);
    });

    currentClass.groupsConfig.groupCount = groupCount;
    currentClass.groupsConfig.groups = groups;
    if (!currentClass.groupsConfig.groupScores) currentClass.groupsConfig.groupScores = {};

    saveData();
    renderClassroomStudio();
    showToast(`已成功平均劃分為 ${groupCount} 個競賽小組！`, 'success');
}

/**
 * 重置所有小組競賽積分為 0
 */
export function resetAllGroupScores() {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    if (!confirm('確定要將所有小組的競賽積分歸零重置嗎？')) return;

    if (!currentClass.groupsConfig) currentClass.groupsConfig = {};
    currentClass.groupsConfig.groupScores = {};
    saveData();
    renderClassroomStudio();
    showToast('已成功重置所有小組競賽積分為 0', 'success');
}

export function openClassroomStudioModal(tab = 'seating') {
    currentStudioTab = tab;
    if (window.showClassroomStudioPage) {
        window.showClassroomStudioPage(false, tab);
    } else {
        renderClassroomStudio();
    }
}

/**
 * 初始化座位安排模組與事件綁定
 */
export function initClassroomStudio() {
    // 依座號安排
    document.getElementById('studio-auto-assign-btn')?.addEventListener('click', autoAssignBySeatNumber);

    // 隨機安排
    document.getElementById('studio-random-assign-btn')?.addEventListener('click', randomAssignSeats);

    // 重排全部 (所有人座號全數移至待安排區塊)
    document.getElementById('studio-clear-all-btn')?.addEventListener('click', () => {
        if (confirm('確定要將全班座號全數清空，移回待安排區塊重新編排嗎？')) {
            clearAllSeatsToUnassigned();
        }
    });

    // 講台位置切換 (講台在上方 ⇄ 講台在下方)
    document.getElementById('studio-podium-toggle-btn')?.addEventListener('click', togglePodiumPosition);

    // 停用座位模式
    document.getElementById('studio-disable-seat-mode-checkbox')?.addEventListener('change', (e) => {
        disableSeatMode = e.target.checked;
        if (disableSeatMode) {
            showToast('已開啟停用座位模式：點選座位可設為走道空缺或恢復使用', 'info');
        }
    });

    // 復原 / 重做
    document.getElementById('studio-undo-btn')?.addEventListener('click', undoSeating);
    document.getElementById('studio-redo-btn')?.addEventListener('click', redoSeating);

    // 儲存配置
    document.getElementById('studio-save-config-btn')?.addEventListener('click', () => {
        saveData();
        showToast('座位配置已成功儲存至本機與雲端！', 'success');
    });

    // 載入已存配置
    document.getElementById('studio-load-config-btn')?.addEventListener('click', () => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (currentClass) {
            renderClassroomStudio();
            showToast('已重新載入最新儲存之座位配置', 'info');
        }
    });

    // 搜尋待安排學生
    document.getElementById('studio-unassigned-search')?.addEventListener('input', () => {
        renderClassroomStudio();
    });

    // 排數與列數調整
    const updateGridSize = () => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (!currentClass) return;
        ensureClassStudioData(currentClass);

        const rows = parseInt(document.getElementById('studio-rows-input')?.value, 10) || 5;
        const cols = parseInt(document.getElementById('studio-cols-input')?.value, 10) || 6;
        currentClass.seatingConfig.rows = Math.max(1, Math.min(15, rows));
        currentClass.seatingConfig.cols = Math.max(1, Math.min(12, cols));

        // 調整 layout 矩陣維度
        while (currentClass.seatingConfig.layout.length < currentClass.seatingConfig.rows) {
            currentClass.seatingConfig.layout.push([]);
        }
        currentClass.seatingConfig.layout.forEach(row => {
            while (row.length < currentClass.seatingConfig.cols) {
                row.push(null);
            }
        });

        pushHistory(currentClass);
        saveData();
        renderClassroomStudio();
    };

    document.getElementById('studio-rows-input')?.addEventListener('change', updateGridSize);
    document.getElementById('studio-cols-input')?.addEventListener('change', updateGridSize);

    // 排列選單 (個人網格 / 雙人併桌)
    document.getElementById('studio-layout-type-select')?.addEventListener('change', (e) => {
        layoutType = e.target.value;
        renderClassroomStudio();
    });

    // 標籤頁切換 (座位安排 / 分組競賽)
    document.getElementById('studio-tab-btn-seating')?.addEventListener('click', () => {
        currentStudioTab = 'seating';
        renderClassroomStudio();
    });
    document.getElementById('studio-tab-btn-groups')?.addEventListener('click', () => {
        currentStudioTab = 'groups';
        renderClassroomStudio();
    });

    // 隨機分組觸發按鈕（依當前組數直接隨機劃分）
    document.getElementById('studio-random-group-btn')?.addEventListener('click', () => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        const curCount = currentClass?.groupsConfig?.groups?.length || 6;
        autoGenerateGroups(curCount, 'random');
    });

    // 分組競賽工具列組數 Stepper [-] / [+]
    document.getElementById('studio-toolbar-group-dec-btn')?.addEventListener('click', () => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        const curCount = currentClass?.groupsConfig?.groups?.length || 6;
        if (curCount > 2) {
            setManualGroupCount(curCount - 1);
        }
    });
    document.getElementById('studio-toolbar-group-inc-btn')?.addEventListener('click', () => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        const curCount = currentClass?.groupsConfig?.groups?.length || 6;
        if (curCount < 16) {
            setManualGroupCount(curCount + 1);
        }
    });

    // 重置小組積分
    document.getElementById('studio-reset-group-scores-btn')?.addEventListener('click', resetAllGroupScores);

    // 匯出高畫質座位表 PNG
    document.getElementById('studio-export-png-btn')?.addEventListener('click', () => {
        exportSeatingChartToPNG();
    });

    // 列印座位表
    document.getElementById('studio-print-seats-btn')?.addEventListener('click', () => {
        window.print();
    });

    // 空位指派彈窗事件綁定
    document.getElementById('close-studio-seat-picker-modal-btn')?.addEventListener('click', () => {
        closeModal(document.getElementById('studio-seat-picker-modal'));
    });
    document.getElementById('studio-seat-picker-cancel-btn')?.addEventListener('click', () => {
        closeModal(document.getElementById('studio-seat-picker-modal'));
    });
    document.getElementById('studio-seat-picker-search')?.addEventListener('input', () => {
        renderSeatPickerModalContent();
    });

    // 手動分組名單彈窗設定
    document.getElementById('studio-manual-group-btn')?.addEventListener('click', () => {
        openManualGroupModal();
    });
    document.getElementById('close-studio-manual-group-modal-btn')?.addEventListener('click', () => {
        closeModal(document.getElementById('studio-manual-group-modal'));
    });
    document.getElementById('studio-manual-group-cancel-btn')?.addEventListener('click', () => {
        closeModal(document.getElementById('studio-manual-group-modal'));
    });
    document.getElementById('studio-manual-group-save-btn')?.addEventListener('click', () => {
        saveData();
        closeModal(document.getElementById('studio-manual-group-modal'));
        renderClassroomStudio();
        showToast('小組成員設定已成功儲存！', 'success');
    });
    document.getElementById('studio-manual-group-clear-current-btn')?.addEventListener('click', () => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (currentClass && currentClass.groupsConfig && currentClass.groupsConfig.groups) {
            const curG = currentClass.groupsConfig.groups.find(g => g.id === currentEditingGroupId);
            if (curG) {
                curG.seats = [];
                renderManualGroupModalContent();
                showToast(`已清空【${curG.name}】成員名單`, 'info');
            }
        }
    });
    document.getElementById('studio-manual-group-delete-current-btn')?.addEventListener('click', () => {
        deleteCurrentManualGroup();
    });
    document.getElementById('studio-manual-group-rename-btn')?.addEventListener('click', () => {
        renameCurrentManualGroup();
    });
    document.getElementById('studio-group-count-select')?.addEventListener('change', (e) => {
        setManualGroupCount(parseInt(e.target.value, 10));
    });
    document.getElementById('studio-group-count-dec-btn')?.addEventListener('click', () => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        const curCount = currentClass?.groupsConfig?.groups?.length || 6;
        if (curCount > 2) {
            setManualGroupCount(curCount - 1);
        }
    });
    document.getElementById('studio-group-count-inc-btn')?.addEventListener('click', () => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        const curCount = currentClass?.groupsConfig?.groups?.length || 6;
        if (curCount < 16) {
            setManualGroupCount(curCount + 1);
        }
    });
    document.getElementById('studio-add-one-group-btn')?.addEventListener('click', () => {
        addOneManualGroup();
    });
    document.getElementById('studio-manual-group-search')?.addEventListener('input', () => {
        renderManualGroupModalContent();
    });

    // 點擊空白處取消選取
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#studio-seats-grid') && 
            !e.target.closest('#studio-unassigned-list') &&
            !e.target.closest('#studio-seat-picker-modal')) {
            if (selectedSource) {
                selectedSource = null;
                renderClassroomStudio();
            }
        }
    });
}

window.renderClassroomStudio = renderClassroomStudio;
window.resetAllGroupScores = resetAllGroupScores;
window.openManualGroupModal = openManualGroupModal;
window.setManualGroupCount = setManualGroupCount;
window.addOneManualGroup = addOneManualGroup;
window.deleteCurrentManualGroup = deleteCurrentManualGroup;
window.renameCurrentManualGroup = renameCurrentManualGroup;
window.openSeatPickerModal = openSeatPickerModal;
window.exportSeatingChartToPNG = exportSeatingChartToPNG;
