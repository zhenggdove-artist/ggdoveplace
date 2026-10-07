# Homepage point-cloud performance regression

Cause: after nine clicks ~29,400 tiny glyphs were individually font-configured and drawn with Canvas 2D every frame.

Fix: native-size Courier glyph atlas + one WebGL instanced draw, reusable vertex storage, cached ring trigonometry. All point simulation, birth/recoil/growth/fade, color, alpha, draw order, density, and navigation remain unchanged. Transparent glyph padding is cropped with a filtering border. GPU initialization failure retains Canvas 2D.

Validation (Chromium, this machine):
- Original vs optimized vs fallback, desktop and mobile widths, same RNG and clock: exact hashes match for every particle's position, base position, alpha, size, phase, speed and amplitude through ten clicks.
- WebGL no errors and non-empty framebuffer.
- Isolated full-page nine-click test, after spring settles: original 79.77ms/frame (~12.5fps); optimized desktop and mobile viewport 16.67ms/frame (~60fps).
- Real click/touchend listeners and tenth-click navigation to play.html pass; no JavaScript exceptions.
- These are local Chromium results; mobile viewport emulation is not a physical phone measurement.

Run from repository root in PowerShell (requires Playwright; PLAYWRIGHT_MODULE can override its module path):

    $env:PLAYWRIGHT_BROWSERS_PATH='C:\Users\ACER\AppData\Local\ms-playwright'
    node output/debug-cloud/regression.cjs

For isolated complete-page performance and click/navigation validation:

    $env:LIVE_ONLY='1'
    node output/debug-cloud/regression.cjs

Set LIVE_MOBILE=1 for touch/390px viewport. Set LIVE_BASELINE=1 for original homepage.
Keep isolated FPS measurements in a separate browser run from synchronous stress tests: GPU commands from those tests queue up and distort live timings.
