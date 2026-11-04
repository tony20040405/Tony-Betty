/* 共用:Firebase 初始化、登入守門、後台連結、雲端存檔同步 (超級強化版) */
const ADMIN_EMAIL = 'tony0930508440@gmail.com';
const firebaseConfig = {
  apiKey: "AIzaSyBL0LoCSkThMXqYoW8nxlIsRt7A6YyObiI",
  authDomain: "tonybetty-354a7.firebaseapp.com",
  projectId: "tonybetty-354a7",
  storageBucket: "tonybetty-354a7.firebasestorage.app",
  messagingSenderId: "890099191965",
  appId: "1:890099191965:web:55e9df1ea918889364c474"
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// 啟用 Firestore 離線持久化與多分頁同步 (IndexedDB 快取，斷網亦可操作，連線自動同步)
try {
  if (typeof db.enablePersistence === 'function') {
    db.enablePersistence({ synchronizeTabs: true }).catch(err => {
      if (err.code === 'failed-precondition') {
        console.warn('Firestore 多分頁持久化限制:', err.message);
      } else if (err.code === 'unimplemented') {
        console.warn('瀏覽器不支援 Firestore 離線快取');
      }
    });
  }
} catch(e) {
  console.warn('enablePersistence 警告:', e);
}

const IS_LOGIN_PAGE = /login(\.html)?$/.test(location.pathname);
const IS_ADMIN_PAGE = /admin(\.html)?$/.test(location.pathname);
const isAdminUser = u => !!u && (u.email || '').toLowerCase() === ADMIN_EMAIL;
const whenDomReady = fn => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn();

/* 登入狀態:沒登入 → 導向 login;已登入 → resolve(user) */
const authReady = new Promise(resolve => {
  auth.onAuthStateChanged(user => {
    if (!user) { if (!IS_LOGIN_PAGE) location.replace('login.html'); resolve(null); return; }
    resolve(user);
    const admin = isAdminUser(user);
    whenDomReady(() => {
      document.querySelectorAll('a[href="admin.html"]').forEach(a => { a.style.display = admin ? 'inline-block' : 'none'; });
    });
    if (IS_ADMIN_PAGE && !admin) { alert('只有本寶才能進入後台喔!'); location.replace('index.html'); }
  });
});

/* 網站內容 = 預設值 + 雲端後台設定(coupleData/config) */
let _sitePromise = null;
function loadSiteConfig(force) {                      // 同一頁只讀一次雲端設定;force=true 重新讀取
  if (force || !_sitePromise) _sitePromise = _loadSiteConfig();
  return _sitePromise.then(c => JSON.parse(JSON.stringify(c)));
}
function isLegacyPrizes(arr){ if(!Array.isArray(arr) || !arr.length) return true; return arr.some(p => p.t && (p.t.startsWith("No.") || p.t.includes("軍中遠端版") || p.t.includes("定宇") || (p.n && p.n.includes("定宇")))); }
async function _loadSiteConfig() {
  const base = (typeof DEFAULT_CONFIG !== 'undefined') ? JSON.parse(JSON.stringify(DEFAULT_CONFIG)) : {};
  
  // 1. 嘗試從本機快取讀取基本設定（日期、輪盤等）
  try {
    const cached = JSON.parse(localStorage.getItem('siteConfigCache') || 'null');
    if (cached && typeof cached === 'object' && cached.version === DEFAULT_CONFIG.version) {
      Object.keys(cached).forEach(k => {
        if (k !== 'scratchcard') {
          const v = cached[k];
          base[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? Object.assign({}, base[k] || {}, v) : v;
        }
      });
    }
  } catch(e) {}

  // 2. 獎品庫一律強制使用 DEFAULT_CONFIG.scratchcard.prizes (800 張同居全新卡庫)
  if (DEFAULT_CONFIG && DEFAULT_CONFIG.scratchcard && Array.isArray(DEFAULT_CONFIG.scratchcard.prizes)) {
    base.scratchcard = Object.assign({}, base.scratchcard || {}, DEFAULT_CONFIG.scratchcard);
    base.scratchcard.prizes = DEFAULT_CONFIG.scratchcard.prizes;
  }

  // 3. 在背景向雲端檢查設定
  db.collection('coupleData').doc('config').get().then(doc => {
    if (doc.exists) {
      const data = doc.data();
      if (data && data.version === DEFAULT_CONFIG.version) {
        try { localStorage.setItem('siteConfigCache', JSON.stringify(data)); } catch(_) {}
      }
    }
  }).catch(e => console.warn('背景更新設定檔失敗', e));

  return base;
}

/* =========================================================================
   智能存檔合併演算法 (Smart Conflict-Free State Merger)
   原理：刮到的獎品、成就、每日進度只增不減，避免多裝置或快取盲目覆蓋造成的存檔遺失！
   ========================================================================= */
function mergeGameStates(a, b) {
  if (!a && !b) return {};
  if (!a) return JSON.parse(JSON.stringify(b));
  if (!b) return JSON.parse(JSON.stringify(a));

  // 支援後台管理員主動重設 (若 remote 或 local 帶有較新的 resetAt，則服從重設，不復活舊資料)
  const aReset = Number(a.resetAt || 0);
  const bReset = Number(b.resetAt || 0);
  if (bReset > aReset) return JSON.parse(JSON.stringify(b));
  if (aReset > bReset) return JSON.parse(JSON.stringify(a));

  const res = {
    days: {},
    got: {},
    pending: null,
    sp: Object.assign({}, b.sp || {}, a.sp || {}),
    recent: (Array.isArray(a.recent) && a.recent.length) ? a.recent : (b.recent || []),
    streak: { d: '', n: 0 },
    bonus: { d: '', n: 0 },
    miss: Math.max(Number(a.miss) || 0, Number(b.miss) || 0),
    missYou: Math.max(Number(a.missYou) || 0, Number(b.missYou) || 0),
    ach: Object.assign({}, b.ach || {}, a.ach || {}),
    wheel: {},
    spins: Math.max(Number(a.spins) || 0, Number(b.spins) || 0),
    theme: a.theme !== undefined ? a.theme : (b.theme !== undefined ? b.theme : 0),
    grantSeen: Math.max(Number(a.grantSeen) || 0, Number(b.grantSeen) || 0),
    quizGiven: Math.max(Number(a.quizGiven) || 0, Number(b.quizGiven) || 0),
    park: { d: '', g: {} },
    resetAt: Math.max(aReset, bReset) || undefined
  };

  // 1. got: 獎品庫存（關鍵：刮到的獎品只會增加，絕不被蓋掉消失！）
  const allPrizes = new Set([...Object.keys(a.got || {}), ...Object.keys(b.got || {})]);
  allPrizes.forEach(k => {
    const ga = (a.got && a.got[k]) || { n: 0, u: 0 };
    const gb = (b.got && b.got[k]) || { n: 0, u: 0 };
    const maxN = Math.max(Number(ga.n) || 0, Number(gb.n) || 0);
    const maxU = Math.min(maxN, Math.max(Number(ga.u) || 0, Number(gb.u) || 0));
    res.got[k] = { n: maxN, u: maxU };
  });

  // pending 待抽卡防死結修復：只有當本機有未揭曉的卡、且該卡「尚未被抽中存在收藏庫(got)」時才保留；絕不盲目從遠端復活！
  let pendingCard = a.pending || null;
  if (pendingCard && res.got[pendingCard] && res.got[pendingCard].n > 0) {
    pendingCard = null; // 該獎品已抽過，解除鎖定，允許抽全新獎品
  }
  res.pending = pendingCard;

  // 2. days: 每日刮卡數量
  const allDays = new Set([...Object.keys(a.days || {}), ...Object.keys(b.days || {})]);
  allDays.forEach(d => {
    res.days[d] = Math.max(Number(a.days?.[d]) || 0, Number(b.days?.[d]) || 0);
  });

  // 3. wheel: 每日轉盤次數
  const allWheels = new Set([...Object.keys(a.wheel || {}), ...Object.keys(b.wheel || {})]);
  allWheels.forEach(d => {
    res.wheel[d] = Math.max(Number(a.wheel?.[d]) || 0, Number(b.wheel?.[d]) || 0);
  });

  // 4. streak: 連續登入取較新日期或較大天數
  const sa = a.streak || { d: '', n: 0 };
  const sb = b.streak || { d: '', n: 0 };
  if (sa.d > sb.d) res.streak = sa;
  else if (sb.d > sa.d) res.streak = sb;
  else res.streak = { d: sa.d || sb.d, n: Math.max(Number(sa.n) || 0, Number(sb.n) || 0) };

  // 5. bonus: 今日加碼張數
  const ba = a.bonus || { d: '', n: 0 };
  const bb = b.bonus || { d: '', n: 0 };
  if (ba.d > bb.d) res.bonus = ba;
  else if (bb.d > ba.d) res.bonus = bb;
  else res.bonus = { d: ba.d || bb.d, n: Math.max(Number(ba.n) || 0, Number(bb.n) || 0) };

  // 6. park: 今日遊樂園通關進度
  const pa = a.park || { d: '', g: {} };
  const pb = b.park || { d: '', g: {} };
  if (pa.d && pa.d === pb.d) {
    res.park = { d: pa.d, g: Object.assign({}, pb.g || {}, pa.g || {}) };
  } else if (pa.d > pb.d) {
    res.park = pa;
  } else {
    res.park = pb;
  }

  return res;
}

/* =========================================================================
   超級雲端存檔同步管理器 (Super CloudSync)
   特性：
   1. 雙層防護：localStorage 主存檔 + sc2_backup 備份存檔，絕不怕本機壞掉
   2. 佇列防丟：斷網、網路延遲時不會漏掉存檔，恢復連線自動補上傳
   3. 防抖動寫入：連續刮卡或操作會自動合併請求，不卡頓不超量
   4. 頁面離開前保護：visibilitychange / pagehide 強制寫入
   ========================================================================= */
const cloudSync = {
  ready: false,
  _unsub: null,
  _onRemote: null,
  _badge: null,
  _fade: 0,
  _pushTimer: null,
  _retryTimer: null,
  _hasPendingPush: false,
  _pendingPushStr: null,
  _lastSavedCloudStr: null,

  status(kind, text) {
    if (!this._badge) {
      const b = document.createElement('div');
      b.style.cssText = 'position:fixed;left:8px;bottom:calc(env(safe-area-inset-bottom,0px) + 8px);z-index:99;font:12px/1.2 system-ui,sans-serif;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.94);color:#4a2230;box-shadow:0 2px 10px rgba(0,0,0,.15);pointer-events:none;transition:opacity .4s,transform .3s;display:flex;align-items:center;gap:4px;';
      whenDomReady(() => document.body.appendChild(b));
      this._badge = b;
    }
    const b = this._badge;
    b.textContent = text;
    b.style.opacity = '1';
    b.style.color = kind === 'err' ? '#c0213f' : (kind === 'busy' ? '#8a4b08' : '#2e7d32');
    clearTimeout(this._fade);
    if (kind === 'ok') {
      this._fade = setTimeout(() => { b.style.opacity = '.4'; }, 3200);
    }
  },

  /* 安全讀取本機資料（自動掃描所有備份、永遠取資料最完整的版本） */
  getLocalState() {
    let best = {};
    let maxPrizes = -1;

    // 掃描所有可能的本機快取與備份鍵（包含 sc2、sc2_backup 以及切換帳號留下的 sc2_backup_*）
    const candidateKeys = ['sc2', 'sc2_backup'];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('sc2_backup_') || k.includes('sc2'))) candidateKeys.push(k);
      }
    } catch(_) {}

    candidateKeys.forEach(k => {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const prizeCount = Object.keys(parsed.got || {}).length;
          if (prizeCount > maxPrizes) {
            maxPrizes = prizeCount;
            best = parsed;
          }
        }
      } catch(_) {}
    });

    return (best && typeof best === 'object') ? best : {};
  },

  /* 安全寫入本機雙存檔 */
  setLocalState(str) {
    try {
      localStorage.setItem('sc2', str);
      localStorage.setItem('sc2_backup', str);
      localStorage.setItem('sc2At', String(Date.now()));
    } catch(e) {
      console.warn('本機儲存配額滿或失敗:', e);
    }
  },

  /* 初次拉取雲端存檔並與本機智能合併 */
  async pull() {
    const user = await authReady; if (!user) return;
    
    // 若切換帳號，安全備份舊帳號快照，但絕不抹除本機已抽到的獎品庫存！
    const prevUid = localStorage.getItem('sc2Uid');
    if (prevUid && prevUid !== user.uid) {
      try { localStorage.setItem('sc2_backup_' + prevUid, localStorage.getItem('sc2') || ''); } catch(_) {}
    }
    localStorage.setItem('sc2Uid', user.uid);

    this.status('busy', '⏳ 正在連線雲端...');
    try {
      let doc = await db.collection('userData').doc(user.uid).get();
      let d = doc.exists ? doc.data() : null;

      // 本寶管理員登入時，若自己的 userData 沒有刮刮樂紀錄，自動搜尋小寶的雲端紀錄
      if ((!d || !d.sc2) && isAdminUser(user)) {
        try {
          const allDocs = await db.collection('userData').get();
          allDocs.forEach(snap => {
            if (snap.id !== user.uid) {
              const other = snap.data();
              if (other && other.sc2) {
                if (!d || !d.sc2) d = other;
              }
            }
          });
        } catch(e) {
          console.warn('管理員協尋小寶雲端存檔中斷:', e);
        }
      }

      const localState = this.getLocalState();
      
      let remoteState = {};
      if (d && d.sc2) {
        try { remoteState = JSON.parse(d.sc2); } catch(e) { console.warn('雲端存檔格式解析失敗:', e); }
      }

      // 智能雙向合併：不漏掉本機新玩的、也不漏掉雲端原本存的！
      const merged = mergeGameStates(localState, remoteState);
      const mergedStr = JSON.stringify(merged);
      this.setLocalState(mergedStr);
      this._lastSavedCloudStr = d ? d.sc2 : null;

      this.ready = true;
      this.status('ok', '☁️ 已同步');

      // 若合併後的資料比雲端原本的更豐富（例如離線時刮的），立即補上傳給雲端
      if (!d || !d.sc2 || mergedStr !== d.sc2) {
        this.push(mergedStr, true);
      } else if (this._hasPendingPush) {
        this._executePush();
      }
    } catch (e) {
      console.error('讀取雲端存檔失敗(本次使用本機快取)', e);
      this.ready = true; // 允許本機繼續遊玩並進入佇列
      this.status('err', '⚠️ 離線遊玩中(已存本機，連線將自動備份)');
    }
  },

  /* 即時監聽：別台裝置存檔後，這台透過 smart merge 更新 */
  listen(onRemote) {
    const user = auth.currentUser; if (!user || this._unsub) return;
    this._onRemote = onRemote;
    this._unsub = db.collection('userData').doc(user.uid).onSnapshot(snap => {
      if (snap.metadata.hasPendingWrites) return; // 自己剛發出的寫入不用重複重繪
      const d = snap.exists ? snap.data() : null;
      if (!d || !d.sc2) return;

      let remoteState = {};
      try { remoteState = JSON.parse(d.sc2); } catch(_) { return; }

      const localState = this.getLocalState();
      const merged = mergeGameStates(localState, remoteState);
      const mergedStr = JSON.stringify(merged);
      const localStr = localStorage.getItem('sc2');

      let changed = false;
      if (mergedStr !== localStr) {
        this.setLocalState(mergedStr);
        changed = true;
      }

      // 如果本機含有遠端沒有的資料（例如兩邊同時刮），把合併成果推回雲端
      if (mergedStr !== d.sc2) {
        this.push(mergedStr, true);
      } else {
        this._lastSavedCloudStr = d.sc2;
      }

      this.ready = true;
      this.status('ok', '☁️ 已同步');
      if (changed && this._onRemote) this._onRemote(merged);
    }, e => {
      console.warn('雲端監聽中斷:', e);
      this.status('err', '⚠️ 雲端監聽中斷(本機正常運作)');
    });
  },

  /* 存檔介面：防抖動 + 本地先存 + 雲端排程保證上傳 */
  push(str, force) {
    if (!str || typeof str !== 'string') return Promise.resolve();

    // 1. 立即同步寫入本機（0 毫秒延遲，確保當下絕對不會丟）
    this.setLocalState(str);
    this._pendingPushStr = str;
    this._hasPendingPush = true;

    // 2. 如果跟最後一次成功存到雲端的一模一樣且不是強制，則不用浪費請求
    if (!force && str === this._lastSavedCloudStr) {
      this._hasPendingPush = false;
      return Promise.resolve();
    }

    // 3. 防抖動排程 (250ms)：快速連續調用時合併為一次網路請求
    clearTimeout(this._pushTimer);
    clearTimeout(this._retryTimer);
    this.status('busy', '⏳ 同步中...');

    return new Promise(resolve => {
      this._pushTimer = setTimeout(() => {
        this._executePush().then(resolve);
      }, 250);
    });
  },

  /* 執行真正的 Firestore 上傳 */
  async _executePush() {
    clearTimeout(this._pushTimer);
    const user = auth.currentUser;
    const str = this._pendingPushStr;

    if (!user || !str) return;

    const at = Date.now();
    try {
      await db.collection('userData').doc(user.uid).set({
        sc2: str,
        updatedAt: at
      }, { merge: true });

      this._lastSavedCloudStr = str;
      this._hasPendingPush = false;
      this.status('ok', '☁️ 已同步');
    } catch(e) {
      console.error('雲端儲存失敗，已排程自動重試:', e);
      this.status('err', '⚠️ 雲端備份中(已安全存於本機)');
      // 3 秒後自動重試
      clearTimeout(this._retryTimer);
      this._retryTimer = setTimeout(() => {
        if (this._hasPendingPush) this._executePush();
      }, 3000);
    }
  },

  /* 頁面關閉或隱藏時立即同步 */
  flushNow() {
    clearTimeout(this._pushTimer);
    if (!this._hasPendingPush || !this._pendingPushStr || !auth.currentUser) return;
    const user = auth.currentUser;
    const str = this._pendingPushStr;
    const at = Date.now();
    try {
      db.collection('userData').doc(user.uid).set({ sc2: str, updatedAt: at }, { merge: true }).catch(() => {});
      this._lastSavedCloudStr = str;
      this._hasPendingPush = false;
    } catch(_) {}
  }
};

