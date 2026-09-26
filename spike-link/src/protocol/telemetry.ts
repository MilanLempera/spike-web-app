import type { Port } from "./ports";

export type PortTelemetry =
  | { kind: "motor"; motorType: "small" | "medium" | "large" | "unknown"; absolutePosition: number; position: number; power: number; speed: number }
  | { kind: "force"; force: number; pressed: boolean }
  | { kind: "color"; color: string; rgb: [number, number, number] }
  | { kind: "distance"; distance: number }
  | { kind: "color-matrix"; pixels: number[] };

export type HubTelemetry = {
  battery?: number;
  imu?: {
    face: string;
    yawFace: string;
    yaw: number;
    pitch: number;
    roll: number;
    acceleration: [number, number, number];
    gyroscope: [number, number, number];
  };
  matrix?: number[];
  ports: Partial<Record<Port, PortTelemetry>>;
};

const PORT_NAMES: Port[] = ["A", "B", "C", "D", "E", "F"];
const FACES = ["Top", "Front", "Right", "Bottom", "Back", "Left"];
const COLORS = ["Black", "Magenta", "Purple", "Blue", "Azure", "Turquoise", "Green", "Yellow", "Orange", "Red", "White"];

export function deviceNotificationRequest(intervalMs = 250): Uint8Array {
  const message = new Uint8Array(3);
  message[0] = 0x28;
  new DataView(message.buffer).setUint16(1, intervalMs, true);
  return message;
}

export function parseDeviceNotification(message: Uint8Array): HubTelemetry {
  if (message[0] !== 0x3c || message.length < 3) throw new Error("Invalid device notification.");
  const view = new DataView(message.buffer, message.byteOffset, message.byteLength);
  const payloadEnd = Math.min(message.length, 3 + view.getUint16(1, true));
  const state: HubTelemetry = { ports: {} };
  let offset = 3;

  const portAt = (index: number): Port | undefined => PORT_NAMES[message[index]];
  const has = (count: number) => offset + count <= payloadEnd;

  while (offset < payloadEnd) {
    const type = message[offset];
    if (type === 0x00 && has(2)) {
      state.battery = message[offset + 1]; offset += 2;
    } else if (type === 0x01 && has(21)) {
      state.imu = {
        face: FACES[message[offset + 1]] ?? "Unknown",
        yawFace: FACES[message[offset + 2]] ?? "Unknown",
        yaw: view.getInt16(offset + 3, true) / 10,
        pitch: view.getInt16(offset + 5, true) / 10,
        roll: view.getInt16(offset + 7, true) / 10,
        acceleration: [view.getInt16(offset + 9, true), view.getInt16(offset + 11, true), view.getInt16(offset + 13, true)],
        gyroscope: [view.getInt16(offset + 15, true), view.getInt16(offset + 17, true), view.getInt16(offset + 19, true)],
      };
      offset += 21;
    } else if (type === 0x02 && has(26)) {
      state.matrix = Array.from(message.slice(offset + 1, offset + 26)); offset += 26;
    } else if (type === 0x0a && has(12)) {
      const port = portAt(offset + 1), motorCode = message[offset + 2];
      if (port) state.ports[port] = {
        kind: "motor",
        motorType: motorCode === 0x30 ? "medium" : motorCode === 0x31 ? "large" : motorCode === 0x41 ? "small" : "unknown",
        absolutePosition: view.getInt16(offset + 3, true),
        power: view.getInt16(offset + 5, true) / 100,
        speed: view.getInt8(offset + 7),
        position: view.getInt32(offset + 8, true),
      };
      offset += 12;
    } else if (type === 0x0b && has(4)) {
      const port = portAt(offset + 1);
      if (port) state.ports[port] = { kind: "force", force: message[offset + 2], pressed: message[offset + 3] === 1 };
      offset += 4;
    } else if (type === 0x0c && has(9)) {
      const port = portAt(offset + 1), colorCode = view.getInt8(offset + 2);
      if (port) state.ports[port] = {
        kind: "color",
        color: COLORS[colorCode] ?? "Unknown",
        // HubOS documents these as R, G, B (0–1023), not GRB.
        rgb: [view.getUint16(offset + 3, true), view.getUint16(offset + 5, true), view.getUint16(offset + 7, true)],
      };
      // Some HubOS 3 builds append a reserved NUL byte that is missing from
      // the public protocol table. Without consuming it, every later port in
      // the same notification is decoded at the wrong offset.
      const nextAfterPadding=message[offset+10];
      const padded=has(10)&&message[offset+9]===0&&(offset+10===payloadEnd||[0x0a,0x0b,0x0c,0x0d,0x0e].includes(nextAfterPadding));
      offset += padded?10:9;
    } else if (type === 0x0d && has(4)) {
      const port = portAt(offset + 1);
      if (port) state.ports[port] = { kind: "distance", distance: view.getInt16(offset + 2, true) };
      offset += 4;
    } else if (type === 0x0e && has(11)) {
      const port = portAt(offset + 1);
      if (port) state.ports[port] = { kind: "color-matrix", pixels: Array.from(message.slice(offset + 2, offset + 11)) };
      offset += 11;
    } else break;
  }
  return state;
}
