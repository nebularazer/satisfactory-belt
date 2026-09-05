const IMAGE_SCALE_THRESHOLDS = [64 / 24, 128 / 40, 128 / 24, 256 / 40];
const IMAGE_SCALE_HYSTERESIS = 0.1;

function initialImageScaleTier(imageScale: number) {
  const index = IMAGE_SCALE_THRESHOLDS.findIndex(
    (threshold) => imageScale <= threshold,
  );
  return index < 0 ? IMAGE_SCALE_THRESHOLDS.length : index;
}

export function stableImageScaleTier(
  imageScale: number,
  previousTier?: number,
) {
  if (previousTier === undefined) return initialImageScaleTier(imageScale);

  let tier = previousTier;
  while (
    tier < IMAGE_SCALE_THRESHOLDS.length &&
    imageScale > IMAGE_SCALE_THRESHOLDS[tier]! * (1 + IMAGE_SCALE_HYSTERESIS)
  ) {
    tier += 1;
  }
  while (
    tier > 0 &&
    imageScale <
      IMAGE_SCALE_THRESHOLDS[tier - 1]! * (1 - IMAGE_SCALE_HYSTERESIS)
  ) {
    tier -= 1;
  }
  return tier;
}
