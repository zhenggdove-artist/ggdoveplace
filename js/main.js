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
  // Defer Zalgo until all render functions have run (next macrotask)
  setTimeout(() => applyZalgo(siteData.site), 0);
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

let _zalgoTimer = null;

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

function applyZalgo(site) {
  const cfg = site && site.zalgoEffect;
  if (!cfg) return;

  // Handle string-serialised boolean from CMS
  const enabled = _coerceBool(cfg.enabled, true);
  if (!enabled) return;

  const opts = {
    up:        _coerceBool(cfg.up,   true),
    mid:       _coerceBool(cfg.mid,  false),
    down:      _coerceBool(cfg.down, false),
    intensity: isNaN(Number(cfg.intensity)) ? 0.3 : Number(cfg.intensity)
  };
  // Interval is now stored in SECONDS in data.json (e.g. 2.5 = every 2.5s).
  // Multiply by 1000 to get ms; clamp to a minimum of 50ms.
  const interval = Math.max(50, (isNaN(Number(cfg.interval)) ? 2.5 : Number(cfg.interval)) * 1000);

  // Map target keys (used by the CMS multi-select) to CSS selectors
  const selectorMap = {
    'page-title':    '.page-title',
    'bio-h1':        '.bio-content h1',
    'exhibition-h2': '.exhibition-details h2',
    'contact-h2':    '.contact-info h2',
    'nav-logo':      '.nav-logo',
    'nav-links':     '.nav-links a'
  };

  // Handle both new array format (multi-select) and legacy string values
  let selectors;
  if (Array.isArray(cfg.targets)) {
    selectors = cfg.targets.map(t => selectorMap[t]).filter(Boolean);
  } else if (cfg.targets === 'all') {
    selectors = Object.values(selectorMap);
  } else if (cfg.targets === 'nav') {
    selectors = ['.nav-logo', '.nav-links a'];
  } else {
    // 'headings' or any unrecognised string → default headings only
    selectors = ['.page-title', '.bio-content h1', '.exhibition-details h2', '.contact-info h2'];
  }

  function reZalgo() {
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        // Preserve original clean text on first run only
        if (!el.dataset.zalgoOrig) el.dataset.zalgoOrig = el.textContent;

        // Wrap in a Georgia span so Unicode combining marks render as
        // proper VERTICAL diacritics — monospace/CJK fallback fonts
        // misrender them as full-width horizontal characters instead.
        const span = document.createElement('span');
        span.style.fontFamily = 'Georgia, "Times New Roman", "Noto Serif", serif';
        span.textContent = generateZalgo(el.dataset.zalgoOrig, opts);
        el.innerHTML = '';
        el.appendChild(span);
      });
    });
  }

  reZalgo();
  // Start living timer only once per page load
  if (!_zalgoTimer) {
    _zalgoTimer = setInterval(reZalgo, interval);
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
    VHSEffect.init(visualData);
  }
}

// ── Header / Nav ───────────────────────────────
function renderHeader(activePage) {
  const nav = document.getElementById('main-nav');
  if (!nav || !siteData) return;
  // Allow CMS to override each nav label; fall back to defaults
  const nl = (siteData.site && siteData.site.navLabels) || {};
  const pages = [
    { id: 'projects',   label: nl.works      || 'Works',      href: 'index.html'      },
    { id: 'exhibition', label: nl.exhibition  || 'Exhibition',  href: 'exhibition.html' },
    { id: 'weapons',    label: nl.weapons     || 'Weapons',     href: 'weapons.html'    },
    { id: 'bio',        label: nl.bio         || 'Bio',         href: 'bio.html'        },
    { id: 'contact',    label: nl.contact     || 'Contact',     href: 'contact.html'    }
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
function renderExhibition() {
  const list = document.getElementById('exhibition-list');
  if (!list || !siteData) return;
  siteData.exhibition.forEach(e => {
    const el = document.createElement('div');
    el.className = 'exhibition-item';
    el.innerHTML = `
      <img src="${e.image}" alt="${e.title}" loading="lazy">
      <div class="exhibition-details">
        <h2>${e.title}</h2>
        <div class="exhibition-meta">${[e.year, e.venue, e.location].filter(Boolean).join('  ·  ')}</div>
        <p class="exhibition-desc">${e.description || ''}</p>
      </div>`;
    list.appendChild(el);
  });
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
