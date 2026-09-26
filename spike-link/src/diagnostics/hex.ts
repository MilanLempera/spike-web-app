export function toHex(data: Uint8Array): string {
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}
