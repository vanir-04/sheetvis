import { createConfig } from "../config/schema.js";
import { createDemoMusicXml } from "../demo/musicxml.js";
import { applySvgRevealStyles, prepareRevealSvg, revealStateKey } from "../engraving/reveal-svg.js";
import {
  createPagedEngravingWithVerovio,
  createScoreEventTimeline,
  pageForEventTimeline,
} from "../engraving/verovio.js";
import {
  canFastEncodeVideo,
  createFramePlan,
  createVisualFrameGroups,
  fastEncodeCanvasSequence,
  recordCanvas,
} from "../export/video.js";
import { ensureMusicXmlNoteIds, parseMusicXml } from "../parser/musicxml.js";
import { PlaybackClock } from "../playback/clock.js";
import { drawScore } from "../renderer/canvas.js";
import { createPageIndexes, scrollTopForPage, viewModes } from "./view-mode.js";

const elements = {
  canvas: document.querySelector("#scoreCanvas"),
  scoreFrame: document.querySelector(".score-frame"),
  engravingLayer: document.querySelector("#engravingLayer"),
  scrollLayer: document.querySelector("#scrollLayer"),
  playPauseButton: document.querySelector("#playPauseButton"),
  previousPageButton: document.querySelector("#previousPageButton"),
  nextPageButton: document.querySelector("#nextPageButton"),
  pageStatus: document.querySelector("#pageStatus"),
  scrubber: document.querySelector("#scrubber"),
  speedSelect: document.querySelector("#speedSelect"),
  viewModeSelect: document.querySelector("#viewModeSelect"),
  backgroundColorInput: document.querySelector("#backgroundColorInput"),
  staffColorInput: document.querySelector("#staffColorInput"),
  measuresPerPageInput: document.querySelector("#measuresPerPageInput"),
  syncMarkingsInput: document.querySelector("#syncMarkingsInput"),
  animateRestsInput: document.querySelector("#animateRestsInput"),
  partControls: document.querySelector("#partControls"),
  configEditor: document.querySelector("#configEditor"),
  applyConfigButton: document.querySelector("#applyConfigButton"),
  resetConfigButton: document.querySelector("#resetConfigButton"),
  exportButton: document.querySelector("#exportButton"),
  fastExportButton: document.querySelector("#fastExportButton"),
  downloadLink: document.querySelector("#downloadLink"),
  currentTime: document.querySelector("#currentTime"),
  totalTime: document.querySelector("#totalTime"),
  statusText: document.querySelector("#statusText"),
  scoreMeta: document.querySelector("#scoreMeta"),
  fileInput: document.querySelector("#fileInput"),
};

const ctx = elements.canvas.getContext("2d");
let config = createConfig();
let sourceMusicXml = ensureMusicXmlNoteIds(createDemoMusicXml());
let score = parseMusicXml(sourceMusicXml);
let scoreTimeline = createScoreEventTimeline(score);
let engravingSvg = "";
let preparedEngravingSvg = "";
let renderedSvgKey = "";
let engravingImage = null;
let pagedEngraving = null;
let currentPage = 1;
let pageCount = 1;
let viewMode = viewModes.page;
let scrollPages = [];
let lastScrollPage = 1;
let lastScrollRevealTime = null;
let clock = new PlaybackClock({ durationSeconds: score.totalSeconds });

initialize();

