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
    let varied = 0;
    let alpha = 0;
    for (let i = 0; i < data.length; i += 64) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a > 0) alpha += 1;
      if (a > 0 && !(r > 238 && g > 240 && b > 234)) varied += 1;
    }
    return { width: canvas.width, height: canvas.height, alpha, varied };
  });
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
  await page.click("#btnGenerate");
  await page.waitForTimeout(1200);
  const after = await canvasStats(page);
  await page.click("#btnSample");
  await page.waitForTimeout(700);
  const cuboidStats = await page.evaluate(() => ({
    boardType: JSON.parse(document.querySelector("#jsonBox").value).BoardType,
    boxSize: JSON.parse(document.querySelector("#jsonBox").value).BoxSize,
    free: document.querySelector("#statFree").textContent,
    chip: document.querySelector("#boxSizeChip").textContent,
    readout: document.querySelector("#boxDimsReadout").textContent,
    status: document.querySelector("#statusLine").textContent
  }));
  await page.evaluate(() => {
    const bad = {
      SchemaVersion: 3,
      BoardType: "cuboid",
      BoxSize: { width: 6, height: 6, depth: 6 },
      Arrows: [
        { Id: 0, Dir: "L", Path: ["front:3_2", "front:2_2", "front:1_2"], Color: "#178f83" }
      ]
    };
    document.querySelector("#jsonBox").value = JSON.stringify(bad);
  });
  await page.click("#btnImport");
  await page.waitForTimeout(250);
  const directionMismatchStatus = await page.locator("#statusLine").innerText();
  await page.evaluate(() => {
    const bad = {
      SchemaVersion: 3,
      BoardType: "cuboid",
      BoxSize: { width: 6, height: 6, depth: 6 },
      Arrows: [
        {
          Id: 0,
          Dir: "R",
          Path: [
            "front:1_5",
            "front:1_4",
            "front:1_3",
            "front:2_3",
            "front:2_4",
            "front:2_5",
            "right:2_0",
            "right:1_0"
          ],
          Color: "#178f83"
        }
      ]
    };
    document.querySelector("#jsonBox").value = JSON.stringify(bad);
  });
  await page.click("#btnImport");
  await page.waitForTimeout(250);
  const selfFacingStatus = await page.locator("#statusLine").innerText();
  const stats = await page.evaluate(() => ({
    title: document.querySelector("h1").textContent,
    arrows: document.querySelector("#statArrows").textContent,
    cells: document.querySelector("#statCells").textContent,
    ready: document.querySelector("#statReady").textContent,
    status: document.querySelector("#statusLine").textContent,
    solve: document.querySelector("#solveChip").textContent,
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
            cls: el.className,
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
  expect(after.varied > 0, `canvas did not render nonblank content in ${viewport.width}x${viewport.height}`);
  expect(cuboidStats.boardType === "cuboid", "sample board type should be cuboid");
  expect(cuboidStats.boxSize?.width === 7 && cuboidStats.boxSize?.height === 5 && cuboidStats.boxSize?.depth === 4, "sample box size mismatch");
  expect(cuboidStats.chip.includes("7 × 5 × 4"), "box size chip mismatch");
  expect(cuboidStats.readout.includes("front/back 5×7"), "box dims readout mismatch");
  expect(directionMismatchStatus.includes("箭头方向必须背向头部身体延展方向"), `direction mismatch check failed: ${directionMismatchStatus}`);
  expect(selfFacingStatus.includes("头部朝向不能正对自己的跨面身体"), `self-facing cross-face check failed: ${selfFacingStatus}`);
  expect(stats.title === "箭头 3D 长方体编辑器", `title mismatch: ${stats.title}`);
  expect(!stats.overflowX, `horizontal overflow detected: ${JSON.stringify(stats.overflow)}`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.close();
  return { viewport, before, after, cuboidStats, directionMismatchStatus, selfFacingStatus, stats, messages };
}

const browser = await chromium.launch({
  headless: true,
  executablePath: chromePath
});

try {
  const desktop = await runViewport(browser, { width: 1440, height: 980 }, "/private/tmp/arrow_cube_editor_desktop.png");
  const mobile = await runViewport(browser, { width: 390, height: 844 }, "/private/tmp/arrow_cube_editor_mobile.png");
  console.log(JSON.stringify({ desktop, mobile }, null, 2));
} finally {
  await browser.close();
}
