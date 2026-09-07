import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewPlan } from '../check-plan.mjs';
const valid = () => ({ schemaVersion: 1, title: 'Seminar', sources: [{id:'p1'}], sections:[{id:'a',question:'What?',outcome:'Definition.'}], slides:[{id:'s1',role:'content',purpose:'Explain definition',sectionId:'a',composition:'definition-example',sourceIds:['p1']}] });
const codes = p => reviewPlan(p).findings.map(x=>x.code);

test('CLI executes through an installed directory alias',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'paperstage-alias-'));
 try {
  const script=fileURLToPath(new URL('../check-plan.mjs',import.meta.url));
  const alias=path.join(dir,'installed');
  await fs.symlink(path.dirname(script),alias,process.platform==='win32'?'junction':'dir');
  const file=path.join(dir,'plan.json');await fs.writeFile(file,JSON.stringify(valid()));
  const r=spawnSync(process.execPath,[path.join(alias,'check-plan.mjs').replaceAll('\\','/'),file],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).passed,true);
  const bad=valid();bad.slides[0].equations=[{complex:true,representation:'plain-text'}];
  await fs.writeFile(file,JSON.stringify(bad));
  const rejected=spawnSync(process.execPath,[path.join(alias,'check-plan.mjs'),file],{encoding:'utf8'});
  assert.equal(rejected.status,1);assert.equal(JSON.parse(rejected.stdout).passed,false);
 } finally {await fs.rm(dir,{recursive:true,force:true});}
});

test('valid one-section seminar has no forced outline or layout quota',()=>assert.deepEqual(reviewPlan(valid()).findings,[]));
test('catches complex plain text but allows simple labels',()=>{let p=valid();p.slides[0].equations=[{complex:true,representation:'plain-text'}];assert.ok(codes(p).includes('COMPLEX_MATH_AS_TEXT'));p.slides[0].equations[0].complex=false;assert.equal(reviewPlan(p).passed,true);});
test('native editing contract cannot be satisfied by vector with source',()=>{let p=valid();p.nativeMathRequired=true;p.slides[0].equations=[{complex:true,representation:'typeset-vector',source:'matrix.tex'}];assert.ok(codes(p).includes('NATIVE_MATH_CONTRACT'));p.nativeMathRequired=false;assert.equal(reviewPlan(p).passed,true);assert.ok(codes(p).includes('NON_NATIVE_MATH_DISCLOSURE'));});
test('sources and section coverage are cross-checked',()=>{let p=valid();p.slides[0].sourceIds=['missing'];p.slides[0].sectionId='missing';assert.ok(codes(p).includes('UNKNOWN_SOURCE'));assert.ok(codes(p).includes('UNKNOWN_SECTION'));assert.ok(codes(p).includes('SECTION_WITHOUT_CONTENT'));});
test('multiple chapters need an outline or an intentional omission',()=>{let p=valid();p.sections.push({id:'b',question:'Why?',outcome:'A result'});assert.ok(codes(p).includes('OUTLINE_OR_REASON_MISSING'));p.outlineOmissionReason='Agreed short format';assert.ok(!codes(p).includes('OUTLINE_OR_REASON_MISSING'));});
test('reveal steps and static reading gaps are reported',()=>{let p=valid();p.slides[0].reveal={steps:[],staticComplete:false};assert.ok(codes(p).includes('REVEAL_STEPS_REQUIRED'));assert.ok(codes(p).includes('STATIC_READING_UNRESOLVED'));});
test('malformed records return findings without crashing',()=>{for(const p of [null,[],{}, {slides:[null],sections:[null],sources:[null]}, {...valid(),slides:[{equations:[null]}]}]) assert.equal(reviewPlan(p).passed,false);});
test('duplicate IDs and absent chapter question fail',()=>{let p=valid();p.slides.push({...p.slides[0]});p.sections[0].question='';assert.ok(codes(p).includes('DUPLICATE_ID'));assert.ok(codes(p).includes('SECTION_PURPOSE_REQUIRED'));});
test('CLI checks files without writing or leaking source text',async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'paperstage-plan-'));try{const file=path.join(dir,'plan.json');const input=JSON.stringify({...valid(),title:'private-secret-title'});await fs.writeFile(file,input);const script=fileURLToPath(new URL('../check-plan.mjs',import.meta.url));let r=spawnSync(process.execPath,[script,file],{encoding:'utf8'});assert.equal(r.status,0);assert.equal(JSON.parse(r.stdout).passed,true);assert.ok(!r.stdout.includes('private-secret-title'));assert.equal(await fs.readFile(file,'utf8'),input);await fs.writeFile(file,'{invalid-json-secret');r=spawnSync(process.execPath,[script,file],{encoding:'utf8'});assert.equal(r.status,2);assert.ok(!r.stderr.includes('invalid-json-secret'));}finally{await fs.rm(dir,{recursive:true,force:true});}});
