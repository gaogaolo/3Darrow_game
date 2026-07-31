# Arrow Cube Editor Memory

Last updated: 2026-07-31

## What This Is

This is a single-file HTML editor for a 3D arrow puzzle on a cuboid surface.
It is the current source of truth for the editor behavior in `arrow-cube-editor/index.html`.

The old face-size compatibility logic has been removed.
Current level schema is:

```json
{
  "SchemaVersion": 3,
  "BoardType": "cuboid",
  "BoxSize": { "width": 7, "height": 5, "depth": 4 },
  "EditorConfig": { ... },
  "BlockedCells": [ ... ],
  "Arrows": [ ... ]
}
```

## Core Model

- The board is a cuboid surface with 6 faces: `top`, `left`, `front`, `right`, `back`, `bottom`.
- User-facing size is `BoxSize.width / height / depth`.
- Derived face sizes are:
  - `front/back = height x width`
  - `left/right = height x depth`
  - `top/bottom = depth x width`
- Paths use tokens like `front:3_1`.
- Internal cell identity uses `face:r,c`.
- Each arrow has:
  - `id`
  - `dir` in `U/D/L/R`
  - `path` array of surface cells
  - `color`
  - `ray` for head-face removal checks

## Important Rules

### Path continuity

- A path must be continuous across the surface.
- Adjacent path cells may stay on the same face or cross to a neighboring face.
- Cross-face steps must happen only through shared edge cells.
- The arrow body may span multiple faces.

### Head direction rule

- The arrow head direction is inferred from the first body segment.
- If the first two segments extend in a direction, the head must face the opposite direction.
- If the first three cells exist, the first two segments must extend in the same direction.
- Example: if the body extends upward, the arrow cannot face left; it must face down.

### Self-blocking rule

- The head only checks blockers on its current face ray.
- Body cells on other faces do not block that ray unless they lie on the same forward surface ray path.
- The forward surface ray is used to reject cases where the arrow would face into its own cross-face body.

## Key Helpers

### Box size and derived dimensions

- `cloneBoxSize`
- `normalizeBoxSize`
- `boxSizeToSurfaceDims`
- `setBoxSize`
- `boxSizeSummary`
- `boxDerivedFacesSummary`
- `boxMeasures`

### Surface topology

- `getCrossFaceStep`
- `getSurfaceStep`
- `getSurfaceNeighbors`
- `areSurfaceNeighbors`
- `getLocalRayOnFace`
- `getSurfaceForwardRay`

### Path validation

- `parsePathToken`
- `parseBlockToken`
- `isInBounds`
- `getDirectionBetween`
- `inferHeadDirectionFromPath`
- `validateHeadDirection`
- `validatePathGeometry`
- `makeArrow`
- `validateAndStore`

### Solving and removal

- `canRemoveArrow`
- `quickSolveCheck`
- `currentlyRemovableIds`
- `getRayBlockers`
- `removeArrowById`
- `removeOneBatch`

### Generation

- `parseWeights`
- `sampleWeighted`
- `generateRandomPath`
- `addRandomArrow`
- `fillFullCubeMap`

## Editor Modes

- `play`: click arrows to select or remove.
- `draw`: click cells to build a path manually.
- `block`: toggle blocked cells.

Manual drawing rules:

- Path cannot pass through occupied cells or blocked cells.
- Path must stay continuous.
- The last two cells can be undone by clicking back to the previous cell.
- On finish, the head direction is auto-derived when possible.

## Import / Export

### Export

- Export always writes `SchemaVersion: 3`.
- Export always writes `BoardType: "cuboid"`.
- Export includes `BoxSize`, `EditorConfig`, `BlockedCells`, and `Arrows`.
- Download filename is `cuboid_arrow_level_XXXX.json`.

### Import

- Import requires `SchemaVersion === 3`.
- Import requires `BoardType === "cuboid"`.
- Import requires `BoxSize`.
- Import validates:
  - box size range
  - blocked cells in bounds
  - arrow paths in bounds
  - no collisions
  - continuity
  - head direction rule
  - forward-ray self-blocking rule

## UI Structure

- Top bar shows:
  - title
  - counts
  - actions
- Left panel contains:
  - cuboid size controls
  - generation weights
  - 3D generation parameters
  - mode switch
  - selected arrow tools
- Middle panel shows the unfolded net.
- Right panel shows the 3D cuboid preview / play view.
- Bottom dock is JSON import/export.

Important UI ids:

- size inputs: `inputBoxWidth`, `inputBoxHeight`, `inputBoxDepth`
- apply size: `btnApplyBoxSize`
- size readout: `boxDimsReadout`
- 3D size chip: `boxSizeChip`
- JSON box: `jsonBox`
- import/export/sample buttons: `btnImport`, `btnDownload`, `btnSample`

## 3D Rendering

- Uses local `three.module.js` and `OrbitControls.js`.
- Camera is orbit-controlled.
- `ResizeObserver` keeps the canvas sized to its host.
- Mouse click raycasts the 3D cells.
- Each cell is a plane aligned to the face.
- Arrow body connectors are cylinders between path cells.
- Arrow head is a triangle shape placed on the head cell.
- Optional ring marks removable arrows.
- `lineStyle` swaps arrow colors to monochrome.

## Generation Logic

- `fillFullCubeMap()` clears arrows, then fills toward a target occupancy based on fill rate.
- `addRandomArrow()` tries candidate starts and lengths until a valid arrow is found.
- Candidate length and bends are sampled from weighted distributions.
- Paths may cross faces, but are still limited by:
  - max bends
  - max cross-face count
  - occupancy / blocked cells

## State

`state` currently holds:

- `level`
- `boxSize`
- `faceDims`
- `arrows`
- `gridMap`
- `blockedCells`
- `selectedArrowId`
- `mode`
- `drawPath`
- `lineStyle`
- `lastSolve`

## Runtime Hooks

For debugging and automation, the page exposes:

```js
window.cubeArrowEditor = {
  state,
  getSurfaceStep,
  getSurfaceNeighbors,
  getLocalRayOnFace,
  quickSolveCheck,
  exportLevel,
  importLevel
}
```

## Smoke Test

`smoke-test.mjs` verifies:

- the canvas renders non-blank content
- sample import succeeds
- the exported sample is `cuboid`
- wrong head direction is rejected
- self-facing cross-face body is rejected
- the layout does not overflow horizontally

## Current Operational Note

This editor runs best through a local HTTP server.
Opening the file directly with `file://` may fail because the page uses ES modules and local browser security rules are stricter there.

