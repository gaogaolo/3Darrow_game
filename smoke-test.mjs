import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("/Users/xmiles/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const url = process.env.EDITOR_URL || "http://127.0.0.1:8127/index.html";
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function canvasStats(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("#threeViewport");
    const probe = document.createElement("canvas");
    probe.width = canvas.width;
    probe.height = canvas.height;
    const ctx = probe.getContext("2d");
    ctx.drawImage(canvas, 0, 0);
    const data = ctx.getImageData(0, 0, probe.width, probe.height).data;
    let alpha = 0;
    let varied = 0;
    for (let i = 0; i < data.length; i += 96) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a > 0) alpha += 1;
      if (a > 0 && (Math.abs(r - 7) > 4 || Math.abs(g - 13) > 4 || Math.abs(b - 20) > 4)) varied += 1;
    }
    return { width: canvas.width, height: canvas.height, alpha, varied };
  });
}

async function exportPayload(page) {
  await click(page, "#btnExport");
  await page.waitForTimeout(120);
  return page.evaluate(() => JSON.parse(document.querySelector("#jsonBox").value));
}

async function click(page, selector) {
  await page.locator(selector).click({ force: true });
}

async function importPayload(page, payload) {
  await page.evaluate((nextPayload) => {
    document.querySelector("#jsonBox").value = JSON.stringify(nextPayload, null, 2);
  }, payload);
  await click(page, "#btnImport");
  await page.waitForTimeout(250);
}

async function viewportHeightStability(page) {
  return page.evaluate(async () => {
    const host = document.querySelector("#viewportHost");
    const canvas = document.querySelector("#threeViewport");
    const samples = [];
    for (let i = 0; i < 7; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      samples.push({
        hostHeight: Math.round(host.getBoundingClientRect().height),
        canvasHeight: canvas.height,
        clientHeight: canvas.clientHeight
      });
    }
    const hostHeights = samples.map((item) => item.hostHeight);
    const canvasHeights = samples.map((item) => item.canvasHeight);
    return {
      samples,
      hostDelta: Math.max(...hostHeights) - Math.min(...hostHeights),
      canvasDelta: Math.max(...canvasHeights) - Math.min(...canvasHeights)
    };
  });
}

function baseBlockPayload(arrows = []) {
  return {
    Level: 1,
    Blocks: [
      {
        Id: "A",
        Size: [4, 4, 4],
        Position: [0, 0, 0],
        RotationDeg: [0, 0, 0]
      }
    ],
    BlockedCells: [],
    Arrows: arrows
  };
}

function longCompoundPayload() {
  const payload = baseBlockPayload();
  payload.Blocks = Array.from({ length: 5 }, (_, index) => ({
    Id: String.fromCharCode(65 + index),
    Size: [4, 4, 4],
    Position: [index * 4, 0, 0],
    RotationDeg: [0, 0, 0]
  }));
  return payload;
}

