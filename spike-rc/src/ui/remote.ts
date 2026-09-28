import { PORTS, type HubTelemetry, type Port, type SpikeHub } from "spike-link";

export type Locale = "en" | "cs";
export type ExtraPort = Port | "";
export type DriveLayout = "tank" | "steer" | "straight";
export type DriveApi = "move" | "motor";
export type TankAxle = "rear" | "front";
export type HubCommand = Record<string, unknown>;
export type MotorRole = "left" | "right" | "drive" | "steer" | "extra" | "extra2";
export type MotorPowers = Partial<Record<MotorRole, number>>;

export type RemoteIntent = {
  forward: number;
  turn: number;
  extra: number;
  extra2: number;
  stop: boolean;
};

export type MotorSpeedKey = "speedLeft" | "speedRight" | "speedDrive" | "speedSteer" | "speedExtra" | "speedExtra2";
export type SpeedKey = MotorSpeedKey | "speed";

export type RemoteConfig = {
  layout: DriveLayout;
  api: DriveApi;
  tankAxle: TankAxle;
  speed: number;
  speedLeft: number;
  speedRight: number;
  speedDrive: number;
  speedSteer: number;
  speedExtra: number;
  speedExtra2: number;
  leftPort: Port;
  rightPort: Port;
  drivePort: Port;
  steerPort: Port;
  extraPort: ExtraPort;
  extra2Port: ExtraPort;
  invertLeft: boolean;
  invertRight: boolean;
  invertDrive: boolean;
  invertSteer: boolean;
  invertExtra: boolean;
  invertExtra2: boolean;
  setupDone: boolean;
  wizardStep: number;
};

export type WizardAssign = {
  role: "left" | "right" | "drive" | "steer";
  portKey: "leftPort" | "rightPort" | "drivePort" | "steerPort";
  invertKey: "invertLeft" | "invertRight" | "invertDrive" | "invertSteer";
  speedKey: MotorSpeedKey;
  axis: "forward" | "turn";
};

export type WizardView =
  | { kind: "mode"; index: number; total: number }
  | { kind: "assign"; index: number; total: number; assign: WizardAssign }
  | { kind: "extra"; index: number; total: number; slot: 1 | 2 }
  | { kind: "ready"; index: number; total: number };

export type DriveAxis = "none" | "forward" | "turn" | "all";

export type RemoteSensor = {
  port: Port;
  kind: "distance" | "force" | "color";
  title: string;
  value: string;
  detail: string;
  ratio: number;
  color: string;
  pressed: boolean;
};

const REMOTE_KEYS = ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyR", "KeyF", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"] as const;
const COLOR_HEX: Record<string, string> = {
  Black: "#1b1e24", Magenta: "#e23bb3", Purple: "#8a52d8", Blue: "#2f86ee", Azure: "#2ab4e8",
  Turquoise: "#22c4b8", Green: "#2db86a", Yellow: "#e6c31c", Orange: "#f08b2a", Red: "#e94b58",
  White: "#f4f7fb", Unknown: "#8b95a5",
};
const COLOR_CS: Record<string, string> = {
  Black: "Černá", Magenta: "Purpurová", Purple: "Fialová", Blue: "Modrá", Azure: "Azurová",
  Turquoise: "Tyrkysová", Green: "Zelená", Yellow: "Žlutá", Orange: "Oranžová", Red: "Červená",
  White: "Bílá", Unknown: "Neznámá",
};

export function isRemoteKey(code: string): boolean {
  return (REMOTE_KEYS as readonly string[]).includes(code);
}

export function wasdLabelForArrow(code: string): string | undefined {
  if (code === "ArrowUp") return "W";
  if (code === "ArrowLeft") return "A";
  if (code === "ArrowDown") return "S";
  if (code === "ArrowRight") return "D";
  return undefined;
}

