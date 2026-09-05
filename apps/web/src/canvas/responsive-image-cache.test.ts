import { describe, expect, it } from "vitest";

import { resolveResponsiveImage } from "./responsive-image-cache";

const image = [
  { url: "item-64.webp", width: 64 },
  { url: "item-128.webp", width: 128 },
  { url: "item-256.webp", width: 256 },
] as const;

describe("responsive image cache", () => {
  it("uses the requested variant when it is already cached", () => {
    expect(
      resolveResponsiveImage(image, 100, (url) => url === "item-128.webp"),
    ).toEqual({
      displayUrl: "item-128.webp",
      requestedUrl: "item-128.webp",
    });
  });

  it("keeps the closest cached variant visible while requesting an upgrade", () => {
    expect(
      resolveResponsiveImage(image, 100, (url) => url === "item-64.webp"),
    ).toEqual({
      displayUrl: "item-64.webp",
      requestedUrl: "item-128.webp",
    });
  });

  it("requests the variant without displaying an unrelated empty texture", () => {
    expect(resolveResponsiveImage(image, 200, () => false)).toEqual({
      requestedUrl: "item-256.webp",
    });
  });
});
