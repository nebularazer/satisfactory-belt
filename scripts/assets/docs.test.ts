import { describe, expect, it } from "vitest";

import { collectIcons, decodeJson } from "./docs.ts";

const docs = [
  {
    NativeClass: "/Script/CoreUObject.Class'/Script/FactoryGame.FGItemDescriptor'",
    Classes: [
      {
        ClassName: "Desc_IronPlate_C",
        mDisplayName: "Iron Pläte",
        mPersistentBigIcon:
          "Texture2D'/Game/FactoryGame/Resource/Parts/IronPlate/UI/Icon_256.Icon_256'",
        mSmallIcon: "Texture2D'/Game/FactoryGame/Resource/Parts/IronPlate/UI/Icon_64.Icon_64'",
      },
    ],
  },
];

describe("community resource extraction", () => {
  it("reads BOM-prefixed UTF-16LE and UTF-8 without changing game fields", () => {
    const json = JSON.stringify(docs);
    expect(
      decodeJson(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(json, "utf16le")])),
    ).toEqual(docs);
    expect(decodeJson(Buffer.from(`\ufeff${json}`))).toEqual(docs);
  });

  it("selects the big icon and supplies an Unreal object path and safe PNG filename", () => {
    expect(collectIcons(docs)).toEqual([
      {
        className: "Desc_IronPlate_C",
        source: docs[0]!.Classes[0]!.mPersistentBigIcon,
        assetPath: "/Game/FactoryGame/Resource/Parts/IronPlate/UI/Icon_256.Icon_256",
        objectName: expect.stringMatching(/^Icon_256-[a-f0-9]{12}$/),
        file: expect.stringMatching(/^icons\/256\/Icon_256-[a-f0-9]{12}\.png$/),
      },
    ]);
  });

  it("falls back to small icons and skips descriptors with no icon", () => {
    expect(
      collectIcons([
        {
          NativeClass: "Building",
          Classes: [
            {
              ClassName: "Machine",
              mPersistentBigIcon: "None",
              mSmallIcon: "/Game/UI/Machine.Other",
            },
            { ClassName: "Invisible", mSmallIcon: "None" },
          ],
        },
      ]),
    ).toEqual([
      {
        className: "Machine",
        source: "/Game/UI/Machine.Other",
        assetPath: "/Game/UI/Machine.Other",
        objectName: expect.stringMatching(/^Other-[a-f0-9]{12}$/),
        file: expect.stringMatching(/^icons\/256\/Other-[a-f0-9]{12}\.png$/),
      },
    ]);
  });

  it("distinguishes identical object names in different packages and reuses shared textures", () => {
    const icons = collectIcons([
      {
        NativeClass: "Item",
        Classes: [
          { ClassName: "A", mSmallIcon: "/Game/A/Icon.Icon" },
          { ClassName: "B", mSmallIcon: "/Game/B/Icon.Icon" },
          { ClassName: "C", mSmallIcon: "Texture2D'/Game/A/Icon.Icon'" },
        ],
      },
    ]);
    expect(icons[0]!.file).not.toBe(icons[1]!.file);
    expect(icons[0]!.file).toBe(icons[2]!.file);
    expect(icons[0]!.file).toBe(`icons/256/${icons[0]!.objectName}.png`);
  });

  it("rejects unexpected schemas and unsafe or unsupported icon paths", () => {
    expect(() => collectIcons({})).toThrow("Docs array");
    expect(() => collectIcons([{ NativeClass: "Item", Classes: [{}] }])).toThrow("ClassName");
    for (const source of ["/Game/../../outside.Icon", "/OtherPlugin/UI/Icon.Icon", "broken"]) {
      expect(() =>
        collectIcons([
          { NativeClass: "Item", Classes: [{ ClassName: "Bad", mSmallIcon: source }] },
        ]),
      ).toThrow("Unsupported icon reference");
    }
  });
});
