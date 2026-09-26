import { SpikeConnection, type ISpikeConnection } from "../bluetooth/spike-connection";
import { Logger } from "../diagnostics/logger";
import { FrameAssembler, clearSlot, framedDeviceNotificationRequest, infoRequest, parseHubInfo, runningCrc, sourceBytes, startFileUpload, startProgram, transferChunk } from "../protocol/spike-protocol";
import { tunnelMessage } from "../protocol/spike-protocol";
import { PORTS, type Port } from "../protocol/ports";
import { parseDeviceNotification, type HubTelemetry } from "../protocol/telemetry";
import { SpikeMotor } from "./spike-motor";

export function hubShutdownCommands(extra: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
  return [...PORTS.map(port => ({ cmd: "motor.stop", port })), ...extra];
}

export class SpikeHub {
  readonly connection: ISpikeConnection;
  private readonly assembler = new FrameAssembler();
  private pending = new Map<number, Array<(data: Uint8Array) => void>>();
  private telemetryListeners = new Set<(state: HubTelemetry) => void>();
  private telemetryState: HubTelemetry = { ports: {} };
  private portLastSeen = new Map<Port, number>();
  private pendingCommands = new Map<number, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; command: string; port?: string }>();
  private commandSequence = 0;
  private maxPacketSize = 20;
  private releasing = false;

  constructor(readonly logger = new Logger(), connection?: ISpikeConnection) {
    this.connection = connection ?? new SpikeConnection(logger);
    this.connection.onMessage((bytes) => {
      try {
        for (const message of this.assembler.push(bytes)) {
          this.logger.log("SYSTEM", `HubOS message 0x${message[0].toString(16).padStart(2, "0").toUpperCase()}`);
          this.pending.get(message[0])?.shift()?.(message);
          if (message[0] === 0x32) this.logTunnel(message);
          if (message[0] === 0x3c) {
            const update = parseDeviceNotification(message), now = Date.now();
            if (update.battery !== undefined) this.telemetryState.battery = update.battery;
            if (update.imu) this.telemetryState.imu = update.imu;
            if (update.matrix) this.telemetryState.matrix = update.matrix;
            for (const [port, device] of Object.entries(update.ports) as Array<[Port, NonNullable<HubTelemetry["ports"][Port]>]>) { this.telemetryState.ports[port] = device; this.portLastSeen.set(port, now); }
            for (const port of Object.keys(this.telemetryState.ports) as Port[]) if (now-(this.portLastSeen.get(port)??0)>1500) { delete this.telemetryState.ports[port]; this.portLastSeen.delete(port); }
            const state={...this.telemetryState,ports:{...this.telemetryState.ports}};
            this.telemetryListeners.forEach((listener) => listener(state));
          }
        }
      } catch (error) { this.logger.error("Could not decode HubOS frame", error); }
    });
    this.connection.onDisconnected(() => this.rejectPendingCommands(new Error("Hub disconnected before the command completed.")));
  }

  async connect(): Promise<void> {
    await this.connection.connect();
    try {
      this.logger.log("CONNECT", "Starting HubOS 3 handshake");
      const waiting = this.waitFor(0x01); await this.sendFrame(infoRequest());
      const info = parseHubInfo(await waiting); this.maxPacketSize = Math.max(20, info.maxPacketSize);
      this.logger.log("SYSTEM", `HubOS ready · packet ${info.maxPacketSize} B · chunk ${info.maxChunkSize} B`);
      await this.installController(info.maxChunkSize);
      const telemetryStarted = this.waitFor(0x29);
      await this.sendFrame(framedDeviceNotificationRequest(250));
      if ((await telemetryStarted)[1] !== 0) throw new Error("Hub rejected telemetry subscription.");
      this.logger.log("SYSTEM", "Live hub telemetry enabled");
    } catch (error) { this.rejectPendingCommands(new Error("Hub connection setup failed.")); this.connection.disconnect(); throw error; }
  }
  disconnect(): void {
    this.rejectPendingCommands(new Error("Hub disconnected before the command completed."));
    this.telemetryState={ports:{}};this.portLastSeen.clear();
    this.connection.disconnect();
  }
  async shutdown(extra: Array<Record<string, unknown>> = []): Promise<void> {
    if (this.releasing || !this.connected) return;
    this.releasing = true;
    try {
      for (const command of hubShutdownCommands(extra)) {
        try { await this.sendFrame(tunnelMessage({ ...command, id: ++this.commandSequence })); }
        catch { /* keep stopping the remaining motors */ }
      }
    } finally {
      this.disconnect();
      this.releasing = false;
    }
  }
  motor(port: Port): SpikeMotor { return new SpikeMotor(this.connection, port); }
  async sendCommand(command: Record<string, unknown>): Promise<void> {
    if (!this.connected) throw new Error("Hub is not connected.");
    const id = ++this.commandSequence;
    const response = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { this.pendingCommands.delete(id); reject(new Error(`Command ${String(command.cmd)} timed out.`)); }, 8000);
      this.pendingCommands.set(id, { resolve, reject, timer, command: String(command.cmd ?? "command"), port: typeof command.port === "string" ? command.port : undefined });
    });
    try { await this.sendFrame(tunnelMessage({ ...command, id })); }
    catch (error) { const pending = this.pendingCommands.get(id); if (pending) { clearTimeout(pending.timer); this.pendingCommands.delete(id); } throw error; }
    return response;
  }
  get connected(): boolean { return this.connection.connected; }
  onTelemetry(callback: (state: HubTelemetry) => void): () => void {
    this.telemetryListeners.add(callback);
    return () => this.telemetryListeners.delete(callback);
  }

  private async installController(maxChunkSize: number): Promise<void> {
    const source = sourceBytes(); this.logger.log("SYSTEM", `Installing motor bridge (${source.length} B)`);
    let waiting = this.waitFor(0x47); await this.sendFrame(clearSlot()); await waiting;
    waiting = this.waitFor(0x0d); await this.sendFrame(startFileUpload(source));
    if ((await waiting)[1] !== 0) throw new Error("Hub rejected motor bridge upload.");
    let crc = 0; const chunkSize = Math.max(16, Math.min(maxChunkSize || 128, 128));
    for (let offset = 0; offset < source.length; offset += chunkSize) {
      const chunk = source.slice(offset, offset + chunkSize);
      const isFinalChunk = offset + chunk.length === source.length;
      crc = runningCrc(chunk, crc, isFinalChunk);
      waiting = this.waitFor(0x11); await this.sendFrame(transferChunk(chunk, crc));
      if ((await waiting)[1] !== 0) throw new Error(`Hub rejected upload chunk at ${offset}.`);
    }
    const ready = this.waitFor(0x32, 6000), started = this.waitFor(0x1f);
    await this.sendFrame(startProgram());
    if ((await started)[1] !== 0) throw new Error("Hub could not start motor bridge.");
    await ready; this.logger.log("SYSTEM", "Motor bridge ready");
  }

  private async sendFrame(frame: Uint8Array): Promise<void> {
    for (let offset = 0; offset < frame.length; offset += this.maxPacketSize) await this.connection.write(frame.slice(offset, offset + this.maxPacketSize));
  }
  private waitFor(type: number, timeoutMs = 4000): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const queue = this.pending.get(type) ?? []; let timer: ReturnType<typeof setTimeout>;
      const handler = (data: Uint8Array) => { clearTimeout(timer); resolve(data); };
      queue.push(handler); this.pending.set(type, queue);
      timer = setTimeout(() => { this.pending.set(type, (this.pending.get(type) ?? []).filter((item) => item !== handler)); reject(new Error(`Timeout waiting for HubOS response 0x${type.toString(16)}.`)); }, timeoutMs);
    });
  }
  private logTunnel(message: Uint8Array): void {
    if (message.length < 3) return;
    const size = new DataView(message.buffer, message.byteOffset, message.byteLength).getUint16(1, true);
    const text = new TextDecoder().decode(message.slice(3, 3 + size)).trim();
    try {
      const payload = JSON.parse(text) as { id?: number; event?: string; message?: string };
      if (payload.id !== undefined) {
        const pending = this.pendingCommands.get(payload.id);
        if (pending) {
          clearTimeout(pending.timer); this.pendingCommands.delete(payload.id);
          if (payload.event === "error") {
            const message=payload.message?.includes("ENODEV")&&pending.port
              ? `No compatible device is connected to port ${pending.port} (${pending.command}).`
              : `${pending.command}${pending.port?` on port ${pending.port}`:""} failed: ${payload.message??"unknown hub error"}`;
            pending.reject(new Error(message));
          } else pending.resolve();
        }
      }
    } catch { /* Non-JSON bridge diagnostics are still logged below. */ }
    if (text) this.logger.log("SYSTEM", `Bridge: ${text}`);
  }

  private rejectPendingCommands(error: Error): void {
    for (const pending of this.pendingCommands.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pendingCommands.clear();
  }
}
