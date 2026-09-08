/** THROWAWAY: compare stage corridors, material lanes and stage focus at
 * /?prototype=logistics&variant=A|B|C. Hand-arranged views of the real generated
 * 10 Modular Frames/min plan; this is a design sketch, not a layout algorithm.
 * No storage, editor mutations, or production changes. Verdict: awaiting review.
 */
import { useEffect, useState } from "react";
import { generateProduction } from "@/auto-build/generate-production";
import { convertDetailed } from "@/detailed-conversion/convert";
import { detailedDocumentToEditor } from "./editor-mode";
import { presentMaterialFlow } from "./material-link-presentation";
import { createNodeCardModel } from "./node-card-model";
import { buildableImageUrl, descriptorImageUrl } from "@/game/catalog-images";
import {
  materialFlowCanvasColor,
  type MaterialFlowState,
} from "./material-flow-state";
import type { CanvasNode } from "./document";
import "./logistics-layout-prototype.css";

const basic = generateProduction({
  outputs: [{ itemId: "Desc_ModularFrame_C", ratePerMinute: 10 }],
  allowedAlternateIds: [],
  pinnedRecipes: { Desc_IronScrew_C: "Recipe_Alternate_Screw_C" },
}).document;
const document = detailedDocumentToEditor(
  convertDetailed(
    basic,
    { conveyorTierId: "conveyor-mk1", pipelineTierId: "pipeline-mk2" },
    () => {},
  ),
);
const flow = presentMaterialFlow(document);
const nodes = new Map(document.nodes.map((n) => [n.configuration.id, n]));
const flows = new Map(flow.links.map((l) => [l.id, l]));
const short = (n: number | undefined) =>
  n === undefined ? "—" : Number(n.toFixed(2)).toString();
const color = (state: MaterialFlowState = "balanced") =>
  `#${materialFlowCanvasColor(state, false).toString(16).padStart(6, "0")}`;
