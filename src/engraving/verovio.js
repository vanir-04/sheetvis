import createVerovioModule from "verovio/wasm";
import { VerovioToolkit } from "verovio/esm";
import { createHiddenNotationCss } from "./reveal-svg.js";

let toolkitPromise;

export function createVerovioOptions(config) {
  const measuresPerPage = normalizedMeasuresPerPage(config);
  return {
    inputFrom: "xml",
    svgViewBox: true,
    adjustPageHeight: true,
    pageWidth: config.canvas.width,
    pageHeight: config.canvas.height,
    pageMarginTop: 28,
    pageMarginBottom: 28,
    pageMarginLeft: 24,
    pageMarginRight: 24,
    breaks: measuresPerPage > 0 ? "encoded" : "auto",
    font: "Leland",
    fontFallback: "Bravura",
    fontLoadAll: true,
    footer: "none",
    header: "none",
    scale: 55,
    unit: Math.max(4.5, Math.min(12, config.score.staffSpacing * 0.75)),
    svgCss: createHiddenNotationCss(config.score.staffColor),
  };
}

export async function renderMusicXmlWithVerovio(musicXml, config) {
  const toolkit = await getVerovioToolkit();
  return createPagedEngraving({ toolkit, musicXml, config }).renderPage(1);
}

export async function createPagedEngravingWithVerovio(musicXml, config) {
  const toolkit = await getVerovioToolkit();
  return createPagedEngraving({ toolkit, musicXml, config });
}

export function createPagedEngraving({ toolkit, musicXml, config }) {
  toolkit.setOptions(createVerovioOptions(config));
  toolkit.loadData(applyMeasurePageBreaks(musicXml, config));

  return {
    pageCount: toolkit.getPageCount(),
    renderPage(pageNumber) {
      return toolkit.renderToSVG(pageNumber);
    },
    getPageForElement(elementId) {
      return toolkit.getPageWithElement(elementId);
    },
  };
}

export function applyMeasurePageBreaks(musicXml, config) {
  const measuresPerPage = normalizedMeasuresPerPage(config);
  if (measuresPerPage <= 0) {
    return musicXml;
  }

  let partIndex = 0;
  return musicXml.replace(/<part\b[^>]*>[\s\S]*?<\/part>/g, (part) => {
    partIndex += 1;
    if (partIndex !== 1) {
      return part;
    }

    let measureIndex = 0;
    return part.replace(/<measure\b([^>]*)>/g, (match, attributes) => {
      const shouldBreak = measureIndex > 0 && measureIndex % measuresPerPage === 0;
      measureIndex += 1;
      if (!shouldBreak) {
        return match;
      }
      return `<measure${attributes}><print new-page="yes"/>`;
    });
  });
}

function normalizedMeasuresPerPage(config) {
  const value = Number(config?.score?.measuresPerPage);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

export function pageForTime({ score, timeSeconds, getPageForElement, currentPage }) {
  return pageForEventTimeline({
    events: allNotes(score).sort((a, b) => a.onsetSeconds - b.onsetSeconds),
    timeSeconds,
    getPageForElement,
    currentPage,
  });
}

export function createScoreEventTimeline(score) {
  return allNotes(score).sort((a, b) => a.onsetSeconds - b.onsetSeconds);
}

export function pageForEventTimeline({ events, timeSeconds, getPageForElement, currentPage }) {
  const event = latestEventAtTime(events, timeSeconds);

  if (!event) {
    return currentPage;
  }

  return getPageForElement(event.id) || currentPage;
}

function latestEventAtTime(events, timeSeconds) {
  let low = 0;
  let high = events.length - 1;
  let result = null;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (events[mid].onsetSeconds <= timeSeconds) {
      result = events[mid];
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return result;
}

async function getVerovioToolkit() {
  if (!toolkitPromise) {
    toolkitPromise = createVerovioModule().then((verovioModule) => (
      new VerovioToolkit(verovioModule)
    ));
  }
  return toolkitPromise;
}

function allNotes(score) {
  return score.parts.flatMap((part) => (
    part.staves.flatMap((staff) => (
      staff.measures.flatMap((measure) => measure.notes)
    ))
  ));
}
