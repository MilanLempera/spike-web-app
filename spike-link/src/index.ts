export { SpikeConnection, SPIKE_BLE_UUIDS, type ISpikeConnection } from "./bluetooth/spike-connection";
export { Logger, formatTimestamp, type LogEntry, type LogType } from "./diagnostics/logger";
export { toHex } from "./diagnostics/hex";
export { PORTS, PORT_IDS, type Port } from "./protocol/ports";
export type { SpikeMessage } from "./protocol/messages";
export {
  FrameAssembler,
  HUB_CONTROLLER,
  clearSlot,
  framedDeviceNotificationRequest,
  infoRequest,
  motorPower,
  motorStop,
  pack,
  parseHubInfo,
  runningCrc,
  sourceBytes,
  startFileUpload,
  startProgram,
  transferChunk,
  tunnelMessage,
  unpack,
  type HubInfo,
} from "./protocol/spike-protocol";
export {
  deviceNotificationRequest,
  parseDeviceNotification,
  type HubTelemetry,
  type PortTelemetry,
} from "./protocol/telemetry";
export { SpikeHub, hubShutdownCommands } from "./spike/spike-hub";
export { SpikeMotor } from "./spike/spike-motor";
