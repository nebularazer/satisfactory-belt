// @vitest-environment jsdom
import { expect, it, vi } from "vitest";

import { suppressCanvasTouchClick } from "./touch-click";

const pointer = (element: HTMLElement, type: string, pointerType = "touch") => {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  element.dispatchEvent(event);
};

it("blocks a canvas touch's retargeted click but accepts the next deliberate tap and keyboard activation", () => {
  const canvas = document.createElement("canvas");
  const picker = document.createElement("button");
  document.body.append(canvas, picker);
  const abort = new AbortController();
  const open = vi.fn();
  picker.addEventListener("click", open);
  suppressCanvasTouchClick(canvas, abort.signal);
  const click = (detail = 1) =>
    picker.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail }));
  try {
    pointer(canvas, "pointerdown");
    pointer(canvas, "pointerup");
    for (const type of ["mousedown", "mouseup"]) {
      const mouse = new MouseEvent(type, { bubbles: true, cancelable: true, detail: 1 });
      expect(picker.dispatchEvent(mouse)).toBe(false);
    }
    expect(click()).toBe(false);
    expect(open).not.toHaveBeenCalled();
    pointer(picker, "pointerdown");
    pointer(picker, "pointerup");
    expect(click()).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    // A browser may omit the follow-up click; the next pointer-down must still work.
    pointer(canvas, "pointerup");
    pointer(picker, "pointerdown");
    expect(click()).toBe(true);
    pointer(canvas, "pointerup");
    expect(click(0)).toBe(true);
    pointer(canvas, "pointerup", "mouse");
    expect(click()).toBe(true);
    pointer(canvas, "pointerup");
    abort.abort();
    expect(click()).toBe(true);
  } finally {
    abort.abort();
    canvas.remove();
    picker.remove();
  }
});
