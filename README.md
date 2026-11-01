# Waverider Web

A browser demo of [Waverider](https://github.com/KawikaMiller/Waverider), the audio visualizer for Windows.
It reacts to whatever audio you give it, with no install:

- **System audio** (Chrome or Edge on Windows): whatever your PC is playing, from Spotify, YouTube, a game or anything else. Pick *Entire screen* and tick *Also share system audio* when the browser asks. Only the sound is used; the screen video is discarded immediately.
- **Microphone**: music playing in the room.
- **Audio file**: choose one or drop it onto the stage.
- **Demo track**: a short loop synthesized in the browser, so there is something to see with one click and no permissions.

Eight visualizers (Bars, Waveform, Radial, Spectrogram, Particles, Tunnel, Plasma, Starfield), four built-in themes and a
Shuffle Colors button, all ported from the desktop app.

This is a demo. The Windows app adds per-app audio capture, now-playing with album art and transport controls, the
spinning vinyl / CD disc, mini players, custom visualizer and theme editors, and optional Spotify sign-in.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173
npm run lint     # type-check
npm run build    # production build into dist/
```

Browsers only start audio after a click, which is why nothing plays until a source is chosen.

## How it works

| Piece | Where |
|---|---|
| Audio graph and sources | `src/audio/engine.ts` |
| FFT bands, bass / mid / treble, beat detection (port of the app's `FftAnalyzer`) | `src/audio/analyzer.ts` |
| Synthesized demo loop | `src/audio/demo.ts` |
| Visualizers (Canvas 2D ports of the app's SkiaSharp ones) | `src/viz/` |
| Themes and the random palette generator | `src/theme/theme.ts` |

Captured system audio and the microphone are analyzed but deliberately not routed to the speakers, so you never hear them twice.
Nothing is uploaded; all analysis happens in the page.

## Deploy

Pull requests into `develop` or `main` run type-check and build. A push to `main` builds and publishes to GitHub Pages
(waverider.kawikamiller.com). Pages must be set to the **GitHub Actions** source, with `main` allowed to deploy in the
`github-pages` environment.
