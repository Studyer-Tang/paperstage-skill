import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {compileLecture} from '../lecture.mjs';
import {validateDeck,inspectPptx,exportDeck} from '../core.mjs';

const source={id:'example',document:'Synthetic teaching example',locator:'Section 1',text:'Illustrative explanation for layout tests only.'};
const slide=(id,extra={})=>({id,title:'统计推断',layout:'single',sourceIds:['example'],blocks:[{type:'paragraph',text:'从有限样本了解总体，明确假设与结论。'}],...extra});
const fixture=()=>({title:'Synthetic lecture',course:'高等统计学',fontFace:'Arial',sources:[structuredClone(source)],slides:[slide('s1')]});
const pageNumbers=deck=>deck.slides.map(s=>s.elements.find(e=>e.id==='page').text);

test('lecture numbering follows main and appendix sections as slides change',()=>{
  const input=fixture();input.slides=[slide('s1'),slide('s2'),slide('a1',{appendix:true}),slide('a2',{appendix:true})];
  const deck=compileLecture(input);
  assert.deepEqual(pageNumbers(deck),['1 / 2','2 / 2','Appendix A1 / A2','Appendix A2 / A2']);
  input.slides.splice(1,1);
  assert.deepEqual(pageNumbers(compileLecture(input)),['1 / 1','Appendix A1 / A2','Appendix A2 / A2']);
  input.slides=[slide('a1',{appendix:true}),slide('s1')];
  assert.throws(()=>compileLecture(input),/Appendix slides must follow/);
});

test('lecture rejects missing content, overlong titles and overflow without shrinking',()=>{
  const empty=fixture();empty.slides[0].blocks=[];
  assert.throws(()=>compileLecture(empty));
  const title=fixture();title.slides[0].title='统计'.repeat(50);
  assert.throws(()=>compileLecture(title),/title is too long/);
  const crowded=fixture();crowded.slides[0].blocks=[{type:'paragraph',text:'完整推导过程不能通过自动缩小字号来隐藏。'.repeat(100)}];
  assert.throws(()=>compileLecture(crowded),/exceeds the body area/);
  assert.equal(crowded.slides[0].density,undefined);
});

test('columns leave footers clear and preserve two independent content streams',()=>{
  const input=fixture();input.slides=[{
    id:'columns',title:'定义与例子',layout:'columns',density:'dense',sourceIds:['example'],
    lead:'先说明问题，再观察样本。',
    left:[{type:'heading',text:'左栏定义'},{type:'bullets',items:['参数描述总体','统计量由样本计算']}],
    right:[{type:'heading',text:'右栏例子'},{type:'paragraph',text:'用一次抽样讨论估计误差。'},{type:'table',headers:['方法','性质'],rows:[['均值','位置'],['方差','离散']],sourceIds:['example']}]
  }];
  const deck=compileLecture(input),elements=deck.slides[0].elements;
  assert.deepEqual(validateDeck(deck).errors,[]);
  const footer=elements.find(e=>e.id==='footer'),body=elements.filter(e=>!['title','footer','page'].includes(e.id));
  assert.ok(body.every(e=>e.y+e.h<footer.y-.1),'content must remain above the footer');
  const left=elements.find(e=>e.text==='左栏定义'),right=elements.find(e=>e.text==='右栏例子');
  assert.ok(left.x+left.w<right.x);assert.equal(left.y,right.y);
  assert.equal(elements.find(e=>e.type==='table').style,'three-line');
  assert.ok(body.filter(e=>e.type==='text').every(e=>e.size>=21));
});

test('rich lecture text retains explicit run styling and bullet content',()=>{
  const input=fixture();
  const runs=[{text:'定义：',bold:true,color:'#1F4E79'},{text:'parameter',italic:true,fontFace:'Times New Roman'},{text:' 描述总体。'}];
  input.slides[0].blocks=[{type:'paragraph',text:runs},{type:'bullets',items:[runs,'检查模型假设']}];
  const elements=compileLecture(input).slides[0].elements;
  const rich=elements.filter(e=>Array.isArray(e.text));
  assert.equal(rich.length,2);rich.forEach(e=>assert.deepEqual(e.text,runs));
  assert.equal(elements.filter(e=>e.text==='▸').length,2);
  assert.ok(elements.some(e=>e.text==='检查模型假设'));
});

test('equations preserve TeX, evidence and editing limitations in slide notes',()=>{
  const input=fixture(),latex=String.raw`\widehat{\theta}=\frac{1}{n}\sum_{i=1}^{n}X_i`;
  input.slides[0].notes='Explain why the assumptions matter.';
  input.slides[0].blocks=[{type:'equation',file:'formula.png',latex,alt:'Sample mean estimator',height:.8,number:'(1)',sourceIds:['example']}];
  const result=compileLecture(input).slides[0],image=result.elements.find(e=>e.type==='image');
  assert.equal(image.file,'formula.png');assert.deepEqual(image.sourceIds,['example']);
  assert.ok(result.notes.includes(latex));assert.match(result.notes,/Explain why/);assert.match(result.notes,/Not a native PowerPoint equation/);
  assert.ok(result.elements.some(e=>e.type==='text'&&e.text==='(1)'));
  input.slides[0].blocks[0].sourceIds=['missing'];
  assert.throws(()=>compileLecture(input),/unknown source missing/);
});

