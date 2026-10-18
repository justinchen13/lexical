import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const json=file=>JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const index=json('evidence-index.json');
for(const row of index.files)assert(sha(fs.readFileSync(path.join(dir,row.file)))===row.sha256,'Evidence file changed: '+row.file);
const manifestBytes=fs.readFileSync(path.join(dir,'native/capture-build-manifest.json')),manifest=JSON.parse(manifestBytes);
const sourceBytes=fs.readFileSync(path.join(dir,'native/capture-source-manifest.json')),source=JSON.parse(sourceBytes);
assert(sha(sourceBytes)===manifest.sourceManifestSha256,'Source/build identity chain differs');
assert(sha(fs.readFileSync(path.join(dir,'fix.patch')))===source.patchSha256,'Patch differs from capture source');
const prepared=json('prepared-identity.json'),summary=json('native-summary.json'),plan=json('native/scenarios.json');
const rows=fs.readFileSync(path.join(dir,'native/capture-events.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const start=rows.find(row=>row.type==='capture-start'),finish=rows.findLast(row=>row.type==='finished'),restore=rows.findLast(row=>row.type==='restored');
assert(start.bundleSha256===manifest.bundleSha256&&start.buildManifestSha256===sha(manifestBytes),'Capture/build identity mismatch');
assert(start.binarySha256===prepared.binarySha256,'Capture/prepared binary identity mismatch');
assert(start.scenarioPlanSha256===sha(fs.readFileSync(path.join(dir,'native/scenarios.json'))),'Capture plan differs');
assert(finish.success===true,'Capture did not finish successfully');
for(const field of ['inputSourceRestored','previousApplicationFocused','previousFocusElementRestored'])assert(restore[field]===true,'Restoration failed: '+field);
const types=new Set(['keydown','keyup','compositionstart','compositionupdate','compositionend','beforeinput','input']);
const events=rows.filter(row=>types.has(row.type));
assert(events.length===397&&events.every(row=>row.isTrusted===true),'Trusted DOM event count differs');
const keys=events.filter(row=>row.type==='keydown');
assert(keys.length===91&&keys.every(row=>!row.altKey&&!row.ctrlKey&&!row.metaKey&&!row.shiftKey),'Key count or modifiers differ');
assert(!rows.some(row=>['fatal','probe-failure','observation-mismatch','focus-abort'].includes(row.type)),'Capture contains a failure');
for(const scenario of plan){
 const group=rows.filter(row=>row.scenario===scenario.id),end=group.findLast(row=>row.type==='compositionend');
 assert(group.some(row=>row.type==='scenario-passed'),'Scenario did not pass: '+scenario.id);
 assert(end,'No DOM compositionend: '+scenario.id);
 const expected=scenario.expectedMode==='committed-data'?scenario.initial+end.data:scenario.expected;
 if(scenario.expectedMode!=='committed-data'){
  assert(end.data==='','Cancellation data is not empty: '+scenario.id);
  assert(!group.some(row=>row.inputType==='insertFromComposition'),'Cancelled scenario committed text: '+scenario.id);
 }
 for(const [stage,commands] of [['cancel-result',[]],['enter-result',['enter']]]){
  const result=group.find(row=>row.type===stage)?.result;
  assert(result?.ok===true&&result.state.model===expected&&result.state.dom===expected,'Text or stage differs: '+scenario.id+'/'+stage);
  assert(result.state.compositionKey===null&&!result.state.composing&&!result.state.preparing,'Composition still active: '+scenario.id);
  assert(JSON.stringify(result.state.commands)===JSON.stringify(commands),'Commands differ: '+scenario.id+'/'+stage);
 }
 if(scenario.backspaceExpected!==undefined||scenario.ordinaryBackspace){
  const result=group.find(row=>row.type==='backspace-result')?.result;
  const after=scenario.expectedMode==='committed-data'?Array.from(expected).slice(0,-1).join(''):scenario.backspaceExpected;
  assert(result?.ok&&result.state.model===after&&result.state.dom===after,'Ordinary Backspace differs: '+scenario.id);
 }
 for(const command of group.filter(row=>row.type==='command'))assert(command.isTrusted===true&&(command.keyCode===8||command.keyCode===13),'IME-consumed key dispatched a command');
}
console.log('Native records: 20/20 scenarios, 397/397 trusted DOM events, 91/91 trusted keydowns; ordinary 8/13 and consumed 229 checks passed.');
if(process.argv.includes('--records-only'))process.exit(0);
const root=path.resolve(process.argv[2]??'.');
for(const [file,expected] of Object.entries(manifest.inputs)){
 const actual=file==='probe.ts'?path.join(dir,'native/probe.ts'):path.join(root,file);
 assert(sha(fs.readFileSync(actual))===expected,'Capture build input differs: '+file);
}
for(const row of source.files)assert(sha(fs.readFileSync(path.join(root,row.file)))===row.sha256,'Source differs: '+row.file);
for(const row of json('unchanged-upstream.json').files){
 assert(sha(fs.readFileSync(path.join(root,row.file)))===row.sha256,'Upstream text/JSON/slice implementation differs: '+row.file);
}
execFileSync(process.execPath,[path.join(dir,'native/build.mjs'),root],{stdio:'pipe'});
assert(sha(fs.readFileSync(path.join(dir,'native/after.js')))===manifest.bundleSha256,'Rebuilt bundle differs from physical capture');
console.log('Current code: all 134 capture inputs and 7 changed files match; rebuilt native bundle is byte-identical to capture.');
console.log('Working-tree HEAD metadata may differ in a fresh checkout. Capture manifests are immutable; file and bundle bytes define the tested implementation.');
