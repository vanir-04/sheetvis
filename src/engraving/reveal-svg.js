import { resolveNoteColor } from "../renderer/color.js";

const splitBeamOverlap = 36;
const segmentedBeamOverlap = 8;
const beamNoteHorizontalTolerance = 280;
const beamNoteVerticalTolerance = 1800;
const beamNoteVerticalClusterTolerance = 650;
const eventGeometryMaxDistance = 950;
const ledgerNoteMaxDistance = 450;
const stemNoteMaxDistance = 1400;
const tieNoteMaxDistance = 900;
const markingNoteMaxDistance = 2200;
const tupletNumberGlyphHeight = 340;
const tupletNumberNearBeamPadding = 60;
const tupletNumberSmallNudge = 75;

const hiddenClasses = [
  ".note",
  ".rest",
  ".beam",
  ".beamSpan",
  ".stem",
  ".tie",
  ".gliss",
  ".slide",
  ".tupletBracket > *",
  ".tupletNum > *",
  ".dots",
  ".bTrem > use",
  ".fTrem > use",
  ".ledgerLines path",
  ".accid",
];

const hiddenMarkingClasses = [
  ".dynam",
  ".hairpin",
];

export function createHiddenNotationCss(staffColor, { syncMarkings = true } = {}) {
  const hiddenSelectors = syncMarkings ? [...hiddenClasses, ...hiddenMarkingClasses] : hiddenClasses;
  return [
    `* { fill: ${staffColor}; stroke: ${staffColor}; }`,
    "use, text { stroke: none; }",
    "defs *, symbol * { stroke: none; }",
    "g.tempo { transform-box: fill-box; transform-origin: left center; transform: scale(0.72); }",
    `.hairpin polyline { fill: none; stroke: ${staffColor}; }`,
    `.tupletBracket polyline { fill: none; stroke: ${staffColor}; }`,
    ".ledgerLines { visibility: visible !important; }",
    `${hiddenSelectors.join(", ")} { visibility: hidden; }`,
  ].join("\n");
}

export function prepareRevealSvg(svg, score = null) {
  if (svg.includes('data-sheetvis-prepared="true"')) {
    return svg;
  }

  return annotateMarkingShapes(
    annotateTieShapes(
      annotateGlissShapes(
        annotateBeamShapes(
          annotateAttachedNoteSymbols(annotateStemShapes(annotateLedgerLines(svg))),
        ),
      ),
    ),
  ).replace(
    "<svg",
    '<svg data-sheetvis-prepared="true"',
  );
}

export function revealStateKey(score, currentTimeSeconds, { animateRests = false } = {}) {
  if (currentTimeSeconds < 0) {
    return "idle";
  }

  return score.parts
    .flatMap((part) => part.staves.flatMap((staff) => staff.measures.flatMap((measure) => measure.notes)))
    .filter((note) => (
      (!note.isRest || animateRests)
      && (note.revealOnsetSeconds ?? note.onsetSeconds) <= currentTimeSeconds
    ))
    .map((note) => `${note.id}@${formatNumber(note.revealOnsetSeconds ?? note.onsetSeconds)}`)
    .join("|");
}

