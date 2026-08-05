# 3D Arrow Compound Editor Memory

Last updated: 2026-08-05

## What This Is

This is the current single-file HTML editor for a compound 3D arrow puzzle map built from multiple cubes/cuboids.

Source of truth:

- `editor/index.html`
- `github-pages/index.html` is kept as a deployable copy.

Current level schema:

```json
{
  "SchemaVersion": 4,
  "BoardType": "compound_blocks",
  "GridUnit": 1,
  "Blocks": [],
  "SurfacePolicy": {},
  "EditorConfig": {},
  "BlockedCells": [],
  "Arrows": []
}
```

The old single-cuboid `SchemaVersion: 3` / `BoardType: "cuboid"` logic is no longer the active editor logic.

## Core Map Model

- The map is made from multiple unit-grid Blocks.
- Each Block is a cube or cuboid with:
  - `Id`
  - `Size: [W, H, D]`
  - `Position: [x, y, z]`
  - `RotationDeg: [x, y, z]`
  - `RotationOrder`
  - `Color`
  - `Visible`
- Blocks can be freely added in space through "自由添加".
- Blocks can be attached to a selected surface cell through "贴面添加".
- A selected Block can be moved onto a selected surface cell through "移动到选中表面".
- Rotation uses angle snapping, default `15°`, with `15/30/45/90` quick options.
- Size is configured directly in the selected Block panel.
- Position editing is simplified through target-surface placement and `X/Y/Z` move buttons using `1/2/4` grid-step options.
- Rotation editing is simplified through `X/Y/Z` rotation buttons using the current angle snap.
- Raw position and rotation inputs remain available under a collapsed "精确坐标与角度" panel.

## Surface Generation

The playable map is not the raw Block volume. It is the final external surface after Block overlap/contact removal.

Generation steps:

1. Generate unit cells for the 6 faces of every visible Block.
2. Transform each cell center, corners, normal, and tangent axes into world space.
3. Remove a surface cell when its center enters another Block or lies on another Block's face-contact interior.
4. Do not generate cut/interior faces for overlap areas.
5. Keep edge/corner contact surfaces unless the cell-center coverage rule removes them.
6. Build a Surface Graph from remaining external cells.

Coverage policy:

```json
{
  "CoverageRule": "cell_center_inside_other_block",
  "RemoveFaceContact": true,
  "GenerateCutInteriorFaces": false,
  "RequireConnected": true,
  "RejectAmbiguousEdges": true
}
```

## Surface Graph

- Each surface cell has four directed edges: `U/D/L/R`.
- Edges are keyed by quantized world-space endpoints.
- Exactly two cells sharing an edge create a graph connection.
- A connection is:
  - `coplanar` when normals and plane distance match.
  - `edge_fold` when the cells share an edge across different planes.
- More than two cells sharing the same edge create an `ambiguous_edge` issue.
- The final external surface must be one connected component to generate arrows.
- Disconnected maps can be edited/imported temporarily, but generation is blocked.

## Arrow Rules

- Arrow paths are arrays of surface cell ids such as `A:front:2_3`.
- A path must be continuous on the Surface Graph.
- Path cells cannot repeat, enter blocked cells, or overlap other arrows.
- Cross-plane/cross-Block motion is legal only through graph-connected shared edges.
- The arrow body can cross multiple faces/Blocks.

### Head Direction

- The arrow head direction is inferred from the first body segment.
- If the path has three or more cells, the first and second body steps must continue in the same direction.
- The arrow head must face opposite to that inferred body-extension direction.
- Example: body extends upward from the head, arrow direction must be `D`, not `L`.

### Removal/Blocking

- Movement checks blockers only along the head's current coplanar forward ray.
- Bodies on other faces do not block the head's current-face movement ray.
- A second forward-surface ray is used only to reject invalid self-facing shapes where the head points into its own cross-face body.

## Editor Modes

- `structure`: select cells/Blocks and add/edit/delete Blocks.
- `play`: click arrows to remove them when their current-plane forward ray is clear.
- `draw`: manually click cells to draw one arrow path.
- `block`: toggle blocked surface cells.

Manual drawing:

- Clicking back to the previous cell undoes one step.
- Finishing a path auto-infers the head direction when possible.
- The new arrow must keep the puzzle solvable.

