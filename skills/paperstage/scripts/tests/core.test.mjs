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
test('table rectangular validation and native table export',async()=>{
  const d=fresh();d.slides[0].elements=[{id:'t',type:'table',x:1,y:1,w:10,h:4,headers:['A','B'],rows:[['1','2']],sourceIds:['demo-1']}];
  const {buffer}=await exportDeck(d,here);const z=await JSZip.loadAsync(buffer);
  assert.match(await z.file('ppt/slides/slide1.xml').async('string'),/<a:tbl>/);
  d.slides[0].elements[0].rows=[['one']];assert.match(validateDeck(d).errors.join(),/non-rectangular/);
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
  z.remove(Object.keys(z.files).find(n=>/^ppt\/charts\/chart\d+\.xml$/.test(n)));const file=path.join(dir,'broken.pptx');await fs.writeFile(file,await z.generateAsync({type:'nodebuffer'}));
  await assert.rejects(inspectPptx(file),/Broken package relationship/);
});
test('CLI refuses overwrite',async t=>{
  const dir=await temporary(t),spec=path.join(dir,'deck.json'),out=path.join(dir,'deck.pptx');
  await fs.writeFile(spec,JSON.stringify(fresh()));await fs.writeFile(out,'original');
  const p=spawnSync(process.execPath,[path.resolve(here,'../cli.mjs'),'export',spec,out],{encoding:'utf8'});
  assert.equal(p.status,1);assert.equal(await fs.readFile(out,'utf8'),'original');
});
