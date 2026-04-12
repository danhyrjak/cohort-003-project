import { describe, it, expect } from "vitest";
import { presenceColor } from "./presenceColor";

describe("presenceColor", () => {
  it("returns a hex color string", () => {
    expect(presenceColor(1)).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("is deterministic — same id gives same color", () => {
    expect(presenceColor(42)).toBe(presenceColor(42));
  });

  it("cycles through palette — id 0 and id 8 get the same color", () => {
    expect(presenceColor(0)).toBe(presenceColor(8));
  });

  it("different ids can produce different colors", () => {
    expect(presenceColor(0)).not.toBe(presenceColor(1));
  });
});
