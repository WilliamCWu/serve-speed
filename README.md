# Serve Speed

Private on-device tennis serve speed analysis with audio-assisted shot selection and manual measurement for cropped/portrait videos. Files and analysis remain in browser memory. The app has no video upload endpoint or durable results storage.

## Current workflow

1. Choose a real-time phone clip up to 60 seconds / 250 MB. MP4/MOV frame presentation timestamps are read from sample timing, composition offsets, and edit lists. H.264 and HEVC container timing, 24/30/60 fps, and variable-rate originals are supported when the browser can decode them. Frame stepping and manual flight time use actual timestamps instead of an assumed 30/60 fps grid. Other containers use a constant-rate playback fallback; variable timing without a complete timestamp table is rejected with a specific explanation.
2. Audio high-pass transients propose separate shot candidates. They are suggestions, not confirmed racket-contact classifications. Remove false suggestions or add missed shots.
3. Select a shot, use frame stepping or slow playback, and confirm visual contact and first bounce. Audio timestamps are never used directly for speed calculation.
4. Choose a measurement method:
   - **Court diagram:** place the server ground position and first bounce on the regulation court plan. This is a rough estimate requiring no automatic court recognition. Coordinate fields support keyboard input.
   - **Visible court points:** click four or more known court markings in a single paused frame. A normalized least-squares homography maps ground-plane positions; the entire court does not need to be visible. Points must span at least two lines. Mark the ground beneath contact and the first bounce in their respective video frames. The camera must stay still during that flight.
5. Adjust contact height and per-marker position tolerance. The app estimates straight-line contact-to-bounce distance divided by visual flight time. For variable-rate clips, timing sensitivity uses the local frame spacing at contact and bounce. Results update as fields change. It reports average flight speed, not initial/radar speed, with a sensitivity band rather than a statistical confidence interval.

Each shot has independent frame times, calibration, positions, and result. Replay stops after that shot's bounce. Multiple shots share the same source video without copying or uploading it. Existing model-free automatic court/ball tracking remains available for constant-rate 30/60 fps clips. Variable-rate and higher-rate originals use manual measurement to avoid the automatic pipeline assuming uniform frame times.

## Validation

- `npm test`: legacy automatic geometry/tracking tests plus partial-court calibration, metric projection, invalid-input rejection, and timing/placement sensitivity tests, plus HEVC metadata, variable frame timelines, B-frame composition order, signed offsets, edit-list trims, speed-changing edit rejection, and missed playback callbacks.
- `TEST_AUDIO=<decoded-mono-f32> TEST_AUDIO_RATE=22050 node tests/manual.test.mjs`: optional uploaded-clip audio fixture test. The provided 720 × 1280, 30 fps, 21.13-second `1.mp4` produces three sharp-contact suggestions around 3.97, 11.36, and 18.06 seconds. The same count/times were verified with 44.1 kHz decoded audio.
- `TEST_VIDEO=<original-mp4> TEST_AUDIO=<decoded-mono-f32> node tests/workflow.test.mjs`: exercises the actual UI event handlers with DOM/media doubles, real uploaded container metadata and real decoded audio. Covers reaching the editor despite cropped court footage; independent shots; frame confirmation; keyboard coordinates; unit conversion; manual partial-court anchors; video position marking; and segment replay.

The private footage/audio are not stored in this repository. DOM/media doubles do not constitute end-to-end browser testing. Synthetic geometry tests do not establish accuracy on real footage. No radar comparison has been performed.

## Measurement limitations

The distance is a straight chord with an entered contact height, not the ball's exact curved trajectory. The sensitivity range varies each ground position by the stated tolerance, flight time by one frame of local timing uncertainty, and contact height by 0.4 m. It does not capture all camera, lens, calibration, or annotation errors.

Four anchors can fit perfectly even when mislabeled, so fit residual is not an accuracy metric. Use more well-separated points and check the overlay. Extrapolation outside marked areas is less reliable. Calibration assumes the camera angle stays fixed between contact and bounce; otherwise use the diagram method. Audio can be confused by practice bounces, other courts, voices, echoes, and unequal impact levels. Manual confirmation is required.

## Source

Static assets are in `dist`. There are no production dependencies, build step, backend, or API keys. `engine.js` and `worker.js` retain the automatic pipeline, `manual.js` contains calibration/audio/measurement math, `automatic.js` orchestrates optional tracking, and `app.js` implements the upload and per-shot editing flow.


## Run locally

Use Node.js 24 or newer for the tests:

```sh
npm test
python3 -m http.server 8000 --directory dist
```

Open http://localhost:8000. No dependency installation is needed. Serve the app over HTTP or HTTPS so browser modules and workers work correctly.

## GitHub Pages deployment

The intended project URL is https://williamcwu.github.io/serve-speed/ once Pages is enabled and the first deployment succeeds.

1. Create `WilliamCWu/serve-speed` and commit this source to `main`.
2. In repository **Settings → Pages**, select **GitHub Actions** as the publishing source.
3. The included **Test and deploy to GitHub Pages** workflow tests the code, checks JavaScript syntax, and publishes only `dist`. It runs on pushes to `main` and can also be started manually from **Actions**. Pull requests run validation without deploying.

All asset and worker paths are relative so the app works under a repository subdirectory. Uploaded video files stay on the user's device; the deployed app does not require a server. Private test footage and original hosting metadata are excluded from the export.


## iPhone originals and compatible exports

Native iOS apps can ask Photos for a compatible asset representation. A browser file input does not expose the native PHPicker representation setting, and the representation provided by Photos may vary. This app preserves original MP4/MOV frame timestamps instead of making an automatic 30 fps copy. Re-encoding can discard frames and introduces additional mobile processing and codec requirements.

Use Safari on the iPhone for HEVC/HDR originals. If the browser cannot decode a codec, the app explains the decoding failure and suggests an H.264 MP4 export. No cloud conversion service, server upload, or new dependency is introduced. A selected 60 fps camera setting does not prove every recorded interval is 1/60 second: Auto FPS can reduce the capture rate in low light. Keep clips at real-life playback speed; deliberately slowed exports cannot establish physical speed from playback time. Edit lists with non-unit media rates are rejected. Speed changes baked into frames cannot be inferred reliably.

Research: [Apple Photos representation modes](https://developer.apple.com/documentation/photosui/phpickerconfiguration-swift.struct/assetrepresentationmode), [Apple Auto FPS](https://support.apple.com/en-ca/guide/iphone/iphc1827d32f/ios), [video frame callback metadata](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback).

Validation includes both supplied H.264 clips and a generated HEVC MOV alternating between 60 and 30 fps. Every parsed HEVC presentation timestamp was compared with ffprobe. The original phone representation that failed selection has not been supplied unconverted, so compatibility with that exact original still needs an on-device check.
