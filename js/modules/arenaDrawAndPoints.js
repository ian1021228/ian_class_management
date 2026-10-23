/**
 * 班級經營系統 - 模組 4：課堂加扣分與抽籤系統 (arenaDrawAndPoints.js)
 * 支援：
 * 1. CLASS GOAL 全班共同集分看板與達標福利進度條
 * 2. 學生個人加扣分卡片網格 (大字積分、- 與 + 圓形微調按鈕、即時彈力動效)
 * 3. 全班 +1 (自動跳過今日請假/缺席學生)
 * 4. 密碼級公平不重複抽籤籤筒 (Fair Lottery Pool)
 * 5. 積分歷史紀錄
 */

import { state } from '../state.js';
import { showToast, openModal, closeModal, escapeHtml } from '../utils.js';
import { saveData } from '../storage.js';
import { getActiveSeatsForClass, getStudentDisplayName, getStudentNameOnly, spawnScorePop } from './classWizard.js';
import { isStudentAbsentOrLeaveToday } from './attendanceHub.js';

let isDrawing = false;
let currentDrawnSeat = null;
let currentArenaTab = 'points'; // 'points' | 'draw'

function ensureClassPointsData(classObj) {
    if (!classObj) return null;
    if (!classObj.pointsBySeat || typeof classObj.pointsBySeat !== 'object') {
        classObj.pointsBySeat = {};
    }
    if (!Array.isArray(classObj.pointsHistory)) {
        classObj.pointsHistory = [];
    }
    if (!classObj.drawPoolState || typeof classObj.drawPoolState !== 'object') {
        classObj.drawPoolState = {
            drawnSeats: [],
            round: 1
        };
    }
    if (!Array.isArray(classObj.drawPoolState.drawnSeats)) {
        classObj.drawPoolState.drawnSeats = [];
    }
    if (!classObj.classGoal || typeof classObj.classGoal !== 'object') {
        classObj.classGoal = {
            enabled: true,
            target: 1000,
            reward: '全班同樂會自由活動'
        };
    }
    return classObj;
}

/**
 * 取得學生目前積分
 */
export function getStudentPoints(classObj, seat) {
    if (!classObj || !classObj.pointsBySeat) return 0;
    return parseInt(classObj.pointsBySeat[String(seat)] || 0, 10);
}

/**
 * 調整學生積分並紀錄歷史
 */
export function adjustStudentPoints(seat, delta, reason = '課堂表現', clientEvent = null) {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassPointsData(currentClass);

    const oldPoints = getStudentPoints(currentClass, seat);
    const newPoints = Math.max(0, oldPoints + delta);
    currentClass.pointsBySeat[String(seat)] = newPoints;

    const record = {
        seat,
        name: getStudentNameOnly(currentClass, seat) || `${seat}號`,
        delta,
        reason,
        time: new Date().toLocaleTimeString('zh-TW', { hour12: false })
    };
    currentClass.pointsHistory.unshift(record);
    if (currentClass.pointsHistory.length > 150) {
        currentClass.pointsHistory.pop();
    }

    saveData();
    renderDrawAndPointsModal();

    if (clientEvent && clientEvent.clientX && clientEvent.clientY) {
        spawnScorePop(
            clientEvent.clientX,
            clientEvent.clientY,
            delta > 0 ? `+${delta}` : `${delta}`,
            delta > 0
        );
    } else {
        spawnScorePop(window.innerWidth / 2, window.innerHeight * 0.45, delta > 0 ? `+${delta}` : `${delta}`, delta > 0);
    }

    showToast(
        `${getStudentDisplayName(currentClass, seat, true)} ${delta > 0 ? `+${delta}` : delta} 分 (目前總分: ${newPoints})`,
        delta > 0 ? 'success' : 'info'
    );
}

/**
 * 全班加分（★自動略過今日登記為缺席或請假的學生！）
 */
