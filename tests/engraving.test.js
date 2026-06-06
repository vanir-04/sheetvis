import test from "node:test";
import assert from "node:assert/strict";
import { createConfig } from "../src/config/schema.js";
import {
  applyMeasurePageBreaks,
  createPagedEngraving,
  createScoreEventTimeline,
  createVerovioOptions,
  pageForEventTimeline,
  pageForTime,
} from "../src/engraving/verovio.js";

test("createVerovioOptions configures MusicXML SVG engraving", () => {
  const config = createConfig({
    canvas: { width: 1920, height: 1080 },
    score: { staffSpacing: 14 },
  });
  const options = createVerovioOptions(config);

  assert.equal(options.inputFrom, "xml");
  assert.equal(options.svgViewBox, true);
  assert.equal(options.adjustPageHeight, true);
  assert.equal(options.breaks, "auto");
  assert.equal(options.font, "Leland");
  assert.equal(options.fontFallback, "Bravura");
  assert.equal(options.pageWidth, 1920);
  assert.equal(options.pageHeight, 1080);
  assert.equal(options.unit, 10.5);
  assert.match(options.svgCss, /\.note/);
  assert.match(options.svgCss, /visibility: hidden/);
});

test("createVerovioOptions uses encoded breaks when measures per page is set", () => {
  const options = createVerovioOptions(createConfig({
    score: { measuresPerPage: 2 },
  }));

  assert.equal(options.breaks, "encoded");
});

test("applyMeasurePageBreaks inserts page breaks in the first part only", () => {
  const xml = `
    <score-partwise>
      <part id="P1">
        <measure number="1"><note id="p1n1"/></measure>
        <measure number="2"><note id="p1n2"/></measure>
        <measure number="3"><note id="p1n3"/></measure>
      </part>
      <part id="P2">
        <measure number="1"><note id="p2n1"/></measure>
        <measure number="2"><note id="p2n2"/></measure>
        <measure number="3"><note id="p2n3"/></measure>
      </part>
    </score-partwise>
  `;

  const prepared = applyMeasurePageBreaks(xml, createConfig({
    score: { measuresPerPage: 2 },
  }));

  assert.match(prepared, /<measure number="3"><print new-page="yes"\/><note id="p1n3"/);
  assert.doesNotMatch(prepared, /<measure number="3"><print new-page="yes"\/><note id="p2n3"/);
});

test("applyMeasurePageBreaks leaves MusicXML unchanged in auto mode", () => {
  const xml = "<score-partwise><part><measure><note/></measure></part></score-partwise>";

  assert.equal(applyMeasurePageBreaks(xml, createConfig()), xml);
});

test("createPagedEngraving loads data and renders requested pages", () => {
  const calls = [];
  const toolkit = {
    setOptions(options) {
      calls.push(["setOptions", options.breaks]);
    },
    loadData(data) {
      calls.push(["loadData", data]);
      return true;
    },
    getPageCount() {
      return 3;
    },
    renderToSVG(page) {
      return `<svg data-page="${page}"></svg>`;
    },
    getPageWithElement(id) {
      return id === "n2" ? 2 : 1;
    },
  };

  const engraving = createPagedEngraving({
    toolkit,
    musicXml: "<score-partwise/>",
    config: createConfig(),
  });

  assert.deepEqual(calls, [["setOptions", "auto"], ["loadData", "<score-partwise/>"]]);
  assert.equal(engraving.pageCount, 3);
  assert.equal(engraving.renderPage(2), '<svg data-page="2"></svg>');
  assert.equal(engraving.getPageForElement("n2"), 2);
});

test("pageForTime chooses the page for the latest score event", () => {
  const score = {
    parts: [
      {
        staves: [
          {
            measures: [
              {
                notes: [
                  { id: "n1", isRest: false, onsetSeconds: 0 },
                  { id: "n2", isRest: false, onsetSeconds: 4 },
                  { id: "r1", isRest: true, onsetSeconds: 8 },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  assert.equal(pageForTime({ score, timeSeconds: -1, getPageForElement: () => 9, currentPage: 1 }), 1);
  assert.equal(pageForTime({ score, timeSeconds: 1, getPageForElement: () => 1, currentPage: 1 }), 1);
  assert.equal(pageForTime({ score, timeSeconds: 4.5, getPageForElement: (id) => (id === "n2" ? 2 : 1), currentPage: 1 }), 2);
});

test("pageForTime turns at rest beats instead of waiting for the next note", () => {
  const score = {
    parts: [
      {
        staves: [
          {
            measures: [
              {
                notes: [
                  { id: "n1", isRest: false, onsetSeconds: 0 },
                  { id: "r1", isRest: true, onsetSeconds: 4 },
                  { id: "n2", isRest: false, onsetSeconds: 8 },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const page = pageForTime({
    score,
    timeSeconds: 4.25,
    getPageForElement: (id) => (id === "r1" || id === "n2" ? 2 : 1),
    currentPage: 1,
  });

  assert.equal(page, 2);
});

test("pageForEventTimeline uses a precomputed timeline for page lookup", () => {
  const score = {
    parts: [
      {
        staves: [
          {
            measures: [
              {
                notes: [
                  { id: "late", onsetSeconds: 5 },
                  { id: "early", onsetSeconds: 1 },
                  { id: "middle", onsetSeconds: 3 },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const events = createScoreEventTimeline(score);

  assert.deepEqual(events.map((event) => event.id), ["early", "middle", "late"]);
  assert.equal(pageForEventTimeline({
    events,
    timeSeconds: 3.5,
    getPageForElement: (id) => (id === "middle" ? 2 : 1),
    currentPage: 1,
  }), 2);
});