export function applySvgRevealStyles({ svg, score, config, currentTimeSeconds }) {
  let annotatedSvg = prepareRevealSvg(svg, score);
  const rules = [];
  const syncMarkings = config.reveal?.syncMarkings !== false;
  const animateRests = config.reveal?.animateRests === true;
  const hiddenCss = createHiddenNotationCss(config.score.staffColor, { syncMarkings });
  const rootId = svgRootId(annotatedSvg);

  for (const [partIndex, part] of score.parts.entries()) {
    const partConfig = config.parts[partIndex] ?? config.parts[0];
    for (const note of part.staves.flatMap((staff) => staff.measures.flatMap((measure) => measure.notes))) {
      const revealOnsetSeconds = note.revealOnsetSeconds ?? note.onsetSeconds;
      if ((note.isRest && !animateRests) || revealOnsetSeconds > currentTimeSeconds) {
        continue;
      }

      const color = resolveNoteColor({ note, partConfig, totalBeats: score.totalBeats });
      annotatedSvg = revealLedgerPathInline(annotatedSvg, note.id, color);
      const selector = `#${cssEscape(note.id)}`;
      const ledgerSelector = `.ledgerLines path[data-sheetvis-ledger-for="${cssStringEscape(note.id)}"]`;
      const tieSelector = `[data-sheetvis-tie-for="${cssStringEscape(note.id)}"]`;
      const stemSelector = `[data-sheetvis-stem-for="${cssStringEscape(note.id)}"]`;
      const symbolSelector = `[data-sheetvis-symbol-for="${cssStringEscape(note.id)}"]`;
      const glissDataSelector = `[data-sheetvis-gliss-for="${cssStringEscape(note.id)}"]`;
      const glissSelector = scopedRevealSelector(glissDataSelector, rootId);
      const noteRules = [
        `${selector} { visibility: visible; fill: ${color}; stroke: ${color}; }`,
        `${selector} * { visibility: visible; fill: ${color}; stroke: ${color}; }`,
        `${selector} use, ${selector} text { stroke: none; }`,
        `${ledgerSelector} { visibility: visible !important; fill: ${color}; stroke: ${color}; }`,
        `${tieSelector} { visibility: visible; fill: ${color}; stroke: ${color}; }`,
        `${stemSelector} { visibility: visible; fill: ${color}; stroke: ${color}; }`,
        `${stemSelector} * { visibility: visible; fill: ${color}; stroke: ${color}; }`,
        `${symbolSelector} { visibility: visible; fill: ${color}; stroke: ${color}; }`,
        `${symbolSelector} * { visibility: visible; fill: ${color}; stroke: ${color}; }`,
        `${symbolSelector} use, ${symbolSelector} text, ${symbolSelector} ellipse { stroke: none; }`,
        `${glissSelector} { visibility: visible !important; fill: ${color}; stroke: ${color}; }`,
        `${glissSelector} * { visibility: visible !important; fill: ${color}; stroke: ${color}; }`,
      ];

      if (syncMarkings) {
        const markingSelector = `[data-sheetvis-marking-for="${cssStringEscape(note.id)}"]`;
        noteRules.push(
          `${markingSelector} { visibility: visible; fill: ${color}; stroke: ${color}; }`,
          `${markingSelector} * { visibility: visible; fill: ${color}; stroke: ${color}; }`,
          `${markingSelector}.hairpin polyline, ${markingSelector} .hairpin polyline, ${markingSelector} polyline { fill: none; stroke: ${color}; }`,
        );
      }

      const beamDataSelector = `[data-sheetvis-beam-for="${cssStringEscape(note.id)}"]`;
      const beamSelector = scopedRevealSelector(beamDataSelector, rootId);
      const beamChildSelector = scopedRevealSelector(`${beamDataSelector} *`, rootId);
      noteRules.push(
        `${beamSelector} { visibility: visible !important; fill: ${color}; stroke: ${color}; }`,
        `${beamChildSelector} { visibility: visible !important; fill: ${color}; stroke: ${color}; }`,
        `${beamDataSelector} use, ${beamDataSelector} text { stroke: none; }`,
        `${beamDataSelector}.tupletBracket polyline, ${beamDataSelector} .tupletBracket polyline, ${beamDataSelector} polyline { fill: none; stroke: ${color}; }`,
      );

      rules.push(noteRules.join("\n"));
    }
  }

  return annotatedSvg.replace(
    "</svg>",
    [
      `<style data-sheetvis-hidden="true">\n${hiddenCss}\n</style>`,
      `<style data-sheetvis-reveal="true">\n${rules.join("\n")}\n</style>`,
      "</svg>",
    ].join(""),
  );
}

function revealLedgerPathInline(svg, noteId, color) {
  const pattern = new RegExp(
    `(<path\\b(?=[^>]*data-sheetvis-ledger-for="${escapeRegExp(escapeAttribute(noteId))}")(?![^>]*style=)([^>]*)/>)`,
    "g",
  );
  return svg.replace(pattern, `<path$2 style="visibility: visible; fill: ${color}; stroke: ${color};"/>`);
}

function cssEscape(value) {
  return String(value).replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

function svgRootId(svg) {
  return svg.match(/<svg\b[^>]*\sid="([^"]+)"/)?.[1] || null;
}

function scopedRevealSelector(selector, rootId) {
  return rootId ? `${selector}, #${cssEscape(rootId)} ${selector}` : selector;
}

