export class PlaybackClock {
  constructor({ durationSeconds, now = () => performance.now() } = {}) {
    this.durationSeconds = durationSeconds ?? 0;
    this.now = now;
    this.state = "idle";
    this.speed = 1;
    this.currentTimeSeconds = 0;
    this.lastTimestampMs = null;
  }

  play(timestampMs = this.now()) {
    if (this.currentTimeSeconds >= this.durationSeconds) {
      this.currentTimeSeconds = 0;
    }
    this.state = "playing";
    this.lastTimestampMs = timestampMs;
  }

  pause() {
    if (this.state === "playing") {
      this.state = "paused";
    }
    this.lastTimestampMs = null;
  }

  seek(seconds) {
    this.currentTimeSeconds = clamp(seconds, 0, this.durationSeconds);
    this.lastTimestampMs = this.state === "playing" ? this.now() : null;
    if (this.currentTimeSeconds < this.durationSeconds && this.state === "idle") {
      this.state = "paused";
    }
  }

  setSpeed(speed) {
    this.speed = clamp(Number(speed) || 1, 0.25, 2);
  }

  update(timestampMs = this.now()) {
    if (this.state !== "playing") {
      return this.currentTimeSeconds;
    }

    if (this.lastTimestampMs === null) {
      this.lastTimestampMs = timestampMs;
      return this.currentTimeSeconds;
    }

    const deltaSeconds = ((timestampMs - this.lastTimestampMs) / 1000) * this.speed;
    this.lastTimestampMs = timestampMs;
    this.currentTimeSeconds = clamp(
      this.currentTimeSeconds + deltaSeconds,
      0,
      this.durationSeconds,
    );

    if (this.currentTimeSeconds >= this.durationSeconds) {
      this.state = "idle";
      this.lastTimestampMs = null;
    }

    return this.currentTimeSeconds;
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
