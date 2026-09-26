import type { Locale } from "../blocks/i18n";
import { PORTS, type HubTelemetry, type Port } from "spike-link";

export type WatchResult = { valid: boolean; value: string; tone?: "on" | "off" };

export type WatchGroup = { label: string; expressions: string[] };

export function watchGroups(state: HubTelemetry | undefined, locale: Locale): WatchGroup[] {
  const groups: WatchGroup[] = [];
  const hub: string[] = [];
  if (state?.battery !== undefined) hub.push("battery");
  if (state?.imu) hub.push("hub.yaw", "hub.pitch", "hub.roll");
  if (hub.length) groups.push({ label: "Hub", expressions: hub });
  for (const port of PORTS) {
    const device = state?.ports[port];
    if (!device) continue;
    if (device.kind === "motor") groups.push({ label: `${locale === "cs" ? "Motor" : "Motor"} ${port}`, expressions: [`motor.${port}.position`, `motor.${port}.speed`, `motor.${port}.power`, `motor.${port}.running`] });
    if (device.kind === "color") groups.push({ label: `${locale === "cs" ? "Barva" : "Color"} ${port}`, expressions: [`color.${port}`] });
    if (device.kind === "distance") groups.push({ label: `${locale === "cs" ? "Vzdálenost" : "Distance"} ${port}`, expressions: [`distance.${port}.cm`, `distance.${port}.mm`] });
    if (device.kind === "force") groups.push({ label: `${locale === "cs" ? "Síla / tlačítko" : "Force / button"} ${port}`, expressions: [`force.${port}.pressed`, `force.${port}.percent`] });
  }
  return groups;
}

export function evaluateWatch(expression: string, state: HubTelemetry | undefined, locale: Locale): WatchResult {
  const path = expression.trim().toLowerCase();
  const missing = (): WatchResult => ({ valid: true, value: "—" });
  const number = (value: number, suffix: string): WatchResult => ({ valid: true, value: `${value}${suffix}` });

  if (path === "battery") return state?.battery === undefined ? missing() : number(state.battery, "%");
  const hub = /^hub\.(yaw|pitch|roll)$/.exec(path);
  if (hub) {
    const value = state?.imu?.[hub[1] as "yaw" | "pitch" | "roll"];
    return value === undefined ? missing() : { valid: true, value: `${value.toFixed(1)}°` };
  }

  const match = /^(motor|color|distance|force)\.([a-f])(?:\.(position|speed|power|running|cm|mm|pressed|percent))?$/.exec(path);
  if (!match) return { valid: false, value: locale === "cs" ? "Neznámý výraz" : "Unknown expression" };
  const [, family, rawPort, property] = match;
  const device = state?.ports[rawPort.toUpperCase() as Port];
  if (!device || device.kind !== family) return missing();

  if (device.kind === "motor") {
    if (property === "position") return number(device.position, "°");
    if (property === "speed") return number(device.speed, "%");
    if (property === "power") return number(device.power, "%");
    if (property === "running") {
      const running = Math.abs(device.speed) > 0 || Math.abs(device.power) > .5;
      return { valid: true, value: running ? (locale === "cs" ? "Zapnutý" : "On") : (locale === "cs" ? "Vypnutý" : "Off"), tone: running ? "on" : "off" };
    }
  }
  if (device.kind === "color" && property === undefined) return { valid: true, value: translateColor(device.color, locale) };
  if (device.kind === "distance") {
    if (device.distance < 0) return { valid: true, value: locale === "cs" ? "Mimo dosah" : "Out of range" };
    if (property === "mm") return number(device.distance, " mm");
    if (property === "cm") return { valid: true, value: `${(device.distance / 10).toFixed(device.distance % 10 ? 1 : 0)} cm` };
  }
  if (device.kind === "force") {
    if (property === "percent") return number(device.force, "%");
    if (property === "pressed") return { valid: true, value: device.pressed ? (locale === "cs" ? "Ano" : "Yes") : (locale === "cs" ? "Ne" : "No"), tone: device.pressed ? "on" : "off" };
  }
  return { valid: false, value: locale === "cs" ? "Neznámý výraz" : "Unknown expression" };
}

function translateColor(color: string, locale: Locale): string {
  if (locale === "en") return color;
  return ({ Black:"Černá",Magenta:"Purpurová",Purple:"Fialová",Blue:"Modrá",Azure:"Azurová",Turquoise:"Tyrkysová",Green:"Zelená",Yellow:"Žlutá",Orange:"Oranžová",Red:"Červená",White:"Bílá",Unknown:"Neznámá" } as Record<string,string>)[color] ?? color;
}
