export function resolveNoteColor({ note, partConfig, totalBeats }) {
  if (partConfig.colorMode === "progression") {
    const start = partConfig.progressionColorStart ?? partConfig.baseColor;
    const end = partConfig.progressionColorEnd ?? partConfig.baseColor;
    const progress = totalBeats > 0 ? note.onsetBeats / totalBeats : 0;
    return interpolateHex(start, end, progress);
  }

  return partConfig.baseColor;
}

export function interpolateHex(startHex, endHex, amount) {
  const start = parseHex(startHex);
  const end = parseHex(endHex);
  const t = Math.min(1, Math.max(0, amount));
  return `#${[0, 1, 2].map((index) => {
    const channel = Math.round(start[index] + (end[index] - start[index]) * t);
    return channel.toString(16).padStart(2, "0");
  }).join("")}`;
}

function parseHex(hex) {
  const clean = hex.replace("#", "");
  return [0, 2, 4].map((index) => parseInt(clean.slice(index, index + 2), 16));
}
