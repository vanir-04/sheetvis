import test from "node:test";
import assert from "node:assert/strict";
import { ensureMusicXmlNoteIds, parseMusicXml } from "../src/parser/musicxml.js";

const simpleScore = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>Parser Study</work-title></work>
  <identification><creator type="composer">A. Tester</creator></identification>
  <part-list>
    <score-part id="P1"><part-name>Flute</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <key><fifths>-1</fifths></key>
        <time><beats>3</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction><sound tempo="120"/></direction>
      <note id="n1"><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type></note>
      <note id="n2"><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>eighth</type><beam number="1">begin</beam></note>
      <note id="n3"><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><type>eighth</type><beam number="1">end</beam></note>
      <note id="n4"><rest/><duration>2</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;

test("parseMusicXml normalizes title composer parts tempo and note timing", () => {
  const score = parseMusicXml(simpleScore);
  const notes = score.parts[0].staves[0].measures[0].notes;

  assert.equal(score.title, "Parser Study");
  assert.equal(score.composer, "A. Tester");
  assert.equal(score.parts[0].name, "Flute");
  assert.deepEqual(score.tempoMap, [{ beatOffset: 0, bpm: 120 }]);
  assert.equal(score.totalBeats, 3);
  assert.equal(score.totalSeconds, 1.5);
  assert.equal(notes[0].id, "n1");
  assert.equal(notes[0].durationBeats, 1);
  assert.equal(notes[1].durationBeats, 0.5);
  assert.equal(notes[1].onsetBeats, 1);
  assert.equal(notes[1].onsetSeconds, 0.5);
  assert.equal(notes[3].isRest, true);
});

test("parseMusicXml gives chord notes the previous onset", () => {
  const chordScore = simpleScore.replace(
    '<note id="n2"><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>eighth</type><beam number="1">begin</beam></note>',
    '<note id="n2"><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>eighth</type></note>',
  );
  const score = parseMusicXml(chordScore);
  const notes = score.parts[0].staves[0].measures[0].notes;

  assert.equal(notes[1].isChord, true);
  assert.equal(notes[1].onsetBeats, notes[0].onsetBeats);
});

test("parseMusicXml gives tie-stop notes the reveal time of the tie start", () => {
  const tiedScore = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note id="tie-start">
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>2</duration>
        <voice>1</voice>
        <tie type="start"/>
        <type>half</type>
      </note>
      <note id="tie-stop">
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>2</duration>
        <voice>1</voice>
        <tie type="stop"/>
        <type>half</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

  const score = parseMusicXml(tiedScore);
  const notes = score.parts[0].staves[0].measures[0].notes;

  assert.equal(notes[1].onsetBeats, 2);
  assert.equal(notes[1].revealOnsetBeats, 0);
  assert.equal(notes[1].revealOnsetSeconds, 0);
});

