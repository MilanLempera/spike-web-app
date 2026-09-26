import * as Blockly from "blockly";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerSpikeBlocks } from "./catalog";
import { BlockRuntime } from "./runtime";
import type { SpikeHub } from "spike-link";

type Command = Record<string, unknown>;

function setup(state: "pressed" | "released") {
  const workspace = new Blockly.Workspace();
  const event = workspace.newBlock("spike_event_key");
  event.setFieldValue("ArrowUp", "KEY");
  event.setFieldValue(state, "STATE");
  const motor = workspace.newBlock(state === "pressed" ? "spike_motor_start" : "spike_motor_stop");
  motor.setFieldValue("A", "PORT");
  event.nextConnection!.connect(motor.previousConnection!);
  const commands: Command[] = [];
  const hub = {
    connected: true,
    onTelemetry: () => () => undefined,
    sendCommand: async (command: Command) => { commands.push(command); },
    motor: () => ({ stop: async () => undefined, power: async () => undefined }),
  } as unknown as SpikeHub;
  const runtime = new BlockRuntime(workspace as unknown as Blockly.WorkspaceSvg, hub, () => undefined);
  runtime.start(); commands.length = 0;
  return { workspace, runtime, commands };
}

describe("BlockRuntime keyboard events", () => {
  beforeEach(() => registerSpikeBlocks("en"));

  it("runs a pressed stack once while the key is held", async () => {
    const { workspace, runtime, commands } = setup("pressed");
    runtime.handleKey("ArrowUp", "pressed");
    runtime.handleKey("ArrowUp", "pressed");
    await vi.waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toMatchObject({ cmd: "motor.run", port: "A", speed: 50 });
    runtime.dispose(); workspace.dispose();
  });

  it("runs a released stack only after a preceding press", async () => {
    const { workspace, runtime, commands } = setup("released");
    runtime.handleKey("ArrowUp", "released");
    expect(commands).toHaveLength(0);
    runtime.handleKey("ArrowUp", "pressed");
    runtime.handleKey("ArrowUp", "released");
    await vi.waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toMatchObject({ cmd: "motor.stop", port: "A" });
    runtime.dispose(); workspace.dispose();
  });

  it("offers arrows, control keys, letters and digits", () => {
    const workspace = new Blockly.Workspace();
    const event = workspace.newBlock("spike_event_key");
    const options = (event.getField("KEY") as Blockly.FieldDropdown).getOptions().map(([, value]) => value);
    expect(options).toHaveLength(43);
    expect(options).toEqual(expect.arrayContaining(["ArrowUp", "Space", "Enter", "Escape", "KeyA", "KeyZ", "Digit0", "Digit9"]));
    workspace.dispose();
  });

  it("marks the exact command block when the hub rejects it", async () => {
    const workspace = new Blockly.Workspace();
    const event = workspace.newBlock("spike_event_key");
    event.setFieldValue("ArrowUp", "KEY"); event.setFieldValue("pressed", "STATE");
    const movement = workspace.newBlock("spike_move_start");
    event.nextConnection!.connect(movement.previousConnection!);
    const warning = vi.spyOn(movement, "setWarningText");
    const hub = {
      connected: true,
      onTelemetry: () => () => undefined,
      sendCommand: async () => { throw new Error("No compatible device is connected to port A."); },
    } as unknown as SpikeHub;
    const runtime = new BlockRuntime(workspace as unknown as Blockly.WorkspaceSvg, hub, () => undefined);
    runtime.start(); runtime.handleKey("ArrowUp", "pressed");
    await vi.waitFor(() => expect(warning).toHaveBeenCalledWith(expect.stringContaining("port A"), "runtime"));
    runtime.dispose(); workspace.dispose();
  });
});
