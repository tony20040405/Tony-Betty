# Tony-Betty 💖

專屬情侶網站(純前端 + Firebase Auth / Firestore),可直接部署到 GitHub Pages。

## 檔案
| 檔案 | 說明 |
|---|---|
| `login.html` | 登入 / 註冊 |
| `index.html` | 刮刮樂 |
| `park.html` | 遊樂園(小遊戲) |
| `timeline.html` | 我們的故事(內容來自後台設定) |
| `daily.html` | 每日問答(兩人即時同步) |
| `capsule.html` | 時光膠囊 |
| `admin.html` | 後台,僅 `tony0930508440@gmail.com` 可進入 |
| `firebase-init.js` | Firebase 初始化、登入守門、雲端存檔同步 |
| `site-config.js` | 預設網站內容(後台存到雲端的設定會覆蓋) |
| `style.css` | 共用樣式 |
| `firestore.rules` | Firestore 安全規則(請貼到 Firebase Console) |

## 部署前必做
1. **Firestore Rules**:把 `firestore.rules` 裡寶鼻的信箱改掉,貼到 Firebase Console → Firestore → Rules → 發布。
2. **Authentication → Settings → Authorized domains**:加入你的 GitHub Pages 網域(`帳號.github.io`)。
3. 若不想讓別人註冊,可到 Authentication 把兩個帳號建好後,於 Rules 以信箱白名單鎖住(已寫在 `firestore.rules`)。
4. 所有檔案放在同一層(repo 根目錄),檔名不要加 `_1`。
