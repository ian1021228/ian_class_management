/**
 * 班級經營系統 — 學生端數位聯絡簿主程式 (Student Dashboard App)
 * 整合自主作業檢核、每日心情週記、小考成績登記與分析
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
    const LS_ACCESS_CODE_KEY = "student_access_code";
    const LS_CLASS_CACHE_PREFIX = "student_class_cache_";
    const LS_STUDENT_SCORES_KEY = "student_scores_records";
    const LS_STUDENT_HW_CHECK_KEY = "student_hw_self_checks";
    const LS_STUDENT_MOOD_KEY = "student_mood_journal";

    function getStudentSeatStorageKey(code) {
      const c = String(code || state.accessCode || "").trim().toUpperCase();
      return c ? `student_seat_${c}` : null;
    }

    // App Global State
    const state = {
      accessCode: "",
      studentSeat: null,
      classData: null,
      selectedContactDate: getTodayDateString(),
      activeTab: "hw", // "hw" | "scores" | "contact"
      unsubscribeSnapshot: null,
      selfChecks: {}, // { [hwId]: boolean }
      contactChecks: {}, // { [date_idx]: boolean }
      scores: [], // [ { id, date, subject, name, score, correction, remark, originalScore, lastModified, isMakeup } ]
      selectedSubjectsFilter: [], // array of subjects, empty or length === 21 means all
      moodJournal: {} // { [date]: { mood, text } }
    };
    window.state = state;

    // DOM Elements Cache
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

      // Header & Navigation
      headerClassName: document.getElementById("header-class-name"),
      headerSeatBadge: document.getElementById("header-seat-badge"),
      headerAccessCode: document.getElementById("header-access-code"),
      syncStatusText: document.getElementById("sync-status-text"),
      navSeatBtn: document.getElementById("nav-seat-btn"),
      navSeatLabel: document.getElementById("nav-seat-label"),
      openSettingsBtn: document.getElementById("open-settings-btn"),

      // Student Section
      studentUnboundView: document.getElementById("student-unbound-view"),
      studentBoundView: document.getElementById("student-bound-view"),
      quickSeatPickerGrid: document.getElementById("quick-seat-picker-grid"),
      studentSeatDisplay: document.getElementById("student-seat-display"),
      todayDateText: document.getElementById("today-date-text"),
      statHwProgress: document.getElementById("stat-hw-progress"),
      statTestCount: document.getElementById("stat-test-count"),
      statTestAvg: document.getElementById("stat-test-avg"),

      // Tabs
      tabHwBtn: document.getElementById("tab-hw-btn"),
      tabScoresBtn: document.getElementById("tab-scores-btn"),
      tabContactBtn: document.getElementById("tab-contact-btn"),
      tabHwCountBadge: document.getElementById("tab-hw-count-badge"),
      tabScoresCountBadge: document.getElementById("tab-scores-count-badge"),
      contactUnfinishedBadge: document.getElementById("contact-unfinished-badge"),
      tabContactText: document.getElementById("tab-contact-text"),
      panelHomework: document.getElementById("panel-homework"),
      panelScores: document.getElementById("panel-scores"),
      panelContact: document.getElementById("panel-contact"),

      // Homework Tab
      hwProgressText: document.getElementById("hw-progress-text"),
      hwProgressBar: document.getElementById("hw-progress-bar"),
      hwTotalBadge: document.getElementById("hw-total-badge"),
      studentHomeworkList: document.getElementById("student-homework-list"),

      // Scores Tab & Analytics
      studentScoresUnconfiguredView: document.getElementById("student-scores-unconfigured-view"),
      unconfiguredSeatNumber: document.getElementById("unconfigured-seat-number"),
      studentScoresLockedView: document.getElementById("student-scores-locked-view"),
      lockedSeatNumber: document.getElementById("locked-seat-number"),
      studentPinVerifyDesc: document.getElementById("student-pin-verify-desc"),
      studentPinAuthForm: document.getElementById("student-pin-auth-form"),
      inputStudentAuthPin: document.getElementById("input-student-auth-pin"),
      btnToggleStudentAuthPin: document.getElementById("btn-toggle-student-auth-pin"),
      iconStudentPinEye: document.getElementById("icon-student-pin-eye"),
      studentPinErrorBox: document.getElementById("student-pin-error-box"),
      studentPinErrorMsg: document.getElementById("student-pin-error-msg"),
      studentScoresUnlockedView: document.getElementById("student-scores-unlocked-view"),
      btnRelockScores: document.getElementById("btn-relock-scores"),
      btnOpenAddScore: document.getElementById("btn-open-add-score"),
      scoresCountBadge: document.getElementById("scores-count-badge"),
      studentScoresList: document.getElementById("student-scores-list"),
      pendingScoresSection: document.getElementById("pending-scores-section"),
      pendingScoresList: document.getElementById("pending-scores-list"),
      pendingScoresCountBadge: document.getElementById("pending-scores-count-badge"),
      statTotalTestsCount: document.getElementById("stat-total-tests-count"),
      statTodayTestsSub: document.getElementById("stat-today-tests-sub"),
      statOverallAvg: document.getElementById("stat-overall-avg"),
      statOverallGrade: document.getElementById("stat-overall-grade"),
      statHighestScore: document.getElementById("stat-highest-score"),
      statHighestSubject: document.getElementById("stat-highest-subject"),
      statCorrectionRate: document.getElementById("stat-correction-rate"),
      statCorrectionSub: document.getElementById("stat-correction-sub"),
      trendStatusBadge: document.getElementById("trend-status-badge"),
      scoreTrendChartContainer: document.getElementById("score-trend-chart-container"),
      domainAnalyticsFilter: document.getElementById("domain-analytics-filter"),
      subjectAnalyticsGrid: document.getElementById("subject-analytics-grid"),
      filterScoreRange: document.getElementById("filter-score-range"),
      filterCustomDateContainer: document.getElementById("filter-custom-date-container"),
      filterDateStart: document.getElementById("filter-date-start"),
      filterDateEnd: document.getElementById("filter-date-end"),
      btnOpenMultiSubject: document.getElementById("btn-open-multi-subject"),
      multiSubjectBtnLabel: document.getElementById("multi-subject-btn-label"),
      filterScoreSubject: document.getElementById("filter-score-subject"),
      filterScoreCorrection: document.getElementById("filter-score-correction"),
      sortScoreOrder: document.getElementById("sort-score-order"),

      // Contact Tab
      selectedDateLabel: document.getElementById("selected-date-label"),
      contactDateSlider: document.getElementById("contact-date-slider"),
      contactEntriesCount: document.getElementById("contact-entries-count"),
      contactBookContainer: document.getElementById("contact-book-container"),
      moodPickerGroup: document.getElementById("mood-picker-group"),
      moodJournalTextarea: document.getElementById("mood-journal-textarea"),
      btnSaveMoodJournal: document.getElementById("btn-save-mood-journal"),

      // Score Modal (Legacy fallback & manual)
      scoreModal: document.getElementById("score-modal"),
      scoreModalTitle: document.getElementById("score-modal-title"),
      closeScoreModalBtn: document.getElementById("close-score-modal-btn"),
      cancelScoreModalBtn: document.getElementById("cancel-score-modal-btn"),
      saveScoreModalBtn: document.getElementById("save-score-modal-btn"),
      editScoreId: document.getElementById("edit-score-id"),
      inputScoreSubject: document.getElementById("input-score-subject"),
      inputScoreName: document.getElementById("input-score-name"),
      inputScoreVal: document.getElementById("input-score-val"),
      inputScoreRemark: document.getElementById("input-score-remark"),
      subjectPickerGroup: document.getElementById("subject-picker-group"),
      correctionPickerGroup: document.getElementById("correction-picker-group"),

      // Settings Modal
      settingsModal: document.getElementById("settings-modal"),
      closeSettingsModalBtn: document.getElementById("close-settings-modal-btn"),
      modalClassName: document.getElementById("modal-class-name"),
      modalAccessCodeBadge: document.getElementById("modal-access-code-badge"),
      modalTeacherName: document.getElementById("modal-teacher-name"),
      modalSeatSelect: document.getElementById("modal-seat-select"),
      switchClassModalBtn: document.getElementById("switch-class-modal-btn"),
      saveSettingsBtn: document.getElementById("save-settings-btn"),

      // Subject Picker Collapsible Elements
      btnToggleDetailedSubjects: document.getElementById("btn-toggle-detailed-subjects"),
      textToggleDetailedSubjects: document.getElementById("text-toggle-detailed-subjects"),
      iconToggleDetailedSubjects: document.getElementById("icon-toggle-detailed-subjects"),
      detailedSubjectPickerContainer: document.getElementById("detailed-subject-picker-container"),
      btnCloseDetailedSubjects: document.getElementById("btn-close-detailed-subjects"),

      // Multi-Subject Filter Modal
      modalMultiSubjectFilter: document.getElementById("modal-multi-subject-filter"),
      btnCloseMultiSubjectModal: document.getElementById("btn-close-multi-subject-modal"),
      btnCancelMultiSubject: document.getElementById("btn-cancel-multi-subject"),
      btnApplyMultiSubject: document.getElementById("btn-apply-multi-subject"),
      btnSubSelectAll: document.getElementById("btn-sub-select-all"),
      btnSubClearAll: document.getElementById("btn-sub-clear-all"),
      multiSubSelectedCountBadge: document.getElementById("multi-sub-selected-count-badge"),
      multiSubjectCheckboxesContainer: document.getElementById("multi-subject-checkboxes-container"),

      // Score Bracket Analysis Modal
      modalScoreBracketAnalysis: document.getElementById("modal-score-bracket-analysis"),
      bracketModalSubjectBadge: document.getElementById("bracket-modal-subject-badge"),
      bracketModalExamTitle: document.getElementById("bracket-modal-exam-title"),
      bracketModalDate: document.getElementById("bracket-modal-date"),
      bracketModalMyScoreBanner: document.getElementById("bracket-modal-my-score-banner"),
      bracketModalBarsContainer: document.getElementById("bracket-modal-bars-container"),
      bracketModalClassAvg: document.getElementById("bracket-modal-class-avg"),
      bracketModalSampleCount: document.getElementById("bracket-modal-sample-count"),
      bracketModalHighest: document.getElementById("bracket-modal-highest"),
      bracketModalLowest: document.getElementById("bracket-modal-lowest"),
      btnCloseBracketModal: document.getElementById("btn-close-bracket-modal"),
      btnDoneBracketModal: document.getElementById("btn-done-bracket-modal"),

      // Edit My Score Modal
      modalEditMyScore: document.getElementById("modal-edit-my-score"),
      editMyScoreExamTitle: document.getElementById("edit-my-score-exam-title"),
      formEditMyScore: document.getElementById("form-edit-my-score"),
      editMyScoreExamId: document.getElementById("edit-my-score-exam-id"),
      editMyScoreVal: document.getElementById("edit-my-score-val"),
      editMyScoreCorrection: document.getElementById("edit-my-score-correction"),
      editMyScoreRemark: document.getElementById("edit-my-score-remark"),
      btnCloseEditMyScoreModal: document.getElementById("btn-close-edit-my-score-modal"),
      btnCancelEditMyScore: document.getElementById("btn-cancel-edit-my-score"),

      // PWA Elements
      btnPwaInstall: document.getElementById("btn-pwa-install"),
      pwaInstallBadge: document.getElementById("pwa-install-badge"),
      pwaInstallBtnText: document.getElementById("pwa-install-btn-text"),
      modalIosPwaGuide: document.getElementById("modal-ios-pwa-guide"),
      closeIosPwaGuideBtn: document.getElementById("close-ios-pwa-guide-btn"),
      confirmIosPwaGuideBtn: document.getElementById("confirm-ios-pwa-guide-btn"),

      toastContainer: document.getElementById("toast-container")
    };

    // Selected state for modals
    let selectedModalCorrection = "全對免訂正";
    let selectedMood = "開心";

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

    function escapeHtml(str) {
      if (!str) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
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
          for (let i = min; i <= max; i++) set.add(i);
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
      toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i> <span>${escapeHtml(message)}</span>`;
      
      elements.toastContainer.appendChild(toast);
      requestAnimationFrame(() => toast.classList.remove('translate-y-2', 'opacity-0'));
      setTimeout(() => {
        toast.classList.add('translate-y-2', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
      }, 3200);
    }

    function safeCopyToClipboard(text, successMsg = "已成功複製到剪貼簿！") {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
          showToast(successMsg, "success");
        }).catch(() => fallbackCopy(text, successMsg));
      } else {
        fallbackCopy(text, successMsg);
      }
    }

    function fallbackCopy(text, successMsg) {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        showToast(successMsg, "success");
      } catch (err) {
        showToast("複製失敗，請手動複製", "error");
      }
      document.body.removeChild(textArea);
    }

    // ==========================================
    // INITIALIZATION & LOGIN
    // ==========================================

    function init() {
      // 1. Clean obsolete global legacy key
      try {
        localStorage.removeItem("student_seat_number");
      } catch (e) {}

      // 2. Load Local State
      loadLocalState();

      // Set today's date banner
      elements.todayDateText.textContent = getTodayDateString();

      // 3. Check URL parameters ?code=XXXX&seat=YY
      const urlParams = new URLSearchParams(window.location.search);
      const codeFromUrl = urlParams.get("code");
      const seatFromUrl = urlParams.get("seat");

      if (codeFromUrl) {
        const clean = codeFromUrl.trim().toUpperCase();
        elements.inputAccessCode.value = clean;
        connectToClass(clean, seatFromUrl);
      } else if (state.accessCode) {
        elements.inputAccessCode.value = state.accessCode;
        connectToClass(state.accessCode, seatFromUrl);
      } else {
        showLoginView();
      }

      setupEventListeners();

      if (!ENABLE_SCORES_FEATURE) {
        document.getElementById("stat-test-count-card")?.classList.add("hidden");
        document.getElementById("stat-test-avg-card")?.classList.add("hidden");
        elements.tabScoresBtn?.classList.add("hidden");
        elements.panelScores?.classList.add("hidden");
      } else {
        document.getElementById("stat-test-count-card")?.classList.remove("hidden");
        document.getElementById("stat-test-avg-card")?.classList.remove("hidden");
        elements.tabScoresBtn?.classList.remove("hidden");
        elements.tabScoresBtn?.classList.add("flex");
      }
    }

    function loadLocalState() {
      try {
        state.accessCode = localStorage.getItem(LS_ACCESS_CODE_KEY) || "";
        
        // 嚴格依班級讀取座號，若尚未選擇或新班級則為 null
        if (state.accessCode) {
          const seatKey = getStudentSeatStorageKey(state.accessCode);
          const savedSeat = seatKey ? localStorage.getItem(seatKey) : null;
          state.studentSeat = savedSeat ? parseInt(savedSeat, 10) : null;
        } else {
          state.studentSeat = null;
        }

        const savedChecks = localStorage.getItem(LS_STUDENT_HW_CHECK_KEY);
        if (savedChecks) state.selfChecks = JSON.parse(savedChecks);

        const savedContactChecks = localStorage.getItem("student_contact_checks");
        if (savedContactChecks) state.contactChecks = JSON.parse(savedContactChecks);

        const savedScores = localStorage.getItem(LS_STUDENT_SCORES_KEY);
        if (savedScores) state.scores = JSON.parse(savedScores);

        const savedMood = localStorage.getItem(LS_STUDENT_MOOD_KEY);
        if (savedMood) state.moodJournal = JSON.parse(savedMood);

        const savedSubs = localStorage.getItem("student_selected_subjects_filter");
        if (savedSubs) state.selectedSubjectsFilter = JSON.parse(savedSubs);
      } catch (e) {
        console.warn("Error loading local state:", e);
      }
    }

    function saveLocalState() {
      try {
        if (state.accessCode) {
          localStorage.setItem(LS_ACCESS_CODE_KEY, state.accessCode);
          const seatKey = getStudentSeatStorageKey(state.accessCode);
          if (seatKey) {
            if (state.studentSeat) localStorage.setItem(seatKey, state.studentSeat.toString());
            else localStorage.removeItem(seatKey);
          }
        }
        localStorage.setItem(LS_STUDENT_HW_CHECK_KEY, JSON.stringify(state.selfChecks));
        localStorage.setItem("student_contact_checks", JSON.stringify(state.contactChecks || {}));
        localStorage.setItem(LS_STUDENT_SCORES_KEY, JSON.stringify(state.scores));
        localStorage.setItem(LS_STUDENT_MOOD_KEY, JSON.stringify(state.moodJournal));
        localStorage.setItem("student_selected_subjects_filter", JSON.stringify(state.selectedSubjectsFilter || []));
      } catch (e) {
        console.warn("Error saving local state:", e);
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
        elements.loginBtnText.textContent = "進入我的數位聯絡簿";
        elements.loginBtnIcon.className = "fa-solid fa-arrow-right text-sm";
      }
    }

    // ==========================================
    // FIRESTORE CONNECTION & SYNC
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
        elements.loginErrorMsg.textContent = "請輸入有效的班級代碼！";
        return;
      }

      setLoginLoading(true);
      elements.loginErrorBox.classList.add("hidden");

      // 檢查座號覆蓋或載入該班級座號
      const seatKey = getStudentSeatStorageKey(cleanCode);
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

      // 1. Fast local cache check
      try {
        const cachedRaw = localStorage.getItem(LS_CLASS_CACHE_PREFIX + cleanCode);
        if (cachedRaw) {
          const cachedData = JSON.parse(cachedRaw);
          if (cachedData && cachedData.className) {
            state.classData = cachedData;
            showDashboardView();
            renderStudentDashboard(cachedData);
          }
        }
      } catch (cacheErr) {}

      // Cleanup existing listener
      if (state.unsubscribeSnapshot) {
        state.unsubscribeSnapshot();
        state.unsubscribeSnapshot = null;
      }

      // 2. Direct fast REST query
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

              // Update URL
              const currentUrl = new URL(window.location);
              currentUrl.searchParams.set("code", cleanCode);
              if (state.studentSeat) currentUrl.searchParams.set("seat", state.studentSeat);
              else currentUrl.searchParams.delete("seat");
              window.history.replaceState({}, "", currentUrl);

              showDashboardView();
              renderStudentDashboard(directData);
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
        } catch (e) {}
      };

      fetchDirectData();

      // 3. onSnapshot for live updates
      const classDocRef = doc(db, 'artifacts', APP_COLLECTION_ID, 'public', 'data', 'parentClasses', cleanCode);
      state.unsubscribeSnapshot = onSnapshot(classDocRef, (docSnap) => {
        setLoginLoading(false);
        if (docSnap.exists()) {
          resolvedByFastRest = true;
          const raw = docSnap.data();
          const data = parseClassData(raw);
          state.accessCode = cleanCode;
          state.classData = data;
          
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

          const currentUrl = new URL(window.location);
          currentUrl.searchParams.set("code", cleanCode);
          if (state.studentSeat) currentUrl.searchParams.set("seat", state.studentSeat);
          else currentUrl.searchParams.delete("seat");
          window.history.replaceState({}, "", currentUrl);

          showDashboardView();
          renderStudentDashboard(data);
          syncScoresFromCloud();
        } else {
          if (!resolvedByFastRest && !state.classData) {
            showLoginView();
            elements.loginErrorBox.classList.remove("hidden");
            elements.loginErrorMsg.textContent = "找不到此班級權限碼（" + cleanCode + "），請確認後重新輸入！";
            localStorage.removeItem(LS_ACCESS_CODE_KEY);
          }
        }
      }, (err) => {
        setLoginLoading(false);
        console.error("Firestore sync error:", err);
      });
    }

    // Sync student scores with Firestore userProfiles collection
    async function syncScoresToCloud() {
      if (!state.accessCode || !state.studentSeat) return;
      try {
        const studentDocId = `studentScores_${state.accessCode}_seat${state.studentSeat}`;
        const profileDocRef = doc(db, 'artifacts', APP_COLLECTION_ID, 'public', 'data', 'userProfiles', studentDocId);
        await setDoc(profileDocRef, {
          classCode: state.accessCode,
          seat: state.studentSeat,
          scores: state.scores || [],
          moodJournal: state.moodJournal || {},
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        console.warn("Cloud scores sync warning:", err);
      }
    }

    let unsubscribeStudentScores = null;

    function syncScoresFromCloud() {
      if (unsubscribeStudentScores) {
        unsubscribeStudentScores();
        unsubscribeStudentScores = null;
      }
      if (!state.accessCode || !state.studentSeat) return;
      try {
        const studentDocId = `studentScores_${state.accessCode}_seat${state.studentSeat}`;
        const profileDocRef = doc(db, 'artifacts', APP_COLLECTION_ID, 'public', 'data', 'userProfiles', studentDocId);
        unsubscribeStudentScores = onSnapshot(profileDocRef, (snap) => {
          if (snap.exists()) {
            const cloudData = snap.data();
            if (cloudData) {
              if (Array.isArray(cloudData.scores)) {
                state.scores = cloudData.scores;
              }
              if (cloudData.moodJournal) {
                state.moodJournal = { ...state.moodJournal, ...cloudData.moodJournal };
              }
              saveLocalState();
              renderScoresSection();
              renderMoodJournalSection();
            }
          }
        }, (err) => {
          console.warn("Realtime scores sync warning:", err);
        });
      } catch (e) {
        console.warn("syncScoresFromCloud setup error:", e);
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
      // 預設 PIN 碼：班級代碼 + 座號 (學生與家長共用)
      if (state.accessCode) {
        return `${state.accessCode}${s}`.trim().toUpperCase();
      }
      return null;
    }

    function checkStudentScoresAuth() {
      if (!state.accessCode || !state.studentSeat) return false;
      const seat = String(state.studentSeat);
      const configuredToken = state.classData?.studentTokens?.[seat];
      const tokenKey = "student_token_" + state.accessCode + "_" + seat;
      const authKey = "student_auth_verified_" + state.accessCode + "_" + seat;

      // Case 1: 網址帶有專屬防偽安全令牌 (URL Token)
      if (configuredToken) {
        if (urlToken && urlToken === configuredToken) {
          localStorage.setItem(tokenKey, urlToken);
          localStorage.setItem(authKey, "true");
          if (elements.studentScoresUnconfiguredView) elements.studentScoresUnconfiguredView.classList.add('hidden');
          if (elements.studentScoresLockedView) elements.studentScoresLockedView.classList.add('hidden');
          if (elements.studentScoresUnlockedView) elements.studentScoresUnlockedView.classList.remove('hidden');
          return true;
        }

        // Case 2: 本機已儲存之專屬防偽安全令牌 (LocalStorage Token)
        const storedToken = localStorage.getItem(tokenKey);
        if (storedToken && storedToken === configuredToken) {
          if (elements.studentScoresUnconfiguredView) elements.studentScoresUnconfiguredView.classList.add('hidden');
          if (elements.studentScoresLockedView) elements.studentScoresLockedView.classList.add('hidden');
          if (elements.studentScoresUnlockedView) elements.studentScoresUnlockedView.classList.remove('hidden');
          return true;
        }
      }

      // 相容舊模式 (若尚未換發 Token，且先前已驗證過)
      const teacherPin = getTeacherConfiguredPin(seat);
      const isVerified = localStorage.getItem(authKey) === "true";
      const storedPin = localStorage.getItem("student_auth_pin_" + state.accessCode + "_" + seat);
      if (!configuredToken && isVerified && storedPin && storedPin.trim().toUpperCase() === teacherPin) {
        if (elements.studentScoresUnconfiguredView) elements.studentScoresUnconfiguredView.classList.add('hidden');
        if (elements.studentScoresLockedView) elements.studentScoresLockedView.classList.add('hidden');
        if (elements.studentScoresUnlockedView) elements.studentScoresUnlockedView.classList.remove('hidden');
        return true;
      }

      // 未通過令牌驗證 -> 呈現防偽安全鎖定卡片
      if (elements.studentScoresUnconfiguredView) elements.studentScoresUnconfiguredView.classList.add('hidden');
      if (elements.studentScoresLockedView) elements.studentScoresLockedView.classList.remove('hidden');
      if (elements.studentScoresUnlockedView) elements.studentScoresUnlockedView.classList.add('hidden');
      if (elements.lockedSeatNumber) elements.lockedSeatNumber.textContent = seat;

      return false;
    }

    function ensureStudentPin() {
      checkStudentScoresAuth();
    }


    function showInAppConfirm({ title, message, confirmText = "確定", cancelText = "取消", isDanger = false, onConfirm }) {
      const modal = document.getElementById("inapp-confirm-modal");
      const titleEl = document.getElementById("confirm-modal-title");
      const msgEl = document.getElementById("confirm-modal-message");
      const okBtn = document.getElementById("confirm-modal-ok-btn");
      const cancelBtn = document.getElementById("confirm-modal-cancel-btn");
      const iconContainer = document.getElementById("confirm-modal-icon-container");
      const iconEl = document.getElementById("confirm-modal-icon");

      if (!modal) {
        if (onConfirm) onConfirm();
        return;
      }

      if (titleEl) titleEl.textContent = title || "確認提示";
      if (msgEl) msgEl.textContent = message || "確定要繼續嗎？";
      if (okBtn) {
        okBtn.textContent = confirmText;
        okBtn.className = isDanger
          ? "flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-rose-500/20 transition-all cursor-pointer"
          : "flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-500/20 transition-all cursor-pointer";
      }
      if (cancelBtn) cancelBtn.textContent = cancelText;

      if (iconContainer && iconEl) {
        if (isDanger) {
          iconContainer.className = "w-14 h-14 rounded-3xl bg-rose-50 text-rose-600 flex items-center justify-center text-2xl mx-auto border border-rose-100 shadow-xs";
          iconEl.className = "fa-solid fa-triangle-exclamation text-rose-600";
        } else {
          iconContainer.className = "w-14 h-14 rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-2xl mx-auto border border-indigo-100 shadow-xs";
          iconEl.className = "fa-solid fa-circle-question text-indigo-600";
        }
      }

      const cleanup = () => {
        modal.classList.add("hidden");
        okBtn.removeEventListener("click", handleOk);
        cancelBtn.removeEventListener("click", handleCancel);
      };

      const handleOk = () => {
        cleanup();
        if (onConfirm) onConfirm();
      };

      const handleCancel = () => {
        cleanup();
      };

      okBtn.addEventListener("click", handleOk);
      cancelBtn.addEventListener("click", handleCancel);
      modal.classList.remove("hidden");
    }

    // ==========================================
    // RENDER STUDENT DASHBOARD
    // ==========================================

    function renderStudentDashboard(data) {
      if (!data) return;

      // 1. Header
      elements.headerClassName.textContent = data.className || "未命名班級";
      elements.headerAccessCode.textContent = data.accessCode || state.accessCode;
      elements.modalClassName.textContent = data.className || "未命名班級";
      elements.modalAccessCodeBadge.textContent = data.accessCode || state.accessCode;
      elements.modalTeacherName.textContent = `導師：${data.teacherName || "未指定"}`;

      // Populate Seat Selectors
      populateSeatSelectors(data);

      // Check Seat Binding
      if (!state.studentSeat) {
        elements.studentUnboundView.classList.remove("hidden");
        elements.studentBoundView.classList.add("hidden");
        elements.headerSeatBadge.textContent = "未選擇座號";
        elements.navSeatLabel.textContent = "選擇座號";
        return;
      }

      elements.studentUnboundView.classList.add("hidden");
      elements.studentBoundView.classList.remove("hidden");
      elements.studentSeatDisplay.textContent = `${state.studentSeat}`;
      elements.headerSeatBadge.textContent = `${state.studentSeat} 號`;
      elements.navSeatLabel.textContent = `${state.studentSeat} 號`;

      // Ensure Student Parent PIN is active & displayed
      ensureStudentPin();

      // 2. Render Homework Section
      renderHomeworkSection(data);

      // 3. Render Scores Section
      renderScoresSection();

      // 4. Render Contact Book Section
      renderContactBookSection(data);

      // 5. Render Mood Journal
      renderMoodJournalSection();
    }

    function populateSeatSelectors(data) {
      const maxSeat = data.lastMaxSeat || 35;
      const missingSeats = parseMissingSeats(data.lastMissingSeats);

      elements.modalSeatSelect.innerHTML = '<option value="">-- 請選擇座號 --</option>';
      elements.quickSeatPickerGrid.innerHTML = '';

      for (let i = 1; i <= maxSeat; i++) {
        if (missingSeats.has(i)) continue;

        // Modal Option
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `${i} 號`;
        if (state.studentSeat === i) opt.selected = true;
        elements.modalSeatSelect.appendChild(opt);

        // Quick Button
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `touch-target w-11 h-11 rounded-2xl font-bold text-sm flex items-center justify-center transition-all border shadow-xs active:scale-95 ${
          state.studentSeat === i
            ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/30'
            : 'bg-white hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 border-slate-200'
        }`;
        btn.textContent = `${i}`;
        btn.title = `設定為 ${i} 號`;
        btn.addEventListener('click', () => {
          setStudentSeat(i);
        });
        elements.quickSeatPickerGrid.appendChild(btn);
      }
    }

    function setStudentSeat(seatNumber) {
      state.studentSeat = seatNumber ? parseInt(seatNumber, 10) : null;
      const seatKey = getStudentSeatStorageKey(state.accessCode);
      if (state.studentSeat) {
        if (seatKey) localStorage.setItem(seatKey, state.studentSeat.toString());
        showToast(`已設定為 ${state.studentSeat} 號同學`, "success");
        const currentUrl = new URL(window.location);
        currentUrl.searchParams.set("seat", state.studentSeat);
        window.history.replaceState({}, "", currentUrl);
      } else {
        if (seatKey) localStorage.removeItem(seatKey);
        showToast("已清除座號，請重新選擇", "info");
        const currentUrl = new URL(window.location);
        currentUrl.searchParams.delete("seat");
        window.history.replaceState({}, "", currentUrl);
      }

      if (state.classData) {
        renderStudentDashboard(state.classData);
        syncScoresFromCloud();
      }
    }

    // ==========================================
    // MODULE 1: HOMEWORK CHECKLIST
    // ==========================================

    function getStatusMeta(homeworkTypeId, statusKey, classData) {
      const fallback = {
        key: statusKey,
        text: statusKey === 'submitted' ? '已繳交' : (statusKey === 'needs-correction' ? '待訂正' : '未繳交'),
        isCompleted: statusKey === 'submitted',
        isCorrection: statusKey === 'needs-correction'
      };

      if (!classData || !classData.homeworkTypes) return fallback;
      const type = classData.homeworkTypes.find(t => t.id === homeworkTypeId);
      if (!type || !type.statuses) return fallback;

      const found = type.statuses.find(s => s.key === statusKey);
      if (!found) return fallback;

      const isCorrection = (found.key === 'needs-correction' || found.text.includes('訂正'));
      return {
        ...found,
        isCompleted: found.isCompleted || found.key === 'submitted',
        isCorrection: isCorrection
      };
    }

    function renderHomeworkSection(data) {
      const seat = state.studentSeat;
      const homeworks = data.homeworks || [];

      let selfCheckedCount = 0;
      elements.tabHwCountBadge.textContent = `${homeworks.length}`;
      elements.hwTotalBadge.textContent = `共 ${homeworks.length} 項`;

      if (homeworks.length === 0) {
        elements.studentHomeworkList.innerHTML = `
          <div class="text-center py-10 text-slate-400 text-sm">
            <i class="fa-regular fa-folder-open text-3xl mb-2 block text-slate-300"></i>
            今日導師尚未登記作業
          </div>
        `;
        elements.hwProgressText.textContent = `0 / 0 已自主完成 (0%)`;
        elements.hwProgressBar.style.width = `0%`;
        elements.statHwProgress.textContent = `0%`;
        return;
      }

      const listHtml = homeworks.map(hw => {
        const studentRecord = (hw.students || []).find(s => s.seat === seat);
        const statusKey = studentRecord ? studentRecord.status : 'not-submitted';
        const meta = getStatusMeta(hw.typeId, statusKey, data);
        const isSelfChecked = Boolean(state.selfChecks[hw.id]);

        if (isSelfChecked) selfCheckedCount++;

        // Status pill for teacher's check
        let teacherPill = "";
        if (meta.isCompleted) {
          teacherPill = `<span class="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200"><i class="fa-solid fa-check mr-1"></i>老師已收件</span>`;
        } else if (meta.isCorrection) {
          teacherPill = `<span class="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200"><i class="fa-solid fa-circle-exclamation mr-1"></i>需訂正</span>`;
        } else {
          teacherPill = `<span class="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200"><i class="fa-solid fa-xmark mr-1"></i>待繳交</span>`;
        }

        const typeObj = (data.homeworkTypes || []).find(t => t.id === hw.typeId);
        const typeName = typeObj ? typeObj.name : "作業";

        return `
          <div class="hw-item-card flex items-center justify-between p-3.5 sm:p-4 rounded-2xl border transition-all ${
            isSelfChecked
              ? 'bg-emerald-50/70 border-emerald-200 shadow-xs'
              : 'bg-white hover:bg-slate-50 border-slate-200/80 shadow-2xs'
          }">
            <div class="flex items-center gap-3 min-w-0 mr-3">
              <!-- Custom Checkbox -->
              <button
                type="button"
                data-hw-id="${hw.id}"
                class="hw-check-btn checkbox-bounce touch-target w-7 h-7 rounded-xl flex items-center justify-center transition-all border cursor-pointer flex-shrink-0 ${
                  isSelfChecked
                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                    : 'bg-white border-slate-300 text-transparent hover:border-emerald-400'
                }"
                title="標記為已自主完成"
              >
                <i class="fa-solid fa-check text-xs"></i>
              </button>

              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-100 text-slate-600 flex-shrink-0">
                    ${escapeHtml(typeName)}
                  </span>
                  <span class="text-sm sm:text-base font-bold text-slate-900 truncate ${isSelfChecked ? 'text-slate-500 font-semibold' : ''}">
                    ${escapeHtml(hw.name)}
                  </span>
                </div>
                <div class="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                  <span>${isSelfChecked ? '<i class="fa-solid fa-circle-check text-emerald-500 mr-1"></i>我已完成此作業' : '<i class="fa-solid fa-hourglass-half text-amber-500 mr-1"></i>待完成'}</span>
                </div>
              </div>
            </div>

            <!-- Teacher Status Badge -->
            <div class="flex-shrink-0">
              ${teacherPill}
            </div>
          </div>
        `;
      }).join('');

      elements.studentHomeworkList.innerHTML = listHtml;

      // Update Progress
      const percent = Math.round((selfCheckedCount / homeworks.length) * 100);
      elements.hwProgressText.textContent = `${selfCheckedCount} / ${homeworks.length} 已自主完成 (${percent}%)`;
      elements.hwProgressBar.style.width = `${percent}%`;
      elements.statHwProgress.textContent = `${percent}%`;

      // Checkbox event listeners
      elements.studentHomeworkList.querySelectorAll('.hw-check-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const hwId = btn.getAttribute('data-hw-id');
          state.selfChecks[hwId] = !state.selfChecks[hwId];
          saveLocalState();
          renderHomeworkSection(data);
          if (state.selfChecks[hwId]) {
            showToast("太棒了！已標記自主完成！", "success");
          }
        });
      });
    }

    // ==========================================
    // DOMAINS & SUBJECT DEFINITIONS (21 門臺灣課綱學科)
    // ==========================================
    const DOMAINS_CONFIG = [
      { id: "lang", name: "語文領域", color: "bg-indigo-500", subjects: ["國語文", "英語文"] },
      { id: "math", name: "數學領域", color: "bg-blue-500", subjects: ["數學"] },
      { id: "social", name: "社會領域", color: "bg-amber-500", subjects: ["歷史", "地理", "公民與社會", "綜合社會"] },
      { id: "nature", name: "自然科學", color: "bg-emerald-500", subjects: ["生物", "理化", "地球科學", "綜合自然"] },
      { id: "arts-tech", name: "藝術與科技", color: "bg-purple-500", subjects: ["音樂", "視覺藝術", "表演藝術", "資訊科技", "生活科技"] },
      { id: "health-comp", name: "健體與綜合活動", color: "bg-rose-500", subjects: ["健康教育", "體育", "家政", "童軍", "輔導"] }
    ];

    const ALL_21_SUBJECTS = DOMAINS_CONFIG.flatMap(d => d.subjects);
    const ALL_19_SUBJECTS = ALL_21_SUBJECTS; // Alias for backward compatibility
    let activeDomainFilter = "all";

    // ==========================================
    // MODULE 2: TEST SCORES TRACKER & ANALYTICS
    // ==========================================

    function renderScoreTrendChart(scores) {
      if (!elements.scoreTrendChartContainer) return;
      if (!scores || scores.length < 2) {
        elements.scoreTrendChartContainer.innerHTML = `
          <div class="text-center text-xs text-slate-400 py-6">
            <i class="fa-solid fa-chart-line text-2xl text-slate-300 block mb-1.5"></i>
            累積登記 2 筆以上測驗後，即在此繪製個人進步走勢圖
          </div>
        `;
        if (elements.trendStatusBadge) {
          elements.trendStatusBadge.className = "px-2.5 py-1 rounded-full text-xs font-extrabold bg-slate-100 text-slate-500";
          elements.trendStatusBadge.textContent = "累積中 (至少 2 筆)";
        }
        return;
      }

      // Sort chronologically ascending
      const chronological = [...scores].sort((a, b) => (a.date || '').localeCompare(b.date || '') || (parseFloat(a.id?.split('_')?.[1] || 0) - parseFloat(b.id?.split('_')?.[1] || 0)));

      // Trend analysis
      const n = chronological.length;
      let trendText = '<i class="fa-solid fa-bullseye text-indigo-500 mr-1"></i> 穩定發揮中';
      let trendClass = "bg-indigo-50 text-indigo-700 border border-indigo-200";

      const recentCount = Math.min(3, Math.floor(n / 2) || 1);
      const recentSlice = chronological.slice(-recentCount);
      const priorSlice = chronological.slice(-recentCount * 2, -recentCount);

      if (priorSlice.length > 0) {
        const avgRecent = recentSlice.reduce((s, x) => s + parseFloat(x.score), 0) / recentSlice.length;
        const avgPrior = priorSlice.reduce((s, x) => s + parseFloat(x.score), 0) / priorSlice.length;
        const diff = Math.round((avgRecent - avgPrior) * 10) / 10;
        if (diff >= 3) {
          trendText = `<i class="fa-solid fa-fire text-amber-500 mr-1"></i> 持續進步中 (+${diff} 分)`;
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

      if (elements.trendStatusBadge) {
        if (trendText) {
          elements.trendStatusBadge.className = `px-2.5 py-1 rounded-full text-xs font-extrabold ${trendClass} inline-flex items-center gap-1`;
          elements.trendStatusBadge.innerHTML = trendText;
          elements.trendStatusBadge.classList.remove('hidden');
        } else {
          elements.trendStatusBadge.classList.add('hidden');
        }
      }

      // Draw SVG Chart
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
            <linearGradient id="trendGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#10b981" stop-opacity="0.25"/>
              <stop offset="100%" stop-color="#10b981" stop-opacity="0.0"/>
            </linearGradient>
          </defs>
          <!-- Grid Lines -->
          <line x1="${padLeft}" y1="${padTop}" x2="${width - padRight}" y2="${padTop}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3 3"/>
          <text x="${padLeft - 6}" y="${padTop + 4}" font-size="10" font-weight="bold" fill="#94a3b8" text-anchor="end">${maxScore}</text>

          <line x1="${padLeft}" y1="${padTop + chartH / 2}" x2="${width - padRight}" y2="${padTop + chartH / 2}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3 3"/>
          <text x="${padLeft - 6}" y="${padTop + chartH / 2 + 4}" font-size="10" font-weight="bold" fill="#94a3b8" text-anchor="end">${Math.round((maxScore + minScore) / 2)}</text>

          <line x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}" stroke="#cbd5e1" stroke-width="1.5"/>
          <text x="${padLeft - 6}" y="${height - padBottom + 4}" font-size="10" font-weight="bold" fill="#94a3b8" text-anchor="end">${minScore}</text>

          <!-- Gradient Area -->
          <path d="${areaD}" fill="url(#trendGrad)" />

          <!-- Line -->
          <path d="${pathD}" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>

          <!-- Points -->
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
      elements.scoreTrendChartContainer.innerHTML = svgHtml;
    }

    function renderSubjectAnalytics(scores) {
      if (!elements.subjectAnalyticsGrid) return;

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

      let subjectsToShow = [...ALL_19_SUBJECTS];
      if (activeDomainFilter !== 'all') {
        const dom = DOMAINS_CONFIG.find(d => d.id === activeDomainFilter);
        if (dom) subjectsToShow = [...dom.subjects];
      }

      if (activeDomainFilter === 'all') {
        Object.keys(subjectMap).forEach(sub => {
          if (!subjectsToShow.includes(sub)) {
            subjectsToShow.push(sub);
          }
        });
      }

      elements.subjectAnalyticsGrid.innerHTML = subjectsToShow.map(sub => {
        const data = subjectMap[sub];
        const count = data ? data.scores.length : 0;
        const avg = count > 0 ? (data.scores.reduce((a, b) => a + b, 0) / count).toFixed(1) : null;
        const max = count > 0 ? Math.max(...data.scores) : null;
        const pending = data ? data.pendingCorrections : 0;

        let domainObj = DOMAINS_CONFIG.find(d => d.subjects.includes(sub));
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
            class="subject-stat-card p-3.5 rounded-2xl bg-slate-50/70 hover:bg-emerald-50/60 border border-slate-200/70 hover:border-emerald-300 transition-all cursor-pointer group"
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

      elements.subjectAnalyticsGrid.querySelectorAll('.subject-stat-card').forEach(card => {
        card.addEventListener('click', () => {
          const sub = card.getAttribute('data-sub');
          if (elements.filterScoreSubject) {
            elements.filterScoreSubject.value = sub;
            renderDetailedScoresList();
            showToast(`已為您篩選【${sub}】測驗成績`, "info");
            const targetEl = document.getElementById('scores-history-section') || elements.filterScoreSubject;
            targetEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      });
    }

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

    // 整合班級雲端考試 (classData.exams) 與學生本機/個人紀錄
    function getCombinedScores() {
      const seatStr = String(state.studentSeat);
      const combined = [];
      const seenIds = new Set();

      // 1. 取得教師端出題且此學生已填寫的測驗
      const classExams = Array.isArray(state.classData?.exams) ? state.classData.exams : [];
      classExams.forEach(exam => {
        const sub = exam.submissions?.[seatStr];
        if (sub && sub.score !== undefined && sub.score !== null) {
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

      // 2. 合併學生既有獨立紀錄 (若未被覆蓋)
      (state.scores || []).forEach(s => {
        if (!seenIds.has(s.id) && !seenIds.has(s.examId)) {
          combined.push(s);
        }
      });

      return combined;
    }

    // 取得待填寫小考 (教師已發布，但此學生尚未填寫分數；填寫完畢立即隱藏避免重複填寫)
    function getPendingExams() {
      if (!state.studentSeat) return [];
      const seatStr = String(state.studentSeat);
      const classExams = Array.isArray(state.classData?.exams) ? state.classData.exams : [];
      return classExams.filter(exam => {
        const sub = exam.submissions?.[seatStr];
        const hasSub = sub && sub.score !== undefined && sub.score !== null && sub.score !== '';
        const inScores = (state.scores || []).some(s => (s.id === exam.id || s.examId === exam.id) && s.score !== undefined && s.score !== null && s.score !== '');
        return !hasSub && !inScores;
      });
    }

    // 渲染【待填寫分數】區塊
    function renderPendingScoresSection() {
      if (!elements.pendingScoresList || !elements.pendingScoresSection) return;
      const pendingExams = getPendingExams();

      if (elements.pendingScoresCountBadge) {
        elements.pendingScoresCountBadge.textContent = `${pendingExams.length} 場小考待填寫`;
        elements.pendingScoresCountBadge.className = pendingExams.length > 0
          ? "px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-800 animate-pulse"
          : "px-2.5 py-0.5 rounded-full text-xs font-black bg-slate-100 text-slate-500";
      }

      if (pendingExams.length === 0) {
        elements.pendingScoresList.innerHTML = `
          <div class="p-5 rounded-2xl bg-slate-50 border border-slate-200/60 text-center text-xs text-slate-500 font-bold space-y-1">
            <div class="text-emerald-600 text-lg"><i class="fa-solid fa-circle-check"></i></div>
            <p>太棒了！目前沒有任何待填寫的小考成績。</p>
            <p class="text-[11px] text-slate-400">當教師發布新的課堂測驗時，將自動在此即時顯示。</p>
          </div>
        `;
        return;
      }

      const seatStr = String(state.studentSeat);

      elements.pendingScoresList.innerHTML = pendingExams.map(exam => {
        const missingSeatsArr = Array.isArray(exam.missingSeats)
          ? exam.missingSeats.map(String)
          : (exam.missingSeats ? String(exam.missingSeats).split(/[,，\s]+/).filter(Boolean) : []);
        const isMissing = missingSeatsArr.includes(seatStr);

        let domainObj = DOMAINS_CONFIG.find(d => d.subjects.includes(exam.subject));
        const badgeColor = domainObj ? `${domainObj.color} text-white` : 'bg-slate-700 text-white';

        return `
          <div class="p-4 sm:p-5 rounded-2xl bg-amber-50/50 hover:bg-amber-50/80 border-2 border-amber-200 transition-all space-y-3 shadow-xs">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="px-2.5 py-0.5 rounded-lg text-xs font-black ${badgeColor}">
                  ${escapeHtml(exam.subject)}
                </span>
                <span class="text-sm sm:text-base font-black text-slate-900">
                  ${escapeHtml(exam.name)}
                </span>
                <span class="text-xs font-bold text-slate-500 font-mono flex items-center gap-1">
                  <i class="fa-solid fa-calendar-days text-slate-400"></i>
                  <span>${escapeHtml(exam.date || '今日')}</span>
                </span>
              </div>
              <div class="flex items-center gap-2">
                ${isMissing ? `
                  <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-300 animate-pulse flex items-center gap-1">
                    <i class="fa-solid fa-triangle-exclamation text-rose-600"></i>
                    <span>缺考（填寫後自動標註補考）</span>
                  </span>
                ` : `
                  <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 flex items-center gap-1">
                    <i class="fa-solid fa-hourglass-half text-amber-600"></i>
                    <span>待登記成績</span>
                  </span>
                `}
              </div>
            </div>

            <!-- Inline Score Form -->
            <form data-exam-id="${exam.id}" class="form-submit-pending flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2 border-t border-amber-200/60">
              <div class="w-full sm:w-28 flex-shrink-0">
                <input
                  type="number"
                  min="0"
                  max="100"
                  required
                  placeholder="分數 (0~100)"
                  class="input-pending-score w-full text-center text-sm font-black py-2 px-3 bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div class="w-full sm:w-36 flex-shrink-0">
                <select class="select-pending-correction w-full py-2 px-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-amber-500">
                  <option value="全對免訂正">全對免訂正</option>
                  <option value="已完成訂正" selected>已完成訂正</option>
                  <option value="待訂正/需請教">待訂正/需請教</option>
                </select>
              </div>

              <div class="flex-1 min-w-0">
                <input
                  type="text"
                  placeholder="${isMissing ? '備註（預設標註補考）' : '備註或錯題檢討心得（選填）'}"
                  value="${isMissing ? '補考' : ''}"
                  class="input-pending-remark w-full py-2 px-3 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <button
                type="submit"
                class="touch-target px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs shadow-md shadow-amber-600/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer flex-shrink-0"
              >
                <i class="fa-solid fa-check"></i>
                <span>填寫送出</span>
              </button>
            </form>
          </div>
        `;
      }).join('');

      // 綁定送出事件
      elements.pendingScoresList.querySelectorAll('.form-submit-pending').forEach(form => {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const examId = form.getAttribute('data-exam-id');
          const scoreVal = form.querySelector('.input-pending-score').value.trim();
          const corVal = form.querySelector('.select-pending-correction').value;
          const remarkVal = form.querySelector('.input-pending-remark').value.trim();

          await submitPendingExamScore(examId, scoreVal, corVal, remarkVal);
        });
      });
    }

    // 學生送出待填寫小考成績
    async function submitPendingExamScore(examId, scoreVal, correctionVal, remarkVal) {
      if (scoreVal === '' || isNaN(scoreVal) || Number(scoreVal) < 0 || Number(scoreVal) > 100) {
        showToast("請輸入 0 ~ 100 的有效小考成績！", "error");
        return;
      }

      const scoreNum = parseFloat(scoreVal);
      const curClass = state.classData;
      if (!curClass || !curClass.exams) return;

      const exam = curClass.exams.find(e => e.id === examId);
      if (!exam) {
        showToast("找不到此測驗項目！", "error");
        return;
      }

      const seatStr = String(state.studentSeat);
      const missingSeatsArr = Array.isArray(exam.missingSeats)
        ? exam.missingSeats.map(String)
        : (exam.missingSeats ? String(exam.missingSeats).split(/[,，\s]+/).filter(Boolean) : []);
      const isMakeup = missingSeatsArr.includes(seatStr);

      exam.submissions = exam.submissions || {};
      const now = new Date();
      const lastModifiedStr = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

      const newSubmission = {
        score: scoreNum,
        correction: correctionVal,
        remark: remarkVal || (isMakeup ? '補考' : ''),
        originalScore: null,
        lastModified: lastModifiedStr,
        isMakeup: Boolean(isMakeup),
        updatedAt: now.toISOString()
      };

      exam.submissions[seatStr] = newSubmission;

      // 同步更新本機 state.scores
      const newScoreRecord = {
        id: exam.id,
        examId: exam.id,
        subject: exam.subject,
        name: exam.name,
        date: exam.date,
        score: scoreNum,
        correction: correctionVal,
        remark: newSubmission.remark,
        originalScore: null,
        lastModified: lastModifiedStr,
        isMakeup: Boolean(isMakeup)
      };

      const existingIdx = state.scores.findIndex(s => s.id === exam.id || s.examId === exam.id);
      if (existingIdx !== -1) {
        state.scores[existingIdx] = newScoreRecord;
      } else {
        state.scores.unshift(newScoreRecord);
      }

      saveLocalState();
      renderScoresSection();

      // 同步至雲端 (parentClasses & userProfiles)
      try {
        if (state.accessCode) {
          const parentDocRef = doc(db, 'artifacts', APP_COLLECTION_ID, 'public', 'data', 'parentClasses', state.accessCode);
          await setDoc(parentDocRef, {
            exams: curClass.exams,
            updatedAt: now.toISOString()
          }, { merge: true });
        }
      } catch (err) {
        console.warn("Class exams sync warning:", err);
      }

      await syncScoresToCloud();
      showToast("成績填寫成功！已自動移至下方【測驗紀錄詳細明細】。", "success");
    }

    // 渲染【測驗紀錄詳細明細】清單
    function renderDetailedScoresList() {
      if (!elements.studentScoresList) return;
      const allScores = getCombinedScores();
      const today = getTodayDateString();

      const rangeVal = elements.filterScoreRange ? elements.filterScoreRange.value : "today";
      const correctionVal = elements.filterScoreCorrection ? elements.filterScoreCorrection.value : "all";
      const sortVal = elements.sortScoreOrder ? elements.sortScoreOrder.value : "date-desc";

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

      const customStart = elements.filterDateStart?.value || '';
      const customEnd = elements.filterDateEnd?.value || '';

      const selectedSubs = state.selectedSubjectsFilter || [];
      const hasSubFilter = selectedSubs.length > 0 && selectedSubs.length < ALL_21_SUBJECTS.length;

      let filtered = allScores.filter(s => {
        // 時間篩選
        if (rangeVal === "today" && s.date !== today) return false;
        if ((rangeVal === "7days" || rangeVal === "30days") && s.date < minDateStr) return false;
        if (rangeVal === "custom") {
          if (customStart && s.date < customStart) return false;
          if (customEnd && s.date > customEnd) return false;
        }

        // 科目複選篩選
        if (hasSubFilter && !selectedSubs.includes(s.subject)) return false;

        // 訂正狀態篩選
        if (correctionVal !== "all" && s.correction !== correctionVal) return false;

        return true;
      });

      // 排序
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

      if (elements.scoresCountBadge) {
        elements.scoresCountBadge.textContent = `${filtered.length} 筆測驗`;
      }

      if (filtered.length === 0) {
        elements.studentScoresList.innerHTML = `
          <div class="text-center py-10 text-slate-400 text-sm">
            <div class="w-12 h-12 rounded-full bg-slate-100 text-slate-300 mx-auto flex items-center justify-center text-xl mb-2">
              <i class="fa-solid fa-pen-ruler"></i>
            </div>
            查無符合條件的測驗紀錄<br>
            <span class="text-xs text-slate-400 mt-1 inline-block">可調整上方時間或科目複選條件！</span>
          </div>
        `;
        return;
      }

      elements.studentScoresList.innerHTML = filtered.map(s => {
        const scoreVal = parseFloat(s.score) || 0;
        let scoreColor = "text-emerald-600 bg-emerald-50 border-emerald-200";
        if (scoreVal < 60) {
          scoreColor = "text-rose-600 bg-rose-50 border-rose-200";
        } else if (scoreVal < 80) {
          scoreColor = "text-amber-600 bg-amber-50 border-amber-200";
        }

        let corBadge = "";
        if (s.correction === "全對免訂正") {
          corBadge = `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1"><i class="fa-solid fa-star text-emerald-600"></i> 全對免訂正</span>`;
        } else if (s.correction === "已完成訂正") {
          corBadge = `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-teal-100 text-teal-800 flex items-center gap-1"><i class="fa-solid fa-circle-check text-teal-600"></i> 已完成訂正</span>`;
        } else {
          corBadge = `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 flex items-center gap-1"><i class="fa-solid fa-pen text-rose-600"></i> 待訂正/需請教</span>`;
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
          <div class="exam-score-card p-3.5 sm:p-4 rounded-2xl bg-white hover:bg-slate-50/80 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors shadow-2xs">
            <div class="flex items-start sm:items-center gap-3 min-w-0">
              <!-- Score Box (Clickable to view 6 bracket analysis) -->
              <button
                type="button"
                data-exam-id="${s.examId || s.id}"
                class="btn-view-bracket touch-target w-12 h-12 rounded-2xl border-2 font-black text-lg flex items-center justify-center flex-shrink-0 cursor-pointer shadow-xs hover:scale-105 active:scale-95 transition-transform ${scoreColor}"
                title="點擊查看全班 6 大分數區段分析"
              >
                ${s.score}
              </button>

              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="px-2 py-0.5 rounded-md text-[10px] font-black bg-slate-100 text-slate-700 border border-slate-200">
                    ${escapeHtml(s.subject)}
                  </span>
                  <span class="font-extrabold text-slate-900 text-sm sm:text-base truncate">
                    ${escapeHtml(s.name)}
                  </span>
                  <span class="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                    <i class="fa-solid fa-calendar-days text-slate-400"></i>
                    <span>${escapeHtml(s.date || '')}</span>
                  </span>
                  ${isMakeupBadge}
                </div>

                <div class="flex items-center gap-2 mt-1 flex-wrap">
                  ${corBadge}
                  ${s.remark ? `<span class="text-xs text-slate-600 truncate"><i class="fa-regular fa-comment-dots text-slate-400 mr-1"></i>${escapeHtml(s.remark)}</span>` : ''}
                </div>

                <!-- 小字備註 -->
                ${modifiedNote}
              </div>
            </div>

            <!-- Actions: View Bracket & Edit -->
            <div class="flex items-center gap-2 self-end sm:self-center flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 w-full sm:w-auto justify-end">
              <button
                type="button"
                data-exam-id="${s.examId || s.id}"
                class="btn-view-bracket touch-target px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-bold border border-teal-200 flex items-center gap-1 cursor-pointer transition-colors"
                title="查看全班 6 大分數區段落點"
              >
                <i class="fa-solid fa-chart-column text-teal-600"></i>
                <span>全班區段</span>
              </button>

              <button
                type="button"
                data-exam-id="${s.examId || s.id}"
                class="btn-edit-my-score touch-target px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                title="編輯我的成績與備註"
              >
                <i class="fa-solid fa-pen text-slate-500"></i>
                <span>編輯</span>
              </button>
            </div>
          </div>
        `;
      }).join('');

      // 綁定點擊查看區段事件
      elements.studentScoresList.querySelectorAll('.btn-view-bracket').forEach(btn => {
        btn.addEventListener('click', () => {
          const examId = btn.getAttribute('data-exam-id');
          openScoreBracketModal(examId);
        });
      });

      // 綁定編輯成績事件
      elements.studentScoresList.querySelectorAll('.btn-edit-my-score').forEach(btn => {
        btn.addEventListener('click', () => {
          const examId = btn.getAttribute('data-exam-id');
          openEditMyScoreModal(examId);
        });
      });
    }

    // 打開【全班 6 大分數區段分析】彈窗
    function openScoreBracketModal(examId) {
      if (!elements.modalScoreBracketAnalysis) return;
      const combined = getCombinedScores();
      const myRecord = combined.find(s => s.id === examId || s.examId === examId);
      const curClass = state.classData;
      const exam = curClass?.exams?.find(e => e.id === examId) || myRecord?.examObj;

      const examTitle = exam ? exam.name : (myRecord?.name || '平時小考');
      const subject = exam ? exam.subject : (myRecord?.subject || '學科');
      const examDate = exam ? exam.date : (myRecord?.date || '');

      elements.bracketModalExamTitle.textContent = examTitle;
      elements.bracketModalSubjectBadge.textContent = subject;
      elements.bracketModalDate.textContent = `測驗日期：${examDate || '未定'}`;

      // 蒐集全班分數
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

      // 個人落點橫幅
      if (myScore !== null && elements.bracketModalMyScoreBanner) {
        elements.bracketModalMyScoreBanner.className = "p-3 rounded-2xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-extrabold flex items-center justify-between";
        elements.bracketModalMyScoreBanner.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="w-7 h-7 rounded-xl bg-teal-600 text-white flex items-center justify-center font-black">${myScore}</span>
            <span>您的成績：<strong>${myScore} 分</strong></span>
          </div>
          <span class="px-2 py-0.5 rounded-lg bg-teal-200 text-teal-800 text-[11px]">
            落點區段：【${segments[myBracketKey]?.label || ''}】
          </span>
        `;
        elements.bracketModalMyScoreBanner.classList.remove('hidden');
      } else if (elements.bracketModalMyScoreBanner) {
        elements.bracketModalMyScoreBanner.classList.add('hidden');
      }

      // 渲染 6 大區段進度條
      const bracketOrder = ['100', '90-99', '80-89', '70-79', '60-69', 'below-60'];
      elements.bracketModalBarsContainer.innerHTML = bracketOrder.map(key => {
        const seg = segments[key];
        const pct = totalSamples > 0 ? Math.round((seg.count / totalSamples) * 100) : 0;
        const isMyBracket = key === myBracketKey;

        return `
          <div class="p-2.5 rounded-xl border transition-all ${isMyBracket ? 'bg-teal-50/70 border-teal-400 ring-2 ring-teal-400/20' : 'bg-slate-50/50 border-slate-200/60'}">
            <div class="flex items-center justify-between text-xs mb-1.5 font-bold">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full ${seg.color}"></span>
                <span class="${isMyBracket ? 'text-teal-900 font-black' : 'text-slate-700'}">${seg.label}</span>
                ${isMyBracket ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-black bg-teal-600 text-white flex items-center gap-1"><i class="fa-solid fa-hand-point-left"></i> 本人</span>` : ''}
              </div>
              <span class="font-mono ${isMyBracket ? 'text-teal-800 font-black' : 'text-slate-600'}">
                ${seg.count} 人 (${pct}%)
              </span>
            </div>
            <div class="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
              <div class="h-full ${seg.color} rounded-full transition-all duration-500" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      }).join('');

      // 統計數據
      const avg = totalSamples > 0 ? (classScores.reduce((a, b) => a + b, 0) / totalSamples).toFixed(1) : '--';
      const highest = totalSamples > 0 ? Math.max(...classScores) : '--';
      const lowest = totalSamples > 0 ? Math.min(...classScores) : '--';

      elements.bracketModalClassAvg.textContent = `${avg} 分`;
      elements.bracketModalSampleCount.textContent = `${totalSamples} 筆`;
      elements.bracketModalHighest.textContent = `${highest} 分`;
      elements.bracketModalLowest.textContent = `${lowest} 分`;

      elements.modalScoreBracketAnalysis.classList.remove('hidden');
    }

    function closeScoreBracketModal() {
      if (elements.modalScoreBracketAnalysis) {
        elements.modalScoreBracketAnalysis.classList.add('hidden');
      }
    }

    // 打開【學生修改成績】彈窗
    function openEditMyScoreModal(examId) {
      if (!elements.modalEditMyScore) return;
      const combined = getCombinedScores();
      const record = combined.find(s => s.id === examId || s.examId === examId);
      if (!record) return;

      elements.editMyScoreExamId.value = record.examId || record.id;
      elements.editMyScoreExamTitle.textContent = `${record.subject} ｜ ${record.name}`;
      elements.editMyScoreVal.value = record.score;
      elements.editMyScoreCorrection.value = record.correction || "全對免訂正";
      elements.editMyScoreRemark.value = record.remark || "";

      elements.modalEditMyScore.classList.remove('hidden');
      setTimeout(() => elements.editMyScoreVal.focus(), 100);
    }

    function closeEditMyScoreModal() {
      if (elements.modalEditMyScore) {
        elements.modalEditMyScore.classList.add('hidden');
      }
    }

    // 儲存學生修改後的成績
    async function saveEditMyScore(e) {
      e.preventDefault();
      const examId = elements.editMyScoreExamId.value;
      const scoreVal = elements.editMyScoreVal.value.trim();
      const corVal = elements.editMyScoreCorrection.value;
      const remarkVal = elements.editMyScoreRemark.value.trim();

      if (scoreVal === '' || isNaN(scoreVal) || Number(scoreVal) < 0 || Number(scoreVal) > 100) {
        showToast("請輸入 0 ~ 100 的有效小考成績！", "error");
        return;
      }

      const scoreNum = parseFloat(scoreVal);
      const curClass = state.classData;
      const seatStr = String(state.studentSeat);
      const now = new Date();
      const lastModifiedStr = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

      // 檢查是否為教師端 exams 項目
      const exam = curClass?.exams?.find(e => e.id === examId);
      if (exam) {
        exam.submissions = exam.submissions || {};
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

        // 同步更新 parentClasses
        try {
          if (state.accessCode) {
            const parentDocRef = doc(db, 'artifacts', APP_COLLECTION_ID, 'public', 'data', 'parentClasses', state.accessCode);
            await setDoc(parentDocRef, {
              exams: curClass.exams,
              updatedAt: now.toISOString()
            }, { merge: true });
          }
        } catch (err) {
          console.warn("Update exam submission error:", err);
        }
      }

      // 同步更新本機 state.scores
      const idx = state.scores.findIndex(s => s.id === examId || s.examId === examId);
      if (idx !== -1) {
        const orig = (state.scores[idx].originalScore !== null && state.scores[idx].originalScore !== undefined)
          ? state.scores[idx].originalScore
          : state.scores[idx].score;
        state.scores[idx].score = scoreNum;
        state.scores[idx].correction = corVal;
        state.scores[idx].remark = remarkVal;
        state.scores[idx].originalScore = orig;
        state.scores[idx].lastModified = lastModifiedStr;
      }

      saveLocalState();
      renderScoresSection();
      await syncScoresToCloud();

      closeEditMyScoreModal();
      showToast("成績修改成功！已更新最後修改時間與原分數紀錄。", "success");
    }

    // 初始化【科目複選】彈窗內容
    function initMultiSubjectFilter() {
      if (!elements.multiSubjectCheckboxesContainer) return;
      if (!state.selectedSubjectsFilter || state.selectedSubjectsFilter.length === 0) {
        state.selectedSubjectsFilter = [...ALL_21_SUBJECTS];
      }

      elements.multiSubjectCheckboxesContainer.innerHTML = DOMAINS_CONFIG.map(domain => {
        return `
          <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-2">
            <div class="flex items-center justify-between text-xs font-extrabold text-slate-800">
              <div class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full ${domain.color}"></span>
                <span>${domain.name}</span>
              </div>
              <button type="button" class="btn-domain-select-all text-[11px] text-teal-600 hover:underline cursor-pointer" data-domain="${domain.id}">
                該領域全選
              </button>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              ${domain.subjects.map(sub => {
                const isChecked = state.selectedSubjectsFilter.includes(sub);
                return `
                  <label class="flex items-center gap-1.5 p-1.5 rounded-xl hover:bg-white cursor-pointer text-xs font-bold text-slate-700 select-none">
                    <input type="checkbox" value="${escapeHtml(sub)}" class="chk-multi-sub accent-teal-600 w-4 h-4 rounded" ${isChecked ? 'checked' : ''}>
                    <span class="truncate">${escapeHtml(sub)}</span>
                  </label>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }).join('');

      // 領域全選按鈕
      elements.multiSubjectCheckboxesContainer.querySelectorAll('.btn-domain-select-all').forEach(btn => {
        btn.addEventListener('click', () => {
          const domId = btn.getAttribute('data-domain');
          const dom = DOMAINS_CONFIG.find(d => d.id === domId);
          if (dom) {
            const container = btn.closest('.p-3');
            container.querySelectorAll('.chk-multi-sub').forEach(chk => chk.checked = true);
            updateMultiSubBadge();
          }
        });
      });

      // 核取框改變計數
      elements.multiSubjectCheckboxesContainer.querySelectorAll('.chk-multi-sub').forEach(chk => {
        chk.addEventListener('change', updateMultiSubBadge);
      });

      updateMultiSubBadge();
    }

    function updateMultiSubBadge() {
      if (!elements.multiSubjectCheckboxesContainer) return;
      const checkedCount = elements.multiSubjectCheckboxesContainer.querySelectorAll('.chk-multi-sub:checked').length;
      if (elements.multiSubSelectedCountBadge) {
        elements.multiSubSelectedCountBadge.textContent = `已選 ${checkedCount} / 21 科`;
      }
    }

    function updateMultiSubjectBtnLabel() {
      if (!elements.multiSubjectBtnLabel) return;
      const sel = state.selectedSubjectsFilter || [];
      if (sel.length === 0 || sel.length === ALL_21_SUBJECTS.length) {
        elements.multiSubjectBtnLabel.textContent = "篩選科目 (全部 21 科)";
      } else {
        elements.multiSubjectBtnLabel.textContent = `篩選科目 (已選 ${sel.length} 科)`;
      }
    }

    // 總成績區塊綜合渲染
    function renderScoresSection() {
      const allScores = getCombinedScores();
      const today = getTodayDateString();
      const todayScores = allScores.filter(s => s.date === today);

      if (elements.tabScoresCountBadge) {
        elements.tabScoresCountBadge.textContent = `${todayScores.length}`;
      }
      if (elements.scoresCountBadge) {
        elements.scoresCountBadge.textContent = `${allScores.length} 筆測驗`;
      }
      if (elements.statTotalTestsCount) {
        elements.statTotalTestsCount.textContent = `${allScores.length}`;
      }
      if (elements.statTodayTestsSub) {
        elements.statTodayTestsSub.textContent = `今日 ${todayScores.length} 筆`;
      }

      if (allScores.length === 0) {
        if (elements.statOverallAvg) elements.statOverallAvg.textContent = '--';
        if (elements.statOverallGrade) elements.statOverallGrade.textContent = '尚無紀錄';
        if (elements.statHighestScore) elements.statHighestScore.textContent = '--';
        if (elements.statHighestSubject) elements.statHighestSubject.textContent = '--';
        if (elements.statCorrectionRate) elements.statCorrectionRate.textContent = '--%';
        if (elements.statCorrectionSub) elements.statCorrectionSub.textContent = '0 筆待訂正';
      } else {
        const totalScore = allScores.reduce((sum, s) => sum + (parseFloat(s.score) || 0), 0);
        const overallAvg = (totalScore / allScores.length).toFixed(1);
        if (elements.statOverallAvg) elements.statOverallAvg.textContent = `${overallAvg}`;

        let grade = "需加油";
        if (overallAvg >= 90) grade = "優等 (A+)";
        else if (overallAvg >= 80) grade = "甲等 (A)";
        else if (overallAvg >= 70) grade = "乙等 (B)";
        else if (overallAvg >= 60) grade = "丙等 (C)";
        if (elements.statOverallGrade) elements.statOverallGrade.textContent = grade;

        let highest = allScores[0];
        allScores.forEach(s => {
          if ((parseFloat(s.score) || 0) > (parseFloat(highest.score) || 0)) {
            highest = s;
          }
        });
        if (elements.statHighestScore) elements.statHighestScore.textContent = `${highest.score}分`;
        if (elements.statHighestSubject) elements.statHighestSubject.textContent = `${highest.subject} (${highest.name || ''})`;

        const completedCor = allScores.filter(s => s.correction === "全對免訂正" || s.correction === "已完成訂正").length;
        const corRate = Math.round((completedCor / allScores.length) * 100);
        const pendingCor = allScores.length - completedCor;
        if (elements.statCorrectionRate) elements.statCorrectionRate.textContent = `${corRate}%`;
        if (elements.statCorrectionSub) elements.statCorrectionSub.textContent = `${pendingCor} 筆待訂正`;
      }

      // 篩選套用至走勢圖 (依時間與科目複選)
      const selectedSubs = state.selectedSubjectsFilter || [];
      const hasSubFilter = selectedSubs.length > 0 && selectedSubs.length < ALL_21_SUBJECTS.length;
      let trendFiltered = allScores;
      if (hasSubFilter) {
        trendFiltered = trendFiltered.filter(s => selectedSubs.includes(s.subject));
      }

      renderPendingScoresSection();
      renderScoreTrendChart(trendFiltered);
      renderSubjectAnalytics(allScores);
      updateMultiSubjectBtnLabel();
      renderDetailedScoresList();
    }

    function updateSubjectButtons(selectedSub) {
      if (!elements.subjectPickerGroup) return;
      elements.subjectPickerGroup.querySelectorAll('.sub-btn').forEach(btn => {
        const sub = btn.getAttribute('data-sub');
        if (sub === selectedSub) {
          btn.className = "sub-btn px-2.5 py-1.5 rounded-xl border-2 border-emerald-600 bg-emerald-50 text-emerald-800 text-xs font-black shadow-xs transition-all cursor-pointer";
        } else {
          btn.className = "sub-btn px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold hover:border-emerald-500 hover:bg-emerald-50 bg-white text-slate-700 transition-all cursor-pointer";
        }
      });
    }

    function updateCorrectionButtons() {
      if (!elements.correctionPickerGroup) return;
      elements.correctionPickerGroup.querySelectorAll('.cor-btn').forEach(btn => {
        const cor = btn.getAttribute('data-cor');
        if (cor === selectedModalCorrection) {
          btn.className = "cor-btn p-2 rounded-xl border-2 border-emerald-600 bg-emerald-50 text-emerald-800 text-xs font-black shadow-xs transition-all cursor-pointer";
        } else {
          btn.className = "cor-btn p-2 rounded-xl border border-slate-200 text-xs font-extrabold hover:border-emerald-500 bg-white text-slate-700 transition-all cursor-pointer";
        }
      });
    }

    function openScoreModal(editItem = null) {
      if (!elements.scoreModal) return;
      if (editItem) {
        if (elements.scoreModalTitle) elements.scoreModalTitle.textContent = "編輯成績紀錄";
        if (elements.editScoreId) elements.editScoreId.value = editItem.id || "";
        if (elements.inputScoreSubject) elements.inputScoreSubject.value = editItem.subject || "國語文";
        if (elements.inputScoreName) elements.inputScoreName.value = editItem.name || "";
        if (elements.inputScoreVal) elements.inputScoreVal.value = (editItem.score !== undefined && editItem.score !== null) ? editItem.score : "";
        if (elements.inputScoreRemark) elements.inputScoreRemark.value = editItem.remark || "";
        selectedModalCorrection = editItem.correction || "全對免訂正";
        updateSubjectButtons(editItem.subject || "國語文");
      } else {
        if (elements.scoreModalTitle) elements.scoreModalTitle.textContent = "登記小考／作業成績";
        if (elements.editScoreId) elements.editScoreId.value = "";
        if (elements.inputScoreSubject) elements.inputScoreSubject.value = "國語文";
        if (elements.inputScoreName) elements.inputScoreName.value = "";
        if (elements.inputScoreVal) elements.inputScoreVal.value = "";
        if (elements.inputScoreRemark) elements.inputScoreRemark.value = "";
        selectedModalCorrection = "全對免訂正";
        updateSubjectButtons("國語文");
      }
      updateCorrectionButtons();
      elements.scoreModal.classList.remove("hidden");
    }

    function closeScoreModal() {
      if (elements.scoreModal) {
        elements.scoreModal.classList.add("hidden");
      }
    }

    function saveScoreFromModal() {
      const subject = elements.inputScoreSubject.value.trim() || "綜合";
      const name = elements.inputScoreName.value.trim();
      const score = elements.inputScoreVal.value.trim();
      const remark = elements.inputScoreRemark.value.trim();
      const editId = elements.editScoreId.value;

      if (!name) {
        showToast("請輸入測驗名稱或課次！", "error");
        elements.inputScoreName.focus();
        return;
      }
      if (score === "" || isNaN(score) || score < 0 || score > 100) {
        showToast("請輸入 0 ~ 100 的有效分數！", "error");
        elements.inputScoreVal.focus();
        return;
      }

      const today = getTodayDateString();

      if (editId) {
        const idx = state.scores.findIndex(s => s.id === editId);
        if (idx !== -1) {
          state.scores[idx] = {
            ...state.scores[idx],
            subject,
            name,
            score: parseFloat(score),
            correction: selectedModalCorrection,
            remark
          };
          showToast("成績修改成功！", "success");
        }
      } else {
        const newRecord = {
          id: "score_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
          date: today,
          subject,
          name,
          score: parseFloat(score),
          correction: selectedModalCorrection,
          remark
        };
        state.scores.unshift(newRecord);
        showToast("成績登記成功！", "success");
      }

      saveLocalState();
      renderScoresSection();
      syncScoresToCloud();
      closeScoreModal();
    }

    // ==========================================
    // MODULE 3: 7-DAY CONTACT BOOK & UNFINISHED BADGE
    // ==========================================

    function updateContactUnfinishedBadge() {
      if (!elements.contactUnfinishedBadge) return;
      const todayStr = getTodayDateString();
      const contactBook = state.classData?.contactBook || {};
      const todayEntries = contactBook[todayStr] || [];
      const unfinishedContact = todayEntries.filter((_, idx) => !state.contactChecks?.[`${todayStr}_${idx}`]).length;

      const totalUnfinished = unfinishedContact;

      if (totalUnfinished > 0) {
        elements.contactUnfinishedBadge.textContent = String(totalUnfinished);
        elements.contactUnfinishedBadge.className = "px-2 py-0.5 text-[10px] font-black rounded-full bg-rose-500 text-white animate-pulse";
        elements.contactUnfinishedBadge.classList.remove('hidden');
      } else {
        elements.contactUnfinishedBadge.textContent = "";
        elements.contactUnfinishedBadge.classList.add('hidden');
      }
    }

    function renderContactBookSection(data) {
      const contactBook = data.contactBook || {};
      const dates = [];
      const today = new Date();

      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        
        const dateEntries = contactBook[dateStr] || [];
        const hasEntries = dateEntries.length > 0;
        // 若已經全部打勾或無事項，綠色點點消失；若尚有未完成事項，才顯示點點
        const hasUncompleted = hasEntries && dateEntries.some((_, idx) => !state.contactChecks?.[`${dateStr}_${idx}`]);
        
        dates.push({
          dateStr: dateStr,
          dayOfWeek: getDayOfWeekName(d),
          shortDate: `${d.getMonth() + 1}/${d.getDate()}`,
          isToday: i === 0,
          hasEntries: hasEntries,
          hasUncompleted: hasUncompleted
        });
      }

      if (!state.selectedContactDate || !dates.some(d => d.dateStr === state.selectedContactDate)) {
        state.selectedContactDate = dates[dates.length - 1].dateStr;
      }

      elements.contactDateSlider.innerHTML = dates.map(d => {
        const isSelected = d.dateStr === state.selectedContactDate;
        const activeClass = isSelected
          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20 border-emerald-600'
          : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-200';

        return `
          <button
            type="button"
            data-date="${d.dateStr}"
            class="contact-date-btn touch-target flex-1 min-w-[72px] sm:min-w-[84px] py-2.5 px-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-center relative cursor-pointer ${activeClass}"
          >
            <span class="text-[10px] sm:text-xs font-semibold ${isSelected ? 'text-emerald-100' : 'text-slate-400'}">
              ${d.isToday ? '今天' : d.dayOfWeek}
            </span>
            <span class="text-xs sm:text-sm font-extrabold mt-0.5">
              ${d.shortDate}
            </span>
            ${d.hasUncompleted ? `
              <span class="w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-emerald-200' : 'bg-emerald-500'} absolute top-2 right-2"></span>
            ` : ''}
          </button>
        `;
      }).join('');

      elements.contactDateSlider.querySelectorAll('.contact-date-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          state.selectedContactDate = btn.getAttribute('data-date');
          renderContactBookSection(data);
          renderMoodJournalSection();
        });
      });

      const activeDateStr = state.selectedContactDate;
      const activeObj = dates.find(d => d.dateStr === activeDateStr);
      elements.selectedDateLabel.textContent = `${activeDateStr} (${activeObj ? activeObj.dayOfWeek : ''})`;

      const entries = contactBook[activeDateStr] || [];
      elements.contactEntriesCount.textContent = `共 ${entries.length} 則`;

      if (entries.length === 0) {
        elements.contactBookContainer.innerHTML = `
          <div class="text-center py-8 text-slate-400 text-sm">
            <i class="fa-regular fa-calendar-xmark text-2xl mb-1.5 block text-slate-300"></i>
            該日無特殊聯絡或公告事項
          </div>
        `;
      } else {
        const itemsHtml = `
          <div class="space-y-1.5">
            ${entries.map((entry, idx) => {
              const text = typeof entry === 'string' ? entry : (entry.text || '');
              const checkKey = `${activeDateStr}_${idx}`;
              const isChecked = Boolean(state.contactChecks?.[checkKey]);

              return `
                <div class="flex items-center gap-2.5 py-1.5 px-3 rounded-xl border transition-all ${
                  isChecked
                    ? 'bg-emerald-50/60 border-emerald-300'
                    : 'bg-white border-slate-200/80 shadow-2xs'
                }">
                  <button
                    type="button"
                    data-check-key="${checkKey}"
                    class="btn-contact-item-check checkbox-bounce w-[20px] h-[20px] rounded-md flex items-center justify-center transition-all border cursor-pointer shrink-0 ${
                      isChecked
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xs'
                        : 'bg-white border-slate-300 text-transparent hover:border-emerald-400'
                    }"
                    title="標記此事項已完成"
                  >
                    <i class="fa-solid fa-check text-[10px]"></i>
                  </button>
                  <div class="text-sm font-bold leading-snug flex-1 break-words ${isChecked ? 'text-slate-500' : 'text-slate-800'}">
                    ${escapeHtml(text.trim())}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;

        elements.contactBookContainer.innerHTML = itemsHtml;

        // 綁定聯絡簿事項打勾事件
        elements.contactBookContainer.querySelectorAll('.btn-contact-item-check').forEach(btn => {
          btn.addEventListener('click', () => {
            const key = btn.getAttribute('data-check-key');
            state.contactChecks = state.contactChecks || {};
            state.contactChecks[key] = !state.contactChecks[key];
            saveLocalState();
            renderContactBookSection(data);
            updateContactUnfinishedBadge();
            if (state.contactChecks[key]) {
              showToast("已標記此聯絡事項完成！", "success");
            }
          });
        });
      }

      updateContactUnfinishedBadge();
    }

    function normalizeMood(m) {
      if (!m) return "開心";
      if (m.includes("雀躍") || m.includes("開心收穫") || m.includes("衝勁十足")) return "雀躍";
      if (m.includes("開心") || m.includes("充實愉快")) return "開心";
      if (m.includes("普通") || m.includes("努力思考")) return "普通";
      if (m.includes("難過") || m.includes("有點疲憊")) return "難過";
      if (m.includes("悲傷")) return "悲傷";
      return m;
    }

    function renderMoodJournalSection(fromUserSelection = false) {
      const activeDate = state.selectedContactDate || getTodayDateString();
      const currentMood = state.moodJournal[activeDate] || { mood: "開心", text: "" };
      if (!fromUserSelection) {
        selectedMood = normalizeMood(currentMood.mood);
      } else {
        selectedMood = normalizeMood(selectedMood);
      }

      // Update buttons
      elements.moodPickerGroup.querySelectorAll('.mood-btn').forEach(btn => {
        const val = btn.getAttribute('data-mood');
        if (val === selectedMood) {
          btn.className = "mood-btn touch-target p-2.5 rounded-2xl border-2 border-teal-600 bg-teal-50 text-teal-900 text-center transition-all cursor-pointer text-xs font-black shadow-sm ring-2 ring-teal-500/20";
        } else {
          btn.className = "mood-btn touch-target p-2.5 rounded-2xl border border-slate-200 text-slate-700 text-center hover:bg-slate-50 transition-all cursor-pointer text-xs font-bold bg-white";
        }
      });

      if (!fromUserSelection) {
        elements.moodJournalTextarea.value = currentMood.text || "";
      }
    }

    function saveMoodJournal() {
      const activeDate = state.selectedContactDate || getTodayDateString();
      const text = elements.moodJournalTextarea.value.trim();
      state.moodJournal = state.moodJournal || {};
      state.moodJournal[activeDate] = {
        mood: selectedMood || "開心",
        text: text
      };
      saveLocalState();
      syncScoresToCloud();
      showToast("已成功儲存今日心情札記！", "success");
    }

    // ==========================================
    // EVENT LISTENERS
    // ==========================================

    function setupEventListeners() {
      // Login Form Submit
      elements.accessCodeForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const code = elements.inputAccessCode.value.trim();
        if (code) connectToClass(code);
      });

      // Tab Switching
      elements.tabHwBtn.addEventListener("click", () => switchTab("hw"));
      elements.tabScoresBtn.addEventListener("click", () => switchTab("scores"));
      elements.tabContactBtn.addEventListener("click", () => switchTab("contact"));

      // Settings Modal
      elements.openSettingsBtn.addEventListener("click", () => elements.settingsModal.classList.remove("hidden"));
      elements.navSeatBtn.addEventListener("click", () => elements.settingsModal.classList.remove("hidden"));
      elements.closeSettingsModalBtn.addEventListener("click", () => elements.settingsModal.classList.add("hidden"));
      elements.saveSettingsBtn.addEventListener("click", () => {
        const chosen = elements.modalSeatSelect.value;
        if (chosen) setStudentSeat(chosen);
        elements.settingsModal.classList.add("hidden");
      });

      elements.switchClassModalBtn.addEventListener("click", () => {
        showInAppConfirm({
          title: "退出班級確認",
          message: "確定要切換到其他班級代碼嗎？更換後需重新輸入新班級代碼。",
          confirmText: "確定退出",
          isDanger: true,
          onConfirm: () => {
            if (state.accessCode) {
              const seatKey = getStudentSeatStorageKey(state.accessCode);
              if (seatKey) localStorage.removeItem(seatKey);
            }
            localStorage.removeItem(LS_ACCESS_CODE_KEY);
            state.accessCode = "";
            state.studentSeat = null;
            state.classData = null;
            elements.settingsModal.classList.add("hidden");
            const url = new URL(window.location);
            url.searchParams.delete("code");
            url.searchParams.delete("seat");
            window.history.replaceState({}, "", url);
            showLoginView();
          }
        });
      });

      // Subject Collapsible Toggle
      function toggleDetailedSubjects() {
        const container = elements.detailedSubjectPickerContainer;
        const text = elements.textToggleDetailedSubjects;
        const icon = elements.iconToggleDetailedSubjects;
        if (!container) return;
        const isHidden = container.classList.contains("hidden");
        if (isHidden) {
          container.classList.remove("hidden");
          if (text) text.textContent = "收合 21 門詳細分類";
          if (icon) icon.className = "fa-solid fa-chevron-up text-[10px] transition-transform";
        } else {
          container.classList.add("hidden");
          if (text) text.textContent = "展開 21 門詳細分類";
          if (icon) icon.className = "fa-solid fa-chevron-down text-[10px] transition-transform";
        }
      }
      elements.btnToggleDetailedSubjects?.addEventListener("click", toggleDetailedSubjects);
      elements.btnCloseDetailedSubjects?.addEventListener("click", toggleDetailedSubjects);

      // PWA Installation & Service Worker Registration
      let deferredInstallPrompt = null;

      function updatePwaInstallState() {
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        if (isStandalone) {
          if (elements.pwaInstallBadge) {
            elements.pwaInstallBadge.textContent = "已安裝為桌面 App";
            elements.pwaInstallBadge.className = "px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800";
            elements.pwaInstallBadge.classList.remove("hidden");
          }
          if (elements.pwaInstallBtnText) {
            elements.pwaInstallBtnText.textContent = "已安裝為桌面 App（可離線使用）";
          }
        }
      }

      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
        if (elements.pwaInstallBadge) {
          elements.pwaInstallBadge.textContent = "可一鍵安裝";
          elements.pwaInstallBadge.classList.remove("hidden");
        }
      });

      window.addEventListener('appinstalled', () => {
        deferredInstallPrompt = null;
        updatePwaInstallState();
        showToast("恭喜！學生數位聯絡簿已成功安裝至您的桌面/主畫面", "success");
      });

      const isIos = () => {
        const userAgent = window.navigator.userAgent.toLowerCase();
        return /iphone|ipad|ipod/.test(userAgent);
      };

      if (elements.btnPwaInstall) {
        elements.btnPwaInstall.addEventListener("click", async () => {
          const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
          if (isStandalone) {
            showToast("您目前已在使用桌面 App 模式！", "info");
            return;
          }

          if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            const { outcome } = await deferredInstallPrompt.userChoice;
            if (outcome === 'accepted') {
              showToast("感謝安裝！已將學生數位聯絡簿新增至主畫面", "success");
            }
            deferredInstallPrompt = null;
          } else if (isIos()) {
            elements.modalIosPwaGuide?.classList.remove("hidden");
          } else {
            showInAppConfirm({
              title: "安裝為桌面應用程式 (PWA)",
              message: "若瀏覽器未自動彈出安裝視窗，請點選瀏覽器網址列右側的「安裝」圖示，或至瀏覽器右上角選單點選「安裝學生數位聯絡簿」/「加到主畫面」即可完成！",
              confirmText: "我知道了",
              onConfirm: () => {}
            });
          }
        });
      }

      elements.closeIosPwaGuideBtn?.addEventListener("click", () => elements.modalIosPwaGuide?.classList.add("hidden"));
      elements.confirmIosPwaGuideBtn?.addEventListener("click", () => elements.modalIosPwaGuide?.classList.add("hidden"));

      // Register SW
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW register failed:', err));
        });
      }

      updatePwaInstallState();

      // Student Scores Auth Form Submit
      if (elements.studentPinAuthForm) {
        elements.studentPinAuthForm.addEventListener("submit", (e) => {
          e.preventDefault();
          const inputPin = elements.inputStudentAuthPin.value.trim().toUpperCase();
          const teacherPin = getTeacherConfiguredPin(state.studentSeat);

          if (inputPin && teacherPin && inputPin === teacherPin) {
            const authKey = "student_auth_verified_" + state.accessCode + "_" + state.studentSeat;
            const pinKey = "student_auth_pin_" + state.accessCode + "_" + state.studentSeat;
            localStorage.setItem(authKey, "true");
            localStorage.setItem(pinKey, teacherPin);

            elements.studentPinErrorBox.classList.add('hidden');
            elements.studentScoresLockedView.classList.add('hidden');
            elements.studentScoresUnlockedView.classList.remove('hidden');

            showToast("驗證成功！此裝置已完成安全綁定，日後免密直開。", "success");
            renderScoresSection();
          } else {
            elements.studentPinErrorBox.classList.remove('hidden');
            elements.studentPinErrorMsg.textContent = "PIN 碼不正確！若忘記請聯繫導師重設。";
            elements.inputStudentAuthPin.focus();
          }
        });
      }

      // Toggle PIN visibility
      if (elements.btnToggleStudentAuthPin) {
        elements.btnToggleStudentAuthPin.addEventListener("click", () => {
          const isPass = elements.inputStudentAuthPin.type === "password";
          elements.inputStudentAuthPin.type = isPass ? "text" : "password";
          elements.iconStudentPinEye.className = isPass ? "fa-regular fa-eye-slash text-sm" : "fa-regular fa-eye text-sm";
        });
      }

      // Relock scores button
      if (elements.btnRelockScores) {
        elements.btnRelockScores.addEventListener("click", () => {
          const authKey = "student_auth_verified_" + state.accessCode + "_" + state.studentSeat;
          localStorage.removeItem(authKey);
          checkStudentScoresAuth();
          showToast("已重新上鎖成績系統（防窺保護模式）", "info");
        });
      }

      // Score Modal Buttons
      elements.btnOpenAddScore?.addEventListener("click", () => {
        if (!checkStudentScoresAuth()) {
          showToast("請先驗證專屬 PIN 碼解鎖成績系統！", "warning");
          elements.inputStudentAuthPin?.focus();
          return;
        }
        openScoreModal(null);
      });
      elements.closeScoreModalBtn?.addEventListener("click", closeScoreModal);
      elements.cancelScoreModalBtn?.addEventListener("click", closeScoreModal);
      elements.saveScoreModalBtn?.addEventListener("click", saveScoreFromModal);

      // Subject preset buttons & input sync
      elements.subjectPickerGroup?.querySelectorAll('.sub-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const sub = btn.getAttribute('data-sub');
          if (elements.inputScoreSubject) elements.inputScoreSubject.value = sub;
          updateSubjectButtons(sub);
        });
      });

      elements.inputScoreSubject?.addEventListener('input', () => {
        updateSubjectButtons(elements.inputScoreSubject.value.trim());
      });

      // Domain analytics filter
      if (elements.domainAnalyticsFilter) {
        elements.domainAnalyticsFilter.querySelectorAll('.domain-filter-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const domain = btn.getAttribute('data-domain');
            activeDomainFilter = domain;
            elements.domainAnalyticsFilter.querySelectorAll('.domain-filter-btn').forEach(b => {
              if (b === btn) {
                b.className = "domain-filter-btn px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-extrabold cursor-pointer";
              } else {
                b.className = "domain-filter-btn px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer";
              }
            });
            renderSubjectAnalytics(state.scores || []);
          });
        });
      }

      // History filters & sort
      elements.filterScoreRange?.addEventListener('change', () => {
        const val = elements.filterScoreRange.value;
        if (val === 'custom') {
          elements.filterCustomDateContainer?.classList.remove('hidden');
        } else {
          elements.filterCustomDateContainer?.classList.add('hidden');
        }
        renderScoresSection();
      });
      elements.filterDateStart?.addEventListener('change', renderScoresSection);
      elements.filterDateEnd?.addEventListener('change', renderScoresSection);
      elements.filterScoreSubject?.addEventListener('change', renderScoresSection);
      elements.filterScoreCorrection?.addEventListener('change', renderScoresSection);
      elements.sortScoreOrder?.addEventListener('change', renderScoresSection);

      // Multi-Subject Filter Modal Bindings
      elements.btnOpenMultiSubject?.addEventListener('click', () => {
        initMultiSubjectFilter();
        elements.modalMultiSubjectFilter?.classList.remove('hidden');
      });
      elements.btnCloseMultiSubjectModal?.addEventListener('click', () => {
        elements.modalMultiSubjectFilter?.classList.add('hidden');
      });
      elements.btnCancelMultiSubject?.addEventListener('click', () => {
        elements.modalMultiSubjectFilter?.classList.add('hidden');
      });
      elements.btnSubSelectAll?.addEventListener('click', () => {
        elements.multiSubjectCheckboxesContainer?.querySelectorAll('.chk-multi-sub').forEach(c => c.checked = true);
        updateMultiSubBadge();
      });
      elements.btnSubClearAll?.addEventListener('click', () => {
        elements.multiSubjectCheckboxesContainer?.querySelectorAll('.chk-multi-sub').forEach(c => c.checked = false);
        updateMultiSubBadge();
      });
      elements.btnApplyMultiSubject?.addEventListener('click', () => {
        const checkedVals = Array.from(elements.multiSubjectCheckboxesContainer?.querySelectorAll('.chk-multi-sub:checked') || []).map(c => c.value);
        if (checkedVals.length === 0) {
          showToast("請至少選擇 1 門科目進行篩選！", "warning");
          return;
        }
        state.selectedSubjectsFilter = checkedVals;
        saveLocalState();
        elements.modalMultiSubjectFilter?.classList.add('hidden');
        renderScoresSection();
        showToast(`已套用科目篩選 (${checkedVals.length} 科)`, "info");
      });

      // Score Bracket Modal Bindings
      elements.btnCloseBracketModal?.addEventListener('click', closeScoreBracketModal);
      elements.btnDoneBracketModal?.addEventListener('click', closeScoreBracketModal);

      // Edit My Score Modal Bindings
      elements.btnCloseEditMyScoreModal?.addEventListener('click', closeEditMyScoreModal);
      elements.btnCancelEditMyScore?.addEventListener('click', closeEditMyScoreModal);
      elements.formEditMyScore?.addEventListener('submit', saveEditMyScore);

      // Correction preset buttons
      elements.correctionPickerGroup?.querySelectorAll('.cor-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedModalCorrection = btn.getAttribute('data-cor');
          updateCorrectionButtons();
        });
      });

      // Mood preset buttons
      elements.moodPickerGroup?.querySelectorAll('.mood-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedMood = btn.getAttribute('data-mood');
          renderMoodJournalSection(true);
        });
      });

      elements.btnSaveMoodJournal?.addEventListener("click", saveMoodJournal);

      // Modal backdrop click bindings
      elements.modalScoreBracketAnalysis?.addEventListener('click', (e) => {
        if (e.target === elements.modalScoreBracketAnalysis) closeScoreBracketModal();
      });
      elements.scoreModal?.addEventListener('click', (e) => {
        if (e.target === elements.scoreModal) closeScoreModal();
      });
      elements.modalEditMyScore?.addEventListener('click', (e) => {
        if (e.target === elements.modalEditMyScore) closeEditMyScoreModal();
      });
      elements.modalMultiSubjectFilter?.addEventListener('click', (e) => {
        if (e.target === elements.modalMultiSubjectFilter) elements.modalMultiSubjectFilter.classList.add('hidden');
      });
    }

    function switchTab(tabName) {
      if (tabName === "scores" && !ENABLE_SCORES_FEATURE) {
        tabName = "hw";
      }
      state.activeTab = tabName;
      const tabs = [
        { name: "hw", btn: elements.tabHwBtn, panel: elements.panelHomework },
        { name: "scores", btn: elements.tabScoresBtn, panel: elements.panelScores },
        { name: "contact", btn: elements.tabContactBtn, panel: elements.panelContact }
      ];

      tabs.forEach(t => {
        if (t.name === "scores" && !ENABLE_SCORES_FEATURE) {
          t.panel?.classList.add("hidden");
          t.btn?.classList.add("hidden");
          return;
        }
        if (t.name === tabName) {
          t.panel.classList.remove("hidden");
          t.btn.className = "flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-extrabold transition-all bg-white text-emerald-700 shadow-sm flex items-center justify-center gap-2 cursor-pointer";
        } else {
          t.panel.classList.add("hidden");
          t.btn.className = "flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-extrabold transition-all text-slate-600 hover:text-slate-900 flex items-center justify-center gap-2 cursor-pointer";
        }
      });

      if (tabName === "scores") {
        checkStudentScoresAuth();
      }
    }

    // Run on start
    init();
