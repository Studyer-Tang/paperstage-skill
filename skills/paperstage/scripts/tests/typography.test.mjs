import test from 'node:test';
import assert from 'node:assert/strict';
import {hasCjk,layoutCjkText} from '../typography.mjs';

const layout=(text,em=8)=>layoutCjkText(text,{width:em/3,size:24,widthFactor:1});
const plain=result=>result.runs.map(run=>run.text).join('');

test('Chinese punctuation stays with its adjoining text at automatic line breaks',()=>{
  const text='甲乙丙丁。甲乙（丙丁），再看《统计推断》：“结论成立！”';
  for(const em of [3,4,5,6,7,8,9]) {
    const result=layout(text,em);
    assert.equal(plain(result),text);
    assert.ok(result.lines.every(line=>!/[（［｛〈《「『【“‘]$/.test(line)));
    assert.ok(result.lines.every(line=>!/^[，。！？；：、）］｝〉》」』】”’]/.test(line)));
    assert.deepEqual(result.overflows,[]);
  }
});

test('Latin words, decimals and identifiers are not broken merely at style boundaries',()=>{
  const text=[{text:'使用 maxi',bold:true},{text:'mum likelihood 估计，取 n=100 与 3.14159。'}];
  const result=layout(text,10);
  assert.equal(plain(result),text.map(run=>run.text).join(''));
  for(const word of ['maximum','likelihood','n=100','3.14159'])assert.ok(result.lines.some(line=>line.includes(word)));
  assert.ok(result.runs.filter(run=>run.text.includes('maxi')).every(run=>run.bold));
});

test('automatic breaks add metadata without zero-width spaces or altered punctuation',()=>{
  const text='样本均值（sample mean）的方差为总体方差除以样本量。';
  const result=layout(text,9);
  assert.equal(plain(result),text);
  assert.ok(result.runs.some(run=>run.softBreakBefore));
  assert.ok(!/[\u200b\u2060\ufeff]/.test(plain(result)));
  assert.equal(result.lines.join(''),text);
});

test('explicit newlines and paragraph breaks preserve text and styles',()=>{
  const input=[{text:'第一行\r\n第二行。',color:'#1F4E79',breakLine:true},{text:'第三行',italic:true,fontFace:'Custom CJK',lang:'zh-TW'}];
  const original=structuredClone(input),result=layout(input,20);
  assert.equal(plain(result),input.map(run=>run.text).join(''));
  assert.equal(result.lineCount,3);
  assert.equal(result.runs.filter(run=>run.breakLine).length,1);
  assert.ok(result.runs.filter(run=>run.text.includes('第三行')).every(run=>run.italic&&run.fontFace==='Custom CJK'&&run.lang==='zh-TW'));
  assert.deepEqual(input,original);
});

test('script runs declare Asian and Latin fonts without replacing explicit fonts',()=>{
  const result=layoutCjkText('均值 mean 与 2026',{width:5,size:23,fontFace:'PingFang SC',latinFontFace:'Arial'});
  assert.equal(plain(result),'均值 mean 与 2026');
  assert.ok(result.runs.some(run=>run.text==='均值'&&run.fontFace==='PingFang SC'&&run.lang==='zh-CN'));
  assert.ok(result.runs.some(run=>run.text.includes('mean')&&run.fontFace==='Arial'&&run.lang==='en-US'));
  assert.equal(hasCjk('mean'),false);assert.equal(hasCjk([{text:'均值'}]),true);
});

test('overlong words are reported instead of corrupted or silently split',()=>{
  const text='参数 Supercalifragilisticexpialidocious。';
  const result=layout(text,5);
  assert.equal(plain(result),text);
  assert.ok(result.lines.some(line=>line.includes('Supercalifragilisticexpialidocious。')));
  assert.ok(result.overflows.length>0);
});

test('combining characters remain intact and invalid dimensions are rejected',()=>{
  const text='比较 cafe\u0301 的均值。';
  const result=layout(text,6);
  assert.equal(plain(result),text);
  assert.ok(result.lines.some(line=>line.includes('cafe\u0301')));
  assert.throws(()=>layoutCjkText(text,{width:0,size:23}),/positive finite/);
});