/* 網路復原與生命週期監聽 */
window.addEventListener('online', () => {
  cloudSync.status('busy', '📶 網路已連線，同步中...');
  if (cloudSync._hasPendingPush) cloudSync._executePush();
  else cloudSync.pull();
});
window.addEventListener('pagehide', () => cloudSync.flushNow());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') cloudSync.flushNow();
});

/* ---------- 定時跳出的信:當兵第 N 天自動開啟,每封只跳一次(記在 userData.lettersRead) ---------- */
function armyDayNumber(site) {                       // 入伍當天 = 第 1 天
  const [y, m, d] = site.dates.armyStart.split('-').map(Number), t = new Date();
  return Math.floor((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - new Date(y, m - 1, d)) / 864e5) + 1;
}
function showLetter(l, onClose) {
  const o = document.createElement('div');
  o.style.cssText = 'position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:20px';
  const b = document.createElement('div');
  b.style.cssText = 'background:var(--card,#fff);color:var(--fg,#4a2230);border:3px solid var(--accent,#e8557a);border-radius:20px;padding:24px;max-width:420px;width:100%;max-height:85vh;overflow:auto;text-align:left;font-family:inherit';
  const h = document.createElement('h3'); h.style.cssText = 'margin:0 0 4px;color:var(--accent,#e8557a)'; h.textContent = (l.icon || '💌') + ' ' + (l.title || '給妳的信');
  const d = document.createElement('div'); d.style.cssText = 'font-size:.8rem;opacity:.7;margin-bottom:10px'; d.textContent = '當兵第 ' + l.day + ' 天';
  const p = document.createElement('p'); p.style.cssText = 'line-height:1.8;white-space:pre-wrap;margin:0 0 16px'; p.textContent = l.content || '';
  const btn = document.createElement('button'); btn.textContent = '收下這封信 💖';
  btn.style.cssText = 'width:100%;background:var(--accent,#e8557a);color:#fff;border:0;border-radius:999px;padding:12px;font-size:1rem;font-weight:bold;cursor:pointer';
  btn.onclick = () => { o.remove(); if (onClose) onClose(); };
  b.append(h, d, p, btn); o.appendChild(b); document.body.appendChild(o);
}
async function checkLetters(user) {
  if (IS_LOGIN_PAGE || IS_ADMIN_PAGE) return;
  const site = await loadSiteConfig(), day = armyDayNumber(site); if (day < 1) return;
  let read = {};
  try { const s = await db.collection('userData').doc(user.uid).get(); read = (s.exists && s.data().lettersRead) || {}; } catch (e) { return; }
  const due = (site.letters || []).filter(l => l.day <= day && !read[l.day]).sort((a, b) => a.day - b.day);
  const next = () => {
    const l = due.shift(); if (!l) return;
    whenDomReady(() => showLetter(l, () => {
      db.collection('userData').doc(user.uid).set({ lettersRead: { [l.day]: true } }, { merge: true }).catch(console.error);
      next();
    }));
  };
  next();
}
authReady.then(u => { if (u) checkLetters(u); });

