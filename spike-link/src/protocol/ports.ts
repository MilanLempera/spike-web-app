export type Port = "A" | "B" | "C" | "D" | "E" | "F";

export const PORT_IDS: Readonly<Record<Port, number>> = {
  A: 0x00,
  B: 0x01,
  C: 0x02,
  D: 0x03,
  E: 0x04,
  F: 0x05,
};

export const PORTS = Object.keys(PORT_IDS) as Port[];
