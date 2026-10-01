import fs from 'node:fs/promises';
import { z } from 'zod';
import { TextContentSchema, TableCellSchema, estimatedTextLines, validateDeck } from './core.mjs';

const theme = JSON.parse(await fs.readFile(new URL('../assets/themes/lecture-blue.json', import.meta.url), 'utf8'));
const label = z.string().min(1).max(200).refine(value=>value.trim().length>0,'Text must not be blank');
const contentText = TextContentSchema.refine(value=>(typeof value==='string'?value:value.map(run=>run.text??run.latex).join('')).trim().length>0,'Text must not be blank');
const refs = z.array(label).default([]);
const prose = z.strictObject({ type:z.enum(['paragraph','heading']), text:contentText });
const bullets = z.strictObject({ type:z.literal('bullets'), items:z.array(contentText).min(1).max(12) });
const equation = z.strictObject({
  type:z.literal('equation'), file:label.optional(), latex:z.string().min(1).max(8000), alt:label,
  height:z.number().min(.2).max(4.8), number:label.optional(), sourceIds:z.array(label).min(1)
});
const table = z.strictObject({
  type:z.literal('table'), headers:z.array(TableCellSchema).min(1).max(8),
  rows:z.array(z.array(TableCellSchema)).min(1).max(15),colWidths:z.array(z.number().min(.05).max(30)).min(1).max(8).optional(),margin:z.number().min(0).max(.5).default(.08),align:z.enum(['left','center','right']).default('left'), sourceIds:z.array(label).min(1)
});
const callout = z.strictObject({ type:z.literal('callout'), title:label, text:contentText });
const blocks = z.array(z.discriminatedUnion('type',[prose,bullets,equation,table,callout])).min(1).max(25);
const slideFields = {
  id:label, title:label, density:z.enum(['normal','dense']).default('normal'),
  align:z.enum(['balanced','top']).default('balanced'), appendix:z.boolean().default(false),
  notes:z.string().max(20000).default(''), sourceIds:refs
};
export const LectureSchema = z.strictObject({
  title:label, course:z.string().max(100).default(''), fontFace:label.default('Arial'), mathFontFace:label.default('Cambria Math'),
  sources:z.array(z.strictObject({id:label,document:label,locator:label,text:z.string().min(1).max(16000)})).default([]),
  slides:z.array(z.discriminatedUnion('layout',[
    z.strictObject({...slideFields,layout:z.literal('single'),blocks}),
    z.strictObject({...slideFields,layout:z.literal('columns'),lead:contentText.optional(),left:blocks,right:blocks,ratio:z.number().min(.3).max(.7).default(.5)})
  ])).min(1).max(100)
});

const WIDTH=13.333333, HEIGHT=7.5, MARGIN=.458, TOP=1.02, BOTTOM=6.88, GAP=.18;
const textHeight=(text,width,size,options={})=>estimatedTextLines(text,width,size,options)*size*1.25/72+.04;

