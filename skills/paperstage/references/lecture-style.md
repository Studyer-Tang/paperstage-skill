# Compact mathematical lecture style

Use this visual baseline for formal academic slides when the user has not supplied a different style. The companion compiler is especially useful for lectures, course slides, and mathematical notes. An explicit reference always overrides the profile. It is a reusable academic layout, not an official institutional template or a copy of a source deck. Research talks retain their own narrative, evidence layouts and choice of authoring tool.

## Visual contract

The canvas is 16:9, white, with compact navy titles, black body text, genuine mathematical typesetting, and a quiet footer. The opening page can explain the chapter's question immediately; a giant cover, agenda, or divider is not mandatory.

The following measurements target a 13.333 × 7.5 inch slide. Scale geometry and type together when using another slide size; PDF font sizes cannot be copied directly from a differently sized page.

| Element | Target |
| --- | --- |
| Canvas | `#FFFFFF` |
| Title and semantic accent | `#1F4E79` |
| Body text | `#000000` |
| Footer | `#9E9E9E` |
| Optional callout body | `#EFF3F6` |
| Title | 30 pt, bold sans-serif, left edge about 0.25 in |
| Body | 23 pt; 21 pt for a deliberately compact layout |
| Reference/caption | Around 17 pt; retain readability at presentation size |
| Footer/page number | Around 12.7 pt |
| Body horizontal margins | About 0.46 in on each side |
| Title glyph top | About 0.28 in; account for the authoring font's ascender and box padding |
| Body region | Below the title, ending before the footer near 7.1 in |

Use portable Arial as the default text family. It approximates the source style's Computer Modern Sans character without requiring a TeX font installation; it is not an exact font match. For Chinese, specify an installed sans-serif such as Noto Sans CJK SC. Noto must be installed on each target that uses it. In the tested macOS WPS installation, Heiti SC resolved correctly while PingFang SC fell back to a serif family; see [chinese-typography.md](chinese-typography.md) for the tested names and mixed-script wrapping rules. Fonts are neither installed nor embedded by the exporter. Keep title and body families coherent, and render after a font change because width and line breaks change.

Use `mathFontFace` for standalone, inline and table equations, independently of the prose `fontFace`. Its default is Cambria Math. Use alternatives only after a target-viewer check; installed STIX Two Math produced layout problems in the tested WPS installation. Inline math runs may override the default with their own `fontFace`. An installed family name can still be resolved differently by office viewers, so confirm the rendered font, mathematical glyphs and baselines after any font change.

Keep a single-line title when reasonable; shorten its phrasing or allow a planned second line before reducing type. On a light page, balance the content vertically in the usable body region. On a dense theorem/proof page, start near the top of that region. Empty space is acceptable when the concept is complete; filling it with decoration is not necessary.

Use navy triangular bullets and navy list numbers with black body text. Align wrapped lines with the start of their text. Emphasize a term or statement label with bold, rather than bolding the whole paragraph. Avoid horizontal title rules, shaded headers, gradients, shadows, rounded cards, large section numerals, and changing palettes between chapters.

## Page patterns

Choose the pattern that exposes the mathematical relationship. Repeating a useful pattern is preferable to varying layouts for their own sake.

- **Opening question:** a short introduction, a compact chain of mathematical objects, and at most two explanatory columns. Simple outlined boxes are appropriate when they identify actual stages in the argument.
- **Definition or theorem:** bold label and assumptions in ordinary body text, followed by a centered display formula and a concise interpretation. The statement need not sit inside a colored box.
- **Derivation or proof:** show the required assumptions, align relations, and leave enough vertical space for fractions, sums, and limits. Keep proof labels visually distinct from the formulas.
- **Two-column comparison:** align column headings and keep a clear gutter. Each column should remain understandable in reading order; use full-width text when a derivation crosses both concepts.
- **Table:** use a white three-line table with bold column headings. Avoid vertical grid lines and zebra striping. Allocate width to the longest mathematical column and wrap prose deliberately. Native table cells accept prose and math runs; `colWidths` can give a definition more space than its numeric result. Check full formula height inside each row rather than shrinking all cells.
- **Consequence or connection:** use a square callout only for a meaningful synthesis. Its navy title strip carries white bold text; the body is pale blue-gray. Keep it near full body width, with a title strip roughly 0.5 in high for one line.
- **Figure with explanation:** reserve a coherent region for a real mathematical or scientific figure, with readable labels and a nearby caption. Preserve the figure's meaning rather than using decorative imagery.

For centered display formulas, equation numbers align with the right body edge. They are distinct from page numbers. Keep notation, domain restrictions, and explanatory text near the formula that uses them.

Use configurable course/presenter metadata in the lower-left footer and slide count in the lower right. A new template must not inherit a reference author's name, copyright statement, affiliation, or logo. A user-authorized faithful conversion instead preserves the supplied attribution and rights notices. For newly authored decks, compute main and appendix totals from their actual pages; do not inherit a reference deck's page denominator.

## Companion exporter

The preset is stored in `assets/themes/lecture-blue.json`. From the skill directory, run:

```sh
node scripts/cli.mjs lecture INPUT.json OUTPUT.pptx
```

The input contract and example are described in [tooling.md](tooling.md). Use the preset to keep recurring geometry consistent; choose another authoring route when the requested layout or editability exceeds the helper's capabilities.

An `equation` block with `latex` and no `file` compiles to a native editable OMML equation. Supplying `file` explicitly selects the legacy PNG/JPEG route; that formula remains an image. Both modes retain the block's LaTeX in speaker notes. The native converter uses the installed Temml dependency and does not require a TeX distribution. It supports a defined subset, not arbitrary LaTeX documents, and rejects unsupported constructs rather than silently rasterizing them. Consult [mathematics.md](mathematics.md) for the supported route and target-viewer checks.

The original three-page [Chinese sample](../assets/examples/lecture-zh.json) uses native equations. The seven-page [English sample](../assets/examples/lecture.json) retains its high-resolution formula images and source assets for compatibility. In either case, never approximate fractions, matrices or cases with manually spaced text.

## Visual acceptance

Check representative opening, theorem, proof, comparison/table, and callout pages before scaling up; then inspect every exported slide. Verify mathematical baselines, triangle bullets, title wrapping, column alignment, punctuation boundaries and the separation between content and footer. A successful export or XML check does not prove a visual match. Use the intended presentation software for final native-math acceptance: macOS WPS has been checked for display and equation-tool entry; PowerPoint has not been physically tested. artifact-tool previews incompletely support inline math and aligned equation arrays.

A compact lecture page may contain substantial mathematics, but do not shrink the whole page to hide overflow. Reflow a long explanation, divide a proof at a logical step, or use an appropriate appendix while preserving the user's requested content.
