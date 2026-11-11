# src/paint/techniques

Painting techniques for specific features or surfaces. Most are off until a flag turns them on.

- Faces and skin: `face-planes.mjs` (`--faceplanes`), `lit-planes.mjs` (`--litplanes`) and `face-detail.mjs` (`--facedetail 1`).
- Dark masses: `dark-mass.mjs` and `dark-mass-shape.mjs` (`--darkmass`) paint black fur and other dark surfaces.
- Surface marks: `surface-marks.mjs`, named by an area plan's pass (`pass.marks`): short coat, curly coat, long hair and masonry, sized by the pass's brush, laid where the plan says the subject shows them.
- First washes that would look uniformly flat: `subject-local.mjs` (`--subjlocal`) and `subject-tint.mjs` (`--subjtint`).
- `shaped-marks.mjs`: flat-brush marks for broad surfaces, short texture marks and parallel sky sweeps, used to plan and paint strokes.
- [passages/](passages/README.md): passages, washes or groups of marks for one section of the picture (sea, sky, trees, foliage), run with `--passages`.

```sh
node --test src/paint/techniques/*.test.mjs src/paint/techniques/passages/*.test.mjs
```

[techniques.md](../../../docs/techniques.md) lists each module and its flag.
