import { describe, expect, it } from "vitest";
import type { HubTelemetry } from "spike-link";
import { evaluateWatch, watchGroups } from "./watch";

const telemetry: HubTelemetry = {
  battery: 82,
  imu: { face:"Top", yawFace:"Front", yaw:12.34, pitch:-4, roll:8, acceleration:[0,0,0], gyroscope:[0,0,0] },
  ports: {
    A: { kind:"motor", motorType:"large", absolutePosition:0, position:135, speed:30, power:28 },
    B: { kind:"color", color:"Red", rgb:[100,0,0] },
    C: { kind:"distance", distance:237 },
    D: { kind:"force", force:61, pressed:true },
  },
};

describe("telemetry watch expressions", () => {
  it("reads hub and device values case-insensitively", () => {
    expect(evaluateWatch("battery", telemetry, "en").value).toBe("82%");
    expect(evaluateWatch("HUB.YAW", telemetry, "en").value).toBe("12.3°");
    expect(evaluateWatch("motor.a.position", telemetry, "en").value).toBe("135°");
    expect(evaluateWatch("distance.C.cm", telemetry, "en").value).toBe("23.7 cm");
  });

  it("formats state and localized values", () => {
    expect(evaluateWatch("motor.A.running", telemetry, "cs")).toMatchObject({ value:"Zapnutý", tone:"on" });
    expect(evaluateWatch("force.D.pressed", telemetry, "cs").value).toBe("Ano");
    expect(evaluateWatch("color.B", telemetry, "cs").value).toBe("Červená");
  });

  it("distinguishes missing telemetry from an invalid expression", () => {
    expect(evaluateWatch("motor.F.speed", telemetry, "en")).toEqual({ valid:true, value:"—" });
    expect(evaluateWatch("window.secret", telemetry, "en").valid).toBe(false);
  });

  it("offers only expressions supported by connected devices", () => {
    const groups = watchGroups(telemetry, "cs");
    expect(groups.map(group => group.label)).toEqual(["Hub", "Motor A", "Barva B", "Vzdálenost C", "Síla / tlačítko D"]);
    expect(groups.flatMap(group => group.expressions)).not.toContain("motor.F.speed");
    expect(groups.flatMap(group => group.expressions)).not.toContain("distance.B.cm");
  });
});
