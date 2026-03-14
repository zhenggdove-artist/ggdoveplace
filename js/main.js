/* =============================================
   GGDOVE PORTFOLIO — Main JS
   ============================================= */

const DATA_URL   = 'content/data.json';
const VISUAL_URL = 'content/visual.json';
let siteData   = null;
let visualData = null;
let lightboxItems = [];
let lightboxIndex = 0;
const INITIAL_SHOW = 9;

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
  // 延遲到所有 render 函式完成後（macrotask）才套用文字樣式與 Zalgo
  setTimeout(() => {
    applyTextStyles(siteData.site);
    applyZalgo(siteData.site);
  }, 0);
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

// ── 逐元素文字樣式套用 ─────────────────────────
// 從 site.textStyles 讀取每個元素的 fontSize / x / y / color 並套用
function applyTextStyles(site) {
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
  Object.entries(selectorMap).forEach(([key, sel]) => {
    const s = ts[key];
    if (!s) return;
    document.querySelectorAll(sel).forEach(el => {
      if (s.fontSize && s.fontSize.trim()) el.style.fontSize = s.fontSize.trim();
      if (s.color    && s.color.trim())    el.style.color    = s.color.trim();
      const x = (s.x || '0px').trim();
      const y = (s.y || '0px').trim();
      if (x !== '0px' || y !== '0px') {
        el.style.transform = `translate(${x}, ${y})`;
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
        // Georgia wrap — monospace/CJK 字型不支援組合符號，會渲染成方塊
        const span = document.createElement('span');
        span.style.fontFamily = 'Georgia, "Times New Roman", "Noto Serif", serif';
        span.textContent = generateZalgo(el.dataset.zalgoOrig, opts);
        el.innerHTML = '';
        el.appendChild(span);
      });
    }

    reZalgo();
    _zalgoTimers[key] = setInterval(reZalgo, interval);
  });
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
    VHSEffect.init(visualData);
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
    { id: 'projects',   label: nl.works      || 'Works',       href: 'index.html'      },
    { id: 'exhibition', label: nl.exhibition  || 'Exhibition',  href: 'exhibition.html' },
    { id: 'weapons',    label: nl.weapons     || 'Weapons',     href: 'weapons.html'    },
    { id: 'bio',        label: nl.bio         || 'Bio',         href: 'bio.html'        },
    { id: 'contact',    label: nl.contact     || 'Contact',     href: 'contact.html'    },
    ...customPages
  ];
  nav.innerHTML = `
    <a class="nav-logo" href="index.html">${siteData.site.title}</a>
    <ul class="nav-links">
      ${pages.map(p =>
        `<li><a href="${p.href}" ${p.id === activePage ? 'class="active"' : ''}>${p.label}</a></li>`
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
  img.src = item.image;
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

  // e.g. "4/3" → "aspect-4-3"
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
    image: p.image, title: p.title, year: p.year,
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
        <img src="${p.image}" alt="${p.title || 'Work ' + p.id}" loading="lazy">
        <div class="gallery-caption">
          <h3>${p.title || ''}</h3>
          <p>${[p.year, p.medium].filter(Boolean).join('  ·  ')}</p>
        </div>`;
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
          <img src="${p.image}" alt="${p.title || ''}" loading="lazy">
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
  let m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
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
  if (embedUrl) {
    // Direct video file
    if (/\.(mp4|webm|ogg|mov)/i.test(embedUrl)) {
      return `<div class="${cls || 'media-item'} media-video">
        <video src="${embedUrl}" controls preload="metadata" playsinline></video>
        ${item.caption ? `<figcaption>${item.caption}</figcaption>` : ''}
      </div>`;
    }
    return `<div class="${cls || 'media-item'} media-video">
      <iframe src="${embedUrl}" frameborder="0" allowfullscreen allow="autoplay; encrypted-media" loading="lazy"></iframe>
      ${item.caption ? `<figcaption>${item.caption}</figcaption>` : ''}
    </div>`;
  }
  return `<figure class="${cls || 'media-item'}">
    <img src="${item.src || ''}" alt="${item.caption || ''}" loading="lazy">
    ${item.caption ? `<figcaption>${item.caption}</figcaption>` : ''}
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
      slide.innerHTML = `<video src="${embedUrl}" controls preload="metadata" playsinline></video>`;
    } else if (sl.src) {
      slide.innerHTML = `<img src="${sl.src}" alt="${sl.caption || ''}" loading="lazy">`;
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
  siteData.exhibition.forEach(e => {
    const hasSubpages = e.subpages && e.subpages.length > 0;
    const detailUrl   = 'exhibition-detail.html?id=' + encodeURIComponent(e.id);
    const allMedia    = collectExhibitionMedia(e);
    const el = document.createElement('div');
    el.className = 'exhibition-item';

    // Slideshow cover or single image
    const coverWrap = document.createElement('div');
    coverWrap.className = 'exhibition-cover-wrap';
    if (allMedia.length > 1) {
      mountSlideshow(coverWrap, allMedia, e.slideshowHeight || '360px');
    } else if (e.image) {
      coverWrap.innerHTML = `<img src="${e.image}" alt="${e.title || ''}" loading="lazy">`;
    }

    const info = document.createElement('div');
    info.className = 'exhibition-details';
    info.innerHTML = `
      <h2>${e.title || ''}</h2>
      <div class="exhibition-meta">${[e.year, e.venue, e.location].filter(Boolean).join('  ·  ')}</div>
      <p class="exhibition-desc">${e.description || ''}</p>
      ${hasSubpages ? `<a class="exhibition-more-link" href="${detailUrl}">More →</a>` : ''}`;

    el.appendChild(coverWrap);
    el.appendChild(info);
    list.appendChild(el);
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

  const subpages  = exh.subpages || [];
  const allMedia  = collectExhibitionMedia(exh);
  const slideH    = exh.slideshowHeight || '480px';

  // ── Cover section: slideshow on the left ──
  const coverDiv = document.createElement('div');
  coverDiv.className = 'detail-cover';

  const coverMediaWrap = document.createElement('div');
  coverMediaWrap.className = 'detail-cover-media';
  if (allMedia.length > 0) {
    mountSlideshow(coverMediaWrap, allMedia, slideH);
  }

  const infoDiv = document.createElement('div');
  infoDiv.className = 'detail-cover-info';
  infoDiv.innerHTML = `
    <h1 class="detail-title">${exh.title || ''}</h1>
    <div class="detail-meta">${[exh.year, exh.venue, exh.location].filter(Boolean).join('  ·  ')}</div>
    ${exh.description ? `<p class="detail-desc">${exh.description}</p>` : ''}`;

  coverDiv.appendChild(coverMediaWrap);
  coverDiv.appendChild(infoDiv);
  wrap.appendChild(coverDiv);

  // ── Sub-page tabs ──
  if (subpages.length > 0) {
    const tabNav = document.createElement('div');
    tabNav.className = 'subpage-tabs';
    tabNav.innerHTML = subpages.map((sp, i) =>
      `<button class="subpage-tab${i === 0 ? ' active' : ''}" data-tab="${i}">${sp.title || ('Part ' + (i + 1))}</button>`
    ).join('');
    wrap.appendChild(tabNav);

    const panels = document.createElement('div');
    panels.className = 'subpage-panels';
    subpages.forEach((sp, i) => {
      const panel = document.createElement('div');
      panel.className = 'subpage-panel' + (i === 0 ? ' active' : '');
      panel.dataset.panel = i;

      const bodyHtml = markdownToHtml(sp.body || '');
      panel.innerHTML = `<div class="subpage-body">${bodyHtml}</div>`;

      const imgs = sp.images || [];
      if (imgs.length) {
        const grid = document.createElement('div');
        grid.className = 'subpage-images';
        imgs.forEach(img => {
          grid.innerHTML += renderMediaItem(img, 'subpage-figure');
        });
        panel.appendChild(grid);
      }

      panels.appendChild(panel);
    });
    wrap.appendChild(panels);

    // Tab switching
    wrap.querySelectorAll('.subpage-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = +btn.dataset.tab;
        wrap.querySelectorAll('.subpage-tab').forEach(b => b.classList.remove('active'));
        wrap.querySelectorAll('.subpage-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        wrap.querySelector('.subpage-panel[data-panel="' + idx + '"]').classList.add('active');
      });
    });
  }
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
  const images   = page.images || [];

  wrap.innerHTML = `
    <h1 class="page-title">${page.title || page.navLabel || ''}</h1>
    <div class="custom-page-body">${bodyHtml}</div>
    ${images.length ? `<div class="custom-page-images">
      ${images.map(img => `<figure class="subpage-figure">
        <img src="${img.src}" alt="${img.caption || ''}" loading="lazy">
        ${img.caption ? `<figcaption>${img.caption}</figcaption>` : ''}
      </figure>`).join('')}
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
  wrap.innerHTML = `
    <img class="bio-photo" src="${b.photo}" alt="${b.name}">
    <div class="bio-content">
      <h1>${b.name}</h1>
      <p class="bio-subtitle">${b.subtitle}</p>
      <p class="bio-text">${b.text}</p>
      ${b.cv_url ? `<a class="bio-cv-link" href="${b.cv_url}" target="_blank">Download CV →</a>` : ''}
    </div>`;
}

// ── Contact ────────────────────────────────────
function renderContact() {
  const wrap = document.getElementById('contact-wrap');
  if (!wrap || !siteData) return;
  const c = siteData.contact;
  wrap.innerHTML = `
    <img class="contact-img" src="${c.image}" alt="Contact">
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
  lightboxItems = weapons.map(w => ({ image: w.image, title: w.name, year: '', medium: '', dimensions: w.price }));
  weapons.forEach((w, i) => {
    const el = document.createElement('div');
    el.className = 'weapon-card';
    el.innerHTML = `
      <img src="${w.image}" alt="${w.name}" loading="lazy">
      <div class="weapon-name">${w.name}</div>
      ${w.price ? `<div class="weapon-price">${w.price}</div>` : ''}`;
    el.onclick = () => showLightbox(i);
    grid.appendChild(el);
  });
}
