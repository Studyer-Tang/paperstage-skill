# Optional academic plan check

For a substantial multi-section presentation, put the private storyboard in the following compact contract. This is separate from the fallback exporter's `deck.json`: planning labels are not rendered slides. A simple one-slide edit does not need this tool.

```json
{
  "schemaVersion": 1,
  "title": "Research seminar",
  "nativeMathRequired": true,
  "sources": [{"id": "paper-p8"}],
  "sections": [{
    "id": "construction",
    "question": "How does the construction encode the mathematical object?",
    "outcome": "The audience can connect each defined quantity to the model."
  }],
  "slides": [{
    "id": "model",
    "role": "content",
    "sectionId": "construction",
    "purpose": "Explain the construction and its assumptions together.",
    "composition": "model-plus-equations",
    "sourceIds": ["paper-p8"],
    "equations": [{"complex": true, "representation": "native-equation"}],
    "reveal": {
      "steps": ["Show assumptions", "Introduce construction", "Connect labels"],
      "staticComplete": true
    }
  }]
}
```

Run `node scripts/check-plan.mjs /private/work/plan.json`. No dependencies/network are needed. Exit codes: 0 means no structural errors (warnings can remain), 1 means invalid declarations/capability conflicts, 2 means unreadable/oversized/invalid JSON input. Maximum input is 1 MiB. No input file is changed; the report contains issue codes and locations, not the paper's text. Keep any saved report private.

Required: schemaVersion 1, title, sources[], sections[], slides[]. IDs are unique within each collection. Each section needs question/outcome, each slide purpose and sourceIds. Roles: cover, outline, section, content, appendix, closing. Content slides belong to a declared section when sections exist. Extra fields such as duration or notation are permitted but not checked; document their meaning in the storyboard.

Equation representations: plain-text, native-equation, typeset-vector, raster. For complex math, plain-text is an error. A nativeMathRequired contract rejects any non-native equation declaration. Vector/raster math requires its retained TeX/source string or source-file description and produces a disclosure warning. The tool does not read or execute that string. Simple text labels need not be listed as equations unless they are part of the equation contract.

A multi-section talk needs an outline slide or an explicit nonempty outlineOmissionReason (such as an agreed three-slide budget). Empty sections and content without sources trigger warnings. A planned reveal needs nonempty steps; staticComplete declares whether a static version preserves the essential argument.

Warnings are prompts for judgment, not universal bans. Reasons can be recorded in the private review. The tool trusts declarations: `native-equation` does not prove that the exported file contains one, and `staticComplete: true` does not prove a valid proof. Inspect actual objects and renderings separately. It does not enforce layout counts, guess mathematical truth, or generate an aesthetic score.
