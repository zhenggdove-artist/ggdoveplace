/* =============================================
   GGDOVE — VHS / Dreamlike Visual Effect Engine
   All parameters driven by content/visual.json
   ============================================= */

(function (global) {
  'use strict';

  var VHS = {
    cfg: null,
    canvas: null,
    ctx: null,
    animId: null,
    time: 0,
    grainCanvas: null,
    grainCtx: null,
    lastGrain: 0,
    wrapper: null,

    /* ── Default values ──────────────────────── */
    defaults: {
      enabled:             true,
      hueRotate:           220,     // deg  0-360
      saturation:          0.42,    // 0-2
      brightness:          0.72,    // 0-1.5
      contrast:            1.22,    // 0-3
      globalBlur:          0.35,    // px
      vignetteOpacity:     0.82,    // 0-1
      vignetteColor:       '#060116',
      overlayColor:        '#0b0428',
      overlayOpacity:      0.30,    // 0-1
      edgeBlurSize:        65,      // px
      grainOpacity:        0.070,   // 0-1
      scanlinesOpacity:    0.13,    // 0-1
      scanlinesSpacing:    3,       // px
      artifactsOpacity:    0.28,    // 0-1
      glowIntensity:       1.25,    // 0-5
      glowColor:           '#7744ff',
      chromaticAberration: 1.8     // px (0=off)
    },

    /* ── Public init ─────────────────────────── */
    init: function (userCfg) {
      this.cfg = Object.assign({}, this.defaults, userCfg || {});
      if (!this.cfg.enabled) return;

      var self = this;
      // Delay one frame so all page content is painted first
      requestAnimationFrame(function () {
        self._setup();
      });
    },

    _setup: function () {
      var isHome = document.body.classList.contains('home-page');

      if (isHome) {
        // Home page: apply filter to Three.js canvas container
        var container = document.getElementById('canvas-container');
        if (container) container.style.filter = this._filterStr();
      } else {
        // Inner pages: wrap body content in filtered div
        this._wrapContent();
      }

      this._addOverlays();
      this._initCanvas();
      this._initGrainBuffer();
      this._loop();
    },

    /* ── CSS filter string ───────────────────── */
    _filterStr: function () {
      var c = this.cfg;
      var parts = [
        'hue-rotate(' + c.hueRotate + 'deg)',
        'saturate(' + c.saturation + ')',
        'brightness(' + c.brightness + ')',
        'contrast(' + c.contrast + ')'
      ];
      if (c.globalBlur > 0) parts.push('blur(' + c.globalBlur + 'px)');
      return parts.join(' ');
    },

    /* ── Wrap inner-page content ─────────────── */
    _wrapContent: function () {
      var wrap = document.createElement('div');
      wrap.id = 'vhs-content';
      wrap.style.cssText = 'min-height:100vh;position:relative;filter:' + this._filterStr();
      var kids = Array.from(document.body.childNodes);
      kids.forEach(function (k) { wrap.appendChild(k); });
      document.body.appendChild(wrap);
      this.wrapper = wrap;
    },

    /* ── Fixed overlay divs ──────────────────── */
    _addOverlays: function () {
      var c = this.cfg;

      // 1. Color tint (multiply blend → cold blue-purple shift)
      this._div('vhs-tint',
        'position:fixed;inset:0;z-index:9990;pointer-events:none;' +
        'background:' + c.overlayColor + ';' +
        'opacity:' + c.overlayOpacity + ';' +
        'mix-blend-mode:multiply;'
      );

      // 2. Vignette (radial dark gradient)
      this._div('vhs-vignette',
        'position:fixed;inset:0;z-index:9991;pointer-events:none;' +
        'background:radial-gradient(ellipse at 50% 50%,' +
          'transparent 18%,' + c.vignetteColor + '99 58%,' + c.vignetteColor + ' 100%);' +
        'opacity:' + c.vignetteOpacity + ';'
      );

      // 3. Edge inner box-shadow blur
      this._div('vhs-edge',
        'position:fixed;inset:0;z-index:9989;pointer-events:none;' +
        'box-shadow:inset 0 0 ' + c.edgeBlurSize + 'px ' +
          Math.round(c.edgeBlurSize * 0.6) + 'px ' + c.vignetteColor + ';'
      );
    },

    _div: function (id, css) {
      var el = document.createElement('div');
      el.id = id;
      el.style.cssText = css;
      document.body.appendChild(el);
      return el;
    },

    /* ── Main canvas (grain / scanlines / glitch) */
    _initCanvas: function () {
      this.canvas = document.createElement('canvas');
      this.canvas.id = 'vhs-canvas';
      this.canvas.style.cssText =
        'position:fixed;inset:0;width:100%;height:100%;' +
        'pointer-events:none;z-index:9993;mix-blend-mode:screen;';
      document.body.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      this._resize();
      var self = this;
      window.addEventListener('resize', function () { self._resize(); });
    },

    _resize: function () {
      this.canvas.width  = window.innerWidth;
      this.canvas.height = window.innerHeight;
    },

    /* ── Offscreen grain buffer (256×256, tiled) ─ */
    _initGrainBuffer: function () {
      this.grainCanvas = document.createElement('canvas');
      this.grainCanvas.width  = 256;
      this.grainCanvas.height = 256;
      this.grainCtx = this.grainCanvas.getContext('2d');
    },

    _refreshGrain: function () {
      var gc   = this.grainCtx;
      var w    = this.grainCanvas.width;
      var h    = this.grainCanvas.height;
      var op   = this.cfg.grainOpacity;
      var img  = gc.createImageData(w, h);
      var data = img.data;

      for (var i = 0; i < data.length; i += 4) {
        var v = Math.random() * 255 | 0;
        data[i]   = v;
        data[i+1] = v;
        data[i+2] = (v + Math.random() * 40) | 0; // slight blue tint
        data[i+3] = (Math.random() * op * 255) | 0;
      }
      gc.putImageData(img, 0, 0);
    },

    /* ── Draw passes ─────────────────────────── */
    _drawGlow: function () {
      var gi = this.cfg.glowIntensity;
      if (gi <= 0) return;
      var ctx = this.ctx;
      var w = this.canvas.width, h = this.canvas.height;
      var grad = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, h * 0.65);
      var alpha = Math.round(gi * 10).toString(16).padStart(2,'0');
      grad.addColorStop(0, this.cfg.glowColor + alpha);
      grad.addColorStop(1, 'transparent');
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    },

    _drawGrain: function () {
      if (this.cfg.grainOpacity <= 0) return;
      var now = performance.now();
      if (now - this.lastGrain > 42) { // ~24 fps
        this._refreshGrain();
        this.lastGrain = now;
      }
      var pat = this.ctx.createPattern(this.grainCanvas, 'repeat');
      this.ctx.save();
      this.ctx.globalAlpha = 1;
      this.ctx.fillStyle = pat;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.restore();
    },

    _drawScanlines: function () {
      var op = this.cfg.scanlinesOpacity;
      if (op <= 0) return;
      var sp = this.cfg.scanlinesSpacing;
      var ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,8,' + op + ')';
      for (var y = 0; y < this.canvas.height; y += sp) {
        ctx.fillRect(0, y, this.canvas.width, 1);
      }
      ctx.restore();
    },

    _drawArtifacts: function () {
      var op = this.cfg.artifactsOpacity;
      if (op <= 0) return;
      var ctx = this.ctx;
      var w = this.canvas.width, h = this.canvas.height;

      // Horizontal glitch bar (occasional)
      if (Math.random() < 0.042) {
        var y1 = Math.random() * h;
        var bh = Math.random() * 3.5 + 0.5;
        var xs = (Math.random() - 0.5) * 35;
        ctx.save();
        ctx.fillStyle = 'rgba(120,155,255,' + (op * Math.random() * 0.38) + ')';
        ctx.fillRect(xs, y1, w, bh);
        ctx.restore();
      }

      // White tracking streak
      if (Math.random() < 0.018) {
        var y2 = Math.random() * h;
        ctx.save();
        ctx.fillStyle = 'rgba(200,210,255,' + (op * 0.22) + ')';
        ctx.fillRect(0, y2, w * (0.25 + Math.random() * 0.75), 1.2);
        ctx.restore();
      }

      // Color smear band
      if (Math.random() < 0.012) {
        var y3 = Math.random() * h;
        var sh = Math.random() * 7 + 1;
        ctx.save();
        ctx.fillStyle = 'rgba(70,30,180,' + (op * 0.14) + ')';
        ctx.fillRect(0, y3, w, sh);
        ctx.restore();
      }

      // Vertical flicker stripe (very rare)
      if (Math.random() < 0.005) {
        var x4 = Math.random() * w;
        var sw = Math.random() * 3 + 1;
        ctx.save();
        ctx.fillStyle = 'rgba(180,200,255,' + (op * 0.10) + ')';
        ctx.fillRect(x4, 0, sw, h);
        ctx.restore();
      }
    },

    _drawChromatic: function () {
      var ca = this.cfg.chromaticAberration;
      if (ca <= 0) return;
      var ctx = this.ctx;
      var w = this.canvas.width, h = this.canvas.height;
      var str = ca * 0.022;

      ctx.save();
      // Red fringe — left edge
      var lg = ctx.createLinearGradient(0, 0, w * 0.18, 0);
      lg.addColorStop(0, 'rgba(255,0,60,' + str + ')');
      lg.addColorStop(1, 'transparent');
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, w * 0.18, h);

      // Cyan fringe — right edge
      var rg = ctx.createLinearGradient(w, 0, w * 0.82, 0);
      rg.addColorStop(0, 'rgba(0,80,255,' + str + ')');
      rg.addColorStop(1, 'transparent');
      ctx.fillStyle = rg;
      ctx.fillRect(w * 0.82, 0, w * 0.18, h);
      ctx.restore();
    },

    /* ── Animation loop ──────────────────────── */
    _loop: function () {
      var ctx = this.ctx;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      this._drawGlow();
      this._drawGrain();
      this._drawScanlines();
      this._drawArtifacts();
      this._drawChromatic();

      this.time++;
      var self = this;
      this.animId = requestAnimationFrame(function () { self._loop(); });
    },

    /* ── Public: live-update a single param ───── */
    update: function (key, value) {
      if (!(key in this.cfg)) return;
      this.cfg[key] = value;

      // Re-apply filter if it's a filter param
      var filterParams = ['hueRotate','saturation','brightness','contrast','globalBlur'];
      if (filterParams.indexOf(key) !== -1) {
        var filterStr = this._filterStr();
        var content = document.getElementById('vhs-content');
        if (content) content.style.filter = filterStr;
        var container = document.getElementById('canvas-container');
        if (container) container.style.filter = filterStr;
      }

      // Re-apply overlay params
      var tint = document.getElementById('vhs-tint');
      if (tint) {
        tint.style.background = this.cfg.overlayColor;
        tint.style.opacity = this.cfg.overlayOpacity;
      }
      var vig = document.getElementById('vhs-vignette');
      if (vig) {
        vig.style.opacity = this.cfg.vignetteOpacity;
      }
    },

    /* ── Destroy ─────────────────────────────── */
    destroy: function () {
      if (this.animId) cancelAnimationFrame(this.animId);
      ['vhs-tint','vhs-vignette','vhs-edge','vhs-canvas'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.remove();
      });
      var wrap = document.getElementById('vhs-content');
      if (wrap) {
        var p = wrap.parentNode;
        while (wrap.firstChild) p.insertBefore(wrap.firstChild, wrap);
        wrap.remove();
      }
    }
  };

  global.VHSEffect = VHS;

}(window));
