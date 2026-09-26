import { describe, expect, it } from "vitest";
import { parseDeviceNotification } from "./telemetry";

describe("HubOS device telemetry", () => {
  it("decodes battery, IMU and motor state", () => {
    const payload = new Uint8Array(2 + 21 + 12);
    let offset = 0;
    payload.set([0x00, 87], offset); offset += 2;
    payload.set([0x01, 0, 1], offset);
    const imu = new DataView(payload.buffer); imu.setInt16(offset + 3, 120, true); imu.setInt16(offset + 5, -40, true); imu.setInt16(offset + 7, 5, true);
    offset += 21;
    payload.set([0x0a, 3, 0x31], offset);
    const motor = new DataView(payload.buffer); motor.setInt16(offset + 3, 60, true); motor.setInt16(offset + 5, 3000, true); motor.setInt8(offset + 7, 29); motor.setInt32(offset + 8, 720, true);
    const message = new Uint8Array(3 + payload.length); message[0] = 0x3c; new DataView(message.buffer).setUint16(1, payload.length, true); message.set(payload, 3);
    expect(parseDeviceNotification(message)).toMatchObject({
      battery: 87,
      imu: { face: "Top", yawFace: "Front", yaw: 12, pitch: -4, roll: 0.5 },
      ports: { D: { kind: "motor", motorType: "large", absolutePosition: 60, power: 30, speed: 29, position: 720 } },
    });
  });

  it("decodes force, color and distance sensors", () => {
    const payload = Uint8Array.of(0x0b, 0, 42, 1, 0x0c, 1, 9, 10, 0, 20, 0, 30, 0, 0x0d, 2, 100, 0);
    const message = new Uint8Array(3 + payload.length); message[0] = 0x3c; new DataView(message.buffer).setUint16(1, payload.length, true); message.set(payload, 3);
    expect(parseDeviceNotification(message).ports).toMatchObject({
      A: { kind: "force", force: 42, pressed: true },
      B: { kind: "color", color: "Red", rgb: [10, 20, 30] },
      C: { kind: "distance", distance: 100 },
    });
  });

  it("decodes motors following a padded HubOS color-sensor record", () => {
    const bytes="3c 57 00 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 01 00 00 01 00 ff ff 11 00 ff ff 1c 00 dc 03 e8 ff 00 00 01 00 00 3c 0c 00 00 00 00 00 00 00 00 00 0d 01 bd 00 0a 03 31 00 00 00 00 00 00 00 00 00 0a 05 30 ab ff 00 00 00 ab ff ff ff";
    const message=Uint8Array.from(bytes.split(" ").map(value=>Number.parseInt(value,16)));
    expect(parseDeviceNotification(message).ports).toMatchObject({
      A:{kind:"color"},B:{kind:"distance",distance:189},D:{kind:"motor",motorType:"large"},F:{kind:"motor",motorType:"medium"},
    });
  });
});
