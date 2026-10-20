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

// 引入並統一匯出三合一共用核心設定
export * from './shared/config.js';