## Generation

- `fillGeneratedArrows()` clears existing arrows and fills toward `inputFillRate`.
- `addRandomArrow()` samples starts, lengths, bends, and cross-plane opportunities.
- Length and bend distributions use the same editable weight-string format as the earlier editor.
- `inputCrossRate` biases path candidates toward `edge_fold` steps.
- Every placed arrow is validated and must preserve a quick solvability check.

## Import / Export

Export writes:

- `SchemaVersion: 4`
- `BoardType: "compound_blocks"`
- `GridUnit`
- `Snap`
- `Blocks`
- `SurfacePolicy`
- `EditorConfig`
- `MapValidation`
- `BlockedCells`
- `Arrows`

Import requires:

- `SchemaVersion === 4`
- `BoardType === "compound_blocks"`
- non-empty `Blocks`

Import validates arrows against the generated Surface Graph. Invalid imported structure can be loaded for editing, but invalid arrows are rejected.

## UI Structure

- Top bar: title, status, counts, generate/validate/export/clear actions.
- Left panel: Block list, Block transform/size controls, mode switch, generation parameters, issues.
- Middle panel: Surface Atlas grouped by final world-space planes.
- Right panel: Orbit-controlled 3D compound preview/play surface with a "复位视角" action.
- Bottom dock: JSON import/export/download/sample.

Important UI ids:

- `btnAddBlock`, `btnAttachBlock`, `btnDuplicateBlock`, `btnDeleteBlock`
- `inputSizeW`, `inputSizeH`, `inputSizeD`
- `inputPosX`, `inputPosY`, `inputPosZ`
- `inputRotX`, `inputRotY`, `inputRotZ`
- `inputSnap`
- `inputMoveStep`
- `btnMoveBlockToCell`
- `btnResetCamera`
- `atlasList`, `threeViewport`, `jsonBox`
- `btnGenerate`, `btnValidate`, `btnExport`, `btnImport`, `btnSample`

## 3D Rendering

- Uses local `three.module.js` and `OrbitControls.js`.
- The camera supports mouse drag/orbit, pan, and zoom.
- `ResizeObserver` sizes the canvas to the viewport host.
- `renderFrame()` immediately commits a frame after resize and scene rebuild, so the 3D panel does not appear blank.
- The 3D viewport must keep a stable explicit height. Do not let `#threeViewport` with `height: 100%` determine parent height, or `ResizeObserver -> renderer.setSize()` can create a feedback loop that makes the viewport keep growing and look like the camera is auto-zooming out.
- `resetCameraView()` frames the current final visible surface shape, using surface-cell corner points and camera FOV projection so wide/tall/rotated compound shapes fit fully in the 3D viewport.
- The latest reset frame is stored in `state.lastCameraFrame` with center, distance, radius, point count, and projected coverage.
- Surface cells are rendered as selectable planes.
- Block shells are transparent cuboids with edge outlines.
- Arrow bodies are cylinders and arrow heads are triangle meshes.
- Ambiguous graph edges render as issue lines.

## Runtime Hooks

The page exposes:

```js
window.compoundArrowEditor = {
  state,
  buildSurface,
  findDirectionBetweenCells,
  getPlanarRay,
  quickSolveCheck,
  moveSelectedBlockToCell,
  resetCameraView,
  exportLevel,
  importLevel
}
```

## Verified Smoke Coverage

`editor/smoke-test.mjs` currently verifies:

- Desktop and mobile rendering.
- Canvas is nonblank.
- 3D viewport height remains stable after load, preventing the auto-shrinking/auto-zoom-out visual bug.
- No horizontal overflow.
- Default `compound_blocks` export is valid.
- Random generation creates a solvable puzzle.
- Sample loads 3 connected Blocks.
- Attach action adds a Block.
- X/Y/Z nudge controls move the selected Block by the chosen grid step.
- X/Y/Z rotation controls rotate the selected Block by the current snap angle.
- Move-to-surface changes the selected Block's placement from a selected target surface cell.
- Reset camera reports `视角已复位`.
- Reset camera is verified against a long 5-Block compound shape and must keep projected X/Y coverage below the viewport boundary.
- Disconnected maps are marked invalid and cannot generate.
- Direction mismatch arrows are rejected.
- Self-facing cross-face arrows are rejected.