export function annotateLedgerLines(svg) {
  const notePositions = collectNotePositions(svg);
  const ledgerPattern = /<g class="ledgerLines[^"]*"[^>]*>(?:\s*<path[^>]*\/>\s*)+<\/g>/g;
  let annotated = "";
  let cursor = 0;

  for (const match of svg.matchAll(ledgerPattern)) {
    const ledger = match[0];
    const start = match.index;
    const end = start + ledger.length;
    const lookahead = svg.slice(end, end + 2500);
    const fallbackNoteId = findNextNoteId(lookahead);

    annotated += svg.slice(cursor, start);
    annotated += annotateLedgerPaths(ledger, notePositions, fallbackNoteId);
    cursor = end;
  }

  return `${annotated}${svg.slice(cursor)}`;
}

export function annotateBeamShapes(svg) {
  const notePositions = collectNotePositions(svg);
  return annotateEventGeometry(
    annotateEventGeometry(
      annotateEventGeometry(svg, "beam", ["polygon", "path"], notePositions),
    "beamSpan",
    ["polygon", "path"],
    notePositions,
  ),
  "tuplet",
  ["polygon", "polyline", "path", "use", "text"],
  notePositions,
);
}

export function annotateStemShapes(svg) {
  const notePositions = collectNotePositions(svg);
  return svg.replace(/<g\b(?=[^>]*class="[^"]*\bstem\b[^"]*")(?![^>]*data-sheetvis-stem-for)[^>]*>[\s\S]*?<\/g>/g, (stemGroup) => {
    const pathAttributes = stemGroup.match(/<path\b([^>]*)\/>/)?.[1] || "";
    const center = geometryCenter(pathAttributes);
    const noteId = center
      ? nearestNoteIdWithinDistance(center, notePositions, stemNoteMaxDistance)
      : null;
    if (!noteId) {
      return stemGroup;
    }

    return stemGroup.replace("<g", `<g data-sheetvis-stem-for="${escapeAttribute(noteId)}"`);
  });
}

export function annotateAttachedNoteSymbols(svg) {
  const notePositions = collectNotePositions(svg);
  return annotateTremoloGlyphs(annotateDotGroups(svg, notePositions), notePositions);
}

function annotateDotGroups(svg, notePositions) {
  return svg.replace(/<g\b(?=[^>]*class="[^"]*\bdots\b[^"]*")(?![^>]*data-sheetvis-symbol-for)[^>]*>[\s\S]*?<\/g>/g, (dotGroup) => {
    const center = groupGeometryCenter(dotGroup);
    const noteId = nearestNoteIdByPoint(center, notePositions);
    if (!noteId) {
      return dotGroup;
    }

    return dotGroup.replace("<g", `<g data-sheetvis-symbol-for="${escapeAttribute(noteId)}"`);
  });
}

function annotateTremoloGlyphs(svg, notePositions) {
  return svg.replace(/<g\b(?=[^>]*class="[^"]*\b[bf]Trem\b[^"]*")[^>]*>[\s\S]*?<\/g>/g, (tremoloGroup) => {
    const glyph = tremoloGroup.match(/<use\b(?![^>]*data-sheetvis-symbol-for)([^>]*)\s*\/>/);
    if (!glyph) {
      return tremoloGroup;
    }

    const center = transformCenter(glyph[1]) || geometryCenter(glyph[1]) || xyCenter(glyph[1]);
    const noteId = nearestNoteIdByPoint(center, notePositions);
    if (!noteId) {
      return tremoloGroup;
    }

    return tremoloGroup.replace(
      glyph[0],
      `<use data-sheetvis-symbol-for="${escapeAttribute(noteId)}"${glyph[1]}/>`,
    );
  });
}

export function annotateTieShapes(svg) {
  const notePositions = collectNotePositions(svg);
  return svg.replace(/<g\b(?=[^>]*class="[^"]*\btie\b[^"]*")[^>]*>[\s\S]*?<\/g>/g, (tieGroup) => (
    tieGroup.replace(/<path\b(?![^>]*data-sheetvis-tie-for)([^>]*)\/>/g, (pathTag, attributes) => {
      const startPoint = geometryStartPoint(attributes);
      const noteId = startPoint
        ? nearestNoteIdWithinDistance(startPoint, notePositions, tieNoteMaxDistance)
        : nearestNoteId(geometryLeftX(attributes), notePositions);
      if (!noteId) {
        return pathTag;
      }
      return `<path data-sheetvis-tie-for="${escapeAttribute(noteId)}"${attributes}/>`;
    })
  ));
}

