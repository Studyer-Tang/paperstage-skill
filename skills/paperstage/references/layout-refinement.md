# Refining an academic layout

Use when the academic direction is accepted but composition still feels loose or mechanical. These patterns follow the inspected Chen references and iterative slide review. They are adaptable relationships, not a required slide sequence, palette, or aspect ratio.

## Diagnose before styling

Compare actual reference content pages with the exported sample, not just covers. Identify the scientific focal object, its explanation and the reading path. Preserve approved typography and notation while changing placement.

A common failure: every equation starts at the global left margin, related explanations sit far away, the right half is unused, and equally spaced rows lack hierarchy. Correct the grouping before adding decoration. Blank space should separate ideas or frame a focal object, not invite unrelated figures.

## Select the relationship

| Content | Useful composition | Alignment anchor |
| --- | --- | --- |
| Definitions with one concrete instance | Definitions beside the worked instance, shared domain above | Corresponding symbols and explanatory rows |
| Construction with several stages | Broad equation column and narrower commentary column | Each comment beside its stage |
| Two mathematical cases | Parallel labels, expressions, blocks and conclusions | Matched vertical roles, combined result below |
| Lemma and supporting explanation | Assumptions above a central statement, proof idea and check below | Statement centered within the content area |
| Multi-line derivation | One aligned mathematical object with short margin notes | Relation signs, then notes beside the corresponding steps |

Use a single-column centered display for one equation with one explanation. Two columns help only when the relationship benefits. Do not turn these into cards or impose layout variety when a stable proof sequence needs repetition.

## Position by rendered content

- Keep a small set of anchors: title region, body margins, column edges and footer baseline. Center display mathematics within its own content region, not automatically the entire slide.
- Measure typeset width and height. A centered display starts at `regionLeft + (regionWidth - equationWidth) / 2`. Related rows belong in one `aligned` environment so relation signs line up; independently centering rows loses that structure.
- Align commentary to the relevant visible equation row. Delimiters, limits and fractions extend beyond the baseline. Place captions after the full rendered height plus a deliberate gap, not after a guessed font-size increment.
- Match apparent math and prose size. Lay out the largest expression first. Split or rearrange overflowing content before shrinking all text. Never stretch an equation non-uniformly.
- Place shared domain restrictions above a group, local definitions beside their expression, and incidental source detail in a modest footer or notes. Avoid duplicating a detached formula as a label when a nearby colored term suffices.
- Use color consistently across expressions, blocks and explanations. Keep labels too, so the relationship survives grayscale and color-vision differences.

For an unconstrained 16:9 draft, roughly 8–9% side margins and an equation column occupying about two thirds of the body can be useful starting points. Fit these to the content and reference; they are not required dimensions.

## Review at two scales

At full size, inspect formula extents, commentary proximity and gaps. At thumbnail size, check the focal object and distribution of content. A contact sheet does not replace checking every page.

Ask whether the layout clarifies the scientific relationship. A palette change alone does not address composition. Automated bounds checks cannot certify visual balance or mathematical correctness.
