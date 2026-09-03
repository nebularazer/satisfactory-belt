import { beforeEach, describe, expect, it } from "vitest";

import { readBooleanPreference, writeBooleanPreference } from "./preferences";

describe("canvas preferences", () => {
  beforeEach(() => localStorage.clear());

  it("uses the fallback for missing and invalid values", () => {
    expect(readBooleanPreference("missing", true)).toBe(true);
    localStorage.setItem("invalid", "sometimes");
    expect(readBooleanPreference("invalid", true)).toBe(true);
  });

  it("round trips boolean values", () => {
    writeBooleanPreference("setting", false);
    expect(readBooleanPreference("setting", true)).toBe(false);
    writeBooleanPreference("setting", true);
    expect(readBooleanPreference("setting", false)).toBe(true);
  });
});
