# Security boundaries

This is local authoring tooling, not a sandbox for arbitrary hostile documents. Keep confidential source material outside the repository. The host AI's own data handling applies to content it reads.

Helpers restrict file sizes, reject unsafe asset paths, refuse output overwrites, check ZIP directory limits, disable PDF JavaScript evaluation and never follow external PPTX relationships. They do not execute document macros. Native chart XLSX parts are allowed for editability; active or unsupported embedded parts are rejected. Parsing third-party formats still carries residual risk. Use an isolated environment for untrusted files.

## Known dependency advisory (2026-09-07)

The locked PptxGenJS 4.0.1 dependency declares `image-size` 1.2.1. npm audit reports two high-severity affected packages (image-size and its parent PptxGenJS) for denial-of-service parsers:

- https://github.com/advisories/GHSA-w3rx-r6r6-pgpr
- https://github.com/advisories/GHSA-5p2g-fcmc-qvqq

The registry's latest image-size version at review time was 2.0.2, also within the affected range. We did not force a downgrade of PptxGenJS to an obsolete version to hide the alert. The bundled helper accepts only signature-checked PNG/JPEG, uses its own bounded header-dimension reader, and passes inline image data with explicit geometry; it does not call image-size. The locked PptxGenJS ES build contains no image-size import. This reduces exposure to the reported ICNS/JXL/HEIF parser paths, but is not a claim that the dependency advisory is fixed. Reassess on dependency updates.

Tests verify representative extraction/export and rejection behavior. XML well-formedness and package relationship checks do not validate every OOXML rule or guarantee safe rendering in Office.