export function awardWholeClassBonus(delta = 1, reason = '全班專注獎勵') {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassPointsData(currentClass);

    const activeSeats = getActiveSeatsForClass(currentClass);
    let awardedCount = 0;
    let skippedCount = 0;

    activeSeats.forEach(seat => {
        if (isStudentAbsentOrLeaveToday(currentClass.id, seat)) {
            skippedCount++;
            return;
        }
        const cur = getStudentPoints(currentClass, seat);
        currentClass.pointsBySeat[String(seat)] = Math.max(0, cur + delta);
        awardedCount++;
    });

    currentClass.pointsHistory.unshift({
        seat: 0,
        name: '全班獎勵',
        delta,
        reason: `${reason}（已獎勵 ${awardedCount} 人${skippedCount > 0 ? `，自動略過 ${skippedCount} 位請假/缺席` : ''}）`,
        time: new Date().toLocaleTimeString('zh-TW', { hour12: false })
    });

    saveData();
    renderDrawAndPointsModal();
    showToast(`全班獎勵發放成功！已為 ${awardedCount} 位學生各加 ${delta} 分${skippedCount > 0 ? ` (自動略過 ${skippedCount} 位請假/缺席學生)` : ''}`, 'success');
}

/**
 * 執行密碼級不重複抽籤
 */
export function executeFairDraw() {
    if (isDrawing) return;
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassPointsData(currentClass);

    const activeSeats = getActiveSeatsForClass(currentClass);
    if (activeSeats.length === 0) {
        showToast('目前班級無有效座號可抽', 'error');
        return;
    }

    const drawnSet = new Set(currentClass.drawPoolState.drawnSeats || []);
    let candidates = activeSeats.filter(s => !drawnSet.has(s));

    // 當輪已全數抽完，自動晉級下一輪重啟籤筒
    if (candidates.length === 0) {
        currentClass.drawPoolState.round = (currentClass.drawPoolState.round || 1) + 1;
        currentClass.drawPoolState.drawnSeats = [];
        candidates = [...activeSeats];
        showToast(`全班已抽完一輪！已自動開啟第 ${currentClass.drawPoolState.round} 輪籤筒`, 'info');
    }

    // 排除今日請假或缺席者（若有其他候選人可選）
    const presentCandidates = candidates.filter(s => !isStudentAbsentOrLeaveToday(currentClass.id, s));
    const finalCandidates = presentCandidates.length > 0 ? presentCandidates : candidates;

    isDrawing = true;
    const stageBox = document.getElementById('arena-stage-avatar');
    const stageNum = document.getElementById('arena-stage-seat-number');
    const stageName = document.getElementById('arena-stage-student-name');
    const stagePill = document.getElementById('arena-stage-pool-pill');
    const scoreCapsule = document.getElementById('arena-instant-score-capsule');

    if (scoreCapsule) scoreCapsule.classList.add('hidden');
    if (stageBox) stageBox.classList.add('draw-stage-rolling');

    let rollTimes = 0;
    const maxRolls = 20;
    const rollInterval = setInterval(() => {
        const randSeat = activeSeats[Math.floor(Math.random() * activeSeats.length)];
        if (stageNum) stageNum.textContent = `${randSeat} 號`;
        if (stageName) stageName.textContent = getStudentNameOnly(currentClass, randSeat) || '抽籤中...';
        rollTimes++;

        if (rollTimes >= maxRolls) {
            clearInterval(rollInterval);
            const pickedSeat = finalCandidates[Math.floor(Math.random() * finalCandidates.length)];
            currentDrawnSeat = pickedSeat;
            currentClass.drawPoolState.drawnSeats.push(pickedSeat);

            if (stageBox) stageBox.classList.remove('draw-stage-rolling');
            if (stageNum) stageNum.textContent = `${pickedSeat} 號`;
            if (stageName) stageName.textContent = getStudentDisplayName(currentClass, pickedSeat, true);
            if (stagePill) stagePill.textContent = `第 ${currentClass.drawPoolState.round || 1} 輪（剩餘 ${activeSeats.length - currentClass.drawPoolState.drawnSeats.length} 人未抽）`;

            if (scoreCapsule) {
                scoreCapsule.classList.remove('hidden');
                scoreCapsule.classList.add('flex');
            }

            saveData();
            isDrawing = false;
            renderDrawAndPointsModal();
            spawnScorePop(window.innerWidth / 2, window.innerHeight * 0.45, `選中 ${pickedSeat} 號！`, true);
        }
    }, 70);
}

