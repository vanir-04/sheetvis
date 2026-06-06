import test from "node:test";
import assert from "node:assert/strict";
import {
  canFastEncodeVideo,
  createFramePlan,
  createVisualFrameGroups,
  fastEncodeCanvasSequence,
} from "../src/export/video.js";

test("createFramePlan creates fixed-rate timestamps and durations", () => {
  const frames = createFramePlan({ fps: 4, durationSeconds: 1 });

  assert.deepEqual(frames, [
    { index: 0, timeSeconds: 0, timestampUs: 0, durationUs: 250000 },
    { index: 1, timeSeconds: 0.25, timestampUs: 250000, durationUs: 250000 },
    { index: 2, timeSeconds: 0.5, timestampUs: 500000, durationUs: 250000 },
    { index: 3, timeSeconds: 0.75, timestampUs: 750000, durationUs: 250000 },
  ]);
});

test("createFramePlan includes a frame for short nonzero durations", () => {
  const frames = createFramePlan({ fps: 60, durationSeconds: 0.001 });

  assert.equal(frames.length, 1);
  assert.equal(frames[0].durationUs, 16667);
});

test("canFastEncodeVideo reports required browser APIs", () => {
  assert.equal(canFastEncodeVideo({
    VideoEncoder: function VideoEncoder() {},
    VideoFrame: function VideoFrame() {},
    Blob: function Blob() {},
  }), true);
  assert.equal(canFastEncodeVideo({
    VideoEncoder: function VideoEncoder() {},
    Blob: function Blob() {},
  }), false);
});

test("createVisualFrameGroups groups adjacent frames with identical visual keys", () => {
  const frames = createFramePlan({ fps: 4, durationSeconds: 1 });
  const groups = createVisualFrameGroups({
    frames,
    keyForTime: (timeSeconds) => (timeSeconds < 0.5 ? "a" : "b"),
  });

  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.key), ["a", "b"]);
  assert.deepEqual(groups.map((group) => group.frames.map((frame) => frame.index)), [[0, 1], [2, 3]]);
});

test("fastEncodeCanvasSequence fails cleanly when fast encoding is unsupported", async () => {
  await assert.rejects(
    () => fastEncodeCanvasSequence({
      canvas: {},
      fps: 30,
      durationSeconds: 1,
      renderFrame: () => {},
      env: {},
    }),
    /Fast export requires WebCodecs/,
  );
});

test("fastEncodeCanvasSequence renders planned frames and returns a WebM blob", async () => {
  const renderedTimes = [];
  const env = {
    Blob: class Blob {
      constructor(parts, options) {
        this.parts = parts;
        this.type = options.type;
        this.size = parts.reduce((sum, part) => sum + part.length, 0);
      }
    },
    VideoEncoder: class VideoEncoder {
      constructor({ output }) {
        this.output = output;
      }

      configure() {}

      encode(frame, options) {
        this.output({
          byteLength: 3,
          copyTo: (target) => target.set([1, 2, 3]),
          duration: frame.duration,
          timestamp: frame.timestamp,
          type: options.keyFrame ? "key" : "delta",
        });
      }

      flush() {
        return Promise.resolve();
      }

      close() {}
    },
    VideoFrame: class VideoFrame {
      constructor(_canvas, options) {
        this.duration = options.duration;
        this.timestamp = options.timestamp;
      }

      close() {}
    },
  };

  const blob = await fastEncodeCanvasSequence({
    canvas: { width: 320, height: 180 },
    durationSeconds: 0.5,
    env,
    fps: 2,
    renderFrame: (timeSeconds) => renderedTimes.push(timeSeconds),
  });

  assert.deepEqual(renderedTimes, [0]);
  assert.equal(blob.type, "video/webm");
  assert.ok(blob.size > 0);
});

test("fastEncodeCanvasSequence renders once per visual frame group", async () => {
  const renderedTimes = [];
  const env = {
    Blob: class Blob {
      constructor(parts, options) {
        this.parts = parts;
        this.type = options.type;
        this.size = parts.reduce((sum, part) => sum + part.length, 0);
      }
    },
    VideoEncoder: class VideoEncoder {
      constructor({ output }) {
        this.output = output;
      }

      configure() {}

      encode(frame) {
        this.output({
          byteLength: 1,
          copyTo: (target) => target.set([1]),
          duration: frame.duration,
          timestamp: frame.timestamp,
          type: "key",
        });
      }

      flush() {
        return Promise.resolve();
      }

      close() {}
    },
    VideoFrame: class VideoFrame {
      constructor(_canvas, options) {
        this.duration = options.duration;
        this.timestamp = options.timestamp;
      }

      close() {}
    },
  };
  const frames = createFramePlan({ fps: 4, durationSeconds: 1 });
  const frameGroups = createVisualFrameGroups({
    frames,
    keyForTime: (timeSeconds) => (timeSeconds < 0.5 ? "a" : "b"),
  });

  await fastEncodeCanvasSequence({
    canvas: { width: 320, height: 180 },
    durationSeconds: 1,
    env,
    fps: 4,
    frameGroups,
    renderFrame: (timeSeconds) => renderedTimes.push(timeSeconds),
  });

  assert.deepEqual(renderedTimes, [0, 0.5]);
});

test("fastEncodeCanvasSequence flushes periodically during long exports", async () => {
  let flushCount = 0;
  const stages = [];
  const env = {
    Blob: class Blob {
      constructor(parts, options) {
        this.parts = parts;
        this.type = options.type;
        this.size = parts.reduce((sum, part) => sum + part.length, 0);
      }
    },
    VideoEncoder: class VideoEncoder {
      constructor({ output }) {
        this.output = output;
      }

      configure() {}

      encode(frame) {
        this.output({
          byteLength: 1,
          copyTo: (target) => target.set([1]),
          duration: frame.duration,
          timestamp: frame.timestamp,
          type: "key",
        });
      }

      flush() {
        flushCount += 1;
        return Promise.resolve();
      }

      close() {}
    },
    VideoFrame: class VideoFrame {
      constructor(_canvas, options) {
        this.duration = options.duration;
        this.timestamp = options.timestamp;
      }

      close() {}
    },
  };

  await fastEncodeCanvasSequence({
    canvas: { width: 320, height: 180 },
    durationSeconds: 1,
    env,
    flushEveryFrames: 2,
    fps: 4,
    onProgress: ({ stage }) => stages.push(stage),
    renderFrame: () => {},
  });

  assert.equal(flushCount, 3);
  assert.ok(stages.includes("encoding"));
  assert.ok(stages.includes("finalizing"));
  assert.ok(stages.includes("muxing"));
  assert.ok(stages.includes("done"));
});
