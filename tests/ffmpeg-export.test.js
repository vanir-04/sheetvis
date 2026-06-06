import test from "node:test";
import assert from "node:assert/strict";
import {
  createFfmpegArgs,
  ffmpegFormats,
  frameFilename,
  normalizeExportFormat,
} from "../src/export/ffmpeg.js";

test("normalizeExportFormat chooses mp4 unless webm is requested", () => {
  assert.equal(normalizeExportFormat("demo.mp4"), ffmpegFormats.mp4);
  assert.equal(normalizeExportFormat("demo.webm"), ffmpegFormats.webm);
  assert.equal(normalizeExportFormat("demo.mov", "webm"), ffmpegFormats.webm);
});

test("createFfmpegArgs creates mp4 encoder arguments", () => {
  assert.deepEqual(createFfmpegArgs({
    ffmpegPath: "ffmpeg",
    fps: 30,
    framePattern: "frames/frame-%06d.svg",
    outputPath: "out.mp4",
  }), [
    "ffmpeg",
    "-y",
    "-framerate",
    "30",
    "-i",
    "frames/frame-%06d.svg",
    "-c:v",
    "libx264",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "out.mp4",
  ]);
});

test("createFfmpegArgs creates webm encoder arguments", () => {
  assert.deepEqual(createFfmpegArgs({
    fps: 60,
    framePattern: "frames/frame-%06d.svg",
    outputPath: "out.webm",
  }), [
    "ffmpeg",
    "-y",
    "-framerate",
    "60",
    "-i",
    "frames/frame-%06d.svg",
    "-c:v",
    "libvpx-vp9",
    "-crf",
    "32",
    "-b:v",
    "0",
    "out.webm",
  ]);
});

test("frameFilename creates ffmpeg image sequence names", () => {
  assert.equal(frameFilename(0), "frame-000001.png");
  assert.equal(frameFilename(42), "frame-000043.png");
  assert.equal(frameFilename(42, "svg"), "frame-000043.svg");
});
