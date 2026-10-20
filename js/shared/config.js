/**
 * 班級經營系統 — 三合一架構共用核心設定 (Shared Config)
 * 統一管理三端（教師端、家長端、學生端）之 Firebase 連線、集合命名空間與專案常數
 */

export const APP_VERSION = 'v4.4.0-unified';

// Firebase 資料庫命名空間 (支援透過 window.__app_id 或本機快取切換)
export const globalAppId = typeof window !== 'undefined' && typeof window.__app_id !== 'undefined'
    ? window.__app_id 
    : (typeof localStorage !== 'undefined' && localStorage.getItem('app_collection_id')) || 'homework-checker-pro';

// 取得三合一倉庫相對與絕對網址工具
export const getBaseRepoUrl = () => {
    if (typeof window === 'undefined') return '/';
    if (window.location.hostname.endsWith('github.io')) {
        const pathSegments = window.location.pathname.split('/').filter(Boolean);
        const repoName = pathSegments[0] || 'ian_class_management';
        return `${window.location.origin}/${repoName}/`;
    }
    const path = window.location.pathname;
    const dir = path.substring(0, path.lastIndexOf('/') + 1);
    return `${window.location.origin}${dir}`;
};

export const TEACHER_DASHBOARD_URL = `${getBaseRepoUrl()}index.html`;
export const PARENT_DASHBOARD_URL = `${getBaseRepoUrl()}parent.html`;
export const STUDENT_DASHBOARD_URL = `${getBaseRepoUrl()}student.html`;

// Firebase 專案連線憑證
export const firebaseConfig = {
    apiKey: "AIzaSyDuBAZ5hEcrhpYt-XjhiXfi-wuow0Cq83A",
    authDomain: "cheker-barcode.firebaseapp.com",
    projectId: "cheker-barcode",
    storageBucket: "cheker-barcode.firebasestorage.app",
    messagingSenderId: "1093592859159",
    appId: "1:1093592859159:web:40c0741defbb074e4ad252"
};
