import imageAssets from "./image-assets.generated.json";

export type ImageSource = Readonly<{
  url: string;
  width: number;
}>;

export type ResponsiveImage = readonly ImageSource[];

const buildableDescriptorIds = new Set(imageAssets.buildables);

function versionedPublicImageUrl(directory: string, fileName: string) {
  return `${import.meta.env.BASE_URL}${directory}/${fileName}?v=${imageAssets.version}`;
}

export function buildableImage(
  buildableId: string,
): ResponsiveImage | undefined {
  const descriptorId = buildableId.replace(/^Build_/, "Desc_");
  if (!buildableDescriptorIds.has(descriptorId)) return undefined;
  return [128, 256].map((width) => ({
    url: versionedPublicImageUrl("buildables", `${descriptorId}-${width}.webp`),
    width,
  }));
}

export function descriptorImage(descriptorId: string): ResponsiveImage {
  return [64, 128, 256].map((width) => ({
    url: versionedPublicImageUrl("items", `${descriptorId}-${width}.webp`),
    width,
  }));
}

export function selectImageUrl(
  image: ResponsiveImage,
  requiredWidth = image[0]?.width ?? 0,
) {
  return (
    image.find(({ width }) => width >= requiredWidth)?.url ?? image.at(-1)?.url
  );
}

export function imageSrcSet(image: ResponsiveImage) {
  return image.map(({ url, width }) => `${url} ${width}w`).join(", ");
}

export function buildableImageUrl(buildableId: string) {
  const image = buildableImage(buildableId);
  return image ? selectImageUrl(image, 128) : undefined;
}

export function descriptorImageUrl(descriptorId: string) {
  return selectImageUrl(descriptorImage(descriptorId), 64);
}