const recipeIds = [
  "extraction:Desc_OreIron_C",
  "Recipe_IngotIron_C",
  "Recipe_IronPlate_C",
  "Recipe_Alternate_Screw_C",
  "Recipe_IronRod_C",
  "Recipe_IronPlateReinforced_C",
  "Recipe_ModularFrame_C",
];
const recipes = recipeIds.map((id) => {
  const members = document.nodes.filter(
    (n) =>
      n.configuration.kind === "process" && n.configuration.processId === id,
  );
  return { id, members, title: createNodeCardModel(members[0]!).title };
});
const itemIds = [
  "Desc_OreIron_C",
  "Desc_IronIngot_C",
  "Desc_IronPlate_C",
  "Desc_IronScrew_C",
  "Desc_IronPlateReinforced_C",
  "Desc_IronRod_C",
];
const networks = itemIds.map((itemId) => {
  const links = document.materialLinks.filter(
    (l) => flows.get(l.id)?.itemId === itemId,
  );
  const sourceIds = [
    ...new Set(
      links
        .filter(
          (l) => nodes.get(l.from.nodeId)!.configuration.kind === "process",
        )
        .map((l) => l.from.nodeId),
    ),
  ];
  const sinkIds = [
    ...new Set(
      links
        .filter((l) => nodes.get(l.to.nodeId)!.configuration.kind === "process")
        .map((l) => l.to.nodeId),
    ),
  ];
  const routerIds = [
    ...new Set(links.flatMap((l) => [l.from.nodeId, l.to.nodeId])),
  ].filter((id) => nodes.get(id)!.configuration.kind === "router");
  const rate = links
    .filter((l) => sourceIds.includes(l.from.nodeId))
    .reduce((sum, l) => sum + (flows.get(l.id)!.ratePerMinute ?? 0), 0);
  const labels = (ids: string[]) =>
    [
      ...new Set(ids.map((id) => createNodeCardModel(nodes.get(id)!).title)),
    ].join(" · ");
  return {
    itemId,
    name: flows.get(links[0]!.id)!.itemName,
    links,
    routerIds,
    sourceIds,
    sinkIds,
    source: labels(sourceIds),
    sink: labels(sinkIds),
    rate,
  };
});
const rods = networks.at(-1)!;
const rodIds = [
  ...new Set(rods.links.flatMap((l) => [l.from.nodeId, l.to.nodeId])),
];
// Positions refer to the generated rod network's original node identities.
const rodPositions = [
  [45, 145],
  [330, 285],
  [45, 270],
  [45, 395],
  [480, 425],
  [45, 520],
  [1070, 155],
  [1370, 125],
  [1370, 235],
  [1070, 355],
  [1370, 345],
  [1370, 455],
  [1070, 555],
  [1370, 565],
  [655, 320],
  [900, 155],
  [760, 750],
  [900, 355],
  [900, 555],
];
const positions = new Map(
  rodIds.map((id, i) => [
    id,
    { x: rodPositions[i]![0]!, y: rodPositions[i]![1]! },
  ]),
);
const returnId = rodIds[16]!;
const feedbackIds = new Set(
  rods.links
    .filter((l) => l.from.nodeId === returnId || l.to.nodeId === returnId)
    .map((l) => l.id),
);
const variants = ["A", "B", "C"] as const;
type Variant = (typeof variants)[number];
const variantNames = {
  A: "Stage corridors",
  B: "Material lanes",
  C: "Stage focus",
};
const descriptions = {
  A: "Follow production from left to right. Each logistics area has a clear purpose; every machine stays with its recipe.",
  B: "Compare material flows one at a time. Collection, distribution and receiving recipes line up in separate lanes.",
  C: "Inspect one complete logistics area at a readable scale. Forward flow stays central; dashed returns use a separate lane.",
};
function rounded(points: { x: number; y: number }[]) {
  let d = `M${points[0]!.x},${points[0]!.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]!,
      b = points[i]!,
      c = points[i + 1]!;
    const ab = Math.hypot(b.x - a.x, b.y - a.y),
      bc = Math.hypot(c.x - b.x, c.y - b.y);
    const r = Math.min(7, ab / 2, bc / 2);
    if (!ab || !bc) continue;
    d += ` L${b.x + ((a.x - b.x) * r) / ab},${b.y + ((a.y - b.y) * r) / ab} Q${b.x},${b.y} ${b.x + ((c.x - b.x) * r) / bc},${b.y + ((c.y - b.y) * r) / bc}`;
  }
  const last = points.at(-1)!;
  return d + ` L${last.x},${last.y}`;
}
function RecipeGroup({ index, x, y }: { index: number; x: number; y: number }) {
  const recipe = recipes[index]!;
  const h = 76 + recipe.members.length * 32;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="166" height={h} rx="12" fill="white" stroke="#cdd5dc" />
      <image
        href={buildableImageUrl(recipe.members[0]!.configuration.buildableId)}
        x="12"
        y="12"
        width="28"
        height="28"
      />
      <text x="48" y="23" className="lp-svg-title">
        {recipe.title === "Reinforced Iron Plate"
          ? "Reinforced Plate"
          : recipe.title === "Iron Ore Extraction"
            ? "Iron Ore"
            : recipe.title}
      </text>
      <text x="48" y="41" className="lp-svg-muted">
        {recipe.members.length} machines
      </text>
      {recipe.members.map((n, i) => (
        <g key={n.configuration.id} transform={`translate(10 ${60 + i * 32})`}>
          <rect width="146" height="26" rx="5" fill="#f4f6f8" />
          <image
            href={buildableImageUrl(n.configuration.buildableId)}
            x="5"
            y="3"
            width="20"
            height="20"
          />
          <text x="33" y="17" className="lp-svg-muted">
            #{i + 1}
          </text>
          <text x="136" y="17" textAnchor="end" className="lp-svg-muted">
            {createNodeCardModel(n).clock}
          </text>
        </g>
      ))}
    </g>
  );
}
function Capsule({
  index,
  x,
  y,
  onSelect,
}: {
  index: number;
  x: number;
  y: number;
  onSelect: () => void;
}) {
  const network = networks[index]!;
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Inspect ${network.name} logistics`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect();
      }}
      className="lp-capsule"
      transform={`translate(${x} ${y})`}
    >
      <rect width="125" height="95" rx="10" fill="#eef3f7" stroke="#c2cfd9" />
      <image
        href={descriptorImageUrl(network.itemId)}
        x="12"
        y="13"
        width="23"
        height="23"
      />
      <text x="44" y="28" className="lp-svg-title">
        {short(network.rate)}/min
      </text>
      <text x="12" y="56" className="lp-svg-muted">
        {network.routerIds.length} routers · {network.sinkIds.length} feeds
      </text>
      <text x="12" y="78" className="lp-svg-action">
        Inspect logistics
      </text>
    </g>
  );
}
export function VariantA({ onInspect }: { onInspect: (item: string) => void }) {
  const lines = [
    [
      [186, 410],
      [218, 410],
    ],
    [
      [343, 410],
      [380, 410],
    ],
    [
      [546, 410],
      [586, 410],
    ],
    [
      [711, 394],
      [738, 394],
      [738, 148],
      [765, 148],
    ],
    [
      [711, 410],
      [765, 410],
    ],
    [
      [711, 426],
      [738, 426],
      [738, 710],
      [765, 710],
    ],
    [
      [931, 148],
      [972, 148],
    ],
    [
      [931, 410],
      [972, 410],
    ],
    [
      [1097, 148],
      [1113, 148],
      [1113, 312],
      [1140, 312],
    ],
    [
      [1097, 410],
      [1113, 410],
      [1113, 344],
      [1140, 344],
    ],
    [
      [1306, 328],
      [1337, 328],
    ],
    [
      [1462, 328],
      [1490, 328],
    ],
    [
      [931, 710],
      [1337, 710],
    ],
    [
      [1462, 710],
      [1475, 710],
      [1475, 410],
      [1490, 410],
    ],
  ];
  return (
    <div className="lp-overview">
      <div className="lp-diagram-scroll">
        <svg
          viewBox="0 0 1680 910"
          aria-label="Modular Frame production stages and logistics areas"
        >
          {[
            [20, 215, "01", "EXTRACTION"],
            [380, 215, "02", "SMELTING"],
            [765, 35, "03", "PARTS"],
            [1140, 215, "04", "ASSEMBLY"],
            [1490, 215, "05", "OUTPUT"],
          ].map(([x, y, n, label]) => (
            <g key={String(n)} transform={`translate(${x} ${y})`}>
              <text className="lp-stage" y="0">
                {n} / {label}
              </text>
            </g>
          ))}
          <rect
            x="205"
            y="278"
            width="149"
            height="390"
            rx="15"
            className="lp-zone"
          />
          <rect
            x="575"
            y="65"
            width="147"
            height="770"
            rx="15"
            className="lp-zone"
          />
          <text x="589" y="88" className="lp-zone-label">
            DISTRIBUTE INGOTS
          </text>
          <rect
            x="961"
            y="67"
            width="147"
            height="495"
            rx="15"
            className="lp-zone"
          />
          <text x="975" y="88" className="lp-zone-label">
            SUPPLY ASSEMBLY
          </text>
          {lines.map((line, i) => (
            <path
              key={i}
              d={rounded(line.map(([x, y]) => ({ x: x!, y: y! })))}
              fill="none"
              stroke={color()}
              strokeWidth="3"
            />
          ))}
          <RecipeGroup index={0} x={20} y={245} />
          <RecipeGroup index={1} x={380} y={245} />
          <RecipeGroup index={2} x={765} y={65} />
          <RecipeGroup index={3} x={765} y={325} />
          <RecipeGroup index={4} x={765} y={645} />
          <RecipeGroup index={5} x={1140} y={245} />
          <RecipeGroup index={6} x={1490} y={245} />
          <Capsule
            index={0}
            x={218}
            y={363}
            onSelect={() => onInspect(itemIds[0]!)}
          />
          <Capsule
            index={1}
            x={586}
            y={363}
            onSelect={() => onInspect(itemIds[1]!)}
          />
          <Capsule
            index={2}
            x={972}
            y={101}
            onSelect={() => onInspect(itemIds[2]!)}
          />
          <Capsule
            index={3}
            x={972}
            y={363}
            onSelect={() => onInspect(itemIds[3]!)}
          />
          <Capsule
            index={4}
            x={1337}
            y={281}
            onSelect={() => onInspect(itemIds[4]!)}
          />
          <Capsule
            index={5}
            x={1337}
            y={663}
            onSelect={() => onInspect(itemIds[5]!)}
          />
          <text x="982" y="687" className="lp-svg-muted">
            Iron Rod · dedicated bypass to final assembly
          </text>
          <text x="1490" y="525" className="lp-output">
            10 frames/min
          </text>
          <text x="20" y="880" className="lp-svg-muted">
            Overview summarizes logistics. Select an area for its material lane;
            the Iron Rod example opens every splitter, merger and belt.
          </text>
        </svg>
      </div>
    </div>
  );
}
export function VariantB({
  selected,
  onSelect,
  onOpen,
}: {
  selected: string;
  onSelect: (item: string) => void;
  onOpen: () => void;
}) {
  return (
    <section className="lp-lanes">
      <div className="lp-lane-columns">
        <span>Material / throughput</span>
        <span>Supplying machines</span>
        <span>Logistics area</span>
        <span>Receiving machines</span>
      </div>
      {networks.map((network) => (
        <button
          key={network.itemId}
          className={`lp-lane ${selected === network.itemId ? "selected" : ""}`}
          onClick={() => onSelect(network.itemId)}
        >
          <div className="lp-material">
            <img src={descriptorImageUrl(network.itemId)} />
            <div>
              <strong>{network.name}</strong>
              <span>{short(network.rate)} / min</span>
            </div>
          </div>
          <div className="lp-lane-recipe">
            <strong>{network.source}</strong>
            <span>{network.sourceIds.length} machines grouped by recipe</span>
          </div>
          <div className="lp-lane-logistics">
            <div className="lp-lane-wire" />
            <div className="lp-logistics-summary">
              <strong>{network.routerIds.length} routers</strong>
              <span>{network.links.length} physical belts</span>
            </div>
            <div className="lp-lane-wire" />
          </div>
          <div className="lp-lane-recipe">
            <strong>{network.sink}</strong>
            <span>{network.sinkIds.length} receiving machines</span>
          </div>
        </button>
      ))}
      <div className="lp-lane-detail">
        <div>
          <strong>
            {networks.find((n) => n.itemId === selected)!.name} logistics
            selected
          </strong>
          <p>
            The lanes summarize real connections; machine references lead back
            to their recipe group.
          </p>
        </div>
        <button className="lp-primary" onClick={onOpen}>
          Open the complete Iron Rod example
        </button>
      </div>
    </section>
  );
}
function portPoint(id: string, port: string, output: boolean) {
  const p = positions.get(id)!;
  const router = nodes.get(id)!.configuration.kind === "router";
  const branch = Number(port.split(":").at(-1));
  const splitter = nodes
    .get(id)!
    .configuration.buildableId.includes("Splitter");
  const multi = router && (output ? splitter : !splitter);
  return {
    x: p.x + (output ? (router ? 64 : 190) : 0),
    y: p.y + (router ? (multi ? 16 * branch : 32) : 40),
  };
}
function routeFor(link: (typeof rods.links)[number]) {
  const a = portPoint(link.from.nodeId, link.from.portId, true),
    b = portPoint(link.to.nodeId, link.to.portId, false);
  if (link.to.nodeId === returnId)
    return [
      a,
      { x: 1230, y: a.y },
      { x: 1230, y: 870 },
      { x: 730, y: 870 },
      { x: 730, y: b.y },
      b,
    ];
  if (link.from.nodeId === returnId) {
    const index = Number(link.from.portId.split(":").at(-1));
    const lane = 835 + index * 14;
    return [a, { x: lane, y: a.y }, { x: lane, y: b.y }, b];
  }
  const shift = Number(link.from.portId.split(":").at(-1)) || 1;
  const x = a.x + (b.x - a.x) / 2 + (shift - 2) * 9;
  return [a, { x, y: a.y }, { x, y: b.y }, b];
}
export function VariantC() {
  const [selected, setSelected] = useState<string | undefined>();
  const [preview, setPreview] = useState<"actual" | MaterialFlowState>(
    "actual",
  );
  const selectedFlow = selected ? flows.get(selected) : undefined;
  const selectedLink = rods.links.find((l) => l.id === selected);
  const processNode = (node: CanvasNode, id: string) => {
    const p = positions.get(id)!;
    const model = createNodeCardModel(node);
    const index = Number(id.split(":").at(-1));
    const source =
      node.configuration.kind === "process" &&
      node.configuration.processId === "Recipe_IronRod_C";
    return (
      <g key={id} transform={`translate(${p.x} ${p.y})`}>
        <rect width="190" height="80" rx="10" fill="white" stroke="#cdd5dc" />
        <image
          href={buildableImageUrl(node.configuration.buildableId)}
          x="12"
          y="11"
          width="29"
          height="29"
        />
        <text x="51" y="25" className="lp-svg-title">
          {source ? "Constructor" : "Assembler"} {index}
        </text>
        <text x="51" y="44" className="lp-svg-muted">
          {model.clock} · {source ? "15 rods/min" : "12 rods/min input"}
        </text>
        <line x1="12" x2="178" y1="57" y2="57" stroke="#edf0f3" />
        <text x="12" y="72" className="lp-svg-muted">
          {source ? "Iron Rod" : "Modular Frame · 2/min"}
        </text>
      </g>
    );
  };
  return (
    <section className="lp-focus">
      <div className="lp-focus-heading">
        <div>
          <img src={descriptorImageUrl("Desc_IronRod_C")} />
          <div>
            <h2>Iron Rod distribution</h2>
            <p>
              4 constructors · 60/min supply · 5 assemblers receiving 12/min
              each
            </p>
          </div>
        </div>
        <label>
          Link-color preview{" "}
          <select
            value={preview}
            onChange={(e) => setPreview(e.target.value as typeof preview)}
          >
            <option value="actual">Actual capacity status</option>
            <option value="overloaded">Overloaded style</option>
            <option value="shortage">Undersupplied style</option>
          </select>
        </label>
      </div>
      <div className="lp-diagram-scroll">
        <svg
          viewBox="0 0 1600 925"
          aria-label="Complete Iron Rod logistics with dashed feedback connections"
        >
          <rect
            x="25"
            y="82"
            width="230"
            height="574"
            rx="14"
            className="lp-recipe-zone"
          />
          <text x="45" y="112" className="lp-stage">
            IRON ROD · 4 MACHINES
          </text>
          <rect
            x="290"
            y="82"
            width="290"
            height="574"
            rx="14"
            className="lp-zone"
          />
          <text x="315" y="112" className="lp-stage">
            COLLECT · 60/MIN
          </text>
          <rect
            x="620"
            y="82"
            width="670"
            height="574"
            rx="14"
            className="lp-zone"
          />
          <text x="645" y="112" className="lp-stage">
            BALANCE · 5 × 12/MIN
          </text>
          <rect
            x="1345"
            y="82"
            width="235"
            height="574"
            rx="14"
            className="lp-recipe-zone"
          />
          <text x="1370" y="112" className="lp-stage">
            MODULAR FRAME · 5 MACHINES
          </text>
          <rect
            x="620"
            y="714"
            width="670"
            height="190"
            rx="14"
            fill="#f3f5f7"
            stroke="#d6dce2"
          />
          <text x="644" y="740" className="lp-stage">
            RETURN LANE
          </text>
          <text x="940" y="840" className="lp-svg-muted">
            12/min returned as three 4/min feeds
          </text>
          {[...rods.links]
            .sort(
              (a, b) =>
                Number(feedbackIds.has(b.id)) - Number(feedbackIds.has(a.id)),
            )
            .map((link) => {
              const f = flows.get(link.id)!;
              const feedback = feedbackIds.has(link.id);
              const d = rounded(routeFor(link));
              const points = routeFor(link);
              const mid = points[1]!;
              const c = color(preview === "actual" ? f.state : preview);
              const faded = selected && selected !== link.id;
              return (
                <g
                  key={link.id}
                  className="lp-belt"
                  opacity={faded ? 0.22 : 1}
                  onClick={() =>
                    setSelected(selected === link.id ? undefined : link.id)
                  }
                >
                  <title>
                    {f.itemName} · {short(f.ratePerMinute)}/60 per minute ·{" "}
                    {feedback ? "Feedback" : "Forward"}
                  </title>
                  <path d={d} fill="none" stroke="#f7f9fb" strokeWidth="8" />
                  <path
                    data-feedback={feedback}
                    data-link-id={link.id}
                    d={d}
                    fill="none"
                    stroke={c}
                    strokeWidth={selected === link.id ? 4 : 2.8}
                    strokeDasharray={feedback ? "9 6" : undefined}
                    strokeLinecap="round"
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="16"
                  />
                  <text
                    x={mid.x + 5}
                    y={mid.y - 8}
                    className="lp-rate"
                    fill={c}
                  >
                    {short(f.ratePerMinute)}
                  </text>
                </g>
              );
            })}
          {rodIds.map((id) => {
            const n = nodes.get(id)!;
            if (n.configuration.kind === "process") return processNode(n, id);
            const p = positions.get(id)!;
            return (
              <g key={id} transform={`translate(${p.x} ${p.y})`}>
                <title>
                  {n.configuration.buildableId.includes("Splitter")
                    ? "Splitter"
                    : "Merger"}
                </title>
                <rect
                  width="64"
                  height="64"
                  rx="10"
                  fill="white"
                  stroke="#bdc8d2"
                />
                <image
                  href={buildableImageUrl(n.configuration.buildableId)}
                  x="9"
                  y="9"
                  width="46"
                  height="46"
                  opacity="0.42"
                />
                {id === returnId && (
                  <text
                    x="32"
                    y="88"
                    textAnchor="middle"
                    className="lp-svg-muted"
                  >
                    Return splitter
                  </text>
                )}
              </g>
            );
          })}
          {rods.links
            .flatMap((link) => [
              {
                ...portPoint(link.from.nodeId, link.from.portId, true),
                key: link.id + "out",
              },
              {
                ...portPoint(link.to.nodeId, link.to.portId, false),
                key: link.id + "in",
              },
            ])
            .map((p) => (
              <circle
                key={p.key}
                cx={p.x}
                cy={p.y}
                r="4.5"
                fill="white"
                stroke={color()}
                strokeWidth="1.5"
              />
            ))}
          <text x="1368" y="685" className="lp-svg-muted">
            Reinforced Plate input is shown
          </text>
          <text x="1368" y="704" className="lp-svg-muted">
            in its own logistics area.
          </text>
        </svg>
      </div>
      <div className="lp-inspect">
        <div>
          <strong>
            {selectedFlow
              ? `${selectedFlow.itemName} · ${short(selectedFlow.ratePerMinute)}/min`
              : "Select a belt to trace it"}
          </strong>
          <span>
            {selectedLink
              ? `${feedbackIds.has(selectedLink.id) ? "Dashed feedback" : "Solid forward flow"} · Conveyor Mk.1 · 60/min capacity`
              : `${rodIds.length} nodes and ${rods.links.length} belts shown · ${feedbackIds.size} dashed return connections · same capacity palette`}
          </span>
        </div>
        <button onClick={() => setSelected(undefined)}>Clear selection</button>
      </div>
      {preview !== "actual" && (
        <p className="lp-preview-note">
          Style preview only. Rates and belt tiers are unchanged; solid and
          dashed links use the same status color.
        </p>
      )}
    </section>
  );
}
function Legend() {
  return (
    <div className="lp-legend">
      <span>
        <i style={{ borderColor: color() }} />
        Forward
      </span>
      <span>
        <i style={{ borderColor: color(), borderTopStyle: "dashed" }} />
        Feedback
      </span>
      <span className="lp-legend-divider" />{" "}
      {["balanced", "overloaded", "shortage"].map((state) => (
        <span key={state}>
          <b style={{ background: color(state as MaterialFlowState) }} />
          {state === "shortage"
            ? "Undersupplied"
            : state[0]!.toUpperCase() + state.slice(1)}
        </span>
      ))}
    </div>
  );
}
export default function LogisticsLayoutPrototype() {
  const initial = new URLSearchParams(location.search).get(
    "variant",
  ) as Variant;
  const [variant, setVariant] = useState<Variant>(
    variants.includes(initial) ? initial : "A",
  );
  const [selected, setSelected] = useState("Desc_IronRod_C");
  const switchTo = (next: Variant) => {
    setVariant(next);
    const url = new URL(location.href);
    url.searchParams.set("variant", next);
    history.replaceState(null, "", url);
    window.scrollTo({ top: 0, left: 0 });
  };
  const cycle = (direction: number) =>
    switchTo(
      variants[
        (variants.indexOf(variant) + direction + variants.length) %
          variants.length
      ]!,
    );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.matches("input,textarea,select") || target.isContentEditable)
        return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        cycle(e.key === "ArrowLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [variant]);
  return (
    <main className="lp-root">
      <header className="lp-header">
        <div className="lp-brand">
          <img src={descriptorImageUrl("Desc_ModularFrame_C")} />
          <div>
            <strong>Modular Frames</strong>
            <span>10 / min · Detailed plan · Conveyor Mk.1</span>
          </div>
        </div>
        <div className="lp-mode">
          <span>Basic</span>
          <strong>Detailed</strong>
        </div>
        <span className="lp-badge">Layout prototype · read only</span>
      </header>
      <div className="lp-intro">
        <div>
          <div className="lp-eyebrow">PRODUCTION FIRST</div>
          <h1>{variantNames[variant]}</h1>
          <p>{descriptions[variant]}</p>
        </div>
        <div className="lp-stats">
          <strong>
            {
              document.nodes.filter((n) => n.configuration.kind === "process")
                .length
            }
            <span>machines</span>
          </strong>
          <strong>
            {
              document.nodes.filter((n) => n.configuration.kind === "router")
                .length
            }
            <span>routers</span>
          </strong>
          <strong>
            {document.materialLinks.length}
            <span>belts</span>
          </strong>
        </div>
      </div>
      <Legend />
      {variant === "A" ? (
        <VariantA
          onInspect={(item) => {
            setSelected(item);
            switchTo(item === "Desc_IronRod_C" ? "C" : "B");
          }}
        />
      ) : variant === "B" ? (
        <VariantB
          selected={selected}
          onSelect={setSelected}
          onOpen={() => switchTo("C")}
        />
      ) : (
        <VariantC />
      )}
      <footer className="lp-disclosure">
        Hand-arranged design study using the actual generated Modular Frame
        plan. No saves or production layout behavior are changed.
      </footer>
      {import.meta.env.DEV && (
        <nav className="lp-switcher" aria-label="Prototype variants">
          <button aria-label="Previous variant" onClick={() => cycle(-1)}>
            ←
          </button>
          {variants.map((key) => (
            <button
              key={key}
              aria-pressed={key === variant}
              onClick={() => switchTo(key)}
            >
              <small>{key}</small>
              {variantNames[key]}
            </button>
          ))}
          <button aria-label="Next variant" onClick={() => cycle(1)}>
            →
          </button>
        </nav>
      )}
    </main>
  );
}
