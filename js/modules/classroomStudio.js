/**
 * 班級經營系統 - 模組 5：座位與分組編排 (classroomStudio.js)
 * 支援：
 * 1. 視覺化座位表，支援 180° 視角翻轉（【講台在上方・教師視角】⇄【講台在下方・學生視角】）
 * 2. 智慧排座：點選交換座位、鎖定指定座位 (不參與隨機洗牌)、一鍵隨機洗牌、座號依序排列、S型蛇行排列
 * 3. 智慧分組系統 (支援 2~8 組，自動均勻分組或隨機分組) + 小組積分看板與頒獎台
 * 4. 座位表純淨列印與匯出功能
 */

import { state } from '../state.js';
import { showToast, openModal, closeModal, escapeHtml } from '../utils.js';
import { saveData } from '../storage.js';
import { getActiveSeatsForClass, getStudentDisplayName, getStudentNameOnly, spawnScorePop } from './classWizard.js';
import { getStudentPoints } from './arenaDrawAndPoints.js';

let selectedFirstSeatForSwap = null;
let currentStudioTab = 'seating'; // 'seating' | 'groups'
let podiumPerspective = 'podium-top'; // 'podium-top' (教師看下去) | 'podium-bottom' (學生看上講台)

function ensureClassStudioData(classObj) {
    if (!classObj) return null;
    const activeSeats = getActiveSeatsForClass(classObj);

    if (!classObj.seatingConfig || typeof classObj.seatingConfig !== 'object') {
        const rows = Math.ceil(activeSeats.length / 6) || 5;
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
            lockedSeats: []
        };
    }

    if (!Array.isArray(classObj.seatingConfig.lockedSeats)) {
        classObj.seatingConfig.lockedSeats = [];
    }

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
 * 隨機洗牌（嚴格保留已鎖定座位的固定位置）
 */
export function shuffleSeatingArrangement() {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassStudioData(currentClass);

    const cfg = currentClass.seatingConfig;
    const lockedSet = new Set(cfg.lockedSeats || []);
    const movableSeats = [];

    cfg.layout.forEach(row => {
        row.forEach(seat => {
            if (seat && !lockedSet.has(seat)) {
                movableSeats.push(seat);
            }
        });
    });

    // Fisher-Yates 洗牌
    for (let i = movableSeats.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [movableSeats[i], movableSeats[j]] = [movableSeats[j], movableSeats[i]];
    }

    let mIdx = 0;
    cfg.layout.forEach(row => {
        for (let c = 0; c < row.length; c++) {
            const seat = row[c];
            if (seat && !lockedSet.has(seat)) {
                row[c] = movableSeats[mIdx++];
            }
        }
    });

    saveData();
    renderClassroomStudio();
    showToast(`座位已隨機洗牌完成（已保留 ${lockedSet.size} 個鎖定座位不變動）`, 'success');
}

/**
 * 依座號 S 型蛇行排列
 */
export function arrangeSeatsSnakeOrder() {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassStudioData(currentClass);

    const activeSeats = getActiveSeatsForClass(currentClass);
    const cfg = currentClass.seatingConfig;
    let sIdx = 0;

    for (let r = 0; r < cfg.rows; r++) {
        const isReverse = r % 2 === 1;
        if (!isReverse) {
            for (let c = 0; c < cfg.cols; c++) {
                cfg.layout[r][c] = sIdx < activeSeats.length ? activeSeats[sIdx++] : null;
            }
        } else {
            for (let c = cfg.cols - 1; c >= 0; c--) {
                cfg.layout[r][c] = sIdx < activeSeats.length ? activeSeats[sIdx++] : null;
            }
        }
    }

    saveData();
    renderClassroomStudio();
    showToast('已重設為「S型蛇行座號編排」', 'success');
}

/**
 * 自動分組 (均勻或隨機分配)
 */
export function autoGenerateGroups(groupCount = 6, method = 'random') {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassStudioData(currentClass);

    const activeSeats = getActiveSeatsForClass(currentClass);
    const pool = [...activeSeats];

    if (method === 'random') {
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
    }

    const groups = Array.from({ length: groupCount }, (_, i) => ({
        id: `g${i + 1}`,
        name: `第 ${i + 1} 組`,
        seats: []
    }));

    pool.forEach((seat, idx) => {
        const gIdx = idx % groupCount;
        groups[gIdx].seats.push(seat);
    });

    currentClass.groupsConfig.groupCount = groupCount;
    currentClass.groupsConfig.groups = groups;

    saveData();
    renderClassroomStudio();
    showToast(`已成功將全班 ${activeSeats.length} 人編排為 ${groupCount} 個學習小組！`, 'success');
}

