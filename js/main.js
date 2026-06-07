/* =============================================
   GGDOVE PORTFOLIO — Main JS
   ============================================= */

const DATA_URL   = 'content/data.json';
const VISUAL_URL = 'content/visual.json';
let siteData   = null;
let visualData = null;
let lightboxItems = [];
let lightboxIndex = 0;
let shopGallerySets = [];
let shopGalleryCurrentSet = [];
let shopGalleryCurrentIndex = 0;
const INITIAL_SHOW = 9;

// ── Image path fixer ────────────────────────────
// CMS media paths can be saved as /ggdoveplace/images/..., /images/...,
// images/..., /SHOP/... or SHOP/... depending on whether the file was
// uploaded or selected from the media library. Normalize at render time so
// the same content works on GitHub Pages subpath and the custom domain.
const _onSubpath = location.pathname.startsWith('/ggdoveplace/');
function fixImg(src) {
  if (!src || typeof src !== 'string') return src;
  const value = src.trim();
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) return value;
  if (_onSubpath) {
    if (value.startsWith('/ggdoveplace/')) return value;
    if (value.startsWith('/')) return '/ggdoveplace' + value;
    return value;
  }
  if (value.startsWith('/ggdoveplace/')) return value.replace('/ggdoveplace/', '/');
  return value;
}

// ── Load data ──────────────────────────────────
async function loadData() {
  // cache:'no-cache' sends a conditional request so browser always gets the
  // latest version after a CMS publish — without this, stale cached data.json
  // would make site settings changes appear to have no effect.
  const [data, visual] = await Promise.all([
    fetch(DATA_URL,   { cache: 'no-cache' }).then(r => r.json()),
    fetch(VISUAL_URL, { cache: 'no-cache' }).then(r => r.json()).catch(() => ({}))
  ]);
  siteData   = data;
  visualData = visual;
  applyFonts(siteData.site);
  return siteData;
}

// ── Zalgo Text Engine ──────────────────────────
// Unicode combining-mark pools (ported from zalgo-generator/src/utils/zalgo.ts)
const ZALGO_UP = [
  '\u030d','\u030e','\u0304','\u0305','\u033f','\u0311','\u0306','\u0310',
  '\u0352','\u0357','\u0351','\u0307','\u0308','\u030a','\u0342','\u0343',
  '\u0344','\u034a','\u034b','\u034c','\u0303','\u0302','\u030c','\u0350',
  '\u0300','\u0301','\u030b','\u030f','\u0312','\u0313','\u0314','\u033d',
  '\u0309','\u0363','\u0364','\u0365','\u0366','\u0367','\u0368','\u0369',
  '\u036a','\u036b','\u036c','\u036d','\u036e','\u036f','\u033e','\u035b',
  '\u0346','\u031a'
];
const ZALGO_MID = [
  '\u0315','\u031b','\u0340','\u0341','\u0358','\u0321','\u0322','\u0327',
  '\u0328','\u0334','\u0335','\u0336','\u034f','\u035c','\u035d','\u035e',
  '\u0360','\u0362','\u0338','\u0337','\u0361','\u0489'
];
const ZALGO_DOWN = [
  '\u0316','\u0317','\u0318','\u0319','\u031c','\u031d','\u031e','\u031f',
  '\u0320','\u0324','\u0325','\u0326','\u0329','\u032a','\u032b','\u032c',
  '\u032d','\u032e','\u032f','\u0330','\u0331','\u0332','\u0333','\u0339',
  '\u033a','\u033b','\u033c','\u0345','\u0347','\u0348','\u0349','\u034d',
  '\u034e','\u0353','\u0354','\u0355','\u0356','\u0359','\u035a','\u0323'
];

// 每個文字元素各自的 Zalgo 計時器（key = 元素名稱）
const _zalgoTimers = {};

function generateZalgo(text, { up = true, mid = false, down = false, intensity = 0.3 } = {}) {
  const maxMarks = Math.ceil(intensity * 15);
  const minMarks = Math.max(1, Math.floor(intensity * 3));
  const rnd  = arr => arr[Math.floor(Math.random() * arr.length)];
  const rndN = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
  let out = '';
  for (let i = 0; i < text.length; i++) {
    out += text[i];
    if (/\s/.test(text[i])) continue;
    // Skip CJK / Asian scripts — combining marks don't render as vertical
    // diacritics on CJK glyphs and cause tofu-box artifacts on Windows
    if (text.charCodeAt(i) >= 0x2E80) continue;
    if (up)   for (let j = rndN(minMarks, maxMarks); j--;) out += rnd(ZALGO_UP);
    if (mid)  for (let j = rndN(minMarks, maxMarks); j--;) out += rnd(ZALGO_MID);
    if (down) for (let j = rndN(minMarks, maxMarks); j--;) out += rnd(ZALGO_DOWN);
  }
  return out;
}

// Coerce CMS-serialised values (Decap CMS sometimes sends booleans/numbers as strings)
function _coerceBool(v, def) {
  if (typeof v === 'boolean') return v;
  if (v === 'true')  return true;
  if (v === 'false') return false;
  return def;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsSingle(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, '\\n');
}

// ── 逐元素文字樣式套用 ─────────────────────────
// ── 單位正規化：純數字自動補 px（如使用者輸入 200 → 200px）
function normLen(val) {
  if (!val) return val;
  const v = String(val).trim();
  if (v === '' || v === '0') return '0px';
  return /^-?\d+\.?\d*$/.test(v) ? v + 'px' : v;
}

// ── Apply nav hover color ────────────────────────
function applyNavHoverColor(site) {
  if (!site) return;
  const color = (site.navHoverColor || '').trim();
  if (color && color !== '#eaf2ff') {
    document.documentElement.style.setProperty('--nav-hover-color', color);
    // parse hex to create rgba glow
    const hex = color.replace('#', '');
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      document.documentElement.style.setProperty('--nav-hover-glow', `rgba(${r},${g},${b},0.55)`);
    }
  } else {
    document.documentElement.style.removeProperty('--nav-hover-color');
    document.documentElement.style.removeProperty('--nav-hover-glow');
  }
}

// 從 site.textStyles 讀取每個元素的 fontSize / x / y / color 並套用
// 使用 el.style.setProperty 搭配 !important 確保覆蓋所有 CSS 規則（含 !important）
function applyTextStyles(site) {
  applyNavHoverColor(site);
  applyFrameSettings(site);
  if (!site || !site.textStyles) return;

  const selectorMap = {
    'pageTitle':    '.page-title',
    'bioH1':        '.bio-content h1',
    'exhibitionH2': '.exhibition-details h2',
    'contactH2':    '.contact-info h2',
    'navLogo':      '.nav-logo',
    'navLinks':     '.nav-links a'
  };

  const ts = site.textStyles;
  // 顏色「重置為預設」的識別詞（填這些 = 移除 inline style → 使用 CSS 預設色）
  const COLOR_RESET = ['', 'default', 'inherit', 'unset', 'none', '預設', 'reset'];

  Object.entries(selectorMap).forEach(([key, sel]) => {
    const s = ts[key];
    if (!s) return;
    document.querySelectorAll(sel).forEach(el => {
      // ── Font-size ──────────────────────────────
      const fs = normLen(s.fontSize);
      if (fs) {
        el.style.setProperty('font-size', fs, 'important');
      } else {
        el.style.removeProperty('font-size');
      }

      // ── Color ──────────────────────────────────
      // useDefaultColor=true 或欄位為空 → removeProperty → 還原 CSS 預設色
      const col = (s.color || '').trim();
      const useDefColor = s.useDefaultColor === true || s.useDefaultColor === 'true'
                       || (s.useDefaultColor === undefined && (!col || COLOR_RESET.includes(col.toLowerCase())));
      if (!useDefColor && col && !COLOR_RESET.includes(col.toLowerCase())) {
        el.style.setProperty('color', col, 'important');
      } else {
        el.style.removeProperty('color');
      }

      // ── Transform translate(x, y) ──────────────
      const x = normLen(s.x) || '0px';
      const y = normLen(s.y) || '0px';
      if (x !== '0px' || y !== '0px') {
        el.style.setProperty('transform', `translate(${x}, ${y})`, 'important');
      } else {
        el.style.removeProperty('transform');
      }

      // ── VHS Glitch 色差閃爍 ──────────────────────
      const g = s.glitch;
      if (g && (g.enabled === true || g.enabled === 'true')) {
        const intensity = parseFloat(g.intensity) || 1.0;
        const speed     = parseFloat(g.speed)     || 4.0;
        const c1        = g.color1    || '#ff001e';
        const c2        = g.color2    || '#003cff';
        const glow      = g.glowColor || '#c8c0e8';
        el.style.setProperty('--glitch-red',  c1);
        el.style.setProperty('--glitch-blue', c2);
        el.style.setProperty('--glitch-glow', glow);
        el.style.setProperty('--glitch-intensity', intensity);
        el.style.setProperty('animation', `vhsGlitchDynamic ${speed}s infinite`, 'important');
      } else {
        el.style.removeProperty('animation');
        el.style.removeProperty('--glitch-red');
        el.style.removeProperty('--glitch-blue');
        el.style.removeProperty('--glitch-glow');
        el.style.removeProperty('--glitch-intensity');
      }
    });
  });
}

