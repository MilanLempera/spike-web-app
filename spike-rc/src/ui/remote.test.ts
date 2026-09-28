import { describe, expect, it } from "vitest";
import type { HubTelemetry } from "spike-link";
import {
  activeDriveAxis, activeSpeedKey, carSensors, clamp, colorCss, colorLabel, commandSignature, defaultRemoteConfig, distanceVisualRatio,
  drivePowers, formatDistance, formatRgb, hasExtraMotor, intentFromKeys, invertPower, isDirectionKeyEnabled,
  isRemoteControlEnabled, isRemoteKey, isMainDriveLocked, liveRemoteCommands, mainDriveLockMessage, motorPorts, parseRemoteConfig, planRemoteCommands, probeCommands, probePower, readySetupSummary,
  remoteSensors, resolveStoredRemoteConfig, rgb8, scaledSpeed, shouldShowSetupModal, speedControlLabel, tankTurnSign, wantsSetupOnConnect, wasdLabelForArrow, wizardAssignSteps, wizardExtra2Index, wizardExtraIndex, wizardTabs, wizardView,
} from "./remote";

describe("remote keyboard intent", () => {
  it("treats WASD as the arrow axes", () => {
    expect(intentFromKeys(["KeyW"])).toMatchObject({ forward: 1, turn: 0 });
    expect(intentFromKeys(["ArrowUp"])).toMatchObject({ forward: 1, turn: 0 });
    expect(intentFromKeys(["KeyA", "ArrowLeft"])).toMatchObject({ turn: -1 });
    expect(intentFromKeys(["KeyD"])).toMatchObject({ turn: 1 });
    expect(intentFromKeys(["KeyS", "KeyW"])).toMatchObject({ forward: 0 });
  });

  it("maps Q/E and R/F extras and Space as a full stop", () => {
    expect(intentFromKeys(["KeyQ"])).toMatchObject({ extra: -1, extra2: 0, stop: false });
    expect(intentFromKeys(["KeyE"])).toMatchObject({ extra: 1 });
    expect(intentFromKeys(["KeyR"])).toMatchObject({ extra2: -1, extra: 0 });
    expect(intentFromKeys(["KeyF"])).toMatchObject({ extra2: 1 });
    expect(intentFromKeys(["Space", "KeyW"])).toMatchObject({ stop: true, forward: 1 });
  });

  it("recognizes only the remote control keys", () => {
    expect(isRemoteKey("KeyW")).toBe(true);
    expect(isRemoteKey("ArrowUp")).toBe(true);
    expect(isRemoteKey("Space")).toBe(true);
    expect(isRemoteKey("KeyZ")).toBe(false);
  });

  it("labels arrows with WASD alternatives", () => {
    expect(wasdLabelForArrow("ArrowUp")).toBe("W");
    expect(wasdLabelForArrow("ArrowLeft")).toBe("A");
    expect(wasdLabelForArrow("ArrowDown")).toBe("S");
    expect(wasdLabelForArrow("ArrowRight")).toBe("D");
    expect(wasdLabelForArrow("KeyW")).toBeUndefined();
  });
});

