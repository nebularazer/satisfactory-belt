import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { Input } from "./input";
import { useDrawerResize } from "./use-drawer-resize";

function Sheet() {
  const resize = useDrawerResize(true);
  return (
    <div data-testid="sheet" data-slot="drawer-popup" style={resize.style}>
      <div {...resize.handleProps} />
      <Input aria-label="Rate" type="number" />
    </div>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("resizes from the handle and keeps the chosen height within the visible viewport", () => {
  const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 });
  vi.stubGlobal("visualViewport", viewport);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 400, 400),
  );
  render(<Sheet />);
  const handle = screen.getByRole("separator");
  const sheet = screen.getByTestId("sheet");
  Object.assign(handle, { setPointerCapture: vi.fn() });
  fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientY: 400 });
  fireEvent.pointerMove(handle, { pointerId: 1, clientY: 200 });
  fireEvent.pointerUp(handle, { pointerId: 1 });
  expect(sheet.style.height).toBe("600px");
  act(() => {
    viewport.height = 350;
    viewport.dispatchEvent(new Event("resize"));
  });
  expect(sheet.style.height).toBe("334px");
  expect(sheet.style.bottom).toBe(`${Math.max(0, window.innerHeight - 350)}px`);
  act(() => {
    viewport.height = 800;
    viewport.dispatchEvent(new Event("resize"));
  });
  expect(sheet.style.height).toBe("600px");
  fireEvent.keyDown(handle, { key: "Home" });
  expect(sheet.style.height).toBe("200px");
  fireEvent.keyDown(handle, { key: "End" });
  expect(sheet.style.height).toBe("784px");
});

it("disables autocomplete on shared planner inputs", () => {
  render(<Sheet />);
  const input = screen.getByRole("spinbutton");
  expect(input.getAttribute("autocomplete")).toBe("off");
  expect(input.getAttribute("autocorrect")).toBe("off");
  expect(input.getAttribute("spellcheck")).toBe("false");
});
