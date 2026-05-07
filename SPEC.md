# FindTap — Browser Extension Product Spec

> Version: 0.5 | Status: Active Development
> Extension name: **FindTap** (was KeyClick in earlier drafts — all references updated)

---

## 1. Overview

**FindTap** is a Chrome MV3 extension that lets users search and click any visible interactive element on a webpage using only the keyboard.

Trigger `Cmd/Ctrl+Shift+F` → a dark floating search palette appears centered at the top of the viewport → type to fuzzy-search → up to N numbered badges appear anchored to matched elements → press a number key (or Enter for #1) to fire the click.

### Design Decisions (Locked)

| Decision | Choice |
|---|---|
| Extension name | FindTap |
| Fuzzy matcher | Custom lightweight pure function in `fuzzy.js` |
| Element scope | Semantic selectors primary, addEventListener patch as fallback |
| Click dispatch | `dispatchEvent(new MouseEvent(...))` always; `el.click()` last resort |
| Result count | User-configurable via options page (default: 5, range: 3–10) |
| Result UI | Badges on page only — no list inside the palette |
| Palette contents | Search input only |
| Badge anchor | Top-left corner of matched element's bounding box |
| Badge positioning | Raw `rect.top` / `rect.left` (viewport coords) — **no scroll offset** |
| Highlight | `findtap-active` class on matched elements; `findtap-active-primary` on #1 |
| Viewport scope | Viewport-first; expand to full page to fill remaining slots if under `maxResults` |
| Manifests | Single base + per-browser patch script (`build/patch.js`) |
| Build output | `dist/chrome/` (dev/unpacked), `dist/chrome-packed/findtap-chrome.zip` (release) |
| Testing | Playwright against static HTML fixtures |

### Visual Design (Cursor-inspired Slate theme)

| Token | Value |
|---|---|
| Background (root/palette) | `#111317` |
| Surface (input) | `#1b1f27` |
| Border | `#303642` |
| Input border | `#3a4250` |
| Palette/input border width | `1px` |
| Text | `#e6e8ee` |
| Placeholder | `#8b929f` |
| Badge color (2–N) | `#5cc8ff` |
| Badge color (1 / Enter) | `#c0392b` (red) |
| Outline color (2–N) | `#5cc8ff` |
| Outline color (1 / Enter) | `#e74c3c` with controlled red glow |
| Matched-element outline width | `2px` |
| Matched-element corner radius | `6px` |
| Badge corner radius | `6px` |
| Motion | Subtle 120–140ms ease-out fade/scale; disabled under `prefers-reduced-motion: reduce` |
| Font | Inter if available locally, otherwise system UI sans-serif |

### Non-Goals (v0.1)
- Shadow DOM traversal
- Cross-origin iframe support
- Firefox (deferred — build script exists, not packaged)
- AI-powered ranking
- Mobile browser support
- Arrow/Tab navigation through results

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      Browser Tab                          │
│                                                          │
│  ┌───────────────────────────────────────────────────┐   │
│  │          Content Script  (ISOLATED world)          │   │
│  │                                                   │   │
│  │  content.js    → entry point, keyboard state      │   │
│  │  collector.js  → DOM traversal + text extraction  │   │
│  │  fuzzy.js      → score + rank candidates          │   │
│  │  overlay.js    → palette + badge DOM management   │   │
│  │  highlighter.js→ findtap-active class lifecycle   │   │
│  │  dispatcher.js → fire clicks via dispatchEvent    │   │
│  └───────────────────────────────────────────────────┘   │
│                                                          │
│  ┌───────────────────────────────────────────────────┐   │
│  │     Injected Script  (MAIN world)  [fallback]      │   │
│  │                                                   │   │
│  │  injected.js → patches addEventListener           │   │
│  │                WeakSet + array of tracked nodes   │   │
│  │                reports via CustomEvent            │   │
│  └───────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
              │  chrome.runtime messaging
              ▼
┌──────────────────────────┐
│  Background Service Worker│
│  Shortcut registration    │
│  Message relay to tab     │
└──────────────────────────┘
```

### Module Responsibilities

| Module | Role | World |
|---|---|---|
| `background.js` | Shortcut registration, message relay | Service Worker |
| `content.js` | Entry point, keyboard state machine | ISOLATED |
| `collector.js` | DOM traversal, visibility, text extraction | ISOLATED |
| `fuzzy.js` | Pure scorer + ranking | ISOLATED |
| `overlay.js` | Palette + badge layer mount/unmount/render/reposition | ISOLATED |
| `highlighter.js` | `findtap-active` / `findtap-active-primary` lifecycle | ISOLATED |
| `dispatcher.js` | Click dispatch | ISOLATED |
| `injected.js` | `addEventListener` monkey-patch (fallback only) | MAIN |
| `options/options.js` | `chrome.storage.sync` read/write | Options page |

---

## 3. Data Flow

### 3.1 Activation

```
User presses Cmd/Ctrl+Shift+F
        │
        ▼
background.js: chrome.commands.onCommand('toggle-palette')
        │
        ▼
chrome.tabs.sendMessage → { action: "TOGGLE" }
        │
        ▼
content.js:
  ├─ If ACTIVE → deactivate() (toggle off)
  └─ If INACTIVE → activate():
       1. chrome.storage.sync.get('maxResults')
       2. chrome.runtime.sendMessage({ action: 'INJECT_CSS' })
          → background injects styles/overlay.css via chrome.scripting.insertCSS
       3. overlay.mount() → returns <input> ref
       4. Attach: keydown (capture), resize, scroll, pointerdown, input
       5. setupMutationObserver()
       6. collectAndRender('')
```

### 3.2 Candidate Collection — Primary (Semantic)

```
collector.js: collectSemanticCandidates(maxResults)
        │
        ├─ detect active modal/dialog scope:
        │     dialog[open], [aria-modal="true"], [role="dialog"], [role="alertdialog"]
        │     If one or more visible modal scopes exist, collect only inside the topmost modal
        │     If no visible modal scope exists, collect from document
        ├─ querySelectorAll(SEMANTIC_SELECTORS) within the active scope
        ├─ isVisible(el):
        │     offsetParent !== null
        │     computed visibility !== 'hidden'
        │     computed display !== 'none'
        │     getBoundingClientRect() width >= 8 AND height >= 8
        │     rect.width * rect.height >= 400
        │     element is not inside #findtap-root
        ├─ isTopmostCandidate(el):
        │     document.elementFromPoint() at center/corners resolves to el or a descendant
        │     Background controls covered by a modal/backdrop are excluded
        ├─ isInViewport(el):
        │     rect.top < innerHeight AND rect.bottom > 0
        │     rect.left < innerWidth  AND rect.right  > 0
        │
        └─ Pass 1: viewport-visible only → results[]
             If results.length < maxResults:
               Pass 2: isVisible only (full page, no viewport check)
               Mark: { origin: 'viewport' | 'page' }
```

Minimum clickable size is intentionally permissive: hamburger menus and icon buttons around `24px × 24px` remain valid, while tiny dots, tracking pixels, resize handles, and accidental micro-targets are excluded.

When a modal/dialog is active, FindTap searches the modal first and ignores covered background content. This keeps queries such as "install" targeted to the visible modal action instead of the dimmed page button that opened it. Modal scope applies equally to semantic candidates and fallback listener candidates.

### 3.3 Candidate Collection — Fallback (Event Listeners)

```
injected.js at document_start (MAIN world):
  Patches EventTarget.prototype.addEventListener
  Tracked events: click, mousedown, mouseup
  Stores refs in WeakSet (dedup) + trackedElements[]

content.js: collectAndRender()
  ├─ Tears down any previous stale boundListenerMap listener
  ├─ Registers new boundListenerMap on 'findtap:listenerMap'
  ├─ Dispatches 'findtap:requestListeners' (synchronous chain to injected.js)
  ├─ injected.js responds synchronously with live elements
  ├─ boundListenerMap fires:
  │     e.detail?.elements || []   ← optional chain guards null detail
  │     mergeFallbackCandidates(semanticCandidates, fallbackEls ?? [])
  │     handleInput(query)
  │     removes own listener, nulls boundListenerMap
  └─ 50ms safety timeout:
       If boundListenerMap still set (injected.js silent or blocked):
         remove listener, render with semantic candidates only
```

### 3.4 Text Extraction (per candidate)

```
Priority — first non-empty string wins:
  1. el.innerText                    (trimmed)
  2. el.getAttribute('aria-label')
  3. el.getAttribute('placeholder')
  4. el.getAttribute('title')
  5. el.value
  6. el.querySelector('img')?.getAttribute('alt')
  7. el.getAttribute('name')

All empty → element excluded from candidate list
```

### 3.5 Fuzzy Match & Ranking

```
fuzzy.js: score(query, text) → float [0.0–1.0]

  - Query chars must appear in order in text
  - Exact prefix match             → 1.0
  - Consecutive run bonus          ('bil' in 'Billing' scores higher)
  - Word boundary bonus            (match at word start scores higher)
  - No subsequence match           → 0.0

On each input event (debounced 150ms):
  If empty query:
    take first maxResults candidates as-is, _score: 0
  Else:
    score all → filter > 0 → sort DESC → slice maxResults
  → overlay.render(rankedCandidates)
  → highlighter.apply(rankedCandidates)
```

### 3.6 Overlay DOM Structure

One fixed root is injected into `document.body`; the badge layer and palette are siblings inside that root:

```html
<div id="findtap-root">
  <!-- Layer 1: hint badges only — never intercepts clicks -->
  <div id="findtap-hint-layer">
    <div class="findtap-hint" data-index="1" style="top: Xpx; left: Ypx;">1</div>
    <div class="findtap-hint" data-index="2" style="top: Xpx; left: Ypx;">2</div>
    <!-- … up to maxResults -->
  </div>

  <!-- Layer 2: palette only — interactive -->
  <div id="findtap-palette">
    <input id="findtap-input" type="text" autocomplete="off" spellcheck="false" placeholder="Search…" />
  </div>
</div>
```

**Why nested layers:** Keeps the interactive palette DOM separate from the purely-visual badge layer while making both children of `#findtap-root`. This lets the MutationObserver ignore extension-owned badge mutations via the existing `root.contains(m.target)` guard, preventing self-triggered re-renders that clear badges.

Layering contract:
- `#findtap-root` and `#findtap-palette` must always be the top extension UI at `z-index: 2147483647`.
- `#findtap-hint-layer` and `.findtap-hint` must also use `z-index: 2147483647` so number badges are never hidden by page content.
- `overlay.mount()` appends `#findtap-hint-layer` before `#findtap-palette` inside `#findtap-root`; with equal max z-index values, this keeps the search palette above the badge layer by DOM paint order.
- The search input must keep focus and remain visually above badges/highlights while FindTap is active.

### 3.7 Badge Positioning

```
rect = el.getBoundingClientRect()

badge.style.top  = max(0, rect.top)  + 'px'  ← top-left corner, viewport-clamped
badge.style.left = max(0, rect.left) + 'px'
```

Both `#findtap-root` and `#findtap-hint-layer` are `position: fixed` — their coordinate space IS the viewport. Adding `window.scrollY`/`window.scrollX` (document coords) is wrong and causes badges to drift when the page is scrolled.

Badges must always be generated for every visible ranked candidate:
- Numbers are placed at the clickable element's top-left bounding-box corner.
- Placement is clamped to the viewport so badges never disappear above or left of the fixed root.

Visibility guard in `render()` — badge is skipped if:
- `rect.width === 0 || rect.height === 0`
- `rect.bottom < 0 || rect.top > window.innerHeight`
- `rect.right < 0 || rect.left > window.innerWidth`

`reposition()` is called on `window.resize` and `window.scroll` to recompute live positions.

### 3.8 Highlight Lifecycle

```
highlighter.js: apply(rankedCandidates[])
  clear()
  For each ranked candidate in order:
    apply findtap-active; if i = 0 also apply findtap-active-primary
    Push element to activeElements[]

highlighter.js: clear()
  For each el in activeElements[]:
    el.classList.remove('findtap-active', 'findtap-active-primary')
  activeElements = []
```

> ⚠️ `clear()` **must be called** before every `apply()`, on dismiss, on click, and on any error path.
> A leaked class on a host element is a silent bug that can break the page's own styles.

### 3.9 Selection & Click

```
User presses [1–N] or Enter (fires candidate[0])
        │
        ▼
highlighter.clear()
overlay.unmount()          ← removes #findtap-root, including #findtap-hint-layer
MutationObserver.disconnect()
removeListeners()
state = 'INACTIVE'
        │
        ▼
dispatcher.dispatch(el):
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.focus()
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  document.activeElement?.blur()
  ← throws → fallback: el.click()
```

### 3.10 Dismissal

```
Esc  OR  pointerdown outside #findtap-root
        │
        ▼
highlighter.clear()
overlay.unmount()          ← removes #findtap-root and all extension-owned visual layers
MutationObserver.disconnect()
clearTimeout(debounceTimer)
removeListeners()
candidates = []
rankedCandidates = []
state = 'INACTIVE'
```

---

## 4. Semantic Selectors

```javascript
const SEMANTIC_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="treeitem"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');
```

---

## 5. CSS (injected via `chrome.scripting.insertCSS`)

```css
/* Layer 1: palette root */
#findtap-root {
  position: fixed; inset: 0;
  overflow: hidden; pointer-events: none;
  z-index: 2147483647;
}

/* Layer 2: badge-only layer */
#findtap-hint-layer {
  position: fixed; inset: 0;
  overflow: hidden; pointer-events: none;
  z-index: 2147483647;
}

/* Palette shell */
#findtap-palette {
  position: absolute; top: 12px; left: 50%;
  transform: translateX(-50%);
  pointer-events: all;
  z-index: 2147483647;
  background: #111317; border: 1px solid #303642; border-radius: 10px;
  padding: 8px; min-width: 320px;
  box-shadow: 0 18px 48px rgba(0,0,0,.42);
  font-family: 'Inter', system-ui, sans-serif;
  animation: findtap-palette-in 120ms ease-out both;
}

/* Palette input */
#findtap-input {
  width: 100%;
  background: #1b1f27; border: 1px solid #3a4250; border-radius: 7px;
  color: #e6e8ee;
  font-size: 14px; font-family: 'Inter', system-ui, sans-serif;
  padding: 6px 10px; outline: none; box-sizing: border-box;
}

/* Badges 2–N: blue */
.findtap-hint {
  position: absolute; pointer-events: none;
  background: #5cc8ff; color: #081018;
  font-size: 11px; font-weight: 700;
  padding: 2px 6px; border-radius: 6px;
  animation: findtap-hint-in 120ms ease-out both;
  z-index: 2147483647;
}

/* Badge 1 (Enter target): red + glow */
.findtap-hint[data-index="1"] {
  background: #c0392b; color: #fff; font-weight: 900;
  box-shadow: 0 0 6px 2px rgba(231,76,60,.7), 0 0 12px 4px rgba(231,76,60,.28);
}

/* Element outlines 2–N: blue */
.findtap-active {
  outline: 2px solid #5cc8ff !important;
  outline-offset: 2px !important;
  border-radius: 6px !important;
  animation: findtap-highlight-in 140ms ease-out both !important;
}

/* Element outline 1 (primary): red + glow */
.findtap-active-primary {
  outline: 2px solid #e74c3c !important;
  outline-offset: 2px !important;
  border-radius: 6px !important;
  box-shadow: 0 0 8px 2px rgba(231,76,60,.62), 0 0 16px 4px rgba(231,76,60,.24) !important;
}

@keyframes findtap-palette-in {
  from { opacity: 0; transform: translateX(-50%) translateY(-4px) scale(.98); }
  to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
}

@keyframes findtap-hint-in {
  from { opacity: 0; transform: scale(.88); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes findtap-highlight-in {
  from { box-shadow: 0 0 0 0 rgba(92,200,255,0); }
  to { box-shadow: 0 0 0 2px rgba(92,200,255,.18); }
}

@media (prefers-reduced-motion: reduce) {
  #findtap-palette,
  .findtap-hint,
  .findtap-active {
    animation: none !important;
  }
}
```

---

## 6. Keyboard Contract

| Key | Action |
|---|---|
| `Cmd/Ctrl+Shift+F` | Toggle palette on/off |
| `Enter` | Click candidate #1 (highest ranked) |
| `1` – `N` | Click the Nth matched element immediately |
| `Esc` | Dismiss, no action, restore page state |
| Any printable character | Routes to `#findtap-input` |

> All key events while palette is open call `stopPropagation()`.

---

## 7. Configuration (Options Page)

Stored in `chrome.storage.sync`:

| Key | Type | Default | Range |
|---|---|---|---|
| `maxResults` | `number` | `5` | `3–10` |
| `enterSelectsFirst` | `boolean` | `true` | `true` / `false` |

Options page (`options/options.html`):
- Must use the same Cursor-inspired Slate theme as the palette: `#111317` page background, `#1b1f27` controls, `#303642` borders, `#e6e8ee` text, cyan action accents, and red only for primary FindTap emphasis.
- Must keep the settings UI compact because Chrome renders it inside the extension details modal.
- Must include a branded header, keyboard shortcut section, `maxResults` number input, `enterSelectsFirst` toggle, save/status affordance, and a note that settings sync locally through browser extension storage.
- Must not add new storage keys without updating this section and getting approval.

---

## 8. Build System

```
manifest.base.json           ← shared: permissions, commands, content_scripts
manifest.chrome.patch.json   ← Chrome: minimum_chrome_version
manifest.firefox.patch.json  ← Firefox: browser_specific_settings, gecko id
build/patch.js               ← deep-merges base + patch, inlines ES modules → dist/
build/package.js             ← builds chrome then zips dist/chrome/ → dist/chrome-packed/findtap-chrome.zip
```

### npm scripts

```
npm run build:chrome    → node build/patch.js chrome
npm run build:firefox   → node build/patch.js firefox
npm run test:e2e:chrome → build:chrome + Playwright real-extension tests
npm run test:security   → Playwright static security checks
npm run package         → node build/package.js
npm test                → build:chrome + playwright
```

### Bundle strategy

`build/patch.js` inlines all ES modules into a single classic `content.js` (no bundler dependency):
- Strips `export` / `import` keywords via regex
- Concatenates: `fuzzy.js` → `collector.js` → `highlighter.js` → `dispatcher.js` → `overlay.js` → `content.js`
- Copies: `background.js`, `injected.js`, `styles/`, `options/` verbatim

### Output structure

```
dist/
├── chrome/                  ← unpacked extension (load via chrome://extensions)
│   ├── manifest.json
│   ├── content.js           ← bundled single file
│   ├── background.js
│   ├── injected.js
│   ├── styles/overlay.css
│   └── options/
└── chrome-packed/
    └── findtap-chrome.zip   ← submit to Chrome Web Store
```

Build output hygiene:
- `build/patch.js` must recreate `dist/<browser>/` from scratch on every build.
- Unpacked output must contain only: `manifest.json`, bundled `content.js`, `background.js`, `injected.js`, `styles/`, and `options/`.
- Stale source modules such as `collector.js`, `fuzzy.js`, `overlay.js`, `highlighter.js`, `dispatcher.js`, or old loader files must never remain in `dist/<browser>/`.
- Local Playwright output directories such as `test-results/` and `playwright-report/` are generated artifacts and must stay out of version control.

---

## 9. Manifest

```json
{
  "manifest_version": 3,
  "name": "FindTap",
  "version": "0.1.0",
  "permissions": ["activeTab", "scripting", "storage"],
  "host_permissions": [],
  "commands": {
    "toggle-palette": {
      "suggested_key": { "default": "Ctrl+Shift+F", "mac": "Command+Shift+F" },
      "description": "Toggle FindTap palette"
    }
  }
}
```

---

## 10. Security Baseline

FindTap is a local-only extension. It must not collect, transmit, or persist page content, URLs, or user behavior.

Mandatory security rules:
- No network calls: no `fetch`, XHR, WebSocket, remote CSS imports, remote fonts, analytics, beacons, or external assets.
- No dynamic code execution: no `eval()` and no `new Function()`.
- No page-content/user-behavior/URL logging in production content scripts.
- Styles are injected only through `chrome.scripting.insertCSS`; no `<style>` tags and no inline style attributes for extension stylesheet injection.
- Cross-world communication uses `CustomEvent` on `document` only; do not introduce `window.postMessage` or another bridge.
- Storage is limited to documented options keys: `maxResults` and `enterSelectsFirst`.
- Manifest permissions stay minimal: `activeTab`, `scripting`, and `storage`; `host_permissions` remains `[]`.
- Content-script URL matching is broad so the launcher can work on arbitrary pages, but this must not be expanded into broad `host_permissions`.

Automated security checks must assert:
- No forbidden network primitives or remote imports in source.
- No dynamic code execution in source.
- No undocumented `chrome.storage.sync` keys.
- Manifest permissions and `host_permissions` match this section.
- Built unpacked extension output contains only expected files.

---

## 11. Edge Cases & Known Handling

| Scenario | Handling |
|---|---|
| SPA DOM mutation | `MutationObserver` on `document.body` → re-collect + re-render (rAF-debounced) |
| `findtap-active` on mutated-away element | `clear()` called before every re-render |
| Element gone between scan and click | try/catch in `dispatcher.dispatch`; fallback `el.click()` |
| Viewport results < `maxResults` | Auto-expand to full page (Pass 2 in collector) |
| Active modal/dialog | Search only the topmost visible modal scope; exclude background controls hidden by the modal/backdrop |
| Occluded clickable element | Excluded unless `elementFromPoint()` at a representative point resolves to the candidate or its descendant |
| Zero results | Palette stays open, no badges rendered, no host classes applied |
| Icon-only buttons | `aria-label` → `alt` → `name`; excluded if all empty |
| CSP blocks style injection | `chrome.scripting.insertCSS` — never inline style attributes |
| `e.detail` null on `findtap:listenerMap` | Optional chain `e.detail?.elements \|\| []` + null-coalesce in `mergeFallbackCandidates` |
| Stale `boundListenerMap` from rapid MutationObserver | Torn down at start of each `collectAndRender` call |
| injected.js blocked (CSP / no MAIN world) | 50ms timeout fires, renders semantic candidates only |
| Badge scroll drift | Fixed: use raw `rect.top`/`rect.left` (no scroll offset) inside fixed container |
| Off-screen badges | Skipped in `render()` via full viewport bounds check |
| Badge clips behind `overflow: hidden` parent | Accepted v0.1 limitation |
| Window resize/scroll while open | `reposition()` called via listeners — recomputes all badge positions |
| Cross-origin iframes | Excluded |
| Same-origin iframes + Shadow DOM | Deferred to v0.2 |
| Shortcut conflict | Browser commands API; user resolves via `chrome://extensions/shortcuts` |

---

## 12. Testing Strategy

```
tests/fixtures/
├── basic.html           — <a>, <button>, <input>, <select>
├── spa-delegate.html    — delegated click handlers
├── dynamic.html         — MutationObserver: elements added/removed
├── viewport.html        — mix of viewport and off-screen elements
├── icon-buttons.html    — aria-label only
├── disabled.html        — disabled elements (must be excluded)
├── highlight.html       — findtap-active applied + cleaned up correctly
└── deep-nested.html     — deeply nested clickable elements
```

Stack: Playwright (Chromium), actual unpacked extension via `--load-extension`, no API mocking.

Chromium real-extension tests:
- Build `dist/chrome/` before test launch.
- Launch Chromium with a persistent context using `--disable-extensions-except=dist/chrome` and `--load-extension=dist/chrome`.
- Resolve the MV3 extension id from the service worker.
- Open static fixtures and activate the real extension through runtime messaging or an equivalent command path.
- Assert behavior against the real content script, overlay, highlighter, dispatcher, storage, and injected CSS.
- In automated direct-message activation, `activeTab` is not granted the same way as a real browser command; tests validate overlay behavior and stylesheet contents, while command-granted `chrome.scripting.insertCSS` remains a manual smoke check unless the harness can trigger browser commands reliably.

Firefox automation:
- `npm run build:firefox` is required to validate Firefox build output.
- Full Firefox browser automation is deferred because Playwright's extension-loading path is Chromium-oriented; Firefox E2E requires a separate `web-ext` / WebDriver strategy.

| Area | Type |
|---|---|
| `fuzzy.js` scorer | Unit |
| Viewport-first collection | Playwright fixture |
| Modal-scoped collection | Playwright inline fixture |
| `findtap-active` add + cleanup | Playwright fixture |
| Badge top-left positioning (no scroll drift) | Playwright + getBoundingClientRect assertion |
| Keyboard 1–N + Enter triggers correct element | Playwright key sequence |
| Dismiss: all classes and DOM cleaned up | Playwright assertion |
| `maxResults` persistence | Playwright + storage read |
| Real extension activation/click/dismiss | Playwright Chromium persistent context |
| Security baseline | Static Playwright checks |
