import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { z } from 'zod';
import { compileMath } from './math.mjs';
import { hasCjk, layoutCjkText } from './typography.mjs';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const label = z.string().min(1).max(200);
const box = { x:z.number().nonnegative(), y:z.number().nonnegative(), w:z.number().positive(), h:z.number().positive() };
const shared = { id:label, ...box };
const run = z.strictObject({ text:z.string().min(1).max(5000), bold:z.boolean().optional(), italic:z.boolean().optional(), color:hex.optional(), fontFace:label.optional(), breakLine:z.boolean().optional(), softBreakBefore:z.boolean().optional(), lang:label.optional() });
const mathRun = z.strictObject({latex:z.string().min(1).max(8000),color:hex.optional(),fontFace:label.optional(),breakLine:z.boolean().optional(),softBreakBefore:z.boolean().optional()});
export const TextContentSchema = z.union([z.string().min(1).max(5000),z.array(z.union([run,mathRun])).min(1).max(200).refine(runs=>runs.reduce((n,r)=>n+(r.text??r.latex).length,0)<=5000,'Text exceeds 5,000 characters')]);
export const TableCellSchema = z.union([z.string().max(300),z.array(z.union([run,mathRun])).min(1).max(40).refine(runs=>runs.reduce((n,r)=>n+(r.text??r.latex).length,0)<=1000,'Table cell exceeds 1,000 source characters')]);
const text = z.strictObject({ ...shared, type:z.literal('text'), text:TextContentSchema, size:z.number().min(8).max(96).default(22), bold:z.boolean().default(false), italic:z.boolean().default(false), fontFace:label.optional(), color:hex.optional(), align:z.enum(['left','center','right']).default('left') });
const math = z.strictObject({...shared,type:z.literal('math'),latex:z.string().min(1).max(8000),size:z.number().min(8).max(96).default(24),fontFace:label.default('Cambria Math'),color:hex.optional(),align:z.enum(['left','center','right']).default('center'),sourceIds:z.array(label).default([])});
const rect = z.strictObject({ ...shared, type:z.literal('rect'), fill:hex, line:z.strictObject({color:hex,width:z.number().positive().max(10).default(.75)}).optional() });
const chart = z.strictObject({ ...shared, type:z.literal('chart'), chartType:z.enum(['bar','line']), labels:z.array(label).min(1).max(30), series:z.array(z.strictObject({name:label,values:z.array(z.number().finite()).min(1).max(30)})).min(1).max(8), unit:z.string().max(80).default(''), sourceIds:z.array(label).min(1) });
const table = z.strictObject({ ...shared, type:z.literal('table'), headers:z.array(TableCellSchema).min(1).max(10), rows:z.array(z.array(TableCellSchema)).min(1).max(30), size:z.number().min(12).max(32).default(18), fontFace:label.optional(),mathFontFace:label.default('Cambria Math'), margin:z.number().min(0).max(.5).default(.08),align:z.enum(['left','center','right']).default('left'), style:z.enum(['grid','three-line']).default('grid'), rowHeights:z.array(z.number().min(.05).max(20)).min(1).max(31).optional(), colWidths:z.array(z.number().min(.05).max(30)).min(1).max(10).optional(), sourceIds:z.array(label).min(1) });
const image = z.strictObject({ ...shared, type:z.literal('image'), file:label, alt:label, sourceIds:z.array(label).min(1) });
export const ThemeSchema = z.strictObject({
  name:label.default('Academic blue'), institution:z.string().max(120).default(''), fontFace:label.default('Arial'),
  primary:hex.default('#244CCB'), ink:hex.default('#1B2434'), background:hex.default('#FFFFFF'),
  chartColors:z.array(hex).min(1).max(8).default(['#244CCB','#66816C','#B76642']), footer:z.string().max(160).default(''),
  logo:z.strictObject({file:label,...box}).optional()
});
export const DeckSchema = z.strictObject({
  title:label, width:z.number().min(4).max(30).default(13.333333), height:z.number().min(3).max(20).default(7.5),
  theme:ThemeSchema.prefault({}), transition:z.enum(['none','fade']).default('none'),
  sources:z.array(z.strictObject({ id:label, document:label, locator:label, text:z.string().min(1).max(16000) })).max(2000).default([]),
  slides:z.array(z.strictObject({
    id:label, title:label, notes:z.string().max(30000).default(''), sourceIds:z.array(label).default([]),
    elements:z.array(z.discriminatedUnion('type',[text,math,rect,chart,table,image])).min(1).max(80)
  })).min(1).max(100)
});

