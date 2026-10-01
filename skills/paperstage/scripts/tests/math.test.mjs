import test from 'node:test';
import assert from 'node:assert/strict';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {compileMath} from '../math.mjs';

const parse=xml=>new XMLParser({ignoreAttributes:false,parseTagValue:false,trimValues:false}).parse(xml);
function nodes(tree,name) {
  const found=[];
  const visit=value=>{
    if(!value||typeof value!=='object')return;
    for(const [key,child] of Object.entries(value)) {
      if(key===name)found.push(...(Array.isArray(child)?child:[child]));
      if(Array.isArray(child))child.forEach(visit);else visit(child);
    }
  };
  visit(tree);return found;
}
const text=tree=>nodes(tree,'m:t').map(t=>typeof t==='string'?t:t['#text']??'').join('');

test('PowerPoint math uses a14:m, one oMath and DrawingML runs without forbidden Word children',()=>{
  const xml=compileMath(String.raw`x^2+\frac{1}{n}`,{size:27.5,fontFace:'Cambria Math',color:'#1F4E79'}),tree=parse(xml);
  assert.equal(XMLValidator.validate(xml),true);assert.ok(tree['a14:m']);assert.equal(nodes(tree,'m:oMath').length,1);
  assert.doesNotMatch(xml,/<w:|<a:t\b|<m:mcJc\b|<m:[cr]Sp(?:Rule)?\b/);
  for(const run of nodes(tree,'m:r')) {
    assert.ok(run['m:t']);assert.equal(run['a:rPr']['@_sz'],'2750');
    assert.equal(run['a:rPr']['a:latin']['@_typeface'],'Cambria Math');
    assert.equal(run['a:rPr']['a:solidFill']['a:srgbClr']['@_val'],'1F4E79');
  }
});

test('nested fractions and roots retain native numerator, denominator and root degree',()=>{
  const tree=parse(compileMath(String.raw`\frac{\sqrt[3]{x^2+1}}{1+\frac{a}{b}}`));
  assert.equal(nodes(tree,'m:f').length,2);assert.equal(nodes(tree,'m:num').length,2);assert.equal(nodes(tree,'m:den').length,2);
  assert.equal(text(nodes(tree,'m:deg')[0]),'3');assert.equal(nodes(tree,'m:rad').length,1);
  assert.match(text(tree),/x2/);assert.match(text(tree),/ab/);
});
test('radical clearance struts preserve the radicand and fixed delimiters remain enlarged',()=>{
  const tree=parse(compileMath(String.raw`\sqrt{n}\bigl(X-\mu\bigr)`));
  assert.equal(text(nodes(tree,'m:rad')[0]),'n');
  const bracket=nodes(tree,'m:r').find(run=>text({'m:r':run})==='(');
  assert.equal(bracket['a:rPr']['@_sz'],'2880');assert.equal(text(tree),'n(X−μ)');
});

test('nested sub/superscripts and prescripts stay structured and editable',()=>{
  const tree=parse(compileMath(String.raw`x_{i_j}^{2k}+\prescript{a}{b}{X}_{i}^{j}`));
  assert.equal(nodes(tree,'m:sSubSup').length,2);assert.equal(nodes(tree,'m:sSub').length,1);assert.equal(nodes(tree,'m:sPre').length,1);
  assert.equal(text(nodes(tree,'m:sPre')[0]['m:sub']),'b');assert.equal(text(nodes(tree,'m:sPre')[0]['m:sup']),'a');
});

test('sum and integral limits keep operands inside native n-ary objects',()=>{
  const tree=parse(compileMath(String.raw`\sum_{i=1}^{n}X_i+\int_0^1 x^2\,dx`)),nary=nodes(tree,'m:nary');
  assert.equal(nary.length,2);
  assert.equal(nary[0]['m:naryPr']['m:chr']['@_m:val'],'∑');assert.equal(text(nary[0]['m:sub']),'i=1');assert.equal(text(nary[0]['m:sup']),'n');
  assert.equal(text(nary[0]['m:e']),'Xi');assert.equal(nary[0]['m:naryPr']['m:limLoc']['@_m:val'],'undOvr');
  assert.equal(nary[1]['m:naryPr']['m:chr']['@_m:val'],'∫');assert.equal(text(nary[1]['m:e']),'x2');
});
test('nested sums bind the inner operand and unbounded integrals stay native',()=>{
  const tree=parse(compileMath(String.raw`\sum_{i=1}^n\sum_{j=1}^m X_{ij}+\int x\,dx`)),nary=nodes(tree,'m:nary');
  const inner=nodes(nary[0]['m:e'],'m:nary'),integral=nary.find(n=>n['m:naryPr']['m:chr']['@_m:val']==='∫');
  assert.equal(nary.length,3);assert.equal(inner.length,1);assert.equal(text(inner[0]['m:e']),'Xij');assert.equal(text(integral['m:e']),'x');
});

