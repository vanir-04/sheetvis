const pitchSteps = {
  C: 0,
  D: 1,
  E: 2,
  F: 3,
  G: 4,
  A: 5,
  B: 6,
};

export function parseMusicXml(xmlText) {
  const doc = parseXmlDocument(xmlText);
  const partNames = parsePartNames(doc);
  const title = text(doc, "work-title") || "Untitled score";
  const composer = Array.from(doc.getElementsByTagName("creator"))
    .find((creator) => creator.getAttribute("type") === "composer")?.textContent?.trim() || "";
  const parts = Array.from(doc.getElementsByTagName("part")).map((partNode) => parsePart(partNode, partNames));
  const totalBeats = Math.max(...parts.flatMap((part) => (
    part.staves[0].measures.map((measure) => measure.startBeat + measure.durationBeats)
  )), 0);
  const tempoMap = collectTempoMap(parts);
  const totalSeconds = beatsToSeconds(totalBeats, tempoMap);

  applySeconds(parts, tempoMap);

  return {
    title,
    composer,
    parts,
    tempoMap,
    totalBeats,
    totalSeconds,
  };
}

export function ensureMusicXmlNoteIds(xmlText) {
  let index = 1;
  return xmlText.replace(/<note(?=[\s>])([^>]*)>/g, (match, attributes) => {
    if (/\sid=/.test(attributes)) {
      return match;
    }
    return `<note id="sheetvis-note-${index++}"${attributes}>`;
  });
}

function parseXmlDocument(xmlText) {
  if (globalThis.DOMParser) {
    return new DOMParser().parseFromString(xmlText, "application/xml");
  }

  return parseXmlWithXmldom(xmlText);
}

function parsePartNames(doc) {
  return new Map(Array.from(doc.getElementsByTagName("score-part")).map((part) => [
    part.getAttribute("id"),
    text(part, "part-name") || part.getAttribute("id"),
  ]));
}

