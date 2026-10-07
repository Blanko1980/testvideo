# Schloss Drehna — "Here." (30″ spot)

A 30-second advertisement for [Châteauform' Schloss Drehna](https://www.chateauform.com/de/haus/schloss-drehna/), aimed at **international communication agencies**.

All of it is code: no footage, photos or stock audio. The film is one deterministic function, `Spot.render(ctx, t)`, drawn on a 1920×1080 canvas. The score and sound design are synthesised from scratch with the Web Audio API, locked to a 120 BPM grid shared with the picture.

▶ **Watch:** [`dist/schloss-drehna-spot.mp4`](dist/schloss-drehna-spot.mp4) (1080p60, AAC stereo)
▶ **Play live in a browser:** open `index.html` (serve the folder, e.g. `npx serve .`), click play, sound on.

## Concept

Agencies live in the noise: pings, decks, double-booked rooms. The spot asks one question, *"Where do big ideas breathe?"*, and answers with a single word, **"Here."**

Then a day passes at the castle. It is **drawn** as a blueprint, **built** in colour, **grown** into its Lenné park, **painted** with street-art neon at dusk and **lit** for the night. That arc mirrors the house itself: Renaissance walls with a street-art interior.

## Storyboard

| Time | Act | Picture | Sound |
|---|---|---|---|
| 0–6″ | **The noise** | Notification cards pile up (quarter → eighth → sixteenth notes), the clock races 09:00 → 23:59. Kinetic type: *DEADLINES. DECKS. DOUBLE-BOOKED ROOMS.* → *WHERE DO BIG IDEAS BREATHE?* Everything collapses into one golden point, with an RGB glitch. | Pulsing D bass, accelerating ticks. Each card type has its own ping (mail swoosh, calendar ding, chat pop, client knock, video bleep). Riser and glitch stutter, then a reverse swell into a hard gap of silence. |
| 6–8″ | **Here.** | The dot irises open onto a dawn landscape. | Sub boom, Fmaj9 bell bloom, birdsong, water. |
| 8–14″ | **The castle** | Schloss Fürstlich Drehna draws itself as a golden blueprint (scroll gable, *welsche Haube* tower, moat bridge), then fills with colour and reflects in the moat. *A Renaissance castle built for big ideas.* | Pads Bbmaj7 → F/A → Gm7 → C, FM-bell arpeggios, pen-on-paper scribble, sparkle on completion. |
| 14–18″ | **The park** | Fractal trees grow, Lenné tree clumps pop up, the sun goes golden. *Think outside the meeting room.* Counters: **53** bedrooms · **100** participants · **55 min** to BER & Dresden airports. | The groove creeps in, marimba pops, counter ticks, snare roll and riser, then a 1/8-beat gap. |
| 18–20″ | **Street-art soul** | Drop: projection-mapped neon on the façade, paint splats, a spray-painted *Street-art soul.* under *Renaissance walls.* | Four-on-the-floor kick, side-chained stabs, synth hook, splats, spray-can rattle and hiss. |
| 20–24″ | **All under one castle roof** | Beat-cut montage, one word per beat: BRAINSTORM · PITCH · SWIM · SAUNA · KARAOKE · RIDE · FEAST · REPEAT. | Whoosh per wipe, then a tape-rewind into… |
| 24–30″ | **End card** | The REPEAT loop opens into the night castle: lit windows, moon, fireflies. *Your next big idea deserves a castle.* **SCHLOSS DREHNA** by Châteauform' · 53 rooms · up to 100 participants · 55 min from Berlin & Dresden airports · **Book your creative retreat → chateauform.com** | Boom, Bbmaj9 → F/C → Fmaj9 resolution, bell shimmer on the call to action, fade. |

## Files

| File | What it is |
|---|---|
| `spot.js` | The animation engine: camera, day/night lighting, procedural castle, water reflection, fractal trees, kinetic typography, glitch and film-grain post. |
| `audio.js` | The synthesiser and score: kick, clap, hats, bass, pads, FM bells, lead, plus all the sound design (pings, riser, booms, spray can, rewind…). Renders offline, so it's deterministic. |
| `index.html` | Browser player with play/pause, scrubbing and WAV download. |
| `render.mjs` | Frame-accurate exporter. Renders each frame in headless Chromium, bounces the soundtrack, and muxes both with ffmpeg. |
| `fonts/` | Playfair Display, Inter (SIL OFL 1.1) and Permanent Marker (Apache 2.0), from Google Fonts. |

## Re-render

```bash
# requires Node 18+, Playwright (Chromium) and ffmpeg
node render.mjs --fps 60 --crf 21        # → dist/schloss-drehna-spot.mp4 + dist/schloss-drehna-soundtrack.wav
node render.mjs --stills 3.5,12,25       # → PNG stills
```

Facts used in the spot (53 bedrooms, up to 100 participants, Lenné park, Renaissance castle between Berlin and Dresden, 55 min from the BER and Dresden airports, interiors from Modernism to street art) come from Châteauform's public listing for the house. Please verify them before the spot goes on air.