test('accent hats, bars and vectors use accent/bar objects rather than generic limits',()=>{
  const tree=parse(compileMath(String.raw`\hat\theta+\bar X+\vec x+\overline{ab}+\underline y`));
  assert.equal(nodes(tree,'m:acc').length,2);assert.equal(nodes(tree,'m:bar').length,3);assert.equal(nodes(tree,'m:limUpp').length,0);
  assert.deepEqual(nodes(tree,'m:accPr').map(p=>p['m:chr']['@_m:val']),['̂','⃗']);
});

test('a two-by-two matrix has native rows and stretchable delimiters',()=>{
  const tree=parse(compileMath(String.raw`\begin{pmatrix}1&2\\3&4\end{pmatrix}`)),matrix=nodes(tree,'m:m')[0],delimiter=nodes(tree,'m:d')[0];
  assert.equal(matrix['m:mr'].length,2);matrix['m:mr'].forEach(row=>assert.equal(row['m:e'].length,2));
  assert.equal(delimiter['m:dPr']['m:begChr']['@_m:val'],'(');assert.equal(delimiter['m:dPr']['m:endChr']['@_m:val'],')');
  assert.equal(text(tree),'1234');
});

test('aligned derivations and cases retain rows with native alignment markers',()=>{
  for(const latex of [String.raw`\begin{aligned}a&=b+c\\&=d\end{aligned}`,String.raw`\begin{cases}x,&x>0\\-x,&x\le0\end{cases}`]) {
    const tree=parse(compileMath(latex));assert.equal(nodes(tree,'m:eqArr').length,1);assert.equal(nodes(tree,'m:eqArr')[0]['m:e'].length,2);assert.equal(nodes(tree,'m:aln').length,2);
  }
});

test('sets, named operators, Chinese text and comparisons preserve characters',()=>{
  const tree=parse(compileMath(String.raw`A=\{x\in\mathbb R:x>0\},\quad\operatorname{Var}(X)=1+\text{有偏估计}`)),plain=text(tree);
  assert.match(plain,/A=\{x∈ℝ:x>0\}/);assert.match(plain,/Var/);assert.match(plain,/有偏估计/);
  const operator=nodes(tree,'m:r').find(run=>text({'m:r':run})==='Var');assert.equal(operator['a:rPr']['@_i'],'0');assert.equal(operator['m:rPr']['m:sty']['@_m:val'],'p');
});
test('math variables and upright operators explicitly declare their mathematical style',()=>{
  const tree=parse(compileMath(String.raw`\operatorname{E}(X)+\operatorname{MSE}(\theta)+\bar X_n`)),runs=nodes(tree,'m:r');
  for(const literal of ['E','MSE'])assert.equal(runs.find(r=>text({'m:r':r})===literal)['m:rPr']['m:sty']['@_m:val'],'p');
  assert.equal(runs.find(r=>text({'m:r':r})==='θ')['m:rPr']['m:sty']['@_m:val'],'i');
  const sub=nodes(tree,'m:sSub')[0];assert.ok(sub['m:e']['m:bar']);assert.equal(sub['m:e']['m:bar']['m:barPr']['m:pos']['@_m:val'],'top');
});

