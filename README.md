# 3D Arrow Game Editor

Compound 3D arrow puzzle editor with multi-block cube/cuboid structure editing, Surface Atlas editing, and Three.js preview/play mode.

## Online Page

After GitHub Pages finishes deploying from the `main` branch root, the editor should be available at:

https://gaogaolo.github.io/3Darrow_game/

## Local Run

This page uses ES modules, so run it through a local HTTP server:

```bash
python3 -m http.server 8127
```

Then open:

```text
http://127.0.0.1:8127/index.html
```

## Contents

- `index.html`: main compound editor app
- `vendor/`: local Three.js and OrbitControls dependencies
- `MEMORY.md`: editor logic notes and implementation memory
- `smoke-test.mjs`: Playwright smoke test used during development

## Current Level Schema

```json
{
  "SchemaVersion": 4,
  "BoardType": "compound_blocks",
  "GridUnit": 1,
  "Blocks": [
    {
      "Id": "A",
      "Size": [6, 4, 4],
      "Position": [0, 0, 0],
      "RotationDeg": [0, 0, 0]
    }
  ],
  "SurfacePolicy": {},
  "EditorConfig": {},
  "BlockedCells": [],
  "Arrows": []
}
```

## Current Behavior

- Multiple cubes/cuboids can be freely added, duplicated, deleted, rotated, and positioned.
- A selected surface cell can be used to attach a new Block.
- External surface cells are generated from all Blocks, then overlap/contact areas are removed by cell-center coverage.
- The final surface must be connected and free of ambiguous shared edges before arrow generation.
- Mouse drag, pan, and zoom are supported in the 3D viewport.
