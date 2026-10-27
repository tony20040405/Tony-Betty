/* 共用:Firebase 初始化、登入守門、後台連結、雲端存檔同步 */
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
    if (IS_ADMIN_PAGE && !admin) { alert('只有定宇本寶才能進入後台喔!'); location.replace('index.html'); }
  });
});

/* 網站內容 = 預設值 + 雲端後台設定(coupleData/config) */
let _sitePromise = null;
function loadSiteConfig(force) {                      // 同一頁只讀一次雲端設定;force=true 重新讀取
  if (force || !_sitePromise) _sitePromise = _loadSiteConfig();
  return _sitePromise.then(c => JSON.parse(JSON.stringify(c)));
}
async function _loadSiteConfig() {
  const base = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  try {
    const doc = await db.collection('coupleData').doc('config').get();
    if (doc.exists) {
      const c = doc.data();
      Object.keys(c).forEach(k => {
        const v = c[k];
        base[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? Object.assign({}, base[k] || {}, v) : v;
      });
    }
  } catch (e) { console.warn('讀取後台設定失敗,改用預設值', e); }
  return base;
}

/* 刮刮樂 / 遊樂園的進度:localStorage(快取) + Firestore userData/{uid}(雲端)
   規則:先讀雲端、確認完才允許寫入,避免新裝置的空資料蓋掉雲端;誰的更新時間較新就用誰。
   另外會即時監聽雲端,別台裝置存檔後這台自動更新。畫面左下角顯示同步狀態。 */
const cloudSync = {
  ready: false, _unsub: null, _onRemote: null, _badge: null, _fade: 0,
  status(kind, text) {
    if (!this._badge) {
      const b = document.createElement('div');
      b.style.cssText = 'position:fixed;left:8px;bottom:calc(env(safe-area-inset-bottom,0px) + 8px);z-index:40;font:12px/1.2 system-ui,sans-serif;padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.92);color:#4a2230;box-shadow:0 2px 8px rgba(0,0,0,.15);pointer-events:none;transition:opacity .4s';
      whenDomReady(() => document.body.appendChild(b));
      this._badge = b;
    }
    const b = this._badge; b.textContent = text; b.style.opacity = '1';
    b.style.color = kind === 'err' ? '#c0213f' : '#4a2230';
    clearTimeout(this._fade);
    if (kind === 'ok') this._fade = setTimeout(() => { b.style.opacity = '.35'; }, 3000);
  },
  async pull() {
    const user = await authReady; if (!user) return;
    if (localStorage.getItem('sc2Uid') !== user.uid) {          // 換帳號 → 不沿用上一個帳號的本機資料
      localStorage.removeItem('sc2'); localStorage.removeItem('sc2At');
      localStorage.setItem('sc2Uid', user.uid);
    }
    const localAt = Number(localStorage.getItem('sc2At') || 0);
    this.status('busy', '⏳ 同步中...');
    try {
      const doc = await db.collection('userData').doc(user.uid).get();
      const d = doc.exists ? doc.data() : null;
      if (d && d.sc2 && Number(d.updatedAt || 0) >= localAt) {
        localStorage.setItem('sc2', d.sc2);
        localStorage.setItem('sc2At', String(d.updatedAt || 0));
      }
      this.ready = true; this.status('ok', '☁️ 已同步');
    } catch (e) { console.error('讀取雲端存檔失敗(本次只存在本機)', e); this.status('err', '⚠️ 未連上雲端(只存在本機)'); }
  },
  /* 即時監聽:別台裝置存檔 → 這台更新 localStorage 並呼叫 onRemote() 重畫畫面 */
  listen(onRemote) {
    const user = auth.currentUser; if (!user || this._unsub) return;
    this._onRemote = onRemote;
    this._unsub = db.collection('userData').doc(user.uid).onSnapshot(snap => {
      if (snap.metadata.hasPendingWrites) return;               // 自己剛寫的,不用處理
      const d = snap.exists ? snap.data() : null;
      const localAt = Number(localStorage.getItem('sc2At') || 0), remoteAt = d ? Number(d.updatedAt || 0) : 0;
      let changed = false;
      if (d && d.sc2 && remoteAt > localAt) {
        localStorage.setItem('sc2', d.sc2); localStorage.setItem('sc2At', String(remoteAt)); changed = true;
      }
      if (!snap.metadata.fromCache) {                           // 真的連到伺服器了
        const wasReady = this.ready; this.ready = true; this.status('ok', '☁️ 已同步');
        if (!wasReady && localAt > remoteAt) this.push(localStorage.getItem('sc2') || '{}', true);   // 離線期間的進度補上傳
      }
      if (changed && this._onRemote) this._onRemote();
    }, e => { console.error('雲端監聽失敗', e); this.status('err', '⚠️ 未連上雲端(只存在本機)'); });
  },
  push(str, force) {
    if (!force && str === localStorage.getItem('sc2')) return Promise.resolve();   // 沒變就不寫,避免兩台互相觸發
    const at = Date.now();
    localStorage.setItem('sc2', str); localStorage.setItem('sc2At', String(at));
    if (!this.ready || !auth.currentUser) { this.status('err', '⚠️ 未連上雲端(只存在本機)'); return Promise.resolve(); }
    this.status('busy', '⏳ 同步中...');
    return db.collection('userData').doc(auth.currentUser.uid)
      .set({ sc2: str, updatedAt: at }, { merge: true })
      .then(() => this.status('ok', '☁️ 已同步'))
      .catch(e => { console.error('雲端儲存失敗', e); this.status('err', '⚠️ 雲端儲存失敗'); });
  }
};

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

/* ---------- 入伍前鎖定:除了刮刮樂、遊樂園,其餘頁面要到入伍當天(armyStart 00:00)才開放;定宇的帳號不受限 ---------- */
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
      mk('p', '等定宇入伍那天,這個區域就會自動開啟 💖', 'margin:0;line-height:1.7'),
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
