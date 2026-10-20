export const DEFAULT_TYPES = [
    { 
        id: 'default', 
        name: '一般作業', 
        statuses: [ 
            { key: 'not-submitted', text: '未繳交', color: 'bg-slate-200', textColor: 'text-slate-500', isCompleted: false }, 
            { key: 'submitted', text: '已繳交', color: 'bg-blue-500', textColor: 'text-white', isCompleted: true }, 
            { key: 'needs-correction', text: '待訂正', color: 'bg-amber-400', textColor: 'text-amber-950', isCompleted: false }, 
            { key: 'completed', text: '已完成', color: 'bg-emerald-500', textColor: 'text-white', isCompleted: true } 
        ] 
    },
    { 
        id: 'reading', 
        name: '閱讀作業', 
        statuses: [ 
            { key: 'unread', text: '未閱讀', color: 'bg-slate-200', textColor: 'text-slate-500', isCompleted: false }, 
            { key: 'read', text: '已閱讀', color: 'bg-emerald-500', textColor: 'text-white', isCompleted: true } 
        ] 
    }
];

export const STATUS_COLORS = [ 
    { class: 'bg-slate-200', textClass: 'text-slate-500', name: '灰' }, 
    { class: 'bg-blue-500', textClass: 'text-white', name: '藍' }, 
    { class: 'bg-emerald-500', textClass: 'text-white', name: '綠' }, 
    { class: 'bg-amber-400', textClass: 'text-amber-950', name: '黃' }, 
    { class: 'bg-rose-500', textClass: 'text-white', name: '紅' }, 
    { class: 'bg-purple-500', textClass: 'text-white', name: '紫' } 
];

export const globalAppId = typeof window.__app_id !== 'undefined' ? window.__app_id : 'homework-checker-pro';

export const getBaseRepoUrl = () => {
    if (window.location.hostname.endsWith('github.io')) {
        const pathSegments = window.location.pathname.split('/').filter(Boolean);
        const repoName = pathSegments[0] || 'ian_class_management';
        return `${window.location.origin}/${repoName}/`;
    }
    const path = window.location.pathname;
    const dir = path.substring(0, path.lastIndexOf('/') + 1);
    return `${window.location.origin}${dir}`;
};

export const PARENT_DASHBOARD_URL = `${getBaseRepoUrl()}parent.html`;
export const STUDENT_DASHBOARD_URL = `${getBaseRepoUrl()}student.html`;

export const firebaseConfig = {
    apiKey: "AIzaSyDuBAZ5hEcrhpYt-XjhiXfi-wuow0Cq83A",
    authDomain: "cheker-barcode.firebaseapp.com",
    projectId: "cheker-barcode",
    storageBucket: "cheker-barcode.firebasestorage.app",
    messagingSenderId: "1093592859159",
    appId: "1:1093592859159:web:40c0741defbb074e4ad252"
};
