# PaperStage

A formal academic presentation **skill for your existing AI assistant**, with small local PPTX tools.

Give the AI a paper, research notes, or proposal and an institutional reference. The AI reads the material, builds the argument, designs the slides and reviews the output. PaperStage supplies a reusable research workflow and deterministic helpers. It does not run another model.

## 中文说明

这是供 Codex 等支持 `SKILL.md` 的 AI 使用的技能包，不是网页应用，也不要求安装本地小模型或配置另一套 API Key。

AI 负责理解论文、选择讲述重点、核对证据、适配机构风格并逐页审稿。脚本负责本地提取文本、检查材料结构、导出可编辑文字/图表/表格，以及简单翻页淡入。

现在默认采用论文组会、研究报告与答辩风格：浅底、稳定文字层级、规范数学排版、公式与模型图配合、按研究问题组织章节。规则来自实际查看的论文报告与数学讲解，参见[案例拆解](skills/paperstage/references/reference-studies.md)。这是工作流与设计知识的提炼，不是模型训练，也不意味着照搬第三方模板。

不再把杂志式封面、巨大章节数字、整页换色或文字堆砌作为默认设计。复杂公式不能用空格和 Unicode 字符拼接；先检查宿主的公式能力，原生编辑不可用时明确说明。详见[学术版式](skills/paperstage/references/academic-patterns.md)与[数学排版](skills/paperstage/references/mathematics.md)。

**隐私边界：**脚本不上传文件，但当前 AI 平台可能会把 AI 读取的材料发给其模型服务商。本地 Skill 不等于 AI 全程离线。不要把论文、密钥或机构私有模板提交进这个公开仓库。

## LaTeX and academic layout refinement

数学公式优先保留 LaTeX 源码，按编辑要求选择原生公式或矢量公式。版式包括定义与实例并排、宽公式栏与窄说明栏、矩阵块平行对照、定理与证明线索、对齐推导与旁注。精修重点是内容关系、等号对齐、公式真实尺寸和留白。详见[版面精修](skills/paperstage/references/layout-refinement.md)。

这些是供 AI 使用的工作方法，不是固定模板或自动美学评分器。矢量公式不等于 PowerPoint 原生可编辑公式，内置 JSON 导出器也不包含 TeX 渲染器。公开仓库只包含通用规则和合成测试，不包含私人评审使用的论文、PPT 或参考演示文件。

## Install

Requires Node.js 22.13 or newer for bundled helpers.

```sh
git clone https://github.com/Studyer-Tang/paperstage-skill.git
cd paperstage-skill
npm ci --prefix skills/paperstage/scripts
```

Copy `skills/paperstage` into your assistant's skill directory, preserving scripts, assets and references. Current [Codex documentation](https://developers.openai.com/codex/skills/) lists `~/.agents/skills/paperstage` for user-wide skills and `.agents/skills/paperstage` for repository skills. Some hosts use configured or legacy paths; consult the actual host discovery rules. For Claude Code use its supported project/personal skill folder, commonly `.claude/skills/paperstage`. Run `npm ci --prefix <installed-skill>/scripts` if copied without dependencies and you need the PPTX helpers.

Do not replace an existing installation containing your own changes. Restart/reload skill discovery if necessary. This package follows the SKILL.md convention; host compatibility and the quality of its model/tools vary.

Example request:

> 使用 $paperstage，把这篇论文做成 15 分钟组会报告。沿用我提供的学校模板，图表保持可编辑，注明主要结论的出处，先检查论证再排版，最后逐页检查实际导出的 PPT。

## Capabilities and boundaries

| Available | Boundary |
| --- | --- |
| Research narration, evidence ledger, claims/assumptions separation | Instructions guide the AI; they cannot guarantee scientific correctness |
| PDF/DOCX/Markdown/text extraction | Scans need OCR; equations and figures need visual source inspection |
| Free-position native text, charts and tables | Raster figures remain raster; complex editable equations need host tooling |
| Local PNG/JPEG logos, institutional colors/fonts | Included presets are generic, not official school templates |
| Template structural inspection and exact-template workflow | Bundled exporter does not import arbitrary PPTX masters; use a capable host tool |
| Optional slide fade | No bundled Morph or object-by-object reveal; target viewer check required |
| Bounds, approximate text fit, XML/package relationship checks | Not a renderer or a proof of beautiful layout; actual slide review required |

The skill prefers richer native authoring tools when available. The fallback JSON exporter is intentionally small and does not dictate a fixed slide sequence or card layout.

For multi-section talks, `node skills/paperstage/scripts/check-plan.mjs <private-plan.json>` checks section coverage, declared sources and equation-capability mismatches without external packages. See the [plan contract](skills/paperstage/references/plan-check.md). It does not score beauty, inspect actual slides or validate mathematics. The bundled chart example remains an engineering fixture, not a design exemplar.

## Try the deterministic helper

From the repository root:

```sh
node skills/paperstage/scripts/cli.mjs validate skills/paperstage/assets/examples/deck.json
node skills/paperstage/scripts/cli.mjs export skills/paperstage/assets/examples/deck.json output/example.pptx
node skills/paperstage/scripts/cli.mjs inspect output/example.pptx output/package-report.json
npm test
```

Outputs are never overwritten. Change the output name for another revision.

The example uses clearly labeled synthetic numbers for regression testing, not a real paper. Tests check package invariants and failure cases, not PowerPoint animation playback or human-quality design. See [security boundaries and the known upstream dependency alert](SECURITY.md) before processing untrusted files.

[Skill instructions](skills/paperstage/SKILL.md) · [Tool contract](skills/paperstage/references/tooling.md) · [Related GitHub work](docs/landscape.md)

## License

MIT. Dependencies retain their licenses. No private papers, real institutional logos, fonts, model weights, telemetry, or credentials are included.
