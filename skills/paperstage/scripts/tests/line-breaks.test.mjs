import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {XMLParser} from 'fast-xml-parser';
import {exportDeck,estimatedTextLines} from '../core.mjs';
import {compileLecture} from '../lecture.mjs';

const array=value=>value===undefined?[]:Array.isArray(value)?value:[value];
const parser=new XMLParser({ignoreAttributes:false,parseTagValue:false,trimValues:false});
const paragraphs=body=>array(body['a:p']);
const paragraphText=p=>array(p['a:r']).map(run=>run['a:t']??'').join('');
const textElement=text=>({id:'body',type:'text',text,x:1,y:1,w:10,h:3,size:24});
const fixture=element=>({title:'Synthetic line breaks',slides:[{id:'s1',title:'Line breaks',elements:[element]}]});
async function slideTrees(deck) {
  const {buffer}=await exportDeck(deck,process.cwd()),zip=await JSZip.loadAsync(buffer);
  return Promise.all(deck.slides.map(async(_,i)=>parser.parse(await zip.file(`ppt/slides/slide${i+1}.xml`).async('string'))['p:sld']['p:cSld']['p:spTree']));
}

test('explicit CJK and Latin newlines preserve paragraph boundaries across styled runs',async()=>{
  for(const newline of ['\n','\r\n','\r'])for(const [first,second,last] of [['甲','乙','丙'],['A','B','C']]) {
    const content=[{text:first+newline+second,bold:true},{text:last,italic:true}];
    const input=fixture(textElement(content)),original=structuredClone(input);
    const [tree]=await slideTrees(input),p=paragraphs(tree['p:sp']['p:txBody']);
    assert.deepEqual(p.map(paragraphText),[first,second+last],JSON.stringify(content));
    assert.equal(estimatedTextLines(content,10,24),p.length);
    assert.equal(array(p[1]['a:r']).find(run=>run['a:t']===second)['a:rPr']['@_b'],'1');
    assert.equal(array(p[1]['a:r']).find(run=>run['a:t']===last)['a:rPr']['@_i'],'1');
    assert.deepEqual(input,original);
  }
});

test('blank and trailing lines survive without adding a break at a style boundary',async()=>{
  for(const content of ['甲\n\n乙\n',[{text:'甲\n',bold:true},{text:'\n乙\n',italic:true}]]) {
    const [tree]=await slideTrees(fixture(textElement(content))),p=paragraphs(tree['p:sp']['p:txBody']);
    assert.deepEqual(p.map(paragraphText),['甲','','乙','']);
    assert.equal(estimatedTextLines(content,10,24),p.length);
  }
  const content=[{text:'第一行\n第二行',breakLine:true},{text:'第三行'}];
  const [tree]=await slideTrees(fixture(textElement(content)));
  assert.deepEqual(paragraphs(tree['p:sp']['p:txBody']).map(paragraphText),['第一行','第二行','第三行']);
});

test('newlines surrounding inline native math keep the equation in its original paragraph',async()=>{
  const content=[{text:'第一行\n第二行'},{latex:String.raw`\frac{x}{n}`},{text:'继续\n第三行',bold:true}];
  const [tree]=await slideTrees(fixture(textElement(content))),p=paragraphs(tree['p:sp']['p:txBody']);
  assert.deepEqual(p.map(paragraphText),['第一行','第二行继续','第三行']);
  assert.equal(p[0]['a14:m'],undefined);assert.equal(p[2]['a14:m'],undefined);
  assert.ok(p[1]['a14:m']['m:oMath']['m:f'],'the fraction must remain native math');
  assert.equal(tree['p:pic'],undefined);
});

test('lecture paragraphs and table cells export the same explicit lines used for height estimates',async()=>{
  const source={id:'authored',document:'Original synthetic example',locator:'Example 1',text:'Two lines of text for a layout regression.'};
  const input={title:'Synthetic chapter',course:'合成课件',sources:[source],slides:[
    {id:'prose',title:'两行文字',layout:'single',blocks:[{type:'paragraph',text:'第一行\n第二行'}]},
    {id:'table',title:'两行表格',layout:'single',blocks:[{type:'table',headers:['说明'],rows:[[[{text:'第一行\n第二行',bold:true},{text:'结束'}]]],sourceIds:['authored']}]}
  ]};
  const deck=compileLecture(input),trees=await slideTrees(deck);
  const body=array(trees[0]['p:sp']).find(shape=>shape['p:nvSpPr']['p:cNvPr']['@_name']==='block-1');
  assert.deepEqual(paragraphs(body['p:txBody']).map(paragraphText),['第一行','第二行']);
  const table=trees[1]['p:graphicFrame']['a:graphic']['a:graphicData']['a:tbl'];
  const row=array(table['a:tr'])[1],cell=array(row['a:tc'])[0];
  assert.deepEqual(paragraphs(cell['a:txBody']).map(paragraphText),['第一行','第二行结束']);
  const compiled=deck.slides[1].elements.find(element=>element.type==='table');
  assert.equal(Number(row['@_h']),Math.round(compiled.rowHeights[1]*914400));
});
