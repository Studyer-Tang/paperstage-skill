import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import JSZip from 'jszip';
import {XMLParser} from 'fast-xml-parser';
import {validateDeck,exportDeck,extract,inspectPptx,safeZip} from '../core.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const fixture=JSON.parse(await fs.readFile(path.resolve(here,'../../assets/examples/deck.json'),'utf8'));
const fresh=()=>structuredClone(fixture);
async function temporary(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'paperstage-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
test('valid fixture has no bounds or evidence errors',()=>assert.deepEqual(validateDeck(fresh()).errors,[]));
test('unknown fields fail rather than disappearing',()=>{const d=fresh();d.slides[0].elements[0].typo=1;assert.throws(()=>validateDeck(d));});
test('bad references fail',()=>{const d=fresh();d.slides[0].sourceIds=['unknown'];assert.match(validateDeck(d).errors.join(),/unknown source/);});
test('duplicate source, slide and element IDs fail',()=>{const d=fresh();d.sources.push(d.sources[0]);d.slides.push(d.slides[0]);d.slides[0].elements.push(d.slides[0].elements[0]);assert.equal(validateDeck(d).errors.length,4);});
test('chart data shape checked before export',async()=>{const d=fresh();d.slides[0].elements[1].series[0].values=[1];await assert.rejects(exportDeck(d,here),/count mismatch/);});
test('outside bounds prevents export',async()=>{const d=fresh();d.slides[0].elements[0].x=13;await assert.rejects(exportDeck(d,here),/outside slide/);});
test('crowded content raises warning and never truncates',async()=>{const d=fresh();const e=d.slides[0].elements[0];e.text='Long text '.repeat(80);e.h=.1;assert.match(validateDeck(d).warnings.join(),/overflow/);const {buffer}=await exportDeck(d,here);const z=await JSZip.loadAsync(buffer);assert.ok((await z.file('ppt/slides/slide1.xml').async('string')).includes(e.text));});
test('text wrapping counts each explicit CJK line separately',()=>{
  const d=fresh();d.slides[0].elements=[{id:'body',type:'text',x:1,y:1,w:2.1,h:1.3,size:24,text:'统计推断方法论\n统计推断方法论'}];
  assert.match(validateDeck(d).warnings.join(),/possible text overflow/);
  d.slides[0].elements[0].text='统计推断方法\n统计推断方法';
  assert.doesNotMatch(validateDeck(d).warnings.join(),/possible text overflow/);
});
test('CJK validation reports unbreakable horizontal overflow and accounts for bold wrapping',()=>{
  const d=fresh(),e={id:'body',type:'text',x:.25,y:1,w:2,h:4,size:22,text:'中文'+'A'.repeat(80)};
  d.slides[0].elements=[e];
  assert.match(validateDeck(d).warnings.join(),/text may exceed its width/);
  e.text='中文说明';assert.doesNotMatch(validateDeck(d).warnings.join(),/text may exceed its width/);
  Object.assign(e,{w:12.833333,h:.61,size:30.4,text:'统'.repeat(29),bold:true});
  assert.match(validateDeck(d).warnings.join(),/possible text overflow/);
  e.bold=false;assert.doesNotMatch(validateDeck(d).warnings.join(),/possible text overflow/);
});
test('rich text is strict and shares the plain text length limit',()=>{
  const d=fresh(),e=d.slides[0].elements[0];
  for(const runs of [[],[{text:'x',fontSize:30}],[{text:'x',color:'blue'}],[{text:'a'.repeat(3000)},{text:'b'.repeat(3000)}]]){
    e.text=runs;assert.throws(()=>validateDeck(d));
  }
  e.text=[{text:'统计推断',breakLine:true},{text:'方法'}];e.w=2;e.h=.5;e.size=24;
  assert.match(validateDeck(d).warnings.join(),/possible text overflow/);
});
test('plain text remains editable and rich runs preserve independent styles',async()=>{
  const d=fresh();d.slides[0].elements=[
    {id:'plain',type:'text',x:1,y:1,w:10,h:.5,size:22,text:'Existing plain text'},
    {id:'rich',type:'text',x:1,y:2,w:10,h:2,size:22,fontFace:'SimSun',bold:true,text:[
      {text:'定义：'},
      {text:'estimate',fontFace:'Times New Roman',italic:true,bold:false,color:'#1F4E79',breakLine:true},
      {text:'下一行',color:'#A41F24'}
    ]}
  ];
  const {buffer}=await exportDeck(d,here),zip=await JSZip.loadAsync(buffer);
  const xml=await zip.file('ppt/slides/slide1.xml').async('string');
  assert.match(xml,/<a:t>Existing plain text<\/a:t>/);
  const shapes=new XMLParser({ignoreAttributes:false}).parse(xml)['p:sld']['p:cSld']['p:spTree']['p:sp'];
  const rich=shapes.find(s=>s['p:nvSpPr']['p:cNvPr']['@_name']==='rich');
  const paragraphs=rich['p:txBody']['a:p'];assert.equal(paragraphs.length,2);
  const [definition,estimate]=paragraphs[0]['a:r'];
  assert.equal(definition['a:rPr']['a:latin']['@_typeface'],'SimSun');
  assert.equal(definition['a:rPr']['@_b'],'1');
  assert.equal(estimate['a:rPr']['a:latin']['@_typeface'],'Times New Roman');
  assert.equal(estimate['a:rPr']['@_i'],'1');assert.notEqual(estimate['a:rPr']['@_b'],'1');
  assert.equal(estimate['a:rPr']['a:solidFill']['a:srgbClr']['@_val'],'1F4E79');
  assert.equal(paragraphs[1]['a:r']['a:t'],'下一行');
});
test('rectangle backgrounds respect draw order, bounds and actual text contrast',async()=>{
  const d=fresh();const background={id:'box',type:'rect',x:.8,y:.8,w:5,h:2,fill:'#1F4E79',line:{color:'#102B40',width:1}};
  const text={id:'body',type:'text',x:1,y:1,w:4,h:1,text:'Readable label',color:'#FFFFFF'};
  d.slides[0].elements=[background,text];
  assert.doesNotMatch(validateDeck(d).warnings.join(),/overlapping|contrast/);
  const {buffer}=await exportDeck(d,here),zip=await JSZip.loadAsync(buffer);
  const xml=await zip.file('ppt/slides/slide1.xml').async('string');
  assert.match(xml,/<a:prstGeom prst="rect">/);assert.match(xml,/<a:ln w="12700"[^>]*>/);
  d.slides[0].elements[1].text=[{text:'Good '},{text:'Low contrast',color:'#19344F'}];
  assert.match(validateDeck(d).warnings.join(),/text contrast/);
  d.slides[0].elements.reverse();
  assert.match(validateDeck(d).warnings.join(),/overlapping boxes/);
  d.slides[0].elements=[{...background,x:12}];
  await assert.rejects(exportDeck(d,here),/outside slide bounds/);
});
test('partial rectangle overlap and content overlap still require review',()=>{
  const d=fresh();d.slides[0].elements=[
    {id:'box',type:'rect',x:1,y:1,w:2,h:1,fill:'#FFFFFF'},
    {id:'body',type:'text',x:2,y:1,w:2,h:1,text:'Partial overlap'},
    {id:'other',type:'text',x:2,y:1,w:2,h:1,text:'Other text'}
  ];
  assert.equal(validateDeck(d).warnings.filter(w=>w.includes('overlapping boxes')).length,3);
});
test('generated deck has editable chart, source notes, valid relationships and top-level fade',async t=>{
  const dir=await temporary(t),{buffer}=await exportDeck(fresh(),dir),file=path.join(dir,'deck.pptx');
  await fs.writeFile(file,buffer);
  const report=await inspectPptx(file);assert.equal(report.slides.length,1);assert.equal(report.checks.internalRelationships,'resolved');
  const z=await JSZip.loadAsync(buffer);assert.ok(Object.keys(z.files).some(n=>/^ppt\/charts\/chart\d+\.xml$/.test(n)));assert.ok(Object.keys(z.files).some(n=>n.endsWith('.xlsx')));
  assert.match(await z.file('ppt/notesSlides/notesSlide1.xml').async('string'),/made-up test values/);
  const xml=await z.file('ppt/slides/slide1.xml').async('string');
  const parsed=new XMLParser({ignoreAttributes:false}).parse(xml);
  assert.ok(parsed['p:sld']['p:transition']);assert.equal(parsed['p:sld']['p:cSld']['p:transition'],undefined);
});
test('no transition when disabled',async()=>{const d=fresh();d.transition='none';const {buffer}=await exportDeck(d,here);const z=await JSZip.loadAsync(buffer);assert.doesNotMatch(await z.file('ppt/slides/slide1.xml').async('string'),/<p:transition/);});
test('seven-slide exports declare only existing masters with or without fade',async t=>{
  const dir=await temporary(t),d=fresh();
  d.slides=Array.from({length:7},(_,i)=>({id:'s'+i,title:'Slide '+i,sourceIds:['demo-1'],elements:[{id:'body',type:'text',x:1,y:1,w:8,h:1,text:'Synthetic slide '+i}]}));
  for(const transition of ['none','fade']) {
    d.transition=transition;
    const {buffer}=await exportDeck(d,dir),file=path.join(dir,transition+'.pptx');
    await fs.writeFile(file,buffer);
    const report=await inspectPptx(file);assert.equal(report.slides.length,7);assert.equal(report.checks.contentTypeOverrides,'resolved');
    const zip=await JSZip.loadAsync(buffer),types=await zip.file('[Content_Types].xml').async('string');
    assert.equal([...types.matchAll(/PartName="\/ppt\/slideMasters\//g)].length,1);
    assert.match(types,/PartName="\/ppt\/slideMasters\/slideMaster1.xml"/);
    for(let n=1;n<=7;n++) {
      const xml=await zip.file('ppt/slides/slide'+n+'.xml').async('string');
      assert.equal(xml.includes('<p:transition'),transition==='fade');
    }
  }
});
test('table rectangular validation and native table export',async()=>{
  const d=fresh();d.slides[0].elements=[{id:'t',type:'table',x:1,y:1,w:10,h:4,headers:['A','B'],rows:[['1','2']],sourceIds:['demo-1']}];
  const {buffer}=await exportDeck(d,here);const z=await JSZip.loadAsync(buffer);
  assert.match(await z.file('ppt/slides/slide1.xml').async('string'),/<a:tbl>/);
  d.slides[0].elements[0].rows=[['one']];assert.match(validateDeck(d).errors.join(),/non-rectangular/);
});
test('three-line tables export native cells with only top, header and bottom rules',async()=>{
  const d=fresh();d.slides[0].elements=[{id:'t',type:'table',x:1,y:1,w:10,h:3,style:'three-line',headers:['A','B'],rows:[['1','2'],['3','4']],sourceIds:['demo-1']}];
  assert.deepEqual(validateDeck(d).errors,[]);
  const {buffer}=await exportDeck(d,here),zip=await JSZip.loadAsync(buffer);
  const xml=await zip.file('ppt/slides/slide1.xml').async('string');
  const rows=new XMLParser({ignoreAttributes:false}).parse(xml)['p:sld']['p:cSld']['p:spTree']['p:graphicFrame']['a:graphic']['a:graphicData']['a:tbl']['a:tr'];
  assert.equal(rows.length,3);
  rows.forEach((row,i)=>row['a:tc'].forEach(cell=>{
    const props=cell['a:tcPr'];
    for(const side of ['a:lnL','a:lnR'])assert.ok('a:noFill' in props[side]);
    if(i===0){assert.equal(props['a:lnT']['@_w'],'12700');assert.equal(props['a:lnB']['@_w'],'9525');}
    else {assert.ok('a:noFill' in props['a:lnT']);if(i===2)assert.equal(props['a:lnB']['@_w'],'12700');else assert.ok('a:noFill' in props['a:lnB']);}
  }));
});
test('explicit table row heights preserve wrapped content space in native XML',async()=>{
  const d=fresh();d.slides[0].elements=[{id:'t',type:'table',x:1,y:1,w:4,h:3,size:18,headers:['A','B'],rows:[['需要换行的统计推断示例文字','value'],['last','row']],rowHeights:[.6,1.5,.9],sourceIds:['demo-1']}];
  const checked=validateDeck(d);assert.deepEqual(checked.errors,[]);
  assert.doesNotMatch(checked.warnings.join(),/table.*height|cell may wrap/);
  const {buffer}=await exportDeck(d,here),zip=await JSZip.loadAsync(buffer);
  const xml=await zip.file('ppt/slides/slide1.xml').async('string');
  const rows=new XMLParser({ignoreAttributes:false}).parse(xml)['p:sld']['p:cSld']['p:spTree']['p:graphicFrame']['a:graphic']['a:graphicData']['a:tbl']['a:tr'];
  assert.deepEqual(rows.map(row=>Number(row['@_h'])),[.6,1.5,.9].map(h=>Math.round(h*914400)));
  d.slides[0].elements[0].rowHeights=[.6,.6,.6];
  assert.match(validateDeck(d).warnings.join(),/table row may exceed its height/);
});
test('table row heights reject missing rows and sums exceeding the bounding box',async()=>{
  const d=fresh();d.slides[0].elements=[{id:'t',type:'table',x:1,y:1,w:8,h:2,headers:['A','B'],rows:[['1','2']],rowHeights:[1],sourceIds:['demo-1']}];
  await assert.rejects(exportDeck(d,here),/include the header and every data row/);
  d.slides[0].elements[0].rowHeights=[1,1.2];
  await assert.rejects(exportDeck(d,here),/rowHeights exceed the table height/);
  d.slides[0].elements[0].rowHeights=[.01,1];
  assert.throws(()=>validateDeck(d));
});
test('assets reject traversal and URLs',async()=>{
  for(const file of ['../secret.png','https://example.com/a.png','C:/secret.png']){
    const d=fresh();d.slides[0].elements=[{id:'i',type:'image',x:1,y:1,w:1,h:1,file,alt:'test',sourceIds:['demo-1']}];
    await assert.rejects(exportDeck(d,here),/relative local path/);
  }
});
test('PNG is embedded with alt text',async t=>{
  const dir=await temporary(t);
  await fs.writeFile(path.join(dir,'pixel.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNioAAAAASUVORK5CYII=','base64'));
  const d=fresh();d.slides[0].elements=[{id:'i',type:'image',x:1,y:1,w:2,h:1,file:'pixel.png',alt:'Synthetic pixel',sourceIds:['demo-1']}];
  const {buffer}=await exportDeck(d,dir),z=await JSZip.loadAsync(buffer);
  assert.match(await z.file('ppt/slides/slide1.xml').async('string'),/Synthetic pixel/);
});
test('JPEG still embeds after bounded frame-header checks',async t=>{
  const dir=await temporary(t);
  // A synthetic 1x1 grayscale JPEG, generated locally rather than sourced from a paper.
  const data=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/ACv/2Q==','base64');
  await fs.writeFile(path.join(dir,'pixel.jpg'),data);
  const d=fresh();d.slides[0].elements=[{id:'i',type:'image',x:1,y:1,w:2,h:1,file:'pixel.jpg',alt:'Synthetic JPEG pixel',sourceIds:['demo-1']}];
  const {buffer}=await exportDeck(d,dir),zip=await JSZip.loadAsync(buffer);
  const image=Object.keys(zip.files).find(name=>name.startsWith('ppt/media/')&&!zip.files[name].dir);
  assert.deepEqual(await zip.file(image).async('nodebuffer'),data);
  assert.match(await zip.file('ppt/slides/slide1.xml').async('string'),/Synthetic JPEG pixel/);
});
test('reviewed PptxGenJS import stays on the ES build without image-size',async()=>{
  const entry=fileURLToPath(import.meta.resolve('pptxgenjs'));
  assert.equal(path.basename(entry),'pptxgen.es.js');
  assert.doesNotMatch(await fs.readFile(entry,'utf8'),/image-size/);
});
test('unsupported image parser signatures are rejected even with PNG filenames',async t=>{
  const dir=await temporary(t);
  // Recognized upstream formats with invalid zero-length records. Never send
  // these synthetic buffers to image-size or an Office viewer.
  const samples=[Buffer.from('69636e73000000106963303700000000','hex'),
    Buffer.from('0000000c4a584c200d0a870a000000006a786c63','hex'),
    Buffer.from('000000186674797068656963000000006d69663168656963000000006d657461','hex')];
  for(const [index,data] of samples.entries()){
    const file=`unsupported-${index}.png`;await fs.writeFile(path.join(dir,file),data);
    const d=fresh();d.slides[0].elements=[{id:'i',type:'image',x:1,y:1,w:1,h:1,file,alt:'Synthetic invalid image',sourceIds:['demo-1']}];
    await assert.rejects(exportDeck(d,dir),/Only PNG and JPEG/);
  }
});
test('PNG dimensions require a complete first IHDR chunk',async t=>{
  const dir=await temporary(t),good=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNioAAAAASUVORK5CYII=','base64');
  const wrongType=Buffer.from(good);wrongType.write('IDAT',12,'ascii');
  const wrongLength=Buffer.from(good);wrongLength.writeUInt32BE(12,8);
  for(const [index,data] of [good.subarray(0,24),wrongType,wrongLength].entries()){
    const file=`bad-header-${index}.png`;await fs.writeFile(path.join(dir,file),data);
    const d=fresh();d.slides[0].elements=[{id:'i',type:'image',x:1,y:1,w:1,h:1,file,alt:'Synthetic invalid header',sourceIds:['demo-1']}];
    await assert.rejects(exportDeck(d,dir),/Invalid PNG IHDR/);
  }
});
test('JPEG zero-length segments and incomplete frames fail in the bounded reader',async t=>{
  const dir=await temporary(t);
  const samples=[Buffer.from([255,216,255,224,0,0]),Buffer.from([255,216,255,192,0,7,8,0,1,0,1]),
    Buffer.from([255,216,255,192,0,8,8,0,1,0,1,0])];
  for(const [index,data] of samples.entries()){
    const file=`bad-frame-${index}.jpg`;await fs.writeFile(path.join(dir,file),data);
    const d=fresh();d.slides[0].elements=[{id:'i',type:'image',x:1,y:1,w:1,h:1,file,alt:'Synthetic invalid frame',sourceIds:['demo-1']}];
    await assert.rejects(exportDeck(d,dir),/Invalid JPEG/);
  }
});
test('text extraction has stable IDs, paragraph locators, no truncation',async t=>{
  const dir=await temporary(t),file=path.join(dir,'notes.md');await fs.writeFile(file,'First paragraph.\n\n'+'x'.repeat(9000));
  const a=await extract(file),b=await extract(file);
  assert.deepEqual(a,b);assert.equal(a.sources.length,3);assert.equal(a.sources.slice(1).map(s=>s.text).join('').length,9000);assert.equal(a.sources[0].locator,'paragraph 1');
});
test('DOCX text extraction works locally',async t=>{
  const dir=await temporary(t),zip=new JSZip();
  zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Synthetic DOCX result</w:t></w:r></w:p></w:body></w:document>');
  const file=path.join(dir,'test.docx');await fs.writeFile(file,await zip.generateAsync({type:'nodebuffer'}));
  assert.match((await extract(file)).sources[0].text,/Synthetic DOCX result/);
});
test('PDF text extraction works locally',async t=>{
  const dir=await temporary(t);
  const stream='BT /F1 12 Tf 50 750 Td (Synthetic PDF result) Tj ET';
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream'
  ];
  let pdf='%PDF-1.4\n';const offsets=[0];
  objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=(i+1)+' 0 obj\n'+o+'\nendobj\n';});
  const at=Buffer.byteLength(pdf);pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+at+'\n%%EOF';
  const file=path.join(dir,'test.pdf');await fs.writeFile(file,pdf);
  const result=await extract(file);assert.match(result.sources[0].text,/Synthetic PDF result/);assert.equal(result.sources[0].locator,'page 1');
});
test('unsafe ZIP traversal rejected',async()=>{const z=new JSZip();z.file('../bad.xml','x');await assert.rejects(safeZip(await z.generateAsync({type:'nodebuffer'})),/Unsafe ZIP path/);});
test('broken package relationships detected',async t=>{
  const dir=await temporary(t),{buffer}=await exportDeck(fresh(),dir),z=await JSZip.loadAsync(buffer);
  const rel='ppt/slides/_rels/slide1.xml.rels',xml=await z.file(rel).async('string');
  assert.match(xml,/Target="\/ppt\/charts\//);
  z.file(rel,xml.replace(/Target="\/ppt\/charts\/[^\"]+"/,'Target="/ppt/charts/missing.xml"'));
  const file=path.join(dir,'broken.pptx');await fs.writeFile(file,await z.generateAsync({type:'nodebuffer'}));
  await assert.rejects(inspectPptx(file),/Broken package relationship/);
});
test('inspection rejects a dangling content-type override without repairing input',async t=>{
  const dir=await temporary(t),{buffer}=await exportDeck(fresh(),dir),zip=await JSZip.loadAsync(buffer);
  const manifest=await zip.file('[Content_Types].xml').async('string');
  zip.file('[Content_Types].xml',manifest.replace('</Types>','<Override PartName="/ppt/missing.xml" ContentType="application/xml"/></Types>'));
  const file=path.join(dir,'bad-content-types.pptx'),corrupt=await zip.generateAsync({type:'nodebuffer'});
  await fs.writeFile(file,corrupt);
  await assert.rejects(inspectPptx(file),/Broken content-type override: \/ppt\/missing.xml/);
  assert.deepEqual(await fs.readFile(file),corrupt);
});
test('CLI refuses overwrite',async t=>{
  const dir=await temporary(t),spec=path.join(dir,'deck.json'),out=path.join(dir,'deck.pptx');
  await fs.writeFile(spec,JSON.stringify(fresh()));await fs.writeFile(out,'original');
  const p=spawnSync(process.execPath,[path.resolve(here,'../cli.mjs'),'export',spec,out],{encoding:'utf8'});
  assert.equal(p.status,1);assert.equal(await fs.readFile(out,'utf8'),'original');
});

test('omitted theme resolves usable defaults before minimal native export',async()=>{
  const input={title:'Defaults',slides:[{id:'one',title:'Defaults',elements:[{id:'text',type:'text',text:'Plain text',x:1,y:1,w:5,h:1}]}]};
  const {deck,errors}=validateDeck(input);
  assert.deepEqual(errors,[]);assert.equal(deck.theme.fontFace,'Arial');assert.equal(deck.theme.ink,'#1B2434');
  const {buffer}=await exportDeck(input,here);assert.ok(buffer.length>0);
});
