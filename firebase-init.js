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
async function loadSiteConfig() {
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