function initialize() {
  alignConfigPartsToScore();
  syncCanvasSize();
  syncConfigUi();
  updateScoreUi();

  elements.playPauseButton.addEventListener("click", togglePlayback);
  elements.previousPageButton.addEventListener("click", () => showPage(currentPage - 1));
  elements.nextPageButton.addEventListener("click", () => showPage(currentPage + 1));
  elements.speedSelect.addEventListener("change", () => clock.setSpeed(elements.speedSelect.value));
  elements.viewModeSelect.addEventListener("change", () => setViewMode(elements.viewModeSelect.value));
  elements.backgroundColorInput.addEventListener("input", updateConfigFromControls);
  elements.staffColorInput.addEventListener("input", updateConfigFromControls);
  elements.measuresPerPageInput.addEventListener("change", updateConfigFromControls);
  elements.syncMarkingsInput.addEventListener("change", updateConfigFromControls);
  elements.animateRestsInput.addEventListener("change", updateConfigFromControls);
  elements.scrubber.addEventListener("input", () => {
    clock.seek(Number(elements.scrubber.value));
    render();
  });
  elements.applyConfigButton.addEventListener("click", applyConfigFromEditor);
  elements.resetConfigButton.addEventListener("click", resetConfig);
  elements.exportButton.addEventListener("click", exportVideo);
  elements.fastExportButton.addEventListener("click", fastExportVideo);
  elements.fileInput.addEventListener("change", showMusicXmlPlaceholder);

  render();
  renderEngraving();
  requestAnimationFrame(tick);
}

async function tick(timestampMs) {
  clock.update(timestampMs);
  await render();
  requestAnimationFrame(tick);
}

async function render({ followPlayback = true } = {}) {
  const revealTimeSeconds = clock.state === "idle" ? -Number.EPSILON : clock.currentTimeSeconds;
  if (followPlayback) {
    await updatePageForPlayback(revealTimeSeconds);
  }
  if (viewMode === viewModes.scroll) {
    await updateScrollFrame(revealTimeSeconds);
    scrollToCurrentPage();
  } else {
    await updateEngravingFrame(revealTimeSeconds);
    drawScore(ctx, config, engravingImage);
  }
  elements.scrubber.value = String(clock.currentTimeSeconds);
  elements.currentTime.textContent = formatTime(clock.currentTimeSeconds);
  elements.playPauseButton.textContent = clock.state === "playing" ? "Pause" : "Play";
  updatePageUi();
}

function togglePlayback() {
  if (clock.state === "playing") {
    clock.pause();
    render();
    return;
  }

  clock.play();
}

function applyConfigFromEditor() {
  try {
    const parsed = JSON.parse(elements.configEditor.value);
    config = createConfig(parsed);
    alignConfigPartsToScore();
    syncConfigUi();
    syncCanvasSize();
    render();
    renderEngraving();
    setStatus("Config applied.");
  } catch (error) {
    setStatus(`Config error: ${error.message}`);
  }
}

function resetConfig() {
  config = createConfig();
  alignConfigPartsToScore();
  syncConfigUi();
  syncCanvasSize();
  render();
  renderEngraving();
  setStatus("Config reset.");
}

function syncCanvasSize() {
  elements.canvas.width = config.canvas.width;
  elements.canvas.height = config.canvas.height;
  elements.canvas.style.aspectRatio = `${config.canvas.width} / ${config.canvas.height}`;
  elements.engravingLayer.style.aspectRatio = `${config.canvas.width} / ${config.canvas.height}`;
  elements.engravingLayer.style.background = config.canvas.background;
  elements.scoreFrame.dataset.viewMode = viewMode;
}

function syncConfigUi() {
  elements.backgroundColorInput.value = config.canvas.background;
  elements.staffColorInput.value = config.score.staffColor;
  elements.measuresPerPageInput.value = String(normalizedMeasuresPerPage(config.score.measuresPerPage));
  elements.syncMarkingsInput.checked = config.reveal?.syncMarkings !== false;
  elements.animateRestsInput.checked = config.reveal?.animateRests === true;
  renderPartControls();
  syncConfigEditor();
}

function syncConfigEditor() {
  elements.configEditor.value = JSON.stringify(config, null, 2);
}

function alignConfigPartsToScore() {
  config = createConfig({
    ...config,
    parts: score.parts.map((part, index) => ({
      ...(config.parts[index] ?? config.parts[0]),
      id: part.id,
      label: part.name,
    })),
  });
}

