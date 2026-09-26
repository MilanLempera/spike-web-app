import { expect, it } from "vitest";
import { toHex } from "./hex";

it("formats bytes as uppercase, zero-padded hex", () => expect(toHex(Uint8Array.of(0x0a, 0, 0x81, 0xff))).toBe("0A 00 81 FF"));
