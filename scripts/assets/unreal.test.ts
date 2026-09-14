import { describe, expect, it } from "vitest";

import { classId, parseUnreal } from "./unreal.ts";

describe("Unreal recipe values", () => {
  it("reads nested structs and quoted references without splitting their punctuation", () => {
    expect(
      parseUnreal(
        '((ItemClass="/Script/Engine.Class\'/Game/A.A_C\'",Amount=4000),(ItemClass="/Game/B.B_C",Amount=2))',
      ),
    ).toEqual([
      { ItemClass: "/Script/Engine.Class'/Game/A.A_C'", Amount: "4000" },
      { ItemClass: "/Game/B.B_C", Amount: "2" },
    ]);
    expect(parseUnreal('(Name="a,b=(c)",Nested=(Value="escaped \\\"quote\\\""))')).toEqual({
      Name: "a,b=(c)",
      Nested: { Value: 'escaped "quote"' },
    });
    expect(classId("/Script/Engine.Class'/Game/A.A_C'")).toBe("A_C");
    expect(parseUnreal("")).toEqual([]);
    expect(parseUnreal("()")).toEqual([]);
  });
  it("rejects truncation, trailing input, duplicate fields and mixed structs/lists", () => {
    for (const value of [
      "((Amount=4)",
      "(A=1,A=2)",
      "(A=1,2)",
      "(1,A=2)",
      "(A=1,)",
      "()garbage",
      '("unterminated)',
    ])
      expect(() => parseUnreal(value)).toThrow();
  });
});