describe("remote setup wizard", () => {
  it("asks for left then right motors in tank mode", () => {
    expect(wizardAssignSteps("tank")).toEqual([
      { role: "left", portKey: "leftPort", invertKey: "invertLeft", speedKey: "speedLeft", axis: "forward" },
      { role: "right", portKey: "rightPort", invertKey: "invertRight", speedKey: "speedRight", axis: "forward" },
    ]);
  });

  it("asks for drive then steering in steer mode", () => {
    expect(wizardAssignSteps("steer").map(step => step.role)).toEqual(["drive", "steer"]);
    expect(wizardAssignSteps("steer")[1].axis).toBe("turn");
  });

  it("asks only for the drive motor without steering", () => {
    expect(wizardAssignSteps("straight")).toEqual([
      { role: "drive", portKey: "drivePort", invertKey: "invertDrive", speedKey: "speedDrive", axis: "forward" },
    ]);
  });

  it("opens the setup guide on connect until the car is configured", () => {
    expect(wantsSetupOnConnect(false, true, false)).toBe(true);
    expect(wantsSetupOnConnect(true, true, false)).toBe(false);
    expect(wantsSetupOnConnect(false, true, true)).toBe(false);
    expect(wantsSetupOnConnect(false, false, false)).toBe(false);
  });

  it("keeps the setup modal up while connected or explicitly reopened", () => {
    expect(shouldShowSetupModal(true, false, false)).toBe(true);
    expect(shouldShowSetupModal(false, false, true)).toBe(true);
    expect(shouldShowSetupModal(false, false, false)).toBe(false);
    expect(shouldShowSetupModal(true, true, true)).toBe(false);
  });

  it("names a tab for the mode and each motor", () => {
    expect(wizardTabs("steer", "cs")).toEqual([
      { step: 0, label: "Režim" },
      { step: 1, label: "Pohon" },
      { step: 2, label: "Zatáčení" },
      { step: 3, label: "Q·E" },
      { step: 4, label: "R·F" },
    ]);
    expect(wizardTabs("tank", "en").map(tab => tab.label)).toEqual(["Mode", "Left", "Right", "Q·E", "R·F"]);
    expect(wizardTabs("straight", "cs").map(tab => tab.step)).toEqual([0, 1, 2, 3]);
  });

  it("walks mode → assign → extras → ready for each layout", () => {
    expect(wizardExtraIndex("steer")).toBe(3);
    expect(wizardExtra2Index("steer")).toBe(4);
    expect(wizardExtraIndex("straight")).toBe(2);
    expect(wizardView(0, "steer")).toMatchObject({ kind: "mode", index: 0, total: 6 });
    expect(wizardView(1, "steer")).toMatchObject({ kind: "assign", assign: { role: "drive" } });
    expect(wizardView(2, "steer")).toMatchObject({ kind: "assign", assign: { role: "steer" } });
    expect(wizardView(3, "steer")).toMatchObject({ kind: "extra", index: 3, total: 6, slot: 1 });
    expect(wizardView(4, "steer")).toMatchObject({ kind: "extra", index: 4, total: 6, slot: 2 });
    expect(wizardView(5, "steer")).toMatchObject({ kind: "ready", index: 5, total: 6 });
    expect(wizardView(2, "straight")).toMatchObject({ kind: "extra", total: 5, slot: 1 });
    expect(wizardView(3, "straight")).toMatchObject({ kind: "extra", total: 5, slot: 2 });
    expect(wizardView(4, "straight")).toMatchObject({ kind: "ready", total: 5 });
    expect(wizardView(0, "tank", true)).toMatchObject({ kind: "ready", total: 6 });
  });

  it("summarizes assigned ports on the ready header", () => {
    const steer = { ...defaultRemoteConfig(), extraPort: "E" as const, extra2Port: "F" as const };
    expect(readySetupSummary(steer, "cs")).toBe("Pohon A · Zatáčení C · Extra1 E · Extra2 F");
    expect(readySetupSummary({ ...steer, extraPort: "", extra2Port: "" }, "en")).toBe("Drive A · Steer C");
    expect(readySetupSummary({ ...defaultRemoteConfig(), layout: "tank" }, "cs")).toBe("Levý A · Pravý B · vzadu");
    expect(readySetupSummary({ ...defaultRemoteConfig(), layout: "tank", tankAxle: "front" }, "en")).toBe("Left A · Right B · front");
    expect(readySetupSummary({ ...defaultRemoteConfig(), layout: "straight" }, "en")).toBe("Drive A");
  });

  it("enables only the directions used by the current mode", () => {
    expect(activeDriveAxis(wizardView(0, "steer"), "steer")).toBe("none");
    expect(activeDriveAxis(wizardView(1, "steer"), "steer")).toBe("forward");
    expect(activeDriveAxis(wizardView(2, "steer"), "steer")).toBe("turn");
    expect(activeDriveAxis(wizardView(3, "steer"), "steer")).toBe("none");
    expect(activeDriveAxis(wizardView(5, "steer", true), "steer")).toBe("all");
    expect(activeDriveAxis(wizardView(5, "tank", true), "tank")).toBe("all");
    expect(activeDriveAxis(wizardView(4, "straight", true), "straight")).toBe("forward");
  });

  it("disables unused direction keys for the active axis", () => {
    expect(isDirectionKeyEnabled("ArrowUp", "forward")).toBe(true);
    expect(isDirectionKeyEnabled("KeyS", "forward")).toBe(true);
    expect(isDirectionKeyEnabled("ArrowLeft", "forward")).toBe(false);
    expect(isDirectionKeyEnabled("KeyD", "forward")).toBe(false);
    expect(isDirectionKeyEnabled("ArrowUp", "turn")).toBe(false);
    expect(isDirectionKeyEnabled("ArrowLeft", "turn")).toBe(true);
    expect(isDirectionKeyEnabled("ArrowRight", "all")).toBe(true);
    expect(isDirectionKeyEnabled("ArrowUp", "none")).toBe(false);
    expect(isDirectionKeyEnabled("KeyQ", "none")).toBe(true);
    expect(isDirectionKeyEnabled("Space", "forward")).toBe(true);
  });

  it("locks the main drive pad until setup is finished", () => {
    expect(isMainDriveLocked(false, false)).toBe(true);
    expect(isMainDriveLocked(false, true)).toBe(false);
    expect(isMainDriveLocked(true, false)).toBe(false);
    expect(mainDriveLockMessage("cs")).toBe("Nejprve nastavte autíčko.");
    expect(mainDriveLockMessage("en")).toBe("Set up the car first.");
  });

  it("keeps extra Q/E and R/F off until a motor port is chosen", () => {
    expect(hasExtraMotor("")).toBe(false);
    expect(hasExtraMotor("E")).toBe(true);
    expect(isRemoteControlEnabled("KeyQ", "all", "")).toBe(false);
    expect(isRemoteControlEnabled("KeyE", "none", "C")).toBe(true);
    expect(isRemoteControlEnabled("KeyR", "all", "E", "")).toBe(false);
    expect(isRemoteControlEnabled("KeyF", "all", "E", "D")).toBe(true);
    expect(isRemoteControlEnabled("ArrowUp", "forward", "")).toBe(true);
    expect(isRemoteControlEnabled("ArrowLeft", "forward", "E")).toBe(false);
    const extra1 = wizardView(3, "steer");
    expect(isRemoteControlEnabled("KeyR", "none", "E", "F", extra1)).toBe(false);
    expect(isRemoteControlEnabled("KeyQ", "none", "E", "F", extra1)).toBe(true);
  });

  it("points the speed slider at the motor under test, then back to the throttle", () => {
    expect(activeSpeedKey(wizardView(1, "steer"))).toBe("speedDrive");
    expect(activeSpeedKey(wizardView(2, "steer"))).toBe("speedSteer");
    expect(activeSpeedKey(wizardView(1, "tank"))).toBe("speedLeft");
    expect(activeSpeedKey(wizardView(2, "tank"))).toBe("speedRight");
    expect(activeSpeedKey(wizardView(3, "steer"))).toBe("speedExtra");
    expect(activeSpeedKey(wizardView(4, "steer"))).toBe("speedExtra2");
    expect(activeSpeedKey(wizardView(0, "steer"))).toBe("speed");
    expect(activeSpeedKey(wizardView(5, "steer", true))).toBe("speed");
    expect(speedControlLabel("speedSteer", "cs")).toBe("Zatáčení");
    expect(speedControlLabel("speed", "en")).toBe("Throttle");
    expect(speedControlLabel("speedLeft", "cs")).toBe("Levý");
    expect(speedControlLabel("speedExtra2", "en")).toBe("Extra 2");
  });

  it("probes a single motor and respects invert / stop", () => {
    expect(probePower("forward", { forward: 1, turn: 0, extra: 0, extra2: 0, stop: false }, 50)).toBe(50);
    expect(probePower("turn", { forward: 0, turn: -1, extra: 0, extra2: 0, stop: false }, 40)).toBe(-40);
    expect(probePower("extra", { forward: 0, turn: 0, extra: 1, extra2: 0, stop: false }, 50)).toBe(50);
    expect(probePower("extra2", { forward: 0, turn: 0, extra: 0, extra2: -1, stop: false }, 40)).toBe(-40);
    expect(probePower("forward", { forward: 1, turn: 0, extra: 0, extra2: 0, stop: true }, 50)).toBe(0);
    expect(probeCommands("A", 50, false)).toEqual([{ cmd: "motor.run", port: "A", speed: 50 }]);
    expect(probeCommands("C", 50, true)).toEqual([{ cmd: "motor.run", port: "C", speed: -50 }]);
    expect(probeCommands("A", 0, false)).toEqual([{ cmd: "motor.stop", port: "A" }]);
  });
});

