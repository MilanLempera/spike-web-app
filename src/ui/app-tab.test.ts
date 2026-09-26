import { describe, expect, it } from "vitest";
import { formatRgb, tabFromHash } from "./app-tab";

describe("tabFromHash", () => {
  it("maps known hashes and falls back to the controller", () => {
    expect(tabFromHash("#/blocks")).toBe("blocks");
    expect(tabFromHash("#/controller")).toBe("controller");
    expect(tabFromHash("#/remote")).toBe("controller");
    expect(tabFromHash("")).toBe("controller");
  });
});

describe("formatRgb", () => {
  it("scales HubOS 0–1023 channels to 8-bit readouts", () => {
    expect(formatRgb([1023, 0, 0])).toBe("R 255 · G 0 · B 0");
    expect(formatRgb([0, 511.5, 1023])).toBe("R 0 · G 128 · B 255");
  });
});
