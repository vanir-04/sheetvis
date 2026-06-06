const notes = [
  ["C", 4, 0, 2],
  ["E", 4, 2, 1],
  ["G", 4, 3, 0.5],
  ["A", 4, 3.5, 0.5],
  ["A", 4, 4, 0.5],
  ["G", 4, 4.5, 0.5],
  ["E", 4, 5, 1.5],
  ["D", 4, 6.5, 0.5],
  ["C", 4, 7, 1],
  ["E", 4, 8, 0.5],
  ["G", 4, 8.5, 0.5],
  ["B", 4, 9, 1],
  ["D", 5, 10, 1],
  ["C", 5, 11, 1],
  ["B", 4, 12, 1],
  ["G", 4, 13, 0.5],
  ["E", 4, 13.5, 0.5],
  ["C", 4, 14, 2],
];

export function createDemoScore() {
  const bpm = 96;
  const secondsPerBeat = 60 / bpm;
  const measures = [0, 1, 2, 3].map((index) => ({
    index,
    startBeat: index * 4,
    durationBeats: 4,
    timeSignature: { beats: 4, beatType: 4 },
    keySignature: { fifths: 0, mode: "major" },
    notes: [],
  }));

  const normalizedNotes = notes.map(([step, octave, onsetBeats, durationBeats], index) => ({
    id: `demo-note-${index + 1}`,
    pitch: { step, octave, alter: 0 },
    isRest: false,
    isChord: false,
    durationBeats,
    noteType: noteTypeFromDuration(durationBeats),
    dots: durationBeats === 1.5 ? 1 : 0,
    onsetBeats,
    onsetSeconds: onsetBeats * secondsPerBeat,
    durationSeconds: durationBeats * secondsPerBeat,
    voice: 1,
    staffNumber: 1,
    accidental: null,
    tied: false,
    beamGroup: durationBeats < 1 ? "demo-eighths" : null,
    stemDirection: "auto",
    lyric: null,
  }));

  for (const note of normalizedNotes) {
    const measure = measures.find((item) => (
      note.onsetBeats >= item.startBeat && note.onsetBeats < item.startBeat + item.durationBeats
    ));
    measure?.notes.push(note);
  }

  return {
    title: "Demo Reveal Study",
    composer: "SheetVis",
    parts: [
      {
        id: "P1",
        name: "Violin",
        isGrandStaff: false,
        staves: [
          {
            staffIndex: 1,
            clef: { sign: "G", line: 2 },
            measures,
          },
        ],
      },
    ],
    tempoMap: [{ beatOffset: 0, bpm }],
    totalBeats: 16,
    totalSeconds: 16 * secondsPerBeat,
  };
}

function noteTypeFromDuration(durationBeats) {
  if (durationBeats >= 4) {
    return "whole";
  }
  if (durationBeats >= 2) {
    return "half";
  }
  if (durationBeats <= 0.5) {
    return "eighth";
  }
  return "quarter";
}