/**
 * 渲染課堂加扣分與抽籤全景畫面
 */
export function renderDrawAndPointsModal() {
    const page = document.getElementById('arena-draw-points-page');
    if (!page) return;

    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassPointsData(currentClass);

    const activeSeats = getActiveSeatsForClass(currentClass);

    // 班級標籤
    const classBadge = document.getElementById('arena-class-badge');
    if (classBadge) classBadge.textContent = currentClass.name;

    // 標籤頁切換
    const pointsTabBtn = document.getElementById('arena-tab-btn-points');
    const drawTabBtn = document.getElementById('arena-tab-btn-draw');
    const pointsView = document.getElementById('arena-points-view');
    const drawView = document.getElementById('arena-draw-view');

    if (currentArenaTab === 'points') {
        pointsTabBtn?.classList.add('bg-stone-800', 'text-white');
        pointsTabBtn?.classList.remove('bg-white', 'text-stone-600');
        drawTabBtn?.classList.remove('bg-stone-800', 'text-white');
        drawTabBtn?.classList.add('bg-white', 'text-stone-600');
        pointsView?.classList.remove('hidden');
        drawView?.classList.add('hidden');
    } else {
        drawTabBtn?.classList.add('bg-stone-800', 'text-white');
        drawTabBtn?.classList.remove('bg-white', 'text-stone-600');
        pointsTabBtn?.classList.remove('bg-stone-800', 'text-white');
        pointsTabBtn?.classList.add('bg-white', 'text-stone-600');
        drawView?.classList.remove('hidden');
        pointsView?.classList.add('hidden');
    }

    // 1. CLASS GOAL 全班共同集分計算
    const goal = currentClass.classGoal || { enabled: true, target: 1000, reward: '自由活動' };
    const totalScore = activeSeats.reduce((sum, s) => sum + getStudentPoints(currentClass, s), 0);

    const totalScoreDisplay = document.getElementById('class-total-score-display');
    const totalStudentsDisplay = document.getElementById('class-total-students-count');
    const targetInput = document.getElementById('class-goal-target-input');
    const rewardInput = document.getElementById('class-goal-reward-input');
    const progressText = document.getElementById('class-goal-progress-text');
    const progressFill = document.getElementById('class-goal-progress-fill');
    const calloutText = document.getElementById('class-goal-callout-text');

    if (totalScoreDisplay) totalScoreDisplay.textContent = totalScore.toLocaleString();
    if (totalStudentsDisplay) totalStudentsDisplay.textContent = `共 ${activeSeats.length} 位學生`;
    if (targetInput && document.activeElement !== targetInput) targetInput.value = goal.target;
    if (rewardInput && document.activeElement !== rewardInput) rewardInput.value = goal.reward || '';

    const targetVal = Math.max(1, parseInt(goal.target, 10) || 1000);
    const pct = Math.min(100, Math.round((totalScore / targetVal) * 100));

    if (progressText) progressText.textContent = `${totalScore.toLocaleString()} / ${targetVal.toLocaleString()}`;
    if (progressFill) progressFill.style.width = `${pct}%`;

    if (calloutText) {
        if (totalScore >= targetVal) {
            calloutText.innerHTML = `<span class="text-emerald-700 font-black">🎉 全班已達標！解鎖福利：${escapeHtml(goal.reward || '全班慶祝')}</span>`;
        } else {
            const diff = targetVal - totalScore;
            calloutText.textContent = `再累積 ${diff.toLocaleString()} 分就達標（目前進度 ${pct}%）`;
        }
    }

    // 2. 學生加扣分卡片網格 (points-students-grid)
    const studentsGrid = document.getElementById('points-students-grid');
    if (studentsGrid) {
        studentsGrid.innerHTML = '';
        if (activeSeats.length === 0) {
            studentsGrid.innerHTML = `<div class="col-span-full py-12 text-center text-stone-400 font-bold">目前班級尚無學生名單，請先完成名單設定</div>`;
        } else {
            activeSeats.forEach(seat => {
                const name = getStudentNameOnly(currentClass, seat) || '';
                const score = getStudentPoints(currentClass, seat);
                const isAbsent = isStudentAbsentOrLeaveToday(currentClass.id, seat);

                const card = document.createElement('div');
                card.className = `rounded-2xl border bg-white p-3 sm:p-3.5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between select-none ${
                    isAbsent ? 'border-dashed border-rose-200 bg-rose-50/20' : 'border-stone-200/90'
                }`;

                card.innerHTML = `
                    <div class="flex items-center justify-between gap-1 mb-1">
                        <span class="text-xs font-black font-mono text-stone-800 truncate">${seat}號</span>
                        ${isAbsent ? `<span class="text-[10px] text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded">缺席/請假</span>` : ''}
                    </div>
                    <div class="truncate text-xs font-bold text-stone-600 mb-2">
                        ${escapeHtml(name || `${seat}號`)}
                    </div>
                    <div class="my-auto text-center py-1">
                        <strong class="font-mono text-3xl sm:text-4xl font-black text-stone-900 leading-none">${score}</strong>
                    </div>
                    <div class="flex items-center justify-center gap-2 pt-2.5 mt-2 border-t border-stone-100">
                        <button type="button" data-seat="${seat}" data-delta="-1" class="btn-adjust-point w-9 h-9 rounded-xl bg-stone-100 hover:bg-rose-100 text-stone-700 hover:text-rose-700 font-black text-base flex items-center justify-center cursor-pointer transition-all active:scale-90" title="扣 1 分">
                            -
                        </button>
                        <button type="button" data-seat="${seat}" data-delta="1" class="btn-adjust-point w-9 h-9 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-black text-base flex items-center justify-center cursor-pointer transition-all active:scale-90 shadow-2xs" title="加 1 分">
                            +
                        </button>
                    </div>
                `;

                card.querySelectorAll('.btn-adjust-point').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const s = parseInt(btn.dataset.seat, 10);
                        const d = parseInt(btn.dataset.delta, 10);
                        adjustStudentPoints(s, d, d > 0 ? '課堂表現加分' : '課堂表現扣分', e);
                    });
                });

                studentsGrid.appendChild(card);
            });
        }
    }

    // 3. 抽籤籤筒畫面渲染
    const poolState = currentClass.drawPoolState;
    const drawnSet = new Set(poolState.drawnSeats || []);
    const remainingCount = Math.max(0, activeSeats.length - drawnSet.size);

    const roundPill = document.getElementById('arena-stage-pool-pill');
    if (roundPill) {
        roundPill.textContent = `第 ${poolState.round || 1} 輪（剩餘 ${remainingCount} 人未抽）`;
    }

    const poolGrid = document.getElementById('arena-pool-chips-grid');
    if (poolGrid) {
        poolGrid.innerHTML = '';
        activeSeats.forEach(seat => {
            const hasDrawn = drawnSet.has(seat);
            const isAbsent = isStudentAbsentOrLeaveToday(currentClass.id, seat);
            const chip = document.createElement('div');
            chip.className = `p-1.5 rounded-xl text-center text-xs font-black border transition-all ${
                hasDrawn
                    ? 'bg-stone-100 text-stone-400 border-stone-200 line-through opacity-60'
                    : isAbsent
                        ? 'bg-rose-50 text-rose-500 border-rose-200'
                        : 'bg-white text-stone-800 border-stone-200 shadow-2xs'
            }`;
            chip.textContent = `${seat}號`;
            poolGrid.appendChild(chip);
        });
    }

    // 積分變動日誌
    const historyList = document.getElementById('arena-points-history-list');
    if (historyList) {
        const hist = currentClass.pointsHistory || [];
        if (hist.length === 0) {
            historyList.innerHTML = `<div class="text-xs text-stone-400 py-3 text-center">尚無加減分紀錄</div>`;
        } else {
            historyList.innerHTML = hist.slice(0, 10).map(h => `
                <div class="flex items-center justify-between p-2 rounded-lg bg-stone-50 text-[11px] font-medium border border-stone-100">
                    <div class="flex items-center gap-1.5 truncate">
                        <span class="font-bold text-stone-800">${h.seat ? `${h.seat}號` : ''} ${escapeHtml(h.name)}</span>
                        <span class="text-stone-400 truncate">(${escapeHtml(h.reason)})</span>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                        <span class="font-black font-mono ${h.delta > 0 ? 'text-emerald-600' : 'text-rose-600'}">${h.delta > 0 ? `+${h.delta}` : h.delta}</span>
                        <span class="text-[10px] text-stone-400 font-mono">${h.time}</span>
                    </div>
                </div>
            `).join('');
        }
    }
}