/**
 * 調整小組積分
 */
export function adjustGroupScore(groupId, delta, clientEvent = null) {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassStudioData(currentClass);

    if (!currentClass.groupsConfig.groupScores) currentClass.groupsConfig.groupScores = {};
    const cur = currentClass.groupsConfig.groupScores[groupId] || 0;
    const nextVal = Math.max(0, cur + delta);
    currentClass.groupsConfig.groupScores[groupId] = nextVal;

    saveData();
    renderClassroomStudio();

    if (clientEvent) {
        spawnScorePop(clientEvent.clientX, clientEvent.clientY, delta > 0 ? `+${delta}` : `${delta}`, delta > 0);
    }
}

/**
 * 渲染 Studio 主體
 */
export function renderClassroomStudio() {
    const page = document.getElementById('classroom-studio-page') || document.getElementById('classroom-studio-modal');
    if (!page) return;

    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassStudioData(currentClass);

    const classBadge = document.getElementById('studio-class-badge');
    if (classBadge) classBadge.textContent = currentClass.name;

    // 分頁切換
    ['seating', 'groups'].forEach(tab => {
        const btn = document.getElementById(`studio-tab-btn-${tab}`);
        const view = document.getElementById(`studio-view-${tab}`);
        if (btn) {
            btn.className = `py-2 px-5 rounded-xl font-black text-xs sm:text-sm cursor-pointer transition-all ${
                tab === currentStudioTab
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`;
        }
        if (view) {
            view.classList.toggle('hidden', tab !== currentStudioTab);
        }
    });

    if (currentStudioTab === 'seating') {
        renderSeatingSection(currentClass);
    } else {
        renderGroupsSection(currentClass);
    }
}

function renderSeatingSection(currentClass) {
    const cfg = currentClass.seatingConfig;
    const grid = document.getElementById('studio-seating-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const isPodiumTop = podiumPerspective === 'podium-top';
    const podiumEl = document.getElementById('studio-podium-bar');
    if (podiumEl) {
        podiumEl.innerHTML = `
            <div class="inline-flex items-center gap-2 px-6 py-2 rounded-2xl bg-amber-100 border border-amber-300 text-amber-900 font-black text-sm shadow-sm select-none">
                <i class="fa-solid fa-chalkboard text-amber-700"></i>
                <span>講台 / 電子黑板（${isPodiumTop ? '教師視角・由上往下看' : '學生視角・由下往上看'}）</span>
            </div>
        `;
    }

    const rowsToRender = isPodiumTop ? cfg.layout : [...cfg.layout].reverse();
    const lockedSet = new Set(cfg.lockedSeats || []);

    rowsToRender.forEach((row, rIdx) => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'flex justify-center gap-2.5 sm:gap-3.5 my-2';

        const colsToRender = isPodiumTop ? row : [...row].reverse();
        colsToRender.forEach(seat => {
            const cell = document.createElement('div');
            const isSelected = selectedFirstSeatForSwap === seat && seat !== null;
            const isLocked = seat && lockedSet.has(seat);

            if (!seat) {
                cell.className = 'w-14 sm:w-20 h-14 sm:h-20 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 flex items-center justify-center text-slate-300 text-xs font-bold';
                cell.innerHTML = '空位';
            } else {
                const sName = getStudentNameOnly(currentClass, seat);
                const sPoints = getStudentPoints(currentClass, seat);
                cell.className = `seating-desk-cell relative w-14 sm:w-20 h-14 sm:h-20 rounded-2xl border p-2 flex flex-col justify-between cursor-pointer select-none shadow-xs ${
                    isSelected
                        ? 'seating-desk-selected bg-indigo-50 border-indigo-500'
                        : isLocked
                            ? 'bg-amber-50/80 border-amber-300 text-amber-950'
                            : 'bg-white border-slate-200/90 text-slate-800 hover:border-indigo-300'
                }`;

                cell.innerHTML = `
                    <div class="flex items-center justify-between w-full">
                        <span class="font-mono font-black text-xs sm:text-sm text-indigo-700 leading-none">${seat}</span>
                        ${isLocked ? '<i class="fa-solid fa-lock text-[10px] text-amber-600" title="已鎖定此座位"></i>' : ''}
                        ${sPoints > 0 ? `<span class="text-[9px] font-mono font-black px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-600 border border-indigo-100">${sPoints}pt</span>` : ''}
                    </div>
                    <div class="truncate text-center font-bold text-xs sm:text-sm ${sName ? 'text-slate-900' : 'text-slate-400'}">
                        ${sName ? escapeHtml(sName) : `${seat}號`}
                    </div>
                `;

                // 點擊交換機制：第一次點選選中，第二次點選交換
                cell.addEventListener('click', () => {
                    if (selectedFirstSeatForSwap === null) {
                        selectedFirstSeatForSwap = seat;
                        renderClassroomStudio();
                        showToast(`已選中 ${seat} 號，請點選另一個座位進行調換`, 'info');
                    } else if (selectedFirstSeatForSwap === seat) {
                        // 再次點擊同一人：切換鎖定狀態
                        if (lockedSet.has(seat)) {
                            cfg.lockedSeats = cfg.lockedSeats.filter(s => s !== seat);
                            showToast(`已解鎖 ${seat} 號座位`, 'info');
                        } else {
                            cfg.lockedSeats.push(seat);
                            showToast(`已鎖定 ${seat} 號座位（不參與洗牌）`, 'success');
                        }
                        selectedFirstSeatForSwap = null;
                        saveData();
                        renderClassroomStudio();
                    } else {
                        // 交換兩座位
                        swapSeatsInLayout(cfg.layout, selectedFirstSeatForSwap, seat);
                        showToast(`已成功調換 ${selectedFirstSeatForSwap} 號與 ${seat} 號的座位！`, 'success');
                        selectedFirstSeatForSwap = null;
                        saveData();
                        renderClassroomStudio();
                    }
                });
            }
            rowDiv.appendChild(cell);
        });
        grid.appendChild(rowDiv);
    });
}

