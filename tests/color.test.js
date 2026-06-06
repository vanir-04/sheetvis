import test from "node:test";
import assert from "node:assert/strict";
import { resolveNoteColor } from "../src/renderer/color.js";

test("resolveNoteColor returns solid base color", () => {
  const color = resolveNoteColor({
    note: { onsetBeats: 4 },
    partConfig: { colorMode: "solid", baseColor: "#4fc3f7" },
    totalBeats: 16,
  });

  assert.equal(color, "#4fc3f7");
});

test("resolveNoteColor interpolates progression colors", () => {
  const color = resolveNoteColor({
    note: { onsetBeats: 8 },
    partConfig: {
      colorMode: "progression",
      progressionColorStart: "#000000",
      progressionColorEnd: "#ffffff",
    },
    totalBeats: 16,
  });

  assert.equal(color, "#808080");
});
