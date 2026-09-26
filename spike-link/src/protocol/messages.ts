export type SpikeMessage =
  | { type: "port-value"; port: number; raw: Uint8Array }
  | { type: "port-info"; port: number; raw: Uint8Array }
  | { type: "generic-error"; code?: number; raw: Uint8Array }
  | { type: "unknown"; messageType?: number; raw: Uint8Array };
