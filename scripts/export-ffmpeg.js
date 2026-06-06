#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { createConfig } from "../src/config/schema.js";
import { applySvgRevealStyles, prepareRevealSvg } from "../src/engraving/reveal-svg.js";
import {
  createPagedEngravingWithVerovio,
  createScoreEventTimeline,
  pageForEventTimeline,
} from "../src/engraving/verovio.js";
import { createFfmpegArgs, frameFilename, normalizeExportFormat } from "../src/export/ffmpeg.js";
import { createFramePlan } from "../src/export/video.js";
import { ensureMusicXmlNoteIds, parseMusicXml } from "../src/parser/musicxml.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input || !args.output) {
    printUsage();
    process.exitCode = args.help ? 0 : 1;
    return;
  }

  const inputPath = path.resolve(rootDir, args.input);
  const outputPath = path.resolve(rootDir, args.output);
  const fps = positiveInteger(args.fps, 60);
  const ffmpegPath = args.ffmpeg || await defaultFfmpegPath();
  const config = await loadConfig(args.config);
  const musicXml = ensureMusicXmlNoteIds(await fs.readFile(inputPath, "utf8"));
  const score = parseMusicXml(musicXml);
  const timeline = createScoreEventTimeline(score);
  const engraving = await createPagedEngravingWithVerovio(musicXml, config);
  const frameDir = path.resolve(rootDir, args.framesDir || path.join(
    "export",
    "frames",
    `${path.basename(outputPath, path.extname(outputPath))}-${Date.now()}`,
  ));
  const shouldCleanFrames = !args.keepFrames && !args.framesDir;
  const framePattern = path.join(frameDir, "frame-%06d.png");
  const format = normalizeExportFormat(outputPath, args.format);

  await fs.mkdir(frameDir, { recursive: true });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const frames = createFramePlan({ fps, durationSeconds: score.totalSeconds });
  const preparedPages = new Map();
  console.log(`Rendering ${frames.length} SVG frames at ${fps} fps...`);

  for (const frame of frames) {
    const pageNumber = pageForEventTimeline({
      events: timeline,
      timeSeconds: frame.timeSeconds,
      getPageForElement: (id) => engraving.getPageForElement(id),
      currentPage: 1,
    });
    const preparedSvg = preparedPages.get(pageNumber) || prepareRevealSvg(engraving.renderPage(pageNumber), score);
    preparedPages.set(pageNumber, preparedSvg);
    const revealedSvg = applySvgRevealStyles({
      svg: preparedSvg,
      score,
      config,
      currentTimeSeconds: frame.timeSeconds,
    });
    await fs.writeFile(
      path.join(frameDir, frameFilename(frame.index)),
      renderPngFrame(prepareFrameSvg(revealedSvg, config)),
    );
    if ((frame.index + 1) % fps === 0 || frame.index === frames.length - 1) {
      console.log(`Rendered ${frame.index + 1} / ${frames.length}`);
    }
  }

  const command = createFfmpegArgs({
    ffmpegPath,
    fps,
    framePattern,
    outputPath,
    format,
  });
  console.log(`Encoding ${outputPath} with ${ffmpegPath}...`);
  await runCommand(command);
  console.log(`Export ready: ${outputPath}`);
  if (shouldCleanFrames) {
    await fs.rm(frameDir, { recursive: true, force: true });
  } else {
    console.log(`Frames kept: ${frameDir}`);
  }
}

async function loadConfig(configPath) {
  if (!configPath) {
    return createConfig();
  }

  const raw = await fs.readFile(path.resolve(rootDir, configPath), "utf8");
  return createConfig(JSON.parse(raw));
}

async function defaultFfmpegPath() {
  const localPath = path.resolve(rootDir, "tools", "ffmpeg", "bin", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  try {
    await fs.access(localPath);
    return localPath;
  } catch {
    return "ffmpeg";
  }
}

function prepareFrameSvg(svg, config) {
  const sizedSvg = svg.replace("<svg", `<svg width="${config.canvas.width}" height="${config.canvas.height}"`);
  return sizedSvg.replace(
    /(<svg\b[^>]*>)/,
    `$1<rect width="100%" height="100%" fill="${escapeAttribute(config.canvas.background)}"/>`,
  );
}

function renderPngFrame(svg) {
  return new Resvg(svg, {
    fitTo: {
      mode: "original",
    },
  }).render().asPng();
}

function runCommand(command) {
  return new Promise((resolve, reject) => {
    const [exe, ...args] = command;
    const child = spawn(exe, args, { stdio: "inherit" });
    child.on("error", (error) => {
      if (error.code === "ENOENT") {
        reject(new Error("ffmpeg was not found. Install ffmpeg or pass --ffmpeg <path>."));
        return;
      }
      reject(error);
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exited with code ${code}. If your build cannot read SVG frames, use --keep-frames and convert the frames to PNG first.`));
    });
  });
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (arg === "--keep-frames") {
      args.keepFrames = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    args[key] = argv[index + 1];
    index += 1;
  }
  return args;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function escapeAttribute(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function printUsage() {
  console.log(`Usage:
  npm run export:ffmpeg -- --input samples/score.musicxml --output export/demo.mp4

Options:
  --fps <number>          Frames per second, default 60
  --format <mp4|webm>     Output format, inferred from output extension by default
  --config <file>         Optional JSON config overrides
  --frames-dir <dir>      Optional frame output directory
  --ffmpeg <path>         Optional ffmpeg executable path
  --keep-frames           Keep generated SVG frames after encoding
`);
}
