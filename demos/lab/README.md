# Paint Lab

Paint by hand on simulated paper. **[Open it](https://sabj.github.io/unpainting/demos/lab/)**

<img src="../thumbs/lab-paint.webp" width="480" alt="A heart painted wet in rose, then a blue arrow glazed over it and yellow feathers run into the wet shaft">

| Dry brush | Flat wash | Glazing | Wet in wet |
| --- | --- | --- | --- |
| <img src="thumbnails/dry-brush.webp" width="180" alt="Dry brush"> | <img src="thumbnails/wash.webp" width="180" alt="Flat wash"> | <img src="thumbnails/glaze.webp" width="180" alt="Glazing"> | <img src="thumbnails/wet-in-wet.webp" width="180" alt="Wet in wet"> |
| **Backrun** | **Dip pen** | **Ink then wash** | **Wash then ink** |
| <img src="thumbnails/backrun.webp" width="180" alt="Backrun"> | <img src="thumbnails/pen.webp" width="180" alt="Dip pen"> | <img src="thumbnails/ink-wash.webp" width="180" alt="Ink then wash"> | <img src="thumbnails/wash-ink.webp" width="180" alt="Wash then ink"> |

See an example replays the painter's own runs, stroke by stroke.

Code: `lab.js` is the page, `worker.js` the simulation. `media/` copies the painter's `src/media/`; edit the source, then run `node tools/lab/sync-site-media.mjs`.
