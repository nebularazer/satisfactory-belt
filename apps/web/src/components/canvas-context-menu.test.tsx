import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CanvasContextMenu } from "./canvas-context-menu";

afterEach(cleanup);

describe("CanvasContextMenu", () => {
  it("skips the intermediate menu when empty canvas handling takes over", () => {
    const onContextMenu = vi.fn(() => false);

    render(
      <CanvasContextMenu
        onContextMenu={onContextMenu}
        onDelete={() => undefined}
        onDuplicate={() => undefined}
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
});
