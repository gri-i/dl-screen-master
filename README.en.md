# DL_SCREEN MASTER

[Русский](README.md) · **English**

A desktop app (Electron + React + TypeScript) for designing LED video
walls: cabinet layouts, pixel masks, signal and power wiring diagrams,
projection patterns for multi-projector installations, and engineering
calculators.

![Pixel mask](docs/screenshots/pixel-mask.png)

## Features

- **Pixel mask** — lay out a screen from cabinets at native resolution,
  test patterns (checkerboard, stripes, gradient, grid, solid fill),
  multiple screens on one workspace with drag-and-drop, edge snapping,
  rotation and alignment. Screen label, logo overlay, color pickers and
  cabinet grid/border display.
- **Wiring** — manual and automatic signal (data path) and power (power
  path) routing:
  - auto-router with snake/row/column/center patterns, a selectable
    starting corner, and a graphical preview before applying;
  - port-capacity checks (pixels/cabinets per port) and power-circuit
    overload checks, balanced across phases L1/L2/L3;
  - add a NovaStar controller (MCTRL4K/660/660 Pro, H9, H15), switch
    controllers, or **add an additional controller** when the current
    one runs out of ports — already-assigned traces are preserved;
  - one click to add a **3-phase 32A → 6×16A distro box**, split across
    phases automatically.
- **NovaStar import** — `.srcx`/`.scr` (a whole scene, auto-matched
  against the cabinet library; multi-card records preserve sender offsets,
  physical ports and cabinet order) and `.rcfg`/`.rcfgx` (a single cabinet).
- **Projection patterns** — a Pixel Pattern generator (grid, circles,
  overlap) and a Metric Pattern mode for aligning multi-projector
  installations, with a display grid, overlap settings, and PNG/PDF
  export.
- **Calculator** — weight, dimensions, power draw and recommended
  number of power circuits for a screen; a Bandwidth Calculator for
  HDMI 1.4b–2.2 and DisplayPort 1.1–2.1 (RGB/YCbCr, color depth,
  blanking, DSC).
- **Hardware limits** — officially backed controller and port limits are
  depth-specific; unknown variants are shown as `unknown` instead of being
  filled with guesses.
- **Export** — PNG mask (combined and per-screen for multiple selected
  screens), PNG with the signal-path overlay, a project PDF report with
  a summary table, masks and wiring diagrams, a cabinet CSV schedule, and
  a Resolume Advanced Output XML draft.
- **Cabinet CSV schedule** — one UTF-8 CSV with BOM and `;` separators,
  one row per cabinet, including coordinates, model, port and chain order;
  routed cabinets are listed by port order and unrouted cabinets at the end.
- **Resolume XML** — an Advanced Output draft with one Screen per screen and
  one Slice per port. Signal routes are required; assign physical outputs in
  Resolume manually, and set output rotation manually for rotated screens.
  Live Arena import has not been verified, and the format can vary by version.
- **`.dlscreen` projects** — save/open through Electron IPC; user cabinet
  snapshots contain only presets referenced by the project's screens; the
  global library is preserved and merged on open, while incompatible `id` or
  brand+model conflicts are reported. Saves are atomic, dirty transitions are
  guarded, and recovery is available after a failure.
- **Color themes** — 8 DreamLaser Design System themes, applied
  instantly and remembered between launches.
- **Two interface languages** — Russian and English, switchable in
  settings, applied instantly and remembered between launches.

## Screenshots

| Signal paths & controllers | Power circuits |
|---|---|
| ![Signal path](docs/screenshots/signal-path.png) | ![Power wiring](docs/screenshots/power-path.png) |

| Projection patterns | Calculator |
|---|---|
| ![Projection pattern](docs/screenshots/projection-mask.png) | ![Calculator](docs/screenshots/calculator.png) |

<details>
<summary>Settings & color themes</summary>

![Settings](docs/screenshots/settings.png)

</details>

## Install & run

```bash
npm install
npm run dev      # start in development mode
```

```bash
npm run build     # production build of renderer/main
npm run package   # build an installer (electron-builder)
```

Project checks for development and CI:

```bash
npm test              # vitest run
npm run typecheck     # tsc --noEmit
npm run build         # production build
```

These commands are the documented project checks. A real Electron GUI smoke
test and IPC UI paths were not executed, so this documentation does not claim
that they are GUI-verified.

`npm run package` builds local installers into `release/` for Windows x64 and
macOS x64/arm64. This does not mean that the current branch or `main` is a
released installer. Version 0.2.0 corresponds to tag `v0.2.0`
([e8451a6](https://github.com/gri-i/dl-screen-master/commit/e8451a6)); later
changes remain in `Unreleased`.

macOS builds are unsigned (`identity: null`); on first launch, use
right-click → **Open**.

## Documentation

A full user guide lives at [docs/USAGE.en.md](docs/USAGE.en.md)
([русская версия](docs/USAGE.md)): the cabinet library, working with
masks, NovaStar import, building signal and power diagrams, projection
patterns, the calculator and export.

## Project structure

```
src/
  main/            — Electron main process (window, IPC, file dialogs)
  renderer/        — React UI
    components/    — mask editor, wiring, calculators
    sections/      — projection patterns
    i18n/          — interface translations (ru/en) and the language context
  shared/          — shared code: data types and calculation logic
                     (depends on neither Electron nor React)
docs/
  screenshots/      — images for the README
  USAGE.md          — user guide (Russian)
  USAGE.en.md       — user guide (English)
```
