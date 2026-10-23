/**
 * 班級經營系統 - 模組 1：智慧建立班級流程與學生名單管理 (classWizard.js)
 * 支援：
 * 1. 智慧名單貼上解析（相容 Excel「座號 姓名」、純姓名清單、單行空白分隔）
 * 2. 純人數快速建班（自動套用最後座號與缺號）
 * 3. 學生姓名顯示輔助函式 getStudentDisplayName(classObj, seat)
 * 4. 浮動加分彈跳動效 spawnScorePop(x, y, text, isPositive)
 */

import { state } from '../state.js';
import { generateId, generateRandomAccessCode, showToast, openModal, closeModal, escapeHtml } from '../utils.js';
import { saveData } from '../storage.js';
import { renderClassSelector, renderClassList, renderHomeworkList } from '../render.js';

/**
 * 取得指定班級的所有有效座號陣列（已排除缺號 skippedSeats / lastMissingSeats）
 */
export function getActiveSeatsForClass(classObj) {
    if (!classObj) return [];
    const maxSeat = parseInt(classObj.lastMaxSeat, 10) || 30;
    const skippedSet = new Set();

    if (Array.isArray(classObj.skippedSeats)) {
        classObj.skippedSeats.forEach(s => {
            const n = parseInt(s, 10);
            if (!isNaN(n)) skippedSet.add(n);
        });
    }
    if (typeof classObj.lastMissingSeats === 'string' && classObj.lastMissingSeats.trim()) {
        classObj.lastMissingSeats.split(/[,，、\s]+/).forEach(part => {
            if (!part) return;
            if (part.includes('-')) {
                const [start, end] = part.split('-').map(x => parseInt(x, 10));
                if (!isNaN(start) && !isNaN(end)) {
                    for (let i = Math.min(start, end); i <= Math.max(start, end); i++) skippedSet.add(i);
                }
            } else {
                const n = parseInt(part, 10);
                if (!isNaN(n)) skippedSet.add(n);
            }
        });
    }

    const seats = [];
    for (let i = 1; i <= maxSeat; i++) {
        if (!skippedSet.has(i)) seats.push(i);
    }
    return seats;
}

/**
 * 取得座號對應顯示名稱（若有設定姓名則回傳「1號 王小明」或指定格式）
 */
export function getStudentNameOnly(classObj, seat) {
    if (!classObj || !classObj.studentNames) return '';
    return classObj.studentNames[String(seat)] || classObj.studentNames[Number(seat)] || '';
}

export function getStudentDisplayName(classObj, seat, compact = false) {
    const name = getStudentNameOnly(classObj, seat);
    if (!name) return `${seat} 號`;
    return compact ? `${seat}號 ${name}` : `${seat} 號 ${name}`;
}

/**
 * 智慧解析貼上的學生名單文字
 * 支援格式：
 * - "1 王小明\n2 李小華"
 * - "01\t王小明\n02\t李小華"
 * - "王小明\n李小華\n張小美" (自動依序編號 1, 2, 3...)
 * - 跳號自動偵測為缺號
 */
export function parseSmartRosterText(rawText) {
    const lines = String(rawText || '')
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);

    if (lines.length === 0) {
        return { maxSeat: 30, skippedSeats: [], studentNames: {}, count: 0 };
    }

    const studentNames = {};
    let maxSeat = 0;
    let autoSeatCounter = 1;

    lines.forEach(line => {
        // 匹配開頭座號，例如 "1 王小明", "01.王小明", "1號 王小明", "1\t王小明"
        const match = line.match(/^(\d{1,3})\s*(?:號|[\.\、\-\t\s])\s*(.+)$/);
        if (match) {
            const seatNum = parseInt(match[1], 10);
            const nameStr = match[2].trim();
            if (seatNum >= 1 && seatNum <= 100 && nameStr) {
                studentNames[String(seatNum)] = nameStr;
                if (seatNum > maxSeat) maxSeat = seatNum;
                autoSeatCounter = seatNum + 1;
                return;
            }
        }
        // 純座號與姓名無空白，例如 "1王小明"
        const matchTight = line.match(/^(\d{1,2})([^\d\s].*)$/);
        if (matchTight) {
            const seatNum = parseInt(matchTight[1], 10);
            const nameStr = matchTight[2].trim();
            if (seatNum >= 1 && seatNum <= 100 && nameStr) {
                studentNames[String(seatNum)] = nameStr;
                if (seatNum > maxSeat) maxSeat = seatNum;
                autoSeatCounter = seatNum + 1;
                return;
            }
        }
        // 純姓名行
        if (autoSeatCounter <= 100) {
            studentNames[String(autoSeatCounter)] = line;
            if (autoSeatCounter > maxSeat) maxSeat = autoSeatCounter;
            autoSeatCounter++;
        }
    });

    if (maxSeat === 0) maxSeat = 30;
    const skippedSeats = [];
    const definedSeats = Object.keys(studentNames).map(k => parseInt(k, 10));
    if (definedSeats.length > 0) {
        for (let i = 1; i <= maxSeat; i++) {
            if (!studentNames[String(i)]) {
                skippedSeats.push(i);
            }
        }
    }

    return {
        maxSeat,
        skippedSeats,
        studentNames,
        count: Object.keys(studentNames).length
    };
}

/**
 * 觸發 iOS 彈力浮動加分特效
 */
