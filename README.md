# 3D Arrow Game Editor

3D cuboid arrow puzzle editor with unfolded-net editing and Three.js preview/play mode.

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

- `index.html`: main editor app
- `vendor/`: local Three.js and OrbitControls dependencies
- `MEMORY.md`: editor logic notes and implementation memory
- `smoke-test.mjs`: Playwright smoke test used during development

## Current Level Schema

```json
{
  "SchemaVersion": 3,
  "BoardType": "cuboid",
  "BoxSize": {
    "width": 7,
    "height": 5,
    "depth": 4
  },
  "EditorConfig": {},
  "BlockedCells": [],
  "Arrows": []
}
```
