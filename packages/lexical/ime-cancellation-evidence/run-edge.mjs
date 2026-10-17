import {createRequire} from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=process.cwd();const directory=path.dirname(fileURLToPath(import.meta.url));const require=createRequire(path.join(root,'package.json'));
const {build}=require('esbuild');const {webkit,chromium}=require('playwright');
await build({entryPoints:[path.join(directory,'edge.ts')],outfile:path.join(directory,'edge.js'),bundle:true,format:'iife',tsconfig:path.join(root,'tsconfig.json'),conditions:['source'],define:{__DEV__:'true','process.env.NODE_ENV':'"development"','process.env.LEXICAL_VERSION':'"review"'}});
const results=[];
for(const [engine,api]of [['webkit',webkit],['chromium',chromium]]){
 const browser=await api.launch({headless:true});
 try{
  const page=await browser.newPage({userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15'});
  page.on('pageerror',e=>console.error(String(e)));
  await page.setContent('<html><body></body></html>');await page.addScriptTag({path:path.join(directory,'edge.js')});
  for(const kind of ['set-insert','json-insert','set-replace','json-replace']){
   const r=await page.evaluate(k=>globalThis.runEdge(k),kind);results.push({engine,...r});console.log(JSON.stringify({engine,...r}));
  }
 }finally{await browser.close();}
}
fs.writeFileSync(path.join(directory,'edge-results.json'),JSON.stringify(results,null,2));
