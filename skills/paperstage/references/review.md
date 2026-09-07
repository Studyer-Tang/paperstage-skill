# Review gate

## Academic review before export

- Can the audience locate the research question, definitions, method/construction, evidence and limitations? Does each section have a concrete purpose?
- Inspect formula fractions, brackets, limits, accents, baselines and aligned relations. Spaced Unicode simulations are not accepted merely because there is no overflow.
- Do diagrams explain actual scientific objects? Check symbol/label/color correspondence; remove unrelated scientific-looking art.
- Compare the sample to the academic reference: hierarchy, density, equation/model balance, footnotes and transitions. A palette match is insufficient.
- Check for repetitive title-plus-text skeletons, chapter posters and bullet density. Repetition is appropriate for progressive proofs and controlled comparisons; do not impose layout quotas.
- Does the static version retain the assumptions and evidence used by staged disclosure? A fade alone is not a designed explanation.

## Final file checks

For layout refinement, check equation/commentary grouping, unused side space, independently centered derivation rows, captions touching tall delimiters and repeated detached formula labels. Use [layout-refinement.md](layout-refinement.md) when these appear. For vector mathematics, inspect vector preservation in the exported package as well as the rendering; keep TeX source and distinguish fidelity from native editing.

1. Reopen the source ledger and challenge each consequential claim: does the cited passage actually support the wording? Check units, definitions, signs, baselines and uncertainty.
2. Run JSON validation and inspect the exported PPTX. Resolve errors. Explain or fix warnings; never treat a clean heuristic report as a guarantee.
3. Render the exported PPTX using an available trusted renderer. Inspect every page at presentation size and as a contact sheet. Check title wrapping, font substitution, clipping, accidental overlaps, chart labels, logo proportions, notes/source leakage, and visible footnotes.
4. Compare exact-template output side by side against donor layouts. A color match alone is not template preservation.
5. Confirm native text/charts/tables remain editable. Equations and imported images need a separate editability disclosure.
6. Rehearse transitions in the target viewer if animation matters. PowerPoint, Keynote and LibreOffice can differ. Static renders cannot validate timing.
7. If no renderer or target viewer is available, disclose exactly which checks ran and which did not. Do not claim "perfect", "PowerPoint verified", "no overflow" or "fully editable" beyond evidence.

The lint text-fit and overlap warnings use approximate geometry. They cannot measure all fonts, understand intended layering, detect every chart-label collision, or prove scientific accuracy. Visual inspection is required after revisions, not merely before them.
