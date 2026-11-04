# Tony-Betty 💖 超級優化版

專屬情侶浪漫網站（純前端 + Firebase Auth / Firestore），可直接部署到 GitHub Pages。

## 🌟 本次超級優化重大修復 (Super Optimization)
1. **解決刮刮卡刮到後沒有存檔問題**：
   - **智能雙向合併演算法 (`mergeGameStates`)**：抽到的獎品與成就採用「只增不減」原則，保證本機與雲端同步時**絕不會被舊資料覆蓋**。
   - **降載判定閾值**：刮開比例從 55% 優化至 40%，且手指放開達 28% 自動刮開，中央文字看清楚就保證揭曉。
   - **新增「✨ 直接刮開」與雙擊刮開**：即使手痠或角落死角也能一鍵刮開並 100% 寫入存檔。
   - **獎品庫全面對齊**：首頁開機直接載入 `site-config.js` 的 800+ 完整獎品庫，避免待抽卡（pending）因對照不到而被刷掉。

2. **徹底解決存檔遺失問題**：
   - **雙層本機容災快取**：同時維護 `sc2` 主存檔與 `sc2_backup` 鏡像存檔，自動損毀偵測與恢復。
   - **Firestore 離線持久化 (IndexedDB)**：全面啟用 `db.enablePersistence({ synchronizeTabs: true })`，斷網、搭捷運、多分頁都不怕斷線。
   - **保證送達上傳佇列**：防抖動合併請求，斷網時排程重試，在瀏覽器即將關閉（`pagehide` / `visibilitychange`）時強制同步。
   - **信箱大小寫容錯**：修復手機鍵盤首字母大寫導致 Firebase 安全規則拒絕存檔的問題。

3. **後台新增存檔檢視與備份還原工具 (`admin.html`)**：
   - 🔍 **存檔即時檢視**：可隨時查看寶鼻目前刮中幾張、兌換幾張、連續天數與成就。
   - 📥 **一鍵匯出備份 (JSON)**：隨時下載目前進度檔案至電腦備份。
   - 📤 **一鍵匯入還原 (JSON)**：若需要手動還原存檔，上傳檔案即可立即同步至雲端。

## 檔案結構
| 檔案 | 說明 |
|---|---|
| `login.html` | 登入 / 註冊（已加入小寫自動正規化） |
| `index.html` | 刮刮樂（支援快速刮開、收藏冊搜尋分頁、成就系統） |
| `park.html` | 遊樂園（11 款互動小遊戲，支援容災讀取） |
| `timeline.html` | 我們的故事（甜蜜時間軸 + 專屬影片） |
| `daily.html` | 每日問答（兩人即時同步 SumOne 模式） |
| `capsule.html` | 時光膠囊（退伍倒數 + 每日留言 + 急救包） |
| `admin.html` | 後台控制中心（網站設定、加送卡片、存檔備份還原） |
| `firebase-init.js` | 核心引擎：智能合併、離線持久化、防丟存檔佇列 |
| `site-config.js` | 800+ 豐富獎品庫與全站預設文案 |
| `style.css` | 甜蜜粉紅主題樣式 |
| `firestore.rules` | Firestore 安全規則（已加入 `.lower()` 大小寫容錯） |

## 部署提醒
1. **Firestore Rules**：請將 `firestore.rules` 複製貼到 Firebase Console → Firestore → Rules → 發布。
2. **Authentication → Settings → Authorized domains**：確認已加入 GitHub Pages 網域（例如 `tony0930508440.github.io`）。
