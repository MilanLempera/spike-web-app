# SPIKE Web Bluetooth PoC

Minimal browser-only proof of concept for controlling a LEGO Education SPIKE Prime Hub running stock HubOS 3. No backend, firmware replacement, or desktop application is required.

This repo is a pnpm workspace:

- root app — Blockly controller / blocks UI
- [`spike-rc`](./spike-rc) — keyboard remote driving
- [`spike-link`](./spike-link) — shared HubOS Web Bluetooth stack

## Requirements

- LEGO SPIKE Prime Hub
- stock LEGO SPIKE App 3 / HubOS 3 firmware exposing the `FD02` service
- desktop Chrome, Edge, or another Chromium browser with Web Bluetooth
- Bluetooth
- Node.js and pnpm (install from this repo root)

Web Bluetooth requires a secure context. `pnpm dev` uses `localhost`, which browsers treat as secure.

## Run

From the repo root:

```bash
pnpm install
pnpm dev                 # Blockly web app
pnpm --filter spike-rc dev
```

Open the shown localhost URL in a supported Chromium browser.

## Build and tests

```bash
pnpm test
pnpm build
```

## Test procedure

1. Turn on SPIKE and put it into Bluetooth pairing mode.
2. Open the application.
3. Click **Connect**.
4. Select SPIKE in the browser dialog.
5. Connect a motor to port A.
6. Select port A.
7. Click **Forward**.
8. Click **Stop**.
9. Click **Reverse**.
10. Click **Stop**.

## Expected result

The motor reacts to commands without replacing the original LEGO firmware. Raw writes, notifications, discovery, and disconnect events appear in the diagnostics panel.

## Block editor

The **Word Blocks / Bloky** tab contains the SPIKE-style block editor. Projects can be saved as `.spikeblocks` files, reopened later, and switched between English and Czech. Press **Run** to execute the block graph in the browser.

Keyboard hats are in **Events / Události**. Choose an arrow, Space, Enter, Escape, A–Z, or 0–9 and either **pressed / stisknutá** or **released / uvolněná**. While the program is running, the matching stack starts on that keyboard transition. Key repeat is suppressed, and losing browser focus releases held keys.

The visual program currently runs on the computer. Hardware blocks are translated to commands and sent live to the connected hub; the complete visual program is not compiled into a standalone SPIKE project. The computer and Bluetooth connection therefore need to remain active for keyboard-controlled programs.

## How it works

The app discovers the HubOS 3 `0000FD02…` service, negotiates packet limits using `InfoRequest`, and uses the documented COBS/XOR framing. On connect it uploads a small, ordinary Python command bridge to program slot 0 and starts it. Motor, light, and beep commands then travel through HubOS `TunnelMessage` frames and are acknowledged by the bridge. This does not replace or modify the LEGO firmware, but it does overwrite the user program previously stored in slot 0.

## Safety

The app never starts a motor automatically. On an explicit disconnect it first attempts to stop every motor port, then disconnects even if that final write fails.
