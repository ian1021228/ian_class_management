/**
 * 班級經營系統 - 模組 1：班級名單與建班精靈 (classWizard.js)
 * 支援：
 * 1. 建立班級表單名單設定（雙模式：設定座號模式雙輸入框 / 設定名字模式即時解析）
 * 2. 學生座號、缺號排除與姓名輔助函式
 * 3. 浮動加分彈跳動效 spawnScorePop
 */

import { state } from '../state.js';
import { generateRandomAccessCode, showToast, escapeHtml } from '../utils.js';

let addRosterMode = 'seat'; // 'seat' | 'name'

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
 * 取得座號對應學生姓名
 */
export function getStudentNameOnly(classObj, seat) {
    if (!classObj || !classObj.studentNames) return '';
    return classObj.studentNames[String(seat)] || classObj.studentNames[Number(seat)] || '';
}

/**
 * 取得座號對應顯示全稱（例如「1 號 王小明」）
 */
export function getStudentDisplayName(classObj, seat, compact = false) {
    const name = getStudentNameOnly(classObj, seat);
    if (!name) return `${seat} 號`;
    return compact ? `${seat}號 ${name}` : `${seat} 號 ${name}`;
}

/**
 * 智慧解析貼上的學生名單文字
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
        // 匹配座號，例如 "1 王小明", "01.王小明", "1號 王小明", "1\t王小明"
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
        // 純座號緊連姓名，例如 "1王小明"
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
 * 浮動加分彈跳動效
 */
export function spawnScorePop(x, y, text, isPositive = true) {
    const pop = document.createElement('div');
    pop.className = `fixed pointer-events-none z-[9999] font-black text-lg sm:text-xl font-mono px-2 py-0.5 rounded-full shadow-lg transition-all duration-700 ${
        isPositive ? 'text-emerald-700 bg-emerald-100/90 ring-2 ring-emerald-400/50' : 'text-rose-700 bg-rose-100/90 ring-2 ring-rose-400/50'
    }`;
    pop.textContent = text;
    pop.style.left = `${x}px`;
    pop.style.top = `${y}px`;
    pop.style.transform = 'translate(-50%, -50%) scale(0.6)';
    pop.style.opacity = '0';

    requestAnimationFrame(() => {
        pop.style.transform = 'translate(-50%, -120%) scale(1.15)';
        pop.style.opacity = '1';
    });

    setTimeout(() => {
        pop.style.transform = 'translate(-50%, -200%) scale(0.9)';
        pop.style.opacity = '0';
    }, 450);

    document.body.appendChild(pop);
    setTimeout(() => {
        pop.remove();
    }, 980);
}

/**
 * 更新新增班級表單中的座號模式即時預覽
 */
