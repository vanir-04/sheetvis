const pitchSteps = {
  C: 0,
  D: 1,
  E: 2,
  F: 3,
  G: 4,
  A: 5,
  B: 6,
};

export function layoutScore(score, config) {
  const left = config.score.systemMarginLeft;
  const right = config.canvas.width - config.score.systemMarginRight;
  const musicStartX = left + config.score.notationLeftPadding;
  const usableWidth = right - musicStartX;
  const beatWidth = usableWidth / score.totalBeats;

  const measures = score.parts[0].staves[0].measures.map((measure) => ({
    index: measure.index,
    x: musicStartX + measure.startBeat * beatWidth,
    width: measure.durationBeats * beatWidth,
  }));

  const parts = score.parts.map((part, partIndex) => {
    const partConfig = config.parts[partIndex] ?? config.parts[0];
    const staffY = partConfig.staffY;
    const notes = part.staves.flatMap((staff) => (
      staff.measures.flatMap((measure) => (
        measure.notes.map((note) => ({
          ...note,
          x: musicStartX + note.onsetBeats * beatWidth,
          y: pitchToY(note.pitch, staffY, config.score.staffSpacing),
          staffY,
          partId: part.id,
          measureIndex: measure.index,
        }))
      ))
    ));

    return {
      id: part.id,
      name: part.name,
      staffY,
      notes,
    };
  });

  return {
    left,
    musicStartX,
    right,
    beatWidth,
    measures,
    parts,
  };
}

function pitchToY(pitch, staffY, staffSpacing) {
  if (!pitch) {
    return staffY;
  }

  const diatonic = pitch.octave * 7 + pitchSteps[pitch.step];
  const reference = 4 * 7 + pitchSteps.E;
  const stepOffset = diatonic - reference;
  return staffY + staffSpacing * 4 - stepOffset * (staffSpacing / 2);
}
