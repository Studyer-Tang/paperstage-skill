const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff01-\uff60]/u;
const cjkPunctuation = /^[‘’“”…—]$/u;
const opening = new Set(Array.from('（［｛〔〈《「『【〖〘〚“‘([{'));
const closing = new Set(Array.from('，。！？；：、）］｝〕〉》」』】〗〙〛”’…,.!?;:%)]}'));
const word = /[\p{Script=Latin}\p{Number}\p{Mark}_]/u;
const wordConnector = /^[.'’:/@%+\-=]$/u;
const graphemes = new Intl.Segmenter('zh-CN', {granularity:'grapheme'});

const asRuns = content => typeof content === 'string' ? [{text:content}] : content;
export const hasCjk = content => asRuns(content).some(run=>cjk.test(run.text));

// Conservative fallback advances in em, not a font renderer. No font installation is needed.
function advance(text, bold) {
  let width=0;
  for(const char of text) {
    if(/[\r\n\p{Mark}\u200d\ufe0f]/u.test(char))continue;
    width+=cjk.test(char)||cjkPunctuation.test(char)?1:/[\t]/.test(char)?1.12:/\s/u.test(char)?.28:
      /[ilI.,'`:;!|]/.test(char)?.28:/[MW@%]/.test(char)?.9:
        /[A-Z]/.test(char)?.7:/[a-z0-9]/.test(char)?.56:
          /[\p{Extended_Pictographic}]/u.test(char)?1:.65;
  }
  return width*(bold?1.04:1);
}

function unitsFrom(content, options) {
  const units=[];
  for(const run of asRuns(content)) {
    const {text,breakLine,softBreakBefore,...style}=run;
    if(typeof text!=='string')throw Error('Text runs must contain text strings');
    const segments=Array.from(graphemes.segment(text),item=>item.segment);
    segments.forEach((text,i)=>{
      const asian=cjk.test(text)||cjkPunctuation.test(text),resolved={...style,
        fontFace:style.fontFace??(asian?options.fontFace:options.latinFontFace),
        lang:style.lang??(asian?options.lang:'en-US')};
      units.push({text,style:resolved,width:advance(text,style.bold??options.bold),
        hardBefore:i===0&&Boolean(softBreakBefore),
        breakLine:i===segments.length-1&&Boolean(breakLine),
        newline:/[\r\n]/.test(text)});
    });
  }
  return units;
}

function tokensFrom(units) {
  const tokens=[];
  for(const unit of units) {
    const previous=tokens.at(-1),isWord=word.test(unit.text)&&!cjk.test(unit.text);
    // Keep words, decimals, percentages and common identifiers intact, even across styled runs.
    if(previous?.word&&(isWord||wordConnector.test(unit.text))||previous&&/^[—…]$/.test(unit.text)&&previous.units.at(-1).text===unit.text) {
      previous.units.push(unit);previous.width+=unit.width;
    } else tokens.push({units:[unit],width:unit.width,word:isWord});
  }
  return tokens;
}

function mayBreak(left,right) {
  const last=left.units.at(-1).text,first=right?.units[0].text;
  return !opening.has(last)&&!closing.has(first)&&!/^\s+$/u.test(first??'');
}

function wrapParagraph(units, capacity) {
  const tokens=tokensFrom(units),lines=[];
  let start=0;
  while(start<tokens.length) {
    let end=start,width=0,lastBreak=-1;
    while(end<tokens.length) {
      const candidate=width+tokens[end].width;
      if(candidate>capacity&&end>start&&lastBreak>start)break;
      width=candidate;end++;
      if(end===tokens.length||mayBreak(tokens[end-1],tokens[end]))lastBreak=end;
      if(width>capacity&&lastBreak>start)break;
    }
    const stop=end===tokens.length?end:lastBreak>start?lastBreak:end;
    const selected=tokens.slice(start,stop);
    lines.push({units:selected.flatMap(token=>token.units),width:selected.reduce((n,t)=>n+t.width,0),soft:start>0});
    start=stop;
  }
  return lines.length?lines:[{units:[],width:0,soft:false}];
}

function outputRuns(lines) {
  const runs=[];
  for(const line of lines)line.units.forEach((unit,index)=>{
    const softBreakBefore=(line.soft&&index===0)||unit.hardBefore;
    const previous=runs.at(-1),same=previous&&Object.entries(unit.style).every(([key,value])=>previous[key]===value)
      &&Object.keys(previous).filter(key=>!['text','breakLine','softBreakBefore'].includes(key)).length===Object.keys(unit.style).length;
    if(same&&!softBreakBefore&&!previous.breakLine)previous.text+=unit.text;
    else runs.push({text:unit.text,...unit.style,...(softBreakBefore?{softBreakBefore:true}:{})});
    if(unit.breakLine)runs.at(-1).breakLine=true;
  });
  return runs;
}

/**
 * Preserve source characters/styles, with CJK-aware soft-break metadata for PptxGenJS.
 * Width is inches; size is points. A fallback estimate still needs final viewer review.
 */
export function layoutCjkText(content, {width,size,fontFace='Noto Sans CJK SC',latinFontFace='Arial',lang='zh-CN',bold=false,widthFactor=1.03}={}) {
  if(!Number.isFinite(width)||width<=0||!Number.isFinite(size)||size<=0||!Number.isFinite(widthFactor)||widthFactor<=0)
    throw Error('Text width, size and widthFactor must be positive finite numbers');
  const capacity=width*72/size/widthFactor,units=unitsFrom(content,{fontFace,latinFontFace,lang,bold}),paragraphs=[];
  let paragraph=[];
  for(const unit of units) {
    if(unit.hardBefore&&paragraph.length){paragraphs.push(paragraph);paragraph=[];}
    paragraph.push(unit);
    if(unit.newline||unit.breakLine){paragraphs.push(paragraph);paragraph=[];}
  }
  if(paragraph.length||!paragraphs.length||units.at(-1)?.newline||units.at(-1)?.breakLine)paragraphs.push(paragraph);
  const lines=paragraphs.flatMap(part=>wrapParagraph(part,capacity));
  return {
    runs:outputRuns(lines),lineCount:lines.length,
    lines:lines.map(line=>line.units.map(unit=>unit.text).join('').replace(/[\r\n]+$/,'')),
    overflows:lines.flatMap((line,index)=>line.width>capacity+1e-9?[{line:index+1,widthEm:line.width,capacityEm:capacity}]:[])
  };
}
