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
- Text: text,size (points, default 22),bold,color,align. Plain text is native/editable. Rich runs, bullets and mathematical objects need a host authoring tool.
- Chart: chartType (`bar`/`line`),labels[],series[{name,values[]}],unit,sourceIds[]. Native chart data stays editable. Check axes and unit labels after rendering.
- Table: headers[],rows[][],size,sourceIds[]. Every row must match header width. The helper never truncates rows or silently paginates.
- Image: file,alt,sourceIds[]. File is a PNG/JPEG path relative to the spec folder. Remote, absolute, traversal and escaping symlink paths are rejected. The image fits within the box without distortion.

Source IDs on evidence elements are required but are not a scientific fact checker. Add a source entry for an authorized logo/figure as appropriate. Figures remain raster images, not editable reconstructions.

## Template and output inspection

`inspect` validates XML syntax, resolves package-internal relationships and reports dimensions, theme XML, slide text/placeholder hints and external relationships. It does not execute macros or fetch external targets. Active/embedded content is rejected. Reports may contain template text and should remain private.

Native chart XLSX parts are permitted, while active or unsupported embedded parts are rejected. Reports use raw XML hints and package-part ordering, not presentation-order reconstruction. They do not resolve inherited styles, measure fonts, render pages, or validate the full ECMA-376 schema. Use a native importer/viewer for exact template work.

The export helper does not preserve arbitrary PPTX masters or implement object entrances/Morph. Its only built-in animation is an optional slide fade. It does not render slides to images. Use the host's renderer and inspect the actual PPTX, not a separately recreated HTML preview.
