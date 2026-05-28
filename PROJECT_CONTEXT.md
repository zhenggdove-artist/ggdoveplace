# GGdove Portfolio Project Context

更新日期：2026-05-28

## 專案定位

這是藝術家鄭君朋 / GGdove 的作品集網站。主要網站是根目錄的純靜態 HTML/CSS/JS，部署到 GitHub Pages，網域由 `CNAME` 指向 `www.zhenggdove.com`。

整體氣質是深色、VHS、Zalgo 崩文字、互動式首頁、作品與展覽資料導向的 portfolio。後續新增分頁時，應優先沿用現有的 `page-wrapper`、`renderHeader()`、`loadData()`、`initVHS()`、`applyTextStyles()`、`applyZalgo()`、`applyBackground()` 流程。

## 技術架構

- 根目錄：正式作品集網站，純靜態檔案，不需要 build。
- `content/data.json`：主要內容資料，包含 site 設定、bio、contact、projects、exhibition、weapons、customPages 等。
- `content/visual.json`：VHS 視覺特效參數。
- `admin/`：Decap CMS 後台，設定在 `admin/config.yml`。
- `.github/workflows/deploy.yml`：push 到 `main` 後部署整個根目錄到 GitHub Pages。
- `GAME/`：獨立的 Vite/React 子專案，不是目前 portfolio 根站的主架構；除非需求明確指到遊戲子專案，先不要動。

## 主要檔案

- `index.html`：互動首頁。使用 canvas 生物、orbit ASCII、SVG 導航。導航連到 `bio.html`、`relic.html`、`exhibition.html`、`play.html`。
- `bio.html`：CV / bio 頁，資料由 `renderBio()` 從 `content/data.json` 產生。
- `relic.html`：Relics 頁，使用 `renderRelic()`，會合併 projects 與 weapons。
- `projects.html`：舊 Works 頁，使用 `renderProjects()`。
- `weapons.html`：舊 Weapons 頁，使用 `renderWeapons()`。
- `play.html`：遊戲 / 互動作品頁，大部分內容目前硬寫在 HTML，影片可被 CMS 的 `siteData.play.works` 覆蓋。
- `shop.html`：商品陳列頁，讀取 `SHOP/` 素材，購買按鈕目前僅為純前端 alert，不接後端 API。
- `exhibition.html`：展覽列表，使用 `renderExhibition()`。
- `exhibition-detail.html`：展覽細節，使用 query string `?id=` 找 `content/data.json` 的 exhibition id。
- `custom-page.html`：自訂頁模板，使用 query string `?id=` 找 `customPages`。
- `css/style.css`：全站共用視覺、排版、gallery、lightbox、VHS/Zalgo 輔助樣式。
- `js/main.js`：資料載入、導航、gallery、lightbox、展覽、自訂頁、Bio、Contact、Zalgo、背景、字型設定。
- `js/vhs-effect.js`：全站 VHS canvas overlay。

## 共用頁面流程

典型內頁結構如下：

```html
<div class="page-wrapper">
  <nav id="main-nav"></nav>
  <h2 class="page-title">Page Title</h2>
  <main id="page-specific-root"></main>
</div>
<footer><p>© GGdove</p></footer>
<script src="js/vhs-effect.js"></script>
<script src="js/main.js"></script>
<script>
  loadData().then(() => {
    renderHeader('active-id');
    // render page content here
    initVHS();
    applyTextStyles(siteData.site);
    applyZalgo(siteData.site);
    applyBackground(siteData.site);
  });
</script>
```

`renderHeader(activePage)` 目前的主導航順序：

- `cv` -> `bio.html`
- `relic` -> `relic.html`
- `exhibition` -> `exhibition.html`
- `play` -> `play.html`
- `shop` -> `shop.html`
- `custom-{id}` -> `custom-page.html?id={id}`

## 新增分頁策略

優先選項：如果只是文字、圖片、影片混排的作品頁，用 `customPages` 加資料即可，網址是：

```text
custom-page.html?id=your-page-id
```

好處是 `renderHeader()` 已經會把 `customPages` 自動加入導覽，不必新增 HTML 檔。缺點是版型較通用。

需要特殊互動或特殊版面時，再建立新的 `xxx.html`，並沿用共用頁面流程。若要讓它出現在導覽，需要修改 `js/main.js` 的 `renderHeader()` pages 陣列。

## 資料與路徑慣例

- 上傳圖片預設放 `images/uploads/`。
- CMS public path 是 `/ggdoveplace/images/uploads`。
- `js/main.js` 的 `fixImg()` 會把 `/ggdoveplace/...` 在自訂網域下轉成 `/...`，所以不要隨意移除。
- HTML 已宣告 `<meta charset="UTF-8">`；若 PowerShell 顯示中文變亂碼，通常是終端機編碼顯示問題，不代表瀏覽器內容壞掉。

## 視覺與互動注意事項

- 全站偏暗色、細字、VHS、glitch、Zalgo；新增頁面應延續這個語言。
- 圖片作品原色原則很重要。`css/style.css` 明確註記作品圖不要套 hue rotate / saturate 之類會改色的 filter。
- 內頁背景、字型、frame、Zalgo、hover 顏色都可能被 `content/data.json` 的 `site` 設定覆蓋。
- `initVHS()` 依賴 `visualData`，所以要在 `loadData()` 後呼叫。
- gallery 類頁面使用 `renderProjects()`，會依 `site.galleryLayout`、`imageSize`、`captionStyle`、`imageAspect` 等設定動態套 class。

## 本機預覽

根目錄是靜態站，可用任一靜態伺服器預覽，例如：

```powershell
python -m http.server 8000
```

然後開：

```text
http://localhost:8000
```

`GAME/` 子專案若需要獨立跑：

```powershell
cd GAME
npm install
npm run dev
```

## 後續做新分頁時先確認

- 這頁要不要進主導覽。
- 是一般內容頁，還是需要特殊互動。
- 素材要放在既有 `images/`、`images/uploads/`，或新增專屬資料夾。
- 要不要由 CMS 管理內容，或直接硬寫 HTML。
- 手機版是否需要不同排列，尤其是影片、gallery、canvas 或大圖。

## Shop / CMS 管理狀態

- `shop.html` 已改成資料驅動頁面，商品內容讀取 `content/data.json` 的 `shop` 節點。
- Decap CMS 已新增 `Shop (商品頁)` collection，對應 `content/data.json > shop`。
- Shop 後台可編輯 hero、商品區塊、商品欄位、圖片、影片、作品論述、購買提示、退款聲明與 Footer 聯絡資訊。
- Shop collection 設定了 `media_folder: /SHOP` 與 `public_folder: /ggdoveplace/SHOP`，後台新增的 Shop 圖片/影片會集中進根目錄 `SHOP/`。
- `admin/index.html` 已新增 Shop 即時預覽模板，接近前台酸性/終端機視覺。
- 自訂頁 `customPages.images` 原本有影片欄位但前台只顯示圖片，已修正為圖片/影片皆可渲染。

2026-05-29 修正：Decap file collection 曾因 Shop 上傳路徑設定錯位，將圖片放進 `content/SHOP/`，但前台會依 `/ggdoveplace/SHOP/...` 請求而 404。Shop 現在以 `media_folder: /SHOP` 搭配 `public_folder: /ggdoveplace/SHOP`，讓後台上傳檔案集中到 repo 根目錄 `SHOP/`。
