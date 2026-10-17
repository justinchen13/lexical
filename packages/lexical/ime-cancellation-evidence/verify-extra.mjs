import fs from 'node:fs';
const rows=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
let failures=0;
for(const r of rows){
 let ok;
 if(r.kind==='ephemeral-no-editor')ok=r.outcome.text==='export-copy'&&!r.outcome.error&&r.live.model==='a\u00a0b';
 else{
  const expected=r.kind.includes('replace')?'X\u00a0Z':r.kind.includes('insert')?'Xab':r.kind==='slice-live'?'b\u00a0c':'ab\u00a0c';
  ok=r.ended.model===expected&&r.ended.dom===expected;
  if(r.kind.startsWith('ephemeral-'))ok&&=r.changed.placeholder.offset===r.started.placeholder.offset&&r.changed.model===r.started.model;
  if(r.kind.includes('custom'))ok&&=r.extra.setterCalls===1;
 }
 if(!ok)failures++;
 console.log(`${ok?'PASS':'FAIL'} ${r.engine} ${r.kind}: ${JSON.stringify(r.outcome??r.ended)}`);
}
console.log(`${rows.length-failures} passed; ${failures} failed (synthetic/model evidence).`);
process.exitCode=failures?1:0;
