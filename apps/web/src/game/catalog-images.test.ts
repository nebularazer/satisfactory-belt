import { listBuildables } from "@satisfactory-belt/production";
import { describe, expect, it } from "vitest";

import { buildableImageUrl, descriptorImageUrl } from "./catalog-images";

describe("catalog images", () => {
  it("provides an image for every catalog Buildable", () => {
    expect(
      listBuildables().filter((buildable) => !buildableImageUrl(buildable.id)),
    ).toEqual([]);
  });

  it("resolves Descriptor images from the web public path", () => {
    expect(descriptorImageUrl("Desc_Water_C")).toBe("/items/Desc_Water_C.png");
  });
});
