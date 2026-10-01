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
- Text: text,size (points, default 22),bold,italic,fontFace,color,align. `text` accepts a string or runs `[{text,bold?,italic?,fontFace?,color?,breakLine?}]`. Both remain editable. Runs inherit box styles; explicit `false` removes emphasis. `breakLine` ends that run's paragraph. Complex mathematical objects still need a host authoring tool.
- Rectangle: type `rect`, fill as #RRGGBB, optional line `{color,width}` (points). Use for meaningful diagram boxes or callouts. A background preceding and containing its text is intentional layering; partial overlaps still raise warnings.
- Chart: chartType (`bar`/`line`),labels[],series[{name,values[]}],unit,sourceIds[]. Native chart data stays editable. Check axes and unit labels after rendering.
- Table: headers[],rows[][],size,sourceIds[], optional rowHeights[] in inches, style (`grid`, default, or `three-line`). Every row must match header width. Explicit row heights must match the row count including the header and fit inside the table height. The helper never truncates rows or silently paginates. Three-line mode has only top, header separator and bottom rules.
- Image: file,alt,sourceIds[]. File is a PNG/JPEG path relative to the spec folder. Remote, absolute, traversal and escaping symlink paths are rejected. The image fits within the box without distortion.

Source IDs on evidence elements are required but are not a scientific fact checker. Add a source entry for an authorized logo/figure as appropriate. Figures remain raster images, not editable reconstructions.

## Compact lecture input

Use [lecture.json](../assets/examples/lecture.json) as a runnable example, keeping its relative `lecture-math/` folder beside it. From the skill directory:

```sh
node scripts/cli.mjs lecture-validate assets/examples/lecture.json
node scripts/cli.mjs lecture assets/examples/lecture.json /private/work/lecture.pptx
```

The lecture compiler uses the same export and inspection path as a free-position deck, with the visual contract in [lecture-style.md](lecture-style.md). It adds no dependencies. Its strict schema lives in `scripts/lecture.mjs`:

- Top level: `title`, optional `course` footer, optional `fontFace` (Arial), `sources[]` using the source contract above, and `slides[]`.
- Each slide: `id`, `title`, `layout`, `sourceIds`, optional `notes`, `density` (`normal` = 23.1 pt; `dense` = 21.1 pt), `align` (`balanced` or `top`), and `appendix` (boolean).
- `layout:"single"`: supply `blocks[]`.
- `layout:"columns"`: supply `left[]`, `right[]`, optional full-width `lead` text and a left column `ratio` from 0.3 to 0.7 (default 0.5).
- Block `{type:"paragraph"|"heading",text}`: plain text or rich runs.
- Block `{type:"bullets",items:[text,...]}`: blue triangle markers with wrapped text aligned after each marker.
- Block `{type:"table",headers,rows,sourceIds}`: an editable three-line table with equal-width columns and row heights estimated from cell wrapping. For custom column widths or very long cells, use richer host tooling and review the actual render.
- Block `{type:"callout",title,text}`: square blue heading and pale body, for a meaningful consequence or theorem.
- Block `{type:"equation",file,latex,alt,height,sourceIds,number?}`: an already typeset PNG/JPEG, its original TeX, meaningful alternate text, height in inches (0.2–4.8), and optional right-aligned number. The image keeps its aspect ratio. TeX and the image-editing limitation are added to slide notes. The helper does **not** render `latex` or check that an image matches it; replace both when revising a formula.

Main and appendix page totals are computed independently; appendix pages must come last. The compiler rejects overlong titles and content exceeding its body region rather than silently shrinking or dropping it. Measurements are approximate, so inspect the exported slides even if validation succeeds. In this reference-matching profile, the muted `#9E9E9E` footer deliberately triggers a contrast warning; keep substantive content black. Fonts are not bundled or embedded. Confirm fonts on each target system, especially for Chinese.

For advanced geometry, `compileLecture(input)` returns a regular deck specification that host code can adapt before `exportDeck`. The lecture preset does not change the free-position exporter's dimensions, theme defaults or existing JSON contract.

## Template and output inspection

`inspect` validates XML syntax, resolves package-internal relationships and reports dimensions, theme XML, slide text/placeholder hints and external relationships. It does not execute macros or fetch external targets. Active/embedded content is rejected. Reports may contain template text and should remain private.

Native chart XLSX parts are permitted, while active or unsupported embedded parts are rejected. Reports use raw XML hints and package-part ordering, not presentation-order reconstruction. They do not resolve inherited styles, measure fonts, render pages, or validate the full ECMA-376 schema. Use a native importer/viewer for exact template work.

The export helper does not preserve arbitrary PPTX masters or implement object entrances/Morph. Its only built-in animation is an optional slide fade. It does not render slides to images. Use the host's renderer and inspect the actual PPTX, not a separately recreated HTML preview.