async function runViewport(browser, viewport, screenshotPath) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const messages = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") messages.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("#threeViewport");
  await page.waitForTimeout(900);

  const before = await canvasStats(page);
  const initial = await exportPayload(page);
  const initialStats = await page.evaluate(() => ({
    title: document.querySelector("h1").textContent,
    statBlocks: document.querySelector("#statBlocks").textContent,
    statSurface: Number(document.querySelector("#statSurface").textContent),
    mapChip: document.querySelector("#mapChip").textContent,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    hasMoveButton: Boolean(document.querySelector("#btnMoveBlockToCell")),
    hasResetButton: Boolean(document.querySelector("#btnResetCamera")),
    hasExactPanel: Boolean(document.querySelector(".exact-panel")),
    exportedFns: Object.keys(window.compoundArrowEditor || {})
  }));
  const forwardPathRules = await page.evaluate(() => {
    const editor = window.compoundArrowEditor;
    const surface = editor.state.surface;
    const seamStep = [...surface.graph.values()].find((step) => (
      step.relation === "coplanar"
      && step.from.split(":")[0] !== step.to.split(":")[0]
    ));
    const foldStep = [...surface.graph.values()].find((step) => (
      step.relation === "edge_fold"
      && step.seamKind === "same_block"
    ));
    const seamRay = seamStep
      ? editor.getForwardRay(seamStep.from, seamStep.fromDir)
      : null;
    const seamBlockerCell = seamRay?.cells.find((cellId) => cellId.split(":")[0] !== seamStep.from.split(":")[0]);
    const seamHead = seamStep
      ? { id: 900, dir: seamStep.fromDir, path: [seamStep.from] }
      : null;
    const seamBlocker = seamBlockerCell
      ? { id: 901, dir: "U", path: [seamBlockerCell] }
      : null;
    const foldRay = foldStep
      ? editor.getForwardRay(foldStep.from, foldStep.fromDir)
      : null;
    const foldTrace = foldStep
      ? editor.getSurfaceTrace(foldStep.from, foldStep.fromDir)
      : null;
    const foldHead = foldStep
      ? { id: 902, dir: foldStep.fromDir, path: [foldStep.from] }
      : null;
    const foldBlocker = foldStep
      ? { id: 903, dir: "U", path: [foldStep.to] }
      : null;
    const holeCells = new Map([
      ["A", { id: "A" }],
      ["C", { id: "C" }]
    ]);
    const holeGraph = new Map([
      ["C|R", {
        from: "C",
        fromDir: "R",
        to: "A",
        toDir: "L",
        continueDir: "R",
        relation: "coplanar"
      }]
    ]);
    const cycleCells = new Map([
      ["A", { id: "A" }],
      ["B", { id: "B" }]
    ]);
    const cycleGraph = new Map([
      ["A|R", {
        from: "A",
        fromDir: "R",
        to: "B",
        toDir: "L",
        continueDir: "L",
        relation: "edge_fold",
        seamKind: "block_seam",
        forwardAllowed: true
      }],
      ["B|L", {
        from: "B",
        fromDir: "L",
        to: "A",
        toDir: "R",
        continueDir: "R",
        relation: "edge_fold",
        seamKind: "block_seam",
        forwardAllowed: true
      }]
    ]);
    const holeRay = editor.getForwardRay("A", "R", holeGraph, holeCells);
    const cycleRay = editor.getForwardRay("A", "R", cycleGraph, cycleCells);
    return {
      seamStep,
      seamRay: seamRay && { cells: seamRay.cells, stopReason: seamRay.stopReason },
      seamBlockerCell,
      seamBlocked: seamHead && seamBlocker
        ? editor.canRemoveArrow(seamHead, [seamHead, seamBlocker])
        : null,
      seamClear: seamHead ? editor.canRemoveArrow(seamHead, [seamHead]) : null,
      foldStep,
      foldRay: foldRay && { cells: foldRay.cells, stopReason: foldRay.stopReason },
      foldTrace: foldTrace && { cells: foldTrace.cells, stopReason: foldTrace.stopReason },
      foldTreatsTargetAsBlocker: foldHead && foldBlocker
        ? editor.canRemoveArrow(foldHead, [foldHead, foldBlocker])
        : null,
      holeRay: { cells: holeRay.cells, stopReason: holeRay.stopReason },
      cycleRay: { cells: cycleRay.cells, stopReason: cycleRay.stopReason, cycle: cycleRay.cycle }
    };
  });
  const initialViewportStability = await viewportHeightStability(page);

  await click(page, "#btnGenerate");
  await page.waitForTimeout(1400);
  const generated = await exportPayload(page);
  const generatedStats = await page.evaluate(() => ({
    arrows: Number(document.querySelector("#statArrows").textContent),
    solveChip: document.querySelector("#solveChip").textContent,
    status: document.querySelector("#statusLine").textContent
  }));

  await click(page, "#btnSample");
  await page.waitForTimeout(500);
  const sample = await exportPayload(page);
  const sampleForwardPathRules = await page.evaluate(() => {
    const editor = window.compoundArrowEditor;
    const surface = editor.state.surface;
    const blockFoldStep = [...surface.graph.values()].find((step) => (
      step.relation === "edge_fold"
      && step.seamKind === "block_seam"
      && step.forwardAllowed
    ));
    const blockFoldRay = blockFoldStep
      ? editor.getForwardRay(blockFoldStep.from, blockFoldStep.fromDir)
      : null;
    const blockFoldHead = blockFoldStep
      ? { id: 904, dir: blockFoldStep.fromDir, path: [blockFoldStep.from] }
      : null;
    const blockFoldBlocker = blockFoldStep
      ? { id: 905, dir: "U", path: [blockFoldStep.to] }
      : null;
    return {
      blockFoldStep,
      blockFoldRay: blockFoldRay && { cells: blockFoldRay.cells, stopReason: blockFoldRay.stopReason },
      blockFoldBlocked: blockFoldHead && blockFoldBlocker
        ? editor.canRemoveArrow(blockFoldHead, [blockFoldHead, blockFoldBlocker])
        : null,
      blockFoldClear: blockFoldHead ? editor.canRemoveArrow(blockFoldHead, [blockFoldHead]) : null
    };
  });

  const sampleAPosition = sample.Blocks.find((block) => block.Id === "A").Position;
  await page.locator('[data-move-axis="0"][data-move-delta="1"]').click({ force: true });
  await page.waitForTimeout(350);
  const nudgeStatus = await page.locator("#statusLine").innerText();
  const nudged = await exportPayload(page);

  await page.locator('[data-rotate-axis="0"][data-rotate-delta="1"]').click({ force: true });
  await page.waitForTimeout(350);
  const rotateStatus = await page.locator("#statusLine").innerText();
  const rotated = await exportPayload(page);

  await click(page, "#btnSample");
  await page.waitForTimeout(450);
  const beforeMove = await exportPayload(page);
  await page.locator(".atlas-cell").first().click({ force: true });
  await page.locator(".block-row", { hasText: "Block B" }).click({ force: true });
  await click(page, "#btnMoveBlockToCell");
  await page.waitForTimeout(450);
  const moveStatus = await page.locator("#statusLine").innerText();
  const moved = await exportPayload(page);

  await click(page, "#btnResetCamera");
  await page.waitForTimeout(250);
  const resetStatus = await page.locator("#statusLine").innerText();

  await importPayload(page, longCompoundPayload());
  const longFrame = await page.evaluate(() => window.compoundArrowEditor.resetCameraView(false));
  await page.waitForTimeout(250);

  await click(page, "#btnSample");
  await page.waitForTimeout(450);
  await page.locator(".atlas-cell").first().click({ force: true });
  await page.fill("#inputSizeW", "1");
  await page.fill("#inputSizeH", "1");
  await page.fill("#inputSizeD", "1");
  await click(page, "#btnAttachBlock");
  await page.waitForTimeout(450);
  const attached = await exportPayload(page);

  const disconnected = baseBlockPayload();
  disconnected.Blocks.push({
    Id: "B",
    Size: [4, 4, 4],
    Position: [12, 0, 0],
    RotationDeg: [0, 0, 0]
  });
  await importPayload(page, disconnected);
  await click(page, "#btnGenerate");
  await page.waitForTimeout(250);
  const disconnectedStats = await page.evaluate(() => ({
    mapChip: document.querySelector("#mapChip").textContent,
    issueText: document.querySelector("#issueList").textContent,
    status: document.querySelector("#statusLine").textContent
  }));

  await importPayload(page, baseBlockPayload([
    {
      Dir: "L",
      Path: ["A:front:2_2", "A:front:1_2"]
    }
  ]));
  const directionMismatchStatus = await page.locator("#statusLine").innerText();

  await importPayload(page, baseBlockPayload([
    {
      Dir: "R",
      Path: [
        "A:front:2_1",
        "A:front:2_0",
        "A:left:2_3",
        "A:left:2_2",
        "A:left:2_1",
        "A:left:2_0",
        "A:back:2_3",
        "A:back:2_2",
        "A:back:2_1",
        "A:back:2_0",
        "A:right:2_3",
        "A:right:2_2",
        "A:right:2_1",
        "A:right:2_0"
      ]
    }
  ]));
  const selfFacingStatus = await page.locator("#statusLine").innerText();

  const after = await canvasStats(page);
  const finalStats = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    overflow: {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      offenders: [...document.querySelectorAll("body *")]
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            id: el.id,
            cls: String(el.className),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width)
          };
        })
        .filter((item) => item.right > document.documentElement.clientWidth + 2 || item.left < -2)
        .sort((a, b) => b.right - a.right)
        .slice(0, 8)
    }
  }));

  expect(messages.length === 0, `browser warnings/errors: ${messages.join(" | ")}`);
  expect(before.varied > 0 && after.varied > 0, `canvas did not render nonblank content in ${viewport.width}x${viewport.height}`);
  expect(initialStats.title === "3D 箭头组合体编辑器", `title mismatch: ${initialStats.title}`);
  expect(initial.Level === 1, "level should be exported");
  expect(initial.Blocks.length === 2, "default editor should start with 2 blocks");
  expect(!("SchemaVersion" in initial), "SchemaVersion should be omitted");
  expect(!("BoardType" in initial), "BoardType should be omitted");
  expect(!("GridUnit" in initial), "GridUnit should be omitted");
  expect(!("Snap" in initial), "Snap should be omitted");
  expect(!("SurfacePolicy" in initial), "SurfacePolicy should be omitted");
  expect(!("EditorConfig" in initial), "EditorConfig should be omitted");
  expect(!("MapValidation" in initial), "MapValidation should be omitted");
  expect(!("Color" in initial.Blocks[0]), "block color should be omitted");
  expect(!("Locked" in initial.Blocks[0]), "block locked should be omitted");
  expect(!("Visible" in initial.Blocks[0]), "block visible should be omitted");
  expect(!("RotationOrder" in initial.Blocks[0]), "block rotation order should be omitted");
  expect(initialStats.statBlocks === "2", "block stat mismatch");
  expect(initialStats.statSurface > 0, "surface stat should be positive");
  expect(initialStats.mapChip === "可生成", "default map chip should be valid");
  expect(initialStats.hasMoveButton, "move-to-surface button should exist");
  expect(initialStats.hasResetButton, "reset-camera button should exist");
  expect(initialStats.hasExactPanel, "exact coordinate panel should exist");
  expect(initialStats.exportedFns.includes("buildSurface"), "runtime hook should expose buildSurface");
  expect(initialStats.exportedFns.includes("moveSelectedBlockToCell"), "runtime hook should expose moveSelectedBlockToCell");
  expect(initialStats.exportedFns.includes("resetCameraView"), "runtime hook should expose resetCameraView");
  expect(initialStats.exportedFns.includes("getForwardRay"), "runtime hook should expose getForwardRay");
  expect(initialStats.exportedFns.includes("getSurfaceTrace"), "runtime hook should expose getSurfaceTrace");
  expect(forwardPathRules.seamStep, "default compound map should contain a coplanar Block seam");
  expect(forwardPathRules.seamStep.forwardAllowed === true, "coplanar Block seam should be marked forwardAllowed");
  expect(forwardPathRules.seamRay?.cells.includes(forwardPathRules.seamStep.to), "ForwardRay should continue across a coplanar Block seam");
  expect(forwardPathRules.seamBlocked === false, `coplanar seam blocker should prevent removal: ${JSON.stringify(forwardPathRules)}`);
  expect(forwardPathRules.seamClear === true, "clear coplanar ForwardRay should allow removal");
  expect(forwardPathRules.foldStep, "default compound map should contain a same-Block edge-fold connection");
  expect(forwardPathRules.foldStep.forwardAllowed === false, "same-Block edge-fold should not be marked forwardAllowed");
  expect(forwardPathRules.foldRay?.stopReason === "fold_boundary", `ForwardRay should stop before same-Block edge_fold: ${JSON.stringify(forwardPathRules)}`);
  expect(!forwardPathRules.foldRay?.cells.includes(forwardPathRules.foldStep.to), "same-Block edge-fold target should not be in ForwardRay");
  expect(forwardPathRules.foldTrace?.cells.includes(forwardPathRules.foldStep.to), "SurfaceTrace should still cross same-Block edge_fold");
  expect(forwardPathRules.foldTreatsTargetAsBlocker === true, "same-Block edge-fold target should not block current-face removal");
  expect(forwardPathRules.holeRay.cells.length === 0 && forwardPathRules.holeRay.stopReason === "boundary", "ForwardRay should stop at a missing-cell hole instead of jumping");
  expect(forwardPathRules.cycleRay.cycle === true && forwardPathRules.cycleRay.stopReason === "cycle", "ForwardRay should mark cycles as non-removable paths");
  expect(sampleForwardPathRules.blockFoldStep, "sample map should contain a cross-Block edge-fold seam");
  expect(sampleForwardPathRules.blockFoldStep.forwardAllowed === true, "cross-Block edge-fold seam should be marked forwardAllowed");
  expect(sampleForwardPathRules.blockFoldRay?.cells.includes(sampleForwardPathRules.blockFoldStep.to), "ForwardRay should cross a cross-Block edge-fold seam");
  expect(sampleForwardPathRules.blockFoldBlocked === false, `cross-Block fold seam blocker should prevent removal: ${JSON.stringify(sampleForwardPathRules)}`);
  expect(sampleForwardPathRules.blockFoldClear === true, "clear cross-Block fold ForwardRay should allow removal");
  expect(initialViewportStability.hostDelta <= 3 && initialViewportStability.canvasDelta <= 6, `3D viewport height should stay stable after load: ${JSON.stringify(initialViewportStability)}`);
  expect(generatedStats.arrows > 0, `generation did not place arrows: ${generatedStats.status}`);
  expect(generated.Arrows.length === generatedStats.arrows, "exported arrow count should match UI");
  expect(!("MapValidation" in generated), "generated export should not include validation snapshot");
  expect(generatedStats.solveChip === "有解", `generated puzzle should be solvable: ${generatedStats.solveChip}`);
  expect(sample.Blocks.length === 3, "sample should load 3 blocks");
  expect(sample.Level === 1, "sample level should reset to 1");
  expect(nudgeStatus.includes("已移动"), `nudge status mismatch: ${nudgeStatus}`);
  expect(nudged.Blocks.find((block) => block.Id === "A").Position[0] === sampleAPosition[0] + 1, "X+ nudge should move selected block by one cell");
  expect(rotateStatus.includes("已旋转"), `rotate status mismatch: ${rotateStatus}`);
  expect(rotated.Blocks.find((block) => block.Id === "A").RotationDeg[0] === 15, "X+ rotate should rotate selected block by snap angle");
  expect(moveStatus.includes("已将 Block B 移动到"), `move-to-surface status mismatch: ${moveStatus}`);
  expect(moved.Blocks.find((block) => block.Id === "B").Position.join(",") !== beforeMove.Blocks.find((block) => block.Id === "B").Position.join(","), "move-to-surface should change Block B position");
  expect(resetStatus === "视角已复位", `reset camera status mismatch: ${resetStatus}`);
  expect(longFrame?.pointCount > 0, "reset camera should return frame info for current shape");
  expect(Math.abs(longFrame.center[0] - 8) < 0.01, `long compound should be centered by full shape bounds: ${JSON.stringify(longFrame)}`);
  expect(longFrame.coverage.maxProjectedX < 0.92 && longFrame.coverage.maxProjectedY < 0.92, `long compound should fit in reset view: ${JSON.stringify(longFrame)}`);
  expect(attached.Blocks.length === 4, "attach action should add one block");
  expect(disconnectedStats.mapChip === "需修正", "disconnected map should be marked invalid");
  expect(disconnectedStats.issueText.includes("地图未连通"), `disconnected issue missing: ${disconnectedStats.issueText}`);
  expect(disconnectedStats.status.includes("地图结构存在问题"), `invalid generate status mismatch: ${disconnectedStats.status}`);
  expect(directionMismatchStatus.includes("箭头方向必须背向头部身体延展方向"), `direction mismatch check failed: ${directionMismatchStatus}`);
  expect(selfFacingStatus.includes("头部朝向不能正对自己的跨面身体"), `self-facing cross-face check failed: ${selfFacingStatus}`);
  expect(!initialStats.overflowX && !finalStats.overflowX, `horizontal overflow detected: ${JSON.stringify(finalStats.overflow)}`);

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.close();
  return {
    viewport,
    before,
    after,
    initial: {
      blocks: initial.Blocks.length,
      level: initial.Level
    },
    initialViewportStability,
    generated: {
      arrows: generatedStats.arrows,
      solve: generatedStats.solveChip
    },
    sampleBlocks: sample.Blocks.length,
    forwardPathRules,
    sampleForwardPathRules,
    nudgedA: nudged.Blocks.find((block) => block.Id === "A").Position,
    movedB: moved.Blocks.find((block) => block.Id === "B").Position,
    attachedBlocks: attached.Blocks.length,
    resetStatus,
    longFrame,
    disconnectedStats,
    directionMismatchStatus,
    selfFacingStatus
  };
}

const browser = await chromium.launch({
  headless: true,
  executablePath: chromePath
});

try {
  const desktop = await runViewport(browser, { width: 1440, height: 980 }, "/private/tmp/compound_arrow_editor_desktop.png");
  const mobile = await runViewport(browser, { width: 390, height: 844 }, "/private/tmp/compound_arrow_editor_mobile.png");
  console.log(JSON.stringify({ desktop, mobile }, null, 2));
} finally {
  await browser.close();
}
