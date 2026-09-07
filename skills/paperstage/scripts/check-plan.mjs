import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const roles = new Set(['cover', 'outline', 'section', 'content', 'appendix', 'closing']);
const representations = new Set(['plain-text', 'native-equation', 'typeset-vector', 'raster']);

// This checks declarations only. No source retrieval, execution, or visual scoring.
export function reviewPlan(plan) {
  const findings = [];
  const add = (severity, code, location) => findings.push({ severity, code, location });
  const finish = () => ({
    schema: 'paperstage.plan-review.v1',
    passed: !findings.some(f => f.severity === 'error'), findings,
    boundary: 'Declared plan checks only. No source entailment, mathematical, visual, or playback verification.',
  });
  if (!object(plan)) { add('error', 'PLAN_OBJECT_REQUIRED', 'plan'); return finish(); }
  if (plan.schemaVersion !== 1) add('error', 'SCHEMA_VERSION', 'schemaVersion');
  if (!nonempty(plan.title)) add('error', 'TITLE_REQUIRED', 'title');
  if (!Array.isArray(plan.slides) || !plan.slides.length) add('error', 'SLIDES_REQUIRED', 'slides');
  for (const key of ['sections', 'sources']) if (!Array.isArray(plan[key])) add('error', 'ARRAY_REQUIRED', key);
  if (plan.nativeMathRequired !== undefined && typeof plan.nativeMathRequired !== 'boolean') add('error', 'BOOLEAN_REQUIRED', 'nativeMathRequired');
  if (plan.outlineOmissionReason !== undefined && !nonempty(plan.outlineOmissionReason)) add('error', 'REASON_REQUIRED', 'outlineOmissionReason');
  const arrays = key => Array.isArray(plan[key]) ? plan[key] : [];
  const ids = key => {
    const result = new Set();
    arrays(key).forEach((item, i) => {
      if (!object(item) || !nonempty(item.id)) add('error', 'ID_REQUIRED', `${key}[${i}]`);
      else if (result.has(item.id)) add('error', 'DUPLICATE_ID', `${key}[${i}].id`);
      else result.add(item.id);
    });
    return result;
  };
  const sectionIds = ids('sections'), sourceIds = ids('sources'); ids('slides');
  arrays('sections').forEach((section, i) => {
    if (!object(section)) return;
    for (const key of ['question', 'outcome']) if (!nonempty(section[key])) add('error', 'SECTION_PURPOSE_REQUIRED', `sections[${i}].${key}`);
  });
  const coverage = new Set();
  arrays('slides').forEach((slide, i) => {
    const loc = `slides[${i}]`;
    if (!object(slide)) return;
    if (!roles.has(slide.role)) add('error', 'INVALID_ROLE', `${loc}.role`);
    if (!nonempty(slide.purpose)) add('error', 'SLIDE_PURPOSE_REQUIRED', `${loc}.purpose`);
    if (!nonempty(slide.composition)) add('warning', 'COMPOSITION_UNPLANNED', loc);
    if (slide.sectionId !== undefined && !sectionIds.has(slide.sectionId)) add('error', 'UNKNOWN_SECTION', loc);
    if (slide.role === 'content' && sectionIds.size) {
      if (!sectionIds.has(slide.sectionId)) add('error', 'CONTENT_SECTION_REQUIRED', loc);
      else coverage.add(slide.sectionId);
    }
    if (!Array.isArray(slide.sourceIds)) add('error', 'SOURCE_IDS_REQUIRED', loc);
    else {
      for (const id of slide.sourceIds) if (!sourceIds.has(id)) add('error', 'UNKNOWN_SOURCE', `${loc}.sourceIds`);
      if (slide.role === 'content' && !slide.sourceIds.length) add('warning', 'CONTENT_WITHOUT_SOURCE', loc);
    }
    if (slide.equations !== undefined && !Array.isArray(slide.equations)) add('error', 'EQUATIONS_ARRAY_REQUIRED', loc);
    (Array.isArray(slide.equations) ? slide.equations : []).forEach((equation, j) => {
      const where = `${loc}.equations[${j}]`;
      if (!object(equation)) { add('error', 'EQUATION_OBJECT_REQUIRED', where); return; }
      if (typeof equation.complex !== 'boolean') add('error', 'MATH_COMPLEXITY_REQUIRED', where);
      if (!representations.has(equation.representation)) add('error', 'MATH_REPRESENTATION_REQUIRED', where);
      if (equation.complex && equation.representation === 'plain-text') add('error', 'COMPLEX_MATH_AS_TEXT', where);
      if (plan.nativeMathRequired === true && equation.representation !== 'native-equation') add('error', 'NATIVE_MATH_CONTRACT', where);
      if (['typeset-vector', 'raster'].includes(equation.representation)) {
        if (!nonempty(equation.source)) add('error', 'MATH_SOURCE_REQUIRED', where);
        add('warning', 'NON_NATIVE_MATH_DISCLOSURE', where);
      }
    });
    if (slide.reveal !== undefined) {
      if (!object(slide.reveal) || !Array.isArray(slide.reveal.steps) || !slide.reveal.steps.length || !slide.reveal.steps.every(nonempty)) add('error', 'REVEAL_STEPS_REQUIRED', loc);
      if (slide.reveal?.staticComplete !== true) add('warning', 'STATIC_READING_UNRESOLVED', loc);
    }
  });
  for (const id of sectionIds) if (!coverage.has(id)) add('warning', 'SECTION_WITHOUT_CONTENT', `sections:${id}`);
  if (sectionIds.size > 1 && !arrays('slides').some(s => s?.role === 'outline') && !nonempty(plan.outlineOmissionReason)) add('warning', 'OUTLINE_OR_REASON_MISSING', 'slides');
  return finish();
}

// Installed skills can be reached through a directory junction or symlink.
// Compare resolved files so the CLI does not silently skip execution via an alias.
const canonical = value => process.platform === 'win32' ? value.toLowerCase() : value;
const entry = process.argv[1] ? await fs.realpath(path.resolve(process.argv[1])).catch(() => null) : null;
if (entry && canonical(await fs.realpath(fileURLToPath(import.meta.url))) === canonical(entry)) {
  try {
    if (process.argv.length !== 3) throw Error('usage');
    const file = await fs.open(process.argv[2], 'r');
    let bytes;
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 1024 * 1024) throw Error('size');
      const buffer = Buffer.alloc(1024 * 1024 + 1);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (bytesRead > 1024 * 1024) throw Error('size');
      bytes = buffer.subarray(0, bytesRead);
    } finally { await file.close(); }
    const result = reviewPlan(JSON.parse(bytes.toString('utf8')));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.passed ? 0 : 1;
  } catch {
    process.stderr.write('Cannot review plan. Provide one readable JSON file of at most 1 MiB.\n');
    process.exitCode = 2;
  }
}
