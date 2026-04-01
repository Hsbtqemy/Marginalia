# Marginalia

Marginalia is a Tauri v2 desktop writing app with three panes:
- Left: continuous marginalia editor with linked blocks.
- Center: manuscript editor.
- Right: optional citations/notes editor with linked blocks.

The app is designed for durable local workflows: SQLite for content, Store for UI preferences, constrained export presets, and minimal dependencies.

## Stack

- Tauri v2
- React + TypeScript + Vite
- Lexical editors (`@lexical/react`)
- SQLite (`@tauri-apps/plugin-sql`)
- UI preferences (`@tauri-apps/plugin-store`)
- DOCX export in Rust (`docx-rs`)

## Prerequisites

### All platforms

- Node.js `>= 20.19` (Vite 7 requirement)
- npm `>= 10`
- Rust (stable) + Cargo

### Linux (WebKitGTK runtime/dev packages)

Debian/Ubuntu example:

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf
```

### Windows

- Microsoft Edge WebView2 Runtime installed
- Visual Studio C++ Build Tools (for Rust desktop builds)

## Run (dev)

```bash
npm install
npm run tauri:dev
```

## Build (release)

```bash
npm install
npm run tauri:build
```

## Local verification

```bash
npm install
npm run verify
```

`npm run verify` runs:

- `npm run lint:colors`
- `npm test`
- `npm run build`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`

The same verification chain runs in GitHub Actions on `push`, `pull_request`, and `workflow_dispatch`.

If your shell cannot find `npm`, `node`, or `cargo`, open a fresh terminal after installation or fix your `PATH` first. On Windows, the most common locations are:

- `C:\Program Files\nodejs`
- `%USERPROFILE%\.cargo\bin`

## Project layout

- `src/app/App.tsx`: app orchestration, bootstrap, menu handlers, export actions
- `src/app/layout/ThreePaneLayout.tsx`: resizable panes
- `src/app/menu/buildMenu.ts`: native-like app menu
- `src/editors/manuscript/`: manuscript Lexical editor + stable blockId plugin
- `src/editors/margin/`: left/right continuous marginalia editors
- `src/editors/margin/marginaliaBlocks/`: `MarginaliaBlockNode`, commands, link indexing
- `src/presets/`: preset schema + manager modal
- `src/db/`: SQLite open/migrations/queries
- `src/theme/`: tokens and theme helpers
- `src-tauri/src/lib.rs`: Tauri plugins + DOCX export + save dialog commands

## Database

DB file: `app.db` (app data dir).

Core tables:
- `documents`
- `manuscript_states`
- `margin_left_states`
- `margin_right_states`
- `export_presets`
- `document_export_settings`

Migration SQL: `src/db/migrations/001_initial.sql`

## Persistence behavior

- Seeds default document on first launch.
- Seeds built-in presets:
  - `Academic — Times New Roman`
  - `Academic — Garamond`
- Autosaves manuscript/left/right editors (debounced + blur save).
- Persists:
  - last opened document
  - pane widths
  - theme mode (`system | light | dark`)
  - high contrast toggle
  - page preview/right pane toggles

## Linking model

- Manuscript top-level blocks get stable `blockId` in Lexical node state.
- Left/right margin editors use `marginalia-block` nodes with:
  - `marginBlockId`
  - `linkedManuscriptBlockId`
- Commands support create/link/unlink/reveal/navigate/move up/down.

## Exports

### DOCX (Rust)

Command: `export_docx` (`src-tauri/src/lib.rs`)

Profiles:
- `Clean`: manuscript only.
- `Working`:
  - linked left blocks -> comments attached to matching manuscript block
  - linked right blocks -> footnotes attached to matching manuscript block
  - unlinked left blocks -> annex section `Chutier` (enabled by default)

Preset fields (font, spacing, page size, margins, heading scale) are applied to DOCX output.

Current DOCX guarantees:
- paragraph, heading, quote, and basic list structure
- working-profile comments from left marginalia
- working-profile footnotes from right marginalia
- preset-driven font, spacing, page size, and margins

Current DOCX limitations:
- no full-fidelity round-trip of arbitrary Lexical markup
- limited inline-style preservation
- no advanced nested structure rendering guarantees
- output is semantic/structured first, not strict WYSIWYG

### PDF

MVP flow:
- Build preset-styled print HTML (`src/utils/printPreview.ts`)
- Open print preview modal
- Trigger system print dialog (`window.print()` from preview iframe)
- Save as PDF from OS print UI

Security notes:
- print preview HTML is sanitized before injection
- preview iframe uses a restrictive inline CSP
- the desktop CSP is no longer disabled globally

## Accessibility + theming

- No component-level hardcoded UI colors; all UI colors come from CSS tokens.
- Supports:
  - `prefers-color-scheme`
  - `prefers-contrast`
  - `forced-colors: active`
- Focus indicators remain visible across themes/contrast modes.
- Color guardrail:
  - `npm run lint:colors` runs `scripts/lint-colors.mjs` (Node, cross-platform).
  - It fails if hex/rgb/hsl/oklch/color declarations are added anywhere in `src/` except `src/theme/tokens.css`.

## Notes

- This implementation is desktop-first for macOS/Windows/Linux.
- On Windows, Rust builds also require the MSVC linker from Visual Studio C++ Build Tools.
- GitHub Actions runs the same verification chain on `windows-latest` via `.github/workflows/verify.yml`.
