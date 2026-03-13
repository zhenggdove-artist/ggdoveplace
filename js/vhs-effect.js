/* =============================================
   GGDOVE — VHS / Dreamlike Texture Engine
   Canvas-only: grain, scanlines, artifacts,
   chromatic aberration, vignette, ambient glow.
   CSS filter is NOT used — images display in
   their original, unmodified colors.
   Parameters driven by content/visual.json
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

    /* ── Default values ─────────────────────── */
    defaults: {
      enabled:             true,
      // NOTE: CSS filter params (hueRotate, saturation, brightness, contrast,
      // globalBlur) are intentionally removed. Color palette is handled by
      // CSS design — images are never filtered.
      vignetteOpacity:     0.80,   // 0-1
      vignetteColor:       '#040112',
      overlayColor:        '#08021e',
      overlayOpacity:      0.12,   // kept very low — subtle atmospheric tint only
      edgeBlurSize:        60,     // px
      grainOpacity:        0.065,  // 0-1
      scanlinesOpacity:    0.11,   // 0-1
      scanlinesSpacing:    3,      // px
      artifactsOpacity:    0.26,   // 0-1
      glowIntensity:       1.20,   // 0-5
      glowColor:           '#6633ff',
      chromaticAberration: 1.6    // px (0=off)
    },

    /* ── Public init ────────────────────────── */
    init: function (userCfg) {
      this.cfg = Object.assign({}, this.defaults, userCfg || {});
      if (!this.cfg.enabled) return;

      var self = this;
      requestAnimationFrame(function () {
        self._setup();
      });
    },

    _setup: function () {
      this._addOverlays();
      this._initCanvas();
      this._initGrainBuffer();
      this._loop();
    },

    /* ── Fixed overlay divs ─────────────────── */
    _addOverlays: function () {
      var c = this.cfg;

      // 1. Very subtle cold atmospheric tint — normal blend, very low opacity
      //    Does not meaningfully shift image colors at this opacity level
      this._div('vhs-tint',
        'position:fixed;inset:0;z-index:9990;pointer-events:none;' +
        'background:' + c.overlayColor + ';' +
        'opacity:' + c.overlayOpacity + ';'
      );

      // 2. Vignette — darkens edges only, no hue shift
      this._div('vhs-vignette',
        'position:fixed;inset:0;z-index:9991;pointer-events:none;' +
        'background:radial-gradient(ellipse 80% 75% at 50% 50%,' +
          'transparent 20%,' +
          c.vignetteColor + 'aa 55%,' +
          c.vignetteColor + 'ff 100%);' +
        'opacity:' + c.vignetteOpacity + ';'
      );

      // 3. Inset edge shadow
      this._div('vhs-edge',
        'position:fixed;inset:0;z-index:9989;pointer-events:none;' +
        'box-shadow:inset 0 0 ' + c.edgeBlurSize + 'px ' +
          Math.round(c.edgeBlurSize * 0.5) + 'px ' + c.vignetteColor + ';'
      );
    },

    _div: function (id, css) {
      var el = document.createElement('div');
      el.id = id;
      el.style.cssText = css;
      document.body.appendChild(el);
      return el;
    },

    /* ── Main canvas ─────────────────────────── */
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

    /* ── Grain buffer ─────────────────────────── */
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
        // Neutral grain — no blue tint added so image colors aren't shifted
        data[i]   = v;
        data[i+1] = v;
        data[i+2] = v;
        data[i+3] = (Math.random() * op * 255) | 0;
      }
      gc.putImageData(img, 0, 0);
    },

    /* ── Draw passes ──────────────────────────── */
    _drawGlow: function () {
      var gi = this.cfg.glowIntensity;
      if (gi <= 0) return;
      var ctx = this.ctx;
      var w = this.canvas.width, h = this.canvas.height;
      var grad = ctx.createRadialGradient(w/2, h * 0.46, 0, w/2, h * 0.46, h * 0.62);
      var alpha = Math.min(255, Math.round(gi * 12)).toString(16).padStart(2,'0');
      grad.addColorStop(0, this.cfg.glowColor + alpha);
      grad.addColorStop(0.5, this.cfg.glowColor + '0a');
      grad.addColorStop(1, 'transparent');
      ctx.save();
      ctx.globalAlpha = 0.30;
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
      var sp  = Math.max(1, this.cfg.scanlinesSpacing);
      var ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,' + op + ')';
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

      // Horizontal glitch bar
      if (Math.random() < 0.038) {
        var y1 = Math.random() * h;
        var bh = Math.random() * 3 + 0.5;
        var xs = (Math.random() - 0.5) * 30;
        ctx.save();
        ctx.fillStyle = 'rgba(110,140,255,' + (op * Math.random() * 0.32) + ')';
        ctx.fillRect(xs, y1, w, bh);
        ctx.restore();
      }

      // White tracking streak
      if (Math.random() < 0.015) {
        var y2 = Math.random() * h;
        ctx.save();
        ctx.fillStyle = 'rgba(190,205,255,' + (op * 0.18) + ')';
        ctx.fillRect(0, y2, w * (0.3 + Math.random() * 0.7), 1);
        ctx.restore();
      }

      // Subtle color smear band
      if (Math.random() < 0.010) {
        var y3 = Math.random() * h;
        var sh = Math.random() * 6 + 1;
        ctx.save();
        ctx.fillStyle = 'rgba(60,20,160,' + (op * 0.10) + ')';
        ctx.fillRect(0, y3, w, sh);
        ctx.restore();
      }

      // Vertical flicker stripe (very rare)
      if (Math.random() < 0.004) {
        var x4 = Math.random() * w;
        var sw = Math.random() * 2.5 + 0.5;
        ctx.save();
        ctx.fillStyle = 'rgba(170,190,255,' + (op * 0.08) + ')';
        ctx.fillRect(x4, 0, sw, h);
        ctx.restore();
      }
    },

    _drawChromatic: function () {
      var ca = this.cfg.chromaticAberration;
      if (ca <= 0) return;
      var ctx = this.ctx;
      var w = this.canvas.width, h = this.canvas.height;
      var zone = Math.min(0.22, ca * 0.012 + 0.06);
      var str  = ca * 0.018;

      ctx.save();
      // Red fringe — left edge
      var lg = ctx.createLinearGradient(0, 0, w * zone, 0);
      lg.addColorStop(0, 'rgba(255,0,50,' + str + ')');
      lg.addColorStop(1, 'transparent');
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, w * zone, h);

      // Cyan fringe — right edge
      var rg = ctx.createLinearGradient(w, 0, w * (1 - zone), 0);
      rg.addColorStop(0, 'rgba(0,90,255,' + str + ')');
      rg.addColorStop(1, 'transparent');
      ctx.fillStyle = rg;
      ctx.fillRect(w * (1 - zone), 0, w * zone, h);
      ctx.restore();
    },

    /* ── Animation loop ─────────────────────── */
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

    /* ── Public: live-update a single param ─── */
    update: function (key, value) {
      if (!(key in this.cfg)) return;
      this.cfg[key] = value;

      var tint = document.getElementById('vhs-tint');
      if (tint) {
        tint.style.background = this.cfg.overlayColor;
        tint.style.opacity    = this.cfg.overlayOpacity;
      }
      var vig = document.getElementById('vhs-vignette');
      if (vig) vig.style.opacity = this.cfg.vignetteOpacity;
    },

    /* ── Destroy ─────────────────────────────── */
    destroy: function () {
      if (this.animId) cancelAnimationFrame(this.animId);
      ['vhs-tint','vhs-vignette','vhs-edge','vhs-canvas'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.remove();
      });
    }
  };

  global.VHSEffect = VHS;

}(window));
