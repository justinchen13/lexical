import fs from 'node:fs';
const rows=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const expected={'set-insert':'Xab','json-insert':'Xab','set-replace':'X\u00a0Z','json-replace':'X\u00a0Z'};
let failures=0;
for(const r of rows) {
 const ok=r.ended.model===expected[r.kind]&&r.ended.dom===expected[r.kind];
 if(!ok)failures++;
 console.log(`${ok?'PASS':'FAIL'} ${r.engine} ${r.kind}: expected=${JSON.stringify(expected[r.kind])} model=${JSON.stringify(r.ended.model)} dom=${JSON.stringify(r.ended.dom)}`);
}
console.log(`${rows.length-failures} passed; ${failures} failed (synthetic DOM replay).`);
process.exitCode=failures?1:0;
