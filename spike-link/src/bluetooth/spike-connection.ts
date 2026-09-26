import { Logger } from "../diagnostics/logger";

export const SPIKE_BLE_UUIDS = {
  service: "0000fd02-0000-1000-8000-00805f9b34fb",
  rx: "0000fd02-0001-1000-8000-00805f9b34fb",
  tx: "0000fd02-0002-1000-8000-00805f9b34fb",
} as const;

export interface ISpikeConnection {
  connect(): Promise<void>;
  disconnect(): void;
  write(data: Uint8Array): Promise<void>;
  onMessage(callback: (data: Uint8Array) => void): () => void;
  onDisconnected(callback: () => void): () => void;
  readonly connected: boolean;
}

export class SpikeConnection implements ISpikeConnection {
  private device?: BluetoothDevice;
  private rx?: BluetoothRemoteGATTCharacteristic;
  private tx?: BluetoothRemoteGATTCharacteristic;
  private messageListeners = new Set<(data: Uint8Array) => void>();
  private disconnectedListeners = new Set<() => void>();

  constructor(private readonly logger: Logger) {}

  get connected(): boolean {
    return this.device?.gatt?.connected === true;
  }

  async connect(): Promise<void> {
    if (!("bluetooth" in navigator)) throw new Error("Web Bluetooth is not supported by this browser.");
    if (this.connected) return;

    try {
      this.logger.log("CONNECT", "Requesting Bluetooth device");
      const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [SPIKE_BLE_UUIDS.service] }] });
      this.device = device;
      device.addEventListener("gattserverdisconnected", this.handleDisconnect);

      this.logger.log("CONNECT", `Connecting to ${device.name ?? "SPIKE Hub"}`);
      const server = await device.gatt?.connect();
      if (!server) throw new Error("GATT connection failed");
      this.logger.log("CONNECT", "GATT connected");

      let service: BluetoothRemoteGATTService;
      try {
        service = await server.getPrimaryService(SPIKE_BLE_UUIDS.service);
      } catch (error) {
        throw new Error("LEGO service not found", { cause: error });
      }
      this.logger.log("SERVICE", "LEGO service discovered");

      try {
        this.rx = await service.getCharacteristic(SPIKE_BLE_UUIDS.rx);
        this.tx = await service.getCharacteristic(SPIKE_BLE_UUIDS.tx);
      } catch (error) {
        throw new Error("Required characteristic not found", { cause: error });
      }

      this.tx.addEventListener("characteristicvaluechanged", this.handleNotification);
      await this.tx.startNotifications();
      this.logger.log("NOTIFY", "Notifications enabled");
    } catch (error) {
      this.cleanup(false);
      throw this.normalizeConnectionError(error);
    }
  }

  disconnect(): void {
    const device = this.device;
    if (!device) return;
    this.logger.log("DISCONNECT", "Disconnect requested");
    // gatt.disconnect() may synchronously dispatch gattserverdisconnected,
    // whose handler clears this.device. Keep the local reference throughout.
    device.gatt?.disconnect();
    if (!device.gatt?.connected && this.device) this.cleanup(false);
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.connected || !this.rx) throw new Error("Hub is not connected.");
    this.logger.bytes("TX", data);
    try {
      // Make an ArrayBuffer-backed copy: Web Bluetooth's BufferSource type does
      // not accept a view that could be backed by SharedArrayBuffer.
      const payload = new Uint8Array(data);
      if (this.rx.properties.writeWithoutResponse) await this.rx.writeValueWithoutResponse(payload);
      else await this.rx.writeValueWithResponse(payload);
    } catch (error) {
      throw new Error("BLE write failed", { cause: error });
    }
  }

  onMessage(callback: (data: Uint8Array) => void): () => void {
    this.messageListeners.add(callback);
    return () => this.messageListeners.delete(callback);
  }

  onDisconnected(callback: () => void): () => void {
    this.disconnectedListeners.add(callback);
    return () => this.disconnectedListeners.delete(callback);
  }

  private handleNotification = (event: Event): void => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    const data = new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
    this.logger.bytes("RX", data);
    this.messageListeners.forEach((listener) => listener(data));
  };

  private handleDisconnect = (): void => {
    this.logger.log("DISCONNECT", "Device disconnected");
    this.cleanup(true);
  };

  private cleanup(notify: boolean): void {
    this.tx?.removeEventListener("characteristicvaluechanged", this.handleNotification);
    this.device?.removeEventListener("gattserverdisconnected", this.handleDisconnect);
    this.rx = undefined;
    this.tx = undefined;
    this.device = undefined;
    if (notify) this.disconnectedListeners.forEach((listener) => listener());
  }

  private normalizeConnectionError(error: unknown): Error {
    if (error instanceof DOMException && error.name === "NotFoundError") return new Error("User cancelled device selection.", { cause: error });
    if (error instanceof Error) return error;
    return new Error("GATT connection failed", { cause: error });
  }
}