function parsePart(partNode, partNames) {
  const partId = partNode.getAttribute("id");
  let divisions = 1;
  let currentBeat = 0;
  let timeSignature = { beats: 4, beatType: 4 };
  let keySignature = { fifths: 0, mode: "major" };
  let clef = { sign: "G", line: 2 };
  const measures = [];
  const markings = [];
  const tempoEvents = [];
  let previousOnsetBeat = 0;
  const activeTies = new Map();
  const voiceCursors = new Map();
  const voicePreviousOnsets = new Map();

  for (const [measureIndex, measureNode] of Array.from(partNode.getElementsByTagName("measure")).entries()) {
    const notes = [];
    const measureStartBeat = currentBeat;
    let measureCursorBeat = measureStartBeat;
    let measureEndBeat = measureStartBeat;
    let minimumMeasureBeats = timeSignature.beats * (4 / timeSignature.beatType);
    let measureLimitBeat = measureStartBeat + minimumMeasureBeats;

    for (const child of elementChildren(measureNode)) {
      if (child.tagName === "attributes") {
        divisions = positiveNumber(text(child, "divisions"), divisions);
        timeSignature = {
          beats: number(text(child, "beats"), timeSignature.beats),
          beatType: number(text(child, "beat-type"), timeSignature.beatType),
        };
        minimumMeasureBeats = timeSignature.beats * (4 / timeSignature.beatType);
        measureLimitBeat = measureStartBeat + minimumMeasureBeats;
        keySignature = {
          fifths: number(text(child, "fifths"), keySignature.fifths),
          mode: text(child, "mode") || keySignature.mode,
        };
        const clefNode = firstChild(child, "clef");
        if (clefNode) {
          clef = {
            sign: text(clefNode, "sign") || clef.sign,
            line: number(text(clefNode, "line"), clef.line),
          };
        }
        continue;
      }

      if (child.tagName === "backup") {
        measureCursorBeat -= durationBeatsFromNode(child, divisions);
        continue;
      }

      if (child.tagName === "forward") {
        measureCursorBeat += durationBeatsFromNode(child, divisions);
        measureEndBeat = Math.max(measureEndBeat, Math.min(measureCursorBeat, measureLimitBeat));
        continue;
      }

      if (child.tagName === "direction") {
        for (const sound of Array.from(child.getElementsByTagName("sound"))) {
          const tempo = number(sound.getAttribute("tempo"), null);
          if (tempo) {
            tempoEvents.push({ beatOffset: measureCursorBeat, bpm: tempo });
          }
        }
        markings.push(...parseDirectionMarkings({
          directionNode: child,
          divisions,
          measureCursorBeat,
          measureIndex,
          partId,
          startIndex: markings.length,
        }));
        continue;
      }

      if (child.tagName !== "note") {
        continue;
      }

      const noteNode = child;
      if (firstChild(noteNode, "grace")) {
        continue;
      }

      const durationDivisions = number(text(noteNode, "duration"), 0);
      const durationBeats = durationDivisions / divisions;
      const isChord = Boolean(firstChild(noteNode, "chord"));
      const voice = number(text(noteNode, "voice"), 1);
      const staffNumber = number(text(noteNode, "staff"), 1);
      const voiceKey = `${staffNumber}:${voice}`;
      const voiceCursorBeat = voiceCursors.get(voiceKey);
      const onsetBeats = isChord
        ? voicePreviousOnsets.get(voiceKey) ?? previousOnsetBeat
        : noteOnsetBeat({
          measureCursorBeat,
          measureLimitBeat,
          measureStartBeat,
          voiceCursorBeat,
        });
      const tieTypes = Array.from(noteNode.getElementsByTagName("tie")).map((tie) => tie.getAttribute("type"));
      const tieKey = tieIdentity({ noteNode, voice, staffNumber });
      const revealOnsetBeats = tieTypes.includes("stop") ? activeTies.get(tieKey) : null;
      const note = {
        id: noteNode.getAttribute("id") || `${partId}-m${measureIndex + 1}-n${notes.length + 1}`,
        pitch: parsePitch(noteNode),
        isRest: Boolean(firstChild(noteNode, "rest")),
        isChord,
        durationBeats,
        onsetBeats,
        onsetSeconds: 0,
        durationSeconds: 0,
        revealOnsetBeats,
        revealOnsetSeconds: 0,
        voice,
        staffNumber,
        accidental: text(noteNode, "accidental") || null,
        tied: tieTypes.includes("stop"),
        tieTypes,
        beamGroup: parseBeamGroup(noteNode),
        stemDirection: text(noteNode, "stem") || "auto",
        lyric: text(firstChild(noteNode, "lyric"), "text") || null,
        noteType: text(noteNode, "type") || noteTypeFromDuration(durationBeats),
        dots: noteNode.getElementsByTagName("dot").length,
      };
      notes.push(note);
      previousOnsetBeat = onsetBeats;
      voicePreviousOnsets.set(voiceKey, onsetBeats);
      if (tieTypes.includes("start")) {
        activeTies.set(tieKey, revealOnsetBeats ?? onsetBeats);
      } else if (tieTypes.includes("stop")) {
        activeTies.delete(tieKey);
      }

      if (!isChord) {
        const nextBeat = onsetBeats + durationBeats;
        voiceCursors.set(voiceKey, nextBeat);
        measureCursorBeat = nextBeat;
        measureEndBeat = Math.max(measureEndBeat, nextBeat);
      }
    }

    currentBeat = measureStartBeat + Math.max(measureEndBeat - measureStartBeat, minimumMeasureBeats);
    measures.push({
      index: measureIndex,
      startBeat: measureStartBeat,
      durationBeats: currentBeat - measureStartBeat,
      timeSignature,
      keySignature,
      notes,
    });
  }

  return {
    id: partId,
    name: partNames.get(partId) || partId,
    isGrandStaff: false,
    markings,
    tempoEvents,
    staves: [{ staffIndex: 1, clef, measures }],
  };
}

