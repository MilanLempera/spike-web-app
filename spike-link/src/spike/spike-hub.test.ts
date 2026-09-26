import { describe, expect, it, vi } from "vitest";
import type { ISpikeConnection } from "../bluetooth/spike-connection";
import { FrameAssembler, pack, tunnelMessage } from "../protocol/spike-protocol";
import { PORTS } from "../protocol/ports";
import { SpikeHub, hubShutdownCommands } from "./spike-hub";

class FakeConnection implements ISpikeConnection {
  connected = true;
  writes: Uint8Array[] = [];
  private messageListeners = new Set<(data: Uint8Array) => void>();
  private disconnectListeners = new Set<() => void>();

  async connect(): Promise<void> { this.connected = true; }
  disconnect(): void {
    this.connected = false;
    this.disconnectListeners.forEach(listener => listener());
  }
  async write(data: Uint8Array): Promise<void> { this.writes.push(data); }
  onMessage(callback: (data: Uint8Array) => void): () => void { this.messageListeners.add(callback); return () => this.messageListeners.delete(callback); }
  onDisconnected(callback: () => void): () => void { this.disconnectListeners.add(callback); return () => this.disconnectListeners.delete(callback); }
  emit(data: Uint8Array): void { this.messageListeners.forEach(listener => listener(data)); }
}

function deviceNotification(payload: number[]): Uint8Array {
  const message=new Uint8Array(3+payload.length);message[0]=0x3c;new DataView(message.buffer).setUint16(1,payload.length,true);message.set(payload,3);return pack(message);
}

function tunnelPayloads(writes: Uint8Array[]): Array<Record<string, unknown>> {
  const assembler = new FrameAssembler();
  return writes.flatMap(chunk => assembler.push(chunk)).map(frame => {
    const size = new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint16(1, true);
    return JSON.parse(new TextDecoder().decode(frame.slice(3, 3 + size))) as Record<string, unknown>;
  });
}

describe("hub shutdown", () => {
  it("stops every port, then any extra drive command", () => {
    expect(hubShutdownCommands([{ cmd: "move.stop", leftPort: "C", rightPort: "D" }])).toEqual([
      ...PORTS.map(port => ({ cmd: "motor.stop", port })),
      { cmd: "move.stop", leftPort: "C", rightPort: "D" },
    ]);
  });

  it("writes the stop signals and then disconnects", async () => {
    const connection = new FakeConnection();
    const hub = new SpikeHub(undefined, connection);
    const first = hub.shutdown([{ cmd: "move.stop", leftPort: "A", rightPort: "B" }]);
    const second = hub.shutdown();
    await Promise.all([first, second]);
    const commands = tunnelPayloads(connection.writes);
    expect(commands.map(command => command.cmd === "motor.stop" ? command.port : command.cmd)).toEqual([...PORTS, "move.stop"]);
    expect(connection.connected).toBe(false);
  });

  it("leaves an offline hub untouched", async () => {
    const connection = new FakeConnection();
    connection.connected = false;
    const hub = new SpikeHub(undefined, connection);
    await hub.shutdown();
    expect(connection.writes).toHaveLength(0);
    expect(connection.connected).toBe(false);
  });
});

describe("SpikeHub command bridge", () => {
  it("waits for the bridge acknowledgement", async () => {
    const connection = new FakeConnection();
    const hub = new SpikeHub(undefined, connection);
    const command = hub.sendCommand({ cmd: "motor.stop", port: "A" });

    expect(connection.writes).toHaveLength(1);
    connection.emit(tunnelMessage({ event: "ok", id: 1 }));
    await expect(command).resolves.toBeUndefined();
  });

  it("surfaces a bridge command error", async () => {
    const connection = new FakeConnection();
    const hub = new SpikeHub(undefined, connection);
    const command = hub.sendCommand({ cmd: "unknown" });
    connection.emit(tunnelMessage({ event: "error", id: 1, message: "unknown command" }));
    await expect(command).rejects.toThrow("unknown failed: unknown command");
  });

  it("explains ENODEV using the selected port", async () => {
    const connection = new FakeConnection();
    const hub = new SpikeHub(undefined, connection);
    const command = hub.sendCommand({ cmd: "motor.run", port: "C" });
    connection.emit(tunnelMessage({ event: "error", id: 1, message: "[Errno 19] ENODEV" }));
    await expect(command).rejects.toThrow("No compatible device is connected to port C");
  });

  it("rejects an outstanding command immediately on disconnect", async () => {
    vi.useFakeTimers();
    const connection = new FakeConnection();
    const hub = new SpikeHub(undefined, connection);
    const command = hub.sendCommand({ cmd: "motor.stop", port: "A" });
    hub.disconnect();
    await expect(command).rejects.toThrow("disconnected");
    vi.useRealTimers();
  });

  it("keeps motor telemetry when a sensor arrives in a separate update", () => {
    const connection = new FakeConnection();
    const hub = new SpikeHub(undefined, connection);
    const states: Array<{ports: Record<string,unknown>}> = [];
    hub.onTelemetry(state => states.push(state as unknown as {ports:Record<string,unknown>}));
    connection.emit(deviceNotification([0x0a,0x00,0x31,0,0,0,0,0,0,0,0,0]));
    connection.emit(deviceNotification([0x0c,0x02,0x09,10,0,20,0,30,0]));
    expect(states.at(-1)?.ports).toMatchObject({A:{kind:"motor",motorType:"large"},C:{kind:"color",color:"Red"}});
  });
});
