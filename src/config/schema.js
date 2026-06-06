export const defaultConfig = {
  canvas: {
    width: 1280,
    height: 720,
    fps: 60,
    background: "#ffffff",
  },
  score: {
    staffColor: "#000000",
    staffLineWidth: 1.5,
    staffSpacing: 12,
    systemMarginLeft: 96,
    systemMarginRight: 64,
    systemMarginTop: 120,
    notationLeftPadding: 150,
    measureSpacing: "auto",
    measuresPerPage: 0,
  },
  parts: [
    {
      id: "P1",
      label: "Violin",
      staffY: 250,
      baseColor: "#000000",
      colorMode: "solid",
      progressionColorStart: "#000000",
      progressionColorEnd: "#555555",
      revealAnimation: "fade-in",
      revealDurationMs: 100,
      partAnimation: "none",
    },
  ],
  playback: {
    speedMultiplier: 1,
    startAtBeat: 0,
  },
  reveal: {
    syncMarkings: true,
    animateRests: false,
  },
};

export function createConfig(overrides = {}) {
  return {
    canvas: { ...defaultConfig.canvas, ...overrides.canvas },
    score: { ...defaultConfig.score, ...overrides.score },
    parts: mergeParts(overrides.parts),
    playback: { ...defaultConfig.playback, ...overrides.playback },
    reveal: { ...defaultConfig.reveal, ...overrides.reveal },
  };
}

function mergeParts(parts) {
  if (!Array.isArray(parts) || parts.length === 0) {
    return defaultConfig.parts.map((part) => ({ ...part }));
  }

  return parts.map((part, index) => ({
    ...(defaultConfig.parts[index] ?? defaultConfig.parts[0]),
    ...part,
  }));
}