function noteOnsetBeat({ measureCursorBeat, measureLimitBeat, measureStartBeat, voiceCursorBeat }) {
  const cursorOutsideMeasure = measureCursorBeat >= measureLimitBeat || measureCursorBeat < measureStartBeat;
  if (
    Number.isFinite(voiceCursorBeat)
    && cursorOutsideMeasure
    && voiceCursorBeat >= measureStartBeat
    && voiceCursorBeat < measureLimitBeat
  ) {
    return voiceCursorBeat;
  }

  return measureCursorBeat;
}

function parsePitch(noteNode) {
  const pitchNode = firstChild(noteNode, "pitch");
  if (!pitchNode) {
    return null;
  }

  return {
    step: text(pitchNode, "step"),
    octave: number(text(pitchNode, "octave"), 4),
    alter: number(text(pitchNode, "alter"), 0),
  };
}

function parseBeamGroup(noteNode) {
  const beam = firstChild(noteNode, "beam");
  if (!beam) {
    return null;
  }
  return `${beam.getAttribute("number") || "1"}:${beam.textContent.trim()}`;
}

function parseDirectionMarkings({ directionNode, divisions, measureCursorBeat, measureIndex, partId, startIndex }) {
  const offsetBeats = number(text(firstChild(directionNode, "offset")), 0) / divisions;
  const onsetBeats = measureCursorBeat + offsetBeats;
  const staffNumber = number(text(directionNode, "staff"), 1);
  const placement = directionNode.getAttribute("placement") || null;
  const directionId = directionNode.getAttribute("id");
  const markings = [];

  for (const directionType of Array.from(directionNode.getElementsByTagName("direction-type"))) {
    const wordsNode = firstChild(directionType, "words");
    if (wordsNode) {
      markings.push(createMarking({
        id: directionId,
        partId,
        measureIndex,
        index: startIndex + markings.length,
        type: "words",
        text: text(wordsNode),
        onsetBeats,
        staffNumber,
        placement,
      }));
    }

    const dynamicsNode = firstChild(directionType, "dynamics");
    if (dynamicsNode) {
      const dynamic = firstElementChild(dynamicsNode)?.tagName || text(dynamicsNode);
      if (dynamic) {
        markings.push(createMarking({
          id: directionId,
          partId,
          measureIndex,
          index: startIndex + markings.length,
          type: "dynamic",
          text: dynamic,
          onsetBeats,
          staffNumber,
          placement,
        }));
      }
    }

    const wedgeNode = firstChild(directionType, "wedge");
    const wedgeType = wedgeNode?.getAttribute("type");
    if (wedgeType && wedgeType !== "stop") {
      markings.push(createMarking({
        id: directionId,
        partId,
        measureIndex,
        index: startIndex + markings.length,
        type: "hairpin",
        text: wedgeType,
        onsetBeats,
        staffNumber,
        placement,
      }));
    }
  }

  return markings;
}

function createMarking({ id, partId, measureIndex, index, type, text, onsetBeats, staffNumber, placement }) {
  return {
    id: id || `${partId}-m${measureIndex + 1}-mark-${index + 1}`,
    type,
    text,
    onsetBeats,
    onsetSeconds: 0,
    staffNumber,
    placement,
  };
}

function tieIdentity({ noteNode, voice, staffNumber }) {
  const pitch = parsePitch(noteNode);
  if (!pitch) {
    return `${staffNumber}:${voice}:rest`;
  }
  return `${staffNumber}:${voice}:${pitch.step}:${pitch.alter}:${pitch.octave}`;
}

function durationBeatsFromNode(node, divisions) {
  return number(text(node, "duration"), 0) / divisions;
}

function elementChildren(node) {
  if (Array.isArray(node?.children)) {
    return node.children;
  }

  return Array.from(node?.childNodes || []).filter((child) => child.nodeType === 1);
}

function collectTempoMap(parts) {
  const events = parts.flatMap((part) => part.tempoEvents).sort((a, b) => a.beatOffset - b.beatOffset);
  const unique = [];
  for (const event of events.length ? events : [{ beatOffset: 0, bpm: 120 }]) {
    if (!unique.some((item) => item.beatOffset === event.beatOffset)) {
      unique.push(event);
    }
  }
  return unique[0]?.beatOffset === 0 ? unique : [{ beatOffset: 0, bpm: 120 }, ...unique];
}

