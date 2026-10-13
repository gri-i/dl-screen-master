# DL_SCREEN MASTER User Guide

[Русский](USAGE.md) · **English**

This guide walks through the app's workflow end to end: from the
cabinet library to a finished project PDF report.

## Contents

1. [Cabinet library](#1-cabinet-library)
2. [Pixel mask](#2-pixel-mask)
3. [NovaStar import](#3-novastar-import)
4. [Wiring: signal paths](#4-wiring-signal-paths)
5. [Wiring: power circuits](#5-wiring-power-circuits)
6. [Projection patterns](#6-projection-patterns)
7. [Calculator](#7-calculator)
8. [Export](#8-export)
9. [Settings and projects](#9-settings-and-projects)

---

## 1. Cabinet library

Before you start, the library needs at least one LED cabinet model.
Open **Settings** (top-right button):

- **Import RCFG / RCFGX** — adds a single cabinet from a NovaStar
  configuration file (resolution and pixel pitch are detected
  automatically).
- **Import JSON** / **Export JSON** — move the whole cabinet library
  between installs.
- **Add cabinet** — manually enter brand, model, pixel pitch,
  resolution, dimensions, weight and power (max/average).

Any model can be edited or deleted right in the library list. Changes
show up in the main window immediately.

The same settings section also has:

- **Appearance** — one of 8 color themes (applies instantly, remembered
  between launches).
- **Language** — Russian or English; switches instantly and is
  remembered between launches.
- **Power grid** — default voltage, phase, cos φ and breaker rating for
  new power calculations.

## 2. Pixel mask

The **"Pixel mask"** section is the main screen-layout editor.

1. In the left panel, pick a **cabinet model** and set the layout
   (cabinets across/down). The calculation panel immediately shows
   resolution, dimensions, weight and the estimated number of power
   circuits.
2. Click **"Add screen to canvas"** — the screen appears on the
   workspace already carrying the selected pattern.
3. On the canvas, screens can be dragged (with edge snapping when
   docking), selected with a marquee or Ctrl/Cmd, rotated 90° (the
   **↻ 90°** button), zoomed with the mouse wheel, and panned. A right
   click on a cabinet removes it from the layout; a right click on an
   empty cell adds it back — handy for non-rectangular screens (letters,
   custom shapes).
4. The right panel configures the **pattern** (checkerboard, stripes,
   gradient, grid, solid fill, color scheme), the **screen label**
   (name, size, color), the **logo** (position, width, opacity), and
   **overlays** (cabinet borders, numbering, test grid, resolution).
5. Undo/redo — **↶ / ↷** (Ctrl/Cmd+Z, Ctrl/Cmd+Y).

All mask settings are stored inside the project and are shared between
"Pixel mask" and "Wiring" — screen geometry is the same in both.

## 3. NovaStar import

The **"Import .srcx/.scr"** button on the Pixel mask/Wiring toolbar
parses a whole NovaStar scene file:

- cabinets in each screen are matched against presets already in the
  library — first by **brand + model**, then, if nothing matches, by
  **pixel resolution** (only when exactly one library preset has that
  resolution). Re-importing the same cabinet won't create a duplicate
  preset;
- when the file has no rated weight/power (common for `.srcx`/`.scr`),
  a new preset borrows weight and power from the cabinet selected in
  the left panel — geometry (mm/px) always comes from the file itself;
- signal paths (controller, physical outputs, cabinet order within each
  chain) are restored automatically and show up right away in the
  "Wiring" section.
- Multi-card scenes preserve sender-card offsets, physical ports and cabinet
  order, including tables with padding and empty records. This was confirmed
  against the real `h15_v3.scr` in a read-only check; the file was not added
  to the repository.

The import status (how many screens, how many matched the library, how
many new presets were created) appears under the import button.

## 4. Wiring: signal paths

Switch to the **"Wiring"** section, select a screen on the canvas, and
open the **"Signal"** tab in the right panel.

### Auto routing

In the **"Auto routing"** block, pick a traversal pattern (snake by
rows/columns, by rows, by columns, from center) and a starting corner.
The generator skips empty cells and splits cabinets across ports based
on their pixel capacity; it warns if there aren't enough ports. A
graphical preview (color = port) is available before you apply it;
afterward the routing can be fine-tuned by hand.

### Manual editing

If the screen has no controller yet — pick a NovaStar model (MCTRL4K,
MCTRL660, MCTRL660 Pro, H9, H15) and, for H9/H15, the number of
installed sending cards, then click **"Add and edit paths"**.

Once a controller exists, you get:

- **"Edit traces"** — select a port in the list, then click cabinets on
  the canvas in signal order; clicking again removes a cabinet from the
  chain. Port load (% of the pixel or cabinet-count limit) shows right
  on the port button, with overload highlighted.
- **"Switch controller"** — opens a form to pick a different model
  (defaulting to the same sending-card count) and **rebuilds all
  ports**: already-assigned traces on this screen will be reset — this
  is called out right in the form.
- **"Add controller"** — for when the current controller's ports run
  out. Pick a second model (or the same one) — its ports **get added to
  the existing ones**, without resetting previously assigned traces.
  New sending cards are numbered starting past the highest existing
  number, so multiple controllers/cards on one screen never collide.
  The panel header summarizes every controller on the screen (e.g.
  `NovaStar · MCTRL4K + H9 ×2`).

The **"Clear port"** and **"Clear all paths"** buttons reset
assignments without removing the controller itself.

### Hardware limits and unknown values

Official limits come from `src/shared/hardwareLimits.ts` and are
color-depth-specific. Known values:

- **MCTRL4K** — 8,800,000 pixels aggregate.
- **MCTRL660 Pro** — 2,304,000 pixels at 8-bit and 2,073,600 at
  10/12-bit.
- **MCTRL660** — 2,304,000 at 8-bit and 1,296,000 at 12-bit; the 10-bit
  canvas is explicitly unknown.
- **H9/H15** — per H_16 RJ45 card port: 650,000 at 8-bit and 320,000 at
  10-bit. Maximum cards: H9 — 5, H15 Standard — 10, H15 Enhanced — 16.

H9/H15 aggregate input capacity must not be reduced to one number without
  the chassis and sending-card configuration. H15 cards 11–16 remain
  unknown until Standard or Enhanced is selected; more than 16 cards is an
  overload. When no official value is available, the interface shows
  `unknown` instead of inventing an estimate.

Source-backed receiver-card variants are **A10s Pro**, **A8s PWM/common**,
**A5s Plus PWM/common**, and **A4s**. **A8s Pro** and missing driver
variants remain `unknown`.

## 5. Wiring: power circuits

On the same panel, switch to the **"Power"** tab.

### Auto routing

Use the **"Auto routing"** block at the top of the panel: it builds
both signal and power circuits at once, with a preview and a
cabinets-per-circuit limit. This is the fastest way to get a working
layout.

### Manual fine-tuning

In the **Power path planning** block itself:

- pick the **cabinet for power calculation** (power comes from its
  preset) and set voltage, breaker rating, margin and phase count;
- **"+ Circuit"** adds one empty circuit, cycling the phase (L1 → L2 →
  L3) for a three-phase grid;
- **"+ Distro box 32A/3-phase (6×16A)"** creates **6 circuits** at
  once with one click, 2 per phase — the typical layout of a distro box
  fed by 3-phase 32A with six 16A outputs. This switches the plan to
  3-phase and a 16A breaker (the rating of the outgoing line, not the
  box's incomer);
- **"Draw power paths"** turns on placement mode: pick a circuit from
  the list, then click cabinets on the canvas. Each circuit's card
  shows load in % and kW, calculated current, and overload if any;
- **"Clear"** resets assignments on every circuit without deleting them.

The summary line under the circuit list shows how many cabinets out of
the total are assigned and how many circuits are overloaded.

## 6. Projection patterns

The **"Projection masks"** section is an alignment-pattern generator
for multi-projector installations, separate from the LED screen layout.

- **Pixel Pattern** — the grid, circles and overlap zone are built from
  the display pixel grid (projector resolution, overlap X/Y, number of
  projectors across/down). Three grid densities are available
  (Wide/Medium/Fine), plus line thickness and background/grid colors.
- **Metric Pattern** — the same pattern in metric (physical) coordinates.
- A logo can be overlaid the same way as in the pixel mask (position,
  width, opacity).
- The resulting pattern zooms with the wheel/**−/+** buttons; export via
  **"Download PNG"** or **"Export PDF"** (the PDF includes a projector
  table: position, resolution, overlap).

## 7. Calculator

The **"Calculator"** section combines two independent tools:

- **Screen parameters** — the same layout as in "Pixel mask": total
  cabinet count, resolution, dimensions, weight, peak/average power
  draw, and the recommended number of power circuits.
- **Bandwidth Calculator** — bandwidth for HDMI 1.4b–2.2 and
  DisplayPort 1.1–2.1 (HBR/HBR2/HBR3/UHBR10/UHBR13.5/UHBR20) for the
  chosen resolution and refresh rate, accounting for 8/10/12-bit color
  depth, color format (RGB/YCbCr 4:4:4/4:2:2/4:2:0), blanking and DSC
  2:1–3:1. Resolution can be pulled from the screen parameters or
  entered manually; the calculator highlights the minimum HDMI/DP mode
  that fits and warns when bandwidth is exceeded.

## 8. Export

On the Pixel mask/Wiring toolbar:

- **"PNG mask"** — saves the selected screen's mask; if multiple
  screens are selected, it saves a folder with one combined mask
  (matching each screen's actual canvas position and rotation) plus
  each screen's mask separately.
- **"PNG with paths"** — the same, with the signal-path diagram
  overlaid (available once a screen has a controller configured).
- **"Cabinets CSV"** — saves one `<project-name>-cabinets.csv` file. It is
  UTF-8 with BOM and `;` separators, with one row per installed cabinet.
  Each row includes the screen, controller, sending card, physical port,
  chain order, pixel/mm coordinates, model and receiving card. Cabinets
  assigned to ports are listed in signal order; unassigned cabinets are
  appended with the `UNPATCHED` status.
- **"Resolume XML"** — saves an **Advanced Output** XML draft with one
  Screen per screen and one Slice per port that has assigned cabinets. At
  least one signal route is required. After saving, put the file in
  `Documents/Resolume Arena/Presets/Advanced Output` and assign physical
  outputs manually: `deviceId`/`idHash` are machine-specific and are not
  synthesized. For rotated screens, set output rotation in Resolume too.
  Live Arena import has not been verified, and the XML format may vary by
  Resolume version.
- **"Export PDF"** — a project PDF report: a screen summary table and,
  for each screen, pages with its mask, signal-path diagram and
  power-circuit diagram (with port/circuit tables and overload status).
  Mask PNG files are saved next to the report in a folder named after
  the project.

## 9. Settings and projects

- **"New"** — clears the current layout and starts a new project.
- **"Open"** / **"Save"** — work with `.dlscreen` (JSON) project files
  through the system file dialog. Files are parsed from `unknown` and
  validated before use: RU/EN errors are localized, finite values, ranges,
  nested presets, screens, coordinates and routes are checked, and v1
  normalization is supported. The project snapshot stores only user presets
  referenced by its screens. The global library is preserved and merged on
  open; non-identical `id` or brand+model conflicts are reported instead of
  being silently overwritten.
- Project saves are atomic and clear
  `userData/recovery/current.dlscreen-recovery.json` only after success. When
  the project is dirty, **New**, **Open** and app close use a save
  confirmation; cancel, save failure or recovery-cleanup failure stops the
  destructive transition. If recovery is found, restoring it also requires
  explicit confirmation. Recovery autosaves use a generation guard against
  stale writes.
- **"Clear all"** — removes every screen from the current workspace.

For details on exactly what's stored in a project file and how the data
model is shaped, see `src/shared/types.ts`.
