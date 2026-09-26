import { describe, expect, it } from "vitest";
import { FrameAssembler, HUB_CONTROLLER, motorPower, motorStop, pack, parseHubInfo, runningCrc, unpack } from "./spike-protocol";
import { PORT_IDS } from "./ports";

describe("SPIKE HubOS 3 protocol", () => {
  it("maps ports A-F", () => expect(PORT_IDS).toEqual({ A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 }));
  it("round-trips control bytes through COBS/XOR framing", () => {
    const data = Uint8Array.of(0, 1, 2, 3, 0, 255, 1, 44);
    expect([...unpack(pack(data))]).toEqual([...data]);
  });
  it("assembles fragmented frames", () => {
    const frame = pack(Uint8Array.of(0x01, 3, 2, 0));
    const assembler = new FrameAssembler();
    expect(assembler.push(frame.slice(0, 2))).toEqual([]);
    expect([...assembler.push(frame.slice(2))[0]]).toEqual([0x01, 3, 2, 0]);
  });
  it("encodes forward as a tunnel message", () => expect(unpack(motorPower("A", 30))[0]).toBe(0x32));
  it("encodes reverse as a tunnel message", () => expect(new TextDecoder().decode(unpack(motorPower("F", -30)))).toContain('"speed":-30'));
  it("encodes stop", () => expect(new TextDecoder().decode(unpack(motorStop("C")))).toContain('"cmd":"motor.stop"'));
  it("rejects invalid power", () => expect(() => motorPower("A", 101)).toThrow(RangeError));
  it("pads the final upload chunk for its running CRC", () => {
    expect(runningCrc(Uint8Array.of(1, 2, 3), 0, true)).toBe(runningCrc(Uint8Array.of(1, 2, 3, 0)));
  });
  it("parses negotiated packet sizes", () => {
    const response = new Uint8Array(17); response[0] = 1;
    new DataView(response.buffer).setUint16(9, 244, true);
    new DataView(response.buffer).setUint16(13, 128, true);
    expect(parseHubInfo(response)).toEqual({ maxPacketSize: 244, maxChunkSize: 128 });
  });
  it("queues tunnel commands on HubOS versions without create_task", () => {
    expect(HUB_CONTROLLER).not.toContain("create_task");
    expect(HUB_CONTROLLER).toContain("inbox.append");
    expect(HUB_CONTROLLER).toContain("await act(inbox.pop(0))");
    expect(HUB_CONTROLLER).toContain("motor_pair.move_tank");
    expect(HUB_CONTROLLER).toContain("move.start");
  });
});