// ── 逐元素 Zalgo 效果套用 ───────────────────────
// 每個元素有獨立計時器、獨立設定；優先讀 textStyles[key].zalgo，
// 若無則退回全域 zalgoEffect（相容舊版 data.json）
function applyZalgo(site) {
  if (!site) return;

  // 清除上次留下的所有計時器（換頁時重新套用用）
  Object.keys(_zalgoTimers).forEach(k => {
    clearInterval(_zalgoTimers[k]);
    delete _zalgoTimers[k];
  });

  const globalCfg  = site.zalgoEffect  || null;
  const textStyles = site.textStyles   || {};

  // 新版：以 textStylesKey → CSS selector 對應
  const tsMap = {
    'pageTitle':    { sel: '.page-title',            legacyTarget: 'page-title'    },
    'bioH1':        { sel: '.bio-content h1',         legacyTarget: 'bio-h1'        },
    'exhibitionH2': { sel: '.exhibition-details h2',  legacyTarget: 'exhibition-h2' },
    'contactH2':    { sel: '.contact-info h2',        legacyTarget: 'contact-h2'    },
    'navLogo':      { sel: '.nav-logo',               legacyTarget: 'nav-logo'      },
    'navLinks':     { sel: '.nav-links a',            legacyTarget: 'nav-links'     }
  };

  Object.entries(tsMap).forEach(([key, { sel, legacyTarget }]) => {
    // 1. 優先用 per-element 設定
    const perEl = textStyles[key] && textStyles[key].zalgo;

    // 2. 無 per-element 時退回全域
    let cfg = null;
    if (perEl) {
      cfg = perEl;
    } else if (globalCfg && _coerceBool(globalCfg.enabled, true)) {
      const targets = globalCfg.targets;
      const inTargets = Array.isArray(targets)
        ? targets.includes(legacyTarget)
        : (targets === 'all');
      if (inTargets) cfg = globalCfg;
    }
    if (!cfg) return;

    const enabled = _coerceBool(cfg.enabled, true);
    if (!enabled) return;

    const opts = {
      up:        _coerceBool(cfg.up,   true),
      mid:       _coerceBool(cfg.mid,  false),
      down:      _coerceBool(cfg.down, false),
      intensity: isNaN(Number(cfg.intensity)) ? 0.3 : Number(cfg.intensity)
    };
    const interval = Math.max(50, (isNaN(Number(cfg.interval)) ? 2.5 : Number(cfg.interval)) * 1000);

    function reZalgo() {
      document.querySelectorAll(sel).forEach(el => {
        if (!el.dataset.zalgoOrig) el.dataset.zalgoOrig = el.textContent;

        // 若尚未建立結構，建立「正常文字 + 背後崩文字」雙層結構
        if (!el.querySelector('.zalgo-layer')) {
          el.style.position = 'relative';
          el.innerHTML = '';

          // 正常文字層（在上面）
          const normal = document.createElement('span');
          normal.className = 'zalgo-normal';
          normal.style.position = 'relative';
          normal.style.zIndex = '1';
          normal.textContent = el.dataset.zalgoOrig;

          // 崩文字層（在下面）
          const zalgoLayer = document.createElement('span');
          zalgoLayer.className = 'zalgo-layer';
          zalgoLayer.style.cssText = 'position:absolute;inset:0;z-index:0;pointer-events:none;overflow:visible;';
          zalgoLayer.style.fontFamily = 'Georgia, "Times New Roman", "Noto Serif", serif';

          el.appendChild(zalgoLayer);
          el.appendChild(normal);
        }

        // 只更新崩文字層的內容
        const layer = el.querySelector('.zalgo-layer');
        if (layer) {
          layer.textContent = generateZalgo(el.dataset.zalgoOrig, opts);
        }
      });
    }

    reZalgo();
    _zalgoTimers[key] = setInterval(reZalgo, interval);
  });
}

// ── Apply site background (color / image / video) ──
const LIGHT_THEME_COLORS = [
  '#FFFAF4',
  '#FFF3EE',
  '#D1E9E9',
  '#F3F3FA',
  '#E8E8D0',
  '#F2E6E6',
  '#ECF5FF'
];

const THEME_VARS = [
  '--bg',
  '--bg-2',
  '--bg-3',
  '--text',
  '--text-dim',
  '--text-bright',
  '--text-secondary',
  '--accent',
  '--accent-dim',
  '--accent-glow',
  '--border',
  '--red-ghost',
  '--blue-ghost'
];

function normalizeThemeHex(value) {
  const v = String(value || '').trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(v) ? v : '';
}

function hexToRgb(hex) {
  const v = normalizeThemeHex(hex);
  if (!v) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(v.slice(1, 3), 16),
    g: parseInt(v.slice(3, 5), 16),
    b: parseInt(v.slice(5, 7), 16)
  };
}

function rgbToHex({ r, g, b }) {
  const clamp = n => Math.max(0, Math.min(255, Math.round(n)));
  return '#' + [clamp(r), clamp(g), clamp(b)]
    .map(n => n.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function mixHex(baseHex, mixHexValue, amount) {
  const base = hexToRgb(baseHex);
  const mix = hexToRgb(mixHexValue);
  const a = Math.max(0, Math.min(1, Number(amount) || 0));
  return rgbToHex({
    r: base.r + (mix.r - base.r) * a,
    g: base.g + (mix.g - base.g) * a,
    b: base.b + (mix.b - base.b) * a
  });
}

function getSiteThemeMode(site) {
  const bg = site && site.siteBackground;
  return String((bg && (bg.themeMode || bg.paletteMode || bg.colorMode)) || 'dark').toLowerCase();
}

function isLightTheme(site) {
  return getSiteThemeMode(site) === 'light';
}

function getLightThemeColor(bg) {
  const selected = normalizeThemeHex(bg && (bg.lightColor || bg.lightBackgroundColor));
  if (LIGHT_THEME_COLORS.includes(selected)) return selected;

  const legacyColor = normalizeThemeHex(bg && bg.color);
  if (LIGHT_THEME_COLORS.includes(legacyColor)) return legacyColor;

  return LIGHT_THEME_COLORS[0];
}

function applyThemePalette(site) {
  const root = document.documentElement;
  THEME_VARS.forEach(name => root.style.removeProperty(name));
  root.dataset.theme = 'dark';
  if (document.body) document.body.classList.remove('theme-light');

  const bg = (site && site.siteBackground) || {};
  if (!isLightTheme(site)) return { mode: 'dark', color: null };

  const lightBg = getLightThemeColor(bg);
  const panelBg = mixHex(lightBg, '#FFFFFF', 0.58);
  const recessedBg = mixHex(lightBg, '#1F2937', 0.08);

  root.dataset.theme = 'light';
  if (document.body) document.body.classList.add('theme-light');
  root.style.setProperty('--bg', lightBg);
  root.style.setProperty('--bg-2', panelBg);
  root.style.setProperty('--bg-3', recessedBg);
  root.style.setProperty('--text', '#2C3543');
  root.style.setProperty('--text-secondary', '#414B5A');
  root.style.setProperty('--text-dim', '#657184');
  root.style.setProperty('--text-bright', '#121822');
  root.style.setProperty('--accent', '#7A3F69');
  root.style.setProperty('--accent-dim', 'rgba(122,63,105,0.24)');
  root.style.setProperty('--accent-glow', 'rgba(122,63,105,0.20)');
  root.style.setProperty('--border', 'rgba(31,41,55,0.18)');
  root.style.setProperty('--red-ghost', 'rgba(170,40,64,0.42)');
  root.style.setProperty('--blue-ghost', 'rgba(24,92,142,0.34)');

  return { mode: 'light', color: lightBg };
}

function applyBackground(site) {
  if (!site || !site.siteBackground) return;
  const theme = applyThemePalette(site);
  const bg = site.siteBackground;
  const type = theme.mode === 'light' ? 'color' : (bg.type || 'color').toLowerCase();

  // 清除舊的背景層與影片層
  const oldLayer = document.getElementById('site-bg-layer');
  const oldVideo = document.getElementById('site-bg-video');
  if (oldLayer) oldLayer.remove();
  if (oldVideo) oldVideo.remove();

  // 純色模式
  if (type === 'color') {
    const useDefault = theme.mode !== 'light'
      && (bg.useDefaultColor === true || bg.useDefaultColor === 'true' || !bg.color);
    const color = theme.mode === 'light' ? theme.color : bg.color;
    if (!useDefault && color) {
      document.documentElement.style.setProperty('--bg', color);
      document.body.style.setProperty('background', color, 'important');
    } else {
      document.documentElement.style.removeProperty('--bg');
      document.body.style.removeProperty('background');
    }
    return;
  }

  // 圖片 / 影片模式：建立固定定位背景層
  const layer = document.createElement('div');
  layer.id = 'site-bg-layer';
  layer.style.cssText = 'position:fixed;inset:0;z-index:-2;pointer-events:none;overflow:hidden;';

  if (type === 'image' && bg.image) {
    const imgSize = bg.imageSize || 'cover';
    layer.style.backgroundImage   = 'url(' + fixImg(bg.image) + ')';
    layer.style.backgroundSize    = imgSize === 'repeat' ? 'auto' : imgSize;
    layer.style.backgroundRepeat  = imgSize === 'repeat' ? 'repeat' : 'no-repeat';
    layer.style.backgroundPosition = 'center center';
  } else if (type === 'video' && bg.video) {
    const vid = document.createElement('video');
    vid.id          = 'site-bg-video';
    vid.src         = fixImg(bg.video);
    vid.autoplay    = true;
    vid.loop        = true;
    vid.muted       = true;
    vid.playsInline = true;
    vid.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    layer.appendChild(vid);
  }

  // 選填暗化遮罩
  const ov = parseFloat(bg.overlayOpacity) || 0;
  if (ov > 0) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,' + ov + ');pointer-events:none;';
    layer.appendChild(overlay);
  }

  document.body.prepend(layer);

  // 讓 body 自身背景透明，改由 layer 提供
  document.body.style.setProperty('background', 'transparent', 'important');
}

