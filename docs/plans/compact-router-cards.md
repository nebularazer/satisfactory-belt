# Compact router cards

Status: implemented for visual trial. The headerless square design replaces the earlier proposal for a smaller header.

## Current design

- Splitters, mergers (including smart, programmable, and priority variants), and Pipeline Junctions use a 128 × 128 canvas-unit square, down from 192 × 176.
- The card has no header or title. A 64-unit building icon sits in the center at muted opacity, adjusted for light and dark backgrounds.
- All ports remain visible with 32-unit vertical spacing, centered in the body. Existing port order and bidirectional pipeline semantics are preserved.
- Port rates remain beside the ports. Repeated item thumbnails are omitted from the compact body, and long rates are truncated to avoid overlapping the opposite side. Full material and configuration details remain in the inspector.
- Selection keeps the same footprint. Production Machines, Buffers, and Transport Nodes retain their existing presentation.

## Geometry and saved plans

The renderer, port geometry, node bounds, and Auto-arrange share `node-card-layout.ts`. New Router cards use the square size in both Basic and Detailed modes. Opening existing plans converts standard legacy Router sizes while preserving node origins and custom dimensions. Connection endpoints resolve against the new port positions; saved manual bends are retained where routing permits.

## Review next

Try the design on a dense factory at overview and working zoom. Evaluate recognition of Router variants from the muted icons, port-rate readability, and touch selection near adjacent ports. Consider changes to icon opacity or body content based on use before adding further presentation options.
