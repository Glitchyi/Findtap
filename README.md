# FindTap

Keyboard-driven search and click for any webpage. Trigger the palette, type a few characters, press a number — done.

![Chrome](https://img.shields.io/badge/Chrome-109+-4285F4?logo=googlechrome&logoColor=white)
![Firefox](https://img.shields.io/badge/Firefox-109+-FF7139?logo=firefox&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853)

---

## How it works

1. Press **`Cmd/Ctrl+Shift+F`** on any page
2. Type to fuzzy-search visible interactive elements
3. Press the badge number — or **Enter** for the top result

Badges anchor to the top-left corner of each matched element. The top result gets a red outline and glow; the rest are blue. No mouse needed.

---

## Install

### Chrome (unpacked)
1. `npm run build:chrome`
2. Go to `chrome://extensions` → enable **Developer mode**
3. **Load unpacked** → select `dist/chrome/`

### Firefox (unpacked)
1. `npm run build:firefox`
2. Go to `about:debugging#/runtime/this-firefox`
3. **Load Temporary Add-on** → select `dist/firefox/manifest.json`

---

## Build

```sh
npm run build:chrome      # → dist/chrome/
npm run build:firefox     # → dist/firefox/

npm run package           # builds + zips both browsers
npm run package:chrome    # → dist/chrome-packed/findtap-chrome.zip
npm run package:firefox   # → dist/firefox-packed/findtap-firefox.xpi
```

---

## Settings

Click the FindTap toolbar icon to open settings:

| Setting | Default | Description |
|---|---|---|
| Max results | 5 | How many badges to show at once (3–10) |
| Enter selects top result | On | Press Enter to click the highest-ranked match |

To change the keyboard shortcut:
- **Chrome** — click **Change shortcut** in settings
- **Firefox** — click **Open Add-ons page** → gear icon → Manage Extension Shortcuts

---

## Architecture

```
background.js      service worker / event page — shortcut relay, CSS injection
content.js         entry point, state machine
collector.js       DOM traversal, visibility + viewport guards
fuzzy.js           pure scorer: prefix > consecutive runs > word boundaries
overlay.js         two-layer DOM: palette (#findtap-root) + badges (#findtap-hint-layer)
highlighter.js     findtap-active / findtap-active-primary class lifecycle
dispatcher.js      MouseEvent dispatch → el.click() fallback
injected.js        addEventListener patch (MAIN world) — fallback candidate source
```

Two fixed layers are injected into `document.body` on activation and removed on dismiss:

- **`#findtap-root`** — the search palette (interactive)
- **`#findtap-hint-layer`** — numbered badges only (pointer-events: none)

Badge positions use raw `getBoundingClientRect()` values with no scroll offset — both layers are `position: fixed` so viewport coordinates map directly.

---

## Browser notes

| Feature | Chrome | Firefox |
|---|---|---|
| Background | Service Worker (`service_worker`) | Event page (`scripts`) |
| Shortcut deep-link | `chrome://extensions/shortcuts` | `about:addons` + manual nav |
| Packaged format | `.zip` (Chrome Web Store) | `.xpi` (AMO) |

---

## Dev

```sh
npm test          # build:chrome + Playwright suite
```

Tests live in `tests/` against static HTML fixtures in `tests/fixtures/`. Playwright loads the actual unpacked extension — no API mocking.
