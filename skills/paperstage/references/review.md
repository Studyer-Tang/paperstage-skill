# Review gate

1. Reopen the source ledger and challenge each consequential claim: does the cited passage actually support the wording? Check units, definitions, signs, baselines and uncertainty.
2. Run JSON validation and inspect the exported PPTX. Resolve errors. Explain or fix warnings; never treat a clean heuristic report as a guarantee.
3. Render the exported PPTX using an available trusted renderer. Inspect every page at presentation size and as a contact sheet. Check title wrapping, font substitution, clipping, accidental overlaps, chart labels, logo proportions, notes/source leakage, and visible footnotes.
4. Compare exact-template output side by side against donor layouts. A color match alone is not template preservation.
5. Confirm native text/charts/tables remain editable. Equations and imported images need a separate editability disclosure.
6. Rehearse transitions in the target viewer if animation matters. PowerPoint, Keynote and LibreOffice can differ. Static renders cannot validate timing.
7. If no renderer or target viewer is available, disclose exactly which checks ran and which did not. Do not claim "perfect", "PowerPoint verified", "no overflow" or "fully editable" beyond evidence.

The lint text-fit and overlap warnings use approximate geometry. They cannot measure all fonts, understand intended layering, detect every chart-label collision, or prove scientific accuracy. Visual inspection is required after revisions, not merely before them.
