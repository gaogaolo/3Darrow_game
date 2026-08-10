# 3D Arrow Compound Editor Memory

Last updated: 2026-08-07

## What This Is

This is the current single-file HTML editor for a compound 3D arrow puzzle map built from multiple cubes/cuboids.

Source of truth:

- `editor/index.html`
- `github-pages/index.html` is kept as a deployable copy.

Current level schema:

```json
{
  "Level": 1,
  "Blocks": [],
  "Arrows": []
}
```

`BlockedCells` is optional and only exported when non-empty.

The old `SchemaVersion` / `BoardType` wrapper is no longer part of the exported level JSON.

## Core Map Model

- The map is made from multiple unit-grid Blocks.
- Each Block is a cube or cuboid with:
  - `Id`
  - internal `size: [W, H, D]`
  - `Position: [x, y, z]`
  - `RotationDeg: [x, y, z]`
- Exported levels keep only `Id`, `BlockSize`, `Position`, and non-default `RotationDeg`.
- `RotationOrder`, `Color`, `Locked`, and `Visible` are editor-side fields only.
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
- Surface graph steps carry `toDir` / `continueDir`, the target-cell local direction to use after crossing that shared edge.
- Surface graph steps also carry `seamKind` / `forwardAllowed`:
  - `same_block`: the shared edge belongs to one Block's own outer surfaces.
  - `block_seam`: the shared edge is formed by two different Blocks.
  - `forwardAllowed` is true for `coplanar` and for `edge_fold + block_seam`, false for `edge_fold + same_block`.
- More than two cells sharing the same edge create an `ambiguous_edge` issue.
- The final external surface must be one connected component to generate arrows.
- Disconnected maps can be edited/imported temporarily, but generation is blocked.

## Arrow Rules

- Arrow paths are arrays of surface cell ids such as `A:front:2_3`.
- A path must be continuous on the Surface Graph.
- Path cells cannot repeat, enter blocked cells, or overlap other arrows.
- Cross-plane/cross-Block motion is legal only through graph-connected shared edges.
- The arrow body can cross multiple faces/Blocks.
- Arrow logic deliberately separates three path types:
  - `BodyPath`: arrow body path; can use both `coplanar` seams and `edge_fold` folded edges.
  - `ForwardRay`: gameplay removal ray; follows `forwardAllowed` seams, including coplanar seams and cross-Block 90-degree fold seams.
  - `SurfaceTrace`: self-facing validation trace; can use both `coplanar` and `edge_fold`.

### Head Direction

- The arrow head direction is inferred from the first body segment.
- If the path has three or more cells, the first and second body steps must continue in the same direction.
- The arrow head must face opposite to that inferred body-extension direction.
- Example: body extends upward from the head, arrow direction must be `D`, not `L`.

### Removal/Blocking

- Movement checks blockers along `ForwardRay`.
- `ForwardRay` continues across coplanar Block seams, so arrows on the same continuous logical face can block removal even when they belong to another Block.
- `ForwardRay` continues across a 90° `edge_fold` only when that fold is a `block_seam`; folded-face bodies on that seam can block removal.
- `ForwardRay` stops at a same-Block 90° `edge_fold`; ordinary cuboid outer folds do not block current-face movement.
- If `ForwardRay` cycles through forward-allowed seams, the arrow is not removable and the UI reports `前进路径存在循环`.
- A missing Surface Cell, hole, uncovered gap, or geometry boundary stops the ray and is treated as an open boundary.
- `SurfaceTrace` is used only to reject invalid self-facing shapes where the head points into its own cross-face body.
- Block geometry boundaries and blocked cells do not count as movement blockers.

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

## Remote Auto Generation Config

The planned R&D-facing remote config key is:

```text
arrow_auto_level_generation_control
```

The value is a JSON array. Auto-generated levels default to a single-Block map; the config controls that single Block's size and the arrow generation parameters.

Example:

```json
[
  {
    "Level": [1, 1],
    "BlockSize": [10, 10, 10],
    "FillRate": 0.5,
    "CrossFaceRate": 0.5,
    "LengthWeight": "2:1,3:1,4:1,5:1,6:1,7:1,8:1,9:1,10:70",
    "BendWeight": "0:65,1:35"
  }
]
```

Config matching:

- `Level` is `[minLevel, maxLevel]`, inclusive.
- Config rows should be sorted by `minLevel`.
- Overlapping ranges should be rejected or avoided.
- If a level has no exact matching range, use the nearest previous lower range.
- If the level is lower than the first range, use the first range or a product default; this needs to be fixed in implementation.

Fields:

- `BlockSize`: `[W, H, D]` for the single generated Block. The generated Block should default to `Id: "A"`, `Position: [0, 0, 0]`, and `RotationDeg: [0, 0, 0]`.
- `FillRate`: target occupancy ratio over final generatable Surface Cells, excluding blocked cells. Clamp to `[0, 1]`, but high values do not guarantee exact fill because solvability and path constraints can stop generation early. Current editor UI clamps to `0.88`.
- `CrossFaceRate`: per-step cross-face candidate selection probability, not per-arrow cross-face probability. Clamp to `[0, 1]`.
  - At each BodyPath generation step, if reachable `edge_fold` candidates exist and random hits `CrossFaceRate`, prefer those cross-face candidates.
  - `CrossFaceRate = 1` still does not guarantee every arrow crosses a face because the start may be far from any fold edge, the path may end before reaching an edge, bend limits may prevent reaching the edge, the target may be occupied/blocked, or crossing may create repeats or an unsolvable puzzle.
  - This only affects BodyPath generation. Runtime removal still uses `ForwardRay` and each graph step's `forwardAllowed`.