export function spawnScorePop(clientX, clientY, labelText = '+1', isPositive = true) {
    const pop = document.createElement('div');
    pop.className = `aurora-score-pop ${isPositive ? 'bg-emerald-500 text-white border border-emerald-300' : 'bg-rose-500 text-white border border-rose-300'}`;
    const x = clientX || window.innerWidth / 2;
    const y = clientY || window.innerHeight / 2;
    pop.style.left = `${x}px`;
    pop.style.top = `${y}px`;
    pop.innerHTML = `<i class="fa-solid ${isPositive ? 'fa-star text-amber-200' : 'fa-bolt'} mr-1"></i>${escapeHtml(labelText)}`;
    document.body.appendChild(pop);
    setTimeout(() => {
        pop.remove();
    }, 980);
}

/**
 * 初始化智慧建班精靈與名單編輯器事件
 */
export function initClassWizard() {
    const openWizardBtn = document.getElementById('open-smart-class-wizard-btn');
    const rosterTextarea = document.getElementById('wizard-roster-textarea');
    const previewBox = document.getElementById('wizard-roster-preview');
    const fillSampleBtn = document.getElementById('wizard-fill-sample-btn');
    const applyRosterToCurrentBtn = document.getElementById('wizard-apply-roster-current-btn');

    const updateRosterPreview = () => {
        if (!rosterTextarea || !previewBox) return;
        const raw = rosterTextarea.value.trim();
        if (!raw) {
            previewBox.innerHTML = `<span class="text-slate-400 text-xs">貼上名單後將即時預覽解析出的座號、姓名與自動偵測缺號...</span>`;
            return;
        }
        const parsed = parseSmartRosterText(raw);
        const badges = Object.entries(parsed.studentNames)
            .slice(0, 18)
            .map(([seat, name]) => `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200/80 text-xs font-bold"><strong class="font-mono text-indigo-900">${seat}號</strong> ${escapeHtml(name)}</span>`)
            .join('');
        const moreCount = Math.max(0, parsed.count - 18);
        const skippedText = parsed.skippedSeats.length > 0 ? `（自動標記缺號：${parsed.skippedSeats.join(', ')} 號）` : '（無跳號）';

        previewBox.innerHTML = `
            <div class="flex items-center justify-between text-xs font-black text-emerald-700 mb-2">
                <span><i class="fa-solid fa-circle-check mr-1"></i>已智慧辨識 ${parsed.count} 位學生・最後座號 ${parsed.maxSeat} 號 ${skippedText}</span>
            </div>
            <div class="flex flex-wrap gap-1.5">
                ${badges}
                ${moreCount > 0 ? `<span class="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold">+ 其餘 ${moreCount} 位</span>` : ''}
            </div>
        `;
    };

    if (rosterTextarea) {
        rosterTextarea.addEventListener('input', updateRosterPreview);
    }

    if (fillSampleBtn && rosterTextarea) {
        fillSampleBtn.addEventListener('click', () => {
            rosterTextarea.value = [
                '1 王品妍', '2 林宥廷', '3 張語恩', '4 陳柏翰', '5 劉子睿',
                '6 黃品潔', '7 吳承恩', '8 蔡依庭', '9 許哲瑋', '10 鄭宇軒',
                '11 謝采潔', '12 郭宥均', '13 洪子晴', '14 邱翊誠', '15 曾品希'
            ].join('\n');
            updateRosterPreview();
            showToast('已帶入範例學生名單，可自由修改或直接套用', 'info');
        });
    }

    // 套用智慧名單至目前選中班級
    if (applyRosterToCurrentBtn) {
        applyRosterToCurrentBtn.addEventListener('click', () => {
            const currentClass = state.appData.classes.find(c => c.id === state.currentClassId);
            if (!currentClass) {
                showToast('請先選擇或建立一個班級', 'error');
                return;
            }
            const raw = rosterTextarea ? rosterTextarea.value.trim() : '';
            if (!raw) {
                showToast('請先在輸入框貼上學生名單', 'error');
                return;
            }
            const parsed = parseSmartRosterText(raw);
            if (parsed.count === 0) {
                showToast('未能解析出有效名單，請檢查格式', 'error');
                return;
            }
            currentClass.studentNames = { ...(currentClass.studentNames || {}), ...parsed.studentNames };
            currentClass.lastMaxSeat = parsed.maxSeat;
            currentClass.skippedSeats = parsed.skippedSeats;
            currentClass.lastMissingSeats = parsed.skippedSeats.join(', ');
            currentClass.hasConfiguredMaxSeat = true;

            saveData();
            renderClassList();
            renderHomeworkList();
            showToast(`已成功為「${currentClass.name}」匯入 ${parsed.count} 位學生姓名與座號配置！`, 'success');
        });
    }

    // 支援在新增班級表單中同時讀取智慧名單（若有填寫）
    const addClassForm = document.getElementById('add-class-form');
    if (addClassForm) {
        addClassForm.addEventListener('submit', () => {
            setTimeout(() => {
                const raw = rosterTextarea ? rosterTextarea.value.trim() : '';
                if (!raw) return;
                const newestClass = state.appData.classes[state.appData.classes.length - 1];
                if (!newestClass) return;
                const parsed = parseSmartRosterText(raw);
                if (parsed.count > 0) {
                    newestClass.studentNames = parsed.studentNames;
                    newestClass.lastMaxSeat = parsed.maxSeat;
                    newestClass.skippedSeats = parsed.skippedSeats;
                    newestClass.lastMissingSeats = parsed.skippedSeats.join(', ');
                    newestClass.hasConfiguredMaxSeat = true;
                    rosterTextarea.value = '';
                    updateRosterPreview();
                    saveData();
                    renderClassList();
                }
            }, 60);
        });
    }

    if (openWizardBtn) {
        openWizardBtn.addEventListener('click', () => {
            const box = document.getElementById('smart-roster-wizard-drawer');
            if (box) {
                box.classList.toggle('hidden');
            }
        });
    }
}