test("parseMusicXml keeps tie chains together across multiple notes", () => {
  const tiedScore = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note id="n1"><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><tie type="start"/></note>
      <note id="n2"><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><tie type="stop"/><tie type="start"/></note>
      <note id="n3"><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><tie type="stop"/></note>
    </measure>
  </part>
</score-partwise>`;

  const score = parseMusicXml(tiedScore);
  const notes = score.parts[0].staves[0].measures[0].notes;

  assert.equal(notes[1].revealOnsetBeats, 0);
  assert.equal(notes[2].revealOnsetBeats, 0);
});

test("parseMusicXml honors backup and forward when timing multiple staves", () => {
  const pianoScore = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
      </attributes>
      <note id="right-1"><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff><type>quarter</type></note>
      <backup><duration>4</duration></backup>
      <note id="left-1"><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>5</voice><staff>2</staff><type>quarter</type></note>
      <forward><duration>8</duration></forward>
      <note id="right-4"><pitch><step>G</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;

  const score = parseMusicXml(pianoScore);
  const notes = score.parts[0].staves[0].measures[0].notes;

  assert.equal(notes.find((note) => note.id === "right-1").onsetBeats, 0);
  assert.equal(notes.find((note) => note.id === "left-1").onsetBeats, 0);
  assert.equal(notes.find((note) => note.id === "right-4").onsetBeats, 3);
  assert.equal(score.totalBeats, 4);
  assert.equal(score.totalSeconds, 2);
});

test("parseMusicXml keeps oversized forward and backup positioning from delaying a continuing voice", () => {
  const scoreXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note id="n1"><pitch><step>F</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff><type>eighth</type><beam number="1">begin</beam></note>
      <forward><duration>30</duration></forward>
      <direction><direction-type><octave-shift type="stop" size="8"/></direction-type></direction>
      <note id="n2"><pitch><step>E</step><octave>6</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff><type>16th</type><beam number="1">continue</beam></note>
      <backup><duration>30</duration></backup>
      <note id="n3"><pitch><step>G</step><octave>6</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff><type>16th</type><beam number="1">end</beam></note>
    </measure>
  </part>
</score-partwise>`;

  const score = parseMusicXml(scoreXml);
  const notes = score.parts[0].staves[0].measures[0].notes;

  assert.equal(notes.find((note) => note.id === "n1").onsetBeats, 0);
  assert.equal(notes.find((note) => note.id === "n2").onsetBeats, 0.5);
  assert.equal(notes.find((note) => note.id === "n3").onsetBeats, 0.75);
  assert.equal(score.totalBeats, 4);
});

test("parseMusicXml keeps previous divisions when later attributes omit divisions", () => {
  const scoreXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Violin</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <time><beats>2</beats><beat-type>4</beat-type></time>
      </attributes>
      <note id="n1"><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>
      <note id="n2"><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>
    </measure>
    <measure number="2">
      <attributes>
        <key><fifths>-1</fifths></key>
      </attributes>
      <note id="n3"><rest/><duration>4</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;

  const score = parseMusicXml(scoreXml);
  const secondMeasure = score.parts[0].staves[0].measures[1];
  const note = secondMeasure.notes[0];

  assert.equal(note.durationBeats, 2);
  assert.equal(secondMeasure.durationBeats, 2);
  assert.equal(score.totalBeats, 4);
  assert.equal(score.totalSeconds, 2);
});

test("parseMusicXml collects direction markings with beat timing", () => {
  const scoreXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Violin</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <direction id="mark-word" placement="above">
        <direction-type><words>pizz.</words></direction-type>
      </direction>
      <note id="n1"><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>
      <direction id="mark-dynamic" placement="below">
        <direction-type><dynamics><mf/></dynamics></direction-type>
        <offset>1</offset>
      </direction>
      <direction id="mark-hairpin" placement="below">
        <direction-type><wedge type="crescendo" number="1"/></direction-type>
      </direction>
    </measure>
  </part>
</score-partwise>`;

  const score = parseMusicXml(scoreXml);
  const markings = score.parts[0].markings;

  assert.deepEqual(markings.map((marking) => ({
    id: marking.id,
    type: marking.type,
    text: marking.text,
    onsetBeats: marking.onsetBeats,
    onsetSeconds: marking.onsetSeconds,
    staffNumber: marking.staffNumber,
  })), [
    {
      id: "mark-word",
      type: "words",
      text: "pizz.",
      onsetBeats: 0,
      onsetSeconds: 0,
      staffNumber: 1,
    },
    {
      id: "mark-dynamic",
      type: "dynamic",
      text: "mf",
      onsetBeats: 1.5,
      onsetSeconds: 0.75,
      staffNumber: 1,
    },
    {
      id: "mark-hairpin",
      type: "hairpin",
      text: "crescendo",
      onsetBeats: 1,
      onsetSeconds: 0.5,
      staffNumber: 1,
    },
  ]);
});

test("ensureMusicXmlNoteIds injects stable ids into notes that need them", () => {
  const prepared = ensureMusicXmlNoteIds("<score-partwise><part><measure><note><rest/></note><note id=\"kept\"><rest/></note></measure></part></score-partwise>");

  assert.match(prepared, /<note id="sheetvis-note-1">/);
  assert.match(prepared, /<note id="kept">/);
});
