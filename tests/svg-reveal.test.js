import test from "node:test";
import assert from "node:assert/strict";
import { createConfig } from "../src/config/schema.js";
import {
  annotateBeamShapes,
  annotateAttachedNoteSymbols,
  annotateLedgerLines,
  annotateMarkingShapes,
  annotateTieShapes,
  applySvgRevealStyles,
  createHiddenNotationCss,
  prepareRevealSvg,
  revealStateKey,
} from "../src/engraving/reveal-svg.js";

test("createHiddenNotationCss hides note event glyphs while keeping staff structure visible", () => {
  const css = createHiddenNotationCss("#000000");

  assert.match(css, /\.note/);
  assert.match(css, /\.rest/);
  assert.match(css, /\.beam/);
  assert.match(css, /\.beamSpan/);
  assert.match(css, /\.stem/);
  assert.match(css, /\.tie/);
  assert.match(css, /\.gliss/);
  assert.match(css, /\.ledgerLines/);
  assert.match(css, /\.accid/);
  assert.match(css, /\.dynam/);
  assert.match(css, /\.hairpin/);
  assert.match(css, /\.tupletBracket > \*/);
  assert.match(css, /\.tupletNum > \*/);
  assert.match(css, /\.dots/);
  assert.match(css, /\.bTrem > use/);
  assert.match(css, /\.hairpin polyline \{ fill: none; /);
  assert.match(css, /\.tupletBracket polyline \{ fill: none; /);
  assert.match(css, /use, text \{ stroke: none; \}/);
  assert.match(css, /defs \*, symbol \* \{ stroke: none; \}/);
  assert.match(css, /g\.tempo \{ transform-box: fill-box; transform-origin: left center; transform: scale\(0\.72\); \}/);
  assert.doesNotMatch(css, /\.staff/);
  assert.match(css, /visibility: hidden/);
  assert.match(css, /#000000/);
});

test("applySvgRevealStyles reveals note ids up to current time using actual SVG elements", () => {
  const score = {
    totalBeats: 2,
    parts: [
      {
        staves: [
          {
            measures: [
              {
                notes: [
                  {
                    id: "demo-note-1",
                    isRest: false,
                    onsetSeconds: 0,
                    onsetBeats: 0,
                    beamGroup: "1:begin",
                  },
                  {
                    id: "demo-note-2",
                    isRest: false,
                    onsetSeconds: 1,
                    onsetBeats: 1,
                    beamGroup: "1:end",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const config = createConfig({
    parts: [{ id: "P1", baseColor: "#4fc3f7", colorMode: "solid" }],
  });
  const svg = `
    <svg>
      <style>.note { visibility: hidden; }</style>
      <g class="ledgerLines below"><path/></g>
      <g class="note" id="demo-note-1"><path/></g>
      <g id="beam-1" class="beam">
        <polygon/>
        <g class="note" id="demo-note-1b"><g class="accid"/></g>
      </g>
      <g class="note" id="demo-note-2"><path/></g>
    </svg>
  `;

  const styled = applySvgRevealStyles({
    svg,
    score,
    config,
    currentTimeSeconds: 0.1,
  });

  assert.match(styled, /#demo-note-1/);
  assert.match(styled, /#demo-note-1 use, #demo-note-1 text \{ stroke: none; \}/);
  assert.match(styled, /\[data-sheetvis-beam-for="demo-note-1"\]/);
  assert.doesNotMatch(styled, /\.beam:has\(#demo-note-1\)/);
  assert.match(styled, /\.ledgerLines \{ visibility: visible !important; \}/);
  assert.match(styled, /\.ledgerLines path\[data-sheetvis-ledger-for="demo-note-1"\]/);
  assert.match(styled, /visibility: visible !important/);
  assert.match(styled, /data-sheetvis-ledger-for="demo-note-1"[^>]+style="visibility: visible; fill: #4fc3f7; stroke: #4fc3f7;"/);
  assert.match(styled, /visibility: visible/);
  assert.match(styled, /#4fc3f7/);
  assert.doesNotMatch(styled, /#demo-note-2 \{/);
});

test("prepareRevealSvg annotates event geometry once for frame reuse", () => {
  const svg = `
    <svg>
      <g class="ledgerLines below"><path d="M90 100 L120 100" /></g>
      <g id="beam-1" class="beam"><polygon points="90,1 120,1 120,10 90,10" /></g>
      <g id="note-a" class="note"><g class="notehead"><use transform="translate(100, 100)" /></g></g>
    </svg>
  `;

  const prepared = prepareRevealSvg(svg);
  const preparedAgain = prepareRevealSvg(prepared);

  assert.match(prepared, /data-sheetvis-ledger-for="note-a"/);
  assert.match(prepared, /data-sheetvis-beam-for="note-a"/);
  assert.equal(preparedAgain, prepared);
});

test("applySvgRevealStyles can reuse a prepared SVG", () => {
  const score = {
    totalBeats: 1,
    parts: [
      {
        staves: [
          {
            measures: [
              {
                notes: [
                  { id: "note-a", isRest: false, onsetSeconds: 0, onsetBeats: 0, beamGroup: "1:begin" },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const prepared = prepareRevealSvg(`
    <svg>
      <g class="ledgerLines below"><path d="M90 100 L120 100" /></g>
      <g id="beam-1" class="beam"><polygon points="90,1 120,1 120,10 90,10" /></g>
      <g id="note-a" class="note"><g class="notehead"><use transform="translate(100, 100)" /></g></g>
    </svg>
  `);

  const styled = applySvgRevealStyles({
    svg: prepared,
    score,
    config: createConfig(),
    currentTimeSeconds: 0,
  });

  assert.match(styled, /data-sheetvis-prepared="true"/);
  assert.match(styled, /data-sheetvis-ledger-for="note-a"/);
  assert.match(styled, /data-sheetvis-beam-for="note-a"/);
  assert.match(styled, /#note-a \{ visibility: visible/);
});

test("applySvgRevealStyles reveals standalone stems with their notes", () => {
  const score = {
    totalBeats: 1,
    parts: [
      {
        staves: [
          {
            measures: [
              {
                notes: [
                  { id: "note-a", isRest: false, onsetSeconds: 0, onsetBeats: 0 },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const svg = `
    <svg>
      <g id="stem-a" class="stem"><path d="M100 20 L100 100" /></g>
      <g id="note-a" class="note"><g class="notehead"><use transform="translate(100, 100)" /></g></g>
    </svg>
  `;

  const styled = applySvgRevealStyles({
    svg,
    score,
    config: createConfig(),
    currentTimeSeconds: 0,
  });

  assert.match(styled, /<g data-sheetvis-stem-for="note-a" id="stem-a" class="stem"/);
  assert.match(styled, /\[data-sheetvis-stem-for="note-a"\] \{ visibility: visible/);
});

test("applySvgRevealStyles reveals markings with the owning part color", () => {
  const score = {
    totalBeats: 1,
    parts: [
      {
        staves: [
          {
            measures: [
              {
                notes: [
                  { id: "note-a", isRest: false, onsetSeconds: 0, onsetBeats: 0 },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const config = createConfig({
    parts: [{ id: "P1", baseColor: "#2255ff", colorMode: "solid" }],
  });
  const svg = `
    <svg>
      <g id="dynamic-a" class="dynam"><use transform="translate(100, 140)" /></g>
      <g id="word-a" class="dir pizzicato"><text x="110" y="80">pizz.</text></g>
      <g id="chord-a" class="harm"><text x="110" y="60">A-7/D</text></g>
      <g id="hairpin-a" class="hairpin"><polyline points="90,160 130,150" /></g>
      <g id="note-a" class="note"><g class="notehead"><use transform="translate(100, 100)" /></g></g>
    </svg>
  `;

  const styled = applySvgRevealStyles({
    svg,
    score,
    config,
    currentTimeSeconds: 0,
  });

  assert.match(styled, /<g data-sheetvis-marking-for="note-a" id="dynamic-a" class="dynam"/);
  assert.doesNotMatch(styled, /<g data-sheetvis-marking-for="note-a" id="word-a" class="dir pizzicato"/);
  assert.doesNotMatch(styled, /<g data-sheetvis-marking-for="note-a" id="chord-a" class="harm"/);
  assert.match(styled, /<g data-sheetvis-marking-for="note-a" id="hairpin-a" class="hairpin"/);
  assert.match(styled, /\[data-sheetvis-marking-for="note-a"\] \{ visibility: visible; fill: #2255ff; stroke: #2255ff; \}/);
  assert.match(styled, /\[data-sheetvis-marking-for="note-a"\]\.hairpin polyline/);
});

test("applySvgRevealStyles leaves markings printed when sync markings is disabled", () => {
  const score = {
    totalBeats: 1,
    parts: [
      {
        staves: [
          {
            measures: [
              {
                notes: [
                  { id: "note-a", isRest: false, onsetSeconds: 1, onsetBeats: 1 },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const svg = `
    <svg>
      <g id="dynamic-a" class="dynam"><use transform="translate(100, 140)" /></g>
      <g id="note-a" class="note"><g class="notehead"><use transform="translate(100, 100)" /></g></g>
    </svg>
  `;

  const styled = applySvgRevealStyles({
    svg,
    score,
    config: createConfig({ reveal: { syncMarkings: false } }),
    currentTimeSeconds: 0,
  });

  assert.doesNotMatch(styled, /\.dynam, \.hairpin \{ visibility: hidden/);
  assert.doesNotMatch(styled, /\[data-sheetvis-marking-for="note-a"\] \{ visibility: visible/);
});

test("revealStateKey changes only when visible notation changes", () => {
  const score = {
    parts: [
      {
        staves: [
          {
            measures: [
              {
                notes: [
                  { id: "note-a", isRest: false, onsetSeconds: 1, onsetBeats: 0 },
                  { id: "rest-a", isRest: true, onsetSeconds: 2, onsetBeats: 1 },
                  { id: "note-b", isRest: false, onsetSeconds: 3, onsetBeats: 2 },
                  { id: "tie-stop", isRest: false, onsetSeconds: 4, revealOnsetSeconds: 1, onsetBeats: 3 },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  assert.equal(revealStateKey(score, -Number.EPSILON), "idle");
  assert.equal(revealStateKey(score, 1.1), revealStateKey(score, 2.5));
  assert.notEqual(revealStateKey(score, 2.5), revealStateKey(score, 3.1));
  assert.match(revealStateKey(score, 1.1), /note-a/);
  assert.match(revealStateKey(score, 1.1), /tie-stop/);
  assert.doesNotMatch(revealStateKey(score, 2.5), /rest-a/);
  assert.notEqual(
    revealStateKey(score, 1.1, { animateRests: true }),
    revealStateKey(score, 2.5, { animateRests: true }),
  );
  assert.match(revealStateKey(score, 2.5, { animateRests: true }), /rest-a/);
});

test("applySvgRevealStyles reveals rests only when rest animation is enabled", () => {
  const score = {
    totalBeats: 1,
    parts: [
      {
        staves: [
          {
            measures: [
              {
                notes: [
                  { id: "rest-a", isRest: true, onsetSeconds: 0, onsetBeats: 0 },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const svg = '<svg><g id="rest-a" class="rest"><use xlink:href="#rest" /></g></svg>';

  const hidden = applySvgRevealStyles({
    svg,
    score,
    config: createConfig(),
    currentTimeSeconds: 0,
  });
  const revealed = applySvgRevealStyles({
    svg,
    score,
    config: createConfig({ reveal: { animateRests: true } }),
    currentTimeSeconds: 0,
  });

  assert.doesNotMatch(hidden, /#rest-a \{ visibility: visible/);
  assert.match(revealed, /#rest-a \{ visibility: visible/);
});

test("annotateBeamShapes labels each beam shape with the nearest note in the beam", () => {
  const svg = `
    <svg>
      <g id="beam-1" class="beam">
        <polygon points="90,1 110,1 110,8 90,8" />
        <polygon points="290,3 310,3 310,10 290,10" />
        <path d="M285 300 L315 300" />
        <g id="note-a" class="note"><g class="notehead"><use transform="translate(100, 100)" /></g></g>
        <g id="note-b" class="note"><g class="notehead"><use transform="translate(300, 300)" /></g></g>
      </g>
    </svg>
  `;

  const annotated = annotateBeamShapes(svg);

  assert.match(annotated, /<polygon data-sheetvis-beam-for="note-a" points="90 1 110 1 110 8 90 8"/);
  assert.match(annotated, /<polygon data-sheetvis-beam-for="note-b" points="290 3 310 3 310 10 290 10"/);
  assert.match(annotated, /<path data-sheetvis-beam-for="note-b" d="M285 300 L315 300"/);
  assert.doesNotMatch(annotated, /<g id="note-b" class="note" data-sheetvis-beam-for/);
});

test("annotateBeamShapes expands already segmented beam polygons to prevent seams", () => {
  const svg = `
    <svg>
      <g id="beam-1" class="beam">
        <polygon points="90,1 200,1 200,10 90,10" />
        <polygon points="200,1 310,1 310,10 200,10" />
        <g id="note-a" class="note"><g class="notehead"><use transform="translate(100, 100)" /></g></g>
        <g id="note-b" class="note"><g class="notehead"><use transform="translate(300, 100)" /></g></g>
      </g>
    </svg>
  `;

  const annotated = annotateBeamShapes(svg);

  assert.match(annotated, /<polygon data-sheetvis-beam-for="note-a" points="90 1 208 1 208 10 90 10" \/>/);
  assert.match(annotated, /<polygon data-sheetvis-beam-for="note-b" points="192 1 310 1 310 10 192 10" \/>/);
});

test("annotateBeamShapes preserves sloped beam edges when expanding segmented polygons", () => {
  const svg = `
    <svg>
      <g id="beam-1" class="beam">
        <polygon points="90,20 200,10 200,18 90,28" />
        <polygon points="200,10 310,1 310,9 200,18" />
        <g id="note-a" class="note"><g class="notehead"><use transform="translate(100, 100)" /></g></g>
        <g id="note-b" class="note"><g class="notehead"><use transform="translate(300, 100)" /></g></g>
      </g>
    </svg>
  `;

  const annotated = annotateBeamShapes(svg);

  assert.match(annotated, /<polygon data-sheetvis-beam-for="note-a" points="90 20 208 9\.273 208 17\.273 90 28" \/>/);
  assert.match(annotated, /<polygon data-sheetvis-beam-for="note-b" points="192 10\.655 310 1 310 9 192 18\.655" \/>/);
});

test("applySvgRevealStyles reveals only beam shapes assigned to revealed notes", () => {
  const score = {
    totalBeats: 2,
    parts: [
      {
        staves: [
          {
            measures: [
              {
                notes: [
                  { id: "note-a", isRest: false, onsetSeconds: 0, onsetBeats: 0, beamGroup: "1:begin" },
                  { id: "note-b", isRest: false, onsetSeconds: 1, onsetBeats: 1, beamGroup: "1:end" },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const svg = `
    <svg>
      <g id="beam-1" class="beam">
        <polygon points="90,1 110,1 110,8 90,8" />
        <polygon points="290,3 310,3 310,10 290,10" />
        <g id="note-a" class="note"><g class="notehead"><use transform="translate(100, 100)" /></g></g>
        <g id="note-b" class="note"><g class="notehead"><use transform="translate(300, 300)" /></g></g>
      </g>
    </svg>
  `;

  const styled = applySvgRevealStyles({
    svg,
    score,
    config: createConfig(),
    currentTimeSeconds: 0.25,
  });

  assert.match(styled, /\[data-sheetvis-beam-for="note-a"\] \{ visibility: visible/);
  assert.doesNotMatch(styled, /\[data-sheetvis-beam-for="note-b"\] \{ visibility: visible/);
});

test("applySvgRevealStyles reveals tie shapes with tied notes", () => {
  const score = {
    totalBeats: 4,
    parts: [
      {
        staves: [
          {
            measures: [
              {
                notes: [
                  { id: "tie-start", isRest: false, onsetSeconds: 0, onsetBeats: 0 },
                  { id: "tie-stop", isRest: false, onsetSeconds: 2, revealOnsetSeconds: 0, onsetBeats: 2 },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const svg = `
    <svg>
      <g id="tie-start" class="note"><g class="notehead"><use transform="translate(100, 100)" /></g></g>
      <g id="tie-stop" class="note"><g class="notehead"><use transform="translate(300, 100)" /></g></g>
      <g id="tie-1" class="tie"><path d="M90,120 C140,140 260,140 310,120" /></g>
    </svg>
  `;

  const styled = applySvgRevealStyles({
    svg,
    score,
    config: createConfig(),
    currentTimeSeconds: 0.25,
  });

  assert.match(styled, /#tie-stop \{ visibility: visible/);
  assert.match(styled, /\[data-sheetvis-tie-for="tie-stop"\] \{ visibility: visible/);
});

test("applySvgRevealStyles reveals glissando and slide lines with the starting note", () => {
  const score = {
    totalBeats: 3,
    parts: [
      {
        staves: [
          {
            measures: [
              {
                notes: [
                  { id: "note-a", isRest: false, onsetSeconds: 0, onsetBeats: 0 },
                  { id: "note-b", isRest: false, onsetSeconds: 2, onsetBeats: 2 },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const svg = `
    <svg id="score-root">
      <g id="note-a" class="note"><g class="notehead"><use transform="translate(100, 100)" /></g></g>
      <g id="note-b" class="note"><g class="notehead"><use transform="translate(400, 200)" /></g></g>
      <g id="slide-a" class="gliss slide"><path d="M110 110 L390 190" stroke-width="27" /></g>
    </svg>
  `;

  const before = applySvgRevealStyles({
    svg,
    score,
    config: createConfig(),
    currentTimeSeconds: -0.1,
  });
  const after = applySvgRevealStyles({
    svg,
    score,
    config: createConfig(),
    currentTimeSeconds: 0,
  });

  assert.match(before, /\.gliss, \.slide, \.tupletBracket > \*/);
  assert.doesNotMatch(before, /\[data-sheetvis-gliss-for="note-a"\] \{ visibility: visible/);
  assert.match(after, /<g data-sheetvis-gliss-for="note-a" id="slide-a" class="gliss slide"/);
  assert.match(after, /\[data-sheetvis-gliss-for="note-a"\], #score-root \[data-sheetvis-gliss-for="note-a"\] \{ visibility: visible !important/);
});

test("annotateTieShapes labels ties with the starting note when the stop note is off page", () => {
  const svg = `
    <svg>
      <g id="tie-start" class="note"><g class="notehead"><use transform="translate(100, 100)" /></g></g>
      <g id="later-note" class="note"><g class="notehead"><use transform="translate(1000, 100)" /></g></g>
      <g id="tie-1" class="tie"><path d="M90,120 C300,140 800,140 1010,120" /></g>
    </svg>
  `;

  const annotated = annotateTieShapes(svg);

  assert.match(annotated, /data-sheetvis-tie-for="tie-start"/);
  assert.doesNotMatch(annotated, /data-sheetvis-tie-for="later-note"/);
});

test("annotateMarkingShapes labels dynamic text and hairpin groups with nearest notes", () => {
  const svg = `
    <svg>
      <g id="note-a" class="note"><g class="notehead"><use transform="translate(100, 100)" /></g></g>
      <g id="note-b" class="note"><g class="notehead"><use transform="translate(500, 500)" /></g></g>
      <g id="dynamic-a" class="dynam"><use transform="translate(110, 170)" /></g>
      <g id="word-b" class="dir"><text x="490" y="420">rit.</text></g>
      <g id="chord-b" class="harm"><text x="500" y="390">F-9/A</text></g>
      <g id="hairpin-b" class="hairpin"><polyline points="480,560 520,550" /></g>
    </svg>
  `;

  const annotated = annotateMarkingShapes(svg);

  assert.match(annotated, /<g data-sheetvis-marking-for="note-a" id="dynamic-a" class="dynam"/);
  assert.doesNotMatch(annotated, /<g data-sheetvis-marking-for="note-b" id="word-b" class="dir"/);
  assert.doesNotMatch(annotated, /<g data-sheetvis-marking-for="note-b" id="chord-b" class="harm"/);
  assert.match(annotated, /<g data-sheetvis-marking-for="note-b" id="hairpin-b" class="hairpin"/);
});

test("annotateBeamShapes includes up-stem notes whose noteheads sit before the beam polygon", () => {
  const svg = `
    <svg>
      <g id="beam-1" class="beam">
        <polygon points="300,100 700,100 700,190 300,190" />
        <g id="note-a" class="note"><g class="notehead"><use transform="translate(100, 300)" /></g></g>
        <g id="note-b" class="note"><g class="notehead"><use transform="translate(500, 300)" /></g></g>
      </g>
    </svg>
  `;

  const annotated = annotateBeamShapes(svg);

  assert.match(annotated, /data-sheetvis-beam-for="note-a"/);
  assert.match(annotated, /data-sheetvis-beam-for="note-b"/);
});

test("annotateBeamShapes ignores distant same-x notes from other staves while splitting beams", () => {
  const svg = `
    <svg>
      <g id="beam-1" class="beam">
        <polygon points="300,100 700,100 700,190 300,190" />
        <g id="note-a" class="note"><g class="notehead"><use transform="translate(100, 650)" /></g></g>
        <g id="note-b" class="note"><g class="notehead"><use transform="translate(500, 650)" /></g></g>
        <g id="distant-a" class="note"><g class="notehead"><use transform="translate(500, 3600)" /></g></g>
      </g>
    </svg>
  `;

  const annotated = annotateBeamShapes(svg);

  assert.match(annotated, /data-sheetvis-beam-for="note-a"/);
  assert.match(annotated, /data-sheetvis-beam-for="note-b"/);
  assert.doesNotMatch(annotated, /data-sheetvis-beam-for="distant-a"/);
});

test("annotateBeamShapes ignores nearby lower-system notes while splitting beams", () => {
  const svg = `
    <svg>
      <g id="beam-1" class="beam">
        <polygon points="300,100 900,100 900,190 300,190" />
        <g id="note-a" class="note"><g class="notehead"><use transform="translate(320, 650)" /></g></g>
        <g id="note-b" class="note"><g class="notehead"><use transform="translate(600, 650)" /></g></g>
        <g id="note-c" class="note"><g class="notehead"><use transform="translate(880, 650)" /></g></g>
        <g id="lower-a" class="note"><g class="notehead"><use transform="translate(320, 1500)" /></g></g>
        <g id="lower-b" class="note"><g class="notehead"><use transform="translate(600, 1500)" /></g></g>
      </g>
    </svg>
  `;

  const annotated = annotateBeamShapes(svg);

  assert.match(annotated, /data-sheetvis-beam-for="note-a"/);
  assert.match(annotated, /data-sheetvis-beam-for="note-b"/);
  assert.match(annotated, /data-sheetvis-beam-for="note-c"/);
  assert.doesNotMatch(annotated, /data-sheetvis-beam-for="lower-a"/);
  assert.doesNotMatch(annotated, /data-sheetvis-beam-for="lower-b"/);
});

test("annotateBeamShapes splits long beam polygons into note segments", () => {
  const svg = `
    <svg>
      <g id="beam-1" class="beam">
        <polygon points="90,1 310,1 310,10 90,10" />
        <g id="note-a" class="note"><g class="notehead"><use transform="translate(100, 100)" /></g></g>
        <g id="note-b" class="note"><g class="notehead"><use transform="translate(300, 100)" /></g></g>
      </g>
    </svg>
  `;

  const annotated = annotateBeamShapes(svg);

  assert.doesNotMatch(annotated, /<polygon data-sheetvis-beam-for="note-a" points="90,1 310,1 310,10 90,10"/);
  assert.match(annotated, /<polygon data-sheetvis-beam-for="note-a" points="90 1 236 1 236 10 90 10" \/>/);
  assert.match(annotated, /<polygon data-sheetvis-beam-for="note-b" points="164 1 310 1 310 10 164 10" \/>/);
});

test("annotateBeamShapes hides and labels cross-staff beamSpan geometry", () => {
  const svg = `
    <svg>
      <g id="note-a" class="note"><g class="notehead"><use transform="translate(100, 100)" /></g></g>
      <g id="note-b" class="note"><g class="notehead"><use transform="translate(300, 300)" /></g></g>
      <g id="cross-staff" class="beamSpan">
        <polygon points="90,1 310,1 310,10 90,10" />
      </g>
    </svg>
  `;

  const annotated = annotateBeamShapes(svg);

  assert.match(annotated, /<polygon data-sheetvis-beam-for="note-a" points="90 1 236 1 236 10 90 10" \/>/);
  assert.match(annotated, /<polygon data-sheetvis-beam-for="note-b" points="164 1 310 1 310 10 164 10" \/>/);
});

test("annotateBeamShapes labels tuplet brackets with the first tuplet note", () => {
  const svg = `
    <svg>
      <g id="tuplet-1" class="tuplet">
        <g id="tuplet-bracket" class="tupletBracket">
          <path d="M90 90 L110 90" />
        </g>
        <g id="tuplet-number" class="tupletNum"><text>3</text></g>
        <g id="note-a" class="note"><g class="notehead"><use transform="translate(100, 100)" /></g></g>
        <g id="note-b" class="note"><g class="notehead"><use transform="translate(200, 100)" /></g></g>
      </g>
    </svg>
  `;

  const annotated = annotateBeamShapes(svg);

  assert.doesNotMatch(annotated, /<g[^>]*data-sheetvis-beam-for="note-a"[^>]*class="tupletBracket"/);
  assert.match(annotated, /<path data-sheetvis-beam-for="note-a" d="M90 90 L110 90"/);
  assert.doesNotMatch(annotated, /<g[^>]*data-sheetvis-beam-for="note-a"[^>]*class="tupletNum"/);
  assert.match(annotated, /<text data-sheetvis-beam-for="note-a">3<\/text>/);
  assert.doesNotMatch(annotated, /data-sheetvis-beam-for="note-b"/);
});

test("annotateBeamShapes labels both halves of a Verovio tuplet bracket with the first tuplet event", () => {
  const svg = `
    <svg>
      <g id="tuplet-1" class="tuplet">
        <g id="tuplet-number" class="tupletNum"><use transform="translate(500, 10)" /></g>
        <g id="tuplet-bracket" class="tupletBracket">
          <polyline points="90,90 90,130 450,130" />
          <polyline points="900,90 900,130 550,130" />
        </g>
        <g id="note-a" class="note"><g class="notehead"><use transform="translate(100, 300)" /></g></g>
        <g id="note-b" class="note"><g class="notehead"><use transform="translate(500, 300)" /></g></g>
        <g id="note-c" class="note"><g class="notehead"><use transform="translate(900, 300)" /></g></g>
      </g>
    </svg>
  `;

  const annotated = annotateBeamShapes(svg);

  assert.match(annotated, /<polyline data-sheetvis-beam-for="note-a" points="90,90 90,130 450,130"/);
  assert.match(annotated, /<polyline data-sheetvis-beam-for="note-a" points="900,90 900,130 550,130"/);
  assert.match(annotated, /<use data-sheetvis-beam-for="note-a" transform="translate\(500, 10\)"/);
  assert.doesNotMatch(annotated, /data-sheetvis-beam-for="note-b"/);
  assert.doesNotMatch(annotated, /data-sheetvis-beam-for="note-c"/);
});

test("annotateBeamShapes lightly nudges close below-beam tuplet numbers", () => {
  const svg = `
    <svg>
      <g id="beam-1" class="beam">
        <polygon points="100,300 500,260 500,170 100,210" />
        <g id="tuplet-1" class="tuplet">
          <g id="tuplet-number" class="tupletNum">
            <use transform="translate(250, 520) scale(0.72, 0.72)" />
          </g>
          <g id="note-a" class="note"><g class="notehead"><use transform="translate(100, 100)" /></g></g>
          <g id="note-b" class="note"><g class="notehead"><use transform="translate(500, 100)" /></g></g>
        </g>
      </g>
    </svg>
  `;

  const annotated = annotateBeamShapes(svg);

  assert.match(annotated, /transform="translate\(250, 595\) scale\(0\.72, 0\.72\)"/);
});

test("applySvgRevealStyles reveals tuplet number child glyphs with the owning beamed note", () => {
  const score = {
    totalBeats: 1,
    parts: [
      {
        staves: [
          {
            measures: [
              {
                notes: [
                  { id: "note-a", isRest: false, onsetSeconds: 0, onsetBeats: 0, beamGroup: "1:begin" },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const svg = `
    <svg>
      <g id="tuplet-1" class="tuplet">
        <g id="tuplet-number" class="tupletNum"><use transform="translate(100, 10)" /></g>
        <g id="note-a" class="note"><path/></g>
      </g>
    </svg>
  `;

  const styled = applySvgRevealStyles({
    svg,
    score,
    config: createConfig(),
    currentTimeSeconds: 0,
  });

  assert.match(styled, /\[data-sheetvis-beam-for="note-a"\] \* \{ visibility: visible !important; fill: #000000; stroke: #000000; \}/);
  assert.match(styled, /\[data-sheetvis-beam-for="note-a"\] use, \[data-sheetvis-beam-for="note-a"\] text \{ stroke: none; \}/);
  assert.match(styled, /\[data-sheetvis-beam-for="note-a"\]\.tupletBracket polyline/);
});

test("applySvgRevealStyles reveals tuplet number glyphs even when parser beam metadata is absent", () => {
  const score = {
    totalBeats: 1,
    parts: [
      {
        staves: [
          {
            measures: [
              {
                notes: [
                  { id: "note-a", isRest: false, onsetSeconds: 0, onsetBeats: 0 },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const svg = `
    <svg>
      <g id="tuplet-1" class="tuplet">
        <g id="tuplet-number" class="tupletNum"><use transform="translate(100, -1200)" /></g>
        <g id="note-a" class="note"><g class="notehead"><use transform="translate(100, 100)" /></g></g>
      </g>
    </svg>
  `;

  const styled = applySvgRevealStyles({
    svg,
    score,
    config: createConfig(),
    currentTimeSeconds: 0,
  });

  assert.match(styled, /\[data-sheetvis-beam-for="note-a"\] \{ visibility: visible/);
  assert.match(styled, /\[data-sheetvis-beam-for="note-a"\] use, \[data-sheetvis-beam-for="note-a"\] text \{ stroke: none; \}/);
});

test("applySvgRevealStyles reveals tuplet numbers over Verovio scoped hidden css", () => {
  const score = {
    totalBeats: 1,
    parts: [
      {
        staves: [
          {
            measures: [
              {
                notes: [
                  { id: "note-a", isRest: false, onsetSeconds: 0, onsetBeats: 0 },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const svg = `
    <svg id="score-root">
      <style>#score-root .tupletNum > * { visibility: hidden; }</style>
      <g id="tuplet-1" class="tuplet">
        <g id="tuplet-number" class="tupletNum"><use transform="translate(100, -1200)" /></g>
        <g id="note-a" class="note"><g class="notehead"><use transform="translate(100, 100)" /></g></g>
      </g>
    </svg>
  `;

  const styled = applySvgRevealStyles({
    svg,
    score,
    config: createConfig(),
    currentTimeSeconds: 0,
  });

  assert.match(styled, /\[data-sheetvis-beam-for="note-a"\] \{ visibility: visible !important/);
  assert.match(styled, /#score-root \[data-sheetvis-beam-for="note-a"\] \{ visibility: visible !important/);
});

test("annotateBeamShapes keeps distant tuplet number glyphs attached to the first tuplet note", () => {
  const svg = `
    <svg>
      <g id="tuplet-1" class="tuplet">
        <g id="tuplet-number" class="tupletNum"><use transform="translate(100, -1200)" /></g>
        <g id="note-a" class="note"><g class="notehead"><use transform="translate(100, 100)" /></g></g>
        <g id="note-b" class="note"><g class="notehead"><use transform="translate(200, 100)" /></g></g>
      </g>
    </svg>
  `;

  const annotated = annotateBeamShapes(svg);

  assert.match(annotated, /<use data-sheetvis-beam-for="note-a" transform="translate\(100, -1200\)"/);
});

test("annotateBeamShapes assigns same-x lower-system geometry by vertical position", () => {
  const svg = `
    <svg>
      <g id="upper-note" class="note"><g class="notehead"><use transform="translate(100, 100)" /></g></g>
      <g id="lower-beam" class="beam">
        <polygon points="90,2100 110,2100 110,2110 90,2110" />
        <path d="M90 2120 L110 2120" />
        <g id="lower-note" class="note"><g class="notehead"><use transform="translate(100, 2500)" /></g></g>
      </g>
    </svg>
  `;

  const annotated = annotateBeamShapes(svg);

  assert.match(annotated, /data-sheetvis-beam-for="lower-note"/);
  assert.doesNotMatch(annotated, /data-sheetvis-beam-for="upper-note"/);
});

test("annotateAttachedNoteSymbols labels dots and buzz-roll glyphs with nearby notes", () => {
  const svg = `
    <svg>
      <g id="note-a" class="note"><g class="notehead"><use transform="translate(100, 100)" /></g></g>
      <g id="dot-a" class="dots"><ellipse cx="130" cy="100" rx="6" ry="6" /></g>
      <g id="trem-a" class="bTrem">
        <use xlink:href="#buzz" transform="translate(100, 40)" />
        <g id="chord-a" class="chord">
          <g id="note-b" class="note"><g class="notehead"><use transform="translate(100, 120)" /></g></g>
        </g>
      </g>
    </svg>
  `;

  const annotated = annotateAttachedNoteSymbols(svg);

  assert.match(annotated, /<g data-sheetvis-symbol-for="note-a" id="dot-a" class="dots"/);
  assert.match(annotated, /<use data-sheetvis-symbol-for="note-a" xlink:href="#buzz"/);
  assert.doesNotMatch(annotated, /<g data-sheetvis-symbol-for="note-a" id="trem-a" class="bTrem"/);
});

test("applySvgRevealStyles reveals attached dot and buzz-roll glyphs with notes", () => {
  const score = {
    totalBeats: 1,
    parts: [
      {
        staves: [
          {
            measures: [
              {
                notes: [
                  { id: "note-a", isRest: false, onsetSeconds: 0, onsetBeats: 0 },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const svg = `
    <svg>
      <g id="note-a" class="note"><g class="notehead"><use transform="translate(100, 100)" /></g></g>
      <g id="dot-a" class="dots"><ellipse cx="130" cy="100" rx="6" ry="6" /></g>
      <g id="trem-a" class="bTrem"><use xlink:href="#buzz" transform="translate(100, 40)" /></g>
    </svg>
  `;

  const styled = applySvgRevealStyles({
    svg,
    score,
    config: createConfig(),
    currentTimeSeconds: 0,
  });

  assert.match(styled, /\[data-sheetvis-symbol-for="note-a"\] \{ visibility: visible/);
  assert.match(styled, /\[data-sheetvis-symbol-for="note-a"\] use, \[data-sheetvis-symbol-for="note-a"\] text, \[data-sheetvis-symbol-for="note-a"\] ellipse \{ stroke: none; \}/);
});

test("applySvgRevealStyles injects final hidden css before any notes reveal", () => {
  const score = {
    totalBeats: 2,
    parts: [
      {
        staves: [
          {
            measures: [
              {
                notes: [
                  {
                    id: "future-note",
                    isRest: false,
                    onsetSeconds: 1,
                    onsetBeats: 1,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const config = createConfig();
  const svg = '<svg><g id="future-note" class="note"><path/></g></svg>';

  const styled = applySvgRevealStyles({
    svg,
    score,
    config,
    currentTimeSeconds: 0,
  });

  assert.match(styled, /data-sheetvis-hidden="true"/);
  assert.match(styled, /\.note, \.rest, \.beam, \.beamSpan, \.stem, \.tie, \.gliss, \.slide, \.tupletBracket > \*, \.tupletNum > \*, \.dots, \.bTrem > use, \.fTrem > use, \.ledgerLines path, \.accid, \.dynam, \.hairpin \{ visibility: hidden/);
  assert.doesNotMatch(styled, /#future-note \{ visibility: visible/);
});

test("annotateLedgerLines labels ledger groups with the note that follows", () => {
  const svg = `
    <svg>
      <g class="ledgerLines below"><path d="M90 100 L120 100" /></g>
      <g id="note-1" class="note"><path/></g>
      <g class="ledgerLines above"><path d="M190 100 L220 100" /></g>
      <g class="note" id="note-2"><path/></g>
      <g class="ledgerLines below"><path d="M290 100 L320 100" stroke-width="22" /></g>
      <g id="layer-1" class="layer">
        <g id="note-3" class="note"><path/></g>
      </g>
    </svg>
  `;

  const annotated = annotateLedgerLines(svg);

  assert.match(annotated, /<path data-sheetvis-ledger-for="note-1" d="M90 100 L120 100"/);
  assert.match(annotated, /<path data-sheetvis-ledger-for="note-2" d="M190 100 L220 100"/);
  assert.match(annotated, /<path data-sheetvis-ledger-for="note-3" d="M290 100 L320 100"/);
});

test("annotateLedgerLines assigns each path in a shared ledger group by nearest note x", () => {
  const svg = `
    <svg>
      <g class="ledgerLines below">
        <path d="M90 100 L120 100" />
        <path d="M290 100 L320 100" />
      </g>
      <g id="layer-1" class="layer">
        <g id="note-a" class="note"><g class="notehead"><use transform="translate(100, 100)" /></g></g>
        <g id="note-b" class="note"><g class="notehead"><use transform="translate(300, 100)" /></g></g>
      </g>
    </svg>
  `;

  const annotated = annotateLedgerLines(svg);

  assert.match(annotated, /<path data-sheetvis-ledger-for="note-a" d="M90 100 L120 100"/);
  assert.match(annotated, /<path data-sheetvis-ledger-for="note-b" d="M290 100 L320 100"/);
});

test("annotateLedgerLines leaves vertically distant ledger paths hidden", () => {
  const svg = `
    <svg>
      <g class="ledgerLines below">
        <path d="M90 100 L120 100" />
        <path d="M90 900 L120 900" />
      </g>
      <g id="note-a" class="note"><g class="notehead"><use transform="translate(100, 100)" /></g></g>
    </svg>
  `;

  const annotated = annotateLedgerLines(svg);

  assert.match(annotated, /<path data-sheetvis-ledger-for="note-a" d="M90 100 L120 100"/);
  assert.doesNotMatch(annotated, /<path data-sheetvis-ledger-for="note-a" d="M90 900 L120 900"/);
});
