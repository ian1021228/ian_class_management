/**
 * 班級經營系統 - 模組 4：抽籤問答與加分系統 (arenaDrawAndPoints.js)
 * 支援：
 * 1. 密碼級公平「不重複抽籤籤筒」 (Fair Arena Draw Pool)：記錄當輪已抽座號，全班抽滿前不重複，支援重置。
 * 2. 抽籤舞台動畫與選中學生即時加分膠囊 (+3, +2, +1, -1)
 * 3. 學生積分榜與全班加分 (全班 +1 時自動跳過今日請假/缺席學生！)
 * 4. 積分歷史日誌紀錄與榮譽頒獎台
 */

import { state } from '../state.js';
import { formatDate, showToast, openModal, closeModal, escapeHtml } from '../utils.js';
import { saveData } from '../storage.js';
import { getActiveSeatsForClass, getStudentDisplayName, getStudentNameOnly, spawnScorePop } from './classWizard.js';
import { isStudentAbsentOrLeaveToday } from './attendanceHub.js';

let isDrawing = false;
let currentDrawnSeat = null;

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
export function adjustStudentPoints(seat, delta, reason = '課堂問答', clientEvent = null) {
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

    if (clientEvent) {
        spawnScorePop(
            clientEvent.clientX,
            clientEvent.clientY,
            delta > 0 ? `+${delta}` : `${delta}`,
            delta > 0
        );
    } else {
        const stage = document.getElementById('arena-stage-avatar');
        if (stage) {
            const rect = stage.getBoundingClientRect();
            spawnScorePop(rect.left + rect.width / 2, rect.top, delta > 0 ? `+${delta}` : `${delta}`, delta > 0);
        }
    }

    showToast(
        `${getStudentDisplayName(currentClass, seat, true)} ${delta > 0 ? `+${delta}` : delta} 分 (總分: ${newPoints})`,
        delta > 0 ? 'success' : 'info'
    );
}

/**
 * 全班加分（★自動排除今日請假或缺席的學生！）
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
        reason: `${reason}（已獎勵 ${awardedCount} 人${skippedCount > 0 ? `，自動排除 ${skippedCount} 位請假/缺席` : ''}）`,
        time: new Date().toLocaleTimeString('zh-TW', { hour12: false })
    });

    saveData();
    renderDrawAndPointsModal();
    showToast(`全班獎勵發放成功！已為 ${awardedCount} 位學生各加 ${delta} 分${skippedCount > 0 ? ` (自動跳過 ${skippedCount} 位請假/缺席學生)` : ''}`, 'success');
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

    // 擬真轉盤跑馬燈音效感跳動
    let rollTimes = 0;
    const maxRolls = 22;
    const rollInterval = setInterval(() => {
        const randSeat = activeSeats[Math.floor(Math.random() * activeSeats.length)];
        if (stageNum) stageNum.textContent = `${randSeat} 號`;
        if (stageName) stageName.textContent = getStudentNameOnly(currentClass, randSeat) || '抽籤中...';
        rollTimes++;

        if (rollTimes >= maxRolls) {
            clearInterval(rollInterval);
            // 決定最終得獎者
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
 * 渲染抽籤與加分全景畫面
 */
