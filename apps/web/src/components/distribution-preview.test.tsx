import { mountCanvas } from "@satisfactory-belt/canvas-pixi";
import { buildDistribution } from "@satisfactory-belt/factory-core";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi, beforeEach } from "vitest";

import { generateDistribution } from "@/lib/distribution-generation";
import { distributionFixture } from "@/test/distribution-fixture";

import { DistributionPreview } from "./distribution-preview";

// Exercise the real snapshots/generator and controls without a GPU or ELK worker.
vi.mock("@satisfactory-belt/canvas-pixi", () => ({
  mountCanvas: vi.fn(async () => ({ focus() {} })),
}));
vi.mock("@/lib/distribution-generation", () => ({ generateDistribution: vi.fn() }));
vi.mock("@/lib/distribution-layout", () => ({
  layoutDistribution: async () => ({ id: "distribution", children: [], edges: [] }),
}));

beforeEach(() => {
  vi.mocked(mountCanvas).mockClear();
  vi.mocked(generateDistribution)
    .mockReset()
    .mockImplementation(async (request) =>
      buildDistribution(request.sources, request.destinations, request.maxTier, request.transport),
    );
});

it("starts with Mk.6 allowed and selects the highest used tier without regenerating", async () => {
  const user = userEvent.setup();
  const { editor, assets, port } = distributionFixture();
  render(<DistributionPreview editor={editor} assets={assets} port={port} />);
  await user.click(screen.getByRole("button", { name: "Preview distribution…" }));
  await screen.findByRole("button", { name: "Fit preview" });
  expect(generateDistribution).toHaveBeenCalledOnce();
  expect(vi.mocked(generateDistribution).mock.calls[0]![0].maxTier).toBe(6);
  expect(screen.getByRole("button", { name: "Mk.4: 480/min" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  expect(screen.getByRole("button", { name: "Mk.6: 1200/min" }).getAttribute("aria-pressed")).toBe(
    "false",
  );
});

it("includes feedback trunk capacity in automatic tier selection", async () => {
  const user = userEvent.setup();
  const { editor, assets, port } = distributionFixture();
  for (let index = 0; index < 5; index++)
    editor.setLimit(`smelter-${index}`, { kind: "output", itemId: "iron", value: 12 });
  editor.setLimit(port.nodeId, { kind: "output", itemId: "copper", value: 60 });
  render(<DistributionPreview editor={editor} assets={assets} port={port} />);
  await user.click(screen.getByRole("button", { name: "Preview distribution…" }));
  await screen.findByRole("button", { name: "Fit preview" });
  const request = vi.mocked(generateDistribution).mock.calls[0]![0];
  expect(request.sources[0]!.rate).toBeCloseTo(60);
  const graph: ReturnType<typeof buildDistribution> =
    await vi.mocked(generateDistribution).mock.results[0]!.value;
  expect(Math.max(...graph.edges.map((edge) => edge.rate))).toBeCloseTo(72);
  expect(screen.getByRole("button", { name: "Mk.2: 120/min" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
});

it.each([
  { form: "liquid" as const, rate: 474, tier: 2 },
  { form: "gas" as const, rate: 60, tier: 1 },
])(
  "opens $form previews up to Mk.2 and selects the pipe tier needed for $rate m³/min",
  async ({ form, rate, tier }) => {
    const user = userEvent.setup();
    const { editor, assets, port } = distributionFixture(form);
    if (rate === 60) {
      for (let index = 0; index < 5; index++)
        editor.setLimit(`smelter-${index}`, { kind: "output", itemId: "iron", value: 12 });
      editor.setLimit(port.nodeId, { kind: "output", itemId: "copper", value: rate });
    }
    const before = editor.history.getSnapshot();
    render(<DistributionPreview editor={editor} assets={assets} port={port} />);
    await user.click(screen.getByRole("button", { name: "Preview distribution…" }));
    await screen.findByText(/4 T-junctions · 0 cross-junctions · 9 pipes/);
    expect(generateDistribution).toHaveBeenCalledOnce();
    const request = vi.mocked(generateDistribution).mock.calls[0]![0];
    expect(request.transport).toBe("pipe");
    expect(screen.getByText(/connections allow flow in either direction/)).toBeTruthy();
    expect(screen.getByText(/not fixed splits/)).toBeTruthy();
    expect(request.maxTier).toBe(2);
    expect(screen.getByText(new RegExp(`${rate} m³/min`))).toBeTruthy();
    expect(screen.getByRole("group", { name: "Maximum pipe tier" })).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: `Mk.${tier}: ${tier === 1 ? 300 : 600} m³/min` })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.queryByRole("button", { name: /Mk.3:/ })).toBeNull();
    expect(screen.queryByText("Return flow")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Mk.1: 300 m³/min" }));
    if (rate > 300) {
      expect(screen.getByRole("alert").textContent).toContain("300 m³/min");
      await user.click(screen.getByRole("button", { name: "Mk.2: 600 m³/min" }));
      await screen.findByText(/4 T-junctions · 0 cross-junctions · 9 pipes/);
    }
    await user.click(screen.getByRole("button", { name: "Individual machines" }));
    await screen.findByText(
      rate === 60
        ? /4 T-junctions · 0 cross-junctions · 9 pipes/
        : /16 T-junctions · 0 cross-junctions · 33 pipes/,
    );
    expect(editor.history.getSnapshot()).toBe(before);
  },
);

it("keeps a manual tier selected and returns to automatic selection on reopening", async () => {
  const user = userEvent.setup();
  const { editor, assets, port } = distributionFixture();
  render(<DistributionPreview editor={editor} assets={assets} port={port} />);
  await user.click(screen.getByRole("button", { name: "Preview distribution…" }));
  await screen.findByRole("button", { name: "Fit preview" });
  await user.click(screen.getByRole("button", { name: "Mk.6: 1200/min" }));
  await user.click(screen.getByRole("button", { name: "Individual machines" }));
  await screen.findByRole("button", { name: "Fit preview" });
  expect(screen.getByRole("button", { name: "Mk.6: 1200/min" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Preview distribution…" }));
  await screen.findByRole("button", { name: "Fit preview" });
  expect(screen.getByRole("button", { name: "Mk.4: 480/min" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
});

it("cancels superseded generation and never mounts its stale result", async () => {
  const deferred = Promise.withResolvers<ReturnType<typeof buildDistribution>>();
  vi.mocked(generateDistribution).mockReturnValueOnce(deferred.promise);
  const user = userEvent.setup();
  const { editor, assets, port } = distributionFixture();
  render(<DistributionPreview editor={editor} assets={assets} port={port} />);
  await user.click(screen.getByRole("button", { name: "Preview distribution…" }));
  expect(screen.getByText("Planning distribution…")).toBeTruthy();
  const [request, signal] = vi.mocked(generateDistribution).mock.calls[0]!;
  await user.click(screen.getByRole("button", { name: "Individual machines" }));
  expect(signal.aborted).toBe(true);
  await screen.findByRole("button", { name: "Fit preview" });
  await act(async () =>
    deferred.resolve(
      buildDistribution(request.sources, request.destinations, request.maxTier, request.transport),
    ),
  );
  expect(mountCanvas).toHaveBeenCalledOnce();
  expect(screen.getByText(/17 consumers/)).toBeTruthy();
});

it("cancels on close and starts a fresh construction when reopened", async () => {
  const deferred = Promise.withResolvers<ReturnType<typeof buildDistribution>>();
  vi.mocked(generateDistribution).mockReturnValueOnce(deferred.promise);
  const user = userEvent.setup();
  const { editor, assets, port } = distributionFixture();
  render(<DistributionPreview editor={editor} assets={assets} port={port} />);
  await user.click(screen.getByRole("button", { name: "Preview distribution…" }));
  const [request, signal] = vi.mocked(generateDistribution).mock.calls[0]!;
  await user.keyboard("{Escape}");
  expect(signal.aborted).toBe(true);
  await act(async () =>
    deferred.resolve(
      buildDistribution(request.sources, request.destinations, request.maxTier, request.transport),
    ),
  );
  expect(mountCanvas).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Preview distribution…" }));
  await screen.findByRole("button", { name: "Fit preview" });
  expect(generateDistribution).toHaveBeenCalledTimes(2);
  expect(vi.mocked(generateDistribution).mock.calls[1]![1].aborted).toBe(false);
});

it("shows a capacity explanation and recovers after selecting a sufficient tier", async () => {
  const user = userEvent.setup();
  const { editor, assets, port } = distributionFixture();
  render(<DistributionPreview editor={editor} assets={assets} port={port} />);
  await user.click(screen.getByRole("button", { name: "Preview distribution…" }));
  await screen.findByRole("button", { name: "Fit preview" });
  await user.click(screen.getByRole("button", { name: "Mk.1: 60/min" }));
  expect(screen.getByRole("alert").textContent).toContain("connected node exceeds Mk.1");
  expect(generateDistribution).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "Mk.4: 480/min" }));
  await screen.findByRole("button", { name: "Fit preview" });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText(/7 splitters · 3 mergers/)).toBeTruthy();
});

it("shows generation failures and recovers when settings change", async () => {
  vi.mocked(generateDistribution).mockRejectedValueOnce(new Error("Generation failed"));
  const user = userEvent.setup();
  const { editor, assets, port } = distributionFixture();
  render(<DistributionPreview editor={editor} assets={assets} port={port} />);
  await user.click(screen.getByRole("button", { name: "Preview distribution…" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Generation failed");
  expect(mountCanvas).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Individual machines" }));
  await screen.findByRole("button", { name: "Fit preview" });
  expect(screen.queryByRole("alert")).toBeNull();
});

it("defaults to connected nodes and switches detail without changing the plan or other controls", async () => {
  const user = userEvent.setup();
  const { editor, assets, port } = distributionFixture();
  const before = editor.history.getSnapshot();
  render(<DistributionPreview editor={editor} assets={assets} port={port} />);
  await user.click(screen.getByRole("button", { name: "Preview distribution…" }));
  expect(screen.getByRole("button", { name: "Connected nodes" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  expect(screen.getByText(/474\/min · 1 suppliers → 5 consumers/)).toBeTruthy();
  expect(screen.queryByText(/Could not construct/)).toBeNull();
  await user.click(screen.getByRole("button", { name: "Mk.4: 480/min" }));
  await user.click(screen.getByRole("button", { name: "Individual machines" }));
  expect(screen.getByText(/474\/min · 1 suppliers → 17 consumers/)).toBeTruthy();
  await screen.findByText(/17 splitters · 3 mergers · 42 belts/);
  expect(screen.getByRole("button", { name: "Mk.4: 480/min" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  expect(screen.queryByRole("button", { name: "Manifold" })).toBeNull();
  expect(screen.queryByRole("group", { name: "Distribution layout" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Connected nodes" }));
  expect(screen.getByText(/474\/min · 1 suppliers → 5 consumers/)).toBeTruthy();
  await screen.findByRole("button", { name: "Fit preview" });
  expect(editor.history.getSnapshot()).toBe(before);
});
