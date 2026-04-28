# AGENTS.MD — KeyClick Browser Extension

> Version: 0.3 | Governs all AI coding agents on this codebase.
> Read this file in full before touching anything. Then read SPEC.md.

---

## 1. Project Context

KeyClick is a Manifest V3 browser extension (Chrome + Firefox). It provides a keyboard-driven search palette for finding and clicking interactive elements on any webpage.

**Design reference:** Acme Dashboard mockup — dark palette centered at viewport top, numbered badges anchored to top-left of matched elements, `keyclick-active` class applied to matched host elements.

- **Spec:** `SPEC.md` — read every session before starting work
- **Stack:** Vanilla JS, ES modules, no framework, no bundler (except `build/patch.js`)
- **Tests:** `tests/` directory in this repo — Playwright + static HTML fixtures under `tests/fixtures/`
- **No backend. No network calls. No data collection. Ever.**

---

## 2. Hard Rules — STOP and Ask Before Touching

If a task requires any of the following, **stop, explain why it's needed, and wait for explicit creator approval before writing a single line.**

### Protected Files

| File | Why |
|---|---|
| `manifest.base.json` / `manifest.*.patch.json` | Permissions and commands affect security surface |
| `content.js` | Core orchestration — changes cascade everywhere |
| `injected.js` | Prototype mutation — high-risk, must be deliberate |
| Any file that reads/writes `chrome.storage` | User data handling must be intentional |

### Always Prohibited (no approval possible)

- Add `fetch`, XHR, or WebSocket — **no network calls, ever**
- Add `<all_urls>` or any broad host permissions
- Use `eval()` or `new Function()` — violates MV3 CSP
- Collect or log page content, user behaviour, or URLs
- Set overlay `z-index` below `2147483647`
- Merge `content.js` and `injected.js` — world separation is architectural
- Leave `keyclick-active` on any host element after unmount or dismiss

---

## 3. Soft Rules — Confirm Before Deviating

- **Do not refactor** working code unless the task explicitly is a refactor
- **Do not rename or move files** — paths are referenced across modules
- **Do not add build tooling** — only permitted build step is `build/patch.js`
- **Do not add npm dependencies** without justifying bundle size + security
- **Do not introduce any framework** — this is vanilla JS by design
- **Do not create new files** without stating purpose before writing
- **Do not implement an optimisation** outside current task scope — flag it, never act

---

## 4. Pre-Task Checklist

```
[ ] Have I read SPEC.md in full for this session?
[ ] Does this task touch content.js, injected.js, or any manifest file? → STOP, ask
[ ] Does this task add, remove, or rename a module? → Ask first
[ ] Am I adding a dependency? → Justify and ask
[ ] Does this change affect keyclick-active class lifecycle? → Review Section 6 below
[ ] Does this change affect badge positioning? → Review Section 7 below
[ ] Will this behave differently on Firefox vs Chrome? → Call it out explicitly
[ ] Does this affect the keyboard event capture chain? → Flag it
```

---

## 5. File Map & Ownership

```
keyclick/
├── manifest.base.json           ⛔ PROTECTED
├── manifest.chrome.patch.json   ⛔ PROTECTED
├── manifest.firefox.patch.json  ⛔ PROTECTED
├── build/
│   └── patch.js                 ⚠️  Ask before modifying merge logic
├── background.js                ⚠️  Ask if changing shortcut or message protocol
├── content.js                   ⛔ PROTECTED
├── injected.js                  ⛔ PROTECTED
├── collector.js                 ✅ Safe — DOM traversal and text extraction
├── fuzzy.js                     ✅ Safe — pure scoring function, no DOM
├── overlay.js                   ✅ Safe — palette and badge DOM only
├── highlighter.js               ✅ Safe — keyclick-active class lifecycle only
├── dispatcher.js                ✅ Safe — click dispatch logic
├── options/
│   ├── options.html             ✅ Safe
│   └── options.js               ⚠️  Ask before adding new storage keys
└── styles/
    └── overlay.css              ✅ Safe — structural CSS only, no visual design
tests/
├── fixtures/                    ✅ Safe — static HTML fixture files
└── *.spec.js                    ✅ Safe — Playwright test files
```

> "Safe" means: describe what you're changing and why, before writing it.

---

## 6. `keyclick-active` Class Rules (Critical)

This class is applied directly to host page elements via `el.classList.add('keyclick-active')`. It is the highest-risk DOM mutation the extension performs because it modifies the host page's own elements.

### Mandatory lifecycle:

```
APPLY:   highlighter.apply(candidates[]) on every render
CLEAR:   highlighter.clear() BEFORE every re-render
CLEAR:   highlighter.clear() on dismiss (Esc or outside click)
CLEAR:   highlighter.clear() on successful click dispatch
CLEAR:   highlighter.clear() on MutationObserver invalidation
CLEAR:   highlighter.clear() on any error path that exits the palette
```