// ── Apply frame settings (per-page color + size) ──
function applyFrameSettings(site) {
  if (!site || !site.frameSettings) return;
  const fs = site.frameSettings;
  const root = document.documentElement;

  function getColor(s) {
    if (!s) return null;
    if (s.transparent) return 'transparent';
    const useDefault = s.useDefaultColor !== false && s.useDefaultColor !== 'false';
    if (!useDefault && s.frameColor) return s.frameColor;
    return null;
  }

  function setVar(prop, color) {
    if (color) root.style.setProperty(prop, color);
    else root.style.removeProperty(prop);
  }

  // Frame colors (CSS custom properties)
  setVar('--frame-works',      getColor(fs.works));
  setVar('--frame-weapons',    getColor(fs.weapons));
  setVar('--frame-exhibition', getColor(fs.exhibition));
  setVar('--frame-bio',        getColor(fs.bio));
  setVar('--frame-contact',    getColor(fs.contact));

  // Weapons grid size
  if (fs.weapons && fs.weapons.frameSize) {
    const grid = document.querySelector('.weapons-grid');
    if (grid) grid.classList.add('wsize-' + fs.weapons.frameSize);
  }

  // Weapons text colors
  if (fs.weapons) {
    if (fs.weapons.nameColor) setVar('--weapon-name-color', fs.weapons.nameColor);
    else root.style.removeProperty('--weapon-name-color');
    if (fs.weapons.priceColor) setVar('--weapon-price-color', fs.weapons.priceColor);
    else root.style.removeProperty('--weapon-price-color');
  }

  // Exhibition subpage image size
  if (fs.exhibition && fs.exhibition.frameSize) {
    document.querySelectorAll('.subpage-images').forEach(g => {
      g.classList.add('spsize-' + fs.exhibition.frameSize);
    });
  }

  // Bio photo width
  if (fs.bio && fs.bio.photoWidth && fs.bio.photoWidth !== 'medium') {
    const layout = document.querySelector('.bio-layout');
    if (layout) layout.classList.add('bio-' + fs.bio.photoWidth);
  }

  // Contact image width
  if (fs.contact && fs.contact.imageWidth && fs.contact.imageWidth !== 'medium') {
    const layout = document.querySelector('.contact-layout');
    if (layout) layout.classList.add('contact-' + fs.contact.imageWidth);
  }
}

// ── Apply font settings ─────────────────────────
function applyFonts(site) {
  if (!site || !site.fonts) return;
  const headingMap = {
    'georgia':     { css: 'Georgia, serif',                 gf: null },
    'playfair':    { css: '"Playfair Display", serif',      gf: 'Playfair+Display:ital,wght@0,400;0,700;1,400' },
    'cormorant':   { css: '"Cormorant Garamond", serif',    gf: 'Cormorant+Garamond:ital,wght@0,300;0,400;1,300' },
    'garamond':    { css: '"EB Garamond", serif',           gf: 'EB+Garamond:ital,wght@0,400;1,400' },
    'lora':        { css: '"Lora", serif',                  gf: 'Lora:ital,wght@0,400;0,600;1,400' },
    'baskerville': { css: '"Libre Baskerville", serif',     gf: 'Libre+Baskerville:ital,wght@0,400;0,700;1,400' }
  };
  const accentMap = {
    'courier-new':   { css: '"Courier New", monospace',    gf: null },
    'space-mono':    { css: '"Space Mono", monospace',     gf: 'Space+Mono:wght@400;700' },
    'ibm-plex-mono': { css: '"IBM Plex Mono", monospace',  gf: 'IBM+Plex+Mono:wght@400;500' },
    'courier-prime': { css: '"Courier Prime", monospace',  gf: 'Courier+Prime:ital,wght@0,400;1,400' }
  };
  const hFont = headingMap[site.fonts.heading] || headingMap['georgia'];
  const aFont = accentMap[site.fonts.accent]   || accentMap['courier-new'];

  // Inject Google Fonts if needed
  const families = [hFont.gf, aFont.gf].filter(Boolean);
  if (families.length > 0) {
    const href = 'https://fonts.googleapis.com/css2?family=' + families.join('&family=') + '&display=swap';
    let link = document.getElementById('gf-dynamic');
    if (link) { link.href = href; }
    else {
      link = document.createElement('link');
      link.id = 'gf-dynamic'; link.rel = 'stylesheet'; link.href = href;
      document.head.appendChild(link);
    }
  }
  document.documentElement.style.setProperty('--serif', hFont.css);
  document.documentElement.style.setProperty('--mono',  aFont.css);
}

// ── Apply scroll animations (call after DOM items rendered) ──
function applyAnimations(site) {
  if (!site) return;
  const anim = site.scrollAnim || 'none';
  if (anim === 'none') return;

  const speed   = site.animSpeed   || 'normal';
  const stagger = site.animStagger !== false;
  const classMap = {
    'fade-up':    'anim-fade-up',
    'fade-in':    'anim-fade-in',
    'zoom-in':    'anim-zoom-in',
    'slide-left': 'anim-slide-left',
    'slide-right':'anim-slide-right'
  };
  const animClass = classMap[anim] || 'anim-fade-up';

  const items = document.querySelectorAll('.gallery-item:not(.anim-ready)');
  items.forEach((el, i) => {
    el.classList.add('anim-ready', animClass, 'anim-speed-' + speed);
    if (stagger) el.style.transitionDelay = (i * 0.06) + 's';
  });

  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('anim-visible'); observer.unobserve(e.target); }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });

  document.querySelectorAll('.anim-ready:not(.anim-visible)').forEach(el => observer.observe(el));
}

// ── Init VHS effect (call after all rendering) ─
function initVHS() {
  if (window.VHSEffect && visualData) {
    const cfg = Object.assign({}, visualData);
    if (isLightTheme(siteData && siteData.site)) {
      cfg.vignetteOpacity = Math.min(Number(cfg.vignetteOpacity) || 0, 0.12);
      cfg.overlayOpacity = Math.min(Number(cfg.overlayOpacity) || 0, 0.08);
      cfg.grainOpacity = Math.min(Number(cfg.grainOpacity) || 0, 0.045);
      cfg.scanlinesOpacity = Math.min(Number(cfg.scanlinesOpacity) || 0, 0.06);
      cfg.artifactsOpacity = Math.min(Number(cfg.artifactsOpacity) || 0, 0.18);
      cfg.glowIntensity = Math.min(Number(cfg.glowIntensity) || 0, 0.7);
    }
    VHSEffect.init(cfg);
  }
}

// ── Header / Nav ───────────────────────────────
function renderHeader(activePage) {
  const nav = document.getElementById('main-nav');
  if (!nav || !siteData) return;
  // Allow CMS to override each nav label; fall back to defaults
  const nl = (siteData.site && siteData.site.navLabels) || {};
  const customPages = (siteData.customPages || []).map(p => ({
    id:   'custom-' + p.id,
    label: p.navLabel || p.title || p.id,
    href: 'custom-page.html?id=' + encodeURIComponent(p.id)
  }));
  const pages = [
    { id: 'cv',         label: nl.bio         || 'CV',          href: 'bio.html'        },
    { id: 'relic',      label: nl.relic       || nl.weapons || 'Relics', href: 'relic.html' },
    { id: 'exhibition', label: nl.exhibition  || 'Exhibition',  href: 'exhibition.html' },
    { id: 'play',       label: nl.play        || 'Play',        href: 'play.html'       },
    { id: 'shop',       label: nl.shop        || 'Shop',        href: 'shop.html'       },
    ...customPages
  ];
  nav.innerHTML = `
    <a class="nav-logo" href="index.html">${escapeHtml(siteData.site.title)}</a>
    <ul class="nav-links">
      ${pages.map(p =>
        `<li><a href="${escapeHtml(p.href)}" ${p.id === activePage ? 'class="active"' : ''}>${escapeHtml(p.label)}</a></li>`
      ).join('')}
    </ul>`;
}

// ── Lightbox ───────────────────────────────────
function initLightbox() {
  const lb   = document.getElementById('lightbox');
  if (!lb) return;

  document.getElementById('lb-close').onclick = () => lb.classList.remove('open');
  document.getElementById('lb-prev').onclick  = () => showLightbox(lightboxIndex - 1);
  document.getElementById('lb-next').onclick  = () => showLightbox(lightboxIndex + 1);

  lb.addEventListener('click', e => { if (e.target === lb) lb.classList.remove('open'); });

  document.addEventListener('keydown', e => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape')      lb.classList.remove('open');
    if (e.key === 'ArrowLeft')   showLightbox(lightboxIndex - 1);
    if (e.key === 'ArrowRight')  showLightbox(lightboxIndex + 1);
  });
}

function showLightbox(index) {
  const lb  = document.getElementById('lightbox');
  const img = document.getElementById('lb-img');
  const info= document.getElementById('lb-info');
  if (!lb || lightboxItems.length === 0) return;
  lightboxIndex = (index + lightboxItems.length) % lightboxItems.length;
  const item = lightboxItems[lightboxIndex];
  img.src = fixImg(item.image);
  info.textContent = [item.title, item.year, item.medium, item.dimensions]
    .filter(Boolean).join('  ·  ');
  lb.classList.add('open');
}

