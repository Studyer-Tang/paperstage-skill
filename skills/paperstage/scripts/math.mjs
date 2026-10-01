import temml from 'temml';
import {XMLParser,XMLValidator} from 'fast-xml-parser';

const NS={a14:'http://schemas.microsoft.com/office/drawing/2010/main',a:'http://schemas.openxmlformats.org/drawingml/2006/main',m:'http://schemas.openxmlformats.org/officeDocument/2006/math'};
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const tag=(name,body='')=>`<m:${name}>${body}</m:${name}>`;
const value=(name,v)=>`<m:${name} m:val="${escape(v)}"/>`;
const textOf=n=>n.name==='#text'?n.text:n.children.map(textOf).join('');
const unwrap=n=>n.name==='mrow'&&n.children.length===1?unwrap(n.children[0]):n;
const accents={'ˆ':'̂','^':'̂','~':'̃','˜':'̃','‾':'̄','¯':'̄','→':'⃗','˙':'̇','¨':'̈','…':'⃛','….':'⃜','ˇ':'̌','˘':'̆','´':'́','`':'̀'};
const naryChars=new Set(['∑','∏','∐','∫','∬','∭','∮','∯','∰','⋃','⋂','⋁','⋀']);
const naryBase=n=>n.name==='mo'&&naryChars.has(textOf(n))?textOf(n):['msub','msup','msubsup','munder','mover','munderover'].includes(n.name)&&naryChars.has(textOf(n.children[0]))?textOf(n.children[0]):null;

function parseMathml(xml) {
  if(xml.length>256000||/<!|<\?|\b(?:href|src)\s*=/i.test(xml))throw Error('Unsafe or oversized MathML');
  if(XMLValidator.validate(xml)!==true)throw Error('Invalid generated MathML');
  const parsed=new XMLParser({preserveOrder:true,ignoreAttributes:false,processEntities:true,parseTagValue:false,trimValues:false}).parse(xml);
  let count=0;
  const read=(entry,depth=0)=>{
    if(++count>4000||depth>64)throw Error('Equation is too deeply nested or complex');
    const name=Object.keys(entry).find(k=>k!==':@');
    if(name==='#text')return {name,text:String(entry[name]),children:[]};
    return {name,attrs:Object.fromEntries(Object.entries(entry[':@']??{}).map(([k,v])=>[k.slice(2),String(v)])),children:entry[name].map(c=>read(c,depth+1))};
  };
  const root=parsed.map(e=>read(e));
  if(root.length!==1||root[0].name!=='math')throw Error('Expected one MathML equation');
  return root[0];
}

function runProperties(style) {
  return `<a:rPr sz="${Math.round(style.size*100)}" b="${style.bold?1:0}" i="${style.italic?1:0}"${style.spacing===undefined?'':` spc="${Math.round(style.spacing*100)}"`}><a:solidFill><a:srgbClr val="${style.color.slice(1)}"/></a:solidFill><a:latin typeface="${escape(style.fontFace)}"/><a:ea typeface="${escape(style.fontFace)}"/><a:cs typeface="${escape(style.fontFace)}"/></a:rPr>`;
}
function run(text,style,{normal=false,align=false}={}) {
  const properties=(normal?'<m:nor/>':'')+value('sty',style.bold?(style.italic?'bi':'b'):(style.italic?'i':'p'))+(align?'<m:aln/>':'');
  // MS-ODRAWXML §3.5's PowerPoint example uses DrawingML properties with OMML text.
  return tag('r',(properties?tag('rPr',properties):'')+runProperties(style)+`<m:t xml:space="preserve">${escape(text)}</m:t>`);
}
const control=style=>tag('ctrlPr',runProperties(style));