/** Compile content into the same bounded, editable element model as the free-position exporter. */
export function compileLecture(input) {
  const lecture=LectureSchema.parse(input);
  let appendixStarted=false;
  for(const slide of lecture.slides) {
    if(appendixStarted&&!slide.appendix)throw Error('Appendix slides must follow all main slides');
    appendixStarted ||= slide.appendix;
  }
  const mainCount=lecture.slides.filter(s=>!s.appendix).length;
  const appendixCount=lecture.slides.length-mainCount;
  const compiled=lecture.slides.map((s,index)=>{
    const size=s.density==='dense'?21.1:23.1;
    const elements=[],formulaNotes=[];
    let sequence=0;
    const addText=(id,text,x,y,w,h,options={})=>elements.push({id,type:'text',text:Array.isArray(text)?text.map(run=>run.latex?{...run,fontFace:run.fontFace??lecture.mathFontFace}:run):text,x,y,w,h,size,...options});
    const layoutBlocks=(content,x,y,w,emit)=>{
      const start=y;
      for(const block of content) {
        const id='block-'+(++sequence);
        if(block.type==='paragraph'||block.type==='heading') {
          const h=textHeight(block.text,w,size,{bold:block.type==='heading'});
          if(emit)addText(id,block.text,x,y,w,h,{bold:block.type==='heading'});
          y+=h;
        } else if(block.type==='bullets') {
          for(const [n,item] of block.items.entries()) {
            const indent=.44,h=textHeight(item,w-indent,size);
            if(emit) {
              addText(id+'-marker-'+n,'▸',x+.04,y,.3,h,{color:theme.primary});
              addText(id+'-item-'+n,item,x+indent,y,w-indent,h);
            }
            y+=h+.09;
          }
          y-=.09;
        } else if(block.type==='equation') {
          if(emit) {
            const inset=block.number?1:0;
            elements.push(block.file?{id,type:'image',x:x+inset,y,w:w-2*inset,h:block.height,file:block.file,alt:block.alt,sourceIds:block.sourceIds}:{id,type:'math',latex:block.latex,x:x+inset,y,w:w-2*inset,h:block.height,size,fontFace:lecture.mathFontFace,sourceIds:block.sourceIds});
            if(block.number)addText(id+'-number',block.number,x+w-.8,y+Math.max(0,(block.height-.4)/2),.8,.4,{size:18,align:'right'});
            formulaNotes.push(`[${id}] LaTeX: ${block.latex}`+(block.file?'\nRendered equation image; edit the TeX source and render again. Not a native PowerPoint equation.':''));
          }
          y+=block.height;
        } else if(block.type==='table') {
          const widths=block.colWidths??Array(block.headers.length).fill(w/block.headers.length);
          if(widths.length!==block.headers.length||Math.abs(widths.reduce((sum,width)=>sum+width,0)-w)>.001)throw Error('Table colWidths must match its columns and sum to the available width');
          const rowHeights=[block.headers,...block.rows].map((row,i)=>Math.max(size*1.8/72,...row.map((cell,j)=>estimatedTextLines(cell,Math.max(.01,(widths[j]??0)-2*block.margin),size,{fontFace:lecture.fontFace,bold:i===0})*size*1.25/72+2*block.margin+.04)));
          const h=rowHeights.reduce((sum,height)=>sum+height,0);
          if(emit)elements.push({id,type:'table',x,y,w,h,headers:block.headers,rows:block.rows,size,rowHeights,colWidths:widths,margin:block.margin,align:block.align,fontFace:lecture.fontFace,mathFontFace:lecture.mathFontFace,style:'three-line',sourceIds:block.sourceIds});
          y+=h;
        } else if(block.type==='callout') {
          const header=textHeight(block.title,w-.32,size,{bold:true}),body=textHeight(block.text,w-.32,size)+.18;
          if(emit) {
            elements.push({id:id+'-header',type:'rect',x,y,w,h:header+.12,fill:theme.primary});
            elements.push({id:id+'-body',type:'rect',x,y:y+header+.12,w,h:body,fill:'#EFF3F6'});
            addText(id+'-label',block.title,x+.16,y+.06,w-.32,header,{color:'#FFFFFF',bold:true});
            addText(id+'-text',block.text,x+.16,y+header+.21,w-.32,body-.18);
          }
          y+=header+.12+body;
        }
        y+=GAP;
      }
      return y-start-GAP;
    };
    const width=WIDTH-2*MARGIN;
    let contentHeight,leftWidth,rightWidth,leadHeight=0;
    if(s.layout==='single')contentHeight=layoutBlocks(s.blocks,MARGIN,0,width,false);
    else {
      const gutter=.5;
      leftWidth=(width-gutter)*s.ratio;rightWidth=width-gutter-leftWidth;
      if(s.lead)leadHeight=textHeight(s.lead,width,size)+GAP;
      contentHeight=leadHeight+Math.max(layoutBlocks(s.left,MARGIN,0,leftWidth,false),layoutBlocks(s.right,0,0,rightWidth,false));
    }
    if(contentHeight>BOTTOM-TOP)throw Error(`${s.id}: lecture content exceeds the body area; split the slide, shorten prose, or explicitly choose dense mode. Content was not shrunk or removed.`);
    sequence=0;
    const top=TOP+(s.align==='balanced'?(BOTTOM-TOP-contentHeight)/2:0);
    if(estimatedTextLines(s.title,WIDTH-.5,30.4,{bold:true})>1)throw Error(`${s.id}: lecture title is too long for one line; shorten it`);
    addText('title',s.title,.25,.25,WIDTH-.5,.61,{size:30.4,bold:true,color:theme.primary});
    if(s.layout==='single')layoutBlocks(s.blocks,MARGIN,top,width,true);
    else {
      if(s.lead)addText('lead',s.lead,MARGIN,top,width,leadHeight-GAP);
      layoutBlocks(s.left,MARGIN,top+leadHeight,leftWidth,true);
      layoutBlocks(s.right,MARGIN+leftWidth+.5,top+leadHeight,rightWidth,true);
    }
    if(lecture.course) {
      if(estimatedTextLines(lecture.course,WIDTH-2*MARGIN-2,12.7)>1)throw Error('Course footer is too long; use an abbreviated course name');
      addText('footer',lecture.course,MARGIN,7.12,WIDTH-2*MARGIN-2,.23,{size:12.7,color:'#9E9E9E'});
    }
    const number=s.appendix?`Appendix A${index-mainCount+1} / A${appendixCount}`:`${index+1} / ${mainCount}`;
    addText('page',number,WIDTH-MARGIN-2,7.17,2,.23,{size:12.7,align:'right'});
    return {id:s.id,title:s.title,sourceIds:s.sourceIds,notes:[s.notes,...formulaNotes].filter(Boolean).join('\n\n'),elements};
  });
  const deck={title:lecture.title,width:WIDTH,height:HEIGHT,theme:{...structuredClone(theme),fontFace:lecture.fontFace},sources:lecture.sources,slides:compiled};
  const {deck:validated,errors}=validateDeck(deck);
  if(errors.length)throw Error(errors.join('\n'));
  return validated;
}
