export type AppTab = "controller" | "blocks";

export function tabFromHash(hash: string): AppTab {
  if (hash === "#/blocks") return "blocks";
  return "controller";
}

export function formatRgb(rgb: [number, number, number], maxRaw = 1023): string {
  const [r, g, b] = rgb.map(channel => Math.round(Math.max(0, Math.min(maxRaw, Number(channel) || 0)) / maxRaw * 255));
  return `R ${r} · G ${g} · B ${b}`;
}
