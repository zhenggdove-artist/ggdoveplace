# GGdove Artist Portfolio — 專案筆記

## 專案概述
藝術家作品集網站，從 Wix 遷移至 GitHub Pages 自架。
- **GitHub Repo**: `zhenggdove-artist/ggdoveplace`
- **線上網址**: https://zhenggdove-artist.github.io/ggdoveplace/
- **CMS 後台**: https://zhenggdove-artist.github.io/ggdoveplace/admin/
- **CMS 系統**: Decap CMS（前 Netlify CMS），OAuth proxy 架在 Render (`ggdove-cms-auth.onrender.com`)

## 技術架構
- 純靜態網站（HTML + CSS + JS），部署於 GitHub Pages
- Decap CMS 作為內容管理後台，Save = 直接推送 main 分支
- 內容資料存放於 `content/data.json`、`content/visual.json`
- 圖片上傳至 `images/uploads/`

## 網站頁面
| 檔案 | 頁面 |
|---|---|
| `index.html` | 首頁（Works 作品展示） |
| `exhibition.html` | 展覽列表 |
| `exhibition-detail.html` | 展覽詳情（子頁面） |
| `weapons.html` | 武器頁面 |
| `bio.html` | 簡介 |
| `contact.html` | 聯絡 |
| `custom-page.html` | 自訂頁面 |
| `projects.html` | 作品頁 |
| `admin/index.html` | CMS 後台 |

## CMS 管理的 Collections
- **Works** — 作品圖片、標題、年份、媒材、尺寸
- **Weapons** — 武器圖片、名稱、價格
- **Exhibition** — 展覽資料、子頁面、輪播圖片/影片
- **Custom Pages** — 自訂頁面
- **Bio** — 姓名、照片、簡介
- **Contact** — Email、IG、地點
- **Site Settings** — 版型、字型、動畫、Zalgo 崩文字、背景設定
- **Visual Style** — VHS 視覺效果參數

## 視覺特色
- VHS / 復古電視效果（掃描線、顆粒、色差、光暈、故障條）
- Zalgo 崩文字效果（可逐元素設定）
- 深色系配色（#04040c 底色）

## 編輯紀錄

### 2026-03-16
- 發現本地 main 與遠端 origin/main 分岔（本地只有 Initial commit，遠端有 65 commits）
- 執行 `git reset --hard origin/main` 將本地同步至遠端最新狀態
- 檢查 CMS 後台架構與設定，確認功能正常

#### 功能修改：導航 hover 顏色 + 崩文字分層 + 圖片自動比例
1. **導航 hover 顏色可設定**
   - `admin/config.yml`: 新增 `navHoverColor` color widget 欄位於 Site Settings
   - `js/main.js`: 新增 `applyNavHoverColor()` 函數，將 hex 轉為 CSS 變數 `--nav-hover-color` 和 `--nav-hover-glow`
   - `css/style.css`: `.nav-links a:hover` 和 `.nav-links a.active` 改用 CSS 變數 `var(--nav-hover-color, var(--text-bright))`

2. **崩文字效果在正常文字之下**
   - `js/main.js` `reZalgo()`: 改為雙層結構 — `.zalgo-normal`（z-index:1）顯示原文 + `.zalgo-layer`（z-index:0, opacity:0.55）顯示崩文字
   - `css/style.css`: 新增 `.zalgo-normal` 和 `.zalgo-layer` 樣式規則

3. **圖片自動偵測橫/直比例**
   - `admin/config.yml`: Image Aspect 新增 "Auto 自動偵測" 選項 (value: "auto")
   - `js/main.js` `renderProjects()`: 圖片 onload 偵測 naturalWidth/naturalHeight，直圖加 `.portrait` class
   - `css/style.css`: 新增 `.gallery-grid.aspect-auto` 規則（橫圖 4:3、直圖 3:4）