export function annotateGlissShapes(svg) {
  const notePositions = collectNotePositions(svg);
  return svg.replace(
    /<g\b(?=[^>]*class="[^"]*\b(?:gliss|slide)\b[^"]*")(?![^>]*data-sheetvis-gliss-for)[^>]*>[\s\S]*?<\/g>/g,
    (glissGroup) => {
      const pathAttributes = glissGroup.match(/<path\b([^>]*)\/>/)?.[1] || "";
      const startPoint = geometryStartPoint(pathAttributes);
      const noteId = startPoint
        ? nearestNoteIdWithinDistance(startPoint, notePositions, tieNoteMaxDistance)
        : nearestNoteId(geometryLeftX(pathAttributes), notePositions);
      if (!noteId) {
        return glissGroup;
      }

      return glissGroup.replace("<g", `<g data-sheetvis-gliss-for="${escapeAttribute(noteId)}"`);
    },
  );
}

export function annotateMarkingShapes(svg) {
  const notePositions = collectNotePositions(svg);
  return svg.replace(
    /<g\b(?=[^>]*class="[^"]*\b(?:dynam|hairpin)\b[^"]*")(?![^>]*data-sheetvis-marking-for)[^>]*>[\s\S]*?<\/g>/g,
    (markingGroup) => {
      const center = groupGeometryCenter(markingGroup);
      const noteId = center
        ? nearestNoteIdWithinDistance(center, notePositions, markingNoteMaxDistance) || nearestNoteId(center.x, notePositions)
        : null;
      if (!noteId) {
        return markingGroup;
      }

      return markingGroup.replace("<g", `<g data-sheetvis-marking-for="${escapeAttribute(noteId)}"`);
    },
  );
}

function annotateEventGeometry(svg, className, tagNames, notePositions) {
  const groupPattern = className === "beamSpan"
    ? /<g\b(?=[^>]*class="[^"]*\bbeamSpan\b[^"]*")[^>]*>[\s\S]*?<\/g>/g
    : new RegExp(
      `<g\\b(?=[^>]*class="[^"]*\\b${className}\\b[^"]*")[^>]*>[\\s\\S]*?(?=<g\\b(?=[^>]*(?:id="[^"]+" class="note"|class="note" id="[^"]+")))`,
      "g",
    );

  return svg.replace(groupPattern, (eventPrefix) => {
    const eventStart = svg.indexOf(eventPrefix);
    const eventContext = `${svg.slice(Math.max(0, eventStart - 2500), eventStart)}${eventPrefix}`;
    const firstNoteId = findNextNoteId(svg.slice(eventStart + eventPrefix.length - 1));

    const geometryPattern = new RegExp(
      `<(${tagNames.join("|")})\\b(?![^>]*class="note")(?![^>]*data-sheetvis-beam-for)([^>]*)>?(?:</\\1>)?`,
      "g",
    );
    return eventPrefix.replace(geometryPattern, (match, tagName, attributes, offset) => {
      if (tagName === "g" && !/\bclass="[^"]*\b(?:tupletBracket|tupletNum)\b[^"]*"/.test(match)) {
        return match;
      }

      const tupletMarkerClass = className === "tuplet" ? tupletMarkerClassAt(eventPrefix, offset) : null;
      const forceFirstTupletEvent = Boolean(tupletMarkerClass);

      if (tagName === "polygon") {
        const center = elementCenter(attributes);
        const noteId = forceFirstTupletEvent ? firstNoteId : noteIdForEventGeometry(center, notePositions, firstNoteId, {
          allowFallback: className === "tuplet",
        });
        if (!noteId) {
          return match;
        }
        const expandedPolygon = expandedBeamPolygon(attributes, noteId, eventPrefix);
        if (expandedPolygon) {
          return expandedPolygon;
        }

        const splitPolygons = splitBeamPolygon(attributes, notePositions);
        if (splitPolygons.length > 0) {
          return splitPolygons.join("");
        }

        return match.replace(
          `<${tagName}`,
          `<${tagName} data-sheetvis-beam-for="${escapeAttribute(noteId)}"`,
        );
      }

      const nextAttributes = tagName === "use" && tupletMarkerClass === "tupletNum"
        ? lightlyNudgeBelowBeamTupletNumber(attributes, eventContext)
        : attributes;
      const center = elementCenter(nextAttributes);
      const noteId = forceFirstTupletEvent ? firstNoteId : noteIdForEventGeometry(center, notePositions, firstNoteId, {
        allowFallback: className === "tuplet",
      });
      if (!noteId) {
        return match;
      }
      return match.replace(
        `<${tagName}`,
        `<${tagName} data-sheetvis-beam-for="${escapeAttribute(noteId)}"`,
      ).replace(attributes, nextAttributes);
    });
  });
}

