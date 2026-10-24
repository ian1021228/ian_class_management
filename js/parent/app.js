/**
 * 班級經營系統 — 家長端查核看板主程式 (Parent Dashboard App)
 * 整合作業進度查核、親師聯絡簿與小考成績查詢
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { firebaseConfig, globalAppId } from "../shared/config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const APP_COLLECTION_ID = globalAppId;

// ==========================================
// 【模組功能開關】小考成績系統開關 (已全面啟用)
// ==========================================
const ENABLE_SCORES_FEATURE = true;

    // Local Storage Keys
    const LS_ACCESS_CODE_KEY = "parent_access_code";
    const LS_CLASS_CACHE_PREFIX = "parent_class_cache_";

    function getParentSeatStorageKey(code) {
      const c = String(code || state.accessCode || "").trim().toUpperCase();
      return c ? `parent_seat_${c}` : null;
    }

    // App Global State
    const state = {
      accessCode: "",
      studentSeat: null, // number | null
      classData: null,
      cloudStudentData: null,
      selectedContactDate: getTodayDateString(),
      unsubscribeSnapshot: null,
      selectedSubjectsFilter: [], // array of subjects, empty or 21 means all
      isOnline: true
    };
    window.state = state;

    // DOM Elements
    const elements = {
      // Views
      loginView: document.getElementById("login-view"),
      dashboardView: document.getElementById("dashboard-view"),
      accessCodeForm: document.getElementById("access-code-form"),
      inputAccessCode: document.getElementById("input-access-code"),
      loginSubmitBtn: document.getElementById("login-submit-btn"),
      loginBtnText: document.getElementById("login-btn-text"),
      loginBtnIcon: document.getElementById("login-btn-icon"),
      loginErrorBox: document.getElementById("login-error-box"),
      loginErrorMsg: document.getElementById("login-error-msg"),

      // Header
      headerClassName: document.getElementById("header-class-name"),
      headerTeacherBadge: document.getElementById("header-teacher-badge"),
      headerTeacherName: document.getElementById("header-teacher-name"),
      headerAccessCode: document.getElementById("header-access-code"),
      syncStatusText: document.getElementById("sync-status-text"),
      navSeatBtn: document.getElementById("nav-seat-btn"),
      navSeatLabel: document.getElementById("nav-seat-label"),
      openSettingsBtn: document.getElementById("open-settings-btn"),
      footerSwitchClassBtn: document.getElementById("footer-switch-class-btn"),

      // Daily Bulletin (今日親師速報)
      dailyBulletinCard: document.getElementById("daily-bulletin-card"),
      bulletinTitleText: document.getElementById("bulletin-title-text"),
      bulletinFridayTag: document.getElementById("bulletin-friday-tag"),
      bulletinSubtitleDesc: document.getElementById("bulletin-subtitle-desc"),
      bulletinSeatBadge: document.getElementById("bulletin-seat-badge"),
      bulletinDateText: document.getElementById("bulletin-date-text"),
      bulletinUnboundNotice: document.getElementById("bulletin-unbound-notice"),
      bulletinContentGrid: document.getElementById("bulletin-content-grid"),
      bulletinItemHw: document.getElementById("bulletin-item-hw"),
      bulletinHwTitle: document.getElementById("bulletin-hw-title"),
      bulletinHwSummary: document.getElementById("bulletin-hw-summary"),
      bulletinHwBadge: document.getElementById("bulletin-hw-badge"),
      bulletinItemScores: document.getElementById("bulletin-item-scores"),
      bulletinScoresTitle: document.getElementById("bulletin-scores-title"),
      bulletinScoresSummary: document.getElementById("bulletin-scores-summary"),
      bulletinItemContact: document.getElementById("bulletin-item-contact"),
      bulletinContactTitle: document.getElementById("bulletin-contact-title"),
      bulletinContactSummary: document.getElementById("bulletin-contact-summary"),
      bulletinItemMood: document.getElementById("bulletin-item-mood"),
      bulletinMoodTitle: document.getElementById("bulletin-mood-title"),
      bulletinMoodSummary: document.getElementById("bulletin-mood-summary"),
      btnBulletinBindSeat: document.getElementById("btn-bulletin-bind-seat"),

      // Parent Score Modal Elements
      btnParentOpenAddScore: document.getElementById("btn-parent-open-add-score"),
      parentScoreModal: document.getElementById("parent-score-modal"),
      parentScoreModalTitle: document.getElementById("parent-score-modal-title"),
      btnParentCloseScoreModal: document.getElementById("btn-parent-close-score-modal"),
      btnParentCancelScoreModal: document.getElementById("btn-parent-cancel-score-modal"),
      btnParentSaveScoreModal: document.getElementById("btn-parent-save-score-modal"),
      parentEditScoreId: document.getElementById("parent-edit-score-id"),
      parentSubjectPickerGroup: document.getElementById("parent-subject-picker-group"),
      parentInputScoreSubject: document.getElementById("parent-input-score-subject"),
      parentInputScoreName: document.getElementById("parent-input-score-name"),
      parentInputScoreVal: document.getElementById("parent-input-score-val"),
      parentInputScoreDate: document.getElementById("parent-input-score-date"),
      parentCorrectionPickerGroup: document.getElementById("parent-correction-picker-group"),
      parentInputScoreRemark: document.getElementById("parent-input-score-remark"),

      // Student Section
      studentBoundView: document.getElementById("student-bound-view"),
      studentUnboundView: document.getElementById("student-unbound-view"),
      studentSeatDisplay: document.getElementById("student-seat-display"),
      studentSeatTitle: document.getElementById("student-seat-title"),
      changeSeatQuickBtn: document.getElementById("change-seat-quick-btn"),
      relockSeatBtn: document.getElementById("relock-seat-btn"),
      cardUpdatedTime: document.getElementById("card-updated-time"),
      statCompletedCount: document.getElementById("stat-completed-count"),
      statCorrectionCount: document.getElementById("stat-correction-count"),
      statMissingCount: document.getElementById("stat-missing-count"),
      uncompletedAlertBox: document.getElementById("uncompleted-alert-box"),
      uncompletedItemsList: document.getElementById("uncompleted-items-list"),
      personalHomeworkList: document.getElementById("personal-homework-list"),
      personalHwCountBadge: document.getElementById("personal-hw-count-badge"),
      quickSeatPickerGrid: document.getElementById("quick-seat-picker-grid"),

      // PIN Protection
      studentLockedView: document.getElementById("student-locked-view"),
      lockedSeatDisplay: document.getElementById("locked-seat-display"),
      parentPinForm: document.getElementById("parent-pin-form"),
      inputParentPin: document.getElementById("input-parent-pin"),
      btnTogglePinVisibility: document.getElementById("btn-toggle-pin-visibility"),
      iconPinEye: document.getElementById("icon-pin-eye"),
      pinErrorBox: document.getElementById("pin-error-box"),
      pinErrorMsg: document.getElementById("pin-error-msg"),
      btnSubmitPin: document.getElementById("btn-submit-pin"),
      pinSubmitText: document.getElementById("pin-submit-text"),
      pinSubmitIcon: document.getElementById("pin-submit-icon"),
      btnCancelUnlockSeat: document.getElementById("btn-cancel-unlock-seat"),

      // Parent Navigation Tabs & Panels
      parentTabHwBtn: document.getElementById("parent-tab-hw-btn"),
      parentTabScoresBtn: document.getElementById("parent-tab-scores-btn"),
      parentTabClassBtn: document.getElementById("parent-tab-class-btn"),
      parentTabContactBtn: document.getElementById("parent-tab-contact-btn"),
      panelParentHw: document.getElementById("panel-parent-hw"),
      panelParentScores: document.getElementById("panel-parent-scores"),
      panelParentClass: document.getElementById("panel-parent-class"),
      panelParentContact: document.getElementById("panel-parent-contact"),

      // Student Scores Preview & Quick Link
      studentScoresSection: document.getElementById("student-scores-section"),
      studentScoresList: document.getElementById("student-scores-list"),
      studentScoresAvgBadge: document.getElementById("student-scores-avg-badge"),
      studentMoodDisplayBox: document.getElementById("student-mood-display-box"),
      studentMoodEmoji: document.getElementById("student-mood-emoji"),
      studentMoodText: document.getElementById("student-mood-text"),
      quickJumpScoresTabBtn: document.getElementById("quick-jump-scores-tab-btn"),

      // Dedicated Scores & Analytics Panel Elements
      parentScoresUnboundView: document.getElementById("parent-scores-unbound-view"),
      parentScoresUnconfiguredView: document.getElementById("parent-scores-unconfigured-view"),
      parentScoresLockedView: document.getElementById("parent-scores-locked-view"),
      parentScoresUnlockedView: document.getElementById("parent-scores-unlocked-view"),
      scoresViewSeatBadge: document.getElementById("scores-view-seat-badge"),
      scoresViewSeatTitle: document.getElementById("scores-view-seat-title"),
      scoresViewRelockBtn: document.getElementById("scores-view-relock-btn"),
      parentStatTotalTests: document.getElementById("parent-stat-total-tests"),
      parentStatTodaySub: document.getElementById("parent-stat-today-sub"),
      parentStatOverallAvg: document.getElementById("parent-stat-overall-avg"),
      parentStatOverallGrade: document.getElementById("parent-stat-overall-grade"),
      parentStatHighestScore: document.getElementById("parent-stat-highest-score"),
      parentStatHighestSubject: document.getElementById("parent-stat-highest-subject"),
      parentStatCorrectionRate: document.getElementById("parent-stat-correction-rate"),
      parentStatCorrectionSub: document.getElementById("parent-stat-correction-sub"),
      parentTrendStatusBadge: document.getElementById("parent-trend-status-badge"),
      parentScoreTrendChartContainer: document.getElementById("parent-score-trend-chart-container"),
      parentDomainAnalyticsFilter: document.getElementById("parent-domain-analytics-filter"),
      parentSubjectAnalyticsGrid: document.getElementById("parent-subject-analytics-grid"),
      parentScoresCountBadge: document.getElementById("parent-scores-count-badge"),
      parentFilterScoreRange: document.getElementById("parent-filter-score-range"),
      parentFilterCustomDateContainer: document.getElementById("parent-filter-custom-date-container"),
      parentFilterDateStart: document.getElementById("parent-filter-date-start"),
      parentFilterDateEnd: document.getElementById("parent-filter-date-end"),
      btnParentOpenMultiSubject: document.getElementById("btn-parent-open-multi-subject"),
      parentMultiSubjectBtnLabel: document.getElementById("parent-multi-subject-btn-label"),
      parentFilterScoreSubject: document.getElementById("parent-filter-score-subject"),
      parentFilterScoreCorrection: document.getElementById("parent-filter-score-correction"),
      parentSortScoreOrder: document.getElementById("parent-sort-score-order"),
      parentDetailedScoresList: document.getElementById("parent-detailed-scores-list"),

      // Bracket Modal Elements
      modalParentScoreBracketAnalysis: document.getElementById("modal-parent-score-bracket-analysis"),
      bracketParentSubjectBadge: document.getElementById("bracket-parent-subject-badge"),
      bracketParentExamTitle: document.getElementById("bracket-parent-exam-title"),
      bracketParentDate: document.getElementById("bracket-parent-date"),
      bracketParentChildScoreBanner: document.getElementById("bracket-parent-child-score-banner"),
      bracketParentBarsContainer: document.getElementById("bracket-parent-bars-container"),
      bracketParentClassAvg: document.getElementById("bracket-parent-class-avg"),
      bracketParentSampleCount: document.getElementById("bracket-parent-sample-count"),
      bracketParentHighest: document.getElementById("bracket-parent-highest"),
      bracketParentLowest: document.getElementById("bracket-parent-lowest"),
      btnCloseParentBracketModal: document.getElementById("btn-close-parent-bracket-modal"),
      btnDoneParentBracketModal: document.getElementById("btn-done-parent-bracket-modal"),

      // Multi-Subject Modal Elements
      modalParentMultiSubjectFilter: document.getElementById("modal-parent-multi-subject-filter"),
      btnCloseParentMultiSubjectModal: document.getElementById("btn-close-parent-multi-subject-modal"),
      btnCancelParentMultiSubject: document.getElementById("btn-cancel-parent-multi-subject"),
      btnApplyParentMultiSubject: document.getElementById("btn-apply-parent-multi-subject"),
      btnParentSubSelectAll: document.getElementById("btn-parent-sub-select-all"),
      btnParentSubClearAll: document.getElementById("btn-parent-sub-clear-all"),
      parentMultiSubSelectedCountBadge: document.getElementById("parent-multi-sub-selected-count-badge"),
      parentMultiSubjectCheckboxesContainer: document.getElementById("parent-multi-subject-checkboxes-container"),

      // Scores PIN Form in Scores Panel
      parentScoresPinForm: document.getElementById("parent-scores-pin-form"),
      inputScoresPin: document.getElementById("input-scores-pin"),
      btnToggleScoresPin: document.getElementById("btn-toggle-scores-pin"),
      iconScoresPinEye: document.getElementById("icon-scores-pin-eye"),
      scoresPinErrorBox: document.getElementById("scores-pin-error-box"),
      scoresPinErrorMsg: document.getElementById("scores-pin-error-msg"),
      btnSubmitScoresPin: document.getElementById("btn-submit-scores-pin"),
      scoresPinSubmitIcon: document.getElementById("scores-pin-submit-icon"),
      scoresPinSubmitText: document.getElementById("scores-pin-submit-text"),

      // Contact Book Section
      selectedDateLabel: document.getElementById("selected-date-label"),
      contactDateSlider: document.getElementById("contact-date-slider"),
      contactBookContainer: document.getElementById("contact-book-container"),
      contactTabMoodDisplayBox: document.getElementById("contact-tab-mood-display-box"),
      contactTabMoodEmoji: document.getElementById("contact-tab-mood-emoji"),
      contactTabMoodText: document.getElementById("contact-tab-mood-text"),

      // Class Overview Section
      classHwTotalCount: document.getElementById("class-hw-total-count"),
      classHomeworkList: document.getElementById("class-homework-list"),

      // Settings Modal
      settingsModal: document.getElementById("settings-modal"),
      closeSettingsModalBtn: document.getElementById("close-settings-modal-btn"),
      modalSeatSelect: document.getElementById("modal-seat-select"),
      saveSeatBtn: document.getElementById("save-seat-btn"),
      clearSeatBtn: document.getElementById("clear-seat-btn"),
      modalClassName: document.getElementById("modal-class-name"),
      modalTeacherName: document.getElementById("modal-teacher-name"),
      modalAccessCodeBadge: document.getElementById("modal-access-code-badge"),
      switchClassModalBtn: document.getElementById("switch-class-modal-btn"),
      modalLastSyncedTime: document.getElementById("modal-last-synced-time"),

      // PWA Elements
      btnParentPwaInstall: document.getElementById("btn-parent-pwa-install"),
      parentPwaInstallBadge: document.getElementById("pwa-parent-install-badge"),
      parentPwaInstallBtnText: document.getElementById("parent-pwa-install-btn-text"),
      modalIosPwaGuide: document.getElementById("modal-ios-pwa-guide"),
      closeIosPwaGuideBtn: document.getElementById("close-ios-pwa-guide-btn"),
      confirmIosPwaGuideBtn: document.getElementById("confirm-ios-pwa-guide-btn"),

      // Matrix Modal
      matrixModal: document.getElementById("matrix-modal"),
      closeMatrixModalBtn: document.getElementById("close-matrix-modal-btn"),
      matrixModalConfirmBtn: document.getElementById("matrix-modal-confirm-btn"),
      matrixHwName: document.getElementById("matrix-hw-name"),
      matrixHwStats: document.getElementById("matrix-hw-stats"),
      matrixLegendContainer: document.getElementById("matrix-legend-container"),
      matrixSeatsGrid: document.getElementById("matrix-seats-grid"),

      // Toast & Alert
      syncAlertBanner: document.getElementById("sync-alert-banner"),
      syncAlertMsg: document.getElementById("sync-alert-msg"),
      syncRetryBtn: document.getElementById("sync-retry-btn"),
      toastContainer: document.getElementById("toast-container")
    };

    // ==========================================
    // UTILITY FUNCTIONS
    // ==========================================

    function getTodayDateString() {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // 追蹤家長是否已點開閱讀該日聯絡簿（已查看則綠點消失）
    function getParentViewedContactDates() {
      try {
        const raw = localStorage.getItem(`parent_viewed_contact_${state.accessCode || 'default'}`);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    }

    function markContactDateAsViewed(dateStr) {
      if (!dateStr) return;
      try {
        const list = getParentViewedContactDates();
        if (!list.includes(dateStr)) {
          list.push(dateStr);
          localStorage.setItem(`parent_viewed_contact_${state.accessCode || 'default'}`, JSON.stringify(list));
        }
      } catch (e) {}
    }

    function isContactDateViewed(dateStr) {
      const list = getParentViewedContactDates();
      return list.includes(dateStr);
    }

    // 週末且無指派作業時自動使用週五內容
    function getEffectiveBulletinDate(data) {
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0 是週日, 6 是週六
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      const todayStr = getTodayDateString();

      const homeworks = Array.isArray(data?.homeworks) ? data.homeworks : [];
      const hasHomework = homeworks.length > 0;

      // 若為六日且沒有指派作業，所有內容都會使用週五，並標註為週五內容
      if (isWeekend && !hasHomework) {
        const d = new Date(now);
        const daysToSubtract = (dayOfWeek === 6) ? 1 : 2; // 週六退 1 天到週五，週日退 2 天到週五
        d.setDate(now.getDate() - daysToSubtract);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const fridayStr = `${yyyy}-${mm}-${dd}`;
        return {
          isFridayFallback: true,
          effectiveDate: fridayStr,
          todayDate: todayStr,
          dayLabel: "週五內容",
          displayDate: fridayStr
        };
      }

      return {
        isFridayFallback: false,
        effectiveDate: todayStr,
        todayDate: todayStr,
        dayLabel: "今日即時",
        displayDate: todayStr
      };
    }

    function getMoodBadgeHtml(moodStr) {
      const m = String(moodStr || '').trim();
      if (m.includes('雀躍') || m.includes('開心收穫') || m.includes('衝勁十足')) {
        return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black bg-amber-50 text-amber-700 border border-amber-200"><i class="fa-solid fa-face-laugh-squint text-amber-500"></i> 雀躍</span>';
      }
      if (m.includes('開心') || m.includes('充實愉快')) {
        return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200"><i class="fa-solid fa-face-smile text-emerald-500"></i> 開心</span>';
      }
      if (m.includes('普通') || m.includes('努力思考')) {
        return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black bg-sky-50 text-sky-700 border border-sky-200"><i class="fa-solid fa-face-meh text-sky-500"></i> 普通</span>';
      }
      if (m.includes('難過') || m.includes('有點疲憊')) {
        return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-200"><i class="fa-solid fa-face-frown text-indigo-500"></i> 難過</span>';
      }
      if (m.includes('悲傷')) {
        return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black bg-rose-50 text-rose-700 border border-rose-200"><i class="fa-solid fa-face-sad-tear text-rose-500"></i> 悲傷</span>';
      }
      return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black bg-slate-50 text-slate-700 border border-slate-200"><i class="fa-solid fa-face-smile text-emerald-500"></i> ' + (escapeHtml(m) || '開心') + '</span>';
    }

    function formatRelativeTime(isoString) {
      if (!isoString) return "無紀錄";
      try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return isoString;
        
        const now = new Date();
        const diffSeconds = Math.floor((now - date) / 1000);
        
        if (diffSeconds < 60) return "剛剛";
        if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} 分鐘前`;
        if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)} 小時前`;
        
        return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      } catch (e) {
        return isoString;
      }
    }

    function formatFullTime(isoString) {
      if (!isoString) return "無同步紀錄";
      try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return isoString;
        return date.toLocaleString('zh-TW', { hour12: false });
      } catch (e) {
        return isoString;
      }
    }

    function parseMissingSeats(missingStr) {
      if (!missingStr) return new Set();
      const parts = String(missingStr).split(/[,，、\s]+/);
      const set = new Set();
      parts.forEach(p => {
        const item = p.trim();
        if (!item) return;
        const rangeMatch = item.match(/^(\d+)[-~–—](\d+)$/);
        if (rangeMatch) {
          const start = parseInt(rangeMatch[1], 10);
          const end = parseInt(rangeMatch[2], 10);
          const min = Math.min(start, end);
          const max = Math.max(start, end);
          for (let i = min; i <= max; i++) {
            set.add(i);
          }
        } else {
          const n = parseInt(item, 10);
          if (!isNaN(n)) set.add(n);
        }
      });
      return set;
    }

    function getDayOfWeekName(dateObj) {
      const days = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
      return days[dateObj.getDay()];
    }

    function showToast(message, type = 'info') {
      const toast = document.createElement('div');
      const bgColors = {
        success: 'bg-emerald-600 text-white',
        error: 'bg-rose-600 text-white',
        info: 'bg-slate-800 text-white'
      };
      const icons = {
        success: 'fa-circle-check',
        error: 'fa-circle-exclamation',
        info: 'fa-circle-info'
      };
      
      toast.className = `pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl ${bgColors[type] || bgColors.info} text-sm font-semibold transition-all duration-300 transform translate-y-2 opacity-0`;
      toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i> <span>${message}</span>`;
      
      elements.toastContainer.appendChild(toast);
      
      // Animate in
      requestAnimationFrame(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
      });

      setTimeout(() => {
        toast.classList.add('translate-y-2', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
      }, 3200);
    }

    // ==========================================
    // STATUS RESOLVER HELPERS
    // ==========================================

    function getStatusMeta(homeworkTypeId, statusKey, classData) {
      // Default fallback
      const fallback = {
        key: statusKey,
        text: statusKey || '未繳交',
        color: 'bg-slate-200',
        textColor: 'text-slate-700',
        isCompleted: false,
        isCorrection: false
      };

      if (!classData || !classData.homeworkTypes) return fallback;
      const type = classData.homeworkTypes.find(t => t.id === homeworkTypeId);
      if (!type || !type.statuses) return fallback;

      const found = type.statuses.find(s => s.key === statusKey);
      if (!found) return fallback;

      const isCorrection = (found.key === 'needs-correction' || found.text.includes('訂正') || found.color.includes('amber') || found.color.includes('yellow'));
      
      return {
        ...found,
        isCorrection: isCorrection
      };
    }

    // ==========================================
    // INITIALIZATION & LOGIN
    // ==========================================

    function init() {
      // Clean obsolete legacy global key
      try {
        localStorage.removeItem("parent_student_seat");
      } catch (e) {}

      // Check URL parameters for Exclusive Link (?code=XXXX&seat=XX&token=XXXX)
      const urlParams = new URLSearchParams(window.location.search);
      const codeFromUrl = urlParams.get("code");
      const seatFromUrl = urlParams.get("seat");
      const tokenFromUrl = (urlParams.get("token") || urlParams.get("t") || "").trim();

      const savedCode = localStorage.getItem(LS_ACCESS_CODE_KEY);
      const savedSeatKey = savedCode ? getParentSeatStorageKey(savedCode) : null;
      const savedSeat = savedSeatKey ? localStorage.getItem(savedSeatKey) : null;

      if (codeFromUrl && seatFromUrl && parseInt(seatFromUrl, 10) > 0) {
        const clean = codeFromUrl.trim().toUpperCase();
        const seatNum = parseInt(seatFromUrl, 10);
        if (tokenFromUrl) {
          localStorage.setItem(`parent_token_${clean}_seat${seatNum}`, tokenFromUrl);
        }
        localStorage.setItem(`parent_unlocked_${clean}_seat${seatNum}`, "true");
        elements.inputAccessCode.value = clean;
        connectToClass(clean, seatNum);
      } else if (savedCode && savedSeat && parseInt(savedSeat, 10) > 0) {
        elements.inputAccessCode.value = savedCode;
        connectToClass(savedCode, parseInt(savedSeat, 10));
      } else {
        showLoginView();
      }

      setupEventListeners();

      if (!ENABLE_SCORES_FEATURE) {
        elements.parentTabScoresBtn?.classList.add("hidden");
        elements.panelParentScores?.classList.add("hidden");
        elements.bulletinItemScores?.classList.add("hidden");
        elements.studentScoresSection?.classList.add("hidden");
        const divider = document.getElementById("hw-scores-relock-divider");
        if (divider) divider.classList.add("hidden");
      } else {
        elements.parentTabScoresBtn?.classList.remove("hidden");
        elements.parentTabScoresBtn?.classList.add("flex");
        elements.bulletinItemScores?.classList.remove("hidden");
        elements.bulletinItemScores?.classList.add("flex");
        elements.studentScoresSection?.classList.remove("hidden");
      }
    }

    function showLoginView() {
      elements.loginView.classList.remove("hidden");
      elements.dashboardView.classList.add("hidden");
      elements.loginErrorBox.classList.add("hidden");
      elements.inputAccessCode.focus();
    }

    function showDashboardView() {
      elements.loginView.classList.add("hidden");
      elements.dashboardView.classList.remove("hidden");
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function setLoginLoading(loading) {
      elements.loginSubmitBtn.disabled = loading;
      if (loading) {
        elements.loginBtnText.textContent = "驗證班級代碼中...";
        elements.loginBtnIcon.className = "fa-solid fa-spinner fa-spin text-sm";
      } else {
        elements.loginBtnText.textContent = "進入班級看板";
        elements.loginBtnIcon.className = "fa-solid fa-arrow-right text-sm";
      }
    }

    // ==========================================
    // FIRESTORE REAL-TIME SYNC
    // ==========================================

    function decodeRestValue(val) {
      if (!val || typeof val !== 'object') return val;
      if ('stringValue' in val) return val.stringValue;
      if ('integerValue' in val) return parseInt(val.integerValue, 10);
      if ('doubleValue' in val) return parseFloat(val.doubleValue);
      if ('booleanValue' in val) return val.booleanValue;
      if ('timestampValue' in val) return val.timestampValue;
      if ('arrayValue' in val) return (val.arrayValue.values || []).map(decodeRestValue);
      if ('mapValue' in val) {
        const map = {};
        for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
          map[k] = decodeRestValue(v);
        }
        return map;
      }
      return val;
    }

    function parseClassData(rawData) {
      if (!rawData) return null;
      let finalData = { ...rawData };
      if (rawData.data && typeof rawData.data === 'string') {
        try {
          const parsed = JSON.parse(rawData.data);
          finalData = { ...parsed, ...finalData };
        } catch(e) {}
      }
      return finalData;
    }

    function parseRestDocument(docJson) {
      if (!docJson || !docJson.fields) return null;
      const decoded = {};
      for (const [k, v] of Object.entries(docJson.fields)) {
        decoded[k] = decodeRestValue(v);
      }
      return parseClassData(decoded);
    }

    function connectToClass(accessCode, seatOverride = null) {
      const cleanCode = accessCode.trim().toUpperCase();
      if (!cleanCode) {
        elements.loginErrorBox.classList.remove("hidden");
        elements.loginErrorMsg.textContent = "請輸入有效的班級權限碼！";
        return;
      }

      setLoginLoading(true);
      elements.loginErrorBox.classList.add("hidden");

      // 檢查座號覆蓋或載入該班級座號
      const seatKey = getParentSeatStorageKey(cleanCode);
      if (seatOverride && parseInt(seatOverride, 10) > 0) {
        state.studentSeat = parseInt(seatOverride, 10);
        if (seatKey) localStorage.setItem(seatKey, state.studentSeat.toString());
      } else {
        const savedSeat = seatKey ? localStorage.getItem(seatKey) : null;
        if (savedSeat && parseInt(savedSeat, 10) > 0) {
          state.studentSeat = parseInt(savedSeat, 10);
        } else {
          // 第一次進入該班級，絕不默認 1 號！強制為 null 以顯示座號選擇頁面
          state.studentSeat = null;
        }
      }

      state.accessCode = cleanCode;

      // Step 1: Check fast local cache to instantly display dashboard on mobile (0ms perceived latency)
      try {
        const cachedRaw = localStorage.getItem(LS_CLASS_CACHE_PREFIX + cleanCode);
        if (cachedRaw) {
          const cachedData = JSON.parse(cachedRaw);
          if (cachedData && cachedData.className) {
            state.classData = cachedData;
            showDashboardView();
            renderParentDashboard(cachedData);
          }
        }
      } catch (cacheErr) {
        console.warn("Local cache read error:", cacheErr);
      }

      // Clean up existing listener if any
      if (state.unsubscribeSnapshot) {
        state.unsubscribeSnapshot();
        state.unsubscribeSnapshot = null;
      }

      // Step 2: Ultra-fast direct REST probe (returns in ~150ms on mobile 4G/5G, bypassing WebSocket handshake)
      let resolvedByFastRest = false;
      const fetchDirectData = async () => {
        try {
          const url = `https://firestore.googleapis.com/v1/projects/cheker-barcode/databases/(default)/documents/artifacts/${APP_COLLECTION_ID}/public/data/parentClasses/${cleanCode}`;
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 3500);
          const resp = await fetch(url, { signal: controller.signal });
          clearTimeout(timer);
          if (resp.status === 200) {
            const json = await resp.json();
            const directData = parseRestDocument(json);
            if (directData && directData.className && !resolvedByFastRest) {
              resolvedByFastRest = true;
              setLoginLoading(false);
              state.accessCode = cleanCode;
              state.classData = directData;
              localStorage.setItem(LS_ACCESS_CODE_KEY, cleanCode);
              try {
                localStorage.setItem(LS_CLASS_CACHE_PREFIX + cleanCode, JSON.stringify(directData));
              } catch (e) {}

              // 驗證座號是否超出班級範圍
              const maxSeat = directData.lastMaxSeat || 35;
              const missingSeats = parseMissingSeats(directData.lastMissingSeats);
              if (state.studentSeat && (state.studentSeat > maxSeat || missingSeats.has(state.studentSeat))) {
                state.studentSeat = null;
                if (seatKey) localStorage.removeItem(seatKey);
              }

              const currentUrl = new URL(window.location);
              currentUrl.searchParams.set("code", cleanCode);
              if (state.studentSeat) currentUrl.searchParams.set("seat", state.studentSeat);
              else currentUrl.searchParams.delete("seat");
              window.history.replaceState({}, "", currentUrl);

              showDashboardView();
              renderParentDashboard(directData);
            }
          } else if (resp.status === 404) {
            if (!state.classData && !resolvedByFastRest) {
              setLoginLoading(false);
              showLoginView();
              elements.loginErrorBox.classList.remove("hidden");
              elements.loginErrorMsg.textContent = "找不到此班級權限碼（" + cleanCode + "），請確認後重新輸入！";
              localStorage.removeItem(LS_ACCESS_CODE_KEY);
            }
          }
        } catch (e) {
          // Ignore fetch error, onSnapshot will handle in background
        }
      };

      fetchDirectData();

      // Step 3: Concurrently connect real-time onSnapshot for continuous live updates
      const classDocRef = doc(db, 'artifacts', APP_COLLECTION_ID, 'public', 'data', 'parentClasses', cleanCode);

      state.unsubscribeSnapshot = onSnapshot(classDocRef, (docSnap) => {
        setLoginLoading(false);
        if (docSnap.exists()) {
          resolvedByFastRest = true;
          const raw = docSnap.data();
          const data = parseClassData(raw);
          state.accessCode = cleanCode;
          state.classData = data;
          
          // Save to localStorage & class cache
          localStorage.setItem(LS_ACCESS_CODE_KEY, cleanCode);
          try {
            localStorage.setItem(LS_CLASS_CACHE_PREFIX + cleanCode, JSON.stringify(data));
          } catch (e) {}

          const maxSeat = data.lastMaxSeat || 35;
          const missingSeats = parseMissingSeats(data.lastMissingSeats);
          if (state.studentSeat && (state.studentSeat > maxSeat || missingSeats.has(state.studentSeat))) {
            state.studentSeat = null;
            if (seatKey) localStorage.removeItem(seatKey);
          }

          // Update URL without reload
          const currentUrl = new URL(window.location);
          currentUrl.searchParams.set("code", cleanCode);
          if (state.studentSeat) currentUrl.searchParams.set("seat", state.studentSeat);
          else currentUrl.searchParams.delete("seat");
          window.history.replaceState({}, "", currentUrl);

          showDashboardView();
          renderParentDashboard(data);
          elements.syncAlertBanner.classList.add("hidden");
        } else {
          if (!resolvedByFastRest && !state.classData) {
            // Document does not exist
            showLoginView();
            elements.loginErrorBox.classList.remove("hidden");
            elements.loginErrorMsg.textContent = "找不到此班級權限碼（" + cleanCode + "），請確認後重新輸入！";
            localStorage.removeItem(LS_ACCESS_CODE_KEY);
          }
        }
      }, (err) => {
        if (!state.classData) {
          setLoginLoading(false);
          console.error("Firestore sync error:", err);
          elements.syncAlertBanner.classList.remove("hidden");
          elements.syncAlertMsg.textContent = "即時同步發生異常，請檢查網路連線後重試";
          showToast("同步連線發生異常", "error");
        }
      });
    }

    // ==========================================
    // RENDER PARENT DASHBOARD
    // ==========================================

    function renderParentDashboard(data) {
      if (!data) return;

      // 1. Header Information
      elements.headerClassName.textContent = data.className || "未命名班級";
      elements.headerAccessCode.textContent = data.accessCode || state.accessCode;
      
      if (data.teacherName) {
        elements.headerTeacherName.textContent = data.teacherName;
        elements.headerTeacherBadge.classList.remove("hidden");
      } else {
        elements.headerTeacherBadge.classList.add("hidden");
      }

      // Settings Modal data
      elements.modalClassName.textContent = data.className || "未命名班級";
      elements.modalTeacherName.textContent = `導師：${data.teacherName || "未指定"}`;
      elements.modalAccessCodeBadge.textContent = data.accessCode || state.accessCode;
      elements.modalLastSyncedTime.textContent = formatFullTime(data.updatedAt);
      elements.cardUpdatedTime.textContent = formatRelativeTime(data.updatedAt);

      // Populate Seat Select in Settings Modal & validate current seat
      populateSeatSelect(data);

      // 2. Render Student Personal Section
      renderStudentPersonalSection(data);

      // 3. Render 7-Day Contact Book Section
      renderContactBookSection(data);

      // 4. Render Class Homework Overview Section
      renderClassHomeworkOverview(data);
    }

    function populateSeatSelect(data) {
      const maxSeat = data.lastMaxSeat || 35;
      const missingSeats = parseMissingSeats(data.lastMissingSeats);
      
      elements.modalSeatSelect.innerHTML = '<option value="">-- 請選擇座號 --</option>';
      elements.quickSeatPickerGrid.innerHTML = '';

      for (let i = 1; i <= maxSeat; i++) {
        if (missingSeats.has(i)) continue;

        // Modal Select option
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `${i} 號`;
        if (state.studentSeat === i) {
          opt.selected = true;
        }
        elements.modalSeatSelect.appendChild(opt);

        // Quick Picker Button in unbound view
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'touch-target w-11 h-11 rounded-2xl bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 font-bold text-sm flex items-center justify-center transition-all border border-indigo-100 active:scale-95 shadow-sm';
        btn.textContent = `${i}`;
        btn.title = `設定為 ${i} 號`;
        btn.addEventListener('click', () => {
          setStudentSeat(i);
        });
        elements.quickSeatPickerGrid.appendChild(btn);
      }

      // If current seat is out of range or missing, clear it
      const seatKey = getParentSeatStorageKey(state.accessCode);
      if (state.studentSeat && (state.studentSeat > maxSeat || missingSeats.has(state.studentSeat))) {
        state.studentSeat = null;
        if (seatKey) localStorage.removeItem(seatKey);
      }
    }

    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = (urlParams.get('token') || urlParams.get('t') || '').trim();

    function getTeacherConfiguredPin(seat) {
      const s = String(seat || state.studentSeat || "");
      if (!s) return null;
      const legacyPin = String(100000 + Number(s));
      const configured = state.classData?.studentPins?.[s];
      if (configured && String(configured).trim() && String(configured).trim() !== legacyPin) {
        return String(configured).trim().toUpperCase();
      }
      // 預設 PIN 碼：班級代碼 + 座號 (家長與學生共用相同 PIN 碼)
      if (state.accessCode) {
        return `${state.accessCode}${s}`.trim().toUpperCase();
      }
      return null;
    }
    window.getTeacherConfiguredPin = getTeacherConfiguredPin;

    function isSeatUnlocked(seat) {
      if (!seat || !state.accessCode) return false;
      // 進入專屬連結後完全免輸入任何認證碼或 PIN 碼
      return true;
    }

    function unlockSeat(seat, pin) {
      if (!seat || !state.accessCode) return;
      const s = String(seat);
      const key = `parent_unlocked_${state.accessCode}_seat${s}`;
      localStorage.setItem(key, "true");
      if (pin) {
        localStorage.setItem(`parent_unlocked_pin_${state.accessCode}_seat${s}`, String(pin).trim().toUpperCase());
      }
      if (urlToken) {
        localStorage.setItem(`parent_token_${state.accessCode}_seat${s}`, urlToken);
      }
    }

    function relockSeat(seat) {
      if (!seat || !state.accessCode) return;
      const s = String(seat);
      localStorage.removeItem(`parent_unlocked_${state.accessCode}_seat${s}`);
      localStorage.removeItem(`parent_unlocked_pin_${state.accessCode}_seat${s}`);
      localStorage.removeItem(`parent_token_${state.accessCode}_seat${s}`);
    }

    function showInAppConfirm({ title, message, confirmText = "確定", cancelText = "取消", isDanger = false, onConfirm }) {
      const modal = document.getElementById("inapp-confirm-modal");
      const titleEl = document.getElementById("confirm-modal-title");
      const msgEl = document.getElementById("confirm-modal-message");
      const okBtn = document.getElementById("confirm-modal-ok-btn");
      const cancelBtn = document.getElementById("confirm-modal-cancel-btn");
      if (!modal) {
        if (typeof onConfirm === "function") onConfirm();
        return;
      }

      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message;
      if (okBtn) {
        okBtn.textContent = confirmText;
        okBtn.className = isDanger
          ? "flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer"
          : "flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer";
      }
      if (cancelBtn) cancelBtn.textContent = cancelText;

      modal.classList.remove("hidden");

      const cleanup = () => {
        modal.classList.add("hidden");
        okBtn?.removeEventListener("click", onOk);
        cancelBtn?.removeEventListener("click", onCancel);
      };

      const onOk = () => {
        cleanup();
        if (typeof onConfirm === "function") onConfirm();
      };
      const onCancel = () => {
        cleanup();
      };

      okBtn?.addEventListener("click", onOk);
      cancelBtn?.addEventListener("click", onCancel);
    }

    function setStudentSeat(seatNumber) {
      state.studentSeat = seatNumber ? parseInt(seatNumber, 10) : null;
      const seatKey = getParentSeatStorageKey(state.accessCode);
      if (state.studentSeat) {
        if (seatKey) localStorage.setItem(seatKey, state.studentSeat.toString());
        showToast(`已選取學生座號：${state.studentSeat} 號`, "info");
        const currentUrl = new URL(window.location);
        currentUrl.searchParams.set("seat", state.studentSeat);
        window.history.replaceState({}, "", currentUrl);
      } else {
        if (seatKey) localStorage.removeItem(seatKey);
        showToast("已清除座號綁定，請重新點選座號", "info");
        const currentUrl = new URL(window.location);
        currentUrl.searchParams.delete("seat");
        window.history.replaceState({}, "", currentUrl);
      }
      
      if (state.classData) {
        renderStudentPersonalSection(state.classData);
        populateSeatSelect(state.classData);
      }
    }

    // ==========================================
    // MODULE 0: DAILY BULLETIN (今日親師速報)
    // ==========================================

    function renderDailyBulletin(data) {
      if (!elements.dailyBulletinCard) return;
      if (!data) data = state.classData || {};

      const seat = state.studentSeat;
      const effectiveInfo = getEffectiveBulletinDate(data);
      const targetDate = effectiveInfo.effectiveDate;

      if (elements.bulletinDateText) {
        if (effectiveInfo.isFridayFallback) {
          elements.bulletinDateText.textContent = `${effectiveInfo.todayDate}（週五：${targetDate}）`;
        } else {
          elements.bulletinDateText.textContent = targetDate;
        }
      }

      if (elements.bulletinFridayTag) {
        if (effectiveInfo.isFridayFallback) {
          elements.bulletinFridayTag.classList.remove('hidden');
        } else {
          elements.bulletinFridayTag.classList.add('hidden');
        }
      }

      if (elements.bulletinSubtitleDesc) {
        if (effectiveInfo.isFridayFallback) {
          elements.bulletinSubtitleDesc.textContent = ENABLE_SCORES_FEATURE
            ? "（週末無指派作業，為您自動呈現週五學習與小考紀錄）"
            : "（週末無指派作業，為您自動呈現週五作業與聯絡簿紀錄）";
        } else {
          elements.bulletinSubtitleDesc.textContent = ENABLE_SCORES_FEATURE
            ? "今日孩子學習、小考與聯絡事項彙整"
            : "今日孩子作業、聯絡事項與心情彙整";
        }
      }

      if (elements.bulletinHwTitle) {
        elements.bulletinHwTitle.textContent = effectiveInfo.isFridayFallback ? "週五作業" : "今日作業";
      }
      if (elements.bulletinScoresTitle) {
        elements.bulletinScoresTitle.textContent = effectiveInfo.isFridayFallback ? "週五小考" : "今日小考";
      }
      if (elements.bulletinContactTitle) {
        elements.bulletinContactTitle.textContent = effectiveInfo.isFridayFallback ? "週五聯絡事項" : "今日聯絡事項";
      }
      if (elements.bulletinMoodTitle) {
        elements.bulletinMoodTitle.textContent = effectiveInfo.isFridayFallback ? "孩子週五心情" : "孩子今日心情";
      }

      if (!seat) {
        elements.bulletinUnboundNotice?.classList.remove('hidden');
        elements.bulletinContentGrid?.classList.add('hidden');
        if (elements.bulletinSeatBadge) {
          elements.bulletinSeatBadge.textContent = '未選擇座號';
        }
        return;
      }

      elements.bulletinUnboundNotice?.classList.add('hidden');
      elements.bulletinContentGrid?.classList.remove('hidden');
      if (elements.bulletinSeatBadge) {
        elements.bulletinSeatBadge.textContent = `座號 ${seat} 號`;
      }

      if (!ENABLE_SCORES_FEATURE) {
        elements.bulletinItemScores?.classList.add('hidden');
      }

      // 1. 作業進度彙整
      const homeworks = Array.isArray(data.homeworks) ? data.homeworks : [];
      let completedCount = 0;
      let correctionCount = 0;
      let missingCount = 0;

      homeworks.forEach((hw) => {
        const studentRecord = (hw.students || []).find(s => s.seat === seat);
        const statusKey = studentRecord ? studentRecord.status : 'not-submitted';
        const meta = getStatusMeta(hw.typeId, statusKey, data);
        if (meta.isCompleted) completedCount++;
        else if (meta.isCorrection) correctionCount++;
        else missingCount++;
      });

      const totalHw = homeworks.length;
      const hwPct = totalHw > 0 ? Math.round((completedCount / totalHw) * 100) : 100;

      if (elements.bulletinHwSummary) {
        if (totalHw === 0) {
          elements.bulletinHwSummary.textContent = effectiveInfo.isFridayFallback ? "週五無指派作業" : "今日尚無指派作業";
        } else {
          elements.bulletinHwSummary.textContent = `已完成 ${completedCount} 項／共 ${totalHw} 項（${hwPct}%）`;
        }
      }

      if (elements.bulletinHwBadge) {
        if (totalHw === 0) {
          elements.bulletinHwBadge.textContent = "無作業";
          elements.bulletinHwBadge.className = "px-2 py-0.5 rounded-md text-[10px] font-black bg-slate-500/20 text-slate-300 border border-slate-400/30";
        } else if (completedCount === totalHw) {
          elements.bulletinHwBadge.textContent = "100%";
          elements.bulletinHwBadge.className = "px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-400/30";
        } else {
          elements.bulletinHwBadge.textContent = `${hwPct}%`;
          elements.bulletinHwBadge.className = "px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-400/30";
        }
      }

      // 2. 小考成績彙整 (使用 targetDate)
      const isScoresUnlocked = isSeatUnlocked(seat);
      if (elements.bulletinScoresSummary) {
        if (!isScoresUnlocked) {
          elements.bulletinScoresSummary.innerHTML = '<span class="text-xs text-amber-300 font-bold flex items-center gap-1.5"><i class="fa-solid fa-lock text-[11px]"></i> 輸入 PIN 碼解鎖查閱</span>';
        } else {
          const allScores = getParentCombinedScores();
          const targetScores = allScores.filter(s => s.date === targetDate);
          if (targetScores.length > 0) {
            const listText = targetScores.map(s => `${escapeHtml(s.subject || '科目')} ${s.score} 分`).join('、');
            elements.bulletinScoresSummary.textContent = listText;
          } else {
            elements.bulletinScoresSummary.textContent = effectiveInfo.isFridayFallback ? "週五無小考紀錄" : "今日無小考紀錄";
          }
        }
      }

      // 3. 聯絡事項彙整 (使用 targetDate)
      const contactBook = data.contactBook || {};
      const targetEntries = contactBook[targetDate] || [];
      if (elements.bulletinContactSummary) {
        if (targetEntries.length > 0) {
          elements.bulletinContactSummary.textContent = `共 ${targetEntries.length} 則（皆已閱讀）`;
        } else {
          elements.bulletinContactSummary.textContent = effectiveInfo.isFridayFallback ? "週五無特殊交代事項" : "今日無特殊交代事項";
        }
      }

      // 4. 孩子心情彙整 (使用 targetDate)
      if (elements.bulletinMoodSummary) {
        if (!isScoresUnlocked) {
          elements.bulletinMoodSummary.innerHTML = '<span class="text-xs text-amber-300 font-bold flex items-center gap-1.5"><i class="fa-solid fa-lock text-[11px]"></i> 輸入 PIN 碼解鎖查閱</span>';
        } else {
          const cloudData = state.cloudStudentData;
          const targetMood = cloudData?.moodJournal ? cloudData.moodJournal[targetDate] : null;
          if (targetMood && (targetMood.mood || targetMood.text)) {
            const m = String(targetMood.mood || '').trim();
            let iconClass = 'fa-solid fa-face-smile text-emerald-400';
            let moodLabel = m || '開心';
            if (m.includes('雀躍') || m.includes('開心收穫') || m.includes('衝勁十足')) {
              iconClass = 'fa-solid fa-face-laugh-squint text-amber-400';
              moodLabel = '雀躍';
            } else if (m.includes('開心') || m.includes('充實愉快')) {
              iconClass = 'fa-solid fa-face-smile text-emerald-400';
              moodLabel = '開心';
            } else if (m.includes('普通') || m.includes('努力思考')) {
              iconClass = 'fa-solid fa-face-meh text-sky-400';
              moodLabel = '普通';
            } else if (m.includes('難過') || m.includes('有點疲憊')) {
              iconClass = 'fa-solid fa-face-frown text-indigo-300';
              moodLabel = '難過';
            } else if (m.includes('悲傷')) {
              iconClass = 'fa-solid fa-face-sad-tear text-rose-400';
              moodLabel = '悲傷';
            }
            elements.bulletinMoodSummary.innerHTML = `<i class="${iconClass}"></i> <span>${escapeHtml(moodLabel)}</span>`;
          } else {
            elements.bulletinMoodSummary.textContent = effectiveInfo.isFridayFallback ? "孩子週五尚未填寫心情" : "孩子今日尚未填寫心情";
          }
        }
      }
    }

    // ==========================================
    // MODULE 1: STUDENT PERSONAL PROGRESS RENDER
    // ==========================================

    function renderStudentPersonalSection(data) {
      const seat = state.studentSeat;
      const homeworks = data.homeworks || [];

      // 同步更新最上方的「今日親師速報」卡片
      renderDailyBulletin(data);

      if (!seat) {
        // Show unbound prompt view
        elements.studentBoundView.classList.add("hidden");
        elements.studentLockedView.classList.add("hidden");
        elements.studentUnboundView.classList.remove("hidden");
        elements.navSeatLabel.textContent = "選擇座號";
        return;
      }

      // 作業繳交情形與繳交統計完全免密碼！直接呈現作業資訊
      elements.studentBoundView.classList.remove("hidden");
      elements.studentLockedView.classList.add("hidden");
      elements.studentUnboundView.classList.add("hidden");
      elements.studentSeatDisplay.textContent = `${seat}`;
      elements.studentSeatTitle.textContent = `${seat}`;
      elements.navSeatLabel.textContent = `${seat} 號學生`;

      const isScoresUnlocked = isSeatUnlocked(seat);
      if (elements.relockSeatBtn) {
        if (isScoresUnlocked && ENABLE_SCORES_FEATURE) {
          elements.relockSeatBtn.classList.remove("hidden");
          elements.relockSeatBtn.classList.add("inline-flex");
        } else {
          elements.relockSeatBtn.classList.add("hidden");
          elements.relockSeatBtn.classList.remove("inline-flex");
        }
      }
      const divider = document.getElementById("hw-scores-relock-divider");
      if (divider) {
        if (isScoresUnlocked && ENABLE_SCORES_FEATURE) divider.classList.remove("hidden");
        else divider.classList.add("hidden");
      }

      let completedCount = 0;
      let correctionCount = 0;
      let missingCount = 0;

      const uncompletedItems = [];
      const personalHwList = [];

      homeworks.forEach((hw) => {
        const studentRecord = (hw.students || []).find(s => s.seat === seat);
        const statusKey = studentRecord ? studentRecord.status : 'not-submitted';
        const meta = getStatusMeta(hw.typeId, statusKey, data);

        if (meta.isCompleted) {
          completedCount++;
        } else if (meta.isCorrection) {
          correctionCount++;
          uncompletedItems.push({ hw, meta, statusKey });
        } else {
          missingCount++;
          uncompletedItems.push({ hw, meta, statusKey });
        }

        personalHwList.push({ hw, meta, statusKey });
      });

      // Update KPI Numbers
      elements.statCompletedCount.textContent = completedCount;
      elements.statCorrectionCount.textContent = correctionCount;
      elements.statMissingCount.textContent = missingCount;
      elements.personalHwCountBadge.textContent = `共 ${homeworks.length} 項`;

      // Render Uncompleted Highlight Box
      if (uncompletedItems.length === 0) {
        elements.uncompletedAlertBox.className = "mt-5 p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200";
        elements.uncompletedAlertBox.innerHTML = `
          <div class="flex items-center gap-2.5">
            <span class="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
              <i class="fa-solid fa-check"></i>
            </span>
            <div>
              <h3 class="text-sm font-bold text-emerald-900">太棒了！今日所有作業皆已完成！</h3>
              <p class="text-xs text-emerald-700 mt-0.5">目前無未繳交或待訂正作業，請繼續保持！</p>
            </div>
          </div>
        `;
      } else {
        elements.uncompletedAlertBox.className = "mt-5 p-4 rounded-2xl bg-amber-50/90 border border-amber-200";
        let html = `
          <div class="flex items-center gap-2 mb-3">
            <span class="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
              <i class="fa-solid fa-bell"></i>
            </span>
            <h3 class="text-sm font-bold text-amber-900">重點提醒：請提醒孩子以下 ${uncompletedItems.length} 項作業</h3>
          </div>
          <div class="space-y-2">
        `;

        uncompletedItems.forEach(({ hw, meta }) => {
          const badgeBg = meta.isCorrection ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-rose-100 text-rose-800 border-rose-300';
          const icon = meta.isCorrection ? 'fa-circle-exclamation text-amber-600' : 'fa-circle-xmark text-rose-600';
          
          html += `
            <div class="flex items-center justify-between p-2.5 rounded-xl bg-white/90 border border-amber-100 shadow-2xs">
              <span class="font-bold text-slate-800 text-sm truncate mr-2">${escapeHtml(hw.name)}</span>
              <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${badgeBg} flex-shrink-0">
                <i class="fa-solid ${icon}"></i>
                ${escapeHtml(meta.text)}
              </span>
            </div>
          `;
        });

        html += `</div>`;
        elements.uncompletedAlertBox.innerHTML = html;
      }

      // Render Personal Full Homework List
      if (personalHwList.length === 0) {
        elements.personalHomeworkList.innerHTML = `
          <div class="text-center py-6 text-slate-400 text-sm">
            <i class="fa-regular fa-folder-open text-2xl mb-1.5 block text-slate-300"></i>
            今日尚未登記任何作業
          </div>
        `;
      } else {
        elements.personalHomeworkList.innerHTML = personalHwList.map(({ hw, meta }) => {
          const typeObj = (data.homeworkTypes || []).find(t => t.id === hw.typeId);
          const typeName = typeObj ? typeObj.name : "作業";
          
          // Determine status pill style
          let pillClass = "bg-slate-100 text-slate-700 border-slate-200";
          let statusIcon = "fa-clock";

          if (meta.isCompleted) {
            pillClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
            statusIcon = "fa-circle-check text-emerald-500";
          } else if (meta.isCorrection) {
            pillClass = "bg-amber-50 text-amber-700 border-amber-200";
            statusIcon = "fa-circle-exclamation text-amber-500";
          } else {
            pillClass = "bg-rose-50 text-rose-700 border-rose-200";
            statusIcon = "fa-circle-xmark text-rose-500";
          }

          return `
            <div class="flex items-center justify-between p-3 rounded-2xl bg-slate-50/70 hover:bg-slate-50 border border-slate-200/60 transition-colors">
              <div class="flex items-center gap-2.5 min-w-0">
                <span class="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-200/80 text-slate-700 flex-shrink-0">
                  ${escapeHtml(typeName)}
                </span>
                <span class="text-sm font-bold text-slate-900 truncate">
                  ${escapeHtml(hw.name)}
                </span>
              </div>
              <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border ${pillClass} flex-shrink-0 shadow-2xs">
                <i class="fa-solid ${statusIcon}"></i>
                ${escapeHtml(meta.text)}
              </span>
            </div>
          `;
        }).join('');
      }

      // Load & Render Student Quiz Scores and Mood Journal from Cloud
      loadAndRenderStudentScores(seat);
    }

    let unsubscribeStudentScores = null;

    function loadAndRenderStudentScores(seat) {
      if (unsubscribeStudentScores) {
        unsubscribeStudentScores();
        unsubscribeStudentScores = null;
      }
      if (!state.accessCode || !seat) return;
      try {
        const studentDocId = `studentScores_${state.accessCode}_seat${seat}`;
        const profileDocRef = doc(db, 'artifacts', APP_COLLECTION_ID, 'public', 'data', 'userProfiles', studentDocId);
        unsubscribeStudentScores = onSnapshot(profileDocRef, (snap) => {
          if (snap.exists()) {
            const cloudData = snap.data();
            state.cloudStudentData = cloudData;
            renderStudentScoresView(cloudData);
            if (isSeatUnlocked(seat)) {
              renderParentScoresSection();
            }
            renderDailyBulletin(state.classData);
          } else {
            state.cloudStudentData = null;
            renderStudentScoresView(null);
            if (isSeatUnlocked(seat)) {
              renderParentScoresSection();
            }
            renderDailyBulletin(state.classData);
          }
        }, (err) => {
          console.warn("Realtime studentScores onSnapshot warning:", err);
        });
      } catch (e) {
        console.warn("loadAndRenderStudentScores setup error:", e);
      }
    }

    function renderStudentScoresView(cloudData) {
      if (!ENABLE_SCORES_FEATURE) {
        elements.studentScoresSection?.classList.add('hidden');
        return;
      }
      elements.studentScoresSection?.classList.remove('hidden');
      if (!elements.studentScoresList) return;

      const seat = state.studentSeat;
      // 只有成績需要密碼：若尚未解鎖成績，顯示成績防護提示並提供解鎖入口
      if (seat && !isSeatUnlocked(seat)) {
        const teacherPin = getTeacherConfiguredPin(seat);
        if (!teacherPin) {
          elements.studentScoresList.innerHTML = `
            <div class="p-4 sm:p-5 rounded-2xl bg-amber-50/80 border border-amber-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-lg shrink-0 shadow-xs">
                  <i class="fa-solid fa-lock"></i>
                </div>
                <div>
                  <div class="text-xs sm:text-sm font-extrabold text-amber-900">成績系統待導師設定開通</div>
                  <div class="text-[11px] text-amber-700">作業點收完全公開，成績分析需待導師在後台設定專屬 6 位數 PIN 碼</div>
                </div>
              </div>
              <button id="btn-goto-scores-tab-unlock" type="button" class="touch-target px-4 py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5">
                <i class="fa-solid fa-circle-info"></i>
                <span>查看開通說明</span>
              </button>
            </div>
          `;
        } else {
          elements.studentScoresList.innerHTML = `
            <div class="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-50/80 via-teal-50/50 to-indigo-50/50 border border-emerald-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-lg shrink-0 shadow-xs">
                  <i class="fa-solid fa-shield-halved"></i>
                </div>
                <div>
                  <div class="text-xs sm:text-sm font-extrabold text-slate-900">孩子小考成績已受 PIN 密碼保護</div>
                  <div class="text-[11px] text-slate-500">作業繳交情況完全公開，各科小考成績需輸入 6 位數專屬 PIN 碼查閱</div>
                </div>
              </div>
              <button id="btn-goto-scores-tab-unlock" type="button" class="touch-target px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5">
                <i class="fa-solid fa-key"></i>
                <span>輸入 PIN 碼查閱成績</span>
              </button>
            </div>
          `;
        }
        const gotoBtn = document.getElementById("btn-goto-scores-tab-unlock");
        if (gotoBtn) {
          gotoBtn.addEventListener("click", () => {
            switchParentTab("scores");
          });
        }
        if (elements.studentScoresAvgBadge) {
          elements.studentScoresAvgBadge.textContent = teacherPin ? "需密碼保護" : "待導師開通";
        }
        if (elements.studentMoodDisplayBox) {
          elements.studentMoodDisplayBox.classList.add("hidden");
        }
        return;
      }

      if (!cloudData || (!cloudData.scores?.length && !cloudData.moodJournal)) {
        elements.studentScoresList.innerHTML = `
          <div class="text-center py-4 px-3 rounded-2xl bg-slate-50 border border-slate-200/60 text-xs text-slate-400">
            <i class="fa-regular fa-clipboard text-lg mb-1 block text-slate-300"></i>
            學生端尚未登記平時小考成績
          </div>
        `;
        if (elements.studentScoresAvgBadge) {
          elements.studentScoresAvgBadge.textContent = "尚無成績";
        }
        if (elements.studentMoodDisplayBox) {
          elements.studentMoodDisplayBox.classList.add("hidden");
        }
        return;
      }

      const scores = Array.isArray(cloudData.scores) ? cloudData.scores : [];
      if (scores.length > 0) {
        const sum = scores.reduce((acc, s) => acc + (parseFloat(s.score) || 0), 0);
        const avg = (sum / scores.length).toFixed(1);
        if (elements.studentScoresAvgBadge) {
          elements.studentScoresAvgBadge.textContent = `平均 ${avg} 分 (${scores.length} 次)`;
        }

        // Show recent scores
        elements.studentScoresList.innerHTML = scores.slice(0, 5).map(s => {
          let badgeColor = 'bg-slate-100 text-slate-700';
          if (s.correction === '全對免訂正') badgeColor = 'bg-emerald-100 text-emerald-800';
          else if (s.correction === '已完成訂正') badgeColor = 'bg-sky-100 text-sky-800';
          else if (s.correction === '待訂正/需請教') badgeColor = 'bg-rose-100 text-rose-800';

          return `
            <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200/60 flex items-center justify-between gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 mb-0.5">
                  <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-200 text-slate-700">${escapeHtml(s.subject || '科目')}</span>
                  <span class="text-xs font-bold text-slate-800 truncate">${escapeHtml(s.name || '測驗')}</span>
                </div>
                <div class="flex items-center gap-2 text-[10px] text-slate-400">
                  <span>${s.date || ''}</span>
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${badgeColor}">${escapeHtml(s.correction || '')}</span>
                  ${s.remark ? `<span class="truncate max-w-[120px] text-slate-500 flex items-center gap-1"><i class="fa-solid fa-pen text-slate-400"></i> ${escapeHtml(s.remark)}</span>` : ''}
                </div>
              </div>
              <div class="text-right flex-shrink-0">
                <span class="text-base font-black ${s.score >= 90 ? 'text-emerald-600' : (s.score >= 60 ? 'text-indigo-600' : 'text-rose-600')}">${s.score}</span>
                <span class="text-[10px] text-slate-400 block font-medium">分</span>
              </div>
            </div>
          `;
        }).join('');
      } else {
        elements.studentScoresList.innerHTML = `
          <div class="text-center py-4 px-3 rounded-2xl bg-slate-50 border border-slate-200/60 text-xs text-slate-400">
            <i class="fa-regular fa-clipboard text-lg mb-1 block text-slate-300"></i>
            學生端尚未登記平時小考成績
          </div>
        `;
        if (elements.studentScoresAvgBadge) {
          elements.studentScoresAvgBadge.textContent = "尚無成績";
        }
      }

      // Mood Journal display
      const todayStr = getTodayDateString();
      const todayMood = cloudData.moodJournal ? cloudData.moodJournal[todayStr] : null;
      if (todayMood && (todayMood.mood || todayMood.text)) {
        if (elements.studentMoodDisplayBox) {
          elements.studentMoodDisplayBox.classList.remove("hidden");
          if (elements.studentMoodEmoji) elements.studentMoodEmoji.innerHTML = getMoodBadgeHtml(todayMood.mood);
          if (elements.studentMoodText) elements.studentMoodText.textContent = todayMood.text || "（今日無文字日記）";
        }
      } else {
        if (elements.studentMoodDisplayBox) {
          elements.studentMoodDisplayBox.classList.add("hidden");
        }
      }
    }

    // ==========================================
    // MODULE: PARENT DEDICATED SCORES & ANALYTICS
    // ==========================================

    const PARENT_DOMAINS_CONFIG = [
      { id: "lang", name: "語文領域", color: "bg-indigo-500", subjects: ["國語文", "英語文"] },
      { id: "math", name: "數學領域", color: "bg-blue-500", subjects: ["數學"] },
      { id: "social", name: "社會領域", color: "bg-amber-500", subjects: ["歷史", "地理", "公民與社會", "綜合社會"] },
      { id: "nature", name: "自然科學", color: "bg-emerald-500", subjects: ["生物", "理化", "地球科學", "綜合自然"] },
      { id: "arts-tech", name: "藝術與科技", color: "bg-purple-500", subjects: ["音樂", "視覺藝術", "表演藝術", "資訊科技", "生活科技"] },
      { id: "health-comp", name: "健體與綜合活動", color: "bg-rose-500", subjects: ["健康教育", "體育", "家政", "童軍", "輔導"] }
    ];

    const PARENT_ALL_21_SUBJECTS = PARENT_DOMAINS_CONFIG.flatMap(d => d.subjects);
    const PARENT_ALL_19_SUBJECTS = PARENT_ALL_21_SUBJECTS; // Alias for backward compatibility
    let parentActiveDomainFilter = "all";

    // ==========================================
    // 6 大分數區段計算器 (100, 90~99, 80~89, 70~79, 60~69, <60)
    // ==========================================
    function calculateScoreSegments(scoresList) {
      const segments = {
        '100': { key: '100', label: '100 分', count: 0, color: 'bg-emerald-500', textColor: 'text-emerald-700', bgLight: 'bg-emerald-50', border: 'border-emerald-200' },
        '90-99': { key: '90-99', label: '90 ~ 99 分', count: 0, color: 'bg-teal-500', textColor: 'text-teal-700', bgLight: 'bg-teal-50', border: 'border-teal-200' },
        '80-89': { key: '80-89', label: '80 ~ 89 分', count: 0, color: 'bg-blue-500', textColor: 'text-blue-700', bgLight: 'bg-blue-50', border: 'border-blue-200' },
        '70-79': { key: '70-79', label: '70 ~ 79 分', count: 0, color: 'bg-indigo-500', textColor: 'text-indigo-700', bgLight: 'bg-indigo-50', border: 'border-indigo-200' },
        '60-69': { key: '60-69', label: '60 ~ 69 分', count: 0, color: 'bg-amber-500', textColor: 'text-amber-700', bgLight: 'bg-amber-50', border: 'border-amber-200' },
        'below-60': { key: 'below-60', label: '低於 60 分', count: 0, color: 'bg-rose-500', textColor: 'text-rose-700', bgLight: 'bg-rose-50', border: 'border-rose-200' }
      };

      scoresList.forEach(s => {
        const val = Number(s);
        if (isNaN(val)) return;
        if (val === 100) segments['100'].count++;
        else if (val >= 90) segments['90-99'].count++;
        else if (val >= 80) segments['80-89'].count++;
        else if (val >= 70) segments['70-79'].count++;
        else if (val >= 60) segments['60-69'].count++;
        else segments['below-60'].count++;
      });

      return segments;
    }

    function getBracketKeyForScore(scoreVal) {
      const val = Number(scoreVal);
      if (isNaN(val)) return 'below-60';
      if (val === 100) return '100';
      if (val >= 90) return '90-99';
      if (val >= 80) return '80-89';
      if (val >= 70) return '70-79';
      if (val >= 60) return '60-69';
      return 'below-60';
    }

    // 整合家長端成績資料 (優先讀取 classData.exams 中本座號之 submissions，其次合併 cloudStudentData.scores)
    function getParentCombinedScores() {
      const seatStr = String(state.studentSeat || '');
      const combined = [];
      const seenIds = new Set();

      // 1. 取得教師端出題且此學生已填寫的測驗
      const classExams = Array.isArray(state.classData?.exams) ? state.classData.exams : [];
      classExams.forEach(exam => {
        const sub = exam.submissions?.[seatStr];
        if (sub && sub.score !== undefined && sub.score !== null && sub.score !== '') {
          seenIds.add(exam.id);
          combined.push({
            id: exam.id,
            examId: exam.id,
            subject: exam.subject || '其他',
            name: exam.name || '平時測驗',
            date: exam.date || getTodayDateString(),
            score: parseFloat(sub.score),
            correction: sub.correction || '已完成訂正',
            remark: sub.remark || '',
            originalScore: (sub.originalScore !== undefined && sub.originalScore !== null) ? sub.originalScore : null,
            lastModified: sub.lastModified || '',
            isMakeup: Boolean(sub.isMakeup),
            examObj: exam
          });
        }
      });

      // 2. 合併學生既有獨立紀錄 (雲端個人學生 scores)
      const cloudScores = (state.cloudStudentData && Array.isArray(state.cloudStudentData.scores)) ? state.cloudStudentData.scores : [];
      cloudScores.forEach(s => {
        if (!seenIds.has(s.id) && !seenIds.has(s.examId)) {
          combined.push(s);
        }
      });

      return combined;
    }

    async function renderParentScoresSection() {
      const seat = state.studentSeat;

      // 1. Seat unbound check
      if (!seat) {
        elements.parentScoresUnboundView?.classList.remove('hidden');
        elements.parentScoresUnconfiguredView?.classList.add('hidden');
        elements.parentScoresLockedView?.classList.add('hidden');
        elements.parentScoresUnlockedView?.classList.add('hidden');
        return;
      }

      // 2. Exclusive link direct unlocked view (no PIN or auth code required)
      elements.parentScoresUnboundView?.classList.add('hidden');
      elements.parentScoresUnconfiguredView?.classList.add('hidden');
      elements.parentScoresLockedView?.classList.add('hidden');
      elements.parentScoresUnlockedView?.classList.remove('hidden');
      if (elements.scoresViewSeatBadge) elements.scoresViewSeatBadge.textContent = `${seat}`;
      if (elements.scoresViewSeatTitle) elements.scoresViewSeatTitle.textContent = `${seat}`;

      // Fetch latest student scores if needed
      if (!state.cloudStudentData && state.accessCode) {
        try {
          const studentDocId = `studentScores_${state.accessCode}_seat${seat}`;
          const url = `https://firestore.googleapis.com/v1/projects/cheker-barcode/databases/(default)/documents/artifacts/${APP_COLLECTION_ID}/public/data/userProfiles/${studentDocId}`;
          const resp = await fetch(url);
          if (resp.status === 200) {
            const json = await resp.json();
            state.cloudStudentData = parseRestDocument(json);
          }
        } catch (e) {}
      }

      const allScores = getParentCombinedScores();
      const today = getTodayDateString();
      const todayScores = allScores.filter(s => s.date === today);

      // KPI Metrics
      if (elements.parentStatTotalTests) elements.parentStatTotalTests.textContent = `${allScores.length}`;
      if (elements.parentStatTodaySub) elements.parentStatTodaySub.textContent = `今日 ${todayScores.length} 筆`;
      if (elements.parentScoresCountBadge) elements.parentScoresCountBadge.textContent = `${allScores.length} 筆測驗`;

      if (allScores.length === 0) {
        if (elements.parentStatOverallAvg) elements.parentStatOverallAvg.textContent = '--';
        if (elements.parentStatOverallGrade) elements.parentStatOverallGrade.textContent = '尚無紀錄';
        if (elements.parentStatHighestScore) elements.parentStatHighestScore.textContent = '--';
        if (elements.parentStatHighestSubject) elements.parentStatHighestSubject.textContent = '--';
        if (elements.parentStatCorrectionRate) elements.parentStatCorrectionRate.textContent = '--%';
        if (elements.parentStatCorrectionSub) elements.parentStatCorrectionSub.textContent = '0 筆待訂正';
      } else {
        const total = allScores.reduce((sum, s) => sum + (parseFloat(s.score) || 0), 0);
        const avg = (total / allScores.length).toFixed(1);
        if (elements.parentStatOverallAvg) elements.parentStatOverallAvg.textContent = `${avg}`;

        let grade = "需加油";
        if (avg >= 90) grade = "優等 (A+)";
        else if (avg >= 80) grade = "甲等 (A)";
        else if (avg >= 70) grade = "乙等 (B)";
        else if (avg >= 60) grade = "丙等 (C)";
        if (elements.parentStatOverallGrade) elements.parentStatOverallGrade.textContent = grade;

        let highest = allScores[0];
        allScores.forEach(s => {
          if ((parseFloat(s.score) || 0) > (parseFloat(highest.score) || 0)) {
            highest = s;
          }
        });
        if (elements.parentStatHighestScore) elements.parentStatHighestScore.textContent = `${highest.score}分`;
        if (elements.parentStatHighestSubject) elements.parentStatHighestSubject.textContent = `${highest.subject} (${highest.name || ''})`;

        const completedCount = allScores.filter(s => s.correction === "全對免訂正" || s.correction === "已完成訂正").length;
        const corRate = Math.round((completedCount / allScores.length) * 100);
        const pendingCount = allScores.length - completedCount;
        if (elements.parentStatCorrectionRate) elements.parentStatCorrectionRate.textContent = `${corRate}%`;
        if (elements.parentStatCorrectionSub) elements.parentStatCorrectionSub.textContent = `${pendingCount} 筆待訂正`;
      }

      // Filter for Trend Chart based on time and multi-subject selection
      const rangeVal = elements.parentFilterScoreRange ? elements.parentFilterScoreRange.value : "all";
      const customStart = elements.parentFilterDateStart?.value || '';
      const customEnd = elements.parentFilterDateEnd?.value || '';
      const selectedSubs = state.selectedSubjectsFilter || [];
      const hasSubFilter = selectedSubs.length > 0 && selectedSubs.length < PARENT_ALL_21_SUBJECTS.length;

      const now = new Date();
      let minDateStr = "";
      if (rangeVal === "today") {
        minDateStr = today;
      } else if (rangeVal === "7days") {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        minDateStr = d.toISOString().slice(0, 10);
      } else if (rangeVal === "30days") {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        minDateStr = d.toISOString().slice(0, 10);
      }

      let chartScores = allScores.filter(s => {
        if (rangeVal === "today" && s.date !== today) return false;
        if ((rangeVal === "7days" || rangeVal === "30days") && s.date < minDateStr) return false;
        if (rangeVal === "custom") {
          if (customStart && s.date < customStart) return false;
          if (customEnd && s.date > customEnd) return false;
        }
        if (hasSubFilter && !selectedSubs.includes(s.subject)) return false;
        return true;
      });

      // Render Visualizations
      renderParentScoreTrendChart(chartScores);
      renderParentSubjectAnalytics(allScores);
      populateParentSubjectFilter(allScores);
      updateParentMultiSubjectBtnLabel();
      renderParentDetailedScoresList();
    }

    function renderParentScoreTrendChart(scores) {
      if (!elements.parentScoreTrendChartContainer) return;
      if (!scores || scores.length < 2) {
        elements.parentScoreTrendChartContainer.innerHTML = `
          <div class="text-center text-xs text-slate-400 py-8">
            <i class="fa-solid fa-chart-line text-2xl text-slate-300 block mb-1.5"></i>
            累積登記 2 筆以上測驗後，即在此繪製孩子進步走勢圖
          </div>
        `;
        if (elements.parentTrendStatusBadge) {
          elements.parentTrendStatusBadge.className = "px-3 py-1 rounded-full text-xs font-extrabold bg-slate-100 text-slate-500 self-start sm:self-auto";
          elements.parentTrendStatusBadge.textContent = "累積中 (至少 2 筆)";
        }
        return;
      }

      const chronological = [...scores].sort((a, b) => (a.date || '').localeCompare(b.date || '') || (parseFloat(a.id?.split('_')?.[1] || 0) - parseFloat(b.id?.split('_')?.[1] || 0)));
      const n = chronological.length;
      let trendText = `<i class="fa-solid fa-bullseye text-indigo-500 mr-1"></i> 穩定發揮中`;
      let trendClass = "bg-indigo-50 text-indigo-700 border border-indigo-200";

      const recentCount = Math.min(3, Math.floor(n / 2) || 1);
      const recentSlice = chronological.slice(-recentCount);
      const priorSlice = chronological.slice(-recentCount * 2, -recentCount);

      if (priorSlice.length > 0) {
        const avgRecent = recentSlice.reduce((s, x) => s + parseFloat(x.score), 0) / recentSlice.length;
        const avgPrior = priorSlice.reduce((s, x) => s + parseFloat(x.score), 0) / priorSlice.length;
        const diff = Math.round((avgRecent - avgPrior) * 10) / 10;
        if (diff >= 3) {
          trendText = `<i class="fa-solid fa-fire text-emerald-500 mr-1"></i> 持續進步中 (+${diff} 分)`;
          trendClass = "bg-emerald-50 text-emerald-700 border border-emerald-200";
        } else if (diff <= -3) {
          trendText = null;
        } else {
          trendText = `<i class="fa-solid fa-bullseye text-indigo-500 mr-1"></i> 穩定持平 (波動 ${diff >= 0 ? '+' : ''}${diff} 分)`;
          trendClass = "bg-indigo-50 text-indigo-700 border border-indigo-200";
        }
      } else {
        const lastScore = parseFloat(chronological[n - 1].score);
        const firstScore = parseFloat(chronological[0].score);
        const diff = Math.round(lastScore - firstScore);
        if (diff > 0) {
          trendText = `<i class="fa-solid fa-arrow-trend-up text-emerald-500 mr-1"></i> 較前次進步 (+${diff} 分)`;
          trendClass = "bg-emerald-50 text-emerald-700 border border-emerald-200";
        } else if (diff < 0) {
          trendText = null;
        }
      }

      if (elements.parentTrendStatusBadge) {
        if (trendText) {
          elements.parentTrendStatusBadge.className = `px-3 py-1 rounded-full text-xs font-extrabold ${trendClass} self-start sm:self-auto inline-flex items-center gap-1`;
          elements.parentTrendStatusBadge.innerHTML = trendText;
          elements.parentTrendStatusBadge.classList.remove('hidden');
        } else {
          elements.parentTrendStatusBadge.classList.add('hidden');
        }
      }

      const width = 600;
      const height = 180;
      const padLeft = 40;
      const padRight = 30;
      const padTop = 25;
      const padBottom = 35;
      const chartW = width - padLeft - padRight;
      const chartH = height - padTop - padBottom;

      const scoreVals = chronological.map(c => parseFloat(c.score) || 0);
      const minScore = Math.max(0, Math.floor(Math.min(...scoreVals) / 10) * 10 - 10);
      const maxScore = Math.min(100, Math.ceil(Math.max(...scoreVals) / 10) * 10 + 10);
      const scoreRange = maxScore - minScore || 20;

      const points = chronological.map((item, idx) => {
        const x = padLeft + (idx / (chronological.length - 1)) * chartW;
        const val = parseFloat(item.score) || 0;
        const y = padTop + chartH - ((val - minScore) / scoreRange) * chartH;
        return { x, y, item, val };
      });

      const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
      const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${height - padBottom} L ${points[0].x.toFixed(1)} ${height - padBottom} Z`;

      let svgHtml = `
        <svg viewBox="0 0 ${width} ${height}" class="w-full h-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="parentTrendGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#10b981" stop-opacity="0.25"/>
              <stop offset="100%" stop-color="#10b981" stop-opacity="0.0"/>
            </linearGradient>
          </defs>
          <line x1="${padLeft}" y1="${padTop}" x2="${width - padRight}" y2="${padTop}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3 3"/>
          <text x="${padLeft - 6}" y="${padTop + 4}" font-size="10" font-weight="bold" fill="#94a3b8" text-anchor="end">${maxScore}</text>

          <line x1="${padLeft}" y1="${padTop + chartH / 2}" x2="${width - padRight}" y2="${padTop + chartH / 2}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3 3"/>
          <text x="${padLeft - 6}" y="${padTop + chartH / 2 + 4}" font-size="10" font-weight="bold" fill="#94a3b8" text-anchor="end">${Math.round((maxScore + minScore) / 2)}</text>

          <line x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}" stroke="#cbd5e1" stroke-width="1.5"/>
          <text x="${padLeft - 6}" y="${height - padBottom + 4}" font-size="10" font-weight="bold" fill="#94a3b8" text-anchor="end">${minScore}</text>

          <path d="${areaD}" fill="url(#parentTrendGrad)" />
          <path d="${pathD}" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      `;

      points.forEach((p) => {
        const item = p.item;
        const sub = escapeHtml(item.subject);
        const name = escapeHtml(item.name);
        const date = escapeHtml(item.date || '');
        const tooltip = `${date} [${sub}] ${name}：${p.val}分`;
        svgHtml += `
          <g class="cursor-pointer group">
            <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5" fill="#ffffff" stroke="#059669" stroke-width="3"/>
            <text x="${p.x.toFixed(1)}" y="${(p.y - 10).toFixed(1)}" font-size="11" font-weight="900" fill="#0f172a" text-anchor="middle">${p.val}</text>
            <text x="${p.x.toFixed(1)}" y="${height - padBottom + 16}" font-size="9" font-weight="bold" fill="#64748b" text-anchor="middle">${date.slice(5)}</text>
            <title>${tooltip}</title>
          </g>
        `;
      });

      svgHtml += `</svg>`;
      elements.parentScoreTrendChartContainer.innerHTML = svgHtml;
    }

    function renderParentSubjectAnalytics(scores) {
      if (!elements.parentSubjectAnalyticsGrid) return;

      const subjectMap = {};
      scores.forEach(s => {
        const sub = s.subject || '其他';
        if (!subjectMap[sub]) {
          subjectMap[sub] = { subject: sub, scores: [], pendingCorrections: 0 };
        }
        subjectMap[sub].scores.push(parseFloat(s.score) || 0);
        if (s.correction === '待訂正/需請教') {
          subjectMap[sub].pendingCorrections++;
        }
      });

      let subjectsToShow = [...PARENT_ALL_19_SUBJECTS];
      if (parentActiveDomainFilter !== 'all') {
        const dom = PARENT_DOMAINS_CONFIG.find(d => d.id === parentActiveDomainFilter);
        if (dom) subjectsToShow = [...dom.subjects];
      }

      if (parentActiveDomainFilter === 'all') {
        Object.keys(subjectMap).forEach(sub => {
          if (!subjectsToShow.includes(sub)) {
            subjectsToShow.push(sub);
          }
        });
      }

      elements.parentSubjectAnalyticsGrid.innerHTML = subjectsToShow.map(sub => {
        const data = subjectMap[sub];
        const count = data ? data.scores.length : 0;
        const avg = count > 0 ? (data.scores.reduce((a, b) => a + b, 0) / count).toFixed(1) : null;
        const max = count > 0 ? Math.max(...data.scores) : null;
        const pending = data ? data.pendingCorrections : 0;

        let domainObj = PARENT_DOMAINS_CONFIG.find(d => d.subjects.includes(sub));
        const dotColor = domainObj ? domainObj.color : 'bg-slate-400';

        let avgBadge = avg !== null ? `${avg} 分` : '未登記';
        let avgColor = 'text-slate-400';
        let barWidth = avg !== null ? `${Math.min(100, Math.max(0, avg))}%` : '0%';
        let barColor = 'bg-slate-300';

        if (avg !== null) {
          if (avg >= 90) {
            avgColor = 'text-emerald-600';
            barColor = 'bg-emerald-500';
          } else if (avg >= 80) {
            avgColor = 'text-teal-600';
            barColor = 'bg-teal-500';
          } else if (avg >= 60) {
            avgColor = 'text-amber-600';
            barColor = 'bg-amber-500';
          } else {
            avgColor = 'text-rose-600';
            barColor = 'bg-rose-500';
          }
        }

        return `
          <div
            data-sub="${escapeHtml(sub)}"
            class="parent-subject-card p-3.5 rounded-2xl bg-slate-50/70 hover:bg-emerald-50/60 border border-slate-200/70 hover:border-emerald-300 transition-all cursor-pointer group"
            title="點擊依【${escapeHtml(sub)}】快速篩選歷史成績"
          >
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="w-2 h-2 rounded-full ${dotColor} flex-shrink-0"></span>
                <span class="text-xs font-black text-slate-800 group-hover:text-emerald-700 truncate">${escapeHtml(sub)}</span>
              </div>
              <span class="text-xs font-black ${avgColor}">${avgBadge}</span>
            </div>

            <div class="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mb-2">
              <div class="h-full ${barColor} rounded-full transition-all" style="width: ${barWidth}"></div>
            </div>

            <div class="flex items-center justify-between text-[10px] text-slate-400 font-bold">
              <span>測驗 ${count} 次 ${max !== null ? `· 最高 ${max}分` : ''}</span>
              ${pending > 0 ? `<span class="text-rose-600 font-extrabold"><i class="fa-solid fa-pencil mr-0.5"></i>${pending} 待訂正</span>` : `<span class="text-emerald-600">全訂正</span>`}
            </div>
          </div>
        `;
      }).join('');

      elements.parentSubjectAnalyticsGrid.querySelectorAll('.parent-subject-card').forEach(card => {
        card.addEventListener('click', () => {
          const sub = card.getAttribute('data-sub');
          state.selectedSubjectsFilter = [sub];
          updateParentMultiSubjectBtnLabel();
          if (elements.parentFilterScoreSubject) {
            elements.parentFilterScoreSubject.value = sub;
          }
          renderParentDetailedScoresList();
          showToast(`已為您篩選【${sub}】測驗成績`, "info");
          const targetEl = document.getElementById('parent-scores-history-section') || elements.parentDetailedScoresList;
          targetEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }

    function populateParentSubjectFilter(scores) {
      if (!elements.parentFilterScoreSubject) return;
      const currentVal = elements.parentFilterScoreSubject.value || "all";
      const recordedSubs = new Set(scores.map(s => s.subject).filter(Boolean));
      PARENT_ALL_19_SUBJECTS.forEach(s => recordedSubs.add(s));

      let html = '<option value="all">所有科目</option>';
      Array.from(recordedSubs).forEach(sub => {
        html += `<option value="${escapeHtml(sub)}">${escapeHtml(sub)}</option>`;
      });
      elements.parentFilterScoreSubject.innerHTML = html;
      elements.parentFilterScoreSubject.value = recordedSubs.has(currentVal) ? currentVal : "all";
    }

    function renderParentDetailedScoresList() {
      if (!elements.parentDetailedScoresList) return;
      const allScores = getParentCombinedScores();
      const today = getTodayDateString();

      const rangeVal = elements.parentFilterScoreRange ? elements.parentFilterScoreRange.value : "all";
      const subjectVal = elements.parentFilterScoreSubject ? elements.parentFilterScoreSubject.value : "all";
      const correctionVal = elements.parentFilterScoreCorrection ? elements.parentFilterScoreCorrection.value : "all";
      const sortVal = elements.parentSortScoreOrder ? elements.parentSortScoreOrder.value : "date-desc";

      const now = new Date();
      let minDateStr = "";
      if (rangeVal === "today") {
        minDateStr = today;
      } else if (rangeVal === "7days") {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        minDateStr = d.toISOString().slice(0, 10);
      } else if (rangeVal === "30days") {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        minDateStr = d.toISOString().slice(0, 10);
      }

      const customStart = elements.parentFilterDateStart?.value || '';
      const customEnd = elements.parentFilterDateEnd?.value || '';

      const selectedSubs = state.selectedSubjectsFilter || [];
      const hasSubFilter = selectedSubs.length > 0 && selectedSubs.length < PARENT_ALL_21_SUBJECTS.length;

      let filtered = allScores.filter(s => {
        if (rangeVal === "today" && s.date !== today) return false;
        if ((rangeVal === "7days" || rangeVal === "30days") && s.date < minDateStr) return false;
        if (rangeVal === "custom") {
          if (customStart && s.date < customStart) return false;
          if (customEnd && s.date > customEnd) return false;
        }
        if (subjectVal !== "all" && s.subject !== subjectVal) return false;
        if (hasSubFilter && !selectedSubs.includes(s.subject)) return false;
        if (correctionVal !== "all" && s.correction !== correctionVal) return false;
        return true;
      });

      filtered.sort((a, b) => {
        if (sortVal === "date-desc") {
          return (b.date || "").localeCompare(a.date || "") || (b.id || "").localeCompare(a.id || "");
        } else if (sortVal === "date-asc") {
          return (a.date || "").localeCompare(b.date || "") || (a.id || "").localeCompare(b.id || "");
        } else if (sortVal === "score-desc") {
          return (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0);
        } else if (sortVal === "score-asc") {
          return (parseFloat(a.score) || 0) - (parseFloat(b.score) || 0);
        }
        return 0;
      });

      if (filtered.length === 0) {
        elements.parentDetailedScoresList.innerHTML = `
          <div class="text-center py-12 text-slate-400 text-sm">
            <div class="w-12 h-12 rounded-full bg-slate-100 text-slate-300 mx-auto flex items-center justify-center text-xl mb-2">
              <i class="fa-solid fa-folder-open"></i>
            </div>
            查無符合條件的成績紀錄<br>
            <span class="text-xs text-slate-400 mt-1 inline-block">可調整上方篩選條件，或等待孩子在學生端登記小考</span>
          </div>
        `;
        return;
      }

      elements.parentDetailedScoresList.innerHTML = filtered.map(s => {
        const scoreVal = parseFloat(s.score) || 0;
        let scoreColor = "text-emerald-600 bg-emerald-50 border-emerald-200";
        if (scoreVal < 60) {
          scoreColor = "text-rose-600 bg-rose-50 border-rose-200";
        } else if (scoreVal < 80) {
          scoreColor = "text-amber-600 bg-amber-50 border-amber-200";
        }

        let corBadge = "";
        if (s.correction === "全對免訂正") {
          corBadge = `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 inline-flex items-center gap-1"><i class="fa-solid fa-wand-magic-sparkles text-emerald-600"></i> 全對免訂正</span>`;
        } else if (s.correction === "已完成訂正") {
          corBadge = `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-teal-100 text-teal-800 inline-flex items-center gap-1"><i class="fa-solid fa-check text-teal-600"></i> 已完成訂正</span>`;
        } else {
          corBadge = `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 inline-flex items-center gap-1"><i class="fa-solid fa-pen text-rose-600"></i> 待訂正/需請教</span>`;
        }

        const isMakeupBadge = s.isMakeup
          ? `<span class="px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300">補考</span>`
          : '';

        // 小字備註原分數與最後修改時間
        let modifiedNote = '';
        if (s.originalScore !== null && s.originalScore !== undefined && s.originalScore !== s.score) {
          modifiedNote = `<div class="text-[11px] text-amber-700 font-semibold mt-1 flex items-center gap-1">
            <i class="fa-solid fa-clock-rotate-left text-[10px]"></i>
            <span>原分數：${s.originalScore} 分 ｜ 最後修改時間：${escapeHtml(s.lastModified || '未知')}</span>
          </div>`;
        } else if (s.lastModified) {
          modifiedNote = `<div class="text-[10px] text-slate-400 mt-0.5">登記時間：${escapeHtml(s.lastModified)}</div>`;
        }

        return `
          <div class="p-3.5 sm:p-4 rounded-2xl bg-slate-50/80 hover:bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors">
            <div class="flex items-start sm:items-center gap-3 min-w-0">
              <!-- 點擊方格可查看 6 大區段 -->
              <button
                type="button"
                data-exam-id="${s.examId || s.id}"
                class="btn-parent-view-bracket touch-target w-12 h-12 rounded-2xl border-2 font-black text-lg flex items-center justify-center flex-shrink-0 cursor-pointer shadow-xs hover:scale-105 active:scale-95 transition-transform ${scoreColor}"
                title="點擊查看全班 6 大分數區段分析"
              >
                ${s.score}
              </button>
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="px-2 py-0.5 rounded-md text-[10px] font-black bg-slate-200 text-slate-700">
                    ${escapeHtml(s.subject)}
                  </span>
                  <span class="font-bold text-slate-900 text-sm truncate">
                    ${escapeHtml(s.name)}
                  </span>
                  <span class="text-[11px] text-slate-400 font-mono">
                    <i class="fa-regular fa-calendar mr-1"></i> ${escapeHtml(s.date || '')}
                  </span>
                  ${isMakeupBadge}
                </div>
                <div class="flex items-center gap-2 mt-1 flex-wrap">
                  ${corBadge}
                  ${s.remark ? `<span class="text-xs text-slate-500 truncate"><i class="fa-regular fa-comment-dots text-slate-400 mr-1"></i>${escapeHtml(s.remark)}</span>` : ''}
                </div>
                ${modifiedNote}
              </div>
            </div>
            <div class="flex items-center gap-1.5 self-end sm:self-center flex-shrink-0 flex-wrap justify-end">
              <button
                type="button"
                data-exam-id="${s.examId || s.id}"
                class="btn-parent-view-bracket touch-target px-2.5 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-bold border border-teal-200 flex items-center gap-1 cursor-pointer transition-colors"
                title="查看全班 6 大分數區段落點"
              >
                <i class="fa-solid fa-chart-column text-teal-600"></i>
                <span class="hidden sm:inline">全班區段</span>
              </button>
              <button
                type="button"
                data-score-id="${s.id || s.examId}"
                class="btn-parent-edit-score touch-target px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200 flex items-center gap-1 cursor-pointer transition-colors"
                title="編輯此小考成績"
              >
                <i class="fa-solid fa-pen-to-square"></i>
                <span>編輯</span>
              </button>
              <button
                type="button"
                data-score-id="${s.id || s.examId}"
                class="btn-parent-delete-score touch-target px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold border border-rose-200 flex items-center gap-1 cursor-pointer transition-colors"
                title="刪除此小考成績"
              >
                <i class="fa-solid fa-trash-can"></i>
              </button>
              <span class="text-xs font-bold text-slate-400 block ml-1">${scoreVal >= 60 ? '及格' : '不及格'}</span>
            </div>
          </div>
        `;
      }).join('');

      elements.parentDetailedScoresList.querySelectorAll('.btn-parent-view-bracket').forEach(btn => {
        btn.addEventListener('click', () => {
          const examId = btn.getAttribute('data-exam-id');
          openParentScoreBracketModal(examId);
        });
      });

      elements.parentDetailedScoresList.querySelectorAll('.btn-parent-edit-score').forEach(btn => {
        btn.addEventListener('click', () => {
          const scoreId = btn.getAttribute('data-score-id');
          const allScores = getParentCombinedScores();
          const target = allScores.find(s => s.id === scoreId || s.examId === scoreId);
          if (target) {
            openParentScoreModal(target);
          }
        });
      });

      elements.parentDetailedScoresList.querySelectorAll('.btn-parent-delete-score').forEach(btn => {
        btn.addEventListener('click', async () => {
          const scoreId = btn.getAttribute('data-score-id');
          await deleteParentScore(scoreId);
        });
      });
    }

    // 打開【家長端全班 6 大分數區段分析】彈窗
    function openParentScoreBracketModal(examId) {
      if (!elements.modalParentScoreBracketAnalysis) return;
      const combined = getParentCombinedScores();
      const myRecord = combined.find(s => s.id === examId || s.examId === examId);
      const curClass = state.classData;
      const exam = curClass?.exams?.find(e => e.id === examId) || myRecord?.examObj;

      const examTitle = exam ? exam.name : (myRecord?.name || '平時小考');
      const subject = exam ? exam.subject : (myRecord?.subject || '學科');
      const examDate = exam ? exam.date : (myRecord?.date || '');

      if (elements.bracketParentExamTitle) elements.bracketParentExamTitle.textContent = examTitle;
      if (elements.bracketParentSubjectBadge) elements.bracketParentSubjectBadge.textContent = subject;
      if (elements.bracketParentDate) elements.bracketParentDate.textContent = `測驗日期：${examDate || '未定'}`;

      let classScores = [];
      if (exam && exam.submissions) {
        classScores = Object.values(exam.submissions).map(s => Number(s.score)).filter(s => !isNaN(s));
      } else if (myRecord && !isNaN(myRecord.score)) {
        classScores = [Number(myRecord.score)];
      }

      const totalSamples = classScores.length;
      const segments = calculateScoreSegments(classScores);

      const myScore = myRecord ? Number(myRecord.score) : null;
      const myBracketKey = myScore !== null ? getBracketKeyForScore(myScore) : null;

      // 孩子個人落點橫幅
      if (myScore !== null && elements.bracketParentChildScoreBanner) {
        elements.bracketParentChildScoreBanner.className = "p-3 rounded-2xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-extrabold flex items-center justify-between";
        elements.bracketParentChildScoreBanner.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="w-7 h-7 rounded-xl bg-teal-600 text-white flex items-center justify-center font-black">${myScore}</span>
            <span>孩子成績：<strong>${myScore} 分</strong></span>
          </div>
          <span class="px-2 py-0.5 rounded-lg bg-teal-200 text-teal-800 text-[11px]">
            落點區段：【${segments[myBracketKey]?.label || ''}】
          </span>
        `;
        elements.bracketParentChildScoreBanner.classList.remove('hidden');
      } else if (elements.bracketParentChildScoreBanner) {
        elements.bracketParentChildScoreBanner.classList.add('hidden');
      }

      // 渲染 6 大區段長條圖
      if (elements.bracketParentBarsContainer) {
        const bracketOrder = ['100', '90-99', '80-89', '70-79', '60-69', 'below-60'];
        elements.bracketParentBarsContainer.innerHTML = bracketOrder.map(key => {
          const seg = segments[key];
          const pct = totalSamples > 0 ? Math.round((seg.count / totalSamples) * 100) : 0;
          const isChildBracket = key === myBracketKey;

          return `
            <div class="p-2.5 rounded-xl border transition-all ${isChildBracket ? 'bg-teal-50/70 border-teal-400 ring-2 ring-teal-400/20' : 'bg-slate-50/50 border-slate-200/60'}">
              <div class="flex items-center justify-between text-xs mb-1.5 font-bold">
                <div class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full ${seg.color}"></span>
                  <span class="${isChildBracket ? 'text-teal-900 font-black' : 'text-slate-700'}">${seg.label}</span>
                  ${isChildBracket ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-black bg-teal-600 text-white inline-flex items-center gap-1"><i class="fa-solid fa-location-dot"></i> 孩子落點</span>` : ''}
                </div>
                <span class="font-mono ${isChildBracket ? 'text-teal-800 font-black' : 'text-slate-600'}">
                  ${seg.count} 人 (${pct}%)
                </span>
              </div>
              <div class="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                <div class="h-full ${seg.color} rounded-full transition-all duration-500" style="width: ${pct}%"></div>
              </div>
            </div>
          `;
        }).join('');
      }

      // 全班統計指標
      if (totalSamples > 0) {
        const sum = classScores.reduce((a, b) => a + b, 0);
        const avg = (sum / totalSamples).toFixed(1);
        const max = Math.max(...classScores);
        const min = Math.min(...classScores);

        if (elements.bracketParentClassAvg) elements.bracketParentClassAvg.textContent = `${avg} 分`;
        if (elements.bracketParentSampleCount) elements.bracketParentSampleCount.textContent = `${totalSamples} 份`;
        if (elements.bracketParentHighest) elements.bracketParentHighest.textContent = `${max} 分`;
        if (elements.bracketParentLowest) elements.bracketParentLowest.textContent = `${min} 分`;
      } else {
        if (elements.bracketParentClassAvg) elements.bracketParentClassAvg.textContent = '--';
        if (elements.bracketParentSampleCount) elements.bracketParentSampleCount.textContent = '0 份';
        if (elements.bracketParentHighest) elements.bracketParentHighest.textContent = '--';
        if (elements.bracketParentLowest) elements.bracketParentLowest.textContent = '--';
      }

      elements.modalParentScoreBracketAnalysis.classList.remove('hidden');
    }

    function closeParentScoreBracketModal() {
      elements.modalParentScoreBracketAnalysis?.classList.add('hidden');
    }

    // ==========================================
    // PARENT SCORE REGISTRATION & EDIT MODAL
    // ==========================================

    function openParentScoreModal(scoreToEdit = null) {
      if (!elements.parentScoreModal) return;
      const seat = state.studentSeat;
      if (!seat) {
        showToast("請先選擇座號！", "warning");
        return;
      }

      if (scoreToEdit) {
        if (elements.parentScoreModalTitle) {
          elements.parentScoreModalTitle.innerHTML = '<i class="fa-solid fa-pen-to-square text-emerald-600"></i> 編輯小考成績';
        }
        if (elements.parentEditScoreId) elements.parentEditScoreId.value = scoreToEdit.id || scoreToEdit.examId || '';
        if (elements.parentInputScoreSubject) elements.parentInputScoreSubject.value = scoreToEdit.subject || '國文';
        if (elements.parentInputScoreName) elements.parentInputScoreName.value = scoreToEdit.name || '';
        if (elements.parentInputScoreVal) elements.parentInputScoreVal.value = (scoreToEdit.score !== undefined && scoreToEdit.score !== null) ? scoreToEdit.score : '';
        if (elements.parentInputScoreDate) elements.parentInputScoreDate.value = scoreToEdit.date || getTodayDateString();
        if (elements.parentInputScoreRemark) elements.parentInputScoreRemark.value = scoreToEdit.remark || '';

        // Subject pill highlight
        const curSub = scoreToEdit.subject || '國語文';
        elements.parentSubjectPickerGroup?.querySelectorAll('.btn-parent-subject-pill').forEach(btn => {
          if (btn.getAttribute('data-sub') === curSub) {
            btn.className = "btn-parent-subject-pill parent-sub-btn px-2.5 py-1.5 rounded-xl border border-emerald-600 bg-emerald-600 text-white font-bold text-xs shadow-xs transition-all text-center cursor-pointer";
          } else {
            btn.className = "btn-parent-subject-pill parent-sub-btn px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:border-emerald-500 hover:bg-emerald-50 bg-white transition-all text-center cursor-pointer";
          }
        });

        // Correction pill highlight
        const curCor = scoreToEdit.correction || '已完成訂正';
        elements.parentCorrectionPickerGroup?.querySelectorAll('.btn-correction-choice').forEach(btn => {
          btn.className = "btn-correction-choice flex-1 py-1.5 px-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-100 transition-all text-center cursor-pointer";
          const val = btn.getAttribute('data-val');
          if (val === curCor) {
            if (val === '全對免訂正') btn.className = "btn-correction-choice flex-1 py-1.5 px-2 rounded-xl border border-emerald-600 bg-emerald-600 text-white font-black text-xs shadow-xs transition-all text-center cursor-pointer";
            else if (val === '已完成訂正') btn.className = "btn-correction-choice flex-1 py-1.5 px-2 rounded-xl border border-teal-600 bg-teal-600 text-white font-black text-xs shadow-xs transition-all text-center cursor-pointer";
            else btn.className = "btn-correction-choice flex-1 py-1.5 px-2 rounded-xl border border-rose-600 bg-rose-600 text-white font-black text-xs shadow-xs transition-all text-center cursor-pointer";
          }
        });
      } else {
        if (elements.parentScoreModalTitle) {
          elements.parentScoreModalTitle.innerHTML = '<i class="fa-solid fa-pen-to-square text-emerald-600"></i> 登記小考成績';
        }
        if (elements.parentEditScoreId) elements.parentEditScoreId.value = '';
        if (elements.parentInputScoreSubject) elements.parentInputScoreSubject.value = '國語文';
        if (elements.parentInputScoreName) elements.parentInputScoreName.value = '';
        if (elements.parentInputScoreVal) elements.parentInputScoreVal.value = '';
        if (elements.parentInputScoreDate) elements.parentInputScoreDate.value = getTodayDateString();
        if (elements.parentInputScoreRemark) elements.parentInputScoreRemark.value = '';

        elements.parentSubjectPickerGroup?.querySelectorAll('.btn-parent-subject-pill').forEach(btn => {
          if (btn.getAttribute('data-sub') === '國語文') {
            btn.className = "btn-parent-subject-pill parent-sub-btn px-2.5 py-1.5 rounded-xl border border-emerald-600 bg-emerald-600 text-white font-bold text-xs shadow-xs transition-all text-center cursor-pointer";
          } else {
            btn.className = "btn-parent-subject-pill parent-sub-btn px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:border-emerald-500 hover:bg-emerald-50 bg-white transition-all text-center cursor-pointer";
          }
        });

        elements.parentCorrectionPickerGroup?.querySelectorAll('.btn-correction-choice').forEach(btn => {
          const val = btn.getAttribute('data-val');
          if (val === '已完成訂正') {
            btn.className = "btn-correction-choice flex-1 py-1.5 px-2 rounded-xl border border-teal-600 bg-teal-600 text-white font-black text-xs shadow-xs transition-all text-center cursor-pointer";
          } else {
            btn.className = "btn-correction-choice flex-1 py-1.5 px-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-100 transition-all text-center cursor-pointer";
          }
        });
      }

      elements.parentScoreModal.classList.remove('hidden');
      setTimeout(() => elements.parentInputScoreVal?.focus(), 100);
    }

    function closeParentScoreModal() {
      elements.parentScoreModal?.classList.add('hidden');
    }

    async function saveParentScoreFromModal() {
      const seat = state.studentSeat;
      if (!seat) {
        showToast("請先選擇座號！", "warning");
        return;
      }
      const scoreVal = elements.parentInputScoreVal?.value.trim();
      if (scoreVal === '' || isNaN(scoreVal) || Number(scoreVal) < 0 || Number(scoreVal) > 100) {
        showToast("請輸入 0 ~ 100 的有效小考成績！", "error");
        return;
      }
      const scoreNum = parseFloat(scoreVal);
      const sub = elements.parentInputScoreSubject?.value.trim() || '國語文';
      const name = elements.parentInputScoreName?.value.trim() || `${sub} 小考`;
      const dateVal = elements.parentInputScoreDate?.value || getTodayDateString();
      const remarkVal = elements.parentInputScoreRemark?.value.trim() || '';
      
      const activeCorBtn = elements.parentCorrectionPickerGroup?.querySelector('.btn-correction-choice.bg-emerald-600, .btn-correction-choice.bg-teal-600, .btn-correction-choice.bg-rose-600');
      const corVal = activeCorBtn ? activeCorBtn.getAttribute('data-val') : '已完成訂正';

      const now = new Date();
      const lastModifiedStr = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      const editId = elements.parentEditScoreId?.value;

      state.cloudStudentData = state.cloudStudentData || { scores: [], moodJournal: {} };
      if (!Array.isArray(state.cloudStudentData.scores)) {
        state.cloudStudentData.scores = [];
      }

      if (editId) {
        const target = state.cloudStudentData.scores.find(s => s.id === editId || s.examId === editId);
        if (target) {
          const orig = (target.originalScore !== null && target.originalScore !== undefined) ? target.originalScore : target.score;
          target.subject = sub;
          target.name = name;
          target.score = scoreNum;
          target.date = dateVal;
          target.correction = corVal;
          target.remark = remarkVal;
          target.originalScore = orig;
          target.lastModified = lastModifiedStr;
        } else {
          const curClass = state.classData;
          const exam = curClass?.exams?.find(e => e.id === editId);
          if (exam) {
            exam.submissions = exam.submissions || {};
            const seatStr = String(seat);
            const oldSub = exam.submissions[seatStr];
            const orig = (oldSub && oldSub.originalScore !== null && oldSub.originalScore !== undefined)
              ? oldSub.originalScore
              : (oldSub ? oldSub.score : scoreNum);
            exam.submissions[seatStr] = {
              ...oldSub,
              score: scoreNum,
              correction: corVal,
              remark: remarkVal,
              originalScore: orig,
              lastModified: lastModifiedStr,
              updatedAt: now.toISOString()
            };
            try {
              if (state.accessCode) {
                const parentDocRef = doc(db, 'artifacts', APP_COLLECTION_ID, 'public', 'data', 'parentClasses', state.accessCode);
                await setDoc(parentDocRef, {
                  exams: curClass.exams,
                  updatedAt: now.toISOString()
                }, { merge: true });
              }
            } catch (e) {}
          }
          state.cloudStudentData.scores.unshift({
            id: editId,
            examId: editId,
            subject: sub,
            name: name,
            score: scoreNum,
            date: dateVal,
            correction: corVal,
            remark: remarkVal,
            originalScore: null,
            lastModified: lastModifiedStr,
            isMakeup: false
          });
        }
      } else {
        const newId = 'score_' + Date.now();
        state.cloudStudentData.scores.unshift({
          id: newId,
          examId: newId,
          subject: sub,
          name: name,
          score: scoreNum,
          date: dateVal,
          correction: corVal,
          remark: remarkVal,
          originalScore: null,
          lastModified: lastModifiedStr,
          isMakeup: false
        });
      }

      // Ensure the registered score's subject is visible in current filter
      if (state.selectedSubjectsFilter && state.selectedSubjectsFilter.length > 0 && state.selectedSubjectsFilter.length < PARENT_ALL_21_SUBJECTS.length) {
        if (!state.selectedSubjectsFilter.includes(sub)) {
          state.selectedSubjectsFilter.push(sub);
          updateParentMultiSubjectBtnLabel();
        }
      }
      if (elements.parentFilterScoreSubject && elements.parentFilterScoreSubject.value !== "all" && elements.parentFilterScoreSubject.value !== sub) {
        elements.parentFilterScoreSubject.value = "all";
      }

      await syncParentScoresToCloud();
      renderParentScoresSection();
      renderDailyBulletin(state.classData);
      closeParentScoreModal();
      showToast("成績已儲存並即時同步至雲端！", "success");
    }

    async function deleteParentScore(scoreId) {
      showInAppConfirm({
        title: "刪除小考成績",
        message: "確定要刪除這筆小考成績紀錄嗎？此動作將清除該筆小考成績與分析紀錄。",
        confirmText: "確定刪除",
        isDanger: true,
        onConfirm: async () => {
          const seat = state.studentSeat;
          if (!seat) return;

          if (state.cloudStudentData && Array.isArray(state.cloudStudentData.scores)) {
            state.cloudStudentData.scores = state.cloudStudentData.scores.filter(s => s.id !== scoreId && s.examId !== scoreId);
          }

          const curClass = state.classData;
          const exam = curClass?.exams?.find(e => e.id === scoreId);
          if (exam && exam.submissions) {
            delete exam.submissions[String(seat)];
            try {
              if (state.accessCode) {
                const parentDocRef = doc(db, 'artifacts', APP_COLLECTION_ID, 'public', 'data', 'parentClasses', state.accessCode);
                await setDoc(parentDocRef, {
                  exams: curClass.exams,
                  updatedAt: new Date().toISOString()
                }, { merge: true });
              }
            } catch (e) {}
          }

          await syncParentScoresToCloud();
          renderParentScoresSection();
          renderDailyBulletin(state.classData);
          showToast("小考成績已刪除並同步！", "info");
        }
      });
    }

    async function syncParentScoresToCloud() {
      if (!state.accessCode || !state.studentSeat) return;
      try {
        const studentDocId = `studentScores_${state.accessCode}_seat${state.studentSeat}`;
        const profileDocRef = doc(db, 'artifacts', APP_COLLECTION_ID, 'public', 'data', 'userProfiles', studentDocId);
        await setDoc(profileDocRef, {
          classCode: state.accessCode,
          seat: state.studentSeat,
          scores: state.cloudStudentData?.scores || [],
          moodJournal: state.cloudStudentData?.moodJournal || {},
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        console.warn("syncParentScoresToCloud error:", err);
      }
    }

    // 初始化【家長端科目複選】彈窗內容
    function initParentMultiSubjectFilter() {
      if (!elements.parentMultiSubjectCheckboxesContainer) return;
      if (!state.selectedSubjectsFilter || state.selectedSubjectsFilter.length === 0) {
        state.selectedSubjectsFilter = [...PARENT_ALL_21_SUBJECTS];
      }

      elements.parentMultiSubjectCheckboxesContainer.innerHTML = PARENT_DOMAINS_CONFIG.map(domain => {
        return `
          <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-2">
            <div class="flex items-center justify-between text-xs font-extrabold text-slate-800">
              <div class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full ${domain.color}"></span>
                <span>${domain.name}</span>
              </div>
              <button type="button" class="btn-parent-domain-select-all text-[11px] text-teal-600 hover:underline cursor-pointer" data-domain="${domain.id}">
                該領域全選
              </button>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              ${domain.subjects.map(sub => {
                const isChecked = state.selectedSubjectsFilter.includes(sub);
                return `
                  <label class="flex items-center gap-1.5 p-1.5 rounded-xl hover:bg-white cursor-pointer text-xs font-bold text-slate-700 select-none">
                    <input type="checkbox" value="${escapeHtml(sub)}" class="chk-parent-multi-sub accent-teal-600 w-4 h-4 rounded" ${isChecked ? 'checked' : ''}>
                    <span class="truncate">${escapeHtml(sub)}</span>
                  </label>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }).join('');

      elements.parentMultiSubjectCheckboxesContainer.querySelectorAll('.btn-parent-domain-select-all').forEach(btn => {
        btn.addEventListener('click', () => {
          const domId = btn.getAttribute('data-domain');
          const dom = PARENT_DOMAINS_CONFIG.find(d => d.id === domId);
          if (dom) {
            const container = btn.closest('.p-3');
            container.querySelectorAll('.chk-parent-multi-sub').forEach(chk => chk.checked = true);
            updateParentMultiSubBadge();
          }
        });
      });

      elements.parentMultiSubjectCheckboxesContainer.querySelectorAll('.chk-parent-multi-sub').forEach(chk => {
        chk.addEventListener('change', updateParentMultiSubBadge);
      });

      updateParentMultiSubBadge();
    }

    function updateParentMultiSubBadge() {
      if (!elements.parentMultiSubjectCheckboxesContainer) return;
      const checkedCount = elements.parentMultiSubjectCheckboxesContainer.querySelectorAll('.chk-parent-multi-sub:checked').length;
      if (elements.parentMultiSubSelectedCountBadge) {
        elements.parentMultiSubSelectedCountBadge.textContent = `已選 ${checkedCount} / 21 科`;
      }
    }

    function updateParentMultiSubjectBtnLabel() {
      if (!elements.parentMultiSubjectBtnLabel) return;
      const sel = state.selectedSubjectsFilter || [];
      if (sel.length === 0 || sel.length === PARENT_ALL_21_SUBJECTS.length) {
        elements.parentMultiSubjectBtnLabel.textContent = "篩選科目 (全部 21 科)";
      } else {
        elements.parentMultiSubjectBtnLabel.textContent = `篩選科目 (已選 ${sel.length} 科)`;
      }
    }

    function openParentMultiSubjectModal() {
      initParentMultiSubjectFilter();
      elements.modalParentMultiSubjectFilter?.classList.remove('hidden');
    }

    function closeParentMultiSubjectModal() {
      elements.modalParentMultiSubjectFilter?.classList.add('hidden');
    }

    function switchParentTab(tabId) {
      if (tabId === "scores" && !ENABLE_SCORES_FEATURE) {
        tabId = "hw";
      }
      const tabs = [
        { id: "hw", btn: elements.parentTabHwBtn, panel: elements.panelParentHw },
        { id: "scores", btn: elements.parentTabScoresBtn, panel: elements.panelParentScores },
        { id: "class", btn: elements.parentTabClassBtn, panel: elements.panelParentClass },
        { id: "contact", btn: elements.parentTabContactBtn, panel: elements.panelParentContact }
      ];

      tabs.forEach(t => {
        if (t.id === "scores" && !ENABLE_SCORES_FEATURE) {
          t.panel?.classList.add("hidden");
          t.btn?.classList.add("hidden");
          return;
        }
        if (t.id === tabId) {
          t.panel?.classList.remove("hidden");
          if (t.btn) {
            t.btn.className = "flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold transition-all bg-white text-indigo-700 shadow-sm flex items-center justify-center gap-1.5 cursor-pointer";
          }
        } else {
          t.panel?.classList.add("hidden");
          if (t.btn) {
            t.btn.className = "flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold transition-all text-slate-600 hover:text-slate-900 flex items-center justify-center gap-1.5 cursor-pointer";
          }
        }
      });

      if (tabId === "scores") {
        renderParentScoresSection();
      } else if (tabId === "contact") {
        renderContactTabMood();
      }
    }

    function renderContactTabMood() {
      const cloudData = state.cloudStudentData;
      const todayStr = getTodayDateString();
      const todayMood = cloudData?.moodJournal ? cloudData.moodJournal[todayStr] : null;
      if (todayMood && (todayMood.mood || todayMood.text) && isSeatUnlocked(state.studentSeat)) {
        elements.contactTabMoodDisplayBox?.classList.remove("hidden");
        if (elements.contactTabMoodEmoji) elements.contactTabMoodEmoji.innerHTML = getMoodBadgeHtml(todayMood.mood);
        if (elements.contactTabMoodText) elements.contactTabMoodText.textContent = todayMood.text || "（今日無文字日記）";
      } else {
        elements.contactTabMoodDisplayBox?.classList.add("hidden");
      }
    }

    async function verifyAndUnlockPin(enteredPin, isFromScoresPanel = false) {
      const seat = state.studentSeat;
      if (!seat || !enteredPin) return;

      const submitBtn = isFromScoresPanel ? elements.btnSubmitScoresPin : elements.btnSubmitPin;
      const submitIcon = isFromScoresPanel ? elements.scoresPinSubmitIcon : elements.pinSubmitIcon;
      const submitText = isFromScoresPanel ? elements.scoresPinSubmitText : elements.pinSubmitText;
      const errorBox = isFromScoresPanel ? elements.scoresPinErrorBox : elements.pinErrorBox;
      const errorMsg = isFromScoresPanel ? elements.scoresPinErrorMsg : elements.pinErrorMsg;
      const inputEl = isFromScoresPanel ? elements.inputScoresPin : elements.inputParentPin;

      if (submitBtn) submitBtn.disabled = true;
      if (submitText) submitText.textContent = "驗證中...";
      if (submitIcon) submitIcon.className = "fa-solid fa-spinner fa-spin";
      if (errorBox) errorBox.classList.add("hidden");

      try {
        const cleanEntered = enteredPin.trim().toUpperCase();
        const teacherPin = getTeacherConfiguredPin(seat);

        if (!teacherPin) {
          if (errorBox) errorBox.classList.remove("hidden");
          if (errorMsg) errorMsg.textContent = "請確認學生座號與班級代碼！";
          return;
        }

        const isMatch = (cleanEntered === teacherPin);

        if (isMatch) {
          unlockSeat(seat, cleanEntered);
          showToast(`驗證成功！已解鎖 ${seat} 號學生專區與成績分析`, "success");
          renderStudentPersonalSection(state.classData);
          renderParentScoresSection();
        } else {
          if (errorBox) errorBox.classList.remove("hidden");
          if (errorMsg) errorMsg.textContent = "PIN 碼不正確！預設為【班級代碼 + 座號】（家長與學生共用相同密碼）。若有疑問請向導師確認。";
          if (inputEl) {
            inputEl.focus();
            inputEl.select();
          }
        }
      } catch (err) {
        console.error("PIN verification error:", err);
        const cleanEntered = enteredPin.trim().toUpperCase();
        const teacherPin = getTeacherConfiguredPin(seat);
        if (teacherPin && cleanEntered === teacherPin) {
          unlockSeat(seat, cleanEntered);
          showToast(`驗證成功！已解鎖 ${seat} 號學生專區與成績分析`, "success");
          renderStudentPersonalSection(state.classData);
          renderParentScoresSection();
        } else {
          if (errorBox) errorBox.classList.remove("hidden");
          if (errorMsg) errorMsg.textContent = "驗證失敗，請檢查網路連線或向導師確認 PIN 碼！";
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (submitText) submitText.textContent = isFromScoresPanel ? "解鎖並查閱成績分析" : "驗證並解鎖";
        if (submitIcon) submitIcon.className = "fa-solid fa-unlock-keyhole";
      }
    }

    // ==========================================
    // MODULE 2: 7-DAY CONTACT BOOK RENDER
    // ==========================================

    function renderContactBookSection(data) {
      const contactBook = data.contactBook || {};
      const dates = [];
      const today = new Date();

      // Generate last 7 days (including today) in chronological order:
      // Earliest day on the left -> latest day (today) on the far right
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        
        dates.push({
          dateStr: dateStr,
          dayOfWeek: getDayOfWeekName(d),
          shortDate: `${d.getMonth() + 1}/${d.getDate()}`,
          isToday: i === 0,
          hasEntries: Boolean(contactBook[dateStr] && contactBook[dateStr].length > 0)
        });
      }

      const effectiveInfo = getEffectiveBulletinDate(data);

      // Default selected date if not set (若為週末無作業，預設呈現週五)
      if (!state.selectedContactDate || !dates.some(d => d.dateStr === state.selectedContactDate)) {
        if (effectiveInfo.isFridayFallback && dates.some(d => d.dateStr === effectiveInfo.effectiveDate)) {
          state.selectedContactDate = effectiveInfo.effectiveDate;
        } else {
          state.selectedContactDate = dates[dates.length - 1].dateStr;
        }
      }

      // 開啟或檢視該日聯絡簿後，立即標記為已看過
      markContactDateAsViewed(state.selectedContactDate);

      // Render 7-day slider buttons
      elements.contactDateSlider.innerHTML = dates.map(d => {
        const isSelected = d.dateStr === state.selectedContactDate;
        const isViewed = isContactDateViewed(d.dateStr);
        const showDot = d.hasEntries && !isViewed;
        const activeClass = isSelected
          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20 border-indigo-600'
          : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-200';

        return `
          <button
            type="button"
            data-date="${d.dateStr}"
            class="contact-date-btn touch-target flex-1 min-w-[72px] sm:min-w-[84px] py-2.5 px-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-center relative cursor-pointer ${activeClass}"
          >
            <span class="text-[10px] sm:text-xs font-semibold ${isSelected ? 'text-indigo-100' : 'text-slate-400'}">
              ${d.isToday ? '今天' : d.dayOfWeek}
            </span>
            <span class="text-xs sm:text-sm font-extrabold mt-0.5">
              ${d.shortDate}
            </span>
            ${showDot ? `
              <span class="w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-emerald-300' : 'bg-emerald-500'} absolute top-2 right-2"></span>
            ` : ''}
          </button>
        `;
      }).join('');

      // Add click listener to date buttons
      elements.contactDateSlider.querySelectorAll('.contact-date-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const clickedDate = btn.getAttribute('data-date');
          state.selectedContactDate = clickedDate;
          markContactDateAsViewed(clickedDate);
          renderContactBookSection(data);
        });
      });

      // Render Active Contact Book Content
      const activeDateStr = state.selectedContactDate;
      elements.selectedDateLabel.textContent = `${activeDateStr} (${dates.find(d => d.dateStr === activeDateStr)?.dayOfWeek || ''})`;

      const entries = contactBook[activeDateStr] || [];

      if (entries.length === 0) {
        elements.contactBookContainer.innerHTML = `
          <div class="text-center py-6 text-slate-400">
            <div class="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
              <i class="fa-solid fa-note-sticky text-xl"></i>
            </div>
            <p class="font-bold text-slate-600 text-sm">本日無聯絡簿登記事項</p>
            <p class="text-xs text-slate-400 mt-0.5">老師可能尚未填寫，或今日無特別交代事項</p>
          </div>
        `;
      } else {
        elements.contactBookContainer.innerHTML = `
          <ol class="space-y-3 list-none">
            ${entries.map((item, idx) => `
              <li class="flex items-start gap-3 p-3 rounded-xl bg-white border border-slate-200/70 shadow-2xs">
                <span class="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-700 font-extrabold text-xs flex items-center justify-center flex-shrink-0 mt-0.5 border border-indigo-100">
                  ${idx + 1}
                </span>
                <span class="text-sm font-medium text-slate-800 leading-relaxed break-words flex-1">
                  ${escapeHtml(item)}
                </span>
              </li>
            `).join('')}
          </ol>
        `;
      }
    }

    // ==========================================
    // MODULE 3: CLASS HOMEWORK OVERVIEW RENDER
    // ==========================================

    function renderClassHomeworkOverview(data) {
      const homeworks = data.homeworks || [];
      elements.classHwTotalCount.textContent = `共 ${homeworks.length} 項作業`;

      if (homeworks.length === 0) {
        elements.classHomeworkList.innerHTML = `
          <div class="text-center py-8 text-slate-400 text-sm">
            <i class="fa-solid fa-list-check text-3xl mb-2 text-slate-300 block"></i>
            目前尚無登記作業項目
          </div>
        `;
        return;
      }

      const totalSeats = data.lastMaxSeat || 30;
      const missingSeats = parseMissingSeats(data.lastMissingSeats);
      const effectiveStudentCount = totalSeats - missingSeats.size;

      elements.classHomeworkList.innerHTML = homeworks.map(hw => {
        const typeObj = (data.homeworkTypes || []).find(t => t.id === hw.typeId);
        const typeName = typeObj ? typeObj.name : "作業";

        // Count completed students
        let completedCount = 0;
        (hw.students || []).forEach(s => {
          if (missingSeats.has(s.seat)) return;
          const meta = getStatusMeta(hw.typeId, s.status, data);
          if (meta.isCompleted) completedCount++;
        });

        const denom = effectiveStudentCount > 0 ? effectiveStudentCount : (hw.studentCount || 30);
        const percentage = Math.min(100, Math.round((completedCount / denom) * 100)) || 0;

        return `
          <div
            data-hw-id="${hw.id}"
            class="class-hw-card group p-4 sm:p-5 rounded-2xl bg-slate-50/70 hover:bg-white border border-slate-200/80 hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer"
          >
            <div class="flex items-start justify-between gap-3 mb-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                    ${escapeHtml(typeName)}
                  </span>
                  <span class="text-xs text-slate-400">
                    ${formatRelativeTime(hw.createdAt)}
                  </span>
                </div>
                <h3 class="text-base font-extrabold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                  ${escapeHtml(hw.name)}
                </h3>
              </div>
              <div class="text-right flex-shrink-0">
                <div class="text-sm font-black text-slate-800">
                  <span class="text-emerald-600">${completedCount}</span> / ${denom} 人
                </div>
                <div class="text-xs font-semibold text-slate-400">完成率 ${percentage}%</div>
              </div>
            </div>

            <!-- Progress Bar -->
            <div class="w-full bg-slate-200/80 rounded-full h-2.5 overflow-hidden">
              <div
                class="bg-gradient-to-r from-indigo-500 to-emerald-500 h-2.5 rounded-full transition-all duration-500"
                style="width: ${percentage}%"
              ></div>
            </div>

            <!-- Bottom Hint -->
            <div class="mt-3 flex items-center justify-between text-xs text-slate-400">
              <span class="flex items-center gap-1 group-hover:text-indigo-600 transition-colors">
                <i class="fa-solid fa-table-cells text-indigo-500"></i>
                點擊檢視全班座號點收矩陣
              </span>
              <i class="fa-solid fa-chevron-right text-[10px] text-slate-300 group-hover:translate-x-1 group-hover:text-indigo-500 transition-all"></i>
            </div>
          </div>
        `;
      }).join('');

      // Add click listeners to HW Cards to open matrix modal
      elements.classHomeworkList.querySelectorAll('.class-hw-card').forEach(card => {
        card.addEventListener('click', () => {
          const hwId = card.getAttribute('data-hw-id');
          openMatrixModal(hwId);
        });
      });
    }

    // ==========================================
    // MODAL 2: CLASS SEAT MATRIX POPUP
    // ==========================================

    function openMatrixModal(hwId) {
      if (!state.classData) return;
      const hw = (state.classData.homeworks || []).find(h => h.id === hwId);
      if (!hw) return;

      const typeObj = (state.classData.homeworkTypes || []).find(t => t.id === hw.typeId);
      const statuses = typeObj ? typeObj.statuses : [];
      const missingSeats = parseMissingSeats(state.classData.lastMissingSeats);
      const maxSeat = state.classData.lastMaxSeat || 30;

      // Header
      elements.matrixHwName.textContent = hw.name;
      
      // Calculate completion
      let completedCount = 0;
      let effectiveTotal = 0;
      for (let i = 1; i <= maxSeat; i++) {
        if (!missingSeats.has(i)) {
          effectiveTotal++;
          const rec = (hw.students || []).find(s => s.seat === i);
          const meta = getStatusMeta(hw.typeId, rec ? rec.status : 'not-submitted', state.classData);
          if (meta.isCompleted) completedCount++;
        }
      }
      elements.matrixHwStats.textContent = `全班完成度：${completedCount} / ${effectiveTotal} 人 (${Math.round((completedCount / effectiveTotal) * 100 || 0)}%)`;

      // Legend
      elements.matrixLegendContainer.innerHTML = statuses.map(s => `
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-full ${s.color || 'bg-slate-300'} border border-slate-300/40"></span>
          <span class="font-medium text-slate-700">${escapeHtml(s.text)}</span>
        </div>
      `).join('') + `
        <div class="flex items-center gap-1.5 text-slate-400">
          <span class="w-3 h-3 rounded-full bg-slate-100 border border-slate-200"></span>
          <span>缺號</span>
        </div>
      `;

      // Matrix Grid
      elements.matrixSeatsGrid.innerHTML = '';
      for (let seatNum = 1; seatNum <= maxSeat; seatNum++) {
        const isMissing = missingSeats.has(seatNum);
        const seatBox = document.createElement('div');
        const isMyStudent = state.studentSeat === seatNum;

        if (isMissing) {
          seatBox.className = "p-2 rounded-xl bg-slate-100/60 border border-dashed border-slate-200 text-center opacity-40";
          seatBox.innerHTML = `
            <div class="text-[11px] font-bold text-slate-400">${seatNum}</div>
            <div class="text-[9px] text-slate-400">缺號</div>
          `;
        } else {
          const rec = (hw.students || []).find(s => s.seat === seatNum);
          const meta = getStatusMeta(hw.typeId, rec ? rec.status : 'not-submitted', state.classData);
          
          let colorClass = "bg-slate-100 text-slate-700 border-slate-200";
          if (meta.color && meta.color.startsWith('bg-')) {
            colorClass = `${meta.color} ${meta.textColor || 'text-white'}`;
          }

          const myBadge = isMyStudent ? 'ring-2 ring-indigo-600 ring-offset-2 font-black shadow-md' : '';

          seatBox.className = `p-2 rounded-xl ${colorClass} border text-center transition-all ${myBadge} flex flex-col items-center justify-center min-h-[56px]`;
          seatBox.innerHTML = `
            <div class="text-xs font-black inline-flex items-center justify-center gap-1"><span>${seatNum} 號</span>${isMyStudent ? '<i class="fa-solid fa-star text-amber-300"></i>' : ''}</div>
            <div class="text-[10px] font-bold truncate max-w-full mt-0.5">${escapeHtml(meta.text)}</div>
          `;
        }

        elements.matrixSeatsGrid.appendChild(seatBox);
      }

      // Open modal
      elements.matrixModal.classList.remove('hidden');
    }

    function closeMatrixModal() {
      elements.matrixModal.classList.add('hidden');
    }

    // ==========================================
    // MODAL 1: SETTINGS MODAL HANDLERS
    // ==========================================

    function openSettingsModal() {
      elements.settingsModal.classList.remove('hidden');
    }

    function closeSettingsModal() {
      elements.settingsModal.classList.add('hidden');
    }

    // ==========================================
    // EVENT LISTENERS & UI WIRING
    // ==========================================

    function setupEventListeners() {
      // Login Form Submit
      elements.accessCodeForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const code = elements.inputAccessCode.value.trim();
        if (code) {
          connectToClass(code);
        }
      });

      // Quick Seat change from banner or navbar
      elements.navSeatBtn.addEventListener('click', openSettingsModal);
      elements.changeSeatQuickBtn.addEventListener('click', openSettingsModal);
      elements.openSettingsBtn.addEventListener('click', openSettingsModal);
      elements.closeSettingsModalBtn.addEventListener('click', closeSettingsModal);

      // Save Seat in Settings Modal
      elements.saveSeatBtn.addEventListener('click', () => {
        const val = elements.modalSeatSelect.value;
        if (val) {
          setStudentSeat(val);
          closeSettingsModal();
        } else {
          showToast("請先選取座號", "error");
        }
      });

      // Clear Seat in Settings Modal
      elements.clearSeatBtn.addEventListener('click', () => {
        setStudentSeat(null);
        elements.modalSeatSelect.value = "";
        closeSettingsModal();
      });

      // Toggle PIN visibility
      if (elements.btnTogglePinVisibility) {
        elements.btnTogglePinVisibility.addEventListener('click', () => {
          const isPass = elements.inputParentPin.type === "password";
          elements.inputParentPin.type = isPass ? "text" : "password";
          elements.iconPinEye.className = isPass ? "fa-regular fa-eye-slash text-sm" : "fa-regular fa-eye text-sm";
        });
      }

      // Cancel Unlock & Pick Another Seat
      if (elements.btnCancelUnlockSeat) {
        elements.btnCancelUnlockSeat.addEventListener('click', () => {
          setStudentSeat(null);
          openSettingsModal();
        });
      }

      // Parent Navigation Tabs
      elements.parentTabHwBtn?.addEventListener('click', () => switchParentTab('hw'));
      elements.parentTabScoresBtn?.addEventListener('click', () => switchParentTab('scores'));
      elements.parentTabClassBtn?.addEventListener('click', () => switchParentTab('class'));
      elements.parentTabContactBtn?.addEventListener('click', () => switchParentTab('contact'));

      // Quick jump to scores tab button
      elements.quickJumpScoresTabBtn?.addEventListener('click', () => switchParentTab('scores'));

      // Daily Bulletin item jumps
      elements.bulletinItemHw?.addEventListener('click', () => switchParentTab('hw'));
      elements.bulletinItemScores?.addEventListener('click', () => switchParentTab('scores'));
      elements.bulletinItemContact?.addEventListener('click', () => switchParentTab('contact'));
      elements.bulletinItemMood?.addEventListener('click', () => switchParentTab('contact'));
      elements.btnBulletinBindSeat?.addEventListener('click', openSettingsModal);

      // Parent Add/Edit Score Modal
      elements.btnParentOpenAddScore?.addEventListener('click', () => openParentScoreModal());
      elements.btnParentCloseScoreModal?.addEventListener('click', closeParentScoreModal);
      elements.btnParentCancelScoreModal?.addEventListener('click', closeParentScoreModal);
      elements.btnParentSaveScoreModal?.addEventListener('click', saveParentScoreFromModal);

      // Subject pills inside parent score modal
      elements.parentSubjectPickerGroup?.querySelectorAll('.btn-parent-subject-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          const sub = btn.getAttribute('data-sub');
          if (elements.parentInputScoreSubject) elements.parentInputScoreSubject.value = sub;
          elements.parentSubjectPickerGroup.querySelectorAll('.btn-parent-subject-pill').forEach(b => {
            b.className = "btn-parent-subject-pill px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer";
          });
          btn.className = "btn-parent-subject-pill px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 text-white shadow-xs transition-colors cursor-pointer";
        });
      });

      // Correction pills inside parent score modal
      elements.parentCorrectionPickerGroup?.querySelectorAll('.btn-correction-choice').forEach(btn => {
        btn.addEventListener('click', () => {
          elements.parentCorrectionPickerGroup.querySelectorAll('.btn-correction-choice').forEach(b => {
            b.className = "btn-correction-choice flex-1 py-1.5 px-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-100 transition-all text-center cursor-pointer";
          });
          const val = btn.getAttribute('data-val');
          if (val === '全對免訂正') {
            btn.className = "btn-correction-choice flex-1 py-1.5 px-2 rounded-xl border border-emerald-600 bg-emerald-600 text-white font-black text-xs shadow-xs transition-all text-center cursor-pointer";
          } else if (val === '已完成訂正') {
            btn.className = "btn-correction-choice flex-1 py-1.5 px-2 rounded-xl border border-teal-600 bg-teal-600 text-white font-black text-xs shadow-xs transition-all text-center cursor-pointer";
          } else {
            btn.className = "btn-correction-choice flex-1 py-1.5 px-2 rounded-xl border border-rose-600 bg-rose-600 text-white font-black text-xs shadow-xs transition-all text-center cursor-pointer";
          }
        });
      });

      // Quick pick seat buttons in unbound view
      document.querySelectorAll('.btn-goto-pick-seat').forEach(btn => {
        btn.addEventListener('click', openSettingsModal);
      });

      // Relock Seat Button (HW & Scores views)
      const handleRelock = () => {
        if (state.studentSeat) {
          relockSeat(state.studentSeat);
          showToast(`已鎖定 ${state.studentSeat} 號學生成績分析（作業保持可查）`, "info");
          renderStudentPersonalSection(state.classData);
          renderParentScoresSection();
        }
      };
      elements.relockSeatBtn?.addEventListener('click', handleRelock);
      elements.scoresViewRelockBtn?.addEventListener('click', handleRelock);

      // PIN Form Submit (HW Locked View)
      if (elements.parentPinForm) {
        elements.parentPinForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const enteredPin = elements.inputParentPin.value.trim();
          if (enteredPin) verifyAndUnlockPin(enteredPin, false);
        });
      }

      // PIN Form Submit (Scores Locked View)
      if (elements.parentScoresPinForm) {
        elements.parentScoresPinForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const enteredPin = elements.inputScoresPin.value.trim();
          if (enteredPin) verifyAndUnlockPin(enteredPin, true);
        });
      }

      // Toggle PIN visibility (Scores view)
      if (elements.btnToggleScoresPin) {
        elements.btnToggleScoresPin.addEventListener('click', () => {
          const isPass = elements.inputScoresPin.type === "password";
          elements.inputScoresPin.type = isPass ? "text" : "password";
          elements.iconScoresPinEye.className = isPass ? "fa-regular fa-eye-slash text-sm" : "fa-regular fa-eye text-sm";
        });
      }

      // Domain analytics filter in Scores panel
      if (elements.parentDomainAnalyticsFilter) {
        elements.parentDomainAnalyticsFilter.querySelectorAll('.parent-domain-filter-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const domain = btn.getAttribute('data-domain');
            parentActiveDomainFilter = domain;
            elements.parentDomainAnalyticsFilter.querySelectorAll('.parent-domain-filter-btn').forEach(b => {
              if (b === btn) {
                b.className = "parent-domain-filter-btn px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-extrabold cursor-pointer";
              } else {
                b.className = "parent-domain-filter-btn px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer";
              }
            });
            const cloudData = state.cloudStudentData;
            renderParentSubjectAnalytics((cloudData && Array.isArray(cloudData.scores)) ? cloudData.scores : []);
          });
        });
      }

      // Multi-Subject Filter in Scores panel
      elements.btnParentOpenMultiSubject?.addEventListener('click', openParentMultiSubjectModal);
      elements.btnCloseParentMultiSubjectModal?.addEventListener('click', closeParentMultiSubjectModal);
      elements.btnCancelParentMultiSubject?.addEventListener('click', closeParentMultiSubjectModal);
      elements.btnApplyParentMultiSubject?.addEventListener('click', () => {
        const chks = elements.parentMultiSubjectCheckboxesContainer.querySelectorAll('.chk-parent-multi-sub:checked');
        state.selectedSubjectsFilter = Array.from(chks).map(c => c.value);
        updateParentMultiSubjectBtnLabel();
        closeParentMultiSubjectModal();
        renderParentScoresSection();
        showToast(`已套用科目篩選（已選 ${state.selectedSubjectsFilter.length} 科）`, "success");
      });
      elements.btnParentSubSelectAll?.addEventListener('click', () => {
        elements.parentMultiSubjectCheckboxesContainer.querySelectorAll('.chk-parent-multi-sub').forEach(c => c.checked = true);
        updateParentMultiSubBadge();
      });
      elements.btnParentSubClearAll?.addEventListener('click', () => {
        elements.parentMultiSubjectCheckboxesContainer.querySelectorAll('.chk-parent-multi-sub').forEach(c => c.checked = false);
        updateParentMultiSubBadge();
      });

      // Bracket Modal Close buttons
      elements.btnCloseParentBracketModal?.addEventListener('click', closeParentScoreBracketModal);
      elements.btnDoneParentBracketModal?.addEventListener('click', closeParentScoreBracketModal);

      // Historical query filters in Scores panel
      elements.parentFilterScoreRange?.addEventListener('change', () => {
        const val = elements.parentFilterScoreRange.value;
        if (val === 'custom') {
          elements.parentFilterCustomDateContainer?.classList.remove('hidden');
        } else {
          elements.parentFilterCustomDateContainer?.classList.add('hidden');
        }
        renderParentScoresSection();
      });
      elements.parentFilterDateStart?.addEventListener('change', renderParentScoresSection);
      elements.parentFilterDateEnd?.addEventListener('change', renderParentScoresSection);
      elements.parentFilterScoreSubject?.addEventListener('change', renderParentDetailedScoresList);
      elements.parentFilterScoreCorrection?.addEventListener('change', renderParentDetailedScoresList);
      elements.parentSortScoreOrder?.addEventListener('change', renderParentDetailedScoresList);

      // Switch Class / Logout
      const handleSwitchClass = () => {
        if (unsubscribeStudentScores) {
          unsubscribeStudentScores();
          unsubscribeStudentScores = null;
        }
        if (state.unsubscribeSnapshot) {
          state.unsubscribeSnapshot();
          state.unsubscribeSnapshot = null;
        }
        if (state.accessCode) {
          const seatKey = getParentSeatStorageKey(state.accessCode);
          if (seatKey) localStorage.removeItem(seatKey);
        }
        localStorage.removeItem(LS_ACCESS_CODE_KEY);
        state.accessCode = "";
        state.studentSeat = null;
        state.classData = null;
        
        // Remove code and seat from URL
        const currentUrl = new URL(window.location);
        currentUrl.searchParams.delete("code");
        currentUrl.searchParams.delete("seat");
        window.history.replaceState({}, "", currentUrl);

        closeSettingsModal();
        showLoginView();
        showToast("已登出班級", "info");
      };

      elements.switchClassModalBtn.addEventListener('click', handleSwitchClass);
      elements.footerSwitchClassBtn.addEventListener('click', handleSwitchClass);

      // Matrix Modal buttons
      elements.closeMatrixModalBtn.addEventListener('click', closeMatrixModal);
      elements.matrixModalConfirmBtn.addEventListener('click', closeMatrixModal);

      // Click outside modals to close
      elements.settingsModal.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) closeSettingsModal();
      });
      elements.matrixModal.addEventListener('click', (e) => {
        if (e.target === elements.matrixModal) closeMatrixModal();
      });
      elements.modalParentScoreBracketAnalysis?.addEventListener('click', (e) => {
        if (e.target === elements.modalParentScoreBracketAnalysis) closeParentScoreBracketModal();
      });
      elements.modalParentMultiSubjectFilter?.addEventListener('click', (e) => {
        if (e.target === elements.modalParentMultiSubjectFilter) closeParentMultiSubjectModal();
      });

      // Retry banner button
      elements.syncRetryBtn.addEventListener('click', () => {
        if (state.accessCode) connectToClass(state.accessCode);
      });

      // Service Worker registration
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('./sw.js').catch(err => {
            console.warn('[PWA] ServiceWorker registration failed: ', err);
          });
        });
      }

      // PWA Installation & Service Worker Registration
      let parentDeferredInstallPrompt = null;

      function updateParentPwaInstallState() {
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        if (isStandalone) {
          if (elements.parentPwaInstallBadge) {
            elements.parentPwaInstallBadge.textContent = "已安裝為桌面 App";
            elements.parentPwaInstallBadge.className = "px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800";
          }
          if (elements.parentPwaInstallBtnText) {
            elements.parentPwaInstallBtnText.innerHTML = '<i class="fa-solid fa-check text-emerald-600 mr-1"></i> 已安裝為桌面 App（可離線使用）';
          }
        }
      }

      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        parentDeferredInstallPrompt = e;
        if (elements.parentPwaInstallBadge) {
          elements.parentPwaInstallBadge.textContent = "可一鍵安裝";
        }
      });

      window.addEventListener('appinstalled', () => {
        parentDeferredInstallPrompt = null;
        updateParentPwaInstallState();
        showToast("恭喜！家長端看板已成功安裝至您的桌面/主畫面", "success");
      });

      const isIosDevice = () => {
        const userAgent = window.navigator.userAgent.toLowerCase();
        return /iphone|ipad|ipod/.test(userAgent);
      };

      if (elements.btnParentPwaInstall) {
        elements.btnParentPwaInstall.addEventListener("click", async () => {
          const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
          if (isStandalone) {
            showToast("您目前已在使用桌面 App 模式！", "info");
            return;
          }

          if (parentDeferredInstallPrompt) {
            parentDeferredInstallPrompt.prompt();
            const { outcome } = await parentDeferredInstallPrompt.userChoice;
            if (outcome === 'accepted') {
              showToast("感謝安裝！已將家長端看板新增至主畫面", "success");
            }
            parentDeferredInstallPrompt = null;
          } else if (isIosDevice()) {
            elements.modalIosPwaGuide?.classList.remove("hidden");
          } else {
            showToast("若未自動跳出安裝視窗，請點選瀏覽器網址列右側的「安裝」圖示即可加到桌面！", "info");
          }
        });
      }

      elements.closeIosPwaGuideBtn?.addEventListener("click", () => elements.modalIosPwaGuide?.classList.add("hidden"));
      elements.confirmIosPwaGuideBtn?.addEventListener("click", () => elements.modalIosPwaGuide?.classList.add("hidden"));
      updateParentPwaInstallState();

      // Window Online/Offline listeners
      window.addEventListener('online', () => {
        elements.syncAlertBanner.classList.add('hidden');
        elements.syncStatusText.textContent = "即時連線中";
        showToast("網路已重新連線", "success");
      });
      window.addEventListener('offline', () => {
        elements.syncAlertBanner.classList.remove('hidden');
        elements.syncAlertMsg.textContent = "您的裝置目前處於離線狀態，請檢查網路連線";
        elements.syncStatusText.textContent = "離線中";
        showToast("網路已中斷", "error");
      });
    }

    function escapeHtml(text) {
      if (!text) return "";
      return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    // Start App
    init();
