import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider, useTheme } from "./theme-provider";

function ThemeProbe() {
  const { setTheme, theme } = useTheme();

  return (
    <button onClick={() => setTheme("dark")} type="button">
      {theme}
    </button>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        addEventListener: vi.fn(),
        matches: false,
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        removeEventListener: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("follows the system theme and persists an explicit selection", async () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await waitFor(() => expect(document.documentElement).toHaveClass("light"));
    expect(screen.getByRole("button")).toHaveTextContent("system");

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    expect(localStorage.getItem("satisfactory-belt-theme")).toBe("dark");
  });
});
