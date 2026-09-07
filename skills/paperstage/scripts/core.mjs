import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { z } from 'zod';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const label = z.string().min(1).max(200);
const box = { x:z.number().nonnegative(), y:z.number().nonnegative(), w:z.number().positive(), h:z.number().positive() };
const shared = { id:label, ...box };
const text = z.strictObject({ ...shared, type:z.literal('text'), text:z.string().min(1).max(5000), size:z.number().min(8).max(96).default(22), bold:z.boolean().default(false), color:hex.optional(), align:z.enum(['left','center','right']).default('left') });
const chart = z.strictObject({ ...shared, type:z.literal('chart'), chartType:z.enum(['bar','line']), labels:z.array(label).min(1).max(30), series:z.array(z.strictObject({name:label,values:z.array(z.number().finite()).min(1).max(30)})).min(1).max(8), unit:z.string().max(80).default(''), sourceIds:z.array(label).min(1) });
const table = z.strictObject({ ...shared, type:z.literal('table'), headers:z.array(label).min(1).max(10), rows:z.array(z.array(z.string().max(300))).min(1).max(30), size:z.number().min(12).max(32).default(18), sourceIds:z.array(label).min(1) });
const image = z.strictObject({ ...shared, type:z.literal('image'), file:label, alt:label, sourceIds:z.array(label).min(1) });
export const ThemeSchema = z.strictObject({
  name:label.default('Academic blue'), institution:z.string().max(120).default(''), fontFace:label.default('Arial'),
  primary:hex.default('#244CCB'), ink:hex.default('#1B2434'), background:hex.default('#FFFFFF'),
  chartColors:z.array(hex).min(1).max(8).default(['#244CCB','#66816C','#B76642']), footer:z.string().max(160).default(''),
  logo:z.strictObject({file:label,...box}).optional()
});
export const DeckSchema = z.strictObject({
  title:label, width:z.number().min(4).max(30).default(13.333333), height:z.number().min(3).max(20).default(7.5),
  theme:ThemeSchema.default({}), transition:z.enum(['none','fade']).default('none'),
  sources:z.array(z.strictObject({ id:label, document:label, locator:label, text:z.string().min(1).max(16000) })).max(2000).default([]),
  slides:z.array(z.strictObject({
    id:label, title:label, notes:z.string().max(30000).default(''), sourceIds:z.array(label).default([]),
    elements:z.array(z.discriminatedUnion('type',[text,chart,table,image])).min(1).max(80)
  })).min(1).max(100)
});

