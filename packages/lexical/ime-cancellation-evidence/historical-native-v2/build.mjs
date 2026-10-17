import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(process.argv[2] ?? '.');
const directory=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(path.join(root,'package.json'));
const {build}=require('esbuild');
const baseline='cb21da40de69c1eedc2b9ec60001fef0d3b1770a';
for(const variant of ['before','after']) {
 const plugins=variant==='before' ? [{name:'baseline',setup(build) {
  build.onLoad({filter:/packages\/lexical\/src\/(LexicalEvents|LexicalEditor|LexicalUtils|LexicalSelection|nodes\/LexicalTextNode)\.ts$/}, args=>({contents:execFileSync('git',['show',baseline+':'+path.relative(root,args.path)],{cwd:root,encoding:'utf8'}),loader:'ts'}));
 }}] : [];
 await build({entryPoints:[path.join(directory,'probe.ts')],outfile:path.join(directory,variant+'.js'),bundle:true,format:'iife',tsconfig:path.join(root,'tsconfig.json'),conditions:['source'],plugins,define:{__DEV__:'true','process.env.NODE_ENV':'"development"','process.env.LEXICAL_VERSION':'"0.52.0+cb21da40"',PROBE_VARIANT:JSON.stringify(variant)}});
}