// ── Projects ───────────────────────────────────
function renderProjects() {
  const grid    = document.getElementById('projects-grid');
  const moreBtn = document.getElementById('btn-load-more');
  if (!grid || !siteData) return;

  const projects      = siteData.projects;
  const site          = siteData.site || {};
  const layout        = site.galleryLayout  || 'grid';
  const imageSize     = site.imageSize      || 'medium';
  const captionStyle  = site.captionStyle   || 'below';
  const imageAspect   = site.imageAspect    || '4/3';
  const galleryGap    = site.galleryGap     || 'normal';
  const hoverEffect   = site.hoverEffect    || 'scale';

  // e.g. "4/3" → "aspect-4-3", "auto" → "aspect-auto"
  const aspectClass = 'aspect-' + imageAspect.replace('/', '-');

  grid.className = [
    'gallery-grid',
    'layout-' + layout,
    'size-'  + imageSize,
    'caption-' + captionStyle,
    aspectClass,
    'gap-'   + galleryGap,
    'hover-' + hoverEffect
  ].join(' ');

  lightboxItems = projects.map(p => ({
    image: fixImg(p.image), title: p.title, year: p.year,
    medium: p.medium, dimensions: p.dimensions
  }));

  if (layout === 'slideshow') {
    if (moreBtn) moreBtn.style.display = 'none';
    renderSlideshow(projects, grid);
    return;
  }

  let shown = Math.min(INITIAL_SHOW, projects.length);

  function renderItems(count) {
    grid.innerHTML = '';
    projects.slice(0, count).forEach((p, i) => {
      const el = document.createElement('div');
      el.className = 'gallery-item';
      el.innerHTML = `
        <img src="${fixImg(p.image)}" alt="${p.title || 'Work ' + p.id}" loading="lazy">
        <div class="gallery-caption">
          <h3>${p.title || ''}</h3>
          <p>${[p.year, p.medium].filter(Boolean).join('  ·  ')}</p>
        </div>`;
      // Auto aspect: detect landscape/portrait on load
      if (imageAspect === 'auto') {
        const img = el.querySelector('img');
        if (img) {
          img.addEventListener('load', function() {
            if (this.naturalHeight > this.naturalWidth) {
              el.classList.add('portrait');
            }
          });
          // handle cached images
          if (img.complete && img.naturalHeight > 0) {
            if (img.naturalHeight > img.naturalWidth) {
              el.classList.add('portrait');
            }
          }
        }
      }
      el.onclick = () => showLightbox(i);
      grid.appendChild(el);
    });
    applyAnimations(site);
    if (moreBtn) {
      moreBtn.style.display = count >= projects.length ? 'none' : 'inline-block';
    }
  }

  renderItems(shown);
  if (moreBtn) {
    moreBtn.addEventListener('click', () => {
      shown = projects.length;
      renderItems(shown);
    });
  }
}

// ── Slideshow ──────────────────────────────────
function renderSlideshow(projects, container) {
  let current = 0;

  function update() {
    const p = projects[current];
    container.innerHTML = `
      <div class="slideshow-wrap">
        <div class="slideshow-slide" onclick="showLightbox(${current})">
          <img src="${fixImg(p.image)}" alt="${p.title || ''}" loading="lazy">
          <div class="slideshow-caption">
            <h3>${p.title || ''}</h3>
            <p>${[p.year, p.medium].filter(Boolean).join('  ·  ')}</p>
            <span class="slideshow-counter">${current + 1} / ${projects.length}</span>
          </div>
        </div>
        <div class="slideshow-controls">
          <button class="ss-btn" id="ss-prev">&#8249;</button>
          <div class="ss-dots">
            ${projects.map((_, i) =>
              `<button class="ss-dot${i === current ? ' active' : ''}" data-i="${i}"></button>`
            ).join('')}
          </div>
          <button class="ss-btn" id="ss-next">&#8250;</button>
        </div>
      </div>`;

    container.querySelector('#ss-prev').onclick = e => {
      e.stopPropagation(); current = (current - 1 + projects.length) % projects.length; update();
    };
    container.querySelector('#ss-next').onclick = e => {
      e.stopPropagation(); current = (current + 1) % projects.length; update();
    };
    container.querySelectorAll('.ss-dot').forEach(btn => {
      btn.onclick = e => { e.stopPropagation(); current = +btn.dataset.i; update(); };
    });
  }

  update();

  document.addEventListener('keydown', e => {
    const lb = document.getElementById('lightbox');
    if (lb && lb.classList.contains('open')) return;
    if (e.key === 'ArrowLeft')  { current = (current - 1 + projects.length) % projects.length; update(); }
    if (e.key === 'ArrowRight') { current = (current + 1) % projects.length; update(); }
  });
}

// ── Exhibition ─────────────────────────────────
// ── Media helpers ───────────────────────────────

// Extract all image/video sources from all subpages of an exhibition
function collectExhibitionMedia(exh) {
  const items = [];
  if (exh.image) items.push({ src: exh.image, caption: '', video: exh.video || '' });
  (exh.subpages || []).forEach(sp => {
    (sp.images || []).forEach(img => items.push(img));
  });
  return items;
}

// Detect if a string is a video URL and return embed URL, else null
function videoEmbedUrl(url) {
  if (!url) return null;
  // YouTube
  let m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{8,11})/);
  if (m) return 'https://www.youtube.com/embed/' + m[1] + '?rel=0&modestbranding=1';
  // Vimeo
  m = url.match(/vimeo\.com\/(\d+)/);
  if (m) return 'https://player.vimeo.com/video/' + m[1] + '?title=0&byline=0';
  // Direct video file
  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url)) return url;
  return null;
}

// Render a single media item: video iframe/player or <img>
function renderMediaItem(item, cls) {
  const embedUrl = videoEmbedUrl(item.video || '');
  const caption = escapeHtml(item.caption || '');
  const className = escapeHtml(cls || 'media-item');
  if (embedUrl) {
    // Direct video file
    if (/\.(mp4|webm|ogg|mov)/i.test(embedUrl)) {
      return `<div class="${className} media-video">
        <video src="${escapeHtml(fixImg(embedUrl))}" autoplay loop muted playsinline controls preload="metadata"></video>
        ${caption ? `<figcaption>${caption}</figcaption>` : ''}
      </div>`;
    }
    return `<div class="${className} media-video">
      <iframe src="${escapeHtml(embedUrl)}" frameborder="0" allowfullscreen allow="autoplay; encrypted-media" loading="lazy"></iframe>
      ${caption ? `<figcaption>${caption}</figcaption>` : ''}
    </div>`;
  }
  return `<figure class="${className}">
    <img src="${escapeHtml(fixImg(item.src || ''))}" alt="${caption}" loading="lazy">
    ${caption ? `<figcaption>${caption}</figcaption>` : ''}
  </figure>`;
}

