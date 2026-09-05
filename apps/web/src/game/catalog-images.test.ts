import { listBuildables } from "@satisfactory-belt/production";
import { describe, expect, it } from "vitest";

import {
  buildableImage,
  buildableImageUrl,
  descriptorImage,
  descriptorImageUrl,
  imageSrcSet,
  selectImageUrl,
} from "./catalog-images";

describe("catalog images", () => {
  it("provides an image for every catalog Buildable", () => {
    expect(
      listBuildables().filter((buildable) => !buildableImageUrl(buildable.id)),
    ).toEqual([]);
  });

  it("resolves Descriptor images from the web public path", () => {
    expect(descriptorImageUrl("Desc_Water_C")).toMatch(
      /^\/items\/Desc_Water_C-64\.webp\?v=[a-f\d]{12}$/,
    );
  });

  it("selects the smallest source that satisfies the rendered width", () => {
    const image = descriptorImage("Desc_Water_C");
    expect(selectImageUrl(image, 48)).toContain("-64.webp");
    expect(selectImageUrl(image, 65)).toContain("-128.webp");
    expect(selectImageUrl(image, 300)).toContain("-256.webp");
    expect(imageSrcSet(image)).toMatch(
      /^\/items\/Desc_Water_C-64\.webp\?v=[a-f\d]{12} 64w, \/items\/Desc_Water_C-128\.webp\?v=[a-f\d]{12} 128w, \/items\/Desc_Water_C-256\.webp\?v=[a-f\d]{12} 256w$/,
    );
  });

  it("provides both responsive tiers for a Buildable", () => {
    expect(
      buildableImage("Build_ConstructorMk1_C")?.map(({ width }) => width),
    ).toEqual([128, 256]);
  });
});