function luminance(c) {
  const v=c.slice(1).match(/../g).map(n=>parseInt(n,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);
  return .2126*v[0]+.7152*v[1]+.0722*v[2];
}
const contrast=(a,b)=>{ const v=[luminance(a),luminance(b)].sort((a,b)=>b-a);return(v[0]+.05)/(v[1]+.05); };
export function validateDeck(input) {
  const deck=DeckSchema.parse(input), errors=[], warnings=[], ids=new Set(), sources=new Set();
  for(const s of deck.sources) { if(sources.has(s.id)) errors.push('Duplicate source ID: '+s.id); sources.add(s.id); }
  const checkRefs=(refs,where)=>refs.forEach(id=>{if(!sources.has(id))errors.push(where+': unknown source '+id);});
  const inBounds=(e,where)=>{if(e.x+e.w>deck.width+.001||e.y+e.h>deck.height+.001)errors.push(where+': outside slide bounds');};
  if(deck.theme.logo) inBounds(deck.theme.logo,'Theme logo');
  for(const slide of deck.slides) {
    if(ids.has(slide.id))errors.push('Duplicate slide ID: '+slide.id);ids.add(slide.id);
    checkRefs(slide.sourceIds,slide.id);
    if(!slide.sourceIds.length)warnings.push(slide.id+': no slide-level evidence (acceptable for non-factual setup)');
    const elementIds=new Set();
    for(const e of slide.elements) {
      const where=slide.id+'/'+e.id;
      if(elementIds.has(e.id))errors.push(where+': duplicate element ID');elementIds.add(e.id);
      inBounds(e,where);
      if(e.sourceIds)checkRefs(e.sourceIds,where);
      if(e.type==='text') {
        const units=Array.from(e.text).reduce((n,c)=>n+(/[^\u0000-\u00ff]/.test(c)?1:.55),0);
        const lines=Math.max(e.text.split('\n').length,Math.ceil(units/Math.max(1,e.w*72/e.size)));
        if(lines*e.size*1.25>e.h*72)warnings.push(where+': possible text overflow; render and inspect');
        if(contrast(e.color??deck.theme.ink,deck.theme.background)<4.5)warnings.push(where+': text contrast below 4.5:1');
      }
      if(e.type==='chart'&&e.series.some(s=>s.values.length!==e.labels.length))errors.push(where+': label/value count mismatch');
      if(e.type==='table') {
        if(e.rows.some(r=>r.length!==e.headers.length))errors.push(where+': non-rectangular table');
        if((e.rows.length+1)*e.size*1.8>e.h*72)warnings.push(where+': table may exceed its height');
        if(e.rows.flat().concat(e.headers).some(t=>Array.from(t).length*e.size*.6>e.w*72/e.headers.length))warnings.push(where+': table cell may wrap; inspect rendered row heights');
      }
    }
    for(let i=0;i<slide.elements.length;i++)for(let j=i+1;j<slide.elements.length;j++){
      const a=slide.elements[i],b=slide.elements[j];
      if(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>.02&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>.02)
        warnings.push(slide.id+': overlapping boxes '+a.id+' / '+b.id+' (review intended layering)');
    }
  }
  return {deck,errors,warnings};
}

export async function readLimited(file, max=20*1024*1024) {
  const info=await fs.stat(file);
  if(!info.isFile()||info.size>max)throw Error('Input must be a file no larger than '+max+' bytes');
  return fs.readFile(file);
}
export async function safeZip(data) {
  // Check central-directory advertised limits BEFORE JSZip inflates entries.
  const b=Buffer.from(data);
  if(b.length>20*1024*1024)throw Error('Archive too large');
  let end=-1;
  for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(b.readUInt32LE(i)===0x06054b50&&i+22+b.readUInt16LE(i+20)===b.length){end=i;break;}
  if(end<0)throw Error('Invalid ZIP directory');
  const count=b.readUInt16LE(end+10),size=b.readUInt32LE(end+12),start=b.readUInt32LE(end+16);
  if(b.readUInt16LE(end+4)||b.readUInt16LE(end+6)||count===65535||size===0xffffffff||start+size>end||count>3000)throw Error('Unsupported or oversized ZIP');
  let at=start,total=0;
  const names=new Set();
  for(let i=0;i<count;i++){
    if(at+46>start+size||b.readUInt32LE(at)!==0x02014b50)throw Error('Invalid ZIP entry');
    const expanded=b.readUInt32LE(at+24),n=b.readUInt16LE(at+28),extra=b.readUInt16LE(at+30),comment=b.readUInt16LE(at+32);
    if(at+46+n+extra+comment>start+size)throw Error('Invalid ZIP entry length');
    const name=b.subarray(at+46,at+46+n).toString('utf8');
    if(names.has(name)||name.includes('\\')||name.split('/').includes('..')||/^(\/|[A-Za-z]:)/.test(name))throw Error('Unsafe ZIP path');
    names.add(name);total+=expanded;
    if(expanded>30*1024*1024||total>100*1024*1024||(b.readUInt16LE(at+8)&1))throw Error('Oversized or encrypted ZIP');
    at+=46+n+extra+comment;
  }
  if(at!==start+size)throw Error('Invalid ZIP directory size');
  return JSZip.loadAsync(b);
}
function parseXml(xml) {
  if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('XML entities are not supported');
  const valid=XMLValidator.validate(xml);
  if(valid!==true)throw Error('Invalid XML: '+valid.err.msg);
  return new XMLParser({ignoreAttributes:false,processEntities:false}).parse(xml);
}
async function raster(file,base) {
  if(path.isAbsolute(file)||file.includes('\\')||file.split('/').includes('..')||/^[a-z]+:/i.test(file))throw Error('Asset must be a relative local path inside the spec folder');
  const root=await fs.realpath(base),target=await fs.realpath(path.resolve(base,file));
  const relative=path.relative(root,target);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Asset escapes the spec folder');
  const b=await readLimited(target,8*1024*1024);
  const kind=b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':b[0]===255&&b[1]===216&&b[2]===255?'jpeg':null;
  if(!kind)throw Error('Only PNG and JPEG assets are supported');
  return 'data:image/'+kind+';base64,'+b.toString('base64');
}
const col=s=>s.slice(1);
function contain(data,e) {
  const b=Buffer.from(data.split(',')[1],'base64');let width=0,height=0;
  if(data.startsWith('data:image/png')) {
    if(b.length<24)throw Error('Invalid PNG header');
    width=b.readUInt32BE(16);height=b.readUInt32BE(20);
  }else {
    let at=2;
    while(at+3<b.length){
      if(b[at++]!==255)throw Error('Invalid JPEG marker');
      while(b[at]===255)at++;
      const marker=b[at++];
      if(marker===217||marker===218)break;
      if(marker===1||(marker>=208&&marker<=215))continue;
      if(at+2>b.length)break;
      const length=b.readUInt16BE(at);
      if(length<2||at+length>b.length)throw Error('Invalid JPEG segment');
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){
        if(length<7)throw Error('Invalid JPEG frame');
        height=b.readUInt16BE(at+3);width=b.readUInt16BE(at+5);break;
      }
      at+=length;
    }
  }
  if(!width||!height||width>20000||height>20000||width*height>40000000)throw Error('Invalid or oversized raster dimensions');
  const scale=Math.min(e.w/width,e.h/height),w=width*scale,h=height*scale;
  return {x:e.x+(e.w-w)/2,y:e.y+(e.h-h)/2,w,h};
}
export async function exportDeck(input,base) {
  const {deck,errors,warnings}=validateDeck(input);
  if(errors.length)throw Error(errors.join('\n'));
  const pptx=new PptxGenJS();
  pptx.defineLayout({name:'CUSTOM',width:deck.width,height:deck.height});pptx.layout='CUSTOM';
  pptx.title=deck.title;pptx.author='PaperStage';pptx.company=deck.theme.institution;
  pptx.theme={headFontFace:deck.theme.fontFace,bodyFontFace:deck.theme.fontFace};
  const sourceMap=new Map(deck.sources.map(s=>[s.id,s]));
  for(const [i,s] of deck.slides.entries()) {
    const slide=pptx.addSlide();slide.background={color:col(deck.theme.background)};
    for(const e of s.elements) {
      const pos={x:e.x,y:e.y,w:e.w,h:e.h,objectName:e.id};
      if(e.type==='text')slide.addText(e.text,{...pos,fontFace:deck.theme.fontFace,fontSize:e.size,bold:e.bold,color:col(e.color??deck.theme.ink),align:e.align,margin:0,valign:'top',breakLine:false});
      if(e.type==='image') {const data=await raster(e.file,base);slide.addImage({data,...contain(data,e),altText:e.alt,objectName:e.id});}
      if(e.type==='chart')slide.addChart(pptx.ChartType[e.chartType],e.series.map(v=>({name:v.name,labels:e.labels,values:v.values})),{
        ...pos,chartColors:deck.theme.chartColors.map(col),showLegend:e.series.length>1,legendFontSize:12,
        catAxisLabelFontFace:deck.theme.fontFace,catAxisLabelFontSize:12,valAxisLabelFontFace:deck.theme.fontFace,valAxisLabelFontSize:12,
        showValue:false,showCatName:false,showTitle:false,showBorder:false,
        showValueTitle:Boolean(e.unit),valAxisTitle:e.unit,valAxisTitleFontSize:12
      });
      if(e.type==='table')slide.addTable([e.headers.map(text=>({text,options:{bold:true,color:col(deck.theme.primary)}})),...e.rows],{
        ...pos,fontFace:deck.theme.fontFace,fontSize:e.size,color:col(deck.theme.ink),margin:.08,border:{pt:.5,color:'D6DCE4'},
        colW:Array(e.headers.length).fill(e.w/e.headers.length),rowH:e.h/(e.rows.length+1),autoPage:false
      });
    }
    if(deck.theme.logo){const e=deck.theme.logo,data=await raster(e.file,base);slide.addImage({data,...contain(data,e),altText:deck.theme.institution+' logo'});}
    if(deck.theme.footer)slide.addText(deck.theme.footer,{x:.4,y:deck.height-.32,w:deck.width-.8,h:.2,fontSize:9,fontFace:deck.theme.fontFace,color:col(deck.theme.ink),margin:0});
    const refs=[...new Set([...s.sourceIds,...s.elements.flatMap(e=>e.sourceIds??[])])];
    slide.addNotes([s.notes,...refs.map(id=>{const r=sourceMap.get(id);return '['+id+'] '+r.document+'; '+r.locator+'\n'+r.text;})].join('\n\n'));
  }
  const raw=await pptx.write({outputType:'nodebuffer'});
  if(deck.transition==='none')return {buffer:raw,warnings};
  const zip=await JSZip.loadAsync(raw);
  for(const name of Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n))){
    const xml=await zip.file(name).async('string');
    // PptxGenJS-created slides have no existing transition/timing. Insert after clrMapOvr,
    // not before an arbitrary nested extLst.
    const end=xml.indexOf('</p:clrMapOvr>')>=0?xml.indexOf('</p:clrMapOvr>')+14:xml.indexOf('</p:cSld>')+9;
    if(end<9)throw Error('Unexpected slide structure');
    const changed=xml.slice(0,end)+'<p:transition spd="med" advClick="1"><p:fade/></p:transition>'+xml.slice(end);
    parseXml(changed);zip.file(name,changed);
  }
  return {buffer:await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),warnings};
}