// Build and mount a slideshow into `container` from `slides` array [{src,video,caption}]
// Returns cleanup function.
function mountSlideshow(container, slides, height) {
  if (!slides.length) return () => {};
  container.classList.add('ex-slideshow');
  container.style.height = height || '480px';

  let cur = 0;
  let timer = null;

  const track = document.createElement('div');
  track.className = 'ex-slideshow-track';
  slides.forEach((sl, i) => {
    const slide = document.createElement('div');
    slide.className = 'ex-slide' + (i === 0 ? ' active' : '');
    const embedUrl = videoEmbedUrl(sl.video || '');
    if (embedUrl && !/\.(mp4|webm|ogg|mov)/i.test(embedUrl)) {
      slide.innerHTML = `<iframe src="${embedUrl}" frameborder="0" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
    } else if (embedUrl) {
      slide.innerHTML = `<video src="${embedUrl}" autoplay loop muted playsinline controls preload="metadata"></video>`;
    } else if (sl.src) {
      slide.innerHTML = `<img src="${fixImg(sl.src)}" alt="${sl.caption || ''}" loading="lazy">`;
    }
    track.appendChild(slide);
  });
  container.appendChild(track);

  // Prev / Next arrows
  const prev = document.createElement('button');
  prev.className = 'ex-slide-btn ex-slide-prev';
  prev.innerHTML = '&#8249;';
  const next = document.createElement('button');
  next.className = 'ex-slide-btn ex-slide-next';
  next.innerHTML = '&#8250;';
  container.appendChild(prev);
  container.appendChild(next);

  // Dots
  const dots = document.createElement('div');
  dots.className = 'ex-slide-dots';
  slides.forEach((_, i) => {
    const d = document.createElement('button');
    d.className = 'ex-slide-dot' + (i === 0 ? ' active' : '');
    d.addEventListener('click', () => goTo(i));
    dots.appendChild(d);
  });
  container.appendChild(dots);

  // Caption strip
  const cap = document.createElement('div');
  cap.className = 'ex-slide-caption';
  container.appendChild(cap);

  function goTo(n) {
    track.children[cur].classList.remove('active');
    dots.children[cur].classList.remove('active');
    cur = (n + slides.length) % slides.length;
    track.children[cur].classList.add('active');
    dots.children[cur].classList.add('active');
    cap.textContent = slides[cur].caption || '';
    resetTimer();
  }

  function resetTimer() {
    clearInterval(timer);
    if (slides.length > 1) timer = setInterval(() => goTo(cur + 1), 5000);
  }

  prev.addEventListener('click', () => goTo(cur - 1));
  next.addEventListener('click', () => goTo(cur + 1));
  container.addEventListener('mouseenter', () => clearInterval(timer));
  container.addEventListener('mouseleave', resetTimer);

  cap.textContent = slides[0].caption || '';
  resetTimer();
  return () => clearInterval(timer);
}

// ── Exhibition List ──────────────────────────────
function renderExhibition() {
  const list = document.getElementById('exhibition-list');
  if (!list || !siteData) return;
  siteData.exhibition.forEach((e, idx) => {
    const hasSubpages = e.subpages && e.subpages.length > 0;
    const detailUrl   = 'exhibition-detail.html?id=' + encodeURIComponent(e.id);
    const allMedia    = collectExhibitionMedia(e);

    const section = document.createElement('section');
    section.className = 'exh-section';

    // Title + meta + description
    let html = `<h3 class="exh-title">${e.title || ''}</h3>`;
    html += `<p class="exh-meta">${[e.year, e.venue, e.location].filter(Boolean).join('  ·  ')}</p>`;
    if (e.description) html += `<div class="exh-desc"><p>${e.description}</p></div>`;

    // Image gallery (all images from cover + subpages)
    const images = allMedia.filter(m => m.src && !m.video);
    if (images.length) {
      html += '<div class="exh-gallery">';
      images.forEach(m => {
        html += `<img src="${fixImg(m.src)}" alt="${m.caption || ''}" loading="lazy">`;
      });
      html += '</div>';
    }

    // Videos
    const videos = allMedia.filter(m => m.video);
    videos.forEach(m => {
      const embedUrl = videoEmbedUrl(m.video);
      if (embedUrl) {
        html += '<div class="exh-video">';
        if (/\.(mp4|webm|ogg|mov)/i.test(embedUrl)) {
          html += `<video src="${embedUrl}" autoplay loop muted playsinline controls preload="metadata"></video>`;
        } else {
          html += `<iframe src="${embedUrl}" frameborder="0" allowfullscreen allow="autoplay; encrypted-media" loading="lazy"></iframe>`;
        }
        html += '</div>';
      }
    });

    // "More" link
    if (hasSubpages) {
      html += `<div class="exh-links"><a href="${detailUrl}">More →</a></div>`;
    }

    section.innerHTML = html;
    list.appendChild(section);

    // Divider between sections
    if (idx < siteData.exhibition.length - 1) {
      const hr = document.createElement('hr');
      hr.className = 'exh-divider';
      list.appendChild(hr);
    }
  });
}

// ── Exhibition Detail ───────────────────────────
function renderExhibitionDetail() {
  const wrap = document.getElementById('exhibition-detail-wrap');
  if (!wrap || !siteData) return;

  const params = new URLSearchParams(window.location.search);
  const id     = Number(params.get('id'));
  const exh    = (siteData.exhibition || []).find(e => e.id === id);

  if (!exh) {
    wrap.innerHTML = '<p class="detail-error">Exhibition not found.</p>';
    return;
  }

  const subpages = exh.subpages || [];

  // ── Header section ──
  let html = `<h3 class="exh-title">${exh.title || ''}</h3>`;
  html += `<p class="exh-meta">${[exh.year, exh.venue, exh.location].filter(Boolean).join('  ·  ')}</p>`;
  if (exh.description) html += `<div class="exh-desc"><p>${exh.description}</p></div>`;

  // Cover image
  if (exh.image) {
    html += `<div class="exh-gallery"><img src="${fixImg(exh.image)}" alt="${exh.title || ''}" loading="lazy"></div>`;
  }

  wrap.innerHTML = html;

  // ── Sub-pages as sequential sections ──
  subpages.forEach((sp, i) => {
    if (i > 0 || exh.image) {
      const hr = document.createElement('hr');
      hr.className = 'exh-divider';
      wrap.appendChild(hr);
    }

    const section = document.createElement('section');
    section.className = 'exh-section';

    let shtml = '';
    if (sp.title) shtml += `<h4 class="exh-subtitle">${sp.title}</h4>`;

    const bodyHtml = markdownToHtml(sp.body || '');
    if (bodyHtml) shtml += `<div class="exh-desc">${bodyHtml}</div>`;

    const imgs = (sp.images || []).filter(m => m.src && !m.video);
    if (imgs.length) {
      shtml += '<div class="exh-gallery">';
      imgs.forEach(m => {
        shtml += `<img src="${fixImg(m.src)}" alt="${m.caption || ''}" loading="lazy">`;
      });
      shtml += '</div>';
    }

    const videos = (sp.images || []).filter(m => m.video);
    videos.forEach(m => {
      const embedUrl = videoEmbedUrl(m.video);
      if (embedUrl) {
        shtml += '<div class="exh-video">';
        if (/\.(mp4|webm|ogg|mov)/i.test(embedUrl)) {
          shtml += `<video src="${embedUrl}" autoplay loop muted playsinline controls preload="metadata"></video>`;
        } else {
          shtml += `<iframe src="${embedUrl}" frameborder="0" allowfullscreen allow="autoplay; encrypted-media" loading="lazy"></iframe>`;
        }
        shtml += '</div>';
      }
    });

    section.innerHTML = shtml;
    wrap.appendChild(section);
  });
}

// ── Shop ───────────────────────────────────────
function normalizeShopDetailImages(product) {
  const details = Array.isArray(product && product.detailImages) ? product.detailImages : [];
  return details
    .map(item => {
      if (typeof item === 'string') return { src: item, caption: '' };
      return {
        src: item && (item.src || item.image || item.url || ''),
        caption: item && (item.caption || item.title || '')
      };
    })
    .filter(item => item.src)
    .slice(0, 3);
}

function getShopGalleryItems(product) {
  const gallery = [];
  if (product && product.image) {
    gallery.push({
      src: product.image,
      caption: product.title || product.mediaAlt || ''
    });
  }
  normalizeShopDetailImages(product).forEach(item => {
    gallery.push({
      src: item.src,
      caption: item.caption || (product && product.title) || ''
    });
  });
  return gallery;
}

function getShopSubscription(shop) {
  const fallback = {
    enabled: true,
    name: 'Artistletter（實體手寫信訂閱）',
    image: '',
    imageAlt: 'Artistletter 訂閱示意圖',
    imageSize: 'contain',
    imageHeight: '260px',
    imagePosition: 'center center',
    price: '每月新台幣三百元',
    description: '訂閱後，我每個月會寄出一封實體手寫信。信件內容包含約一百字的短文或短詩，與您分享我的想說的一些話、創作筆記、閱讀心得，以及一個小插畫。',
    buttonLabel: '訂閱',
    disabledMessage: '系統建置中，暫停訂閱',
    cancelNotice: '隨時可取消訂閱'
  };
  const sub = Object.assign({}, fallback, (shop && shop.subscription) || {});
  if (sub.enabled === false || sub.enabled === 'false') return null;
  return sub;
}

function normalizeSubscriptionImageSize(value) {
  const normalized = String(value || 'contain').trim().toLowerCase();
  if (normalized === 'cover' || normalized === 'auto') return normalized;
  return 'contain';
}

function normalizeSubscriptionImageHeight(value) {
  const raw = String(value || '260px').trim();
  if (/^\d+(\.\d+)?(px|rem|em|vh|vw|%)$/.test(raw)) return raw;
  if (/^\d+(\.\d+)?$/.test(raw)) return `${raw}px`;
  return '260px';
}

function normalizeSubscriptionImageWidth(value) {
  const raw = String(value || '100%').trim();
  if (!raw) return '100%';
  if (raw === 'auto' || raw === 'fit-content' || raw === 'max-content' || raw === 'min-content') return raw;
  if (/^\d+(\.\d+)?(px|rem|em|vh|vw|%)$/.test(raw)) return raw;
  if (/^\d+(\.\d+)?$/.test(raw)) return `${raw}px`;
  return raw;
}

function normalizeShopMediaWidth(value, fallback) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (raw === 'auto' || raw === 'fit-content' || raw === 'max-content' || raw === 'min-content') return raw;
  if (/^\d+(\.\d+)?(px|rem|em|vh|vw|%)$/.test(raw)) return raw;
  if (/^\d+(\.\d+)?$/.test(raw)) return `${raw}px`;
  return fallback;
}

function normalizeShopMediaHeight(value, fallback) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (raw === 'auto') return raw;
  if (/^\d+(\.\d+)?(px|rem|em|vh|vw|%)$/.test(raw)) return raw;
  if (/^\d+(\.\d+)?$/.test(raw)) return `${raw}px`;
  return fallback;
}

function normalizeShopMediaFit(value, fallback) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'cover' || raw === 'contain' || raw === 'auto') return raw;
  return fallback;
}

function normalizeShopMediaPosition(value, fallback) {
  const raw = String(value || '').trim();
  return raw || fallback;
}

function normalizeShopLink(value) {
  const raw = String(value || '').trim();
  return raw || '';
}

function normalizeSubscriptionImagePosition(value) {
  const normalized = String(value || 'center center').trim().toLowerCase();
  if (normalized === 'center top' || normalized === 'top') return 'center top';
  if (normalized === 'center bottom' || normalized === 'bottom') return 'center bottom';
  return 'center center';
}

function normalizeSubscriptionCssValue(value, fallback) {
  const raw = String(value || '').trim();
  return raw || fallback;
}

function buildStyleString(styleMap) {
  return Object.keys(styleMap)
    .filter(key => styleMap[key] !== undefined && styleMap[key] !== null && styleMap[key] !== '')
    .map(key => `${key}: ${styleMap[key]}`)
    .join('; ');
}

function getSubscriptionTheme(subscription) {
  const sub = subscription || {};
  return {
    panelBackground: normalizeSubscriptionCssValue(
      sub.panelBackground,
      'linear-gradient(135deg, rgba(206,255,42,0.14), transparent 36%), linear-gradient(225deg, rgba(255,62,219,0.12), transparent 44%), rgba(0,0,0,0.84)'
    ),
    panelBorderColor: normalizeSubscriptionCssValue(sub.panelBorderColor, 'rgba(206,255,42,0.72)'),
    panelGlowColor: normalizeSubscriptionCssValue(sub.panelGlowColor, 'rgba(206,255,42,0.12)'),
    asciiColor: normalizeSubscriptionCssValue(sub.asciiColor, 'rgba(206,255,42,0.66)'),
    asciiFontFamily: normalizeSubscriptionCssValue(sub.asciiFontFamily, '"Courier New", monospace'),
    kickerColor: normalizeSubscriptionCssValue(sub.kickerColor, '#58f4ff'),
    kickerSize: normalizeSubscriptionCssValue(sub.kickerSize, '0.72rem'),
    kickerFontFamily: normalizeSubscriptionCssValue(sub.kickerFontFamily, '"Courier New", monospace'),
    titleColor: normalizeSubscriptionCssValue(sub.titleColor, '#d6def0'),
    titleSize: normalizeSubscriptionCssValue(sub.titleSize, '2.8rem'),
    titleFontFamily: normalizeSubscriptionCssValue(sub.titleFontFamily, 'var(--shop-saint)'),
    copyColor: normalizeSubscriptionCssValue(sub.copyColor, 'rgba(214,222,240,0.86)'),
    copySize: normalizeSubscriptionCssValue(sub.copySize, '0.9rem'),
    copyFontFamily: normalizeSubscriptionCssValue(sub.copyFontFamily, '"Courier New", monospace'),
    priceColor: normalizeSubscriptionCssValue(sub.priceColor, '#ceff2a'),
    priceSize: normalizeSubscriptionCssValue(sub.priceSize, '1.08rem'),
    priceFontFamily: normalizeSubscriptionCssValue(sub.priceFontFamily, '"Courier New", monospace'),
    buttonTextColor: normalizeSubscriptionCssValue(sub.buttonTextColor, '#000000'),
    buttonTextSize: normalizeSubscriptionCssValue(sub.buttonTextSize, '0.72rem'),
    buttonFontFamily: normalizeSubscriptionCssValue(sub.buttonFontFamily, '"Courier New", monospace'),
    buttonBgColor: normalizeSubscriptionCssValue(sub.buttonBgColor, '#ceff2a'),
    buttonBorderColor: normalizeSubscriptionCssValue(sub.buttonBorderColor, 'rgba(206,255,42,0.72)'),
    noteColor: normalizeSubscriptionCssValue(sub.noteColor, 'rgba(214,222,240,0.68)'),
    noteSize: normalizeSubscriptionCssValue(sub.noteSize, '0.7rem'),
    noteFontFamily: normalizeSubscriptionCssValue(sub.noteFontFamily, '"Courier New", monospace')
  };
}

function renderShopSubscription(subscription) {
  if (!subscription) return '';
  const message = subscription.disabledMessage || '系統建置中，暫停訂閱';
  const url = normalizeShopLink(subscription.subscriptionUrl || subscription.url);
  const theme = getSubscriptionTheme(subscription);
  const imageSize = normalizeSubscriptionImageSize(subscription.imageSize);
  const imageHeight = normalizeSubscriptionImageHeight(subscription.imageHeight);
  const imageWidth = normalizeSubscriptionImageWidth(subscription.imageWidth);
  const imagePosition = normalizeSubscriptionImagePosition(subscription.imagePosition);
  const imageStyle = [
    `--subscription-image-width:${imageWidth}`,
    `--subscription-image-height:${imageHeight}`,
    `--subscription-image-fit:${imageSize === 'auto' ? 'contain' : imageSize}`,
    `--subscription-image-position:${imagePosition}`
  ].join(';');
  const image = subscription.image ? `<div class="subscription-media subscription-media--${imageSize}" style="${imageStyle}"><img src="${escapeHtml(fixImg(subscription.image))}" alt="${escapeHtml(subscription.imageAlt || subscription.name || '')}" loading="lazy"></div>` : '';
  const panelStyle = buildStyleString({
    'background': theme.panelBackground,
    'border-color': theme.panelBorderColor,
    'box-shadow': `0 0 34px ${theme.panelGlowColor}, inset 0 0 0 1px rgba(88,244,255,0.16)`
  });
  const asciiStyle = buildStyleString({
    color: theme.asciiColor,
    'font-family': theme.asciiFontFamily,
    'font-size': '0.62rem',
    'white-space': 'nowrap',
    overflow: 'hidden'
  });
  const kickerStyle = buildStyleString({
    color: theme.kickerColor,
    'font-family': theme.kickerFontFamily,
    'font-size': theme.kickerSize,
    'line-height': 1.5,
    'text-transform': 'uppercase'
  });
  const titleStyle = buildStyleString({
    color: theme.titleColor,
    'font-family': theme.titleFontFamily,
    'font-size': theme.titleSize,
    'line-height': 1.06,
    'white-space': 'pre-wrap',
    'overflow-wrap': 'anywhere'
  });
  const copyStyle = buildStyleString({
    color: theme.copyColor,
    'font-family': theme.copyFontFamily,
    'font-size': theme.copySize,
    'line-height': 1.9,
    'white-space': 'pre-wrap',
    'overflow-wrap': 'anywhere'
  });
  const priceStyle = buildStyleString({
    color: theme.priceColor,
    'font-family': theme.priceFontFamily,
    'font-size': theme.priceSize,
    'line-height': 1.4,
    'text-shadow': '0 0 18px rgba(206,255,42,0.42)',
    'white-space': 'pre-wrap',
    'overflow-wrap': 'anywhere'
  });
  const buttonStyle = buildStyleString({
    color: theme.buttonTextColor,
    background: theme.buttonBgColor,
    border: `1px solid ${theme.buttonBorderColor}`,
    'font-family': theme.buttonFontFamily,
    'font-size': theme.buttonTextSize,
    'text-transform': 'uppercase'
  });
  const buttonLabel = subscription.buttonLabel || '訂閱';
  const buttonHtml = url
    ? `<a class="subscription-button" href="${escapeHtml(url)}" style="${escapeHtml(buttonStyle)}">${escapeHtml(buttonLabel)}</a>`
    : `<a class="subscription-button" href="#" style="${escapeHtml(buttonStyle)}" onclick="alert('${escapeJsSingle(message)}'); return false;">${escapeHtml(buttonLabel)}</a>`;
  const noteStyle = buildStyleString({
    color: theme.noteColor,
    'font-family': theme.noteFontFamily,
    'font-size': theme.noteSize,
    'white-space': 'pre-wrap',
    'overflow-wrap': 'anywhere'
  });
  return `
    <section class="subscription-panel" aria-labelledby="shop-subscription-title" style="${escapeHtml(panelStyle)}">
      <div class="subscription-ascii" aria-hidden="true" style="${escapeHtml(asciiStyle)}">+-------------------- MONTHLY SUPPORT CHANNEL --------------------+</div>
      <div class="subscription-grid">
        ${image}
        <div class="subscription-heading">
          <p class="subscription-kicker" style="${escapeHtml(kickerStyle)}">subscription / handwritten mail / artistletter</p>
          <h2 id="shop-subscription-title" class="subscription-title" style="${escapeHtml(titleStyle)}">${escapeHtml(subscription.name || '')}</h2>
        </div>
        <p class="subscription-copy" style="${escapeHtml(copyStyle)}">${escapeHtml(subscription.description || '')}</p>
        <div class="subscription-action">
          <div class="subscription-price" style="${escapeHtml(priceStyle)}">${escapeHtml(subscription.price || '每月新台幣三百元')}</div>
          ${buttonHtml}
          <p class="subscription-note" style="${escapeHtml(noteStyle)}">${escapeHtml(subscription.cancelNotice || '隨時可取消訂閱')}</p>
        </div>
      </div>
      <div class="subscription-ascii bottom" aria-hidden="true" style="${escapeHtml(asciiStyle)}">+-----------------------------------------------------------------+</div>
    </section>`;
}

function renderShop() {
  const sectionsWrap = document.getElementById('shop-sections');
  if (!sectionsWrap || !siteData) return;

  const shop = siteData.shop || {};
  const hero = shop.hero || {};
  const purchase = shop.purchase || {};
  const contact = shop.contactInfo || {};
  const subscription = getShopSubscription(shop);

  const kickerEl = document.getElementById('shop-kicker');
  const titleEl = document.getElementById('shop-title');
  const terminalEl = document.getElementById('shop-terminal');
  const contactHeadingEl = document.getElementById('shop-contact-heading');
  const contactEmailEl = document.getElementById('shop-contact-email');
  const contactPhoneEl = document.getElementById('shop-contact-phone');

  if (kickerEl) kickerEl.textContent = hero.kicker || '/relic_market :: static_archive :: no_api';
  if (titleEl) titleEl.textContent = hero.title || 'Shop';
  if (terminalEl) {
    const lines = hero.terminalLines && hero.terminalLines.length
      ? hero.terminalLines
      : ['catalog mounted: /SHOP', 'payment state: pending review', 'purchase buttons: frontend alert only'];
    terminalEl.innerHTML = lines.map(line =>
      `<p><span>&gt;</span> ${escapeHtml(line)}</p>`
    ).join('');
  }
  if (contactHeadingEl) contactHeadingEl.textContent = contact.heading || 'Contact Info';
  if (contactEmailEl) contactEmailEl.innerHTML = `<span>Email</span>${escapeHtml(contact.emailLabel || '聯絡信箱')}：${escapeHtml(contact.email || '')}`;
  if (contactPhoneEl) contactPhoneEl.innerHTML = `<span>Phone</span>${escapeHtml(contact.phoneLabel || '聯絡電話')}：${escapeHtml(contact.phone || '')}`;

  const sections = shop.sections || [];
  shopGallerySets = [];
  let priorityMediaAssigned = false;
  sectionsWrap.innerHTML = renderShopSubscription(subscription) + sections.map((section, sectionIndex) => {
    const layout = section.layout || 'archive';
    const products = section.products || [];
    const listClass = layout === 'archive'
      ? 'archive-list'
      : layout === 'feature-video'
        ? 'feature-video-list'
        : 'stamp-grid';
    return `
      <section class="shop-section" aria-labelledby="shop-section-${sectionIndex}">
        <div class="section-heading">
          <h2 id="shop-section-${sectionIndex}" class="section-label">${escapeHtml(section.label || '')}</h2>
          <div class="section-rule"></div>
        </div>
        <div class="${listClass}">
          ${products.map(product => {
            const productIndex = shopGallerySets.length;
            const prioritizeMedia = !priorityMediaAssigned;
            priorityMediaAssigned = true;
            shopGallerySets.push(getShopGalleryItems(product));
            return renderShopProduct(product, layout, purchase, productIndex, prioritizeMedia);
          }).join('')}
        </div>
      </section>`;
  }).join('');

  const refund = purchase.refundNotice || '實體藝術品與數位商品售出後恕不退款';
  if (refund) {
    sectionsWrap.insertAdjacentHTML('beforeend', `<div class="purchase-note">${escapeHtml(refund)}</div>`);
  }
  initShopGalleryEvents();
  initShopLazyMedia();
}

function renderShopProduct(product, layout, purchase, productIndex, prioritizeMedia) {
  product = product || {};
  purchase = purchase || {};
  const isArchive = layout === 'archive';
  const isFeatureVideo = layout === 'feature-video';
  const mediaWidth = normalizeShopMediaWidth(product.mediaWidth, '100%');
  const mediaHeight = normalizeShopMediaHeight(product.mediaHeight, isFeatureVideo ? '520px' : '100%');
  const mediaFit = normalizeShopMediaFit(product.mediaFit, 'contain');
  const mediaPosition = normalizeShopMediaPosition(product.mediaPosition, 'center center');
  const mediaWrapStyle = `--shop-media-width:${mediaWidth};--shop-media-height:${mediaHeight};--shop-media-fit:${mediaFit};--shop-media-position:${mediaPosition};`;
  const cardClass = isArchive ? 'archive-card' : isFeatureVideo ? 'feature-video-card' : 'stamp-card';
  const mediaClass = isArchive ? 'archive-media' : isFeatureVideo ? 'feature-video-media' : 'stamp-media';
  const bodyClass = isArchive ? 'archive-body' : isFeatureVideo ? 'feature-video-body' : 'stamp-body';
  const buttonLabel = purchase.buttonLabel || 'Purchase';
  const message = purchase.disabledMessage || '系統建置中，暫停購買';
  const purchaseUrl = normalizeShopLink(product.purchaseUrl);
  const meta = [
    product.year ? ['年份', product.year] : null,
    product.medium ? ['媒材', product.medium] : null,
    product.dimensions ? ['尺寸', product.dimensions] : null,
    product.price ? ['價格', product.price] : null
  ].filter(Boolean);
  const statement = product.statement ? markdownToHtml(product.statement) : '';

  return `
    <article class="${cardClass}" data-code="${escapeHtml(product.code || '')}">
      <div class="${mediaClass}"${mediaWrapStyle ? ` style="${escapeHtml(mediaWrapStyle)}"` : ''}>
        ${renderShopMedia(product, productIndex, layout, prioritizeMedia)}
      </div>
      <div class="${bodyClass}">
        <div class="item-kicker">${escapeHtml(product.categoryLabel || '')}</div>
        <h3 class="item-title">${escapeHtml(product.title || '')}</h3>
        <div class="shop-meta">
          ${meta.map(([label, value]) => `<div><span>${label}：</span>${escapeHtml(value)}</div>`).join('')}
        </div>
        ${statement ? `<div class="archive-statement">${statement}</div>` : ''}
        <div class="purchase-row">
          <div class="price-tag">${escapeHtml(product.price || '')}</div>
          ${purchaseUrl
            ? `<a class="purchase-button" href="${escapeHtml(purchaseUrl)}">${escapeHtml(buttonLabel)}</a>`
            : `<a class="purchase-button" href="#" onclick="alert('${escapeJsSingle(message)}'); return false;">${escapeHtml(buttonLabel)}</a>`}
        </div>
      </div>
    </article>`;
}

function shopImageAttrs(prioritizeMedia) {
  return prioritizeMedia
    ? 'loading="eager" decoding="async" fetchpriority="high"'
    : 'loading="lazy" decoding="async" fetchpriority="low"';
}

function renderShopMedia(product, productIndex, layout, prioritizeMedia) {
  product = product || {};
  const alt = escapeHtml(product.mediaAlt || product.title || '');
  const mediaVideo = product.video || product.videoUrl || '';
  const embedUrl = videoEmbedUrl(mediaVideo);
  const gallery = shopGallerySets[productIndex] || getShopGalleryItems(product);
  const isFeatureVideo = layout === 'feature-video';
  const mediaWidth = normalizeShopMediaWidth(product.mediaWidth, '100%');
  const mediaHeight = normalizeShopMediaHeight(product.mediaHeight, isFeatureVideo ? '520px' : '100%');
  const mediaFit = normalizeShopMediaFit(product.mediaFit, 'contain');
  const mediaPosition = normalizeShopMediaPosition(product.mediaPosition, 'center center');
  const mediaStyle = [
    `--shop-media-width:${mediaWidth}`,
    `--shop-media-height:${mediaHeight}`,
    `--shop-media-fit:${mediaFit}`,
    `--shop-media-position:${mediaPosition}`
  ].join(';');
  if (embedUrl) {
    if (/\.(mp4|webm|ogg|mov)/i.test(embedUrl)) {
      return `<video class="${isFeatureVideo ? 'feature-video-player' : ''}" style="${escapeHtml(mediaStyle)}" data-shop-src="${escapeHtml(fixImg(embedUrl))}" autoplay loop muted playsinline webkit-playsinline="webkit-playsinline" preload="none"></video>`;
    }
    return `<iframe src="${escapeHtml(embedUrl)}" title="${alt}" frameborder="0" allowfullscreen allow="autoplay; encrypted-media" loading="lazy"></iframe>`;
  }
  if (product.image) {
    const img = `<img src="${escapeHtml(fixImg(product.image))}" alt="${alt}" ${shopImageAttrs(prioritizeMedia)}>`;
    if (gallery.length) {
      return `<button class="shop-media-button" type="button" onclick="openShopGallery(${Number(productIndex) || 0}, 0)" aria-label="View detail images for ${alt}">
        ${img}
        <span class="shop-media-hint">VIEW DETAILS</span>
      </button>`;
    }
    return img;
  }
  if (gallery.length) {
    const first = gallery[0];
    const firstAlt = escapeHtml(first.caption || product.title || '');
    return `<button class="shop-media-button" type="button" onclick="openShopGallery(${Number(productIndex) || 0}, 0)" aria-label="View detail images for ${firstAlt}">
      <img src="${escapeHtml(fixImg(first.src))}" alt="${firstAlt}" ${shopImageAttrs(prioritizeMedia)}>
      <span class="shop-media-hint">VIEW DETAILS</span>
    </button>`;
  }
  return `<pre class="archive-placeholder" aria-hidden="true">${escapeHtml(product.placeholder || 'FILE WITHOUT IMAGE')}</pre>`;
}

function initShopLazyMedia() {
  const videos = Array.from(document.querySelectorAll('video[data-shop-src]'));
  if (!videos.length) return;

  const loadVideo = video => {
    if (!video || video.dataset.loaded === 'true') return;
    const src = video.dataset.shopSrc;
    if (!src) return;
    video.dataset.loaded = 'true';
    video.src = src;
    video.load();
    if (video.autoplay && typeof video.play === 'function') {
      const playback = video.play();
      if (playback && typeof playback.catch === 'function') playback.catch(() => {});
    }
  };

  if (!('IntersectionObserver' in window)) {
    videos.forEach(loadVideo);
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      loadVideo(entry.target);
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '600px 0px' });

  videos.forEach(video => observer.observe(video));
}

function initShopGalleryEvents() {
  const modal = document.getElementById('shop-gallery-modal');
  if (!modal || modal.dataset.bound === 'true') return;
  modal.dataset.bound = 'true';

  const closeBtn = document.getElementById('shop-gallery-close');
  const prevBtn = document.getElementById('shop-gallery-prev');
  const nextBtn = document.getElementById('shop-gallery-next');

  if (closeBtn) closeBtn.addEventListener('click', closeShopGallery);
  if (prevBtn) prevBtn.addEventListener('click', () => stepShopGallery(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => stepShopGallery(1));
  modal.addEventListener('click', event => {
    if (event.target === modal) closeShopGallery();
  });
  document.addEventListener('keydown', event => {
    if (modal.hidden) return;
    if (event.key === 'Escape') closeShopGallery();
    if (event.key === 'ArrowLeft') stepShopGallery(-1);
    if (event.key === 'ArrowRight') stepShopGallery(1);
  });
}

function openShopGallery(productIndex, imageIndex) {
  const gallery = shopGallerySets[Number(productIndex)] || [];
  if (!gallery.length) return;
  shopGalleryCurrentSet = gallery;
  shopGalleryCurrentIndex = Math.max(0, Math.min(Number(imageIndex) || 0, gallery.length - 1));
  const modal = document.getElementById('shop-gallery-modal');
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add('shop-gallery-open');
  updateShopGallery();
}

function closeShopGallery() {
  const modal = document.getElementById('shop-gallery-modal');
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove('shop-gallery-open');
}

function stepShopGallery(delta) {
  if (!shopGalleryCurrentSet.length) return;
  shopGalleryCurrentIndex = (shopGalleryCurrentIndex + delta + shopGalleryCurrentSet.length) % shopGalleryCurrentSet.length;
  updateShopGallery();
}

function updateShopGallery() {
  const item = shopGalleryCurrentSet[shopGalleryCurrentIndex];
  if (!item) return;
  const img = document.getElementById('shop-gallery-image');
  const caption = document.getElementById('shop-gallery-caption');
  const counter = document.getElementById('shop-gallery-counter');
  const prevBtn = document.getElementById('shop-gallery-prev');
  const nextBtn = document.getElementById('shop-gallery-next');
  if (img) {
    img.src = fixImg(item.src);
    img.alt = item.caption || '';
  }
  if (caption) caption.textContent = item.caption || '';
  if (counter) counter.textContent = `${shopGalleryCurrentIndex + 1} / ${shopGalleryCurrentSet.length}`;
  const multi = shopGalleryCurrentSet.length > 1;
  if (prevBtn) prevBtn.hidden = !multi;
  if (nextBtn) nextBtn.hidden = !multi;
}

// ── Custom Page ─────────────────────────────────
// Renders custom-page.html — reads ?id= from URL, shows title + body + images
function renderCustomPage() {
  const wrap = document.getElementById('custom-page-wrap');
  if (!wrap || !siteData) return;

  const params = new URLSearchParams(window.location.search);
  const id     = params.get('id');
  const page   = (siteData.customPages || []).find(p => p.id === id);

  if (!page) {
    wrap.innerHTML = '<p class="detail-error">Page not found.</p>';
    return;
  }

  const bodyHtml = markdownToHtml(page.body || '');
  const mediaItems = page.images || [];

  wrap.innerHTML = `
    <h1 class="page-title">${escapeHtml(page.title || page.navLabel || '')}</h1>
    <div class="custom-page-body">${bodyHtml}</div>
    ${mediaItems.length ? `<div class="custom-page-images">
      ${mediaItems.map(item => renderMediaItem(item, 'subpage-figure')).join('')}
    </div>` : ''}`;
}

// ── Markdown → HTML ─────────────────────────────
// Minimal renderer — supports headings, bold, italic, links, line breaks, paragraphs
function markdownToHtml(md) {
  if (!md) return '';
  let html = md
    // Escape raw HTML entities first
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold + italic combo
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // Links [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // HR
    .replace(/^---$/gm, '<hr>')
    // Line breaks within paragraphs (two spaces + newline)
    .replace(/  \n/g, '<br>');

  // Wrap consecutive non-heading/hr lines into <p> blocks
  const lines = html.split('\n');
  const out   = [];
  let buf     = [];

  function flushBuf() {
    if (buf.length) { out.push('<p>' + buf.join('<br>') + '</p>'); buf = []; }
  }

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushBuf();
    } else if (/^<(h[1-3]|hr|ul|ol|li|blockquote)/.test(trimmed)) {
      flushBuf();
      out.push(trimmed);
    } else {
      buf.push(trimmed);
    }
  });
  flushBuf();
  return out.join('\n');
}

// ── Bio ────────────────────────────────────────
function renderBio() {
  const wrap = document.getElementById('bio-wrap');
  if (!wrap || !siteData) return;
  const b = siteData.bio;
  const cvEntries = [
    { year: '2025', text: '\u201CStick and Ice Cream\u201D \u2013 Site-specific Intervention, Museum of Contemporary Art' },
    { year: '2024', text: 'Melbourne Apocalypse I \u2013 Open Studio, Pseudo Studio, Melbourne, Australia' },
    { year: '2024', text: 'PSEUDO New Media Art Residency, Melbourne, Australia' },
    { year: '2024', text: 'NEXS New Media Art Residency, Taipei, Taiwan' },
    { year: '2024', text: 'Taiwan New Vision Art Award, Taichung City Seaport Art Center, Taichung, Taiwan' },
    { year: '2023', text: '\u201CThe Love Ship with 999 Roses\u201D, Yongzhou Beach Art Museum, Keelung, Taiwan' },
    { year: '2023', text: 'OneOFFs Art Fair, W Hotel Taipei, Taipei, Taiwan' },
    { year: '2022', text: 'Formosa Art Fair, Eslite Hotel Taipei, Taipei, Taiwan' },
    { year: '2022', text: 'Whatz Art Fair, Sheraton Taipei Hotel, Taipei, Taiwan' },
    { year: '2021', text: 'Taoyuan Art Exhibition, Chiayi Culture Bureau Art Gallery, Taoyuan, Taiwan' },
    { year: '2021', text: 'Collective Exhibition \u201CLuminescent Jade\u201D, Chiang Kai-shek Memorial Hall, Taipei, Taiwan' },
    { year: '2017', text: 'Taoyuan International Illustration Exhibition, Zhongzheng Exhibition Hall, Taoyuan, Taiwan' },
    { year: '2017', text: 'Solo Exhibition \u201CMeat\u201D, Remember Me Cafe, Taipei, Taiwan' },
    { year: '2015', text: 'Photography Exhibition \u201CNew Images\u201D, Taipei, Taiwan' },
    { year: '2014', text: 'Solo Exhibition \u201CEmergency Entrance\u201D, Taipei, Taiwan' },
    { year: '2012', text: 'Life Exhibition on Pishan Wood Sculpture, Pishan, Taitung, Taiwan' }
  ];
  const cvHtml = cvEntries.map(e =>
    `<li><span class="cv-year">${e.year}</span> ${e.text}</li>`
  ).join('');
  wrap.innerHTML = `
    <div class="bio-left">
      <img class="bio-photo" src="${fixImg(b.photo)}" alt="${b.name}">
      <div class="bio-cv-list">
        <h3>Selected Exhibitions &amp; Residencies</h3>
        <ul>${cvHtml}</ul>
      </div>
    </div>
    <div class="bio-content">
      <h1>${b.name}</h1>
      <p class="bio-subtitle">${b.subtitle}</p>
      <p class="bio-text">${b.text}</p>
      ${b.cv_url ? `<a class="bio-cv-link" href="${b.cv_url}" target="_blank">Download CV \u2192</a>` : ''}
    </div>`;
}

// ── Contact ────────────────────────────────────
function renderContact() {
  const wrap = document.getElementById('contact-wrap');
  if (!wrap || !siteData) return;
  const c = siteData.contact;
  wrap.innerHTML = `
    <img class="contact-img" src="${fixImg(c.image)}" alt="Contact">
    <div class="contact-info">
      <h2>Get in Touch</h2>
      <div class="contact-item">
        <div class="contact-label">Email</div>
        <div class="contact-value"><a href="mailto:${c.email}">${c.email}</a></div>
      </div>
      ${c.instagram ? `
      <div class="contact-item">
        <div class="contact-label">Instagram</div>
        <div class="contact-value"><a href="${c.instagram_url}" target="_blank">${c.instagram}</a></div>
      </div>` : ''}
      ${c.location ? `
      <div class="contact-item">
        <div class="contact-label">Location</div>
        <div class="contact-value">${c.location}</div>
      </div>` : ''}
    </div>`;
}

// ── Weapons ────────────────────────────────────
function renderWeapons() {
  const grid = document.getElementById('weapons-grid');
  if (!grid || !siteData) return;
  const weapons = siteData.weapons;
  lightboxItems = weapons.map(w => ({ image: fixImg(w.image), title: w.name, year: '', medium: '', dimensions: w.price }));
  weapons.forEach((w, i) => {
    const el = document.createElement('div');
    el.className = 'weapon-card';
    el.innerHTML = `
      <img src="${fixImg(w.image)}" alt="${w.name}" loading="lazy">
      <div class="weapon-name">${w.name}</div>
      ${w.price ? `<div class="weapon-price">${w.price}</div>` : ''}`;
    el.onclick = () => showLightbox(i);
    grid.appendChild(el);
  });
}

// ── Relic (combined Works + Weapons) ────────────
function renderRelic() {
  // Merge weapons into projects array so they render in one unified gallery
  if (siteData && siteData.weapons) {
    const maxId = siteData.projects.reduce((m, p) => Math.max(m, p.id || 0), 0);
    siteData.weapons.forEach((w, i) => {
      siteData.projects.push({
        id: maxId + i + 1,
        image: w.image,
        title: w.name || '',
        year: '',
        medium: w.price || '',
        dimensions: ''
      });
    });
  }
  renderProjects();
}

// ── CV Contact Strip ────────────────────────────
function renderCVContact() {
  const wrap = document.getElementById('cv-contact');
  if (!wrap || !siteData) return;
  const c = siteData.contact;
  wrap.innerHTML = `
    <div class="cv-contact-inner">
      ${c.email ? `<div class="cv-contact-item">
        <span class="cv-contact-label">Email</span>
        <a href="mailto:${c.email}">${c.email}</a>
      </div>` : ''}
      ${c.instagram ? `<div class="cv-contact-item">
        <span class="cv-contact-label">Instagram</span>
        <a href="${c.instagram_url || '#'}" target="_blank">${c.instagram}</a>
      </div>` : ''}
    </div>`;
}