- `LengthWeight`: weight string for arrow path length. Format is `"length:weight,length:weight"`.
  - Need a final implementation decision: current editor treats length as total occupied cells including the head and clamps minimum length to `2`.
  - If product wants single-cell arrows, implementation must support `Length = 1` and define how its direction is chosen.
- `BendWeight`: weight string for bend count. Format is `"bendCount:weight,bendCount:weight"`.
  - Recommended interpretation: maximum allowed bend count, not exact required bend count, because exact bends sharply increase generation failures.
  - Current editor accepts paths with `actualBends <= targetBends`.

Important wording for specs: `CrossFaceRate` is more accurately a cross-face candidate priority probability, and `FillRate` is a target fill rate, not a guaranteed final ratio.

## Import / Export

Export writes the minimal runtime level JSON:

```json
{
  "Level": 1,
  "Blocks": [
    {
      "Id": "A",
      "BlockSize": [6, 4, 4],
      "Position": [0, 0, 0],
      "RotationDeg": [0, 0, 0]
    }
  ],
  "BlockedCells": ["A:top:2_1"],
  "Arrows": [
    {
      "Dir": "U",
      "Path": ["A:front:1_2", "A:front:2_2"]
    }
  ]
}
```

Rules:

- `Level` is required.
- `Blocks` is required and non-empty.
- `Arrows` is required and can be empty.
- `BlockedCells` is optional and omitted when empty.
- Block dimensions are exported as `BlockSize`; the editor's internal `size` field is unchanged.
- `Size` / `size` are import-compatible legacy aliases only. The editor no longer emits `Size` in exported JSON.
- `RotationDeg` is omitted when `[0, 0, 0]`.
- `RotationOrder`, `Color`, `Locked`, `Visible`, `SchemaVersion`, `BoardType`, `GridUnit`, `Snap`, `SurfacePolicy`, `EditorConfig`, and `MapValidation` are not exported anymore.

Import requires `Level`, `Blocks`, and `Arrows`. Invalid arrows are rejected against the generated Surface Graph.
Imported arrows are re-numbered internally in file order because the exported JSON schema does not store arrow ids.

## Export Field Reference

- `Level`, format: number. Controls the current exported level id.
- `Blocks`, format: array of objects. Controls the full 3D block layout of the map.
  - `Id`, format: string. Unique block id; arrow paths and blocked cells reference this id.
  - `BlockSize`, format: `[W, H, D]`. Controls the block size in grid cells along local X/Y/Z.
  - `Position`, format: `[x, y, z]`. Controls the block center position in world coordinates.
  - `RotationDeg`, format: `[x, y, z]`. Controls block rotation in degrees around local XYZ axes; omitted when `[0, 0, 0]`.
- `BlockedCells`, format: string array, optional. Controls blocked surface cells.
  - Each item is a surface-cell id in the form `BlockId:Face:row_col`, for example `A:front:2_3`.
  - `Face` is one of `front / back / left / right / top / bottom`.
- `Arrows`, format: array of objects. Controls all arrow paths in the level.
  - `Dir`, format: string. Controls the arrow head direction; only `U / D / L / R` are valid.
  - `Path`, format: string array. Controls the ordered surface-cell path occupied by that arrow body.
  - Each path item uses the same `BlockId:Face:row_col` format as `BlockedCells`.

Editor-only fields such as `Color`, `Locked`, `Visible`, and `RotationOrder` stay internal and are not exported.

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

## Reward Core

- Each level renders one reward core at the geometric center of the current compound shape.
- The reward core is only a visual layer; it is not part of export/import JSON.
- The core is a clustered cash pile inspired by the provided reference:
  - multiple green bill bundles piled together
  - white center bands
  - gold side strips
- The reward core is visible during editor preview and gameplay.
- The outer cube shell and arrows stay semi-transparent so the reward core can be seen through them.
- When the last playable arrow is removed during preview/play, the cube enters a purely visual "broken open" state and the reward core pops out with shard fragments.
- Structure changes, import, clear, and regeneration reset the reward reveal state.

## Runtime Hooks

The page exposes:

```js
window.compoundArrowEditor = {
  state,
  buildSurface,
  findDirectionBetweenCells,
  getPlanarRay,
  getForwardRay,
  getSurfaceTrace,
  canRemoveArrow,
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
- Reward core is visible in preview and unlocks when the last playable arrow is removed.
- Coplanar Block seams remain in `ForwardRay` and can block removal.
- Cross-Block 90° `edge_fold` seams remain in `ForwardRay` and can block removal.
- Same-Block 90° `edge_fold` targets are excluded from `ForwardRay` but remain reachable by `SurfaceTrace`.
- Forward-allowed cycles are detected and marked as `cycle`.
- Missing-cell holes stop `ForwardRay`; the ray does not jump to later cells.
