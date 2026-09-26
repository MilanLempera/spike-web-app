import { toHex } from "./hex";

export type LogType = "SYSTEM" | "CONNECT" | "SERVICE" | "NOTIFY" | "TX" | "RX" | "DISCONNECT" | "ERROR";
export type LogEntry = { timestamp: Date; type: LogType; message: string };

export class Logger {
  private entries: LogEntry[] = [];
  private listeners = new Set<(entries: readonly LogEntry[]) => void>();

  log(type: LogType, message = ""): void {
    this.entries.push({ timestamp: new Date(), type, message });
    this.emit();
  }

  bytes(type: "TX" | "RX", data: Uint8Array): void {
    this.log(type, toHex(data));
  }

  error(message: string, error?: unknown): void {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : error ? String(error) : "";
    this.log("ERROR", detail ? `${message}\n${detail}` : message);
  }

  clear(): void {
    this.entries = [];
    this.emit();
  }

  subscribe(listener: (entries: readonly LogEntry[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.entries);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snapshot = [...this.entries];
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString("en-GB", { hour12: false }) + `.${date.getMilliseconds().toString().padStart(3, "0")}`;
}