export function renderDrawAndPointsModal() {
    const page = document.getElementById('arena-draw-points-page') || document.getElementById('arena-draw-points-modal');
    if (!page) return;

    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    ensureClassPointsData(currentClass);

    const activeSeats = getActiveSeatsForClass(currentClass);
    const poolState = currentClass.drawPoolState;
    const drawnSet = new Set(poolState.drawnSeats || []);
    const remainingCount = Math.max(0, activeSeats.length - drawnSet.size);

    const classBadge = document.getElementById('arena-class-badge');
    if (classBadge) classBadge.textContent = currentClass.name;

    const roundPill = document.getElementById('arena-stage-pool-pill');
    if (roundPill) {
        roundPill.textContent = `第 ${poolState.round || 1} 輪（剩餘 ${remainingCount} 人未抽）`;
    }

    // 渲染籤筒座位狀態燈
    const poolGrid = document.getElementById('arena-pool-chips-grid');
    if (poolGrid) {
        poolGrid.innerHTML = '';
        activeSeats.forEach(seat => {
            const hasDrawn = drawnSet.has(seat);
            const isAbsent = isStudentAbsentOrLeaveToday(currentClass.id, seat);
            const chip = document.createElement('div');
            chip.className = `p-1.5 rounded-xl text-center text-xs font-black border transition-all ${
                hasDrawn
                    ? 'bg-slate-100 text-slate-400 border-slate-200 line-through opacity-60'
                    : isAbsent
                        ? 'bg-rose-50 text-rose-500 border-rose-200'
                        : 'bg-white text-indigo-700 border-indigo-200 shadow-2xs hover:scale-105 cursor-pointer'
            }`;
            chip.innerHTML = `${seat}號`;
            chip.title = `${getStudentDisplayName(currentClass, seat, true)}${hasDrawn ? ' (本輪已抽過)' : isAbsent ? ' (今日請假/缺席)' : ' (在籤筒中)'}`;
            poolGrid.appendChild(chip);
        });
    }

    // 渲染積分排行榜 (由高至低排名前 10 名)
    const leaderboardList = document.getElementById('arena-leaderboard-list');
    if (leaderboardList) {
        const sorted = activeSeats
            .map(seat => ({
                seat,
                name: getStudentNameOnly(currentClass, seat) || `${seat}號`,
                points: getStudentPoints(currentClass, seat)
            }))
            .sort((a, b) => b.points - a.points);

        leaderboardList.innerHTML = sorted.slice(0, 15).map((item, idx) => {
            const isTop3 = idx < 3;
            const rankBadges = ['bg-amber-400 text-amber-950', 'bg-slate-300 text-slate-900', 'bg-amber-700 text-white'];
            return `
                <div class="flex items-center justify-between p-2 rounded-xl ${isTop3 ? 'bg-amber-50/70 border border-amber-200/80 shadow-xs' : 'bg-white border border-slate-100'} text-xs font-bold">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="w-5 h-5 rounded-full flex items-center justify-center font-black text-[11px] ${isTop3 ? rankBadges[idx] : 'bg-slate-100 text-slate-600'}">${idx + 1}</span>
                        <span class="font-mono text-slate-800">${item.seat}號</span>
                        <span class="truncate text-slate-700">${escapeHtml(item.name)}</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <span class="font-black text-sm text-indigo-600 font-mono">${item.points}</span>
                        <button type="button" data-seat="${item.seat}" class="arena-quick-add-btn text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold cursor-pointer">+1</button>
                    </div>
                </div>
            `;
        }).join('');

        leaderboardList.querySelectorAll('.arena-quick-add-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const s = parseInt(btn.dataset.seat, 10);
                adjustStudentPoints(s, 1, '排行榜快速獎勵', e);
            });
        });
    }

    // 渲染積分變動日誌
    const historyList = document.getElementById('arena-points-history-list');
    if (historyList) {
        const hist = currentClass.pointsHistory || [];
        if (hist.length === 0) {
            historyList.innerHTML = `<div class="text-xs text-slate-400 py-3 text-center">尚無加減分紀錄</div>`;
        } else {
            historyList.innerHTML = hist.slice(0, 10).map(h => `
                <div class="flex items-center justify-between p-2 rounded-lg bg-slate-50 text-[11px] font-medium border border-slate-100">
                    <div class="flex items-center gap-1.5 truncate">
                        <span class="font-bold text-slate-800">${h.seat ? `${h.seat}號` : ''} ${escapeHtml(h.name)}</span>
                        <span class="text-slate-400 truncate">(${escapeHtml(h.reason)})</span>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                        <span class="font-black font-mono ${h.delta > 0 ? 'text-emerald-600' : 'text-rose-600'}">${h.delta > 0 ? `+${h.delta}` : h.delta}</span>
                        <span class="text-[10px] text-slate-400 font-mono">${h.time}</span>
                    </div>
                </div>
            `).join('');
        }
    }
}

/**
 * 重置全班所有學生個人積分為 0
 */
export function resetAllStudentPoints() {
    const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
    if (!currentClass) return;
    if (!confirm('確定要將全班所有學生的個人積分歸零重置嗎？此動作將清空所有個人積分。')) return;

    currentClass.pointsBySeat = {};
    if (!currentClass.pointsHistory) currentClass.pointsHistory = [];
    currentClass.pointsHistory.unshift({
        seat: '全班',
        name: '全班歸零',
        delta: 0,
        reason: '重置全班個人分數',
        time: new Date().toTimeString().slice(0, 5)
    });
    saveData();
    renderDrawAndPointsModal();
    showToast('已成功重置全班所有學生的個人積分為 0', 'success');
}

export function openDrawAndPointsModal() {
    if (window.showDrawPointsPage) {
        window.showDrawPointsPage();
    } else {
        renderDrawAndPointsModal();
    }
}

export function initArenaDrawAndPoints() {
    document.getElementById('open-draw-points-modal-btn')?.addEventListener('click', openDrawAndPointsModal);
    document.getElementById('mobile-sheet-draw-points-btn')?.addEventListener('click', () => {
        document.getElementById('mobile-more-sheet')?.classList.add('hidden');
        openDrawAndPointsModal();
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

    // 一鍵重置全班分數
    document.getElementById('arena-reset-all-points-btn')?.addEventListener('click', resetAllStudentPoints);

    // 即時加分按鈕組
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

    // 全班加分按鈕
    document.getElementById('arena-whole-class-add-1-btn')?.addEventListener('click', () => {
        awardWholeClassBonus(1, '全班專注守秩序');
    });
    document.getElementById('arena-whole-class-add-2-btn')?.addEventListener('click', () => {
        awardWholeClassBonus(2, '全班團隊表現特優');
    });
}

window.renderDrawAndPointsModal = renderDrawAndPointsModal;
window.resetAllStudentPoints = resetAllStudentPoints;