function swapSeatsInLayout(layout, s1, s2) {
    let p1 = null, p2 = null;
    layout.forEach((row, r) => {
        row.forEach((seat, c) => {
            if (seat === s1) p1 = { r, c };
            if (seat === s2) p2 = { r, c };
        });
    });
    if (p1 && p2) {
        layout[p1.r][p1.c] = s2;
        layout[p2.r][p2.c] = s1;
    }
}

function renderGroupsSection(currentClass) {
    const cfg = currentClass.groupsConfig;
    const container = document.getElementById('studio-groups-container');
    if (!container) return;
    container.innerHTML = '';

    const groups = cfg.groups || [];
    if (groups.length === 0) {
        container.innerHTML = `<div class="col-span-full py-12 text-center text-slate-400 text-sm font-bold"><i class="fa-solid fa-people-group text-slate-300 text-3xl mb-2 block"></i>尚未建立分組，請點擊上方「自動均勻分組」一鍵產生小組！</div>`;
        return;
    }

    // 依分數排序計算排名
    const scores = cfg.groupScores || {};
    const sortedGroups = [...groups].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
    const rankMap = new Map();
    sortedGroups.forEach((g, idx) => rankMap.set(g.id, idx + 1));

    groups.forEach(g => {
        const score = scores[g.id] || 0;
        const rank = rankMap.get(g.id) || 1;
        const isPodium = rank <= 3;
        const medalColors = ['text-amber-500', 'text-slate-400', 'text-amber-700'];

        const card = document.createElement('div');
        card.className = `p-4 sm:p-5 rounded-3xl border transition-all shadow-xs flex flex-col justify-between ${
            isPodium ? 'bg-gradient-to-br from-amber-50/80 via-white to-amber-50/40 border-amber-300' : 'bg-white border-slate-200/90'
        }`;

        const membersHtml = (g.seats || []).map(seat => `
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-bold text-slate-700">
                <strong class="font-mono text-indigo-700">${seat}號</strong>
                <span class="truncate max-w-[70px]">${escapeHtml(getStudentNameOnly(currentClass, seat) || '')}</span>
            </span>
        `).join('');

        card.innerHTML = `
            <div>
                <div class="flex items-center justify-between pb-2 border-b border-slate-100 mb-3">
                    <div class="flex items-center gap-2">
                        ${isPodium ? `<i class="fa-solid fa-trophy ${medalColors[rank - 1]} text-lg"></i>` : `<span class="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-mono font-bold text-xs">${rank}</span>`}
                        <h4 class="font-black text-slate-900 text-base">${escapeHtml(g.name)}</h4>
                    </div>
                    <div class="flex items-center gap-1">
                        <span class="font-black font-mono text-xl text-indigo-600">${score}</span>
                        <span class="text-[10px] text-slate-400 font-bold">分</span>
                    </div>
                </div>
                <div class="flex flex-wrap gap-1.5 mb-4">
                    ${membersHtml || '<span class="text-xs text-slate-400">尚無成員</span>'}
                </div>
            </div>
            <div class="pt-3 border-t border-slate-100 flex items-center justify-between gap-1">
                <span class="text-xs font-bold text-slate-400">小組計分：</span>
                <div class="flex items-center gap-1.5">
                    <button type="button" data-gid="${g.id}" data-delta="-1" class="group-score-btn px-2.5 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-black text-xs cursor-pointer">-1</button>
                    <button type="button" data-gid="${g.id}" data-delta="1" class="group-score-btn px-3 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-black text-xs cursor-pointer">+1</button>
                    <button type="button" data-gid="${g.id}" data-delta="2" class="group-score-btn px-3 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-black text-xs cursor-pointer">+2</button>
                </div>
            </div>
        `;

        card.querySelectorAll('.group-score-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const gid = btn.dataset.gid;
                const d = parseInt(btn.dataset.delta, 10);
                adjustGroupScore(gid, d, e);
            });
        });

        container.appendChild(card);
    });
}