/* ---------- 入伍前鎖定:除了刮刮樂、遊樂園,其餘頁面要到入伍當天(armyStart 00:00)才開放;本寶的帳號不受限 ---------- */
const LOCK_PAGES = ['timeline', 'daily', 'capsule', 'games', 'quiz', 'army'];
const PAGE_NAME = (location.pathname.split('/').pop() || 'index.html').replace('.html', '') || 'index';
const IS_LOCK_PAGE = LOCK_PAGES.includes(PAGE_NAME);
if (IS_LOCK_PAGE) document.documentElement.style.visibility = 'hidden';   // 先藏起來,避免鎖定頁面閃一下
authReady.then(async user => {
  try {
    if (!user || isAdminUser(user) || IS_LOGIN_PAGE || IS_ADMIN_PAGE) return;
    const site = await loadSiteConfig();
    const [y, m, d] = site.dates.armyStart.split('-').map(Number), start = new Date(y, m - 1, d);
    if (site.lockUntilArmy === false || Date.now() >= start) return;
    await new Promise(r => whenDomReady(r));
    document.querySelectorAll('nav a').forEach(a => {
      if (LOCK_PAGES.includes((a.getAttribute('href') || '').replace('.html', ''))) a.textContent += ' 🔒';
    });
    if (!IS_LOCK_PAGE) return;
    const days = Math.ceil((start - Date.now()) / 864e5);
    const o = document.createElement('div');
    o.style.cssText = 'position:fixed;inset:0;z-index:90;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center;background:linear-gradient(135deg,var(--b1,#ffe3ec),var(--b2,#ffd0e4),var(--b3,#e6dcff));color:var(--fg,#4a2230);font-family:inherit';
    const mk = (tag, txt, css) => { const e = document.createElement(tag); e.textContent = txt; if (css) e.style.cssText = css; return e; };
    o.append(
      mk('div', '🔒', 'font-size:3.5rem'),
      mk('h2', '這裡還沒開放喔', 'margin:0;color:var(--accent,#e8557a)'),
      mk('p', '等本寶入伍那天,這個區域就會自動開啟 💖', 'margin:0;line-height:1.7'),
      mk('p', '還有 ' + days + ' 天', 'margin:0;font-size:1.6rem;font-weight:bold;color:var(--accent,#e8557a)')
    );
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:10px;margin-top:8px';
    [['去刮刮樂 🎟️', 'index.html'], ['去遊樂園 🎡', 'park.html']].forEach(([t, h]) => {
      const a = mk('a', t, 'background:var(--accent,#e8557a);color:#fff;text-decoration:none;padding:10px 20px;border-radius:999px;font-weight:bold');
      a.href = h; row.appendChild(a);
    });
    o.appendChild(row); document.body.appendChild(o);
  } finally { document.documentElement.style.visibility = ''; }
});

/* PWA Service Worker 自動註冊 (支援離線與加速) */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW registration note:', err.message));
  });
}

