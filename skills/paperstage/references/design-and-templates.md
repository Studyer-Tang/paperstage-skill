# Design and institutional templates

## Establish the design contract
Distinguish exact PPTX preservation, visual reconstruction from a reference, and a new design using institutional branding. Ask only if these alternatives materially change the user's requirement.

For an existing template inspect representative layouts and render all relevant donor slides. Identify slide size, masters, placeholder boxes, font metrics, logo clear space, footer rules, chart palette and title hierarchy. Do not infer these from the institution's name alone.

The local inspector exposes dimensions, theme XML, text and placeholder hints. Inherited positions, grouped elements, custom namespaces, fonts, animations and exact appearance still require a real viewer/importer. Never call its report a complete template extraction.

Exact template route: use a host native importer, edit a copy, reuse actual placeholders/layouts, preserve original logos and inherited masters, then compare source/output renders. Do not paste new content over an old slide and call that template preservation.

Brand route: capture colors, fonts and institution/footer text in a theme JSON. Use an authorized original PNG/JPEG logo with its aspect ratio preserved. Generic red/blue presets are not official university templates. No real institutional assets ship with this project.

## Compose for the evidence
Read [academic-patterns.md](academic-patterns.md) for compositions and [mathematics.md](mathematics.md) for formula-rich work. Use a light academic canvas with stable title/body/caption positions. Scientific relationships determine composition: definition/example, equations/model, aligned derivation, or controlled comparison. Do not make every page artificially sparse; preserve the assumptions needed to understand the result.

Record audience, duration, slide size, output/editability, text/math fonts, sizes in points, margins, semantic colors, and reference pages. A practical 16:9 start is 28–34 pt slide titles, 20–24 pt body and 13–16 pt references. Follow the user's template, host requirements and viewing conditions over these starting ranges. Rebalance before shrinking. No decorative pseudo-equations or invented scientific figures.

For Chinese text start with a readable sans-serif family such as Source Han Sans/Noto Sans CJK SC or a confirmed installed equivalent. Pair it with a coherent math family/engine. Serif Chinese headings are an option supported by a reference or user request, not an automatic mark of scholarship. Avoid four unrelated fonts; compare actual baselines and apparent sizes.

Default to white/near-white, charcoal text and restrained semantic accents. A symbol should keep its color across formulas, figures and captions; also distinguish entities with labels or line styles. Theorem emphasis can be a thin rule or lightly tinted statement area. Do not assign a new palette to every chapter simply for variety. Dark backgrounds and full-bleed color need an explicit/reference-supported purpose.

For charts retain native data and units. For image-based evidence retain the original, label its source, and avoid cropping out legends or caveats. For tables prefer readable columns over compressing a paper-sized table onto a slide.

## Animation
A restrained fade between slides is the bundled stable feature. Object entrances, Morph and staged mathematical reveals are host-tool features, not claims of this helper. Animate only when sequence helps comprehension. Essential evidence must survive static/PDF viewing. Test the final deck in the intended presentation software before promising animation compatibility.

For a proof/construction, reveal assumptions, construction and consequence in dependency order. Keep unchanged objects stable and hypotheses visible before use. A static final state should make sense; agree on intermediate static pages if needed. A PNG cannot verify playback.
