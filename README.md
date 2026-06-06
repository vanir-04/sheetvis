# SheetVis

Minimal MusicXML visualizer for revealing engraved sheet music during playback.

## Demo

<video src="media/sheetvis-v1-demo.mp4" controls width="100%"></video>

Note: the v1 demo video was edited in post to fit the audio with the visual timings.

Song: "It's All Nothing Till It's Everything" by KNOWER.

## Current V1

- Loads `.xml` / `.musicxml` files.
- Renders notation with Verovio using the Leland font.
- Reveals notes, beams, ties, accidentals, tuplets, and ledger lines over time.
- Supports page view and scroll view.
- Exports WebM in-browser.

## Run Locally

```bash
npm install
npm run dev
```

## Test

```bash
npm test
npm run build
```

## FFmpeg Export

Uses `tools/ffmpeg/bin/ffmpeg.exe` when present, otherwise falls back to `ffmpeg` on PATH.

```bash
npm run export:ffmpeg -- --input samples/score.musicxml --output export/demo.mp4
```