export function clamp(value: number, min = -100, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

const MOTOR_SPEED_KEYS: MotorSpeedKey[] = ["speedLeft", "speedRight", "speedDrive", "speedSteer", "speedExtra", "speedExtra2"];

export function defaultRemoteConfig(): RemoteConfig {
  return {
    layout: "steer", api: "motor", tankAxle: "rear", speed: 100,
    speedLeft: 50, speedRight: 50, speedDrive: 50, speedSteer: 50, speedExtra: 50, speedExtra2: 50,
    leftPort: "A", rightPort: "B", drivePort: "A", steerPort: "C", extraPort: "", extra2Port: "",
    invertLeft: false, invertRight: false, invertDrive: false, invertSteer: false, invertExtra: false, invertExtra2: false,
    setupDone: false, wizardStep: 0,
  };
}

export function parseRemoteConfig(raw: unknown): RemoteConfig {
  const fallback = defaultRemoteConfig();
  if (!raw || typeof raw !== "object") return fallback;
  const value = raw as Partial<RemoteConfig>;
  const port = (candidate: unknown, fallbackPort: Port): Port => PORTS.includes(candidate as Port) ? candidate as Port : fallbackPort;
  const storedSpeed = (candidate: unknown): number | undefined => {
    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? Math.round(clamp(parsed, 1, 100)) : undefined;
  };
  const legacy = storedSpeed(value.speed) ?? fallback.speedDrive;
  const hasRoleSpeeds = MOTOR_SPEED_KEYS.some(key => storedSpeed(value[key]) !== undefined);
  const cap = (candidate: unknown) => storedSpeed(candidate) ?? (hasRoleSpeeds ? fallback.speedDrive : legacy);
  return {
    layout: value.layout === "tank" || value.layout === "straight" ? value.layout : "steer",
    api: value.api === "move" ? "move" : "motor",
    tankAxle: value.tankAxle === "front" ? "front" : "rear",
    speed: hasRoleSpeeds ? (storedSpeed(value.speed) ?? fallback.speed) : 100,
    speedLeft: cap(value.speedLeft),
    speedRight: cap(value.speedRight),
    speedDrive: cap(value.speedDrive),
    speedSteer: cap(value.speedSteer),
    speedExtra: cap(value.speedExtra),
    speedExtra2: cap(value.speedExtra2),
    leftPort: port(value.leftPort, fallback.leftPort),
    rightPort: port(value.rightPort, fallback.rightPort),
    drivePort: port(value.drivePort, fallback.drivePort),
    steerPort: port(value.steerPort, fallback.steerPort),
    extraPort: PORTS.includes(value.extraPort as Port) ? value.extraPort as Port : "",
    extra2Port: PORTS.includes(value.extra2Port as Port) ? value.extra2Port as Port : "",
    invertLeft: value.invertLeft === true,
    invertRight: value.invertRight === true,
    invertDrive: value.invertDrive === true,
    invertSteer: value.invertSteer === true,
    invertExtra: value.invertExtra === true,
    invertExtra2: value.invertExtra2 === true,
    setupDone: value.setupDone === true,
    wizardStep: Math.max(0, Math.round(Number(value.wizardStep) || 0)),
  };
}

/** Prefer a finished setup over an abandoned wizard draft. */
export function resolveStoredRemoteConfig(draft: unknown, ready: unknown): RemoteConfig {
  const current = parseRemoteConfig(draft);
  if (current.setupDone) return current;
  const completed = parseRemoteConfig(ready);
  if (completed.setupDone) return completed;
  return current;
}

export function wizardAssignSteps(layout: DriveLayout): WizardAssign[] {
  if (layout === "tank") {
    return [
      { role: "left", portKey: "leftPort", invertKey: "invertLeft", speedKey: "speedLeft", axis: "forward" },
      { role: "right", portKey: "rightPort", invertKey: "invertRight", speedKey: "speedRight", axis: "forward" },
    ];
  }
  if (layout === "steer") {
    return [
      { role: "drive", portKey: "drivePort", invertKey: "invertDrive", speedKey: "speedDrive", axis: "forward" },
      { role: "steer", portKey: "steerPort", invertKey: "invertSteer", speedKey: "speedSteer", axis: "turn" },
    ];
  }
  return [{ role: "drive", portKey: "drivePort", invertKey: "invertDrive", speedKey: "speedDrive", axis: "forward" }];
}

export function wizardExtraIndex(layout: DriveLayout): number {
  return wizardAssignSteps(layout).length + 1;
}

export function wizardExtra2Index(layout: DriveLayout): number {
  return wizardExtraIndex(layout) + 1;
}

export type WizardTab = { step: number; label: string };

export function wizardTabs(layout: DriveLayout, locale: Locale): WizardTab[] {
  const cs = locale === "cs";
  const roleLabel = (role: WizardAssign["role"]) => {
    if (role === "left") return cs ? "Levý" : "Left";
    if (role === "right") return cs ? "Pravý" : "Right";
    if (role === "steer") return cs ? "Zatáčení" : "Steering";
    return cs ? "Pohon" : "Drive";
  };
  const assigns = wizardAssignSteps(layout);
  return [
    { step: 0, label: cs ? "Režim" : "Mode" },
    ...assigns.map((assign, index) => ({ step: index + 1, label: roleLabel(assign.role) })),
    { step: assigns.length + 1, label: "Q·E" },
    { step: assigns.length + 2, label: "R·F" },
  ];
}

export function wantsSetupOnConnect(wasConnected: boolean, connected: boolean, setupDone: boolean): boolean {
  return connected && !wasConnected && !setupDone;
}

export function shouldShowSetupModal(connected: boolean, setupDone: boolean, reopenRequested: boolean): boolean {
  if (setupDone) return false;
  return connected || reopenRequested;
}

export function wizardView(step: number, layout: DriveLayout, setupDone = false): WizardView {
  const assigns = wizardAssignSteps(layout);
  const extraIndex = wizardExtraIndex(layout);
  const extra2Index = wizardExtra2Index(layout);
  const total = extra2Index + 2;
  if (setupDone) return { kind: "ready", index: total - 1, total };
  const clamped = Math.max(0, Math.min(Math.round(step), total - 1));
  if (clamped === 0) return { kind: "mode", index: 0, total };
  if (clamped <= assigns.length) return { kind: "assign", index: clamped, total, assign: assigns[clamped - 1] };
  if (clamped === extraIndex) return { kind: "extra", index: extraIndex, total, slot: 1 };
  if (clamped === extra2Index) return { kind: "extra", index: extra2Index, total, slot: 2 };
  return { kind: "ready", index: clamped, total };
}

const FORWARD_KEYS = ["ArrowUp", "ArrowDown", "KeyW", "KeyS"];
const TURN_KEYS = ["ArrowLeft", "ArrowRight", "KeyA", "KeyD"];

export function activeDriveAxis(view: WizardView, layout: DriveLayout): DriveAxis {
  if (view.kind === "assign") return view.assign.axis;
  if (view.kind === "ready") return layout === "straight" ? "forward" : "all";
  return "none";
}

export function isDirectionKeyEnabled(code: string, axis: DriveAxis): boolean {
  if (FORWARD_KEYS.includes(code)) return axis === "forward" || axis === "all";
  if (TURN_KEYS.includes(code)) return axis === "turn" || axis === "all";
  return true;
}

export function hasExtraMotor(port: string): port is Port {
  return PORTS.includes(port as Port);
}

export function readySetupSummary(config: RemoteConfig, locale: Locale): string {
  const extras = [
    hasExtraMotor(config.extraPort) ? `Extra1 ${config.extraPort}` : "",
    hasExtraMotor(config.extra2Port) ? `Extra2 ${config.extra2Port}` : "",
  ].filter(Boolean);
  const extra = extras.length ? ` · ${extras.join(" · ")}` : "";
  if (config.layout === "tank") {
    const axle = config.tankAxle === "front"
      ? (locale === "cs" ? "vpředu" : "front")
      : (locale === "cs" ? "vzadu" : "rear");
    return `${locale === "cs" ? "Levý" : "Left"} ${config.leftPort} · ${locale === "cs" ? "Pravý" : "Right"} ${config.rightPort} · ${axle}${extra}`;
  }
  if (config.layout === "steer") {
    return `${locale === "cs" ? "Pohon" : "Drive"} ${config.drivePort} · ${locale === "cs" ? "Zatáčení" : "Steer"} ${config.steerPort}${extra}`;
  }
  return `${locale === "cs" ? "Pohon" : "Drive"} ${config.drivePort}${extra}`;
}

export function isMainDriveLocked(setupDone: boolean, tryoutActive: boolean): boolean {
  return !setupDone && !tryoutActive;
}

export function mainDriveLockMessage(locale: Locale): string {
  return locale === "cs" ? "Nejprve nastavte autíčko." : "Set up the car first.";
}

export function isRemoteControlEnabled(
  code: string,
  axis: DriveAxis,
  extraPort: ExtraPort,
  extra2Port: ExtraPort = "",
  view?: WizardView,
): boolean {
  if (code === "KeyQ" || code === "KeyE") {
    if (view?.kind === "extra" && view.slot !== 1) return false;
    return hasExtraMotor(extraPort);
  }
  if (code === "KeyR" || code === "KeyF") {
    if (view?.kind === "extra" && view.slot !== 2) return false;
    return hasExtraMotor(extra2Port);
  }
  return isDirectionKeyEnabled(code, axis);
}

export function scaledSpeed(cap: number, throttle: number): number {
  return Math.round(clamp(cap, 0, 100) * clamp(throttle, 0, 100) / 100);
}

export function activeSpeedKey(view: WizardView): SpeedKey {
  if (view.kind === "assign") return view.assign.speedKey;
  if (view.kind === "extra") return view.slot === 2 ? "speedExtra2" : "speedExtra";
  return "speed";
}

export function speedControlLabel(key: SpeedKey, locale: Locale): string {
  const cs = locale === "cs";
  if (key === "speedLeft") return cs ? "Levý" : "Left";
  if (key === "speedRight") return cs ? "Pravý" : "Right";
  if (key === "speedDrive") return cs ? "Pohon" : "Drive";
  if (key === "speedSteer") return cs ? "Zatáčení" : "Steering";
  if (key === "speedExtra") return "Extra 1";
  if (key === "speedExtra2") return "Extra 2";
  return cs ? "Plyn" : "Throttle";
}

export function probePower(axis: "forward" | "turn" | "extra" | "extra2", intent: RemoteIntent, speed: number): number {
  if (intent.stop) return 0;
  const direction = axis === "forward" ? intent.forward
    : axis === "turn" ? intent.turn
      : axis === "extra2" ? intent.extra2
        : intent.extra;
  return direction * speed;
}

export function probeCommands(port: Port, power: number, invert: boolean): HubCommand[] {
  const speed = invertPower(power, invert);
  return [speed === 0 ? { cmd: "motor.stop", port } : { cmd: "motor.run", port, speed }];
}

export function motorPorts(state: HubTelemetry | undefined): Port[] {
  if (!state) return [];
  return PORTS.filter(port => state.ports[port]?.kind === "motor");
}

export function tankTurnSign(axle: TankAxle): 1 | -1 {
  // Front axle inverts yaw relative to a rear-drive car.
  return axle === "front" ? 1 : -1;
}

export function intentFromKeys(keys: Iterable<string>): RemoteIntent {
  const set = keys instanceof Set ? keys : new Set(keys);
  const axis = (negative: string[], positive: string[]) => (positive.some(code => set.has(code)) ? 1 : 0) - (negative.some(code => set.has(code)) ? 1 : 0);
  return {
    forward: axis(["KeyS", "ArrowDown"], ["KeyW", "ArrowUp"]),
    turn: axis(["KeyA", "ArrowLeft"], ["KeyD", "ArrowRight"]),
    extra: axis(["KeyQ"], ["KeyE"]),
    extra2: axis(["KeyR"], ["KeyF"]),
    stop: set.has("Space"),
  };
}

export function drivePowers(config: RemoteConfig, intent: RemoteIntent): MotorPowers {
  if (intent.stop) return { left: 0, right: 0, drive: 0, steer: 0, extra: 0, extra2: 0 };
  const at = (cap: number) => scaledSpeed(cap, config.speed);
  const extras = {
    extra: (intent.extra ?? 0) * at(config.speedExtra),
    extra2: (intent.extra2 ?? 0) * at(config.speedExtra2),
  };
  if (config.layout === "tank") {
    const left = at(config.speedLeft);
    const right = at(config.speedRight);
    const turn = (intent.turn ?? 0) * tankTurnSign(config.tankAxle);
    // After tankTurnSign: right key with rear axle → left forward, right reverse
    return {
      left: Math.round(clamp(intent.forward * left - turn * left)),
      right: Math.round(clamp(intent.forward * right + turn * right)),
      ...extras,
    };
  }
  if (config.layout === "steer") {
    return { drive: intent.forward * at(config.speedDrive), steer: intent.turn * at(config.speedSteer), ...extras };
  }
  return { drive: intent.forward * at(config.speedDrive), ...extras };
}

export function invertPower(value: number, invert: boolean): number {
  return invert ? -value : value;
}

export function commandSignature(commands: HubCommand[]): string {
  return JSON.stringify(commands);
}

export function planRemoteCommands(config: RemoteConfig, powers: MotorPowers, includeExtra = true): HubCommand[] {
  const commands: HubCommand[] = [];
  const motor = (port: Port, speed: number | undefined, invert: boolean) => {
    if (speed === undefined) return;
    const value = invertPower(speed, invert);
    commands.push(value === 0 ? { cmd: "motor.stop", port } : { cmd: "motor.run", port, speed: value });
  };

  if (config.api === "move") {
    const leftPort = config.leftPort, rightPort = config.rightPort;
    if (config.layout === "tank") {
      const left = invertPower(powers.left ?? 0, config.invertLeft);
      const right = invertPower(powers.right ?? 0, config.invertRight);
      commands.push(left === 0 && right === 0
        ? { cmd: "move.stop", leftPort, rightPort }
        : { cmd: "move.tank", leftPort, rightPort, leftSpeed: left, rightSpeed: right });
    } else {
      const speed = invertPower(powers.drive ?? 0, config.invertDrive);
      const steerSpeed = Math.max(scaledSpeed(config.speedSteer, config.speed), 1);
      const steering = config.layout === "steer"
        ? invertPower(Math.round(clamp(((powers.steer ?? 0) / steerSpeed) * 100, -100, 100)), config.invertSteer)
        : 0;
      commands.push(speed === 0 && steering === 0
        ? { cmd: "move.stop", leftPort, rightPort }
        : { cmd: "move.start", leftPort, rightPort, speed, steering });
    }
  } else if (config.layout === "tank") {
    motor(config.leftPort, powers.left, config.invertLeft);
    motor(config.rightPort, powers.right, config.invertRight);
  } else if (config.layout === "steer") {
    motor(config.drivePort, powers.drive, config.invertDrive);
    motor(config.steerPort, powers.steer, config.invertSteer);
  } else {
    motor(config.drivePort, powers.drive, config.invertDrive);
  }

  if (includeExtra && hasExtraMotor(config.extraPort)) motor(config.extraPort, powers.extra ?? 0, config.invertExtra);
  if (includeExtra && hasExtraMotor(config.extra2Port)) motor(config.extra2Port, powers.extra2 ?? 0, config.invertExtra2);
  return commands;
}

/** Commands for the current wizard/ready view, including Q/E and R/F extras after setup. */
export function liveRemoteCommands(
  view: WizardView,
  config: RemoteConfig,
  intent: RemoteIntent,
  live: boolean | { extra?: boolean; extra2?: boolean } = false,
): HubCommand[] {
  const flags = typeof live === "boolean" ? { extra: live, extra2: live } : live;
  const testingExtra1 = view.kind === "extra" && view.slot === 1;
  const testingExtra2 = view.kind === "extra" && view.slot === 2;
  const testingAssign = view.kind === "assign";
  const extraSpeed = testingExtra1 || testingAssign ? config.speedExtra : scaledSpeed(config.speedExtra, config.speed);
  const extra2Speed = testingExtra2 || testingAssign ? config.speedExtra2 : scaledSpeed(config.speedExtra2, config.speed);
  const extraPower = intent.stop ? 0 : intent.extra * extraSpeed;
  const extra2Power = intent.stop ? 0 : intent.extra2 * extra2Speed;
  const wantExtra = hasExtraMotor(config.extraPort) && (extraPower !== 0 || !!flags.extra || intent.stop);
  const wantExtra2 = hasExtraMotor(config.extra2Port) && (extra2Power !== 0 || !!flags.extra2 || intent.stop);

  const appendExtras = (commands: HubCommand[]) => {
    let next = commands;
    if (wantExtra) next = [...next, ...probeCommands(config.extraPort, extraPower, config.invertExtra)];
    if (wantExtra2) next = [...next, ...probeCommands(config.extra2Port, extra2Power, config.invertExtra2)];
    return next;
  };

  if (view.kind === "assign") {
    return appendExtras(probeCommands(
      config[view.assign.portKey],
      probePower(view.assign.axis, intent, config[view.assign.speedKey]),
      config[view.assign.invertKey],
    ));
  }

  if (view.kind === "extra") {
    if (view.slot === 2) {
      return hasExtraMotor(config.extra2Port) ? probeCommands(config.extra2Port, extra2Power, config.invertExtra2) : [];
    }
    return hasExtraMotor(config.extraPort) ? probeCommands(config.extraPort, extraPower, config.invertExtra) : [];
  }

  if (view.kind !== "ready") return [];

  // Extras alone: only talk to those motors (same as setup tryout).
  if ((wantExtra || wantExtra2) && intent.forward === 0 && intent.turn === 0 && !intent.stop) {
    return appendExtras([]);
  }

  return planRemoteCommands(config, drivePowers(config, intent), wantExtra || wantExtra2);
}

export const DISTANCE_RANGE_CM = 200;

export function distanceVisualRatio(cm: number, maxCm = DISTANCE_RANGE_CM): number {
  if (cm <= 0) return 0;
  return Math.sqrt(clamp(cm / maxCm, 0, 1));
}

export function formatDistance(mm: number, locale: Locale): { value: string; detail: string; ratio: number } {
  if (mm < 0) return { value: locale === "cs" ? "Mimo dosah" : "Out of range", detail: locale === "cs" ? "žádný odraz" : "no echo", ratio: 0 };
  const cm = mm / 10;
  return {
    value: `${cm.toFixed(mm % 10 ? 1 : 0)} cm`,
    detail: `${mm} mm`,
    ratio: distanceVisualRatio(cm),
  };
}

export function rgb8(rgb: [number, number, number], maxRaw = 1023): [number, number, number] {
  return rgb.map(channel => Math.round(clamp(Number(channel) || 0, 0, maxRaw) / maxRaw * 255)) as [number, number, number];
}

export function formatRgb(rgb: [number, number, number]): string {
  const [r, g, b] = rgb8(rgb);
  return `R ${r} · G ${g} · B ${b}`;
}

export function colorCss(color: string, rgb?: [number, number, number]): string {
  const named = COLOR_HEX[color];
  if (named && color !== "Unknown") return named;
  if (rgb && rgb.some(channel => channel > 0)) {
    const scaled = rgb8(rgb);
    const max = Math.max(...scaled, 1);
    return `rgb(${scaled.map(channel => Math.round(channel * 255 / max)).join(" ")})`;
  }
  return COLOR_HEX.Unknown;
}

export function colorLabel(color: string, locale: Locale): string {
  if (locale === "en") return color;
  return COLOR_CS[color] ?? color;
}

export function remoteSensors(state: HubTelemetry | undefined, locale: Locale): RemoteSensor[] {
  if (!state) return [];
  const sensors: RemoteSensor[] = [];
  for (const port of PORTS) {
    const device = state.ports[port];
    if (!device) continue;
    if (device.kind === "distance") {
      const distance = formatDistance(device.distance, locale);
      sensors.push({ port, kind: "distance", title: locale === "cs" ? "Vzdálenost" : "Distance", value: distance.value, detail: distance.detail, ratio: distance.ratio, color: "#3cf6ff", pressed: false });
    } else if (device.kind === "force") {
      sensors.push({
        port, kind: "force",
        title: locale === "cs" ? "Tlačítko" : "Button",
        value: device.pressed ? (locale === "cs" ? "Stisk" : "Pressed") : (locale === "cs" ? "Volné" : "Released"),
        detail: `${device.force}%`,
        ratio: clamp(device.force, 0, 100) / 100,
        color: device.pressed ? "#ff5d7a" : "#7b8ca3",
        pressed: device.pressed,
      });
    } else if (device.kind === "color") {
      sensors.push({
        port, kind: "color",
        title: locale === "cs" ? "Barva" : "Color",
        value: colorLabel(device.color, locale),
        detail: formatRgb(device.rgb),
        ratio: 1,
        color: colorCss(device.color, device.rgb),
        pressed: false,
      });
    }
  }
  return sensors;
}

export type CarSensors = {
  distance?: RemoteSensor;
  color?: RemoteSensor;
  force?: RemoteSensor;
};

export function carSensors(sensors: RemoteSensor[]): CarSensors {
  return {
    distance: sensors.find(sensor => sensor.kind === "distance"),
    color: sensors.find(sensor => sensor.kind === "color"),
    force: sensors.find(sensor => sensor.kind === "force"),
  };
}

export class RemotePad {
  static readonly STORAGE_KEY = "spike-remote-v2";
  static readonly READY_KEY = "spike-remote-ready-v2";
  private config = resolveStoredRemoteConfig(this.readStored(RemotePad.STORAGE_KEY), this.readStored(RemotePad.READY_KEY));
  private keys = new Set<string>();
  private lastSignature = "";
  private extraLive = false;
  private extra2Live = false;
  private sending = false;
  private queued?: HubCommand[];
  private root?: HTMLElement;
  private telemetry?: HubTelemetry;
  private linked = false;
  private reopenRequested = false;

  constructor(
    private readonly hub: SpikeHub,
    private readonly log: (message: string, kind?: "info" | "error") => void,
    private readonly l: (en: string, cs: string) => string,
    private readonly locale: () => Locale,
  ) {}

  markup(): string {
    const c = this.config, l = this.l.bind(this);
    const speedKey = activeSpeedKey(wizardView(c.wizardStep, c.layout, c.setupDone));
    const shownSpeed = speedKey === "speed" ? c.speed : c[speedKey];
    const key = (code: string, glyph: string) => {
      const alt = wasdLabelForArrow(code);
      const locked = !c.setupDone ? " disabled" : "";
      return `<button type="button" class="remote-key" data-key="${code}"${locked}><strong>${glyph}</strong>${alt ? `<em>${alt}</em>` : ""}</button>`;
    };
    return `<section id="remote-view" class="remote-view"><div class="remote-cockpit" data-layout="${c.layout}" data-api="${c.api}" data-axis="none">
      <header class="remote-hud">
        <div class="remote-callsign"><span>RC-01</span><strong>${l("Remote link","Dálkové spojení")}</strong></div>
        <div class="remote-status"><i></i><b id="remote-link">${l("Offline","Offline")}</b><small id="remote-tx">TX · idle</small></div>
      </header>
      <div class="remote-shell">
        <section class="remote-rest">
          <span class="remote-kicker">${l("Other functions","Ostatní funkce")}</span>
          <h2>${l("Car","Autíčko")}</h2>
          <div id="remote-sensors" class="remote-sensors"></div>
        </section>
        <section class="remote-drive">
          <div class="remote-drive-head">
            <div>
              <span class="remote-kicker">${l("Movement","Pohyb")}</span>
              <h2>${l("Arrow drive","Jízda šipkami")}</h2>
            </div>
            <button type="button" class="remote-setup-edit" data-wizard="restart">${l("Change setup","Změnit nastavení")}</button>
          </div>
          <p id="remote-ready-summary" class="remote-setup-summary hidden"></p>
          <p id="remote-setup-hint" class="remote-setup-hint">${l("Connect the hub. The setup guide opens as soon as the link is up.","Připojte hub. Průvodce se otevře hned po spojení.")}</p>
          <div id="remote-drive-controls" class="${c.setupDone ? "" : "is-locked"}">
            <div class="remote-drive-pad">
              <div class="remote-arrows">
                <button type="button" class="remote-key fn" data-key="KeyQ" ${c.setupDone ? "" : "disabled"}><strong>Q</strong><em>Extra 1 −</em></button>
                ${key("ArrowUp", "▲")}
                <button type="button" class="remote-key fn" data-key="KeyE" ${c.setupDone ? "" : "disabled"}><strong>E</strong><em>Extra 1 +</em></button>
                <button type="button" class="remote-key fn" data-key="KeyR" ${c.setupDone ? "" : "disabled"}><strong>R</strong><em>Extra 2 −</em></button>
                ${key("ArrowLeft", "◀")}${key("ArrowDown", "▼")}${key("ArrowRight", "▶")}
                <button type="button" class="remote-key fn" data-key="KeyF" ${c.setupDone ? "" : "disabled"}><strong>F</strong><em>Extra 2 +</em></button>
              </div>
              <p class="remote-try-note">${l("Try only. These keys do not change the setup.","Jen vyzkoušení. Těmito klávesami se nic nenastavuje.")}</p>
              <p id="remote-arrow-hint" class="remote-arrow-hint">${c.setupDone ? l("Use the keyboard arrows","Použijte šipky na klávesnici") : mainDriveLockMessage(this.locale())}</p>
              <button type="button" class="remote-key space" data-key="Space" ${c.setupDone ? "" : "disabled"}><strong>SPACE</strong><em>${l("All stop","Stop vše")}</em></button>
            </div>
            <label id="remote-speed-field" class="remote-speed"><span><span id="remote-speed-label">${speedControlLabel(speedKey, this.locale())}</span> <b id="remote-speed-value">${shownSpeed}</b>%</span><input id="remote-speed" type="range" min="10" max="100" step="5" value="${shownSpeed}" ${c.setupDone ? "" : "disabled"}></label>
          </div>
        </section>
      </div>
    </div></section>
    <dialog id="remote-setup" class="setup-dialog" aria-labelledby="remote-setup-title">
      <div class="setup-dialog-frame">
        <header class="setup-head">
          <span class="remote-kicker">${l("Required","Nutné")}</span>
          <h2 id="remote-setup-title">${l("Set up the car","Nastavení autíčka")}</h2>
          <p class="setup-lead">${l("Go through these steps so the remote matches this car.","Projďte tyto kroky, ať dálkové ovládání sedí na tohle autíčko.")}</p>
        </header>
        <div class="setup-layout" data-tryout="off">
          <div id="remote-wizard" class="setup-main"></div>
          <aside id="remote-setup-tryout" class="setup-tryout" aria-label="${l("Tryout","Vyzkoušení")}">
            <span class="remote-kicker">${l("Preview","Náhled")}</span>
            <strong>${l("Try it out","Vyzkoušejte")}</strong>
            <p class="setup-tryout-copy">${l("These keys only spin the motor so you can check the port and direction. They do not save the setup.","Klávesy jen roztočí motor, ať zkontrolujete port a směr. Nastavení tím neuložíte.")}</p>
          </aside>
        </div>
        <footer id="remote-setup-actions" class="setup-actions"></footer>
      </div>
    </dialog>`;
  }

  bind(root: HTMLElement): void {
    this.root = root;
    const cockpit = root.querySelector<HTMLElement>(".remote-cockpit");
    if (!cockpit) return;
    this.el<HTMLInputElement>("remote-speed")?.addEventListener("input", event => {
      const key = activeSpeedKey(this.view());
      this.patchConfig({ [key]: Number((event.target as HTMLInputElement).value) }, false);
    });
    cockpit.querySelectorAll<HTMLButtonElement>("[data-key]").forEach(button => {
      const code = button.dataset.key!;
      button.addEventListener("pointerdown", event => {
        if (button.disabled) return;
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        this.setKey(code, true);
      });
      button.addEventListener("pointerup", () => this.setKey(code, false));
      button.addEventListener("pointercancel", () => this.setKey(code, false));
    });
    root.querySelector<HTMLDialogElement>("#remote-setup")?.addEventListener("cancel", event => event.preventDefault());
    this.renderWizard();
    this.renderSensors(this.telemetry);
    this.syncChrome();
    this.renderIntent();
    root.querySelector<HTMLButtonElement>("[data-wizard=restart]")?.addEventListener("click", () => {
      this.reopenRequested = true;
      this.patchConfig({ wizardStep: 0, setupDone: false }, true);
    });
  }

  wantsSetupPrompt(connected: boolean): boolean {
    return wantsSetupOnConnect(this.linked, connected, this.config.setupDone);
  }

  setActive(active: boolean): void {
    if (!active) this.release();
    this.root?.querySelector(".remote-cockpit")?.classList.toggle("armed", active);
  }

  handleKey(code: string, down: boolean): boolean {
    if (!isRemoteKey(code)) return false;
    if (isMainDriveLocked(this.config.setupDone, this.isTryoutActive())) return true;
    this.setKey(code, down);
    return true;
  }

  haltCommands(): HubCommand[] {
    return this.stopCommands(this.config);
  }

  release(): void {
    const hadKeys = this.keys.size > 0 || this.extraLive || this.extra2Live;
    this.keys.clear();
    this.renderIntent();
    if (!hadKeys) return;
    this.extraLive = false;
    this.extra2Live = false;
    this.lastSignature = "";
    this.dispatch(this.commandsForState());
  }

  renderSensors(state?: HubTelemetry): void {
    this.telemetry = state;
    const host = this.root?.querySelector("#remote-sensors");
    if (!host) return;
    const motors = new Set(motorPorts(state));
    this.root?.querySelectorAll<HTMLButtonElement>("[data-pick-port]").forEach(button => {
      button.classList.toggle("has-motor", motors.has(button.dataset.pickPort as Port));
    });
    host.innerHTML = this.carStage(carSensors(remoteSensors(state, this.locale())));
  }

  private carStage(view: CarSensors): string {
    const l = this.l.bind(this);
    const waiting = l("Waiting", "Čekám");
    const none = l("No device", "Bez zařízení");
    const distance = view.distance;
    const color = view.color;
    const force = view.force;
    const rangeState = !distance ? "waiting" : distance.ratio ? "" : "out";
    const ratio = distance?.ratio ?? 0;
    return `<div class="car-stage">
      <div class="car-range ${rangeState}" style="--ratio:${ratio}">
        <span class="car-kicker">${l("Forward","Dopředu")}</span>
        <em class="far">2 m</em>
        <em class="mid" style="bottom:${(distanceVisualRatio(60) * 100).toFixed(1)}%">60 cm</em>
        <i class="beam"></i>
        <b class="ping"></b>
        <strong>${distance?.value ?? waiting}</strong>
        <small>${distance ? `${distance.port} · ${distance.detail}` : none}</small>
        <em class="near">0</em>
      </div>
      <div class="car ${force?.pressed ? "pressed" : ""}">
        <i class="wheel fl"></i><i class="wheel fr"></i><i class="wheel rl"></i><i class="wheel rr"></i>
        <div class="car-body">
          <div class="car-color ${color ? "" : "waiting"}" style="${color ? `background:${color.color};color:${color.color}` : ""}" title="${l("Color sensor","Senzor barvy")}">
            <b>${color?.port ?? "—"}</b>
          </div>
          <div class="car-cabin"></div>
          <div class="car-button ${force ? (force.pressed ? "pressed" : "") : "waiting"}" title="${l("Button","Tlačítko")}">
            <span class="btn-rim"><span class="btn-cap"></span></span>
            <b>${force?.port ?? "—"}</b>
          </div>
        </div>
      </div>
      <div class="car-readouts">
        <p class="color ${color ? "" : "waiting"}"><span>${l("Color","Barva")}</span><strong>${color?.value ?? waiting}</strong><small>${color?.detail ?? none}</small></p>
        <p class="force ${force ? (force.pressed ? "pressed" : "") : "waiting"}"><span>${l("Button","Tlačítko")}</span><strong>${force?.value ?? waiting}</strong><small>${force?.detail ?? none}</small></p>
      </div>
    </div>`;
  }

  setLink(connected: boolean): void {
    this.linked = connected;
    const link = this.root?.querySelector("#remote-link");
    if (link) link.textContent = connected ? this.l("Live link", "Živé spojení") : this.l("Offline", "Offline");
    this.root?.querySelector(".remote-status")?.classList.toggle("on", connected);
    if (connected) {
      this.lastSignature = "";
      this.dispatch(this.commandsForState());
    }
    this.syncSetupModal();
  }

  private view(): WizardView {
    return wizardView(this.config.wizardStep, this.config.layout, this.config.setupDone);
  }

  private renderWizard(): void {
    const host = this.root?.querySelector("#remote-wizard");
    if (!host) return;
    const l = this.l.bind(this);
    const view = this.view();
    const drive = this.root?.querySelector<HTMLElement>(".remote-drive");
    const summaryEl = this.root?.querySelector("#remote-ready-summary");
    const ready = view.kind === "ready";
    const showModal = shouldShowSetupModal(this.linked, this.config.setupDone, this.reopenRequested);
    drive?.classList.toggle("is-ready", ready);
    this.root?.querySelector("#remote-setup-hint")?.classList.toggle("hidden", ready || showModal);
    if (summaryEl) {
      if (ready) summaryEl.textContent = readySetupSummary(this.config, this.locale());
      summaryEl.classList.toggle("hidden", !ready);
    }
    host.classList.toggle("hidden", ready);
    this.parkSpeedControl();
    if (ready) {
      host.replaceChildren();
      const actions = this.root?.querySelector("#remote-setup-actions");
      if (actions) actions.innerHTML = "";
      this.placeDriveControls(false);
      this.markTryout(false);
      this.syncSetupModal();
      return;
    }
    const tabs = wizardTabs(this.config.layout, this.locale()).map(tab =>
      `<button type="button" role="tab" aria-selected="${tab.step === view.index}" class="${tab.step === view.index ? "on" : ""}" data-wizard-step="${tab.step}">${tab.label}</button>`,
    ).join("");
    const actions = this.root?.querySelector("#remote-setup-actions");
    const setActions = (html: string) => { if (actions) actions.innerHTML = html; };
    let body = "";
    if (view.kind === "mode") {
      const mode = (id: DriveLayout, title: string, copy: string) =>
        `<button type="button" class="${this.config.layout === id ? "active" : ""}" data-layout="${id}"><b>${title}</b><span>${copy}</span></button>`;
      const axle = (id: TankAxle, title: string, copy: string) =>
        `<button type="button" class="${this.config.tankAxle === id ? "active" : ""}" data-tank-axle="${id}"><b>${title}</b><span>${copy}</span></button>`;
      setActions("");
      const axleBlock = this.config.layout === "tank"
        ? `<section class="wizard-section">
            <h4>${l("Drive wheels","Pohonná kola")}</h4>
            <p class="wizard-copy">${l("Where are the drive motors on the car?","Kde na autíčku jsou hnací motory?")}</p>
            <div class="wizard-modes wizard-axle">
              ${axle("rear", l("At the rear","Vzadu"), l("Caster or free wheels at the front.","Vpředu volná kolečka."))}
              ${axle("front", l("At the front","Vpředu"), l("Caster or free wheels at the rear.","Vzadu volná kolečka."))}
            </div>
          </section>`
        : "";
      body = `<h3>${l("Choose a drive mode","Vyberte režim")}</h3>
        <p class="wizard-copy">${l("Then each motor gets a port, a direction, and a speed.","Pak u každého motoru zvolíme port, směr a rychlost.")}</p>
        <div class="wizard-modes">
          ${mode("steer", l("Drive + steering","Pohon a zatáčení"), l("One motor forward/back, another steers.","Jeden motor dopředu/dozadu, druhý zatáčí."))}
          ${mode("tank", l("Motor on each side","Motor na každé straně"), l("Left and right wheels, tank-style.","Levé a pravé kolo, tank."))}
          ${mode("straight", l("No steering","Bez zatáčení"), l("Forward and back only.","Jen dopředu a dozadu."))}
        </div>
        ${axleBlock}`;
    } else if (view.kind === "assign" || view.kind === "extra") {
      const extra = view.kind === "extra";
      const slot = view.kind === "extra" ? view.slot : 1;
      const selected = view.kind === "extra"
        ? (slot === 2 ? this.config.extra2Port : this.config.extraPort)
        : this.config[view.assign.portKey];
      const flipped = view.kind === "extra"
        ? (slot === 2 ? this.config.invertExtra2 : this.config.invertExtra)
        : this.config[view.assign.invertKey];
      const title = view.kind === "extra"
        ? (slot === 2
          ? l("Extra motor 2 (R / F)", "Extra motor 2 (R / F)")
          : l("Extra motor 1 (Q / E)", "Extra motor 1 (Q / E)"))
        : view.assign.role === "drive" ? l("Forward / reverse motor","Motor dopředu / dozadu")
        : view.assign.role === "steer" ? l("Steering motor","Motor zatáčení")
        : view.assign.role === "left" ? l("Left motor","Levý motor")
        : l("Right motor","Pravý motor");
      const motors = new Set(motorPorts(this.telemetry));
      const none = extra ? `<button type="button" class="port-chip ${selected ? "" : "active"}" data-pick-port="none">${l("None","Žádný")}</button>` : "";
      const chips = none + PORTS.map(port => `<button type="button" class="port-chip ${port === selected ? "active" : ""} ${motors.has(port) ? "has-motor" : ""}" data-pick-port="${port}">${port}</button>`).join("");
      const direction = !extra || selected
        ? (flipped ? l("Direction is flipped.","Směr je otočený.") : l("Default direction.","Výchozí směr."))
        : l("Pick a port to set the direction.","Vyberte port, abyste nastavili směr.");
      const lastExtra = extra && slot === 2;
      setActions(`<button type="button" class="quiet" data-wizard="back">${l("Back","Zpět")}</button>
        <button type="button" class="primary" data-wizard="next">${lastExtra ? l("Done","Hotovo") : l("Next","Dál")}</button>`);
      body = `<h3>${title}</h3>
        <section class="wizard-section">
          <h4>${l("Where is the motor","Kde je motor")}</h4>
          <div class="port-chips">${chips}</div>
        </section>
        <section class="wizard-section">
          <h4>${l("Direction","Směr")}</h4>
          <p>${direction}</p>
          <button type="button" class="wizard-flip" data-wizard="flip" ${extra && !selected ? "disabled" : ""}>${flipped ? l("Flip back","Vrátit směr") : l("Flip direction","Otočit směr")}</button>
        </section>
        <section class="wizard-section">
          <h4>${l("Speed","Rychlost")}</h4>
          <div id="wizard-speed-slot"></div>
        </section>`;
    } else {
      setActions("");
    }
    host.innerHTML = `<div class="wizard-tabs" role="tablist">${tabs}</div>${body}`;
    this.layoutWizardChrome();
    host.querySelectorAll<HTMLButtonElement>("[data-layout]").forEach(button => button.addEventListener("click", () => {
      const layout = button.dataset.layout as DriveLayout;
      this.patchConfig({
        layout,
        // Stay on mode for tank so the axle choice is visible; other modes continue.
        wizardStep: layout === "tank" ? 0 : 1,
        setupDone: false,
        api: "motor",
        extraPort: "",
        extra2Port: "",
        invertLeft: false,
        invertRight: false,
        invertDrive: false,
        invertSteer: false,
        invertExtra: false,
        invertExtra2: false,
      }, true);
    }));
    host.querySelectorAll<HTMLButtonElement>("[data-tank-axle]").forEach(button => button.addEventListener("click", () => {
      this.patchConfig({
        tankAxle: button.dataset.tankAxle as TankAxle,
        wizardStep: 1,
        setupDone: false,
      }, true);
    }));
    host.querySelectorAll<HTMLButtonElement>("[data-pick-port]").forEach(button => button.addEventListener("click", () => {
      const view = this.view();
      const port = button.dataset.pickPort ?? "";
      if (view.kind === "assign") {
        if (!hasExtraMotor(port)) return;
        this.patchConfig({ [view.assign.portKey]: port }, false);
      } else if (view.kind === "extra" && view.slot === 2) {
        this.patchConfig({ extra2Port: hasExtraMotor(port) ? port : "", invertExtra2: hasExtraMotor(port) ? this.config.invertExtra2 : false }, false);
      } else if (view.kind === "extra") {
        this.patchConfig({ extraPort: hasExtraMotor(port) ? port : "", invertExtra: hasExtraMotor(port) ? this.config.invertExtra : false }, false);
      } else return;
      this.renderWizard();
    }));
    host.querySelectorAll<HTMLButtonElement>("[data-wizard-step]").forEach(button => button.addEventListener("click", () => {
      this.patchConfig({ wizardStep: Number(button.dataset.wizardStep), setupDone: false }, true);
    }));
    const wireActions = (root: ParentNode | null | undefined) => {
      root?.querySelector<HTMLButtonElement>("[data-wizard=back]")?.addEventListener("click", () => this.patchConfig({ wizardStep: Math.max(0, this.config.wizardStep - 1), setupDone: false }, true));
      root?.querySelector<HTMLButtonElement>("[data-wizard=flip]")?.addEventListener("click", () => {
        const view = this.view();
        if (view.kind === "assign") this.patchConfig({ [view.assign.invertKey]: !this.config[view.assign.invertKey] }, true);
        else if (view.kind === "extra" && view.slot === 2 && hasExtraMotor(this.config.extra2Port)) this.patchConfig({ invertExtra2: !this.config.invertExtra2 }, true);
        else if (view.kind === "extra" && hasExtraMotor(this.config.extraPort)) this.patchConfig({ invertExtra: !this.config.invertExtra }, true);
      });
      root?.querySelector<HTMLButtonElement>("[data-wizard=next]")?.addEventListener("click", () => {
        const next = this.config.wizardStep + 1;
        this.patchConfig({ wizardStep: next, setupDone: next > wizardExtra2Index(this.config.layout) }, true);
      });
    };
    wireActions(host);
    wireActions(actions);
    this.syncSetupModal();
  }

  private syncSetupModal(): void {
    const dialog = this.root?.querySelector<HTMLDialogElement>("#remote-setup");
    if (!dialog) return;
    const show = shouldShowSetupModal(this.linked, this.config.setupDone, this.reopenRequested);
    this.root?.querySelector("#remote-setup-hint")?.classList.toggle("hidden", this.config.setupDone || show);
    this.placeDriveControls(show);
    this.layoutWizardChrome();
    this.syncChrome();
    if (show) {
      if (!dialog.open) dialog.showModal();
      return;
    }
    this.reopenRequested = false;
    if (dialog.open) dialog.close();
  }

  private parkSpeedControl(): void {
    const field = this.root?.querySelector("#remote-speed-field");
    const controls = this.root?.querySelector("#remote-drive-controls");
    if (!field || !controls || field.parentElement === controls) return;
    controls.append(field);
  }

  private layoutWizardChrome(): void {
    const view = this.view();
    const show = shouldShowSetupModal(this.linked, this.config.setupDone, this.reopenRequested);
    const inStep = show && (view.kind === "assign" || view.kind === "extra");
    this.markTryout(inStep);
    const field = this.root?.querySelector("#remote-speed-field");
    const slot = this.root?.querySelector("#wizard-speed-slot");
    const controls = this.root?.querySelector("#remote-drive-controls");
    const target = inStep ? slot : controls;
    if (!field || !target || field.parentElement === target) return;
    target.append(field);
  }

  private markTryout(active: boolean): void {
    this.root?.querySelector("#remote-drive-controls")?.classList.toggle("is-tryout", active);
    this.root?.querySelector(".setup-layout")?.setAttribute("data-tryout", active ? "on" : "off");
  }

  private placeDriveControls(intoDialog: boolean): void {
    const controls = this.root?.querySelector("#remote-drive-controls");
    const tryout = this.root?.querySelector("#remote-setup-tryout");
    const drive = this.root?.querySelector(".remote-drive");
    const target = intoDialog ? tryout : drive;
    if (!controls || !target || controls.parentElement === target) return;
    target.append(controls);
  }

  private patchConfig(patch: Partial<RemoteConfig>, redrawWizard: boolean): void {
    const previous = this.config;
    this.config = parseRemoteConfig({ ...previous, ...patch });
    this.persistConfig();
    if (redrawWizard) this.renderWizard();
    this.syncChrome();
    this.lastSignature = "";
    this.dispatch(this.stopCommands(previous));
    this.lastSignature = "";
    this.dispatch(this.commandsForState());
  }

  private persistConfig(): void {
    localStorage.setItem(RemotePad.STORAGE_KEY, JSON.stringify(this.config));
    if (this.config.setupDone) {
      localStorage.setItem(RemotePad.READY_KEY, JSON.stringify(this.config));
    }
  }

  private setKey(code: string, down: boolean): void {
    if (isMainDriveLocked(this.config.setupDone, this.isTryoutActive())) return;
    const view = this.view();
    const axis = activeDriveAxis(view, this.config.layout);
    if (down && !isRemoteControlEnabled(code, axis, this.config.extraPort, this.config.extra2Port, view)) return;
    if (down) this.keys.add(code); else this.keys.delete(code);
    const intent = intentFromKeys(this.keys);
    this.renderIntent();
    this.dispatch(this.commandsForState());
    this.extraLive = !intent.stop && intent.extra !== 0;
    this.extra2Live = !intent.stop && intent.extra2 !== 0;
  }

  private commandsForState(): HubCommand[] {
    return liveRemoteCommands(this.view(), this.config, intentFromKeys(this.keys), {
      extra: this.extraLive,
      extra2: this.extra2Live,
    });
  }

  private stopCommands(config: RemoteConfig): HubCommand[] {
    return planRemoteCommands(config, drivePowers(config, { forward: 0, turn: 0, extra: 0, extra2: 0, stop: true }), true);
  }

  private renderIntent(): void {
    const intent = intentFromKeys(this.keys);
    const view = this.view();
    this.root?.querySelectorAll<HTMLElement>("[data-key]").forEach(button => {
      const code = button.dataset.key!;
      const hot = this.keys.has(code)
        || (intent.forward > 0 && (code === "KeyW" || code === "ArrowUp"))
        || (intent.forward < 0 && (code === "KeyS" || code === "ArrowDown"))
        || (intent.turn < 0 && (code === "KeyA" || code === "ArrowLeft"))
        || (intent.turn > 0 && (code === "KeyD" || code === "ArrowRight"));
      button.classList.toggle("hot", hot
        || (intent.stop && code === "Space")
        || (intent.extra < 0 && code === "KeyQ")
        || (intent.extra > 0 && code === "KeyE")
        || (intent.extra2 < 0 && code === "KeyR")
        || (intent.extra2 > 0 && code === "KeyF"));
    });
    const tx = this.root?.querySelector("#remote-tx");
    if (tx) {
      const moving = view.kind !== "mode" && !intent.stop
        && (intent.forward !== 0 || intent.turn !== 0 || intent.extra !== 0 || intent.extra2 !== 0);
      tx.textContent = intent.stop ? "TX · halt" : moving ? "TX · live" : "TX · idle";
    }
  }

  private isTryoutActive(): boolean {
    return this.root?.querySelector("#remote-drive-controls")?.classList.contains("is-tryout") === true;
  }

  private syncChrome(): void {
    const c = this.config, root = this.root, view = this.view();
    if (!root) return;
    const tryout = this.isTryoutActive();
    const locked = isMainDriveLocked(c.setupDone, tryout);
    const cockpit = root.querySelector<HTMLElement>(".remote-cockpit");
    if (cockpit) {
      const axis = locked ? "none" : activeDriveAxis(view, c.layout);
      cockpit.dataset.layout = c.layout;
      cockpit.dataset.api = c.api;
      cockpit.dataset.axis = axis;
      const controls = root.querySelector<HTMLElement>("#remote-drive-controls");
      if (controls) {
        controls.dataset.axis = axis;
        controls.classList.toggle("is-locked", locked);
      }
      root.querySelectorAll<HTMLButtonElement>("#remote-drive-controls [data-key]").forEach(button => {
        const code = button.dataset.key!;
        button.disabled = locked || (code !== "Space" && !isRemoteControlEnabled(code, axis, c.extraPort, c.extra2Port, view));
      });
      for (const code of [...this.keys]) {
        if (locked || !isRemoteControlEnabled(code, axis, c.extraPort, c.extra2Port, view)) this.keys.delete(code);
      }
    }
    const hint = root.querySelector("#remote-arrow-hint");
    if (hint && !tryout) {
      hint.textContent = locked
        ? mainDriveLockMessage(this.locale())
        : this.l("Use the keyboard arrows", "Použijte šipky na klávesnici");
    }
    const speedKey = locked ? "speed" : activeSpeedKey(view);
    const shownSpeed = speedKey === "speed" ? c.speed : c[speedKey];
    const speed = root.querySelector<HTMLInputElement>("#remote-speed");
    const speedValue = root.querySelector("#remote-speed-value");
    const speedLabel = root.querySelector("#remote-speed-label");
    if (speed) {
      speed.value = String(shownSpeed);
      speed.disabled = locked;
    }
    if (speedValue) speedValue.textContent = String(shownSpeed);
    if (speedLabel) speedLabel.textContent = speedControlLabel(speedKey, this.locale());
  }

  private dispatch(commands: HubCommand[]): void {
    const signature = commandSignature(commands);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.queued = commands;
    void this.flush();
  }

  private async flush(): Promise<void> {
    if (this.sending) return;
    this.sending = true;
    try {
      while (this.queued) {
        const batch = this.queued;
        this.queued = undefined;
        if (!this.hub.connected) continue;
        try { await Promise.all(batch.map(command => this.hub.sendCommand(command))); }
        catch (error) { this.log(error instanceof Error ? error.message : String(error), "error"); }
      }
    } finally {
      this.sending = false;
      if (this.queued) void this.flush();
    }
  }

  private readStored(key: string): unknown {
    try { return JSON.parse(localStorage.getItem(key) ?? "null"); }
    catch { return undefined; }
  }

  private el<T extends HTMLElement>(id: string): T | null {
    return this.root?.querySelector<T>(`#${id}`) ?? null;
  }
}
