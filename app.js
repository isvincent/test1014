/**
 * 楊梅高中分機一覽表 - 互動核心應用程式
 * 包含：即時搜尋、分類篩選、多檢視切換、DTMF撥號音效合成、字級調節、收藏管理與複製提示
 */

(function () {
  'use strict';

  // --- 狀態管理 (State) ---
  const state = {
    data: window.YMSH_DATA || null,
    searchQuery: '',
    selectedCategory: 'all',
    viewMode: 'grid', // 'grid' | 'table' | 'building'
    fontSize: localStorage.getItem('ymsh_font_size') || 'normal', // 'normal' | 'large' | 'xlarge'
    theme: localStorage.getItem('ymsh_theme') || 'light',
    soundEnabled: localStorage.getItem('ymsh_sound') !== 'false',
    favorites: JSON.parse(localStorage.getItem('ymsh_favorites') || '[]'),
    dialNumber: ''
  };

  // --- Web Audio API 音效合成引擎 (純原生，零外部依賴) ---
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // DTMF 撥號音頻率對照表
  const DTMF_FREQS = {
    '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
    '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
    '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
    '*': [941, 1209], '0': [941, 1336], '#': [941, 1477]
  };

  const soundEngine = {
    playTap() {
      if (!state.soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.06);
    },

    playChime() {
      if (!state.soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 和弦
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.06);
        gain.gain.setValueAtTime(0.09, ctx.currentTime + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.06 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.06);
        osc.stop(ctx.currentTime + idx * 0.06 + 0.38);
      });
    },

    playWhoosh() {
      if (!state.soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.11);
    },

    playDtmf(key) {
      if (!state.soundEnabled) return;
      const freqs = DTMF_FREQS[key];
      if (!freqs) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freqs[0], ctx.currentTime);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freqs[1], ctx.currentTime);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.2);
      osc2.stop(ctx.currentTime + 0.2);
    }
  };

  // --- DOM 元素引用 ---
  const el = {
    themeBtn: document.getElementById('theme-toggle-btn'),
    themeIcon: document.getElementById('theme-icon'),
    soundBtn: document.getElementById('sound-toggle-btn'),
    soundIcon: document.getElementById('sound-icon'),
    soundText: document.getElementById('sound-text'),
    fontScaleBtns: document.querySelectorAll('.btn-font-scale'),
    searchInput: document.getElementById('search-input'),
    searchClearBtn: document.getElementById('search-clear-btn'),
    quickTagChips: document.querySelectorAll('.quick-tag-chip'),
    categoryTabsContainer: document.getElementById('category-tabs-container'),
    resultsSummary: document.getElementById('results-summary'),
    viewModeBtns: document.querySelectorAll('.view-mode-btn'),
    mainDisplayArea: document.getElementById('main-display-area'),
    toastContainer: document.getElementById('toast-container'),
    
    // 撥號模態框
    dialpadModal: document.getElementById('dialpad-modal'),
    dialpadOpenBtn: document.getElementById('open-dialpad-btn'),
    dialpadCloseBtn: document.getElementById('dialpad-close-btn'),
    dialDisplayNum: document.getElementById('dialpad-display-num'),
    dialKeys: document.querySelectorAll('.dialpad-key'),
    dialCallBtn: document.getElementById('dial-call-btn'),
    dialClearBtn: document.getElementById('dial-clear-btn'),
    
    // 原始表格預覽模態框
    originalModal: document.getElementById('original-table-modal'),
    originalOpenBtn: document.getElementById('open-original-btn'),
    originalCloseBtn: document.getElementById('original-close-btn'),
    
    // 列印與匯出
    printBtn: document.getElementById('print-btn'),
    exportCsvBtn: document.getElementById('export-csv-btn')
  };

  // --- 圖示庫 (SVG 內嵌字串) ---
  const ICONS = {
    crown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>`,
    building: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M16 10h.01"/><path d="M8 14h.01"/><path d="M16 14h.01"/></svg>`,
    users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    calculator: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg>`,
    book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 2v20"/></svg>`,
    wrench: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
    shoppingBag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
    flask: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/></svg>`,
    monitor: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>`,
    music: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
    wind: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>`,
    hammer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 12-8.5 8.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0a2.12 2.12 0 0 1 0-3L12 9"/><path d="M17.64 15 22 10.64"/><path d="m20.91 3.26-6.36 6.36"/><path d="m11.5 6.5 3 3"/></svg>`,
    cpu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>`,
    shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    shieldAlert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`,
    heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
    library: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg>`,
    phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
    copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
    star: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
    dialpad: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="8" cy="8" r="1"/><circle cx="12" cy="8" r="1"/><circle cx="16" cy="8" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="8" cy="16" r="1"/><circle cx="12" cy="16" r="1"/><circle cx="16" cy="16" r="1"/></svg>`
  };

  function getIcon(name) {
    return ICONS[name] || ICONS.building;
  }

  // --- 初始化 (Init) ---
  function init() {
    applyTheme(state.theme);
    applyFontSize(state.fontSize);
    applySound(state.soundEnabled);
    setupEventListeners();
    renderCategoryTabs();
    renderContent();
  }

  // --- 介面風格切換 ---
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    state.theme = theme;
    localStorage.setItem('ymsh_theme', theme);
    if (el.themeIcon) {
      el.themeIcon.innerHTML = theme === 'dark' 
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;
    }
  }

  function applyFontSize(size) {
    state.fontSize = size;
    localStorage.setItem('ymsh_font_size', size);
    if (size === 'normal') {
      document.documentElement.removeAttribute('data-font-size');
    } else {
      document.documentElement.setAttribute('data-font-size', size);
    }
    el.fontScaleBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.size === size);
    });
  }

  function applySound(enabled) {
    state.soundEnabled = enabled;
    localStorage.setItem('ymsh_sound', enabled);
    if (el.soundBtn) {
      el.soundBtn.classList.toggle('active', enabled);
      if (el.soundText) el.soundText.textContent = enabled ? '音效開' : '靜音';
      if (el.soundIcon) {
        el.soundIcon.innerHTML = enabled
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" x2="1" y1="1" y2="23"/></svg>`;
      }
    }
  }

  // --- 收藏清單管理 ---
  function toggleFavorite(id) {
    const idx = state.favorites.indexOf(id);
    if (idx === -1) {
      state.favorites.push(id);
      showToast('已加入常用收藏 ★', 'success');
    } else {
      state.favorites.splice(idx, 1);
      showToast('已從收藏移除', 'info');
    }
    localStorage.setItem('ymsh_favorites', JSON.stringify(state.favorites));
    soundEngine.playChime();
    renderCategoryTabs();
    renderContent();
  }

  // --- 吐司提示 (Toast Notification) ---
  function showToast(message, type = 'success') {
    if (!el.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      </span>
      <span>${message}</span>
    `;
    el.toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2400);
  }

  // --- 一鍵複製功能 ---
  window.copyToClipboard = function (text, label = '') {
    navigator.clipboard.writeText(text).then(() => {
      soundEngine.playChime();
      showToast(`已複製 ${label || text} 到剪貼簿！`, 'success');
    }).catch(() => {
      // 降級處理相容舊瀏覽器
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      soundEngine.playChime();
      showToast(`已複製 ${label || text}！`, 'success');
    });
  };

  // --- 篩選與過濾資料邏輯 ---
  function getFilteredData() {
    if (!state.data) return [];
    const query = state.searchQuery.trim().toLowerCase();
    const cat = state.selectedCategory;

    const filteredDepartments = [];

    state.data.departments.forEach(dept => {
      // 處室分類篩選
      if (cat !== 'all') {
        if (cat === 'favorites') {
          // 篩選僅有收藏項目的部門
        } else if (cat === '行政處室' && dept.category !== '行政處室' && dept.category !== '行政主管') {
          return;
        } else if (cat === '教學與導師' && dept.category !== '導師辦公室' && dept.category !== '教師辦公室') {
          return;
        } else if (cat === '專科與實驗室' && dept.category !== '實驗室' && dept.category !== '專科教室') {
          return;
        } else if (cat === '校園場館與設施' && dept.category !== '教學大樓/社團' && dept.category !== '實作大樓' && dept.category !== '公共設施' && dept.category !== '學校組織') {
          return;
        }
      }

      // 成員過濾
      const matchingMembers = dept.members.filter(m => {
        const uniqueId = `${dept.id}-${m.role}-${m.name}`;
        if (cat === 'favorites' && !state.favorites.includes(uniqueId)) {
          return false;
        }

        if (!query) return true;

        // 全文即時檢索 (角色、姓名、分機、地點、備註、部門名、專線、傳真)
        const matchRole = m.role.toLowerCase().includes(query);
        const matchName = m.name.toLowerCase().includes(query);
        const matchExt = m.ext.some(e => e.includes(query));
        const matchNotes = (m.notes || '').toLowerCase().includes(query);
        const matchDeptName = dept.name.toLowerCase().includes(query);
        const matchLocation = (dept.location || '').toLowerCase().includes(query);
        const matchDirect = (dept.direct_phone || '').includes(query);
        const matchFax = (dept.fax || '').includes(query);

        return matchRole || matchName || matchExt || matchNotes || matchDeptName || matchLocation || matchDirect || matchFax;
      });

      if (matchingMembers.length > 0) {
        filteredDepartments.push({
          ...dept,
          members: matchingMembers
        });
      }
    });

    return filteredDepartments;
  }

  // 計算統計總數
  function getCategoryCounts() {
    if (!state.data) return {};
    const counts = { all: 0, favorites: state.favorites.length, '行政處室': 0, '教學與導師': 0, '專科與實驗室': 0, '校園場館與設施': 0 };

    state.data.departments.forEach(dept => {
      const num = dept.members.length;
      counts.all += num;
      if (dept.category === '行政處室' || dept.category === '行政主管') counts['行政處室'] += num;
      if (dept.category === '導師辦公室' || dept.category === '教師辦公室') counts['教學與導師'] += num;
      if (dept.category === '實驗室' || dept.category === '專科教室') counts['專科與實驗室'] += num;
      if (['教學大樓/社團', '實作大樓', '公共設施', '學校組織'].includes(dept.category)) counts['校園場館與設施'] += num;
    });

    return counts;
  }

  // --- 關鍵字高亮渲染輔助 ---
  function highlightText(text, query) {
    if (!query || !text) return text;
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return text.replace(regex, `<mark style="background:#fef08a;color:#854d0e;padding:1px 3px;border-radius:3px;">$1</mark>`);
  }

  // --- 渲染分類過濾頁籤 ---
  function renderCategoryTabs() {
    if (!el.categoryTabsContainer) return;
    const counts = getCategoryCounts();

    const tabs = [
      { id: 'all', label: '全部顯示', count: counts.all, icon: '🌟' },
      { id: 'favorites', label: '我的常用收藏', count: counts.favorites, icon: '★' },
      { id: '行政處室', label: '行政處室', count: counts['行政處室'], icon: '🏛️' },
      { id: '教學與導師', label: '教學與導師辦公室', count: counts['教學與導師'], icon: '👨‍🏫' },
      { id: '專科與實驗室', label: '專科教室與實驗室', count: counts['專科與實驗室'], icon: '🔬' },
      { id: '校園場館與設施', label: '校園場館與設施', count: counts['校園場館與設施'], icon: '🏫' }
    ];

    el.categoryTabsContainer.innerHTML = tabs.map(t => `
      <button class="filter-tab ${state.selectedCategory === t.id ? 'active' : ''}" data-category="${t.id}">
        <span>${t.icon} ${t.label}</span>
        <span class="filter-count-badge">${t.count}</span>
      </button>
    `).join('');

    el.categoryTabsContainer.querySelectorAll('.filter-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        soundEngine.playWhoosh();
        state.selectedCategory = btn.dataset.category;
        renderCategoryTabs();
        renderContent();
      });
    });
  }

  // --- 主畫面渲染 ---
  function renderContent() {
    const filteredDepts = getFilteredData();
    let totalItems = 0;
    filteredDepts.forEach(d => totalItems += d.members.length);

    // 更新結果筆數
    if (el.resultsSummary) {
      if (state.searchQuery) {
        el.resultsSummary.innerHTML = `搜尋「<strong>${state.searchQuery}</strong>」找到 <strong>${totalItems}</strong> 筆分機項目`;
      } else if (state.selectedCategory === 'favorites') {
        el.resultsSummary.innerHTML = `我的常用收藏清單共 <strong>${totalItems}</strong> 筆`;
      } else {
        el.resultsSummary.innerHTML = `目前顯示 <strong>${filteredDepts.length}</strong> 個處室單位，共 <strong>${totalItems}</strong> 筆分機項目`;
      }
    }

    if (totalItems === 0) {
      el.mainDisplayArea.innerHTML = `
        <div class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            <path d="M8 11h6"/>
          </svg>
          <h3 class="empty-title">查無符合條件的分機資料</h3>
          <p class="empty-desc">試試看不同的關鍵字（例如：校長、教學組、健康中心、圖書館）或重設分類標籤。</p>
          <button class="btn-ctrl active" onclick="window.resetSearch()">
            <span>一鍵重設搜尋條件</span>
          </button>
        </div>
      `;
      return;
    }

    if (state.viewMode === 'grid') {
      renderGridView(filteredDepts);
    } else if (state.viewMode === 'table') {
      renderTableView(filteredDepts);
    } else if (state.viewMode === 'building') {
      renderBuildingView(filteredDepts);
    }
  }

  // 1. 卡片檢視渲染 (Grid View)
  function renderGridView(depts) {
    const q = state.searchQuery;

    const html = `
      <div class="departments-container">
        ${depts.map(dept => `
          <section class="dept-section" style="border-top: 4px solid ${dept.badge_color};">
            <div class="dept-header">
              <div class="dept-title-group">
                <div class="dept-icon-box" style="background: ${dept.badge_color};">
                  ${getIcon(dept.icon)}
                </div>
                <div>
                  <h3 class="dept-name">
                    ${highlightText(dept.name, q)}
                    <span class="dept-cat-tag" style="background: ${dept.badge_color};">${dept.category}</span>
                  </h3>
                  <div class="card-location-tag" style="margin-top: 3px;">
                    ${ICONS.pin} ${dept.location} · ${dept.desc}
                  </div>
                </div>
              </div>
              <div class="dept-direct-lines">
                ${dept.direct_phone ? `
                  <a href="tel:${dept.direct_phone}" class="direct-tel-badge" title="點擊直接撥打專線">
                    ${ICONS.phone} 專線: ${dept.direct_phone}
                  </a>
                ` : ''}
                ${dept.fax ? `
                  <span class="fax-badge">
                    傳真: ${dept.fax}
                  </span>
                ` : ''}
              </div>
            </div>

            <div class="members-grid">
              ${dept.members.map(member => {
                const uniqueId = `${dept.id}-${member.role}-${member.name}`;
                const isFav = state.favorites.includes(uniqueId);
                const primaryExt = member.ext[0];

                return `
                  <div class="member-card" style="--card-accent: ${dept.badge_color};">
                    <div class="card-top">
                      <div class="card-identity">
                        <span class="card-role">${highlightText(member.role, q)}</span>
                        ${member.name ? `
                          <span class="card-name">
                            ${highlightText(member.name, q)}
                          </span>
                        ` : `<span class="card-name-empty">公共服務分機</span>`}
                      </div>
                      <button class="btn-star-fav ${isFav ? 'is-favorite' : ''}" 
                              data-fav-id="${uniqueId}" 
                              title="${isFav ? '取消常用收藏' : '加為常用收藏'}">
                        ${ICONS.star}
                      </button>
                    </div>

                    <div class="card-extensions">
                      ${member.ext.map(extNum => `
                        <div class="ext-badge" 
                             onclick="window.copyToClipboard('${extNum}', '分機 ${extNum}')"
                             title="點擊一鍵複製分機 ${extNum}">
                          <span>${highlightText(extNum, q)}</span>
                          <span class="ext-copy-hint">${ICONS.copy}</span>
                        </div>
                      `).join('')}
                    </div>

                    ${member.notes ? `
                      <div class="card-notes">
                        ${highlightText(member.notes, q)}
                      </div>
                    ` : ''}

                    <div class="card-footer">
                      <span class="card-location-tag">
                        ${ICONS.pin} ${dept.location}
                      </span>
                      <div class="card-quick-actions">
                        <button class="btn-card-action" 
                                onclick="window.openDialpadWithNumber('${primaryExt}')"
                                title="開啟模擬撥號盤撥打">
                          ${ICONS.dialpad} 模擬撥號
                        </button>
                        <a href="tel:034789618,${primaryExt}" class="btn-card-action" title="手機一鍵撥打">
                          ${ICONS.phone} 撥打
                        </a>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </section>
        `).join('')}
      </div>
    `;

    el.mainDisplayArea.innerHTML = html;
    bindCardEvents();
  }

  // 2. 表格檢視渲染 (Table View)
  function renderTableView(depts) {
    const q = state.searchQuery;

    const html = `
      <div class="table-view-wrapper">
        <table class="directory-table">
          <thead>
            <tr>
              <th style="width: 45px;">★</th>
              <th>單位 / 處室</th>
              <th>職稱 / 業務項目</th>
              <th>姓名 / 負責人</th>
              <th>電話分機 (點擊複製)</th>
              <th>外線專線 / 傳真</th>
              <th>位置地點</th>
              <th style="text-align: right;">撥號操作</th>
            </tr>
          </thead>
          <tbody>
            ${depts.flatMap(dept => dept.members.map(member => {
              const uniqueId = `${dept.id}-${member.role}-${member.name}`;
              const isFav = state.favorites.includes(uniqueId);
              const primaryExt = member.ext[0];

              return `
                <tr>
                  <td>
                    <button class="btn-star-fav ${isFav ? 'is-favorite' : ''}" 
                            data-fav-id="${uniqueId}" 
                            title="${isFav ? '取消常用收藏' : '加為常用收藏'}">
                      ${ICONS.star}
                    </button>
                  </td>
                  <td>
                    <strong style="color: ${dept.badge_color};">${dept.name}</strong>
                  </td>
                  <td>
                    <strong>${highlightText(member.role, q)}</strong>
                    ${member.notes ? `<div style="font-size: var(--font-sm); color: var(--text-muted);">${highlightText(member.notes, q)}</div>` : ''}
                  </td>
                  <td>
                    ${member.name ? `<span style="font-weight: 700; color: var(--primary);">${highlightText(member.name, q)}</span>` : '<span style="color: var(--text-light);">-</span>'}
                  </td>
                  <td>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                      ${member.ext.map(extNum => `
                        <span class="ext-badge" 
                              style="font-size: var(--font-lg); padding: 2px 10px;"
                              onclick="window.copyToClipboard('${extNum}', '分機 ${extNum}')"
                              title="點擊複製分機">
                          ${highlightText(extNum, q)}
                        </span>
                      `).join('')}
                    </div>
                  </td>
                  <td>
                    ${dept.direct_phone ? `<div>專線: <a href="tel:${dept.direct_phone}">${dept.direct_phone}</a></div>` : ''}
                    ${dept.fax ? `<div style="font-size: var(--font-sm); color: var(--text-muted);">傳真: ${dept.fax}</div>` : ''}
                    ${!dept.direct_phone && !dept.fax ? '<span style="color: var(--text-light);">-</span>' : ''}
                  </td>
                  <td>
                    <span style="font-size: var(--font-sm); color: var(--text-muted);">${dept.location}</span>
                  </td>
                  <td style="text-align: right;">
                    <div style="display: inline-flex; gap: 6px;">
                      <button class="btn-card-action" onclick="window.openDialpadWithNumber('${primaryExt}')">
                        ${ICONS.dialpad}
                      </button>
                      <a href="tel:034789618,${primaryExt}" class="btn-card-action">
                        ${ICONS.phone}
                      </a>
                    </div>
                  </td>
                </tr>
              `;
            })).join('')}
          </tbody>
        </table>
      </div>
    `;

    el.mainDisplayArea.innerHTML = html;
    bindCardEvents();
  }

  // 3. 大樓空間導覽檢視 (Campus Building View)
  function renderBuildingView(depts) {
    const q = state.searchQuery;

    // 將項目依照建築物分類歸納
    const buildingsMap = {
      '行政大樓': [],
      '日新樓': [],
      '悅知樓': [],
      '蘊慧樓': [],
      '生科大樓': [],
      '御風樓': [],
      '科學與專科大樓': [],
      '校園活動與生活設施': []
    };

    depts.forEach(dept => {
      dept.members.forEach(m => {
        const item = { ...m, deptName: dept.name, badgeColor: dept.badge_color, deptLocation: dept.location };
        const loc = (dept.location + ' ' + (m.notes || '') + ' ' + m.role);

        if (loc.includes('行政大樓') || ['校長室', '人事室', '會計室', '教務處', '總務處', '學務處'].includes(dept.name)) {
          buildingsMap['行政大樓'].push(item);
        } else if (loc.includes('日新樓')) {
          buildingsMap['日新樓'].push(item);
        } else if (loc.includes('悅知樓')) {
          buildingsMap['悅知樓'].push(item);
        } else if (loc.includes('蘊慧樓')) {
          buildingsMap['蘊慧樓'].push(item);
        } else if (loc.includes('生科大樓')) {
          buildingsMap['生科大樓'].push(item);
        } else if (loc.includes('御風樓')) {
          buildingsMap['御風樓'].push(item);
        } else if (loc.includes('實驗') || loc.includes('專科') || loc.includes('啟明樓') || loc.includes('科學')) {
          buildingsMap['科學與專科大樓'].push(item);
        } else {
          buildingsMap['校園活動與生活設施'].push(item);
        }
      });
    });

    const html = `
      <div class="building-grid">
        ${Object.entries(buildingsMap).map(([bName, items]) => {
          if (items.length === 0) return '';
          return `
            <div class="building-card">
              <div class="building-card-header">
                <div class="building-icon-badge">
                  ${ICONS.building}
                </div>
                <div>
                  <h3 class="building-title">${bName}</h3>
                  <span style="font-size: var(--font-sm); color: var(--text-muted);">共 ${items.length} 處分機位置</span>
                </div>
              </div>
              <div class="building-items-list">
                ${items.map(it => `
                  <div class="building-item-row">
                    <div>
                      <div style="font-weight: 800; font-size: var(--font-base);">
                        ${highlightText(it.role, q)}
                        ${it.name ? `<span style="color: var(--primary); font-size: var(--font-sm);">(${highlightText(it.name, q)})</span>` : ''}
                      </div>
                      <div style="font-size: var(--font-sm); color: var(--text-muted);">${it.deptName}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      ${it.ext.map(e => `
                        <span class="ext-badge" 
                              style="font-size: var(--font-lg); padding: 2px 8px;"
                              onclick="window.copyToClipboard('${e}', '分機 ${e}')">
                          ${e}
                        </span>
                      `).join('')}
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    el.mainDisplayArea.innerHTML = html;
    bindCardEvents();
  }

  // 綁定卡片上的事件（例如星星收藏點擊）
  function bindCardEvents() {
    document.querySelectorAll('.btn-star-fav').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const favId = btn.dataset.favId;
        toggleFavorite(favId);
      });
    });
  }

  // 重設搜尋
  window.resetSearch = function () {
    state.searchQuery = '';
    state.selectedCategory = 'all';
    if (el.searchInput) el.searchInput.value = '';
    if (el.searchClearBtn) el.searchClearBtn.classList.remove('visible');
    renderCategoryTabs();
    renderContent();
    soundEngine.playWhoosh();
  };

  // --- 模擬撥號盤邏輯 (DTMF Dialpad) ---
  function updateDialDisplay() {
    if (el.dialDisplayNum) {
      el.dialDisplayNum.textContent = state.dialNumber || '請輸入號碼';
    }
  }

  function appendDialDigit(digit) {
    soundEngine.playDtmf(digit);
    if (state.dialNumber.length < 24) {
      state.dialNumber += digit;
      updateDialDisplay();
    }
  }

  window.openDialpadWithNumber = function (ext = '') {
    soundEngine.playTap();
    state.dialNumber = ext ? `03-4789618 # ${ext}` : '';
    updateDialDisplay();
    if (el.dialpadModal) {
      el.dialpadModal.classList.add('open');
    }
  };

  function closeDialpad() {
    soundEngine.playTap();
    if (el.dialpadModal) {
      el.dialpadModal.classList.remove('open');
    }
  }

  // --- 事件監聽器設定 (Event Listeners) ---
  function setupEventListeners() {
    // 主題切換
    if (el.themeBtn) {
      el.themeBtn.addEventListener('click', () => {
        soundEngine.playTap();
        const newTheme = state.theme === 'light' ? 'dark' : 'light';
        applyTheme(newTheme);
      });
    }

    // 音效開關
    if (el.soundBtn) {
      el.soundBtn.addEventListener('click', () => {
        const newState = !state.soundEnabled;
        applySound(newState);
        if (newState) soundEngine.playChime();
      });
    }

    // 字體大小切換
    el.fontScaleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        soundEngine.playTap();
        applyFontSize(btn.dataset.size);
      });
    });

    // 檢視模式切換
    el.viewModeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        soundEngine.playWhoosh();
        state.viewMode = btn.dataset.mode;
        el.viewModeBtns.forEach(b => b.classList.toggle('active', b === btn));
        renderContent();
      });
    });

    // 即時檢索輸入
    if (el.searchInput) {
      el.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        if (el.searchClearBtn) {
          el.searchClearBtn.classList.toggle('visible', !!state.searchQuery);
        }
        renderContent();
      });
    }

    // 清除搜尋按鈕
    if (el.searchClearBtn) {
      el.searchClearBtn.addEventListener('click', () => {
        soundEngine.playTap();
        state.searchQuery = '';
        el.searchInput.value = '';
        el.searchClearBtn.classList.remove('visible');
        el.searchInput.focus();
        renderContent();
      });
    }

    // 快速搜尋熱門關鍵字
    el.quickTagChips.forEach(chip => {
      chip.addEventListener('click', () => {
        soundEngine.playTap();
        const tag = chip.dataset.tag;
        state.searchQuery = tag;
        if (el.searchInput) el.searchInput.value = tag;
        if (el.searchClearBtn) el.searchClearBtn.classList.add('visible');
        renderContent();
      });
    });

    // 撥號盤模態框開關
    if (el.dialpadOpenBtn) {
      el.dialpadOpenBtn.addEventListener('click', () => window.openDialpadWithNumber(''));
    }
    if (el.dialpadCloseBtn) {
      el.dialpadCloseBtn.addEventListener('click', closeDialpad);
    }
    if (el.dialpadModal) {
      el.dialpadModal.addEventListener('click', (e) => {
        if (e.target === el.dialpadModal) closeDialpad();
      });
    }

    // 撥號按鍵
    el.dialKeys.forEach(k => {
      k.addEventListener('click', () => {
        const val = k.dataset.val;
        appendDialDigit(val);
      });
    });

    // 清除單字 / 清空撥號盤
    if (el.dialClearBtn) {
      el.dialClearBtn.addEventListener('click', () => {
        soundEngine.playTap();
        if (state.dialNumber.length > 0) {
          state.dialNumber = state.dialNumber.slice(0, -1);
          updateDialDisplay();
        }
      });
    }

    // 撥號盤外撥
    if (el.dialCallBtn) {
      el.dialCallBtn.addEventListener('click', (e) => {
        soundEngine.playChime();
        const sanitized = state.dialNumber.replace(/[^0-9]/g, '');
        if (sanitized) {
          window.location.href = `tel:${sanitized}`;
        } else {
          window.location.href = `tel:034789618`;
        }
      });
    }

    // 原始表格預覽模態框開關
    if (el.originalOpenBtn && el.originalModal) {
      el.originalOpenBtn.addEventListener('click', () => {
        soundEngine.playTap();
        el.originalModal.classList.add('open');
      });
    }
    if (el.originalCloseBtn && el.originalModal) {
      el.originalCloseBtn.addEventListener('click', () => {
        soundEngine.playTap();
        el.originalModal.classList.remove('open');
      });
    }
    if (el.originalModal) {
      el.originalModal.addEventListener('click', (e) => {
        if (e.target === el.originalModal) {
          soundEngine.playTap();
          el.originalModal.classList.remove('open');
        }
      });
    }

    // 列印功能
    if (el.printBtn) {
      el.printBtn.addEventListener('click', () => {
        soundEngine.playTap();
        window.print();
      });
    }

    // 匯出 CSV 功能
    if (el.exportCsvBtn) {
      el.exportCsvBtn.addEventListener('click', exportToCsv);
    }

    // 鍵盤無障礙快速鍵 (Escape 關閉模態框, / 聚焦搜尋框)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (el.dialpadModal) el.dialpadModal.classList.remove('open');
        if (el.originalModal) el.originalModal.classList.remove('open');
      } else if (e.key === '/' && document.activeElement !== el.searchInput) {
        e.preventDefault();
        if (el.searchInput) {
          el.searchInput.focus();
          el.searchInput.select();
        }
      }
    });
  }

  // --- 匯出 CSV 檔案 ---
  function exportToCsv() {
    if (!state.data) return;
    soundEngine.playChime();

    let csvContent = '\uFEFF'; // UTF-8 BOM
    csvContent += '處室名稱,業務職稱,姓名,電話分機,專線電話,傳真電話,位置地點,工作備註\n';

    state.data.departments.forEach(dept => {
      dept.members.forEach(m => {
        const row = [
          `"${dept.name}"`,
          `"${m.role}"`,
          `"${m.name || ''}"`,
          `"${m.ext.join(' / ')}"`,
          `"${dept.direct_phone || ''}"`,
          `"${dept.fax || ''}"`,
          `"${dept.location || ''}"`,
          `"${(m.notes || '').replace(/"/g, '""')}"`
        ];
        csvContent += row.join(',') + '\n';
      });
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `楊梅高中分機一覽表_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('分機資料表 CSV 匯出成功！', 'success');
  }

  // 啟動應用程式
  document.addEventListener('DOMContentLoaded', init);
})();
