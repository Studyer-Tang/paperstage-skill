# Security boundaries

This is local authoring tooling, not a sandbox for arbitrary hostile documents. Keep confidential source material outside the repository. The host AI's own data handling applies to content it reads.

Helpers restrict file sizes, reject unsafe asset paths, refuse output overwrites, check ZIP directory limits, disable PDF JavaScript evaluation and never follow external PPTX relationships. They do not execute document macros. Native chart XLSX parts are allowed for editability; active or unsupported embedded parts are rejected. Parsing third-party formats still carries residual risk. Use an isolated environment for untrusted files.

## Known dependency advisory (reviewed 2026-10-02)

The locked PptxGenJS 4.0.1 dependency declares `image-size` 1.2.1. npm audit reports two high-severity affected packages (image-size and its parent PptxGenJS) for denial-of-service parsers:

- https://github.com/advisories/GHSA-w3rx-r6r6-pgpr
- https://github.com/advisories/GHSA-5p2g-fcmc-qvqq

The two advisories now list image-size **2.0.3** as patched; the npm registry's latest image-size is **2.0.4** at this review. PptxGenJS's latest stable release remains **4.0.1** and still requires `image-size ^1.2.1`, so there is no patched version within its declared dependency range. We retain the locked versions and the advisory rather than force an unverified cross-major override or downgrade PptxGenJS. Registry metadata: [image-size](https://registry.npmjs.org/image-size/latest), [PptxGenJS](https://registry.npmjs.org/pptxgenjs/latest). Reassess when upstream changes its dependency contract.

The bundled exporter accepts only signature-checked PNG/JPEG, requires a complete first PNG IHDR chunk or a bounded JPEG frame header, and passes inline image data with explicit geometry. It does not call image-size. Regression tests verify that the actual PptxGenJS module resolution uses the reviewed ES build without an image-size import, that ICNS/JXL/HEIF signatures are rejected even when the filename ends in `.png`, and that zero-length JPEG segments or malformed PNG dimension headers fail. These checks reduce exposure to the reported parser paths; **the dependency advisory remains unresolved**. Header checks do not fully decode or authenticate an image, and do not guarantee safe rendering in Office.

Tests verify representative extraction/export and rejection behavior. XML well-formedness and package relationship checks do not validate every OOXML rule or guarantee safe rendering in Office.
