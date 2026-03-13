/* =============================================
   GGDOVE — VHS / Dreamlike Texture Engine  v2
   Canvas-only: images are NEVER filtered.
   Effects: heavy grain, scanlines, VHS glitch
   artifacts, rolling tracking bar, chromatic
   aberration, pulsing ambient glow, edge soft
   focus (backdrop-filter), deep vignette.
   Parameters driven by content/visual.json
   ============================================= */

(function (global) {
  'use strict';

  var VHS = {
    cfg:           null,
    canvas:        null,
    ctx:           null,
    animId:        null,
    time:          0,
    grainCanvas:   null,
    grainCtx:      null,
    lastGrain:     0,
    rollingBar:    null,
    rollingTimer:  0,

    /* ── Defaults ──────────────────────────────
       All values intentionally stronger than
       "subtle" — this is a VHS aesthetic site.
       Users can dial down via admin/visual.json.
    ───────────────────────────────────────────── */
    defaults: {
      enabled:             true,
      vignetteOpacity:     0.82,
      vignetteColor:       '#030010',
      overlayColor:        '#06011a',
      overlayOpacity:      0.12,
      edgeBlurSize:        65,
      grainOpacity:        0.075,      // visible but text still legible
      scanlinesOpacity:    0.13,       // scanlines present but not overpowering
      scanlinesSpacing:    3,
      artifactsOpacity:    0.38,       // active VHS artifacts
      rollingBarEnabled:   true,
      glowIntensity:       1.50,
      glowColor:           '#5522ff',
      chromaticAberration: 2.2
    },

    /* ── Init ────────────────────────────────── */
    init: function (userCfg) {
      this.cfg = Object.assign({}, this.defaults, userCfg || {});
      if (!this.cfg.enabled) return;
      var self = this;
      requestAnimationFrame(function () { self._setup(); });
    },

    _setup: function () {
      this._addOverlays();
      this._initCanvas();
      this._initGrainBuffer();
      this._loop();
    },

    /* ── Overlay divs ─────────────────────────
       Layering (bottom → top):
         page content               z: 0
         vhs-edge (box-shadow)      z: 9988
         vhs-tint (cold atmosphere) z: 9990
         vhs-vignette (dark edges)  z: 9991
         vhs-canvas (grain/lines)   z: 9993  ← texture on top
       NOTE: backdrop-filter was removed — it caused full-page blur in
       browsers that don't support mask-image+backdrop-filter together.
    ─────────────────────────────────────────── */
    _addOverlays: function () {
      var c = this.cfg;

      // 1. Inset edge shadow
      this._div('vhs-edge',
        'position:fixed;inset:0;z-index:9988;pointer-events:none;' +
        'box-shadow:inset 0 0 ' + c.edgeBlurSize + 'px ' +
          Math.round(c.edgeBlurSize * 0.55) + 'px ' + c.vignetteColor + ';'
      );

      // 3. Very subtle cold atmospheric tint — normal blend, low opacity
      this._div('vhs-tint',
        'position:fixed;inset:0;z-index:9990;pointer-events:none;' +
        'background:' + c.overlayColor + ';' +
        'opacity:' + c.overlayOpacity + ';'
      );

      // 4. Vignette — heavy dark edges, clear center
      this._div('vhs-vignette',
        'position:fixed;inset:0;z-index:9991;pointer-events:none;' +
        'background:radial-gradient(ellipse 76% 72% at 50% 50%,' +
          'transparent 20%,' +
          c.vignetteColor + 'bb 52%,' +
          c.vignetteColor + 'ff 100%);' +
        'opacity:' + c.vignetteOpacity + ';'
      );
    },

    _div: function (id, css) {
      var el = document.createElement('div');
      el.id = id;
      el.style.cssText = css;
      document.body.appendChild(el);
      return el;
    },

    /* ── Canvas ───────────────────────────────── */
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

    /* ── Grain buffer (256×256 tiled) ──────────── */
    _initGrainBuffer: function () {
      this.grainCanvas = document.createElement('canvas');
      this.grainCanvas.width  = 256;
      this.grainCanvas.height = 256;
      this.grainCtx = this.grainCanvas.getContext('2d');
    },

    _refreshGrain: function () {
      var gc   = this.grainCtx;
      var img  = gc.createImageData(256, 256);
      var data = img.data;
      var op   = this.cfg.grainOpacity;

      for (var i = 0; i < data.length; i += 4) {
        var v = Math.random() * 255 | 0;
        // Neutral luminance grain — no hue shift
        data[i]   = v;
        data[i+1] = v;
        data[i+2] = v;
        // Variable opacity per pixel — more organic feel
        data[i+3] = (Math.random() * Math.random() * op * 320) | 0;
      }
      gc.putImageData(img, 0, 0);
    },

    /* ── Draw: ambient center glow (pulsing) ────── */
    _drawGlow: function () {
      var gi = this.cfg.glowIntensity;
      if (gi <= 0) return;
      var ctx  = this.ctx;
      var w = this.canvas.width, h = this.canvas.height;

      // Slow sinusoidal pulse
      var pulse = 0.80 + 0.20 * Math.sin(this.time * 0.018);
      var eff   = gi * pulse;

      var grad = ctx.createRadialGradient(w * 0.5, h * 0.44, 0, w * 0.5, h * 0.44, h * 0.58);
      var a1 = Math.min(255, Math.round(eff * 14)).toString(16).padStart(2,'0');
      var a2 = Math.min(255, Math.round(eff * 5)).toString(16).padStart(2,'0');
      grad.addColorStop(0,   this.cfg.glowColor + a1);
      grad.addColorStop(0.4, this.cfg.glowColor + a2);
      grad.addColorStop(1,   'transparent');

      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    },

    /* ── Draw: film grain ────────────────────────── */
    _drawGrain: function () {
      if (this.cfg.grainOpacity <= 0) return;
      var now = performance.now();
      if (now - this.lastGrain > 38) { // ~26fps grain refresh
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

    /* ── Draw: scanlines ─────────────────────────── */
    _drawScanlines: function () {
      var op = this.cfg.scanlinesOpacity;
      if (op <= 0) return;
      var sp  = Math.max(1, this.cfg.scanlinesSpacing | 0);
      var ctx = this.ctx;
      var w   = this.canvas.width, h = this.canvas.height;

      // Primary scanlines
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,' + op + ')';
      for (var y = 0; y < h; y += sp) {
        ctx.fillRect(0, y, w, 1);
      }

      // Secondary micro-flicker (every 2 scanlines, very dim)
      if (op > 0.08) {
        ctx.fillStyle = 'rgba(0,0,0,' + (op * 0.3) + ')';
        for (var y2 = 1; y2 < h; y2 += sp * 2) {
          ctx.fillRect(0, y2, w, 1);
        }
      }
      ctx.restore();
    },

    /* ── Draw: VHS artifacts ─────────────────────── */
    _drawArtifacts: function () {
      var op = this.cfg.artifactsOpacity;
      if (op <= 0) return;
      var ctx = this.ctx;
      var w = this.canvas.width, h = this.canvas.height;

      // ── Horizontal glitch bar (blue-tinted, offset)
      if (Math.random() < 0.055) {
        var y1 = Math.random() * h;
        var bh = Math.random() * 4 + 0.5;
        var xs = (Math.random() - 0.5) * 50;
        ctx.save();
        ctx.fillStyle = 'rgba(100,130,255,' + (op * Math.random() * 0.40) + ')';
        ctx.fillRect(xs, y1, w, bh);
        ctx.restore();
      }

      // ── Wide dim glitch band (rare, more dramatic)
      if (Math.random() < 0.012) {
        var y1b = Math.random() * h;
        var bh2 = 8 + Math.random() * 18;
        ctx.save();
        ctx.fillStyle = 'rgba(80,100,255,' + (op * 0.18) + ')';
        ctx.fillRect(0, y1b, w, bh2);
        ctx.restore();
      }

      // ── White tracking streak
      if (Math.random() < 0.022) {
        var y2 = Math.random() * h;
        var len = w * (0.25 + Math.random() * 0.75);
        ctx.save();
        ctx.fillStyle = 'rgba(210,218,255,' + (op * 0.22) + ')';
        ctx.fillRect(0, y2, len, 1.0);
        // Slight color fringe above the streak
        ctx.fillStyle = 'rgba(255,80,80,' + (op * 0.08) + ')';
        ctx.fillRect(0, y2 - 1, len * 0.7, 0.8);
        ctx.restore();
      }

      // ── Color smear band
      if (Math.random() < 0.014) {
        var y3 = Math.random() * h;
        var sh = 2 + Math.random() * 8;
        ctx.save();
        ctx.fillStyle = 'rgba(50,15,170,' + (op * 0.16) + ')';
        ctx.fillRect(0, y3, w, sh);
        ctx.restore();
      }

      // ── Vertical flicker stripe
      if (Math.random() < 0.006) {
        var x4 = Math.random() * w;
        var sw = Math.random() * 2.5 + 0.5;
        ctx.save();
        ctx.fillStyle = 'rgba(180,195,255,' + (op * 0.10) + ')';
        ctx.fillRect(x4, 0, sw, h);
        ctx.restore();
      }

      // ── Signal noise burst (very rare)
      if (Math.random() < 0.003) {
        var y5 = Math.random() * h;
        var bh3 = 1 + Math.random() * 3;
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,' + (op * 0.35) + ')';
        ctx.fillRect(0, y5, w * (0.4 + Math.random() * 0.6), bh3);
        ctx.restore();
      }
    },

    /* ── Draw: VHS rolling tracking bar ──────────── */
    _drawRollingBar: function () {
      if (!this.cfg.rollingBarEnabled) return;
      var ctx = this.ctx;
      var w = this.canvas.width, h = this.canvas.height;

      // Trigger a new rolling bar periodically
      this.rollingTimer++;
      if (!this.rollingBar && this.rollingTimer > 300 + (Math.random() * 420 | 0)) {
        this.rollingBar = {
          y:       -45,
          height:  22 + Math.random() * 28,
          opacity: 0.38 + Math.random() * 0.28,
          speed:   2.2 + Math.random() * 3.5
        };
        this.rollingTimer = 0;
      }

      if (this.rollingBar) {
        var rb = this.rollingBar;
        ctx.save();

        // Main dark band
        ctx.fillStyle = 'rgba(0,0,0,' + rb.opacity + ')';
        ctx.fillRect(0, rb.y, w, rb.height);

        // Bright fringe at top of band (VHS tracking line)
        ctx.fillStyle = 'rgba(180,200,255,' + (rb.opacity * 0.35) + ')';
        ctx.fillRect(0, rb.y, w, 1.5);

        // Slight color shift inside band
        ctx.fillStyle = 'rgba(40,0,100,' + (rb.opacity * 0.20) + ')';
        ctx.fillRect(0, rb.y + 2, w, rb.height - 2);

        ctx.restore();

        rb.y += rb.speed;
        if (rb.y > h + 55) this.rollingBar = null;
      }
    },

    /* ── Draw: chromatic aberration ──────────────── */
    _drawChromatic: function () {
      var ca = this.cfg.chromaticAberration;
      if (ca <= 0) return;
      var ctx  = this.ctx;
      var w = this.canvas.width, h = this.canvas.height;
      var zone = Math.min(0.26, ca * 0.014 + 0.07);
      var str  = Math.min(0.18, ca * 0.022);

      ctx.save();

      // Red fringe — left edge
      var lg = ctx.createLinearGradient(0, 0, w * zone, 0);
      lg.addColorStop(0,   'rgba(255,0,45,' + str + ')');
      lg.addColorStop(0.5, 'rgba(255,0,45,' + (str * 0.4) + ')');
      lg.addColorStop(1,   'transparent');
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, w * zone, h);

      // Cyan/blue fringe — right edge
      var rg = ctx.createLinearGradient(w, 0, w * (1 - zone), 0);
      rg.addColorStop(0,   'rgba(0,80,255,' + str + ')');
      rg.addColorStop(0.5, 'rgba(0,80,255,' + (str * 0.4) + ')');
      rg.addColorStop(1,   'transparent');
      ctx.fillStyle = rg;
      ctx.fillRect(w * (1 - zone), 0, w * zone, h);

      // Top/bottom chromatic fringe (less intense)
      var tg = ctx.createLinearGradient(0, 0, 0, h * 0.12);
      tg.addColorStop(0,   'rgba(180,0,255,' + (str * 0.3) + ')');
      tg.addColorStop(1,   'transparent');
      ctx.fillStyle = tg;
      ctx.fillRect(0, 0, w, h * 0.12);

      ctx.restore();
    },

    /* ── Animation loop ───────────────────────────── */
    _loop: function () {
      var ctx = this.ctx;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      this._drawGlow();
      this._drawGrain();
      this._drawScanlines();
      this._drawArtifacts();
      this._drawRollingBar();
      this._drawChromatic();

      this.time++;
      var self = this;
      this.animId = requestAnimationFrame(function () { self._loop(); });
    },

    /* ── Live update a single param ───────────────── */
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

    /* ── Destroy ──────────────────────────────────── */
    destroy: function () {
      if (this.animId) cancelAnimationFrame(this.animId);
      ['vhs-edge','vhs-tint','vhs-vignette','vhs-canvas'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.remove();
      });
    }
  };

  global.VHSEffect = VHS;

}(window));