function tupletMarkerClassAt(source, offset) {
  const stack = [];
  const tokenPattern = /<g\b[^>]*class="([^"]*)"[^>]*>|<\/g>/g;
  for (const match of source.slice(0, offset).matchAll(tokenPattern)) {
    if (match[0].startsWith("</g")) {
      stack.pop();
    } else {
      stack.push(match[1]);
    }
  }

  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const markerClass = stack[index]?.match(/\b(tupletBracket|tupletNum)\b/)?.[1];
    if (markerClass) {
      return markerClass;
    }
  }

  return null;
}

function lightlyNudgeBelowBeamTupletNumber(attributes, eventPrefix) {
  const center = transformCenter(attributes);
  const beamBounds = beamPolygonBounds(eventPrefix);
  if (!center || !beamBounds || center.y <= beamBounds.bottom) {
    return attributes;
  }

  const glyphTop = center.y - tupletNumberGlyphHeight;
  if (glyphTop > beamBounds.bottom + tupletNumberNearBeamPadding) {
    return attributes;
  }

  const nextY = formatNumber(center.y + tupletNumberSmallNudge);
  return attributes.replace(
    /translate\((-?\d+(?:\.\d+)?)([ ,]+)-?\d+(?:\.\d+)?\)/,
    `translate($1$2${nextY})`,
  );
}

function beamPolygonBounds(source) {
  const points = Array.from(source.matchAll(/<polygon\b([^>]*)\/>/g))
    .flatMap((match) => polygonPoints(match[1]));
  if (points.length === 0) {
    return null;
  }

  return {
    top: Math.min(...points.map((point) => point.y)),
    bottom: Math.max(...points.map((point) => point.y)),
  };
}

function splitBeamPolygon(attributes, notePositions) {
  const points = polygonPoints(attributes);
  if (points.length !== 4 || notePositions.length < 2) {
    return [];
  }

  const left = Math.min(...points.map((point) => point.x));
  const right = Math.max(...points.map((point) => point.x));
  const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const horizontallyRelevantNotes = notePositions
    .filter((note) => note.x >= left - beamNoteHorizontalTolerance && note.x <= right + beamNoteHorizontalTolerance)
    .map((note) => ({ ...note, beamDistanceY: Math.abs(note.y - centerY) }));
  const nearestDistanceY = Math.min(...horizontallyRelevantNotes.map((note) => note.beamDistanceY));
  const relevantNotes = horizontallyRelevantNotes
    .filter((note) => (
      note.beamDistanceY <= beamNoteVerticalTolerance
      && note.beamDistanceY <= nearestDistanceY + beamNoteVerticalClusterTolerance
    ))
    .sort((a, b) => a.x - b.x);

  if (relevantNotes.length < 2) {
    return [];
  }

  const top = [points[0], points[1]];
  const bottom = [points[3], points[2]];
  const boundaries = [
    left,
    ...relevantNotes.slice(1).map((note, index) => (relevantNotes[index].x + note.x) / 2),
    right,
  ];

  return relevantNotes.map((note, index) => {
    const segmentLeft = Math.max(left, boundaries[index] - (index > 0 ? splitBeamOverlap : 0));
    const segmentRight = Math.min(
      right,
      boundaries[index + 1] + (index < relevantNotes.length - 1 ? splitBeamOverlap : 0),
    );
    if (segmentRight <= segmentLeft) {
      return "";
    }

    return [
      `<polygon data-sheetvis-beam-for="${escapeAttribute(note.id)}" points="`,
      formatPoint(segmentLeft, interpolateY(top, segmentLeft)),
      " ",
      formatPoint(segmentRight, interpolateY(top, segmentRight)),
      " ",
      formatPoint(segmentRight, interpolateY(bottom, segmentRight)),
      " ",
      formatPoint(segmentLeft, interpolateY(bottom, segmentLeft)),
      '" />',
    ].join("");
  }).join("").match(/<polygon[^>]+\/>/g) || [];
}

