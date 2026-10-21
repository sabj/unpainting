# demos

Browser demos, published to GitHub Pages by `tools/lab/build-site.mjs` and `.github/workflows/pages.yml`. The site keeps these paths:

- [Paint Lab](index.html), with its code in [lab/](lab/): paint by hand with the painter's paper, brushes, pen and pencil. Served at the site root.
- [layers/](layers/): a painting taken apart layer by layer. Served at `/layers/`.
- [fungi/](fungi/): coming. Mushroom watercolors made with Unpainting. Served at `/fungi/`.

Serve the folder locally with `python3 -m http.server 8000 --directory demos`.
