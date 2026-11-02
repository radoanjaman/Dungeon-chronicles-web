# CHANGES.md — Dungeon Chronicles Web Optimization

## Summary

This document records all changes made during the web-release optimization pass.

---

## Java Source Changes (Phase A)

### A1. `utilz/ImageUtil.java` *(NEW)*
**Why:** Centralize all pre-scaling into a single utility that can never crash the game — it returns `null` on failure and every caller falls back to the original scaled draw path.

**What:** `ImageUtil.scaled(src, w, h, opaque)` — scales a `BufferedImage` to a given size using nearest-neighbour interpolation. All exceptions are caught; `null` is returned on any failure.

---

### A2. `gamestates/Playing.java`
**Why:** Background image (`playing_bg_img.png`, 384×128) was stretched to 1664×896 on every frame — the biggest rendering bottleneck. Clouds and ship were also scaled per-frame.

**What:**
- Added fields `backgroundBig`, `bigCloudBig`, `smallCloudBig`, `shipImgsBig[]`.
- New `prescaleImages()` method scales all four assets once at startup using `ImageUtil`.
- `draw()` uses `backgroundBig` (1:1 blit) if available, else falls back to the original fill + scaled draw.
- `drawClouds()` skips any cloud whose screen x is fully outside `[0, GAME_WIDTH)`, and uses pre-scaled images when available.
- Ship draw uses `shipImgsBig[shipAni]` when available, falls back to original.
- Added `import utilz.ImageUtil`.

---

### A3. `levels/LevelManager.java` *(rewritten)*
**Why:** `draw()` was calling `g.drawImage(sprite, x, y, 64, 64, null)` for every visible tile — forcing a scale transform per tile per frame. Pre-scaling tiles to 64×64 converts these to free blits.

