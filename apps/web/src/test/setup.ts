import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom has no layout observers, media queries, or scroll implementation.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn((media: string) => ({
    matches: false,
    media,
    addEventListener() {},
    removeEventListener() {},
  })),
});
Element.prototype.scrollIntoView = vi.fn();
afterEach(cleanup);
