# SPIKE Remote (spike-rc)

Browser-only remote control for a LEGO Education SPIKE Prime Hub running stock HubOS 3. Drive a tank, steer, or straight layout with the keyboard, and watch distance / color / force sensors on a car HUD.

Shares the HubOS Web Bluetooth stack with the root `spike-web-app` through the `spike-link` package.

## Requirements

- LEGO SPIKE Prime Hub
- stock LEGO SPIKE App 3 / HubOS 3 firmware exposing the `FD02` service
- desktop Chrome, Edge, or another Chromium browser with Web Bluetooth
- Bluetooth
- Node.js and pnpm (workspace root: `spike-web-app`)

Web Bluetooth requires a secure context. `pnpm dev` uses `localhost`, which browsers treat as secure.

## Run

From the repo root (`spike-web-app`):

```bash
pnpm install
pnpm --filter spike-rc dev
```

Or from this folder:

```bash
pnpm install
pnpm dev
```

Open the shown localhost URL (default port **5174**) in a supported Chromium browser.

## Build and tests

```bash
pnpm test
pnpm build
```

## First drive

1. Turn on SPIKE and put it into Bluetooth pairing mode.
2. Open the app and click **Connect**.
3. Select SPIKE in the browser dialog.
4. Walk through the setup wizard (tank / steer / straight, port assignment, optional extra motor).
5. Drive with the arrow keys or WASD. Space stops everything. Q / E run the optional extra motor.

Connecting overwrites the user program in hub slot 0 with the shared motor bridge. Only one browser tab can hold the GATT link at a time.
