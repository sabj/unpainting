# src/paint/techniques

Painting techniques for specific features or surfaces. Most are off until a flag turns them on.

- Faces and skin: `face-planes.mjs` (`--faceplanes`), `lit-planes.mjs` (`--litplanes`) and `face-detail.mjs` (`--facedetail 1`).
- Dark masses: `dark-mass.mjs` and `dark-mass-shape.mjs` (`--darkmass`) paint black fur and other dark surfaces.
- Curly dog coats: `dog-paint.mjs` (`--dogpaint`) with `dog-locks.mjs`, `dog-ringlets.mjs`, `dog-scribble.mjs` and `dog-strands.mjs`.
- First washes that would look uniformly flat: `subject-local.mjs` (`--subjlocal`) and `subject-tint.mjs` (`--subjtint`).
- `shaped-marks.mjs`: flat-brush marks for broad surfaces, short texture marks and parallel sky sweeps, used to plan and paint strokes.
- [passages/](passages/README.md): passages, washes or groups of marks for one section of the picture (sea, sand, sky, trees, foliage, architecture, dog), run with `--passages`.

```sh
node --test src/paint/techniques/*.test.mjs src/paint/techniques/passages/*.test.mjs
```

[techniques.md](../../../docs/techniques.md) lists each module, its flag and which settings preset turns it on.
