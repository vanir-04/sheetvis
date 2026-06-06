import test from "node:test";
import assert from "node:assert/strict";
import { PlaybackClock } from "../src/playback/clock.js";

test("PlaybackClock supports play pause seek and speed", () => {
  const clock = new PlaybackClock({ durationSeconds: 10, now: () => 1000 });

  clock.play();
  clock.update(2000);
  assert.equal(clock.currentTimeSeconds, 1);

  clock.setSpeed(2);
  clock.update(3000);
  assert.equal(clock.currentTimeSeconds, 3);

  clock.pause();
  clock.update(5000);
  assert.equal(clock.currentTimeSeconds, 3);

  clock.seek(9);
  clock.play(6000);
  clock.update(7000);
  assert.equal(clock.currentTimeSeconds, 10);
  assert.equal(clock.state, "idle");
});
