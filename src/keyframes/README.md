# src/keyframes

Helpers for comparing simulated paper with keyframes, reference images for selected points in a sequence.

- `density.mjs`: the `gaussian` blur that many modules in [src/paint/methods](../paint/methods/) use.
- `blur-kernel.mjs`: the two blur passes of `gaussian`, split into row bands for the thread pool.
- `manifest.mjs`: `checkSequence` validates a keyframe sequence (a canvas, and frames with unique ids and positions from 0 to 1).

```sh
node --test src/keyframes/*.test.mjs
```
