# Mathematics and notation

## Representation first

For PPTX, prefer native equations (such as OMML supported by the host) when editing is required. In TeX-capable environments, retain formula source and use a reliable math engine. Vector equations with TeX source may be an acceptable disclosed fallback if native editing is not required and the host permits it. Beamer/PDF is an alternative only when the user accepts that output.

Plain native text is suitable for a simple label such as N = 6. It is not a substitute for fractions, matrices, aligned proofs, nested indices, accents or integral limits. Do not assemble parentheses from separate text boxes, use spaces as matrix columns, or fake indices using arbitrary Unicode characters. Do not call a vector/raster formula a native editable equation or rasterize a whole slide to conceal limitations.

Probe the actual export path with a fraction, a 2-by-2 matrix, an accented variable, and an aligned equality with a remainder. Reopen and render it. Change route before producing the full deck if math formatting is lost. A math font alone does not establish equation support.

## LaTeX source and slide integration

For formula-rich work, author and retain TeX source rather than constructing glyph positions. The bundled helper converts a supported LaTeX subset to native OMML; use a capable host tool for constructs beyond that subset. When native editing is not required, a disclosed MathJax/LaTeX-to-SVG route may also preserve typesetting in PPTX.

Use real `\frac`, `pmatrix` and `aligned` constructs. This generic capability probe uses no private research material:

```tex
\begin{aligned}
\widehat A &= \frac{1}{c}\begin{pmatrix}a&b\\b&d\end{pmatrix},\qquad c>0\\[6pt]
F(t) &= F(0)+tF'(0)+O(t^2).
\end{aligned}
```

With a vector route, embed self-contained SVG glyph paths or definitions, not links to external fonts or glyph files. Preserve viewBox and aspect ratio. Retain TeX per equation in a sidecar or notes and provide meaningful alternate text. Verify the exported PPTX embeds vector assets; a clear preview alone does not establish SVG preservation. Some viewers use a raster fallback. Disclose native editability separately from sharpness.

Use an available trusted local math engine. Install packages only when necessary in the appropriate project dependency area, not the host's bundled runtime. Avoid machine-specific paths in reusable guidance. Do not send unpublished equations to an external rendering service without authorization.

## Bundled native equations

The local converter parses LaTeX with Temml and writes native OMML into the PPTX. `npm ci --prefix scripts` installs the dependency; no separate TeX distribution, browser or rendering service is needed. Common fractions, roots, indices, accents, sums, integrals, matrices and aligned equations are supported. The parser and converter enforce input limits and reject unsupported syntax or structures. This is not a complete LaTeX environment, and errors do not trigger a hidden image fallback.

In a compact lecture, omit `file` from an equation block:

```json
{
  "type": "equation",
  "latex": "\\bar X_n=\\frac{1}{n}\\sum_{i=1}^{n}X_i",
  "alt": "The sample mean is the sum of observations divided by sample size",
  "height": 0.82,
  "sourceIds": ["authored-example"]
}
```

Use a declared source ID and reserve enough vertical space for the full formula. The `latex` is retained in the block's speaker notes. A lecture's `mathFontFace` selects the default font for standalone, inline and table equations, defaulting to Cambria Math. An individual math run can override it with `fontFace`. Use another installed math family only after verifying it in the target application: STIX Two Math produced layout problems in the tested WPS installation. Fonts are not bundled or embedded.

The free-position contract also supports `type:"math"` elements and inline math inside text runs:

```json
[
  { "text": "Assume " },
  { "latex": "n>0" },
  { "text": " observations." }
]
```

Free-position inline math defaults to Cambria Math; lecture inline math inherits the lecture's `mathFontFace`. An individual run's optional `fontFace` overrides either default. Retain the JSON source, and add source TeX to notes when using inline runs or free-position math because those routes do not add it automatically. Full field definitions are in [tooling.md](tooling.md).

An equation block with `file` uses its supplied PNG/JPEG instead. Its LaTeX remains in notes, but that text does not regenerate or verify the image. Revise both when changing a formula. This compatibility mode is visibly sharp when given a good asset, but is not a native editable equation.

Native OMML output has been checked in **WPS on macOS** for display and double-click entry into the equation tools. **Microsoft PowerPoint has not been physically tested.** Check both display and editing in the intended target application before claiming compatibility. artifact-tool previews do not completely support inline native equations or aligned equation arrays (`eqArr`); a missing preview object is not sufficient evidence that the PPTX lacks the equation, and a successful package check does not prove good rendering.

## Symbol consistency

Privately record displayed symbol, source symbol, definition, domain, first-use slide, and semantic color. Record renamings. Distinguish scalars, vectors, matrices, indices and operators. Use upright named operators (tr, rank, diag, Re), consistent italic variables, proper minus signs, and a coherent mathematical family.

Match apparent sizes of prose and math. Inspect x-height, baseline, bracket extents and line spacing after rendering. Choose size for reading, not decorative impact.

## What must survive summarization

- Domains, dimensions, normalization, quantifiers and assumptions.
- Window/range restrictions, and pointwise versus uniform versus asymptotic limits.
- Multiplicity versus distinct-point counts; upper versus lower bounds.
- Equality versus approximation, parameter dependence and residual terms.
- Source results versus independently checked derivations.

For R = P + Q + E, do not omit E for a cleaner diagram. For a Hermitian block with eigenvalues +m and -m, distinguish its original spectrum from a pullback whose positive index may decrease. These illustrate preservation of hypotheses, not mandatory content in unrelated talks.

## Proof-aware disclosure

Plan the reveal: question and assumptions, construction, key bound, consequence. Keep used hypotheses visible and unchanged objects stable. Highlight the current substitution without recoloring all terms. Animation explains; it does not justify mathematics.

Check signs, coefficients, indices and arithmetic against the source. Verify a small test case when useful. A package/rendering check does not prove a theorem. Rehearse in the target application before claiming that equation reveals or transitions work there.