/**
 * 初始化課堂加扣分模組事件
 */
export function initArenaDrawAndPoints() {
    // 標籤頁切換
    document.getElementById('arena-tab-btn-points')?.addEventListener('click', () => {
        currentArenaTab = 'points';
        renderDrawAndPointsModal();
    });
    document.getElementById('arena-tab-btn-draw')?.addEventListener('click', () => {
        currentArenaTab = 'draw';
        renderDrawAndPointsModal();
    });

    // CLASS GOAL 輸入監聽
    document.getElementById('class-goal-target-input')?.addEventListener('change', (e) => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (!currentClass) return;
        ensureClassPointsData(currentClass);
        currentClass.classGoal.target = parseInt(e.target.value, 10) || 1000;
        saveData();
        renderDrawAndPointsModal();
    });

    document.getElementById('class-goal-reward-input')?.addEventListener('change', (e) => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (!currentClass) return;
        ensureClassPointsData(currentClass);
        currentClass.classGoal.reward = e.target.value.trim();
        saveData();
        renderDrawAndPointsModal();
    });

    // 全班 +1
    document.getElementById('points-whole-class-add-1-btn')?.addEventListener('click', () => {
        awardWholeClassBonus(1, '全班專注守秩序');
    });

    // 前往分組模式
    document.getElementById('points-goto-groups-btn')?.addEventListener('click', () => {
        if (window.showClassroomStudioPage) {
            window.showClassroomStudioPage(false, 'groups');
        }
    });

    // 名單設定
    document.getElementById('points-add-student-btn')?.addEventListener('click', () => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (currentClass) {
            const modal = document.getElementById('initial-max-seat-modal');
            if (modal) {
                modal.dataset.targetClassId = currentClass.id;
                openModal(modal);
            }
        }
    });

    // 詳細加分模式開關
    document.getElementById('btn-toggle-points-history')?.addEventListener('click', () => {
        const card = document.getElementById('arena-history-collapsible-card');
        if (card) {
            card.classList.toggle('hidden');
        }
    });

    // 抽籤主按鈕
    document.getElementById('arena-trigger-draw-btn')?.addEventListener('click', executeFairDraw);

    // 重設籤筒按鈕
    document.getElementById('arena-reset-pool-btn')?.addEventListener('click', () => {
        const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
        if (!currentClass) return;
        ensureClassPointsData(currentClass);
        currentClass.drawPoolState.drawnSeats = [];
        saveData();
        renderDrawAndPointsModal();
        showToast('已重設籤筒！所有學生已重新放回籤筒中', 'info');
    });

    // 抽籤即時加分膠囊按鈕
    [-1, 1, 2, 3].forEach(delta => {
        const btnId = delta > 0 ? `arena-score-add-${delta}-btn` : 'arena-score-sub-1-btn';
        document.getElementById(btnId)?.addEventListener('click', (e) => {
            if (!currentDrawnSeat) {
                showToast('請先進行抽籤選出學生', 'info');
                return;
            }
            adjustStudentPoints(currentDrawnSeat, delta, '抽籤問答表現', e);
        });
    });
}

window.renderDrawAndPointsModal = renderDrawAndPointsModal;
