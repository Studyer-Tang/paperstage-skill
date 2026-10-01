import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import {XMLParser} from 'fast-xml-parser';
import {exportDeck,validateDeck,inspectPptx} from '../core.mjs';

const fixture=elements=>({title:'Native equation fixture',slides:[{id:'s1',title:'Native equations',elements}]});
const block=(id,latex)=>({id,type:'math',x:1,y:1,w:10,h:2,latex,size:24});
const xmlOf=async(input,index=1)=>{
  const {buffer}=await exportDeck(input,process.cwd()),zip=await JSZip.loadAsync(buffer);
  return {zip,buffer,xml:await zip.file(`ppt/slides/slide${index}.xml`).async('string')};
};

test('inline equations preserve text and styling on both sides of every placeholder',async()=>{
  const input=fixture([{id:'sentence',type:'text',x:1,y:1,w:11,h:2,size:24,text:[
    {text:'估计量 ',color:'#1F4E79'},
    {latex:String.raw`\hat\theta`},
    {text:' 的方差为 ',bold:true},
    {latex:String.raw`\frac{\sigma^2}{n}`},
    {text:'，结论保持完整。'}
  ]}]);
  const {xml}=await xmlOf(input);
  assert.equal([...xml.matchAll(/<a14:m\b/g)].length,2);
  for(const text of ['估计量 ',' 的方差为 ','，结论保持完整。'])assert.ok(xml.includes(text));
  assert.ok(xml.indexOf('估计量 ')<xml.indexOf('<a14:m'));assert.ok(xml.lastIndexOf('</a14:m>')<xml.indexOf('，结论保持完整。'));
  assert.match(xml,/<a:srgbClr val="1F4E79"\/>/);assert.match(xml,/<m:f>/);assert.match(xml,/<m:acc>/);
  assert.doesNotMatch(xml,/PSMATH_|<w:rPr/);
  for(const [run] of xml.matchAll(/<a:r>[^]*?<\/a:r>/g))assert.doesNotMatch(run,/<a14:m/);
  for(const [paragraph] of xml.matchAll(/<a:p>[^]*?<\/a:p>/g))assert.ok([...paragraph.matchAll(/<a:pPr\b/g)].length<=1,'a paragraph must not repeat its properties before each run');
});

test('ordinary text resembling equation placeholders survives alongside native equations',async()=>{
  const literal='PSMATH_0123456789abcdef0123456789abcdef';
  for(const runs of [[{text:literal}],[{text:literal},{latex:'x^2'},{text:'PSMATH_a'}]]) {
    const {xml}=await xmlOf(fixture([{id:'literal',type:'text',x:1,y:1,w:11,h:2,text:runs}]));
    assert.ok(xml.includes(`<a:t>${literal}</a:t>`));
    assert.equal([...xml.matchAll(/<a14:m\b/g)].length,runs.length===1?0:1);
    if(runs.length>1)assert.ok(xml.includes('<a:t>PSMATH_a</a:t>'));
  }
});

test('native block equations remain in ordinary text shapes with no raster or OLE fallback',async t=>{
  const input=fixture([block('equation',String.raw`\sum_{i=1}^n X_i^2`)]);
  input.slides[0].elements[0].color='#1F4E79';
  const {xml,zip,buffer}=await xmlOf(input);
  assert.match(xml,/<a:p>[^]*?<a14:m/);assert.match(xml,/<m:nary>/);assert.match(xml,/<m:t xml:space="preserve">X<\/m:t>/);
  assert.match(xml,/<a:rPr sz="2400"/);assert.doesNotMatch(xml,/<p:pic\b|<p:oleObj\b/);
  assert.ok(!Object.values(zip.files).some(f=>!f.dir&&/^ppt\/(media|embeddings)\//.test(f.name)));
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'paperstage-math-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'native.pptx');await fs.writeFile(file,buffer);
  const report=await inspectPptx(file);assert.equal(report.checks.internalRelationships,'resolved');assert.equal(report.checks.contentTypeOverrides,'resolved');
});

test('equations on later slides are injected into the correct slide only',async()=>{
  const input=fixture([{id:'intro',type:'text',x:1,y:1,w:10,h:1,text:'Introduction'}]);
  input.slides.push({id:'s2',title:'Fraction',elements:[block('fraction',String.raw`\frac{x}{y}`)]});
  input.slides.push({id:'s3',title:'Matrix',elements:[block('matrix',String.raw`\begin{pmatrix}1&2\\3&4\end{pmatrix}`)]});
  const {zip}=await xmlOf(input);
  const slides=await Promise.all([1,2,3].map(i=>zip.file(`ppt/slides/slide${i}.xml`).async('string')));
  assert.doesNotMatch(slides[0],/<a14:m/);assert.match(slides[1],/<m:f>/);assert.doesNotMatch(slides[1],/<m:m>/);assert.match(slides[2],/<m:m>/);
  slides.forEach(xml=>assert.doesNotMatch(xml,/PSMATH_/));
});

test('native equation schema rejects invalid fields and unresolved references',()=>{
  const input=fixture([block('equation','x')]);
  input.slides[0].elements[0].xml='<m:oMath/>';
  assert.throws(()=>validateDeck(input));
  delete input.slides[0].elements[0].xml;input.slides[0].elements[0].sourceIds=['missing'];
  assert.match(validateDeck(input).errors.join(),/unknown source missing/);
  delete input.slides[0].elements[0].sourceIds;input.slides[0].elements[0].w=30;
  assert.match(validateDeck(input).errors.join(),/outside slide bounds/);
});

test('unsupported equations fail export instead of silently flattening or rasterizing',async()=>{
  for(const latex of [String.raw`\unsupported{x}`,String.raw`\phantom{x}`]) {
    await assert.rejects(exportDeck(fixture([block('bad',latex)]),process.cwd()));
    const text={id:'inline',type:'text',x:1,y:1,w:10,h:1,text:[{text:'before '},{latex},{text:' after'}]};
    await assert.rejects(exportDeck(fixture([text]),process.cwd()));
  }
});

test('inline math line breaks remain outside the native equation object',async()=>{
  const input=fixture([{id:'lines',type:'text',x:1,y:1,w:10,h:3,text:[{text:'First '},{latex:'x',breakLine:true},{text:'Second '},{latex:'y'}]}]);
  const {xml}=await xmlOf(input);
  const parsed=new XMLParser({ignoreAttributes:false}).parse(xml),shape=parsed['p:sld']['p:cSld']['p:spTree']['p:sp'];
  const paragraphs=shape['p:txBody']['a:p'];assert.equal(paragraphs.length,2);
  assert.ok(paragraphs[0]['a14:m']);assert.ok(paragraphs[1]['a14:m']);
});
