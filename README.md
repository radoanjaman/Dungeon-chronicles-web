# Dungeon Chronicles — Web Edition

A Java Swing platformer built with CheerpJ 4.3 (WebAssembly), playable directly in the browser.

## Quick Start (Local)

```bash
cd dungeon-chronicles-web
node server.js
# Then open http://localhost:8080/ in your browser
```

Requires Node.js ≥ 14. No other dependencies.

## Troubleshooting & Caching

> [!IMPORTANT]
> **If the picture is cropped or buttons appear misaligned:**
> Make sure you open the page served by `node server.js` and hard-refresh (**Ctrl+Shift+R** or **Cmd+Shift+R**). CheerpJ and the browser cache the `.jar` and HTML aggressively.

## How Fit & Scaling Works

The game runs at a logical fixed resolution of **1664×896** CSS px. To support any viewport size and Windows display scaling (125%, 150%, etc.) without clipping, blurriness, or CheerpJ internal re-layout:

1. **Fixed Native Stage**: `#stage` maintains a constant layout size of 1664×896 px. CheerpJ attaches directly to `#stage`, ensuring its internal `ResizeObserver` never triggers and Swing layout never shrinks.
2. **Uniform CSS Transform**: A responsive `#viewport` container calculates a single uniform scale factor `scale = Math.min(containerW / 1664, containerH / 896)` and applies `transform: scale(scale)` to `#stage` with origin `(0, 0)`. Letterboxing/pillarboxing is automatically centered with symmetric black bars.
3. **Capture-Phase Pointer Intercept**: CheerpJ computes mouse coordinates as `floor(event.clientX - displayRect.left)`. Under CSS transform, `displayRect` is visually scaled. We intercept all pointer events (`pointerdown`, `pointerup`, `pointermove`, `wheel`, `click`, etc.) in the capture phase, scaling `clientX`/`clientY` back to native 1664×896 coordinates before CheerpJ reads them.

## Debug Mode

Append `?debug` to the URL to show a real-time diagnostic HUD:
- Device Pixel Ratio (DPR)
- Container dimensions
- Active scale factor
- Real-time pointer positions (screen CSS px and mapped game px)
- rAF-measured FPS
- Yellow bounding outline mapped directly over the PLAY button to visually verify hit-test alignment.

Example: `http://localhost:8080/?debug`

## Controls

| Key | Action |
|-----|--------|
| A / ← | Move Left |
| D / → | Move Right |
| W / ↑ / Space | Jump |
| F / Left Click | Attack |
| Right-click | Power Attack |
| Esc | Pause |
| Mouse Wheel | Scroll Credits |

## Architecture

```
Browser
  ├─ index.html       — Viewport/stage architecture, pointer mapping, audio engine, CheerpJ init
  ├─ server.js        — Node HTTP server with Range (206) support and security headers
  ├─ dungeon-chronicles.jar — Java game (CheerpJ WASM, bytecode major version 52)
  └─ audio/           — WAV audio assets streamed to Web Audio context
```