describe("remote drive planning", () => {
  const tank = { ...defaultRemoteConfig(), layout: "tank" as const, api: "move" as const };
  const motorTank = { ...tank, api: "motor" as const };
  const steer = { ...defaultRemoteConfig(), layout: "steer" as const, api: "motor" as const };
  const straight = { ...defaultRemoteConfig(), layout: "straight" as const, api: "move" as const };

  it("mixes tank speeds and zeros them on Space", () => {
    expect(drivePowers(tank, { forward: 1, turn: 1, extra: 0, extra2: 0, stop: false })).toEqual({ left: 100, right: 0, extra: 0, extra2: 0 });
    expect(drivePowers(tank, { forward: 0, turn: -1, extra: 0, extra2: 0, stop: false })).toEqual({ left: -50, right: 50, extra: 0, extra2: 0 });
    expect(drivePowers(tank, { forward: 1, turn: 0, extra: 1, extra2: 0, stop: true })).toEqual({ left: 0, right: 0, drive: 0, steer: 0, extra: 0, extra2: 0 });
  });

  it("flips tank turn mix when drive wheels are at the front", () => {
    expect(tankTurnSign("rear")).toBe(-1);
    expect(tankTurnSign("front")).toBe(1);
    const front = { ...tank, tankAxle: "front" as const };
    expect(drivePowers(front, { forward: 0, turn: 1, extra: 0, extra2: 0, stop: false })).toEqual({ left: -50, right: 50, extra: 0, extra2: 0 });
    expect(drivePowers(tank, { forward: 0, turn: 1, extra: 0, extra2: 0, stop: false })).toEqual({ left: 50, right: -50, extra: 0, extra2: 0 });
  });

  it("scales each motor cap by the throttle", () => {
    expect(scaledSpeed(40, 50)).toBe(20);
    expect(scaledSpeed(80, 100)).toBe(80);
    const tuned = { ...steer, speed: 50, speedDrive: 80, speedSteer: 40, speedExtra: 20, speedExtra2: 30 };
    expect(drivePowers(tuned, { forward: 1, turn: -1, extra: 1, extra2: 1, stop: false })).toEqual({ drive: 40, steer: -20, extra: 10, extra2: 15 });
    const tankTuned = { ...tank, speed: 100, speedLeft: 40, speedRight: 80 };
    expect(drivePowers(tankTuned, { forward: 1, turn: 0, extra: 0, extra2: 0, stop: false })).toEqual({ left: 40, right: 80, extra: 0, extra2: 0 });
    expect(drivePowers(tankTuned, { forward: 0, turn: 1, extra: 0, extra2: 0, stop: false })).toEqual({ left: 40, right: -80, extra: 0, extra2: 0 });
  });

  it("sends move.tank or individual motor.run commands", () => {
    const powers = drivePowers(tank, { forward: 1, turn: 0, extra: 0, extra2: 0, stop: false });
    expect(planRemoteCommands(tank, powers, false)).toEqual([
      { cmd: "move.tank", leftPort: "A", rightPort: "B", leftSpeed: 50, rightSpeed: 50 },
    ]);
    expect(planRemoteCommands(motorTank, powers, false)).toEqual([
      { cmd: "motor.run", port: "A", speed: 50 },
      { cmd: "motor.run", port: "B", speed: 50 },
    ]);
  });

  it("drives one motor and steers the other in steer/motor mode", () => {
    const powers = drivePowers(steer, { forward: 1, turn: -1, extra: 0, extra2: 0, stop: false });
    expect(powers).toEqual({ drive: 50, steer: -50, extra: 0, extra2: 0 });
    expect(planRemoteCommands(steer, powers, false)).toEqual([
      { cmd: "motor.run", port: "A", speed: 50 },
      { cmd: "motor.run", port: "C", speed: -50 },
    ]);
  });

  it("turns move steering into a full lock from the steering cap", () => {
    const moveSteer = { ...defaultRemoteConfig(), layout: "steer" as const, api: "move" as const, speed: 50, speedSteer: 40, speedDrive: 80 };
    const powers = drivePowers(moveSteer, { forward: 1, turn: -1, extra: 0, extra2: 0, stop: false });
    expect(powers.steer).toBe(-20);
    expect(planRemoteCommands(moveSteer, powers, false)).toEqual([
      { cmd: "move.start", leftPort: "A", rightPort: "B", speed: 40, steering: -100 },
    ]);
  });

  it("uses move.start without steering for the straight layout", () => {
    const powers = drivePowers(straight, { forward: -1, turn: 1, extra: 0, extra2: 0, stop: false });
    expect(powers).toEqual({ drive: -50, extra: 0, extra2: 0 });
    expect(planRemoteCommands(straight, powers, false)).toEqual([
      { cmd: "move.start", leftPort: "A", rightPort: "B", speed: -50, steering: 0 },
    ]);
  });

  it("omits extra commands until a motor port is selected", () => {
    expect(invertPower(40, true)).toBe(-40);
    const commands = planRemoteCommands({ ...tank, invertLeft: true }, { left: 50, right: 50, extra: 20 }, false);
    expect(commands[0]).toMatchObject({ cmd: "move.tank", leftSpeed: -50, rightSpeed: 50 });
    expect(commands.some(command => command.port === "E")).toBe(false);
    expect(planRemoteCommands({ ...steer, extraPort: "" }, { drive: 50, extra: 20 }, true)).toEqual([
      { cmd: "motor.run", port: "A", speed: 50 },
    ]);
    expect(planRemoteCommands({ ...steer, extraPort: "F" }, { drive: 50, extra: 20 }, true)).toEqual([
      { cmd: "motor.run", port: "A", speed: 50 },
      { cmd: "motor.run", port: "F", speed: 20 },
    ]);
    expect(planRemoteCommands({ ...steer, extraPort: "E", extra2Port: "F" }, { drive: 50, extra: 20, extra2: -10 }, true)).toEqual([
      { cmd: "motor.run", port: "A", speed: 50 },
      { cmd: "motor.run", port: "E", speed: 20 },
      { cmd: "motor.run", port: "F", speed: -10 },
    ]);
  });

  it("keeps Q/E and R/F live after setup without mixing idle drive stops", () => {
    const ready = wizardView(5, "tank", true);
    const configured = {
      ...motorTank,
      extraPort: "E" as const,
      extra2Port: "F" as const,
      speedExtra: 40,
      speedExtra2: 30,
      speed: 100,
      setupDone: true,
    };
    expect(liveRemoteCommands(ready, configured, { forward: 0, turn: 0, extra: -1, extra2: 0, stop: false })).toEqual([
      { cmd: "motor.run", port: "E", speed: -40 },
    ]);
    expect(liveRemoteCommands(ready, configured, { forward: 0, turn: 0, extra: 0, extra2: 1, stop: false })).toEqual([
      { cmd: "motor.run", port: "F", speed: 30 },
    ]);
    expect(liveRemoteCommands(ready, configured, { forward: 0, turn: 0, extra: 0, extra2: 0, stop: false }, { extra2: true })).toEqual([
      { cmd: "motor.stop", port: "F" },
    ]);
    expect(liveRemoteCommands(ready, configured, { forward: 1, turn: 0, extra: 1, extra2: -1, stop: false })).toEqual([
      { cmd: "motor.run", port: "A", speed: 50 },
      { cmd: "motor.run", port: "B", speed: 50 },
      { cmd: "motor.run", port: "E", speed: 40 },
      { cmd: "motor.run", port: "F", speed: -30 },
    ]);
  });

  it("clamps speed and rejects invalid stored config", () => {
    expect(clamp(140)).toBe(100);
    expect(defaultRemoteConfig()).toMatchObject({
      layout: "steer", api: "motor", speed: 100, speedDrive: 50, speedSteer: 50, extraPort: "", setupDone: false, wizardStep: 0,
    });
    expect(parseRemoteConfig({ layout: "hover", api: "telekinesis", speed: 900, leftPort: "Z" })).toMatchObject({
      layout: "steer", api: "motor", speed: 100, speedDrive: 100, speedSteer: 100, leftPort: "A", extraPort: "", setupDone: false,
    });
    expect(parseRemoteConfig({ speed: 40 })).toMatchObject({
      speed: 100, speedLeft: 40, speedRight: 40, speedDrive: 40, speedSteer: 40, speedExtra: 40,
    });
    expect(parseRemoteConfig({ speed: 80, speedDrive: 30, speedSteer: 70 })).toMatchObject({
      speed: 80, speedDrive: 30, speedSteer: 70, speedLeft: 50,
    });
    expect(parseRemoteConfig({ layout: "tank", api: "move", extraPort: "E", setupDone: true, wizardStep: 3 })).toMatchObject({
      layout: "tank", api: "move", extraPort: "E", setupDone: true, wizardStep: 3,
    });
    expect(commandSignature([{ cmd: "move.stop" }])).toBe(JSON.stringify([{ cmd: "move.stop" }]));
  });

  it("restores the last finished setup when the draft is incomplete", () => {
    const ready = { layout: "tank", leftPort: "C", rightPort: "D", setupDone: true, wizardStep: 4 };
    const draft = { layout: "steer", setupDone: false, wizardStep: 0 };
    expect(resolveStoredRemoteConfig(draft, ready)).toMatchObject({
      layout: "tank", leftPort: "C", rightPort: "D", setupDone: true,
    });
    expect(resolveStoredRemoteConfig({ ...ready, speedDrive: 40 }, ready)).toMatchObject({
      setupDone: true, speedDrive: 40,
    });
    expect(resolveStoredRemoteConfig(draft, null)).toMatchObject({ setupDone: false, layout: "steer" });
  });
});

