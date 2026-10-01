import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {XMLParser} from 'fast-xml-parser';
import {TableCellSchema,exportDeck,validateDeck} from '../core.mjs';
import {compileLecture} from '../lecture.mjs';

const source={id:'example',document:'Synthetic table',locator:'Table 1',text:'Layout fixture, not a research result.'};
const table=()=>({id:'table',type:'table',x:1,y:1,w:6,h:2.8,size:18,headers:['参数','取值'],rows:[['均值','1']],sourceIds:['example'],colWidths:[2,4],rowHeights:[1,1.8]});
const deck=t=>({title:'Native table fixture',theme:{fontFace:'PingFang SC'},sources:[source],slides:[{id:'s1',title:'Table',sourceIds:['example'],elements:[t]}]});
const readTable=async t=>{
  const {buffer}=await exportDeck(deck(t),process.cwd()),zip=await JSZip.loadAsync(buffer),xml=await zip.file('ppt/slides/slide1.xml').async('string');
  const parsed=new XMLParser({ignoreAttributes:false,parseTagValue:false}).parse(xml);
  return {xml,native:parsed['p:sld']['p:cSld']['p:spTree']['p:graphicFrame']['a:graphic']['a:graphicData']['a:tbl']};
};

test('native table cells retain editable math, explicit run styles and header defaults',async()=>{
  const t=table();t.headers[0]=[{text:'参数 ',bold:false,color:'#A41F24'},{latex:'\\theta'}];
  t.rows[0][0]=[{text:'均值 '},{latex:'\\bar X_n'}];t.rows[0][1]=[{text:'方差：'},{latex:'\\frac{\\sigma^2}{n}',color:'#1F4E79'}];
  t.mathFontFace='STIX Two Math';
  const {xml,native}=await readTable(t),rows=native['a:tr'];
  assert.match(xml,/<a:tbl>/);assert.equal([...xml.matchAll(/<a14:m\b/g)].length,3);assert.match(xml,/<m:bar>/);assert.match(xml,/<m:f>/);assert.doesNotMatch(xml,/PSMATH_|<p:pic\b/);
  const header=rows[0]['a:tc'][0]['a:txBody']['a:p'];
  assert.notEqual(header['a:r']['a:rPr']['@_b'],'1');assert.equal(header['a:r']['a:rPr']['a:solidFill']['a:srgbClr']['@_val'],'A41F24');
  assert.equal(rows[0]['a:tc'][1]['a:txBody']['a:p']['a:r']['a:rPr']['@_b'],'1');
  assert.match(xml,/typeface="STIX Two Math"/);assert.match(xml,/eaLnBrk="1" latinLnBrk="0" hangingPunct="0"/);
  for(const [paragraph] of xml.matchAll(/<a:p>[^]*?<\/a:p>/g))assert.ok([...paragraph.matchAll(/<a:pPr\b/g)].length<=1);
});

test('unequal table columns, compact margins and explicit row heights survive native export',async()=>{
  const t=table();t.h=.7;t.rowHeights=[.35,.35];t.margin=0;t.align='center';t.headers=[[{latex:'x_1'}], [{latex:'x_2'}]];
  const {native}=await readTable(t);
  assert.deepEqual(native['a:tblGrid']['a:gridCol'].map(c=>Number(c['@_w'])),[2,4].map(w=>w*914400));
  assert.deepEqual(native['a:tr'].map(r=>Number(r['@_h'])),[.35,.35].map(h=>Math.round(h*914400)));
  native['a:tr'].forEach(row=>row['a:tc'].forEach(cell=>{assert.equal(cell['a:tcPr']['@_marT'],'0');assert.equal(cell['a:tcPr']['@_marB'],'0');assert.equal(cell['a:txBody']['a:p']['a:pPr']['@_algn'],'ctr');}));
});

test('Chinese table cells preserve characters and use safe soft wrapping',async()=>{
  const t=table(),text='估计误差（方差与偏差）需要一起解释，结论保持完整。';t.rows[0][0]=text;
  const {xml,native}=await readTable(t),cell=native['a:tr'][1]['a:tc'][0],body=cell['a:txBody']['a:p'];
  const runs=Array.isArray(body['a:r'])?body['a:r']:[body['a:r']];
  assert.equal(runs.map(r=>r['a:t']).join(''),text);assert.ok(body['a:br']);assert.match(xml,/typeface="PingFang SC"/);
  assert.doesNotMatch(validateDeck(deck(t)).warnings.join(),/table row may exceed its height/);
  t.rowHeights=[1,.5];assert.match(validateDeck(deck(t)).warnings.join(),/table row may exceed its height/);
});

test('rich cells and column geometry fail strict validation before export',async()=>{
  assert.equal(TableCellSchema.parse(''),'');assert.throws(()=>TableCellSchema.parse('x'.repeat(301)));assert.throws(()=>TableCellSchema.parse([{text:'x'.repeat(1001)}]));
  const t=table();t.colWidths=[6];assert.match(validateDeck(deck(t)).errors.join(),/include every column/);
  t.colWidths=[2,3];assert.match(validateDeck(deck(t)).errors.join(),/sum to the table width/);
  t.colWidths=[2,4];t.rows[0][0]=[{latex:'\\unsupported{x}'}];await assert.rejects(exportDeck(deck(t),'.'),/Unsupported function/);
  t.rows[0][0]=[{text:'低对比度',color:'#EEEEEE'}];assert.match(validateDeck(deck(t)).warnings.join(),/table text contrast/);
});

test('lecture tables share rich cells, native math fonts and content-aware heights',async()=>{
  const input={title:'Lecture table',fontFace:'PingFang SC',mathFontFace:'STIX Two Math',sources:[source],slides:[{id:'s1',title:'估计量',layout:'single',blocks:[{type:'table',headers:['估计量','性质'],rows:[[[{latex:'\\bar X_n'}],[{text:'方差 '},{latex:'\\sigma^2/n'}]]],sourceIds:['example'],margin:0,align:'center'}]}]};
  const compiled=compileLecture(input),t=compiled.slides[0].elements.find(e=>e.type==='table');
  assert.equal(t.mathFontFace,'STIX Two Math');assert.equal(t.fontFace,'PingFang SC');assert.equal(t.margin,0);assert.equal(t.align,'center');
  assert.equal(t.rowHeights.reduce((sum,h)=>sum+h,0),t.h);assert.equal(t.colWidths.reduce((sum,w)=>sum+w,0),t.w);
  const {buffer}=await exportDeck(compiled,'.'),zip=await JSZip.loadAsync(buffer),xml=await zip.file('ppt/slides/slide1.xml').async('string');
  assert.equal([...xml.matchAll(/<a14:m\b/g)].length,2);assert.match(xml,/<a:tbl>/);
});