test('limits and underbraces retain their structural attachments',()=>{
  const tree=parse(compileMath(String.raw`\lim_{n\to\infty}x_n+\underbrace{x+y}_{z}`));
  assert.equal(nodes(tree,'m:limLow').length,2);assert.equal(nodes(tree,'m:groupChr').length,1);assert.match(text(tree),/n→∞/);
});
test('extensible arrow labels remove only Temml minimum-width dummy limits',()=>{
  const upper=parse(compileMath(String.raw`Y_n\xrightarrow{\mathrm{a.s.}}Y`)),two=parse(compileMath(String.raw`A\xleftarrow[n\to\infty]{L^r}B`));
  assert.equal(nodes(upper,'m:limUpp').length,1);assert.equal(text(nodes(upper,'m:limUpp')[0]['m:lim']).replaceAll('\u200B',''),'a.s.');
  assert.equal(text(nodes(upper,'m:limUpp')[0]['m:e']),'→');
  assert.equal(nodes(two,'m:limUpp').length,1);assert.equal(nodes(two,'m:limLow').length,1);
  assert.equal(text(nodes(two,'m:limLow')[0]['m:lim']).replaceAll('\u200B',''),'n→∞');
  assert.equal(text(nodes(two,'m:limUpp')[0]['m:lim']).replaceAll('\u200B',''),'Lr');
  assert.equal(nodes(two,'m:sSup').length,1);assert.equal(text(nodes(two,'m:limLow')[0]['m:e']),'←');
  const nested=parse(compileMath(String.raw`X\xrightarrow{\overset{a}{\sim}}Y`));
  assert.equal(nodes(nested,'m:limUpp').length,2);assert.equal(text(nodes(nested,'m:limUpp')[1]['m:lim']),'a');
  assert.equal(text(nodes(nested,'m:limUpp')[1]['m:e']),'∼');
});
test('arg max accepts zero-width operator spacing and dotted accents remain accents',()=>{
  const tree=parse(compileMath(String.raw`\operatorname*{arg\,max}_{\theta\in\Theta}L(\theta)+\dddot{x}+\ddddot{y}`));
  assert.match(text(tree),/arg max/);assert.equal(nodes(tree,'m:limLow').length,1);
  assert.deepEqual(nodes(tree,'m:accPr').map(p=>p['m:chr']['@_m:val']),['⃛','⃜']);
});

test('explicit spacing and math text color survive conversion',()=>{
  const tree=parse(compileMath(String.raw`x\quad y\!z+\textcolor{red}{t}`));
  assert.ok(nodes(tree,'a:rPr').some(p=>p['@_spc']==='2400'));assert.ok(nodes(tree,'a:rPr').some(p=>Number(p['@_spc'])<0));
  const colored=nodes(tree,'m:r').find(run=>text({'m:r':run})==='t');assert.equal(colored['a:rPr']['a:solidFill']['a:srgbClr']['@_val'],'ff0000');
});

test('XML-special text and font names are escaped without creating markup',()=>{
  const xml=compileMath(String.raw`\text{a \& b < c}`,{fontFace:'A&B "math" <font>'}),tree=parse(xml);
  assert.equal(XMLValidator.validate(xml),true);assert.match(xml,/A&amp;B &quot;math&quot; &lt;font&gt;/);assert.doesNotMatch(xml,/<font>/);
  assert.equal(text(tree).replaceAll('\u00A0',' '),'a & b < c');
});

test('unknown commands and unsupported visual constructs fail instead of disappearing',()=>{
  for(const latex of [String.raw`\unknown{x}`,String.raw`\href{https://example.com}{x}`,String.raw`\phantom{x}`,String.raw`\cancel{x}`,String.raw`\rule{1cm}{1cm}`])assert.throws(()=>compileMath(latex));
});

test('input, expansion and output-complexity limits reject abusive equations',()=>{
  for(const latex of ['', 'x'.repeat(8001),'{'.repeat(49)+'x'+'}'.repeat(49),String.raw`\def\a{\a}\a`,'x\u0000'])assert.throws(()=>compileMath(latex));
  assert.throws(()=>compileMath('x',{size:Infinity}));assert.throws(()=>compileMath('x',{color:'red'}));assert.throws(()=>compileMath('x',{fontFace:'x\u0001'}));
});

test('inline mode changes sum limit positioning without changing content',()=>{
  const inline=parse(compileMath(String.raw`\sum_{i=1}^{n}X_i`,{display:false})),display=parse(compileMath(String.raw`\sum_{i=1}^{n}X_i`));
  assert.equal(nodes(inline,'m:limLoc')[0]['@_m:val'],'subSup');assert.equal(nodes(display,'m:limLoc')[0]['@_m:val'],'undOvr');assert.equal(text(inline),text(display));
});

test('TeX macro definitions cannot leak between compilations',()=>{
  compileMath(String.raw`\def\custom{X}\custom`);
  assert.throws(()=>compileMath(String.raw`\custom`));
});
