#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {validateDeck,exportDeck,extract,inspectPptx,readLimited} from './core.mjs';

const [command,input,output,...extra]=process.argv.slice(2);
async function writeNew(file,content) {
  if(!file)throw Error('An output path is required');
  await fs.mkdir(path.dirname(path.resolve(file)),{recursive:true});
  await fs.writeFile(file,content,{flag:'wx'});
}
try {
  if(!input||extra.length||!['extract','inspect','validate','export'].includes(command))throw Error('Usage: node cli.mjs extract|inspect|validate|export INPUT [OUTPUT]\nextract/export require OUTPUT. Existing outputs are never overwritten.');
  if(command==='extract')await writeNew(output,JSON.stringify(await extract(input),null,2)+'\n');
  if(command==='inspect') {
    const result=JSON.stringify(await inspectPptx(input),null,2);
    if(output)await writeNew(output,result+'\n');else console.log(result);
  }
  if(command==='validate'||command==='export'){
    const spec=JSON.parse((await readLimited(input)).toString('utf8'));
    if(command==='validate'){
      const {errors,warnings}=validateDeck(spec);
      const report=JSON.stringify({errors,warnings,visualReview:'not performed'},null,2);
      if(output)await writeNew(output,report+'\n');else console.log(report);
      if(errors.length)process.exitCode=1;
    }else{
      const result=await exportDeck(spec,path.dirname(path.resolve(input)));
      await writeNew(output,result.buffer);
      console.log(JSON.stringify({output,warnings:result.warnings,visualReview:'not performed'},null,2));
    }
  }
}catch(error){console.error(error.message);process.exitCode=1;}