function applySeconds(parts, tempoMap) {
  for (const part of parts) {
    delete part.tempoEvents;
    for (const marking of part.markings) {
      marking.onsetSeconds = beatsToSeconds(marking.onsetBeats, tempoMap);
    }
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        for (const note of measure.notes) {
          note.onsetSeconds = beatsToSeconds(note.onsetBeats, tempoMap);
          note.durationSeconds = beatsToSeconds(note.onsetBeats + note.durationBeats, tempoMap) - note.onsetSeconds;
          note.revealOnsetSeconds = beatsToSeconds(note.revealOnsetBeats ?? note.onsetBeats, tempoMap);
        }
      }
    }
  }
}

function beatsToSeconds(targetBeat, tempoMap) {
  let seconds = 0;
  for (let index = 0; index < tempoMap.length; index += 1) {
    const current = tempoMap[index];
    const next = tempoMap[index + 1];
    const segmentEndBeat = next ? Math.min(next.beatOffset, targetBeat) : targetBeat;
    if (segmentEndBeat > current.beatOffset) {
      seconds += (segmentEndBeat - current.beatOffset) * (60 / current.bpm);
    }
    if (next && targetBeat <= next.beatOffset) {
      break;
    }
  }
  return seconds;
}

function noteTypeFromDuration(durationBeats) {
  if (durationBeats >= 4) return "whole";
  if (durationBeats >= 2) return "half";
  if (durationBeats <= 0.5) return "eighth";
  return "quarter";
}

function firstChild(node, tagName) {
  return node?.getElementsByTagName(tagName)[0] || null;
}

function firstElementChild(node) {
  return elementChildren(node)[0] || null;
}

function text(node, tagName) {
  if (!node) {
    return "";
  }
  const target = tagName ? firstChild(node, tagName) : node;
  return target?.textContent?.trim() || "";
}

function number(value, fallback) {
  if (String(value).trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveNumber(value, fallback) {
  const parsed = number(value, fallback);
  return parsed > 0 ? parsed : fallback;
}

function parseXmlWithXmldom(xmlText) {
  const parser = new SimpleXmlParser(xmlText);
  return parser.parse();
}

class SimpleXmlParser {
  constructor(xmlText) {
    this.xmlText = xmlText.replace(/<\?xml[^>]*>/g, "").replace(/<!DOCTYPE[^>]*>/g, "");
  }

  parse() {
    const root = new SimpleXmlNode("#document");
    const stack = [root];
    const tokens = this.xmlText.match(/<[^>]+>|[^<]+/g) || [];

    for (const token of tokens) {
      if (token.startsWith("<!--") || token.startsWith("</")) {
        if (token.startsWith("</")) stack.pop();
        continue;
      }
      if (token.startsWith("<")) {
        const selfClosing = token.endsWith("/>");
        const content = token.slice(1, selfClosing ? -2 : -1).trim();
        const [name, ...attributeParts] = content.split(/\s+/);
        const node = new SimpleXmlNode(name);
        node.attributes = parseAttributes(attributeParts.join(" "));
        stack.at(-1).children.push(node);
        if (!selfClosing) stack.push(node);
      } else {
        stack.at(-1).ownText += token;
      }
    }
    return root;
  }
}

class SimpleXmlNode {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.ownText = "";
  }

  get textContent() {
    return `${this.ownText}${this.children.map((child) => child.textContent).join("")}`;
  }

  getElementsByTagName(tagName) {
    return this.children.flatMap((child) => [
      ...(child.tagName === tagName ? [child] : []),
      ...child.getElementsByTagName(tagName),
    ]);
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }
}

function parseAttributes(source) {
  const attributes = new Map();
  for (const match of source.matchAll(/([\w:-]+)="([^"]*)"/g)) {
    attributes.set(match[1], match[2]);
  }
  return attributes;
}