function expandedBeamPolygon(attributes, noteId, eventPrefix) {
  const points = polygonPoints(attributes);
  if (points.length !== 4) {
    return null;
  }

  const left = Math.min(...points.map((point) => point.x));
  const right = Math.max(...points.map((point) => point.x));
  const ranges = beamPolygonRanges(eventPrefix);
  const touchesLeftNeighbor = ranges.some((range) => Math.abs(range.right - left) <= 1);
  const touchesRightNeighbor = ranges.some((range) => Math.abs(range.left - right) <= 1);
  if (!touchesLeftNeighbor && !touchesRightNeighbor) {
    return null;
  }
  const top = [points[0], points[1]];
  const bottom = [points[3], points[2]];
  const segmentLeft = left - (touchesLeftNeighbor ? segmentedBeamOverlap : 0);
  const segmentRight = right + (touchesRightNeighbor ? segmentedBeamOverlap : 0);

  return [
    `<polygon data-sheetvis-beam-for="${escapeAttribute(noteId)}" points="`,
    formatPoint(segmentLeft, interpolateY(top, segmentLeft)),
    " ",
    formatPoint(segmentRight, interpolateY(top, segmentRight)),
    " ",
    formatPoint(segmentRight, interpolateY(bottom, segmentRight)),
    " ",
    formatPoint(segmentLeft, interpolateY(bottom, segmentLeft)),
    '" />',
  ].join("");
}

function beamPolygonRanges(source) {
  return Array.from(source.matchAll(/<polygon\b(?![^>]*data-sheetvis-beam-for)([^>]*)\/>/g))
    .map((match) => polygonPoints(match[1]))
    .filter((points) => points.length === 4)
    .map((points) => ({
      left: Math.min(...points.map((point) => point.x)),
      right: Math.max(...points.map((point) => point.x)),
    }));
}

function polygonPoints(attributes) {
  const source = attributes.match(/\spoints="([^"]+)"/)?.[1] || "";
  const values = Array.from(source.matchAll(/-?\d+(?:\.\d+)?/g)).map((match) => Number(match[0]));
  const points = [];
  for (let index = 0; index + 1 < values.length; index += 2) {
    points.push({ x: values[index], y: values[index + 1] });
  }
  return points;
}

function interpolateY(edge, x) {
  const [start, end] = edge;
  if (start.x === end.x) {
    return start.y;
  }
  const ratio = (x - start.x) / (end.x - start.x);
  return start.y + (end.y - start.y) * ratio;
}

function formatPoint(x, y) {
  return `${formatNumber(x)} ${formatNumber(y)}`;
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
}

function annotateLedgerPaths(ledger, notePositions, fallbackNoteId) {
  return ledger.replace(/<path\b([^>]*)\/>/g, (pathTag, attributes) => {
    if (attributes.includes("data-sheetvis-ledger-for")) {
      return pathTag;
    }

    const center = ledgerPathCenter(attributes);
    const noteId = center && notePositions.length > 0
      ? nearestNoteIdWithinDistance(center, notePositions, ledgerNoteMaxDistance)
      : fallbackNoteId;
    if (!noteId) {
      return pathTag;
    }

    return `<path data-sheetvis-ledger-for="${escapeAttribute(noteId)}"${attributes}/>`;
  });
}

function collectNotePositions(svg) {
  const notes = [];
  const noteStartPattern = /<g\s+(?:id="([^"]+)" class="note"|class="note" id="([^"]+)")/g;

  for (const match of svg.matchAll(noteStartPattern)) {
    const id = match[1] || match[2];
    const source = svg.slice(match.index, match.index + 1200);
    const transform = source.match(/translate\((-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)\)/);
    if (transform) {
      notes.push({ id, x: Number(transform[1]), y: Number(transform[2]) });
    }
  }

  return notes;
}

function geometryCenter(attributes) {
  const source = attributes.match(/\spoints="([^"]+)"/)?.[1]
    || attributes.match(/\sd="([^"]+)"/)?.[1]
    || "";
  const values = Array.from(source.matchAll(/-?\d+(?:\.\d+)?/g)).map((match) => Number(match[0]));
  const points = [];
  for (let index = 0; index + 1 < values.length; index += 2) {
    points.push({ x: values[index], y: values[index + 1] });
  }
  if (points.length === 0) {
    return null;
  }

  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function elementCenter(attributes) {
  return transformCenter(attributes) || geometryCenter(attributes) || xyCenter(attributes);
}

