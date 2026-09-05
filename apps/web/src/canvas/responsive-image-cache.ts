import { selectImageUrl, type ResponsiveImage } from "@/game/catalog-images";

export type ResolvedResponsiveImage = Readonly<{
  displayUrl?: string;
  requestedUrl?: string;
}>;

export function resolveResponsiveImage(
  image: ResponsiveImage | undefined,
  requiredWidth: number,
  isCached: (imageUrl: string) => boolean,
): ResolvedResponsiveImage {
  if (!image) return {};

  const requestedUrl = selectImageUrl(image, requiredWidth);
  if (!requestedUrl) return {};
  if (isCached(requestedUrl)) return { displayUrl: requestedUrl, requestedUrl };

  let closestCached: ResponsiveImage[number] | undefined;
  for (const source of image) {
    if (!isCached(source.url)) continue;
    if (
      !closestCached ||
      Math.abs(source.width - requiredWidth) <
        Math.abs(closestCached.width - requiredWidth)
    ) {
      closestCached = source;
    }
  }

  return {
    ...(closestCached ? { displayUrl: closestCached.url } : {}),
    requestedUrl,
  };
}