describe("remote sensor HUD", () => {
  const telemetry: HubTelemetry = {
    ports: {
      A: { kind: "motor", motorType: "large", speed: 12, position: 0, absolutePosition: 0, power: 20 },
      C: { kind: "distance", distance: 237 },
      D: { kind: "force", force: 80, pressed: true },
      E: { kind: "color", color: "Red", rgb: [400, 10, 12] },
    },
  };

  it("lists connected motor ports", () => {
    expect(motorPorts(telemetry)).toEqual(["A"]);
    expect(motorPorts(undefined)).toEqual([]);
  });

  it("formats distance, button and color pods", () => {
    const sensors = remoteSensors(telemetry, "cs");
    expect(sensors.map(sensor => sensor.kind)).toEqual(["distance", "force", "color"]);
    expect(sensors[0].value).toBe("23.7 cm");
    expect(sensors[0].ratio).toBeCloseTo(distanceVisualRatio(23.7));
    expect(sensors[1]).toMatchObject({ value: "Stisk", pressed: true });
    expect(sensors[2].value).toBe("Červená");
    expect(sensors[2].detail).toBe("R 100 · G 2 · B 3");
    expect(colorLabel("Red", "en")).toBe("Red");
    expect(formatDistance(-1, "en").value).toBe("Out of range");
    expect(distanceVisualRatio(0)).toBe(0);
    expect(distanceVisualRatio(50)).toBeGreaterThan(50 / 200);
    expect(distanceVisualRatio(50)).toBeCloseTo(Math.sqrt(50 / 200));
    expect(distanceVisualRatio(200)).toBe(1);
    expect(formatDistance(2000, "en").ratio).toBe(1);
    expect(formatDistance(2500, "en").ratio).toBe(1);
    expect(rgb8([1023, 0, 511])).toEqual([255, 0, 127]);
    expect(formatRgb([1023, 0, 0])).toBe("R 255 · G 0 · B 0");
    expect(colorCss("Red", [400, 10, 12])).toBe("#e94b58");
    expect(colorCss("Unknown", [0, 1023, 0])).toBe("rgb(0 255 0)");
  });

  it("places distance, color and button onto the car layout", () => {
    expect(carSensors(remoteSensors(telemetry, "en"))).toMatchObject({
      distance: { port: "C" },
      color: { port: "E", value: "Red" },
      force: { port: "D", pressed: true },
    });
    expect(carSensors(remoteSensors(telemetry, "en")).distance?.ratio).toBeCloseTo(distanceVisualRatio(23.7));
    expect(carSensors([])).toEqual({ distance: undefined, color: undefined, force: undefined });
  });
});
