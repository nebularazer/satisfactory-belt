import { serializeFactoryJson } from "@satisfactory-belt/factory-saves";
import type { FactoryFile } from "@satisfactory-belt/factory-saves";

export function downloadFactoryJson(factory: FactoryFile) {
  const blob = new Blob([serializeFactoryJson(factory)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${factory.name.trim().replace(/[\\/:*?"<>|]/g, "-")}.json`;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Give the browser time to start reading the download before releasing the blob.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
