# Serve Speed

Private on-device tennis serve speed analysis with audio-assisted shot selection and manual measurement for cropped/portrait videos. Files and analysis remain in browser memory. The app has no video upload endpoint or durable results storage.

## Current workflow

1. Choose an original constant-frame-rate 30/60 fps clip, up to 60 seconds / 250 MB. MP4/MOV sample-table metadata is used where available; WebM uses decoded frame timestamps as a fallback.
2. Audio high-pass transients propose separate shot candidates. They are suggestions, not confirmed racket-contact classifications. Remove false suggestions or add missed shots.
3. Select a shot, use frame stepping or slow playback, and confirm visual contact and first bounce. Audio timestamps are never used directly for speed calculation.
4. Choose a measurement method:
   - **Court diagram:** place the server ground position and first bounce on the regulation court plan. This is a rough estimate requiring no automatic court recognition. Coordinate fields support keyboard input.
   - **Visible court points:** click four or more known court markings in a single paused frame. A normalized least-squares homography maps ground-plane positions; the entire court does not need to be visible. Points must span at least two lines. Mark the ground beneath contact and the first bounce in their respective video frames. The camera must stay still during that flight.
5. Adjust contact height and per-marker position tolerance. The app estimates straight-line contact-to-bounce distance divided by visual flight time. Results update as fields change. It reports average flight speed, not initial/radar speed, with a sensitivity band rather than a statistical confidence interval.

Each shot has independent frame times, calibration, positions, and result. Replay stops after that shot's bounce. Multiple shots share the same source video without copying or uploading it. Existing model-free automatic court/ball tracking remains available as an optional action, with the manual workflow available when it fails.

## Validation

- `npm test`: legacy automatic geometry/tracking tests plus partial-court calibration, metric projection, invalid-input rejection, and timing/placement sensitivity tests.
- `TEST_AUDIO=<decoded-mono-f32> TEST_AUDIO_RATE=22050 node tests/manual.test.mjs`: optional uploaded-clip audio fixture test. The provided 720 × 1280, 30 fps, 21.13-second `1.mp4` produces three sharp-contact suggestions around 3.97, 11.36, and 18.06 seconds. The same count/times were verified with 44.1 kHz decoded audio.
- `TEST_VIDEO=<original-mp4> TEST_AUDIO=<decoded-mono-f32> node tests/workflow.test.mjs`: exercises the actual UI event handlers with DOM/media doubles, real uploaded container metadata and real decoded audio. Covers reaching the editor despite cropped court footage; independent shots; frame confirmation; keyboard coordinates; unit conversion; manual partial-court anchors; video position marking; and segment replay.

The private footage/audio are not stored in this repository. DOM/media doubles do not constitute end-to-end browser testing. Synthetic geometry tests do not establish accuracy on real footage. No radar comparison has been performed.

## Measurement limitations

The distance is a straight chord with an entered contact height, not the ball's exact curved trajectory. The sensitivity range varies each ground position by the stated tolerance, flight time by one frame, and contact height by 0.4 m. It does not capture all camera, lens, calibration, or annotation errors.

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
