# Mathematical sample assets

These are newly typeset, authored teaching examples. They are not extracted from a user's reference slides.

- Formula source is the `latex` field of each equation block in `../lecture.json` and is also retained in exported slide notes.
- Each PNG has a matching SVG with self-contained glyph paths and local definitions. The bundled exporter uses the PNG; a capable host tool may use the SVG.
- Images were rendered with MathJax 3.2.2's TeX font at about 384 dpi for the intended slide size. MathJax is licensed under Apache-2.0; see `MathJax-LICENSE.txt` and https://github.com/mathjax/MathJax-src/tree/3.2.2.
- MathJax and the rasterizer are build-time tools only, not required dependencies for using the supplied example. New or revised formulas need an available typesetting tool; changing the TeX field alone does not regenerate an image.
- The prose and table remain native PowerPoint objects. Equations are images, not native Office equations.
