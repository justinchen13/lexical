import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
const root=process.cwd(),dir=path.dirname(fileURLToPath(import.meta.url));const require=createRequire(path.join(root,'package.json'));const {build}=require('esbuild');const {webkit,chromium}=require('playwright');
await build({entryPoints:[path.join(dir,'extra.ts')],outfile:path.join(dir,'extra.js'),bundle:true,format:'iife',tsconfig:path.join(root,'tsconfig.json'),conditions:['source'],define:{__DEV__:'true','process.env.NODE_ENV':'"development"','process.env.LEXICAL_VERSION':'"review"'}});
const results=[];
for(const [engine,api]of [['webkit',webkit],['chromium',chromium]]){
 const browser=await api.launch({headless:true});try{
  const page=await browser.newPage({userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15'});
  page.on('pageerror',e=>console.error(String(e)));await page.setContent('<html><body></body></html>');await page.addScriptTag({path:path.join(dir,'extra.js')});
  for(const kind of ['json-code-insert','json-code-replace','json-custom-insert','json-custom-replace','ephemeral-no-editor','ephemeral-set','ephemeral-json','slice-live']){
   const r=await page.evaluate(k=>globalThis.runExtra(k),kind);results.push({engine,...r});console.log(JSON.stringify({engine,...r}));
  }
 }finally{await browser.close();}
}
fs.writeFileSync(path.join(dir,'extra-results.json'),JSON.stringify(results,null,2));
