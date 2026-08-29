import { describe, it, expect } from "vitest";
import {
  newCarListSchema,
  idListSchema,
  photoUrlSchema,
} from "../src/validation";

describe("validation", () => {
  it("accepts a non-empty list of cars with name and type", () => {
    const r = newCarListSchema.safeParse([
      { name: "A", type: "B" },
      { name: "C", type: "D" },
    ]);
    expect(r.success).toBe(true);
  });

  it("rejects an empty car list", () => {
    expect(newCarListSchema.safeParse([]).success).toBe(false);
  });

  it("rejects a car missing type", () => {
    expect(newCarListSchema.safeParse([{ name: "A" }]).success).toBe(false);
  });

  it("coerces string ids to numbers and requires at least one", () => {
    expect(idListSchema.safeParse(["5", 6]).success).toBe(true);
    expect(idListSchema.safeParse([]).success).toBe(false);
    expect(idListSchema.safeParse([0]).success).toBe(false);
  });

  it("validates the photo-url payload", () => {
    expect(photoUrlSchema.safeParse({ url: "https://x/y.jpg" }).success).toBe(true);
    expect(photoUrlSchema.safeParse({ url: "not-a-url" }).success).toBe(false);
  });
});