test('lecture validates slide evidence, duplicate IDs and table shapes',()=>{
  const input=fixture();input.slides[0].sourceIds=['missing'];
  assert.throws(()=>compileLecture(input),/unknown source missing/);
  input.slides[0].sourceIds=['example'];input.slides.push(slide('s1'));
  assert.throws(()=>compileLecture(input),/Duplicate slide ID/);
  input.slides.pop();input.slides[0].blocks=[{type:'table',headers:['A','B'],rows:[['one']],sourceIds:['example']}];
  assert.throws(()=>compileLecture(input),/non-rectangular table/);
});

test('lecture compilation neither mutates input nor leaks theme changes between decks',()=>{
  const input=fixture(),original=structuredClone(input),first=compileLecture(input);
  assert.deepEqual(input,original);
  const color=first.theme.chartColors[0];first.theme.chartColors[0]='#FF0000';
  assert.equal(compileLecture(input).theme.chartColors[0],color);
  first.slides[0].elements.find(e=>e.id==='title').text='Changed';
  assert.equal(compileLecture(input).slides[0].title,original.slides[0].title);
});

test('lecture support leaves the existing free-position JSON fixture valid',async()=>{
  const existing=JSON.parse(await fs.readFile(new URL('../../assets/examples/deck.json',import.meta.url),'utf8'));
  const original=structuredClone(existing);compileLecture(fixture());
  assert.deepEqual(validateDeck(existing).errors,[]);assert.deepEqual(existing,original);
});

test('lecture CLI exports an inspectable PPTX and refuses to overwrite it',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'paperstage-lecture-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const spec=path.join(dir,'lecture.json'),output=path.join(dir,'lecture.pptx');
  const cli=fileURLToPath(new URL('../cli.mjs',import.meta.url));
  await fs.writeFile(spec,JSON.stringify(fixture()));
  const validate=spawnSync(process.execPath,[cli,'lecture-validate',spec],{encoding:'utf8'});
  assert.equal(validate.status,0,validate.stderr);assert.deepEqual(JSON.parse(validate.stdout).errors,[]);
  const exported=spawnSync(process.execPath,[cli,'lecture',spec,output],{encoding:'utf8'});
  assert.equal(exported.status,0,exported.stderr);assert.equal((await inspectPptx(output)).slides.length,1);
  const before=await fs.readFile(output);
  const repeated=spawnSync(process.execPath,[cli,'lecture',spec,output],{encoding:'utf8'});
  assert.equal(repeated.status,1);assert.deepEqual(await fs.readFile(output),before);
});


test('lecture reserves height for wrapped table cells and rejects overcrowded tables',()=>{
  const input=fixture();
  input.slides[0].blocks=[{type:'table',headers:['Item','Explanation'],rows:[['A','A moderately long explanation which needs two lines in a cell.']],sourceIds:['example']},{type:'paragraph',text:'This paragraph follows the complete table.'}];
  const deck=compileLecture(input),table=deck.slides[0].elements.find(e=>e.type==='table');
  assert.equal(table.rowHeights.length,2);
  assert.ok(table.rowHeights[1]>table.rowHeights[0]);
  const following=deck.slides[0].elements.find(e=>e.text==='This paragraph follows the complete table.');
  assert.ok(following.y>table.y+table.h);
  input.slides[0].blocks[0].rows=Array.from({length:3},()=>['A','A long explanation that wraps across several lines in the table cell. '.repeat(4)]);
  assert.throws(()=>compileLecture(input),/exceeds the body area/);
});

test('blank lecture titles and content are rejected',()=>{
  for(const block of [{type:'paragraph',text:'   '},{type:'bullets',items:[[{text:'  '}]]}]) {
    const input=fixture();input.slides[0].blocks=[block];assert.throws(()=>compileLecture(input),/blank/);
  }
  const input=fixture();input.slides[0].title='  ';assert.throws(()=>compileLecture(input),/blank/);
});

test('bundled lecture example exports with all assets, native table and equation notes',async t=>{
  const specUrl=new URL('../../assets/examples/lecture.json',import.meta.url);
  const spec=JSON.parse(await fs.readFile(specUrl,'utf8'));
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'paperstage-example-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const deck=compileLecture(spec),file=path.join(dir,'example.pptx');
  await fs.writeFile(file,(await exportDeck(deck,path.dirname(fileURLToPath(specUrl)))).buffer);
  const report=await inspectPptx(file);
  assert.equal(report.slides.length,7);assert.equal(report.checks.internalRelationships,'resolved');
  assert.equal(deck.slides.filter(s=>s.elements.some(e=>e.type==='table')).length,1);
  assert.ok(deck.slides[2].notes.includes('LaTeX:'));
});
