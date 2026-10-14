# Ideas Need Room — 30″ spot for Design Offices Munich Campus Königsplatz

A 30-second animated commercial made **only with code**. No footage, images or audio samples.
Every frame is drawn on an HTML `<canvas>`, and the music and sound effects are synthesised
live with the Web Audio API.

**Target audience:** international communication agencies.
**Rendered spot:** [`dist/design-offices-koenigsplatz-30s.mp4`](dist/design-offices-koenigsplatz-30s.mp4) (1920×1080, 30 fps, H.264 + AAC, −14 LUFS)

## Storyboard

| Time | Scene | Sound |
|---|---|---|
| 0–4 s | Typewriter: **“Big ideas / need room.”** A box labelled *Meeting room 3B · 6 m² · 14 people* squeezes the words until they… | Warm pad, heartbeat kick, key clicks, a tension drone, riser + snare roll |
| 4 s | **…burst.** Shockwave, sparks, flash. | Impact, crash, the beat drops |
| 4–8 s | An isometric campus grows out of the ground: buildings **45 a–d** around a courtyard, lights switch on, trees grow, people walk. Counter runs up to **18,000 m²**. | Each building lands on the beat; mechanical counter ticks |
| 8–12 s | The **Propyläen at Königsplatz** are drawn in golden light. Pins show the neighbours: Glyptothek, Lenbachhaus, Pinakotheken, LMU. *Maxvorstadt · Kunstareal · U2 at the door.* Camera dives through the gate. | Pen scribble, glassy bells, riser |
| 12–17 s | Kinetic montage, one word per beat: **PITCH. BRAINSTORM. WORKSHOP. LAUNCH. CELEBRATE.** Each has its own motif (spotlight + chart, sticky notes, workshop table, launch streaks, confetti). | Synth stabs, whooshes, 16th hats, clap |
| 17–18 s | Strobe: *Coworking. Offices. Meeting rooms. Event spaces.* | Swishes on 16ths |
| 18–22 s | **“Global teams. One address.”** A dotted globe (real coastlines) turns to Munich while flight arcs arrive from London, New York, Paris, Dubai, São Paulo, Stockholm, Mumbai and Madrid. *U2 Königsplatz, right at the door · Munich Hbf, 0.7 km.* | Each arrival pings a note of a rising arpeggio |
| 22–26 s | Rooftop at dusk over the Munich skyline (Frauenkirche, Theatinerkirche, Olympiaturm). String lights come on, two glasses clink. *“Rooftop. Courtyard. Café. From first draft to final toast.”* | Breakdown, light plinks, real-sounding glass clink, build |
| 26–30 s | End card: **Design Offices, Munich Campus Königsplatz**, Brienner Str. 45 a–d · 80333 München · designoffices.de. *“Big ideas need room. We have 18,000 m² of it.”* | Final hit, Cmaj9 chord, bell sparkle, fade |

The music is a 120 BPM track (exactly 15 bars) in A minor, resolving to C major: Am–F–C–G.
Everything is generated in code: kick, clap, hats, sidechained bass, detuned-saw pads, plucked
arpeggios through a dotted-eighth delay, and a convolution reverb whose impulse response is also
generated in code.

## Files

| File | What it is |
|---|---|
| `spot.js` | The whole spot: the scenes, the timeline and the soundtrack. Every frame is a pure function of time `t`. |
| `index.html` | Interactive player with play/pause, scrubbing, fullscreen and the space bar. |
| `render/render.mjs` | Headless renderer: draws frames at exact timestamps, renders the audio offline and muxes with ffmpeg |
| `assets/fonts/` | Inter, Instrument Serif, JetBrains Mono (SIL Open Font License) |
| `dist/` | Rendered MP4 + poster frame |

## Run it

```bash
npm install                 # installs Playwright (uses the system Chromium)
npm run serve               # → http://localhost:8080 and press Play (sound on)

npm run render                          # full render → out/design-offices-koenigsplatz-30s.mp4
npm run render -- --stills 4.2,13.5     # single frames → out/still-*.png
npm run render -- --audio-only          # re-render only the soundtrack and remux it
```

The renderer needs `ffmpeg` on the `PATH`. Because the timeline is deterministic, every render
comes out identical.

## Facts used

- Brienner Str. 45 a–d, 80333 München (Maxvorstadt), right at Königsplatz and the U2 station
- A creative campus of about 18,000 m²
- About 0.7 km from Munich Hauptbahnhof; Kunstareal museums and LMU nearby
- Coworking, offices, meeting rooms, event and conference spaces
- Rooftop terrace, courtyard, café

The building layout, skyline and globe are stylised illustrations, not surveyed plans.
