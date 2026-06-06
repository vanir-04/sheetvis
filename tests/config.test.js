import test from "node:test";
import assert from "node:assert/strict";
import { createConfig } from "../src/config/schema.js";

test("createConfig merges nested overrides while keeping defaults", () => {
  const config = createConfig({
    canvas: { width: 1280 },
    parts: [{ id: "P1", baseColor: "#ff3366" }],
  });

  assert.equal(config.canvas.width, 1280);
  assert.equal(config.canvas.height, 720);
  assert.equal(config.canvas.background, "#ffffff");
  assert.equal(config.score.staffColor, "#000000");
  assert.equal(config.score.measuresPerPage, 0);
  assert.equal(config.reveal.syncMarkings, true);
  assert.equal(config.reveal.animateRests, false);
  assert.equal(config.parts[0].id, "P1");
  assert.equal(config.parts[0].label, "Violin");
  assert.equal(config.parts[0].baseColor, "#ff3366");
});
