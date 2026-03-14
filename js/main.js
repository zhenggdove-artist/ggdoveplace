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
  const [data, visual] = await Promise.all([
    fetch(DATA_URL).then(r => r.json()),
    fetch(VISUAL_URL).then(r => r.json()).catch(() => ({}))
  ]);
  siteData   = data;
  visualData = visual;
  applyFonts(siteData.site);
  return siteData;
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
  const pages = [
    { id: 'projects',   label: 'Works',      href: 'index.html'      },
    { id: 'exhibition', label: 'Exhibition',  href: 'exhibition.html' },
    { id: 'weapons',    label: 'Weapons',     href: 'weapons.html'    },
    { id: 'bio',        label: 'Bio',         href: 'bio.html'        },
    { id: 'contact',    label: 'Contact',     href: 'contact.html'    }
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