function styled(node,base) {
  const style={...base},attrs=node.attrs;
  if(attrs.minsize||attrs.maxsize) {
    if(node.name!=='mo'||attrs.fence!=='true'||attrs.minsize!==attrs.maxsize||!/^(?:\d+(?:\.\d+)?|\.\d+)em$/.test(attrs.minsize)||parseFloat(attrs.minsize)>4)throw Error('Unsupported fixed delimiter sizing');
    style.size*=parseFloat(attrs.minsize);
  }
  if(attrs.mathvariant){
    if(!['normal','italic','bold','bold-italic'].includes(attrs.mathvariant))throw Error('Unsupported math variant: '+attrs.mathvariant);
    style.italic=attrs.mathvariant.includes('italic');style.bold=attrs.mathvariant.includes('bold');
  }
  for(const declaration of (attrs.style??'').split(';').filter(Boolean)) {
    const at=declaration.indexOf(':'),name=declaration.slice(0,at).trim(),v=declaration.slice(at+1).trim();
    if(name==='color'&&/^#[0-9a-f]{6}$/i.test(v))style.color=v;
    else if(name==='margin-left'&&/^-?[\d.]+em$/.test(v))style.spacing=parseFloat(v)*style.size;
    else if(!['display','math-depth','padding-left','padding-right','padding-top','padding-bottom','vertical-align','text-align'].includes(name))throw Error('Unsupported math style: '+name);
  }
  for(const key of Object.keys(attrs))if(!['xmlns','display','class','style','mathvariant','displaystyle','scriptlevel','stretchy','fence','form','separator','movablelimits','lspace','rspace','width','height','symmetric','minsize','maxsize','notation','accent','accentunder','columnalign','rowalign','columnspacing','rowspacing','linethickness'].includes(key))throw Error('Unsupported MathML attribute: '+key);
  return style;
}

function sequence(nodes,style) {
  let xml='';
  const term=i=>{
    const node=unwrap(nodes[i]),next=nodes[i+1]&&unwrap(nodes[i+1]);
    if(naryBase(node)&&next&&(next.name!=='mo'||naryBase(next))) {
      const operand=term(i+1);return {xml:renderNary(node,style,operand.xml),next:operand.next};
    }
    return {xml:render(nodes[i],style),next:i+1};
  };
  for(let i=0;i<nodes.length;) {
    const rendered=term(i);xml+=rendered.xml;i=rendered.next;
  }
  return xml;
}

function scripts(base,sub,sup,style,pre=false) {
  const kind=pre?'sPre':sub&&sup?'sSubSup':sub?'sSub':'sSup';
  return tag(kind,tag(kind+'Pr',control(style))+(pre?'':tag('e',base))+(sub?tag('sub',sub):pre?tag('sub'):'')+(sup?tag('sup',sup):pre?tag('sup'):'')+(pre?tag('e',base):''));
}
function renderNary(node,style,operand='') {
  const [base,second,third]=node.children,lower=['msub','msubsup','munder','munderover'].includes(node.name),upper=['msup','msubsup','mover','munderover'].includes(node.name);
  return tag('nary',tag('naryPr',value('chr',naryBase(node))+value('limLoc',node.name.includes('under')||node.name==='mover'?'undOvr':'subSup')+value('grow','1')+value('subHide',lower?'0':'1')+value('supHide',upper?'0':'1')+control(style))+tag('sub',lower?render(second,style):'')+tag('sup',upper?render(lower?third:second,style):'')+tag('e',operand));
}
function delimiters(children,style) {
  const first=children[0],last=children.at(-1);
  if(children.length<2||first.name!=='mo'||last.name!=='mo'||first.attrs.fence!=='true'||last.attrs.fence!=='true'||first.attrs.stretchy!=='true'||last.attrs.stretchy!=='true')return null;
  return tag('d',tag('dPr',value('begChr',textOf(first))+value('endChr',textOf(last))+value('grow','1')+control(style))+tag('e',sequence(children.slice(1,-1),style)));
}
function renderTable(node,style) {
  if(!node.children.length||node.children.length>30||node.children.some(r=>r.name!=='mtr'||!r.children.length||r.children.length>12||r.children.some(c=>c.name!=='mtd')))throw Error('Unsupported or oversized equation table');
  const columns=node.children[0].children.length;
  if(node.children.some(r=>r.children.length!==columns))throw Error('Equation table must be rectangular');
  const aligned=node.children.some(r=>r.children.some(c=>/tml-(left|right)/.test(c.attrs.class??'')));
  if(aligned) {
    // DrawingML forbids matrix column-justification properties. Use equation alignment marks.
    return tag('eqArr',tag('eqArrPr',control(style))+node.children.map(row=>tag('e',row.children.map((cell,i)=>(i?run('\u200B',style,{align:true}):'')+render(cell,style)).join(''))).join(''));
  }
  return tag('m',tag('mPr',value('baseJc','center')+value('plcHide','1')+tag('mcs',tag('mc',tag('mcPr',value('count',columns))))+control(style))+node.children.map(row=>tag('mr',row.children.map(cell=>tag('e',render(cell,style))).join(''))).join(''));
}

function render(node,base) {
  if(node.name==='#text'){if(node.text.trim())throw Error('Unexpected bare MathML text');return '';}
  const style=styled(node,base),c=node.children,e=n=>render(n,style),content=()=>sequence(c,style);
  if(node.name==='mo'&&naryBase(node))return renderNary(node,style);
  if(['mi','mn','mo','mtext','ms'].includes(node.name)) {
    if(c.some(n=>n.name!=='#text'))throw Error('Nested content in a math token');
    const text=textOf(node),italic=node.attrs.mathvariant?style.italic:node.name==='mi'&&/^[A-Za-z\u0370-\u03ff]$/u.test(text);
    return run(text,{...style,italic},{normal:node.name==='mtext'||node.name==='ms'});
  }
  if(['math','mrow'].includes(node.name)) {
    if(style.spacing!==undefined&&!c.length)return run('\u200B',style);
    return delimiters(c,style)??content();
  }
  if(['mstyle','mtd'].includes(node.name))return content();
  if(node.name==='mpadded') {
    if(Object.keys(node.attrs).some(k=>k!=='lspace')||node.attrs.lspace!=='0')throw Error('Unsupported padded equation');
    return content();
  }
  if(node.name==='mspace') {
    if(node.attrs.height) {
      // Temml's radical strut has no content; native radicals determine their own clearance.
      if(node.attrs.width==='0pt'&&node.attrs.height==='0.5em')return '';
      throw Error('Unsupported vertical math spacing');
    }
    if(!node.attrs.width)return ''; // MathML's default width is zero.
    if(!/^-?(?:\d+\.?\d*|\.\d+)(?:em|ex|pt|px)$/.test(node.attrs.width??''))throw Error('Unsupported math spacing');
    const width=parseFloat(node.attrs.width),factor=node.attrs.width.endsWith('em')?style.size:node.attrs.width.endsWith('ex')?style.size/2:node.attrs.width.endsWith('px')?.75:1;
    return run('\u200B',{...style,spacing:width*factor});
  }
  if(node.name==='mfrac') {
    if(c.length!==2)throw Error('A fraction requires numerator and denominator');
    const thickness=node.attrs.linethickness;
    if(thickness&&thickness!=='0px'&&thickness!=='0')throw Error('Unsupported fraction rule thickness');
    return tag('f',tag('fPr',value('type',thickness?'noBar':'bar')+control(style))+tag('num',e(c[0]))+tag('den',e(c[1])));
  }
  if(['msqrt','mroot'].includes(node.name)) {
    if(node.name==='mroot'&&c.length!==2)throw Error('A root requires radicand and index');
    return tag('rad',tag('radPr',value('degHide',node.name==='msqrt'?'1':'0')+control(style))+tag('deg',node.name==='mroot'?e(c[1]):'')+tag('e',node.name==='mroot'?e(c[0]):content()));
  }
  if(['msub','msup','msubsup','munder','mover','munderover'].includes(node.name)) {
    if(c.length!==(node.name==='msubsup'||node.name==='munderover'?3:2))throw Error('Invalid equation scripts');
    if(naryBase(node))return renderNary(node,style);
    if(node.attrs.accent==='false'&&c[0].name==='mo'&&c[0].attrs.stretchy==='true'&&c[0].attrs.lspace==='0'&&c[0].attrs.rspace==='0') {
      // Temml's xArrow labels contain an invisible nested limit solely to set CSS min-width.
      const labels=c.slice(1).map(label=>['mover','munder'].includes(label.name)&&label.children.length===2&&label.children[1].name==='mspace'&&Object.keys(label.children[1].attrs).length===1&&/^\d+\.\d{4}em$/.test(label.children[1].attrs.width??'')?label.children[0]:label);
      if(labels.some((label,i)=>label!==c[i+1]))return render({...node,children:[c[0],...labels]},base);
    }
    if(['msub','msup','msubsup'].includes(node.name))return scripts(e(c[0]),node.name!=='msup'?e(c[1]):'',node.name!=='msub'?e(c.at(-1)):'',style);
    if(node.name==='munderover')return tag('limUpp',tag('limUppPr',control(style))+tag('e',tag('limLow',tag('e',e(c[0]))+tag('lim',e(c[1]))))+tag('lim',e(c[2])));
    const under=node.name==='munder',mark=textOf(c[1]);
    if(c[1].name==='mo'&&['‾','¯'].includes(mark))return tag('bar',tag('barPr',value('pos',under?'bot':'top')+control(style))+tag('e',e(c[0])));
    if(c[1].name==='mo'&&accents[mark]&&!under)return tag('acc',tag('accPr',value('chr',accents[mark])+control(style))+tag('e',e(c[0])));
    if(c[1].name==='mo'&&['⏟','⏞','⏜','⏝'].includes(mark))return tag('groupChr',tag('groupChrPr',value('chr',mark)+value('pos',under?'bot':'top')+value('vertJc',under?'top':'bot')+control(style))+tag('e',e(c[0])));
    const kind=under?'limLow':'limUpp';return tag(kind,tag(kind+'Pr',control(style))+tag('e',e(c[0]))+tag('lim',e(c[1])));
  }
  if(node.name==='mmultiscripts') {
    const split=c.findIndex(n=>n.name==='mprescripts'),post=c.slice(1,split<0?c.length:split),pre=split<0?[]:c.slice(split+1);
    if(!c.length||post.length>2||pre.length>2||post.length%2||pre.length%2)throw Error('Only one pre/post script pair is supported');
    const part=n=>!n||n.name==='none'?'':e(n);
    let result=e(c[0]);if(post.length)result=scripts(result,part(post[0]),part(post[1]),style);
    if(pre.length)result=scripts(result,part(pre[0]),part(pre[1]),style,true);return result;
  }
  if(node.name==='menclose') {
    if(!['top','bottom'].includes(node.attrs.notation))throw Error('Unsupported equation enclosure');
    return tag('bar',tag('barPr',value('pos',node.attrs.notation==='top'?'top':'bot')+control(style))+tag('e',content()));
  }
  if(node.name==='mtable')return renderTable(node,style);
  throw Error('Unsupported MathML element: '+node.name);
}

/** Native PowerPoint math, for insertion into an a:p; no TeX, network or raster runtime. */
export function compileMath(latex,{size=24,fontFace='Cambria Math',color='#000000',display=true}={}) {
  if(typeof latex!=='string'||!latex.trim()||latex.length>8000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(latex))throw Error('Equation must contain 1–8,000 valid characters');
  if(!Number.isFinite(size)||size<8||size>96||typeof fontFace!=='string'||!fontFace.trim()||fontFace.length>200||/[\u0000-\u001f]/.test(fontFace)||typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color)||typeof display!=='boolean')throw Error('Invalid equation formatting');
  let depth=0;for(const c of latex){if(c==='{')depth++;if(c==='}')depth--;if(depth>48)throw Error('Equation is too deeply nested');}
  // Temml 0.13.5 reverses the conventional \prescript{upper}{lower}{base} macro.
  const macros={'\\prescript':'\\pres@cript{_{#2}^{#1}}{}{#3}'};
  const mathml=temml.renderToString(latex,{displayMode:display,throwOnError:true,strict:true,trust:false,xml:true,maxExpand:500,maxSize:[20,20],macros});
  const body=render(parseMathml(mathml),{size,fontFace,color,display,bold:false,italic:false});
  if(!body)throw Error('Equation produced no mathematical content');
  const result=`<a14:m xmlns:a14="${NS.a14}" xmlns:a="${NS.a}" xmlns:m="${NS.m}">${tag('oMath',body)}</a14:m>`;
  if(result.length>512000||XMLValidator.validate(result)!==true)throw Error('Invalid or oversized native equation');
  return result;
}