export async function extract(file) {
  const data=await readLimited(file), ext=path.extname(file).toLowerCase(), name=path.basename(file);
  const prefix=crypto.createHash('sha256').update(data).digest('hex').slice(0,12), blocks=[],warnings=[];
  const add=(text,locator)=>{if(text.trim())blocks.push({id:prefix+'-'+(blocks.length+1),document:name,locator,text:text.trim()});};
  if(['.txt','.md'].includes(ext)){
    const text=data.toString('utf8');
    if(text.length>500000)throw Error('Text exceeds 500,000 characters; split the input explicitly');
    text.split(/\r?\n\s*\r?\n/).forEach((p,i)=>{for(let j=0;j<p.length;j+=8000)add(p.slice(j,j+8000),'paragraph '+(i+1)+(j?' (continued)':''));});
  }else if(ext==='.pdf'){
    const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
    const require=createRequire(import.meta.url);
    const fonts=path.join(path.dirname(require.resolve('pdfjs-dist/package.json')),'standard_fonts').replaceAll('\\','/')+'/';
    const task=getDocument({data:new Uint8Array(data),isEvalSupported:false,useSystemFonts:false,standardFontDataUrl:fonts});
    const doc=await task.promise;
    try {
      if(doc.numPages>500)throw Error('PDF exceeds 500 pages');
      for(let n=1;n<=doc.numPages;n++){
        const page=await doc.getPage(n),content=await page.getTextContent();
        const t=content.items.map(x=>('str'in x?x.str+(x.hasEOL?'\n':' '):'')).join('');
        if(!t.trim())warnings.push('Page '+n+': no extractable text; inspect/OCR this page');
        for(let j=0;j<t.length;j+=8000)add(t.slice(j,j+8000),'page '+n+(j?' (continued)':''));
        page.cleanup();
      }
    } finally {await task.destroy();}
    warnings.push('PDF text does not preserve equations, figures or multi-column reading order. Inspect source pages.');
  }else if(ext==='.docx'){
    await safeZip(data);
    const mammoth=(await import('mammoth')).default;
    const r=await mammoth.extractRawText({buffer:data});
    r.value.split(/\n\s*\n/).forEach((p,i)=>{for(let j=0;j<p.length;j+=8000)add(p.slice(j,j+8000),'paragraph '+(i+1)+(j?' (continued)':''));});
    warnings.push(...r.messages.map(m=>m.message),'DOCX text does not preserve figures, mathematical layout or page numbers.');
  }else throw Error('Supported input: .md, .txt, .pdf, .docx');
  return {sources:blocks,warnings};
}
export async function inspectPptx(file) {
  const zip=await safeZip(await readLimited(file)), names=Object.keys(zip.files);
  if(names.some(n=>/vbaProject|activeX/i.test(n)||(/embeddings\/./i.test(n)&&!n.endsWith('.xlsx'))))throw Error('Active or unsupported embedded content is not supported');
  for(const n of names.filter(n=>/embeddings\/.+\.xlsx$/.test(n))){
    const workbook=await safeZip(await zip.file(n).async('nodebuffer'));
    if(Object.keys(workbook.files).some(p=>/vbaProject|activeX|embeddings\/|externalLinks\//i.test(p)))throw Error('Active or external workbook content is not supported');
  }
  const external=[],xmlFiles=[];
  for(const name of names.filter(n=>/\.(xml|rels)$/.test(n))){
    const xml=await zip.file(name).async('string');parseXml(xml);xmlFiles.push(name);
    if(name.endsWith('.rels')){
      const data=parseXml(xml),rels=data.Relationships?.Relationship??[];
      for(const r of Array.isArray(rels)?rels:[rels]) {
        if(r['@_TargetMode']==='External') {external.push({part:name,target:r['@_Target']});continue;}
        const base=name==='_rels/.rels'?'':path.posix.dirname(path.posix.dirname(name));
        const target=r['@_Target']??'';
        const resolved=target.startsWith('/')?target.slice(1):path.posix.normalize(path.posix.join(base,target));
        if(!zip.file(resolved))throw Error('Broken package relationship: '+name+' -> '+target);
      }
    }
  }
  const pres=await zip.file('ppt/presentation.xml')?.async('string');
  if(!pres)throw Error('Missing presentation.xml');
  const p=parseXml(pres)['p:presentation'];
  const slides=[];
  for(const name of names.filter(n=>/^ppt\/slides\/[^/]+\.xml$/.test(n)).sort()){
    const xml=await zip.file(name).async('string');
    slides.push({part:name,text:[...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map(m=>m[1]),placeholders:[...xml.matchAll(/<p:ph\b([^>]*?)\/?>/g)].map(m=>m[1])});
  }
  return {dimensions:p?.['p:sldSz']??null,slides,externalRelationships:external,
    themes:await Promise.all(names.filter(n=>/^ppt\/theme\/theme\d+\.xml$/.test(n)).map(async n=>({part:n,xml:await zip.file(n).async('string')}))),
    checks:{xmlFiles:xmlFiles.length,internalRelationships:'resolved',visualReview:'not performed'},
    warnings:['Text and placeholders are hints, not a full template rendering. No external relationship was fetched.']};
}