function renderPartControls() {
  elements.partControls.innerHTML = "";
  for (const [index, part] of config.parts.entries()) {
    const label = document.createElement("label");
    label.className = "part-control";

    const text = document.createElement("span");
    text.textContent = part.label || score.parts[index]?.name || `Part ${index + 1}`;

    const input = document.createElement("input");
    input.type = "color";
    input.value = part.baseColor;
    input.dataset.partIndex = String(index);
    input.addEventListener("input", updateConfigFromControls);

    label.append(text, input);
    elements.partControls.append(label);
  }
}

function updateConfigFromControls() {
  const previousMeasuresPerPage = normalizedMeasuresPerPage(config.score.measuresPerPage);
  const nextParts = config.parts.map((part, index) => {
    const input = elements.partControls.querySelector(`input[data-part-index="${index}"]`);
    return {
      ...part,
      baseColor: input?.value || part.baseColor,
      progressionColorStart: input?.value || part.progressionColorStart,
    };
  });

  config = createConfig({
    ...config,
    canvas: {
      ...config.canvas,
      background: elements.backgroundColorInput.value,
    },
    score: {
      ...config.score,
      staffColor: elements.staffColorInput.value,
      measuresPerPage: normalizedMeasuresPerPage(elements.measuresPerPageInput.value),
    },
    parts: nextParts,
    reveal: {
      ...config.reveal,
      syncMarkings: elements.syncMarkingsInput.checked,
      animateRests: elements.animateRestsInput.checked,
    },
  });
  syncConfigEditor();
  syncCanvasSize();
  invalidateRenderedFrames();
  const layoutChanged = normalizedMeasuresPerPage(config.score.measuresPerPage) !== previousMeasuresPerPage;
  if (layoutChanged) {
    renderEngraving();
  } else {
    render();
  }
  setStatus("Config updated.");
}

function revealConfigKey() {
  return [
    config.canvas.background,
    config.score.staffColor,
    `mpp:${normalizedMeasuresPerPage(config.score.measuresPerPage)}`,
    config.reveal?.syncMarkings !== false ? "markings:on" : "markings:off",
    config.reveal?.animateRests === true ? "rests:on" : "rests:off",
    ...config.parts.map((part) => `${part.baseColor}:${part.colorMode}`),
  ].join("|");
}