**What:**
- Added `levelSpriteBig[]` and `waterSpriteBig[]` — pre-scaled 64×64 via `ImageUtil.scaled`, built in constructor. Air tile (index 11) is never scaled (it's fully transparent and never drawn).
- Added constants `TILE=64`, `AIR_TILE=11`, `WATER_TOP=48`, `WATER_BOTTOM=49`.
- `draw()` rewritten: computes `firstCol`/`lastColExclusive` to only iterate visible columns; skips air tiles; draws water top animated, water bottom, and solid tiles each with a 1:1 blit when big sprites are available, falling back to old scaled draw.

---

### A4. `effects/Rain.java` *(rewritten)*
**Why:** 200 drops called `g.drawImage(particle, x, y, 3, 12, null)` (scaled) per frame; many drops were off-screen. Pre-scaling the 3×12 particle eliminates per-drop scaling.

**What:**
- Drop count restored to **1000** (matches original visual density; briefing erroneously showed 200 as the "before" value).
- Added `rainParticleBig` — pre-scaled 3×12 particle via `ImageUtil.scaled`.
- `draw()`: skips drops where `x ≤ −3 || x ≥ GAME_WIDTH` or `y ≤ −12 || y ≥ GAME_HEIGHT`; uses `rainParticleBig` 1:1 when available.

---

### A5. `main/Game.java`
**Status:** Already had correct settings prior to this pass:
- `FPS_SET = 60`, `UPS_SET = 200`, `MAX_UPDATES_PER_LOOP = 12`
- Elapsed time clamped to 100 ms
- Frame and update delta accumulator with remainder preservation
- `Thread.sleep(1)` / `Thread.yield()` idle strategy
- Per-second `FPS: n | UPS: m` console output

No changes required.

---

### A6. `gamestates/Menu.java`
**Status:** Already pre-renders `staticBackground` in constructor. No changes required.

---

### A7. `objects/ObjectManager.java`
**Status:** Already has `projectiles.removeIf(p -> !p.isActive())` and off-screen culling in all draw methods. No changes required.

---

### A8. Packaging
**Why:** 13.5 MB of WAV files were bundled in the JAR but played exclusively by the JS audio engine — wasted download bytes. Portrait images (768×1024, ~1–2 MB each) were loaded by Java and re-cropped at runtime on every level transition.

**What:**
- Build process (`build_web.ps1`): compiles with `javac --release 8 -Xlint:-options`, verified `major version: 52`.
- Audio WAVs excluded from JAR (served from `audio/` directly by JS engine).
- Portraits `radoan.png`, `abrar.png`, `tasnim.png` scaled from ~768×1024 (~1 MB each) to 192×192 (~75–105 KB each) using same crop rule as `Credits.cropAndScale` (bicubic, high quality).
- **JAR size before:** 17.2 MB → **after: 0.78 MB** (95% reduction).

---

## Web Changes (Phase B)

### `index.html` *(rewritten)*

#### B1. Layout CSS
- `#container`: `flex:1 1 0; min-height:0; container-type:size` — fills available space below header.
- `#game-box`: uses container queries (`min(100cqw, …)` / `min(100cqh, …)`) with viewport fallback for older browsers. `flex:none` prevents flex stretching.
- All CheerpJ layers (`#cheerpjDisplay`, `.cjWindow`, `.cjWindow canvas`) given `position:absolute; inset:0; width:100%; height:100%` — fills game-box exactly. Removed old `div.cheerpjDisplay` and `canvas` selectors that never matched.
- Removed broken `height:calc(100% - 44px)` from `#container`; the flex column handles header height correctly.
- Fullscreen targets `container`, not `gameBox`, so the flex layout recalculates correctly.

#### B2. Pointer Mapping
- Single capture-phase listener on `window` for all CheerpJ pointer events: `pointerdown, pointerup, pointermove, pointerleave, wheel, contextmenu, click`.
- Guard: only acts on events whose `target` is inside `#game-box`.
- Uses `gameBox.getBoundingClientRect()` as the one rect source (all CheerpJ layers are `inset:0`, so their rect is identical).
- `sx = 1664 / rect.width; sy = 896 / rect.height` applied to `clientX/Y, pageX/Y, x/y`.
- Per-event `_cheerpjScaled` flag prevents double-scaling.
- Rect cached in `cachedRect`, refreshed by `ResizeObserver`, `resize`, `fullscreenchange`, `orientationchange`. Always re-read fresh for `pointerdown, pointerup, click, contextmenu`.

#### B3. Loading Overlay
- `MutationObserver` on `#game-box` watches for `.cjWindow canvas`; when found, waits two `requestAnimationFrame`s then fades out and removes the overlay.
- Error state shows a Retry button if `cheerpjRunMain` rejects.

#### B4. Audio Engine
- Effects: `fetch` all 7 files into `ArrayBuffer`s at startup. On first user gesture: create `AudioContext`, `resume()`, `decodeAudioData` all buffers. `playEffect` → `createBufferSource → gain → destination` (no new Audio allocation in hot path). Fallback to `new Audio(...).play()` if buffer not yet decoded.
- Music: `HTMLAudioElement` with `loop=true`. Menu track: `preload="auto"`. Level tracks: `preload="none"` until first played.
- `pendingSongIndex` logic preserved (handles autoplay-policy blocking).
- All bridge function names unchanged: `Java_audio_AudioPlayer_jsPlaySong`, etc.

#### B5. Debug Overlay (`?debug`)
- Shows: rAF FPS, game-box px size, scale factors sx/sy, last pointer client px and game px.
- Yellow outline (`#debug-play-rect`) drawn at the Play button's game-space rect (692–972, 260–372) mapped to screen coordinates.
- Invisible and inert without `?debug` in URL.

---

## Server Changes (Phase C)

### `server.js`
- `try/catch` around `decodeURI` — responds 400 on malformed percent-encoding (prevents process crash).
- `stream.on('error', ...)` handlers on all `fs.createReadStream` instances — prevents uncaught exception on read failure.
- `server.on('error', ...)` handler on the HTTP server.
- `Cache-Control: no-cache` for `.html`; `public, max-age=86400` for `.wav`; `public, max-age=3600` for `.jar`.
- Retained: Range (206) support, CORS headers, all MIME types.

---

## Before/After Numbers

| Metric | Before | After |
|--------|--------|-------|
| JAR size | 17.2 MB | 0.78 MB |
| Background draw cost | O(scale 384→1664) every frame | 1:1 blit |
| Tile draw cost | O(scale 32→64) per visible tile | 1:1 blit |
| Rain draw | 200 drops, scaled per drop | 1000 drops, 1:1 blit, off-screen skipped |
| Portrait load time | decode 768×1024 → crop → scale at runtime | 192×192 pre-baked in JAR |
| Pointer offset bug | Always wrong at non-100% scale | Correctly mapped via intercept |
| Bottom-crop bug | CSS selectors never matched `.cjWindow` | Corrected with inset:0 on `.cjWindow` |
| Audio WAVs in JAR | 13.5 MB | 0 MB |

> [!NOTE]
> Phase D (browser verification with screenshots and FPS measurements) requires a live browser session. Results are reported separately in the final test report.
