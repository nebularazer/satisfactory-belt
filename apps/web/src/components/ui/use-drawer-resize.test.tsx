import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "./drawer";
import { Input } from "./input";
import { useDrawerResize } from "./use-drawer-resize";

function Sheet() {
  const resize = useDrawerResize(true, vi.fn());
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

it("closes the drawer when dragging below its minimum, but not at the minimum or on cancellation", () => {
  const onOpenChange = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 400, 400),
  );
  render(
    <Drawer defaultOpen showSwipeHandle onOpenChange={onOpenChange}>
      <DrawerContent initialFocus={false}>
        <DrawerTitle>Inspector</DrawerTitle>
        <DrawerDescription>Machine settings</DrawerDescription>
      </DrawerContent>
    </Drawer>,
  );
  const handle = screen.getByRole("separator");
  Object.assign(handle, { setPointerCapture: vi.fn() });
  fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientY: 400 });
  fireEvent.pointerMove(handle, { pointerId: 1, clientY: 600 });
  expect(onOpenChange).not.toHaveBeenCalled();
  fireEvent.pointerCancel(handle, { pointerId: 1 });
  fireEvent.pointerMove(handle, { pointerId: 1, clientY: 650 });
  expect(onOpenChange).not.toHaveBeenCalled();
  fireEvent.pointerDown(handle, { pointerId: 2, button: 0, clientY: 400 });
  fireEvent.pointerMove(handle, { pointerId: 2, clientY: 601 });
  expect(onOpenChange).toHaveBeenCalledOnce();
  expect(onOpenChange.mock.calls[0]![0]).toBe(false);
  fireEvent.pointerMove(handle, { pointerId: 2, clientY: 650 });
  expect(onOpenChange).toHaveBeenCalledOnce();
});