function geometryLeftX(attributes) {
  const source = attributes.match(/\spoints="([^"]+)"/)?.[1]
    || attributes.match(/\sd="([^"]+)"/)?.[1]
    || "";
  const values = Array.from(source.matchAll(/-?\d+(?:\.\d+)?/g))
    .map((match, index) => (index % 2 === 0 ? Number(match[0]) : null))
    .filter(Number.isFinite);
  if (values.length === 0) {
    return null;
  }

  return Math.min(...values);
}

function geometryStartPoint(attributes) {
  const source = attributes.match(/\spoints="([^"]+)"/)?.[1]
    || attributes.match(/\sd="([^"]+)"/)?.[1]
    || "";
  const values = Array.from(source.matchAll(/-?\d+(?:\.\d+)?/g)).map((match) => Number(match[0]));
  if (values.length < 2) {
    return null;
  }

  return { x: values[0], y: values[1] };
}

function groupGeometryCenter(source) {
  const transformed = transformCenter(source);
  if (transformed) {
    return transformed;
  }

  const geometry = source.match(/<(?:polyline|polygon|path|rect|text|use|ellipse|circle)\b([^>]*)/);
  if (!geometry) {
    return null;
  }

  return geometryCenter(geometry[1]) || xyCenter(geometry[1]);
}

function transformCenter(source) {
  const translate = source.match(/translate\((-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)\)/);
  if (!translate) {
    return null;
  }

  return { x: Number(translate[1]), y: Number(translate[2]) };
}

function xyCenter(attributes) {
  const x = Number(attributes.match(/\s(?:x|cx)="(-?\d+(?:\.\d+)?)"/)?.[1]);
  const y = Number(attributes.match(/\s(?:y|cy)="(-?\d+(?:\.\d+)?)"/)?.[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x, y };
}

function ledgerPathCenter(attributes) {
  const d = attributes.match(/\sd="([^"]+)"/)?.[1] || "";
  const values = Array.from(d.matchAll(/-?\d+(?:\.\d+)?/g)).map((match) => Number(match[0]));
  if (values.length < 4) {
    return null;
  }

  return {
    x: (values[0] + values[2]) / 2,
    y: (values[1] + values[3]) / 2,
  };
}

function nearestNoteId(x, notePositions) {
  if (!Number.isFinite(x) || notePositions.length === 0) {
    return null;
  }

  return notePositions
    .map((note) => ({ ...note, distance: Math.abs(note.x - x) }))
    .sort((a, b) => a.distance - b.distance)[0]?.id || null;
}

function nearestNoteIdByPoint(point, notePositions) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || notePositions.length === 0) {
    return null;
  }

  return notePositions
    .map((note) => ({
      ...note,
      distance: Math.hypot(note.x - point.x, note.y - point.y),
    }))
    .sort((a, b) => a.distance - b.distance)[0]?.id || null;
}

function noteIdForEventGeometry(point, notePositions, fallbackNoteId, { allowFallback = false } = {}) {
  if (!point) {
    return fallbackNoteId || null;
  }

  return nearestNoteIdWithinDistance(point, notePositions, eventGeometryMaxDistance)
    || (allowFallback ? fallbackNoteId : null);
}

function nearestNoteIdWithinDistance(point, notePositions, maxDistance) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || notePositions.length === 0) {
    return null;
  }

  const nearest = notePositions
    .map((note) => ({
      ...note,
      distance: Math.hypot(note.x - point.x, note.y - point.y),
    }))
    .sort((a, b) => a.distance - b.distance)[0];

  return nearest?.distance <= maxDistance ? nearest.id : null;
}

function cssStringEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function findNextNoteId(source) {
  const candidates = [
    matchWithIndex(source, /<g id="([^"]+)" class="note"/),
    matchWithIndex(source, /<g class="note" id="([^"]+)"/),
  ].filter(Boolean).sort((a, b) => a.index - b.index);

  return candidates[0]?.id || null;
}

function matchWithIndex(source, pattern) {
  const match = source.match(pattern);
  return match ? { id: match[1], index: match.index } : null;
}

function escapeAttribute(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