### Implementation rules:
- `highlighter.js` must maintain an internal `activeElements[]` array of all elements that currently hold the class
- `clear()` must iterate `activeElements[]` and call `el.classList.remove('keyclick-active')` on each — never use `querySelectorAll('.keyclick-active')` as the source of truth (elements may have moved or been removed)
- After `clear()`, `activeElements` must be reset to `[]`
- `keyclick-active` has **no default CSS** — it is a structural hook for the styling pass only
- Agent must write a Playwright test asserting zero `.keyclick-active` elements exist after any dismiss path

---

## 7. Badge Positioning Rules

```javascript
// Always compute from live getBoundingClientRect() — never cache position
const rect = el.getBoundingClientRect();
badge.style.top  = (rect.top  + window.scrollY) + 'px';
badge.style.left = (rect.left + window.scrollX) + 'px';
```

- Anchor is always **top-left corner** of the element — do not offset
- Positions must be recomputed on: every re-render, `window.resize`, `window.scroll`
- Attach resize/scroll listeners when palette opens; remove them on unmount
- Guard against zero-area rects — skip badge if `rect.width === 0 || rect.height === 0`

---

## 8. Architecture Constraints

### World Separation
- All modules except `injected.js` run in ISOLATED world
- `injected.js` runs in MAIN world — cross-world communication via `CustomEvent` on `document` only
- Do not introduce `window.postMessage` or any other channel

### Click Dispatch
- Always: `el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))`
- Fallback only: `el.click()` — only if `dispatchEvent` throws
- Never use `el.click()` as the primary path

### Overlay Injection
- Styles via `chrome.scripting.insertCSS` only — never inline `style=` attributes or `<style>` tags
- All keyclick DOM IDs and classes must use the `keyclick-` prefix

### `fuzzy.js`
- Pure function: `score(query: string, text: string): number`
- No DOM access, no side effects, no state
- Must be unit-testable in isolation (Node, no browser)

---

## 9. Code Standards

- ES2020+, no transpilation
- `const` > `let`, never `var`
- JSDoc on all exported functions
- All `dispatchEvent` / `el.click()` calls: wrapped in try/catch
- All `getBoundingClientRect()` calls: guard against null/zero-area
- All `MutationObserver` callbacks: wrapped in try/catch
- Extension errors must **never** surface as uncaught exceptions on the host page
- After any change: state `Chrome: ✅/❌  Firefox: ✅/❌`

---

## 10. Testing Rules

- Tests live in **`tests/`** in this repo — fixtures under `tests/fixtures/`
- Playwright (Chromium in v0.1), actual unpacked extension via `--load-extension`
- Static HTML fixtures, no API mocking

**Mandatory before any PR:**
- `fuzzy.js` unit tests
- `collector.js` viewport-first + full-page fallback
- `highlighter.js` apply + clear lifecycle (zero leaked classes on all exit paths)
- `dispatcher.js` dispatchEvent fires on framework-style element
- Badge top-left position assertion via `getBoundingClientRect`
- Keyboard 1–N triggers correct element
- All `.keyclick-active` classes removed after Esc, after click, after re-render

---

## 11. Communication Protocol

### Protected file or hard rule triggered:
```
🛑 BLOCK — [file or rule]

Task:            [what I was doing]
Blocker:         [why this area must be touched]
Proposed change: [exactly what I would do]
Risk if wrong:   [one sentence]

Awaiting approval before writing any code.
```

### Non-blocking assumption:
```
⚠️ ASSUMPTION — [what I'm assuming]

Proceeding with: [choice]
Alternative was: [other option]
Revert trigger:  "revert [assumption label]"
```

### Security issue found:
```
🔐 SECURITY NOTE — [title]

Location: [file + line]
Issue:    [one paragraph]
Fix:      [one sentence]

NOT fixing without approval. Logging to SECURITY_NOTES.md. Pausing current task.
```

---

## 12. Creator Fine-Tuning Questions

**Q-A1: Commit granularity?**
> Default: one commit per logical unit (module or bug fix)

**Your answer:** ___

**Q-A2: Run Playwright tests after every change, or only when asked?**
> Default: suggest after every change, don't block on it

**Your answer:** ___

**Q-A3: Flag improvements noticed outside current task scope?**
> Default: yes — in a `## Side-notes` section, never implement unilaterally

**Your answer:** ___

**Q-A4: Task contradicts SPEC.md — implement or stop?**
> Default: stop, quote conflict verbatim, await resolution

**Your answer:** ___

**Q-A5: Sites/domains where KeyClick should never activate?**
> Default: none. Adding exclusions requires touching protected manifest — creator must do this.

**Your answer:** ___

**Q-A6: Produce a `CHANGELOG.md` entry per merged change?**
> Default: yes — `[v0.x] - [module] - [what changed]`

**Your answer:** ___

**Q-A7: Hacky browser-limitation workaround — implement or flag?**
> Default: flag with full explanation, creator decides

**Your answer:** ___

**Q-A8: Max total JS bundle size (unminified)?**
> Default: < 100kb

**Your answer:** ___