function luminance(c) {
  const v=c.slice(1).match(/../g).map(n=>parseInt(n,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);
  return .2126*v[0]+.7152*v[1]+.0722*v[2];
}
const contrast=(a,b)=>{ const v=[luminance(a),luminance(b)].sort((a,b)=>b-a);return(v[0]+.05)/(v[1]+.05); };
const contains=(a,b)=>a.x<=b.x&&a.y<=b.y&&a.x+a.w>=b.x+b.w&&a.y+a.h>=b.y+b.h;
export function estimatedTextLines(content,width,size,options={}) {
  if(hasCjk(content)&&!(Array.isArray(content)&&content.some(r=>r.latex)))return layoutCjkText(content,{width,size,...options}).lineCount;
  const capacity=Math.max(1,width*72/size);
  const plain=typeof content==='string'?content:content.map(r=>(r.softBreakBefore?'\n':'')+(r.text??r.latex)+(r.breakLine?'\n':'')).join('');
  // Each explicit paragraph wraps separately. Combining marks add no width.
  return plain.replaceAll('\r\n','\n').split('\n').reduce((sum,line)=>{
    const units=Array.from(line).reduce((n,c)=>n+(/\p{Mark}/u.test(c)?0:/[^\u0000-\u00ff]/.test(c)?1:.55),0);
    return sum+Math.max(1,Math.ceil(units/capacity));
  },0);
}
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
    for(const [index,e] of slide.elements.entries()) {
      const where=slide.id+'/'+e.id;
      if(elementIds.has(e.id))errors.push(where+': duplicate element ID');elementIds.add(e.id);
      inBounds(e,where);
      if(e.sourceIds)checkRefs(e.sourceIds,where);
      const contents=e.type==='text'?[e.text]:e.type==='table'?[...e.headers,...e.rows.flat()]:[];
      const formulas=e.type==='math'?[e.latex]:contents.flatMap(content=>Array.isArray(content)?content.flatMap(r=>r.latex?[r.latex]:[]):[]);
      for(const latex of formulas)try{compileMath(latex);}catch(error){errors.push(where+': '+error.message);}
      if(e.type==='text') {
        const options={fontFace:e.fontFace??deck.theme.fontFace,bold:e.bold};
        const layout=hasCjk(e.text)&&!(Array.isArray(e.text)&&e.text.some(r=>r.latex))?layoutCjkText(e.text,{width:e.w,size:e.size,...options}):null;
        if((layout?.lineCount??estimatedTextLines(e.text,e.w,e.size,options))*e.size*1.25>e.h*72)warnings.push(where+': possible text overflow; render and inspect');
        if(layout?.overflows.length)warnings.push(where+': text may exceed its width; render and inspect');
        const background=slide.elements.slice(0,index).findLast(r=>r.type==='rect'&&contains(r,e))?.fill??deck.theme.background;
        const colors=typeof e.text==='string'?[e.color??deck.theme.ink]:e.text.map(r=>r.color??e.color??deck.theme.ink);
        if(colors.some(color=>contrast(color,background)<4.5))warnings.push(where+': text contrast below 4.5:1');
      }
      if(e.type==='chart'&&e.series.some(s=>s.values.length!==e.labels.length))errors.push(where+': label/value count mismatch');
      if(e.type==='table') {
        if(e.rows.some(r=>r.length!==e.headers.length))errors.push(where+': non-rectangular table');
        if(e.colWidths) {
          if(e.colWidths.length!==e.headers.length)errors.push(where+': colWidths must include every column');
          if(Math.abs(e.colWidths.reduce((sum,w)=>sum+w,0)-e.w)>.001)errors.push(where+': colWidths must sum to the table width');
        }
        const widths=e.colWidths??Array(e.headers.length).fill(e.w/e.headers.length),rows=[e.headers,...e.rows];
        const lines=(cell,i,j)=>estimatedTextLines(cell,Math.max(.01,(widths[j]??0)-2*e.margin),e.size,{fontFace:e.fontFace??deck.theme.fontFace,bold:i===0});
        if(rows.some((row,i)=>row.some(cell=>(typeof cell==='string'?[{text:cell}]:cell).some(r=>contrast(r.color??(i===0?deck.theme.primary:deck.theme.ink),deck.theme.background)<4.5))))warnings.push(where+': table text contrast below 4.5:1');
        if(e.rowHeights) {
          if(e.rowHeights.length!==e.rows.length+1)errors.push(where+': rowHeights must include the header and every data row');
          if(e.rowHeights.reduce((sum,h)=>sum+h,0)>e.h+.001)errors.push(where+': rowHeights exceed the table height');
          if(rows.some((row,i)=>row.some((cell,j)=>lines(cell,i,j)*e.size*1.25/72+2*e.margin>(e.rowHeights[i]??0)+.001)))warnings.push(where+': table row may exceed its height; render and inspect');
        } else {
          if((e.rows.length+1)*e.size*1.8>e.h*72)warnings.push(where+': table may exceed its height');
          if(rows.some((row,i)=>row.some((cell,j)=>lines(cell,i,j)>1)))warnings.push(where+': table cell may wrap; inspect rendered row heights');
        }
      }
    }
    for(let i=0;i<slide.elements.length;i++)for(let j=i+1;j<slide.elements.length;j++){
      const a=slide.elements[i],b=slide.elements[j];
      if(a.type==='rect'&&contains(a,b))continue;
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
    if(b.length<33||b.readUInt32BE(8)!==13||b.toString('ascii',12,16)!=='IHDR')throw Error('Invalid PNG IHDR header');
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
        if(length<8||!b[at+7]||length!==8+3*b[at+7])throw Error('Invalid JPEG frame');
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
  const mathBySlide=[];
  const sourceMap=new Map(deck.sources.map(s=>[s.id,s]));
  for(const [i,s] of deck.slides.entries()) {
    const equations=new Map();mathBySlide.push(equations);
    const equationRun=(latex,options)=>{const token='PSMATH_'+crypto.randomUUID().replaceAll('-','');equations.set(token,compileMath(latex,options));return token;};
    const renderText=(content,{width,size,fontFace=deck.theme.fontFace,mathFontFace='Cambria Math',bold=false,italic=false,color=deck.theme.ink})=>{
      let runs=typeof content==='string'?[{text:content}]:content;
      if(hasCjk(runs)&&!runs.some(r=>r.latex))runs=layoutCjkText(runs,{width,size,fontFace,bold}).runs;
      return runs.map(({text,latex,color:runColor,...options})=>({
        text:latex?equationRun(latex,{size,color:runColor??color,fontFace:options.fontFace??mathFontFace,display:false}):text,
        options:{...options,fontFace:options.fontFace??fontFace,bold:options.bold??bold,italic:options.italic??italic,color:col(runColor??color)}
      }));
    };
    const slide=pptx.addSlide();slide.background={color:col(deck.theme.background)};
    for(const e of s.elements) {
      const pos={x:e.x,y:e.y,w:e.w,h:e.h,objectName:e.id};
      if(e.type==='text') {
        const fontFace=e.fontFace??deck.theme.fontFace;
        const content=renderText(e.text,{...e,width:e.w,fontFace,color:e.color??deck.theme.ink});
        slide.addText(content,{...pos,fontFace,fontSize:e.size,bold:false,italic:false,color:col(e.color??deck.theme.ink),align:e.align,margin:0,valign:'top',breakLine:false});
      }
      if(e.type==='math')slide.addText(equationRun(e.latex,{size:e.size,color:e.color??deck.theme.ink,fontFace:e.fontFace}),{...pos,fontSize:e.size,fontFace:e.fontFace,align:e.align,margin:0,valign:'mid'});
      if(e.type==='rect')slide.addShape(pptx.ShapeType.rect,{...pos,fill:{color:col(e.fill)},line:e.line?{color:col(e.line.color),width:e.line.width}:{color:col(e.fill),transparency:100}});
      if(e.type==='image') {const data=await raster(e.file,base);slide.addImage({data,...contain(data,e),altText:e.alt,objectName:e.id});}
      if(e.type==='chart')slide.addChart(pptx.ChartType[e.chartType],e.series.map(v=>({name:v.name,labels:e.labels,values:v.values})),{
        ...pos,chartColors:deck.theme.chartColors.map(col),showLegend:e.series.length>1,legendFontSize:12,
        catAxisLabelFontFace:deck.theme.fontFace,catAxisLabelFontSize:12,valAxisLabelFontFace:deck.theme.fontFace,valAxisLabelFontSize:12,
        showValue:false,showCatName:false,showTitle:false,showBorder:false,
        showValueTitle:Boolean(e.unit),valAxisTitle:e.unit,valAxisTitleFontSize:12
      });
      if(e.type==='table') {
        const widths=e.colWidths??Array(e.headers.length).fill(e.w/e.headers.length),fontFace=e.fontFace??deck.theme.fontFace;
        const rows=[e.headers,...e.rows].map((row,i)=>row.map((cell,j)=>({text:renderText(cell,{width:Math.max(.01,widths[j]-2*e.margin),size:e.size,fontFace,mathFontFace:e.mathFontFace,bold:i===0,color:i===0?deck.theme.primary:deck.theme.ink}),options:{
          bold:false,italic:false,align:e.align,fill:col(deck.theme.background),
          ...(e.style==='three-line'?{border:[i===0?1:0,0,i===0?.75:i===e.rows.length?1:0,0].map(pt=>({type:pt?'solid':'none',pt,color:col(deck.theme.ink)}))}:{})
        }})));
        slide.addTable(rows,{
          ...pos,fontFace,fontSize:e.size,color:col(deck.theme.ink),margin:e.margin,border:{pt:.5,color:'D6DCE4'},
          colW:widths,rowH:e.rowHeights??e.h/(e.rows.length+1),autoPage:false
        });
      }
    }
    if(deck.theme.logo){const e=deck.theme.logo,data=await raster(e.file,base);slide.addImage({data,...contain(data,e),altText:deck.theme.institution+' logo'});}
    if(deck.theme.footer)slide.addText(deck.theme.footer,{x:.4,y:deck.height-.32,w:deck.width-.8,h:.2,fontSize:9,fontFace:deck.theme.fontFace,color:col(deck.theme.ink),margin:0});
    const refs=[...new Set([...s.sourceIds,...s.elements.flatMap(e=>e.sourceIds??[])])];
    slide.addNotes([s.notes,...refs.map(id=>{const r=sourceMap.get(id);return '['+id+'] '+r.document+'; '+r.locator+'\n'+r.text;})].join('\n\n'));
  }
  // Compress once after fixing the generated manifest and adding optional transitions.
  const zip=await JSZip.loadAsync(await pptx.write({outputType:'nodebuffer',compression:false}));
  const types=await zip.file('[Content_Types].xml').async('string');
  // PptxGenJS 4.0.1 declares one master per slide but writes only master 1.
  // Remove only those surplus declarations in our newly generated package.
  zip.file('[Content_Types].xml',types.replace(/<Override PartName="(\/ppt\/slideMasters\/slideMaster(\d+)\.xml)" ContentType="application\/vnd\.openxmlformats-officedocument\.presentationml\.slideMaster\+xml"\/>/g,
    (entry,part,index)=>Number(index)>1&&!zip.file(part.slice(1))?'':entry));
  for(const [index,equations] of mathBySlide.entries()) {
    const name=`ppt/slides/slide${index+1}.xml`;
    let xml=await zip.file(name).async('string');
    xml=xml.replace(/<a:r>[\s\S]*?<\/a:r>/g,whole=>{
      const token=whole.match(/<a:t>(PSMATH_[a-f0-9]+)<\/a:t>/)?.[1];
      if(!token||!equations.has(token))return whole;
      const result=equations.get(token);equations.delete(token);return result;
    });
    if(equations.size)throw Error('Equation placeholder was not replaced');
    // PptxGenJS repeats paragraph properties between rich runs; OOXML permits one.
    xml=xml.replace(/<a:p>[\s\S]*?<\/a:p>/g,paragraph=>{
      let first;
      return paragraph.replace(/<a:pPr\b[^>]*(?:\/>|>[\s\S]*?<\/a:pPr>)/g,properties=>{
        if(first===undefined){first=properties;return properties;}
        if(properties!==first)throw Error('Conflicting generated paragraph properties');
        return '';
      });
    });
    if(hasCjk(deck.slides[index].elements.flatMap(e=>e.type==='text'?[e.text]:e.type==='table'?[...e.headers,...e.rows.flat()]:[]).flatMap(content=>typeof content==='string'?[{text:content}]:content)))
      xml=xml.replace(/<a:pPr(?=[\s/>])/g,'<a:pPr eaLnBrk="1" latinLnBrk="0" hangingPunct="0"');
    parseXml(xml);zip.file(name,xml);
  }
  if(deck.transition==='fade')for(const name of Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n))){
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
  const contentTypes=await zip.file('[Content_Types].xml')?.async('string');
  if(!contentTypes)throw Error('Missing [Content_Types].xml');
  parseXml(contentTypes);
  const types=new XMLParser({ignoreAttributes:false,processEntities:false,removeNSPrefix:true}).parse(contentTypes).Types;
  if(!types)throw Error('Invalid content types manifest');
  const overrides=types.Override??[];
  for(const entry of Array.isArray(overrides)?overrides:[overrides]) {
    const part=entry['@_PartName'];
    if(typeof part!=='string'||!part.startsWith('/')||!zip.file(part.slice(1)))throw Error('Broken content-type override: '+part);
  }
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
  for(const name of names.filter(n=>/^ppt\/slides\/[^/]+\.xml$/.test(n)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))){
    const xml=await zip.file(name).async('string');
    slides.push({part:name,mathCount:(xml.match(/<a14:m\b/g)??[]).length,mathText:[...xml.matchAll(/<m:t(?:\s[^>]*)?>([\s\S]*?)<\/m:t>/g)].map(m=>m[1]),text:[...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map(m=>m[1]),placeholders:[...xml.matchAll(/<p:ph\b([^>]*?)\/?>/g)].map(m=>m[1])});
  }
  return {dimensions:p?.['p:sldSz']??null,slides,externalRelationships:external,
    themes:await Promise.all(names.filter(n=>/^ppt\/theme\/theme\d+\.xml$/.test(n)).map(async n=>({part:n,xml:await zip.file(n).async('string')}))),
    checks:{xmlFiles:xmlFiles.length,internalRelationships:'resolved',contentTypeOverrides:'resolved',visualReview:'not performed'},
    warnings:['Text and placeholders are hints, not a full template rendering. No external relationship was fetched.']};
}
