import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const root=process.cwd();const directory=path.dirname(fileURLToPath(import.meta.url));const require=createRequire(path.join(root,'package.json'));
const {build}=require('esbuild');const {webkit,chromium}=require('playwright');
for(const variant of ['before','after']){
 const plugins=variant==='before'?[{name:'baseline',setup(b){b.onLoad({filter:/(?:packages\/lexical\/src\/(LexicalEvents|LexicalEditor|LexicalUtils|LexicalSelection|LexicalGeneratedJSON|nodes\/LexicalTextNode)|packages\/lexical-code-core\/src\/LexicalCodeCoreGeneratedJSON|packages\/lexical-selection\/src\/lexical-node)\.ts$/},args=>({contents:execFileSync('git',['show','cb21da40de69c1eedc2b9ec60001fef0d3b1770a:'+path.relative(root,args.path)],{cwd:root,encoding:'utf8'}),loader:'ts'}));}}]:[];
 await build({entryPoints:[path.join(directory,'regression-probe.ts')],outfile:path.join(directory,'regression-'+variant+'.js'),bundle:true,format:'iife',tsconfig:path.join(root,'tsconfig.json'),conditions:['source'],plugins,define:{__DEV__:'true','process.env.NODE_ENV':'"development"','process.env.LEXICAL_VERSION':'"review"'}});
}
const results=[];
for(const [engine,api]of [['webkit',webkit],['chromium',chromium]]){
 const browser=await api.launch({headless:true});
 try{for(const variant of ['before','after']){
  const page=await browser.newPage({userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15'});
  page.on('pageerror',e=>console.error('PAGE ERROR',engine,variant,String(e)));
  await page.setContent('<html><body></body></html>');await page.addScriptTag({path:path.join(directory,'regression-'+variant+'.js')});
  for(const kind of ['external-insert','external-delete','reject-placeholder','token-middle','move-selection','multi-selection','multi-backward','multi-ascii']){
   const result=await page.evaluate(kind=>globalThis.runReview(kind),kind);results.push({engine,variant,...result});console.log(JSON.stringify({engine,variant,...result}));
  }
  await page.close();
 }}finally{await browser.close();}
}
fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify(results,null,2));
