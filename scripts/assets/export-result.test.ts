import { describe, expect, it } from "vitest";

import { reportedPngHashes } from "./export-result.ts";

const manifest = [{ assetPath: "/Game/A.Icon", objectName: "Icon-a" }];
const hash = "a".repeat(64);
const asset = {
  ...manifest[0],
  ok: true,
  sizes: { "256": { path: "256/Icon-a.png", sha256: hash } },
};
const report = { total: 1, ok: 1, failed: 0, assets: [asset] };

describe("export completion", () => {
  it("accepts one result for every requested texture", () => {
    expect(reportedPngHashes(report, manifest)).toEqual(new Map([["/Game/A.Icon", hash]]));
  });

  it("rejects partial success even if the exporter process exited zero", () => {
    expect(() => reportedPngHashes({ ...report, ok: 0, failed: 1 }, manifest)).toThrow(
      "incomplete",
    );
    expect(() => reportedPngHashes({ ...report, assets: [] }, manifest)).toThrow("incomplete");
    expect(() =>
      reportedPngHashes({ ...report, assets: [{ ...asset, ok: false }] }, manifest),
    ).toThrow("failed asset");
  });

  it("rejects substituted or duplicate textures and unexpected output paths", () => {
    expect(() =>
      reportedPngHashes({ ...report, assets: [{ ...asset, assetPath: "/Game/B.Icon" }] }, manifest),
    ).toThrow("unexpected");
    expect(() =>
      reportedPngHashes({ total: 2, ok: 2, failed: 0, assets: [asset, asset] }, [
        ...manifest,
        { assetPath: "/Game/B.Icon", objectName: "Icon-b" },
      ]),
    ).toThrow("unexpected");
    expect(() =>
      reportedPngHashes(
        {
          ...report,
          assets: [{ ...asset, sizes: { "256": { path: "../outside.png", sha256: hash } } }],
        },
        manifest,
      ),
    ).toThrow("invalid PNG");
  });
});
