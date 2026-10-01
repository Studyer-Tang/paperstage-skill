# Chinese and mixed-script lecture slides

Use the same white canvas, navy hierarchy, and compact structure as [lecture-style.md](lecture-style.md). Chinese refinement concerns glyph selection, wrapping, and mathematical baselines; it does not require a separate decorative theme.

## Fonts and portability

Select an installed CJK sans-serif explicitly. Arial alone does not supply the intended Chinese glyphs; relying on viewer fallback changes widths and baselines.

| Situation | CJK family | Latin family |
| --- | --- | --- |
| Shared Windows/macOS/Linux setup | Noto Sans CJK SC, installed on each target | Arial or another agreed installed Latin font |
| macOS presentation | PingFang SC, only after checking the target viewer resolves it correctly | Arial |
| WPS on macOS, tested locally | Heiti SC / 黑体-简 / STHeiti / 华文黑体 | Arial |
| Windows presentation | Microsoft YaHei, after checking availability | Arial |

The project does not install or embed these fonts automatically. Noto CJK's [official repository](https://github.com/notofonts/noto-cjk) supplies the fonts and licensing information. Microsoft's [YaHei reference](https://learn.microsoft.com/en-us/typography/font-list/microsoft-yahei) documents that family. A font name in a PPTX is not proof that the recipient has it. For a shared presentation, choose a common installed family before the final render; do not silently rename one family's glyphs as another.

In the local WPS test on macOS 26.4, `Heiti SC`, `黑体-简`, `STHeiti` and `华文黑体` produced actual sans-serif Chinese fonts, verified from the exported PDF's font records. Both `PingFang SC` and `苹方-简` silently fell back to `STSongti-SC`, despite being plausible macOS font names. This is a finding for the tested WPS installation, not a promise about every WPS or PowerPoint version. For that environment, use `fontFace:"Heiti SC"` and inspect a fresh export. For the shared Noto preset, install Noto Sans CJK SC on every target and verify that the viewer actually uses it.

Keep Chinese at the profile's body size, normally 23 pt or explicitly 21 pt on a dense page. Use 30 pt bold titles and about 1.25 times the body size for line height. Text font selection is separate from the mathematical equation font. Confirm that punctuation, Greek letters, and Latin variables sit comfortably beside Chinese prose.

## Line breaking without altering the text

Closing punctuation such as `，。！？）》` should remain with preceding text; an opening bracket or quotation mark should not end a generated line. Preserve a Latin word, decimal, or identifier when it fits on a line. These choices follow the general principles in the W3C's [Chinese layout requirements, a working draft](https://www.w3.org/TR/clreq/#prohibition_rules_for_line_start_end).

`scripts/typography.mjs` exports:

```js
hasCjk(content)
layoutCjkText(content, {
  width, size,
  fontFace: 'Noto Sans CJK SC',
  latinFontFace: 'Arial',
  lang: 'zh-CN',
  bold: false,
  widthFactor: 1.03
})
// -> { runs, lineCount, lines, overflows }
```

`content` is plain text or a flat array of prose runs. Width is in inches and size in points. The returned runs retain the source characters, explicit styles, and existing paragraph breaks. Font and language are assigned per script when a run has no explicit override. Automatic wraps use `softBreakBefore` metadata: no zero-width spaces, word joiners, or replacement punctuation are inserted into the source text. The exporter applies this helper to CJK prose in text boxes and table cells; content containing native math runs needs separate target-viewer wrapping review.

Use `lineCount` from the same layout call when allocating a text box's height. Pass inherited bold state when measuring a bold heading. If `overflows` is nonempty, an unbreakable word or punctuation group exceeds the estimated line width; reflow the content or widen the box. The helper does not silently split an identifier or shrink the font. Deliberate source newlines are preserved, even if the author placed punctuation at their beginning; fix such source breaks explicitly.

The widths are conservative deterministic estimates, not measurements from an installed font. The small width factor reserves room for viewer differences. Avoid tuning it independently on every slide to conceal a bad layout. Render the exported PPTX, inspect punctuation and wrapping, and adjust the shared geometry or chosen font when evidence warrants it. Different office viewers may still reflow text.

## Native text metadata

PptxGenJS supports `fontFace`, `lang`, and `softBreakBefore` in its [text API](https://gitbrent.github.io/PptxGenJS/docs/api-text/). A soft break is a native line break, not a visible Unicode character. The pinned helper dependency writes an East Asian font entry for an explicit `fontFace`; pass `lang: 'zh-CN'` for Simplified Chinese runs.

DrawingML also defines paragraph attributes `eaLnBrk`, `latinLnBrk`, and `hangingPunct`; see Microsoft's [paragraph properties reference](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.paragraphproperties). They are viewer behavior controls, not font measurement or a guarantee of identical rendering. PptxGenJS 4.0.1 does not expose these as per-paragraph options in its public text types. Do not invent unsupported option names and assume that they took effect.

## Acceptance

Use `assets/examples/lecture-zh.json` for an original three-page teaching example. Review the actual output at presentation size: no isolated full stop at the start of a wrapped line, no opening bracket at its end, coherent Chinese/Latin baselines, clear formulas, and no content touching the footer. Verify native equations separately from text wrapping and state the actual editing capability of the exported deck.
