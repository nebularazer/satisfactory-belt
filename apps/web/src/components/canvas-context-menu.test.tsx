import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CanvasContextMenu } from "./canvas-context-menu";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CanvasContextMenu", () => {
  it("skips the intermediate menu when empty canvas handling takes over", () => {
    const onContextMenu = vi.fn(() => false);

    render(
      <CanvasContextMenu
        onContextMenu={onContextMenu}
        onDelete={() => undefined}
        onDuplicate={() => undefined}
        onTouchStart={() => false}
      >
        <div>Canvas</div>
      </CanvasContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText("Canvas"), {
      button: 2,
      clientX: 120,
      clientY: 80,
    });

    expect(onContextMenu).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByText("Add node here")).not.toBeInTheDocument();
  });

  it("keeps the context menu for existing nodes", async () => {
    render(
      <CanvasContextMenu
        onContextMenu={() => true}
        onDelete={() => undefined}
        onDuplicate={() => undefined}
        onTouchStart={() => true}
      >
        <div>Canvas</div>
      </CanvasContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText("Canvas"), {
      button: 2,
      clientX: 120,
      clientY: 80,
    });

    expect(await screen.findByText("Duplicate selection")).toBeInTheDocument();
    expect(screen.getByText("Delete selection")).toBeInTheDocument();
  });

  it("does not open selection actions after an empty-canvas long press", async () => {
    vi.useFakeTimers();

    render(
      <CanvasContextMenu
        onContextMenu={() => false}
        onDelete={() => undefined}
        onDuplicate={() => undefined}
        onTouchStart={() => false}
      >
        <div>Canvas</div>
      </CanvasContextMenu>,
    );

    fireEvent.touchStart(screen.getByText("Canvas"), {
      touches: [{ clientX: 120, clientY: 80 }],
    });
    await act(() => vi.advanceTimersByTimeAsync(600));

    expect(screen.queryByText("Duplicate selection")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete selection")).not.toBeInTheDocument();
  });

  it("keeps selection actions available after a node long press", async () => {
    vi.useFakeTimers();

    render(
      <CanvasContextMenu
        onContextMenu={() => true}
        onDelete={() => undefined}
        onDuplicate={() => undefined}
        onTouchStart={() => true}
      >
        <div>Canvas</div>
      </CanvasContextMenu>,
    );

    fireEvent.touchStart(screen.getByText("Canvas"), {
      touches: [{ clientX: 120, clientY: 80 }],
    });
    await act(() => vi.advanceTimersByTimeAsync(600));

    expect(screen.getByText("Duplicate selection")).toBeInTheDocument();
    expect(screen.getByText("Delete selection")).toBeInTheDocument();
  });
});