/**
 * 重置所有小組競賽積分為 0
 */
export function resetAllGroupScores() {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    if (!confirm('確定要將所有小組的競賽積分歸零重置嗎？此動作將清空所有小組目前的得分。')) return;

    if (!currentClass.groupsConfig) currentClass.groupsConfig = {};
    currentClass.groupsConfig.groupScores = {};
    saveData();
    renderClassroomStudio();
    showToast('已成功重置所有小組競賽積分為 0', 'success');
}

export function openClassroomStudioModal(tab = 'seating') {
    if (window.showClassroomStudioPage) {
        window.showClassroomStudioPage(false, tab);
    } else {
        currentStudioTab = tab;
        renderClassroomStudio();
    }
}

export function initClassroomStudio() {
    document.getElementById('open-classroom-studio-btn')?.addEventListener('click', () => openClassroomStudioModal('seating'));
    document.getElementById('mobile-sheet-seating-btn')?.addEventListener('click', () => {
        document.getElementById('mobile-more-sheet')?.classList.add('hidden');
        openClassroomStudioModal('seating');
    });

    // 視角 180° 翻轉
    document.getElementById('studio-flip-perspective-btn')?.addEventListener('click', () => {
        podiumPerspective = podiumPerspective === 'podium-top' ? 'podium-bottom' : 'podium-top';
        renderClassroomStudio();
        showToast(`已切換為「${podiumPerspective === 'podium-top' ? '教師俯視講台視角' : '學生仰望講台視角'}」`, 'info');
    });

    // 排座動作按鈕
    document.getElementById('studio-shuffle-seats-btn')?.addEventListener('click', shuffleSeatingArrangement);
    document.getElementById('studio-snake-seats-btn')?.addEventListener('click', arrangeSeatsSnakeOrder);

    // 列印座位表
    document.getElementById('studio-print-seats-btn')?.addEventListener('click', () => {
        window.print();
    });

    // 自動分組觸發按鈕
    document.getElementById('studio-auto-group-btn')?.addEventListener('click', () => {
        const count = parseInt(prompt('請輸入預計劃分的小組組數（2 ~ 8 組）：', '6'), 10);
        if (count >= 2 && count <= 8) {
            autoGenerateGroups(count, 'random');
        } else if (!isNaN(count)) {
            showToast('組數請填寫 2 至 8 之間', 'error');
        }
    });

    // 一鍵重置小組積分
    document.getElementById('studio-reset-group-scores-btn')?.addEventListener('click', resetAllGroupScores);

    // 標籤頁切換
    ['seating', 'groups'].forEach(tab => {
        document.getElementById(`studio-tab-btn-${tab}`)?.addEventListener('click', () => {
            currentStudioTab = tab;
            renderClassroomStudio();
        });
    });
}

window.renderClassroomStudio = renderClassroomStudio;
window.resetAllGroupScores = resetAllGroupScores;

