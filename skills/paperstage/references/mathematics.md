# Mathematics and notation

## Representation first

For PPTX, prefer native equations (such as OMML supported by the host) when editing is required. In TeX-capable environments, retain formula source and use a reliable math engine. Vector equations with TeX source may be an acceptable disclosed fallback if native editing is not required and the host permits it. Beamer/PDF is an alternative only when the user accepts that output.

Plain native text is suitable for a simple label such as N = 6. It is not a substitute for fractions, matrices, aligned proofs, nested indices, accents or integral limits. Do not assemble parentheses from separate text boxes, use spaces as matrix columns, or fake indices using arbitrary Unicode characters. Do not call a vector/raster formula a native editable equation or rasterize a whole slide to conceal limitations.

Probe the actual export path with a fraction, a 2-by-2 matrix, an accented variable, and an aligned equality with a remainder. Reopen and render it. Change route before producing the full deck if math formatting is lost. A math font alone does not establish equation support.

## LaTeX source and slide integration

For formula-rich work, author and retain TeX source rather than constructing glyph positions. Use a host-supported TeX-to-native route when native editing is required. Otherwise, a disclosed MathJax/LaTeX-to-SVG route can preserve typesetting in PPTX. This is guidance for host tools, not a claim that the bundled JSON exporter renders TeX.

Use real `\frac`, `pmatrix` and `aligned` constructs. This generic capability probe uses no private research material:

```tex
\begin{aligned}
\widehat A &= \frac{1}{c}\begin{pmatrix}a&b\\b&d\end{pmatrix},\qquad c>0\\[6pt]
F(t) &= F(0)+tF'(0)+O(t^2).
\end{aligned}
```

With a vector route, embed self-contained SVG glyph paths or definitions, not links to external fonts or glyph files. Preserve viewBox and aspect ratio. Retain TeX per equation in a sidecar or notes and provide meaningful alternate text. Verify the exported PPTX embeds vector assets; a clear preview alone does not establish SVG preservation. Some viewers use a raster fallback. Disclose native editability separately from sharpness.

Use an available trusted local math engine. Install packages only when necessary in the appropriate project dependency area, not the host's bundled runtime. Avoid machine-specific paths in reusable guidance. Do not send unpublished equations to an external rendering service without authorization.

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
