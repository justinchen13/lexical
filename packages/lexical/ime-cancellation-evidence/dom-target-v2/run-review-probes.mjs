import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const dir=path.dirname(fileURLToPath(import.meta.url)), root=process.cwd(), require=createRequire(path.join(root,'package.json'));
const {build}=require('esbuild'), {webkit,chromium}=require('playwright');
const sha=value=>createHash('sha256').update(value).digest('hex');
const fixtures={review:path.join(dir,'regression-probes/review.ts'),edge:path.join(dir,'regression-probes/edge.ts'),extra:path.join(dir,'regression-probes/extra.ts')};
const expectedReview={'external-insert':'Xabc','external-delete':'bc','reject-placeholder':'abc','token-middle':'','move-selection':'abc\n\nother','multi-selection':'a\u00a0\u00a0Z','multi-backward':'a\u00a0\u00a0Z','multi-ascii':'abZ'};
const original=fs.readFileSync(fixtures.extra,'utf8');
const from='s.setTextNodeRange(n,2,n,5);',to="s.setTextNodeRange(n,n.getTextContent().indexOf('b'),n,n.getTextContentSize());";
if(original.split(from).length!==2)throw Error('Nonunique original fixture slice');
const adapted=original.replace(from,to);fs.writeFileSync(path.join(dir,'review-extra-adapted.ts'),adapted);
const cases=[...Object.keys(expectedReview).map(kind=>({suite:'review',kind})),...['set-insert','json-insert','set-replace','json-replace'].map(kind=>({suite:'edge',kind})),...['json-code-insert','json-code-replace','json-custom-insert','json-custom-replace','ephemeral-no-editor','ephemeral-set','ephemeral-json','slice-live'].map(kind=>({suite:'extra',kind}))];
const buildResult=await build({absWorkingDir:root,stdin:{contents:Object.values(fixtures).map(file=>'import '+JSON.stringify(file)+';').join('\n'),resolveDir:root,sourcefile:'review-regression-probes.ts',loader:'ts'},outfile:path.join(dir,'review-probes.js'),bundle:true,format:'iife',metafile:true,conditions:['source'],tsconfig:path.join(root,'tsconfig.json'),define:{__DEV__:'true','process.env.NODE_ENV':'"development"','process.env.LEXICAL_VERSION':'"dom-target-v2-review"'},plugins:[{name:'logical-slice-fixture-only',setup(builder){builder.onLoad({filter:/extra\.ts$/},args=>args.path===fixtures.extra?{contents:adapted,loader:'ts'}:undefined);}}]});
const meta={method:'Synthetic DOM replay against actual current source; no production overrides',source:JSON.parse(fs.readFileSync(path.join(dir,'native/source-manifest.json'),'utf8')),sliceAdaptation:{from,to,adaptedSha256:sha(adapted)},fixtures:Object.fromEntries(Object.entries(fixtures).map(([name,file])=>[name,sha(fs.readFileSync(file))])),inputHashes:Object.fromEntries(Object.keys(buildResult.metafile.inputs).filter(file=>file.startsWith('packages/')).map(file=>[file,sha(fs.readFileSync(file))]))};
const results=[];
for(const [engine,api] of [['webkit',webkit],['chromium',chromium]]) {
 const browser=await api.launch({headless:true});
 try {
  const page=await browser.newPage({userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15'});
  await page.setContent('<html><body></body></html>');await page.addScriptTag({path:path.join(dir,'review-probes.js')});
  for(const item of cases) {
   try {
    const result=await page.evaluate(async item=>globalThis[item.suite==='review'?'runReview':item.suite==='edge'?'runEdge':'runExtra'](item.kind),item);
    if(item.kind==='ephemeral-no-editor') results.push({engine,...item,...result,pass:result.outcome?.text==='export-copy'&&!result.outcome?.error});
    else {
     const expected=item.suite==='review'?expectedReview[item.kind]:item.suite==='edge'?(item.kind.endsWith('insert')?'Xab':'X\u00a0Z'):item.kind==='slice-live'?'b\u00a0c':item.kind.startsWith('ephemeral')?'ab\u00a0c':item.kind.endsWith('insert')?'Xab':'X\u00a0Z';
     const domExpected=item.kind==='move-selection'?'abcother':expected;
     results.push({engine,...item,...result,expected,pass:result.ended.model===expected&&result.ended.dom===domExpected&&(result.ended.composing===undefined||!result.ended.composing)});
    }
   } catch(error) {results.push({engine,...item,pass:false,error:String(error)});}
  }
 } finally {await browser.close();}
}
fs.writeFileSync(path.join(dir,'review-probe-results.json'),JSON.stringify({meta,results},null,2)+'\n');
for(const engine of ['webkit','chromium']) {
 const rows=results.filter(row=>row.engine===engine);
 console.log(JSON.stringify({engine,synthetic:true,total:rows.length,passed:rows.filter(row=>row.pass).length,failed:rows.filter(row=>!row.pass)}));
}
process.exitCode=results.some(row=>!row.pass)?1:0;
