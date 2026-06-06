import test from "node:test";
import assert from "node:assert/strict";
import { createConfig } from "../src/config/schema.js";
import { createDemoScore } from "../src/demo/score.js";
import { layoutScore } from "../src/renderer/layout.js";

test("layoutScore maps note beats to ordered x positions", () => {
  const config = createConfig();
  const score = createDemoScore();
  const layout = layoutScore(score, config);
  const notes = layout.parts[0].notes;

  assert.equal(layout.musicStartX > layout.left, true);
  assert.equal(notes[0].x, layout.musicStartX);
  assert.equal(notes.length > 4, true);
  assert.equal(notes[0].x < notes.at(-1).x, true);
  assert.equal(notes.every((note) => Number.isFinite(note.y)), true);
  assert.equal(layout.measures.length, score.parts[0].staves[0].measures.length);
});

test("demo score contains mixed note durations for engraving checks", () => {
  const score = createDemoScore();
  const durations = score.parts[0].staves[0].measures
    .flatMap((measure) => measure.notes)
    .map((note) => note.durationBeats);

  assert.equal(durations.includes(0.5), true);
  assert.equal(durations.includes(1), true);
  assert.equal(durations.includes(2), true);
});