function updateAddRosterSeatPreview() {
    const maxSeatInput = document.getElementById('add-class-max-seat');
    const skippedInput = document.getElementById('add-class-skipped-seats');
    const statsEl = document.getElementById('add-roster-seat-stats');
    const chipsEl = document.getElementById('add-roster-seat-chips');

    if (!maxSeatInput || !statsEl || !chipsEl) return;

    const maxSeat = parseInt(maxSeatInput.value, 10) || 30;
    const skippedStr = skippedInput ? skippedInput.value.trim() : '';
    const skippedSet = new Set();

    if (skippedStr) {
        skippedStr.split(/[,，、\s]+/).forEach(part => {
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

    const activeSeats = [];
    for (let i = 1; i <= maxSeat; i++) {
        if (!skippedSet.has(i)) activeSeats.push(i);
    }

    statsEl.textContent = `有效人數：${activeSeats.length} 人（1~${maxSeat} 號${skippedSet.size > 0 ? `，缺號 ${skippedSet.size} 人` : ''}）`;

    chipsEl.innerHTML = activeSeats.slice(0, 45).map(s => `
        <span class="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200 text-xs font-mono font-bold">${s}號</span>
    `).join('');

    if (activeSeats.length > 45) {
        chipsEl.innerHTML += `<span class="text-xs text-stone-400 font-bold self-center">+其餘 ${activeSeats.length - 45} 位</span>`;
    }
}

/**
 * 更新新增班級表單中的名字模式即時預覽
 */
function updateAddRosterNamePreview() {
    const textarea = document.getElementById('add-class-names-textarea');
    const previewBox = document.getElementById('add-roster-names-preview');
    if (!textarea || !previewBox) return;

    const raw = textarea.value.trim();
    if (!raw) {
        previewBox.innerHTML = `<span class="text-stone-400 text-xs">貼上姓名後將即時預覽解析出的座號與姓名...</span>`;
        return;
    }

    const parsed = parseSmartRosterText(raw);
    const badges = Object.entries(parsed.studentNames)
        .slice(0, 18)
        .map(([seat, name]) => `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 text-xs font-bold"><strong class="font-mono text-amber-800">${seat}號</strong> ${escapeHtml(name)}</span>`)
        .join('');
    const moreCount = Math.max(0, parsed.count - 18);
    const skippedText = parsed.skippedSeats.length > 0 ? `（自動標記缺號：${parsed.skippedSeats.join(', ')} 號）` : '（無跳號）';

    previewBox.innerHTML = `
        <div class="flex items-center justify-between text-xs font-black text-emerald-700 mb-1">
            <span><i class="fa-solid fa-circle-check mr-1"></i>已解析 ${parsed.count} 位學生・最後座號 ${parsed.maxSeat} 號 ${skippedText}</span>
        </div>
        <div class="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar">
            ${badges}
            ${moreCount > 0 ? `<span class="px-2 py-0.5 rounded-lg bg-stone-100 text-stone-600 text-xs font-bold self-center">+ 其餘 ${moreCount} 位</span>` : ''}
        </div>
    `;
}

/**
 * 從新增班級表單中取得已設定的名單資料
 */
export function getRosterDataFromAddForm() {
    if (addRosterMode === 'seat') {
        const maxSeatInput = document.getElementById('add-class-max-seat');
        const skippedInput = document.getElementById('add-class-skipped-seats');
        const maxSeat = parseInt(maxSeatInput?.value, 10);
        if (!maxSeat || maxSeat < 1 || maxSeat > 100) {
            return { error: '請輸入 1 至 100 之間的有效最後號碼（全班人數）！' };
        }

        const skippedStr = skippedInput ? skippedInput.value.trim() : '';
        const skippedSeats = [];
        if (skippedStr) {
            skippedStr.split(/[,，、\s]+/).forEach(part => {
                if (!part) return;
                if (part.includes('-')) {
                    const [start, end] = part.split('-').map(x => parseInt(x, 10));
                    if (!isNaN(start) && !isNaN(end)) {
                        for (let i = Math.min(start, end); i <= Math.max(start, end); i++) skippedSeats.push(i);
                    }
                } else {
                    const n = parseInt(part, 10);
                    if (!isNaN(n)) skippedSeats.push(n);
                }
            });
        }

        const validCount = maxSeat - skippedSeats.filter(s => s <= maxSeat).length;
        if (validCount <= 0) {
            return { error: '名單設定中有效座號為 0，請確認最後號碼或排除缺號設定！' };
        }

        return {
            mode: 'seat',
            maxSeat,
            skippedSeats,
            studentNames: {},
            count: validCount
        };
    } else {
        const textarea = document.getElementById('add-class-names-textarea');
        const raw = textarea ? textarea.value.trim() : '';
        if (!raw) {
            return { error: '請在名字模式中填寫或貼上學生姓名清單！' };
        }
        const parsed = parseSmartRosterText(raw);
        if (parsed.count === 0) {
            return { error: '未能解析出任何有效的學生名單，請確認輸入格式！' };
        }
        return {
            mode: 'name',
            maxSeat: parsed.maxSeat,
            skippedSeats: parsed.skippedSeats,
            studentNames: parsed.studentNames,
            count: parsed.count
        };
    }
}

/**
 * 初始化班級名單與建班表單事件
 */
export function initClassWizard() {
    // 隨機產生家長權限碼按鈕
    const genCodeBtn = document.getElementById('gen-code-btn');
    const accessCodeInput = document.getElementById('class-access-code');
    if (genCodeBtn && accessCodeInput) {
        genCodeBtn.addEventListener('click', () => {
            accessCodeInput.value = generateRandomAccessCode();
            showToast('已隨機產生家長權限碼！', 'info');
        });
    }

    // 新增班級名單模式 Tab 切換
    const seatTab = document.getElementById('add-roster-mode-tab-seat');
    const nameTab = document.getElementById('add-roster-mode-tab-name');
    const seatContainer = document.getElementById('add-roster-seat-container');
    const nameContainer = document.getElementById('add-roster-name-container');

    const switchAddRosterMode = (mode) => {
        addRosterMode = mode;
        if (mode === 'seat') {
            seatTab?.classList.add('bg-white', 'text-amber-800', 'shadow-xs');
            seatTab?.classList.remove('text-stone-600');
            nameTab?.classList.remove('bg-white', 'text-amber-800', 'shadow-xs');
            nameTab?.classList.add('text-stone-600');
            seatContainer?.classList.remove('hidden');
            nameContainer?.classList.add('hidden');
            updateAddRosterSeatPreview();
        } else {
            nameTab?.classList.add('bg-white', 'text-amber-800', 'shadow-xs');
            nameTab?.classList.remove('text-stone-600');
            seatTab?.classList.remove('bg-white', 'text-amber-800', 'shadow-xs');
            seatTab?.classList.add('text-stone-600');
            nameContainer?.classList.remove('hidden');
            seatContainer?.classList.add('hidden');
            updateAddRosterNamePreview();
        }
    };

    seatTab?.addEventListener('click', () => switchAddRosterMode('seat'));
    nameTab?.addEventListener('click', () => switchAddRosterMode('name'));

    // 即時預覽輸入監聽
    document.getElementById('add-class-max-seat')?.addEventListener('input', updateAddRosterSeatPreview);
    document.getElementById('add-class-skipped-seats')?.addEventListener('input', updateAddRosterSeatPreview);
    document.getElementById('add-class-names-textarea')?.addEventListener('input', updateAddRosterNamePreview);

    // 初始觸發一次預覽計算
    updateAddRosterSeatPreview();
}
