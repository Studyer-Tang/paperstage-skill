# Local helper contract

Requires Node.js >=22.13. From the installed skill directory:

```sh
npm ci --prefix scripts
node scripts/cli.mjs extract /path/to/paper.pdf /private/work/evidence.json
node scripts/cli.mjs inspect /path/to/template.pptx /private/work/template-report.json
node scripts/cli.mjs validate /private/work/deck.json
node scripts/cli.mjs export /private/work/deck.json /private/work/talk.pptx
node scripts/cli.mjs inspect /private/work/talk.pptx /private/work/package-report.json
```

Use new output names for revisions: helpers refuse overwrites. Inputs are limited to 20 MiB; assets to 8 MiB; PDF to 500 pages. Split larger inputs deliberately. Dependency installation uses the network; the helper commands contain no network clients.

## JSON contract

Start from [the working example](../assets/examples/deck.json). Schema implementation: `scripts/core.mjs` exports `DeckSchema`, `ThemeSchema` and `validateDeck`. Unknown properties are errors, not silently ignored.

- Deck: title, width/height in inches (default 13.333333 × 7.5), theme, transition (`none` or `fade`), sources[], slides[].
- Theme: name, institution, fontFace, primary/ink/background as #RRGGBB, chartColors[], footer. Optional logo: {file,x,y,w,h}. Institution is metadata; place visible institution text explicitly.
- Source: {id,document,locator,text}. Merge extract output's sources into the deck, selecting relevant passages with the original locators. Preserve warnings separately.
- Slide: {id,title,notes,sourceIds,elements}. The title is planning metadata: add a text element to display it. Source passages are added to native speaker notes.
- Every element: {id,type,x,y,w,h}. Coordinates are inches, not pixels. Bounds errors prevent export; overlap/text-fit warnings need visual review.
- Text: text,size (points, default 22),bold,italic,fontFace,color,align. `text` accepts a string or runs `[{text,bold?,italic?,fontFace?,color?,breakLine?,softBreakBefore?,lang?}]`. Both remain editable. Runs inherit box styles; explicit `false` removes emphasis. `breakLine` ends that run's paragraph; `softBreakBefore` inserts a native line break before it without adding an invisible character to the source text.
- Inline math: a text-run array may also contain `{latex,fontFace?,color?,breakLine?,softBreakBefore?}`. This creates native OMML inside the text box at its text size. The default math font is Cambria Math; specify an installed math family on the run to override it. Keep the input JSON or add source TeX to slide notes yourself.
- Standalone math: type `math`, latex, size (points, default 24; 8–96), optional fontFace (Cambria Math), color, align (`left`, `center`, default, or `right`), sourceIds[] (default empty). This is a native OMML equation in the element's box. Source references are checked when supplied; source TeX is not automatically added to notes in free-position mode.
- Rectangle: type `rect`, fill as #RRGGBB, optional line `{color,width}` (points). Use for meaningful diagram boxes or callouts. A background preceding and containing its text is intentional layering; partial overlaps still raise warnings.
- Chart: chartType (`bar`/`line`),labels[],series[{name,values[]}],unit,sourceIds[]. Native chart data stays editable. Check axes and unit labels after rendering.
- Table: headers[],rows[][],size,sourceIds[], style (`grid`, default, or `three-line`). Cells accept plain strings or rich arrays with the same prose and native-math runs as text boxes. Optional `colWidths[]` in inches must match the column count and sum to the table width; optional `rowHeights[]` includes the header and every row and must fit inside the table height. `fontFace`, `mathFontFace` (Cambria Math), `margin` (inches, default 0.08), and `align` (`left`, default, `center` or `right`) control cell presentation. The helper never truncates rows or silently paginates. Three-line mode has only top, header separator and bottom rules.
- Image: file,alt,sourceIds[]. File is a PNG/JPEG path relative to the spec folder. Remote, absolute, traversal and escaping symlink paths are rejected. The image fits within the box without distortion.

Source IDs on chart, table and image evidence elements are required but are not a scientific fact checker. Add a source entry for an authorized logo/figure as appropriate. Figures remain raster images, not editable reconstructions. Native math uses the supported LaTeX subset in [mathematics.md](mathematics.md); unsupported constructs fail instead of becoming images.

For CJK prose without inline math, including table cells, the exporter applies the deterministic layout helper in [chinese-typography.md](chinese-typography.md). It assigns script-specific fonts and language metadata, preserves source characters, keeps punctuation away from prohibited line boundaries, and avoids unnecessary breaks inside Latin words and numbers. Mixed prose/math runs still require target-viewer wrapping checks; font widths are estimates rather than measurements from installed fonts. A mathematical table cell can be written as `[{"text":"Mean: "},{"latex":"\\bar X_n"}]`; it remains inside the native table rather than becoming a separate floating formula image.

## Compact lecture input

Use [lecture.json](../assets/examples/lecture.json) as a runnable example, keeping its relative `lecture-math/` folder beside it. From the skill directory:

```sh
node scripts/cli.mjs lecture-validate assets/examples/lecture.json
node scripts/cli.mjs lecture assets/examples/lecture.json /private/work/lecture.pptx
```

That seven-page example deliberately retains image equations. For the original three-page Chinese example with native equations, install the selected fonts and run:

```sh
node scripts/cli.mjs lecture-validate assets/examples/lecture-zh.json
node scripts/cli.mjs lecture assets/examples/lecture-zh.json /private/work/lecture-zh.pptx
```

The lecture compiler uses the same export and inspection path as a free-position deck, with the visual contract in [lecture-style.md](lecture-style.md). Native math conversion uses Temml, installed by `npm ci`; a TeX distribution is not required. Its strict schema lives in `scripts/lecture.mjs`:

- Top level: `title`, optional `course` footer, optional `fontFace` (Arial), optional `mathFontFace` (Cambria Math, for standalone, inline and table equations), `sources[]` using the source contract above, and `slides[]`.
- Each slide: `id`, `title`, `layout`, `sourceIds`, optional `notes`, `density` (`normal` = 23.1 pt; `dense` = 21.1 pt), `align` (`balanced` or `top`), and `appendix` (boolean).
- `layout:"single"`: supply `blocks[]`.
- `layout:"columns"`: supply `left[]`, `right[]`, optional full-width `lead` text and a left column `ratio` from 0.3 to 0.7 (default 0.5).
- Block `{type:"paragraph"|"heading",text}`: plain text or rich runs.
- Block `{type:"bullets",items:[text,...]}`: blue triangle markers with wrapped text aligned after each marker.
- Block `{type:"table",headers,rows,sourceIds,colWidths?,margin?,align?}`: an editable three-line table, including rich prose/math cells. Columns default to equal width; explicit widths in inches must sum to the available block width. Row heights are estimated from cell wrapping. Cell fonts inherit the lecture's `fontFace` and `mathFontFace`. Review long prose and tall formulas in the actual render.
- Block `{type:"callout",title,text}`: square blue heading and pale body, for a meaningful consequence or theorem.
- Block `{type:"equation",latex,alt,height,sourceIds,number?,file?}`: formula source, meaningful description, height in inches (0.2–4.8), and optional right-aligned number. **Omit `file` for native editable OMML.** Common LaTeX structures are converted locally, and unsupported constructs cause an error. The block's TeX is added to speaker notes.
- Supplying `file` on an equation explicitly selects an already typeset PNG/JPEG, with preserved aspect ratio. The notes disclose that image-editing limitation. In this legacy mode, `latex` does not regenerate or verify the image; replace both when revising a formula.

Main and appendix page totals are computed independently; appendix pages must come last. The compiler rejects overlong titles and content exceeding its body region rather than silently shrinking or dropping it. Measurements are approximate, so inspect the exported slides even if validation succeeds. In this reference-matching profile, the muted `#9E9E9E` footer deliberately triggers a contrast warning; keep substantive content black.

Fonts are not bundled, installed or embedded. The Chinese sample specifies Noto Sans CJK SC, which must be installed on each target using it. For the tested macOS WPS installation, use `fontFace:"Heiti SC"`; PingFang SC and its tested Chinese name fell back to STSongti-SC. See [the font test findings](chinese-typography.md#fonts-and-portability). Standalone equations may use an installed math family instead of the default Cambria Math, but require a fresh native-viewer check; installed STIX Two Math alone did not ensure correct WPS layout. Inline lecture math inherits `mathFontFace`; individual math runs may override it with `fontFace`. Check the rendered font and layout rather than assuming that a family name establishes compatibility.

For advanced geometry, `compileLecture(input)` returns a regular deck specification that host code can adapt before `exportDeck`. The lecture preset does not change the free-position exporter's dimensions, theme defaults or existing JSON contract.

## Template and output inspection

`inspect` validates XML syntax, resolves package-internal relationships and reports dimensions, theme XML, slide text/placeholder hints and external relationships. It does not execute macros or fetch external targets. Active/embedded content is rejected. Reports may contain template text and should remain private.

Native chart XLSX parts are permitted, while active or unsupported embedded parts are rejected. Reports use raw XML hints and package-part ordering, not presentation-order reconstruction. They do not resolve inherited styles, measure fonts, render pages, or validate the full ECMA-376 schema. Use a native importer/viewer for exact template work.

The export helper does not preserve arbitrary PPTX masters or implement object entrances/Morph. Its only built-in animation is an optional slide fade. It does not render slides to images. Use the host's renderer and inspect the actual PPTX, not a separately recreated HTML preview.

Native equation display and double-click entry into equation tools have been physically checked in WPS on macOS; PowerPoint remains untested on a real installation. artifact-tool previews incompletely support inline OMML and `eqArr` aligned equations. Use the target office application to accept native math display and editing, and record which application was actually checked.