function normalizedMeasuresPerPage(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function createRevealStateKey(timeSeconds) {
  return revealStateKey(score, timeSeconds, {
    animateRests: config.reveal?.animateRests === true,
  });
}

function invalidateRenderedFrames() {
  renderedSvgKey = "";
  for (const page of scrollPages) {
    page.renderedKey = "";
  }
}

async function exportVideo() {
  try {
    elements.exportButton.disabled = true;
    setStatus("Recording WebM...");
    const previousTime = clock.currentTimeSeconds;
    const previousState = clock.state;
    const blob = await recordCanvas({
      canvas: elements.canvas,
      fps: config.canvas.fps,
      durationSeconds: score.totalSeconds,
      onStart: () => {
        clock.seek(0);
        clock.setSpeed(1);
        clock.play();
      },
    });

    const url = URL.createObjectURL(blob);
    elements.downloadLink.href = url;
    elements.downloadLink.download = "sheetvis-demo.webm";
    elements.downloadLink.hidden = false;
    elements.downloadLink.textContent = "Download WebM";
    clock.seek(previousTime);
    if (previousState === "playing") {
      clock.play();
    }
    setStatus("Export ready.");
  } catch (error) {
    setStatus(error.message);
  } finally {
    elements.exportButton.disabled = false;
  }
}

async function fastExportVideo() {
  if (!pagedEngraving) {
    setStatus("Fast export needs a loaded engraving.");
    return;
  }

  if (!canFastEncodeVideo()) {
    setStatus("Fast export is not supported in this browser. Use Record WebM instead.");
    return;
  }

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = config.canvas.width;
  exportCanvas.height = config.canvas.height;
  const exportCtx = exportCanvas.getContext("2d");
  const preparedPages = new Map();
  const previousState = clock.state;
  const frames = createFramePlan({ fps: config.canvas.fps, durationSeconds: score.totalSeconds });
  const frameGroups = createVisualFrameGroups({
    frames,
    keyForTime: (timeSeconds) => {
      const pageNumber = pageForEventTimeline({
        events: scoreTimeline,
        timeSeconds,
        getPageForElement: (id) => pagedEngraving.getPageForElement(id),
        currentPage: 1,
      });
      return `${pageNumber}:${createRevealStateKey(timeSeconds)}:${revealConfigKey()}`;
    },
  });

  try {
    clock.pause();
    elements.fastExportButton.disabled = true;
    elements.exportButton.disabled = true;
    setStatus("Fast exporting WebM...");

    const blob = await fastEncodeCanvasSequence({
      canvas: exportCanvas,
      fps: config.canvas.fps,
      durationSeconds: score.totalSeconds,
      frameGroups,
      onProgress: ({ completedFrames, renderedGroups, stage, totalFrames, totalGroups }) => {
        if (stage === "finalizing") {
          setStatus(`Fast exporting WebM... finalizing encoder (${completedFrames} / ${totalFrames} frames)`);
          return;
        }
        if (stage === "muxing") {
          setStatus("Fast exporting WebM... muxing file");
          return;
        }
        setStatus(`Fast exporting WebM... ${renderedGroups} / ${totalGroups} visual states, ${completedFrames} / ${totalFrames} frames`);
      },
      renderFrame: async (timeSeconds) => {
        const pageNumber = pageForEventTimeline({
          events: scoreTimeline,
          timeSeconds,
          getPageForElement: (id) => pagedEngraving.getPageForElement(id),
          currentPage: 1,
        });
        const preparedSvg = preparedPages.get(pageNumber) || prepareRevealSvg(pagedEngraving.renderPage(pageNumber), score);
        preparedPages.set(pageNumber, preparedSvg);
        const revealedSvg = applySvgRevealStyles({
          svg: preparedSvg,
          score,
          config,
          currentTimeSeconds: timeSeconds,
        });
        const image = await createSvgImage(revealedSvg);
        drawScore(exportCtx, config, image);
      },
    });

    const url = URL.createObjectURL(blob);
    elements.downloadLink.href = url;
    elements.downloadLink.download = "sheetvis-fast-export.webm";
    elements.downloadLink.hidden = false;
    elements.downloadLink.textContent = "Download Fast WebM";
    setStatus("Fast export ready.");
  } catch (error) {
    setStatus(`Fast export failed: ${error.message}`);
  } finally {
    elements.fastExportButton.disabled = false;
    elements.exportButton.disabled = false;
    if (previousState === "playing") {
      clock.play();
    }
  }
}

async function showMusicXmlPlaceholder() {
  const file = elements.fileInput.files?.[0];
  if (!file) {
    return;
  }
  if (!file.name.match(/\.(xml|musicxml)$/i)) {
    setStatus(`${file.name} selected. MXL import still needs decompression support.`);
    elements.fileInput.value = "";
    return;
  }

  try {
    const nextMusicXml = ensureMusicXmlNoteIds(await file.text());
    const nextScore = parseMusicXml(nextMusicXml);
    sourceMusicXml = nextMusicXml;
    score = nextScore;
    alignConfigPartsToScore();
    syncConfigUi();
    scoreTimeline = createScoreEventTimeline(score);
    clock = new PlaybackClock({ durationSeconds: score.totalSeconds });
    updateScoreUi();
    await renderEngraving();
    setStatus(`${file.name} engraved with Verovio.`);
  } catch (error) {
    setStatus(`Unable to load ${file.name}: ${error.message}`);
  } finally {
    elements.fileInput.value = "";
  }
}

function setStatus(message) {
  elements.statusText.textContent = message;
}

function updateScoreUi() {
  elements.scrubber.max = String(score.totalSeconds);
  elements.scrubber.value = String(clock.currentTimeSeconds);
  elements.totalTime.textContent = formatTime(score.totalSeconds);
  elements.scoreMeta.textContent = `${score.title} - ${score.parts[0]?.name ?? "Score"}`;
}

async function renderEngraving() {
  elements.engravingLayer.innerHTML = "";
  elements.engravingLayer.style.background = config.canvas.background;
  setStatus("Loading Verovio engraving engine...");

  try {
    pagedEngraving = await createPagedEngravingWithVerovio(sourceMusicXml, config);
    pageCount = pagedEngraving.pageCount;
    currentPage = 1;
    if (viewMode === viewModes.scroll) {
      await renderScrollPages(-Number.EPSILON);
    } else {
      await renderCurrentPage(-Number.EPSILON);
    }
    setStatus("Engraving ready.");
    render();
  } catch (error) {
    elements.engravingLayer.innerHTML = "";
    engravingSvg = "";
    preparedEngravingSvg = "";
    renderedSvgKey = "";
    engravingImage = null;
    scrollPages = [];
    lastScrollPage = 1;
    lastScrollRevealTime = null;
    elements.scrollLayer.innerHTML = "";
    pagedEngraving = null;
    currentPage = 1;
    pageCount = 1;
    setStatus(`${error.message} Falling back to animated overlay only.`);
    render();
  }
}

async function updateEngravingFrame(revealTimeSeconds = clock.currentTimeSeconds) {
  if (!engravingSvg) {
    return;
  }

  const frameKey = `${createRevealStateKey(revealTimeSeconds)}:${revealConfigKey()}`;
  if (frameKey === renderedSvgKey) {
    return;
  }

  renderedSvgKey = frameKey;
  const revealedSvg = applySvgRevealStyles({
    svg: preparedEngravingSvg || engravingSvg,
    score,
    config,
    currentTimeSeconds: revealTimeSeconds,
  });
  elements.engravingLayer.innerHTML = revealedSvg;
  engravingImage = await createSvgImage(revealedSvg);
}

async function updatePageForPlayback(revealTimeSeconds) {
  if (!pagedEngraving || revealTimeSeconds < 0) {
    return;
  }

  const nextPage = pageForEventTimeline({
    events: scoreTimeline,
    timeSeconds: revealTimeSeconds,
    getPageForElement: (id) => pagedEngraving.getPageForElement(id),
    currentPage,
  });

  if (nextPage !== currentPage) {
    const previousPage = currentPage;
    currentPage = nextPage;
    if (viewMode === viewModes.scroll) {
      lastScrollPage = previousPage;
      return;
    }
    await renderCurrentPage(revealTimeSeconds);
  }
}

async function showPage(pageNumber) {
  if (!pagedEngraving) {
    return;
  }

  currentPage = Math.min(pageCount, Math.max(1, pageNumber));
  clock.pause();
  if (viewMode === viewModes.scroll) {
    scrollToCurrentPage();
    await updateScrollFrame(clock.currentTimeSeconds);
  } else {
    await renderCurrentPage(clock.currentTimeSeconds);
  }
  render({ followPlayback: false });
}

async function renderCurrentPage(revealTimeSeconds = clock.currentTimeSeconds) {
  if (!pagedEngraving) {
    return;
  }

  engravingSvg = pagedEngraving.renderPage(currentPage);
  preparedEngravingSvg = prepareRevealSvg(engravingSvg, score);
  elements.engravingLayer.innerHTML = preparedEngravingSvg;
  renderedSvgKey = "";
  await updateEngravingFrame(revealTimeSeconds);
  updatePageUi();
}

async function setViewMode(nextMode) {
  viewMode = nextMode === viewModes.scroll ? viewModes.scroll : viewModes.page;
  elements.viewModeSelect.value = viewMode;
  syncCanvasSize();

  if (!pagedEngraving) {
    return;
  }

  if (viewMode === viewModes.scroll) {
    await renderScrollPages(clock.state === "idle" ? -Number.EPSILON : clock.currentTimeSeconds);
    scrollToCurrentPage();
    return;
  }

  await renderCurrentPage(clock.state === "idle" ? -Number.EPSILON : clock.currentTimeSeconds);
}

async function renderScrollPages(revealTimeSeconds = clock.currentTimeSeconds) {
  if (!pagedEngraving) {
    return;
  }

  elements.scrollLayer.innerHTML = "";
  lastScrollPage = currentPage;
  lastScrollRevealTime = null;
  scrollPages = createPageIndexes(pageCount).map((pageNumber) => {
    const canvas = document.createElement("canvas");
    canvas.width = config.canvas.width;
    canvas.height = config.canvas.height;
    const page = document.createElement("div");
    page.className = "scroll-page";
    page.dataset.page = String(pageNumber);
    page.append(canvas);
    elements.scrollLayer.append(page);

    const svg = pagedEngraving.renderPage(pageNumber);
    return {
      canvas,
      ctx: canvas.getContext("2d"),
      pageNumber,
      preparedSvg: prepareRevealSvg(svg, score),
      renderedKey: "",
    };
  });

  await updateScrollFrame(revealTimeSeconds);
  scrollToCurrentPage();
}

async function updateScrollFrame(revealTimeSeconds = clock.currentTimeSeconds) {
  if (scrollPages.length === 0) {
    return;
  }

  const revealKey = createRevealStateKey(revealTimeSeconds);
  const colorKey = revealConfigKey();
  const pageChanged = currentPage !== lastScrollPage;
  const movedBackward = lastScrollRevealTime !== null && revealTimeSeconds < lastScrollRevealTime;
  const changedStartPage = Math.min(currentPage, lastScrollPage);
  const changedEndPage = Math.max(currentPage, lastScrollPage);

  for (const page of scrollPages) {
    const frameKey = `${revealKey}:${colorKey}`;
    const shouldRender = page.renderedKey === ""
      || page.pageNumber === currentPage
      || (pageChanged && page.pageNumber >= changedStartPage && page.pageNumber <= changedEndPage)
      || movedBackward;
    if (!shouldRender) {
      continue;
    }

    if (page.renderedKey === frameKey) {
      continue;
    }

    page.renderedKey = frameKey;
    const revealedSvg = applySvgRevealStyles({
      svg: page.preparedSvg,
      score,
      config,
      currentTimeSeconds: revealTimeSeconds,
    });
    const image = await createSvgImage(revealedSvg);
    drawScore(page.ctx, config, image);
  }

  lastScrollPage = currentPage;
  lastScrollRevealTime = revealTimeSeconds;
}

function scrollToCurrentPage() {
  if (viewMode !== viewModes.scroll || scrollPages.length === 0) {
    return;
  }

  elements.scoreFrame.scrollTop = scrollTopForPage({
    pageNumber: currentPage,
    pageHeight: elements.scrollLayer.querySelector(".scroll-page")?.offsetHeight || 0,
    gap: 24,
  });
}

function updatePageUi() {
  elements.pageStatus.textContent = `Page ${currentPage} / ${pageCount}`;
  elements.previousPageButton.disabled = currentPage <= 1;
  elements.nextPageButton.disabled = currentPage >= pageCount;
}

function createSvgImage(svg) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);

    image.addEventListener("load", () => {
      URL.revokeObjectURL(url);
      resolve(image);
    }, { once: true });
    image.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to rasterize Verovio SVG."));
    }, { once: true });
    image.src = url;
  });
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  return `${minutes}:${remaining.toFixed(1).padStart(4, "0")}`;
}
