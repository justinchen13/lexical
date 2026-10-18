import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root = path.resolve(process.argv[2] ?? '.');
const directory = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(root, 'package.json'));
const {build, version} = require('esbuild');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const baseline = 'cb21da40de69c1eedc2b9ec60001fef0d3b1770a';
const patch = execFileSync('git', ['diff', '--full-index', '--binary', baseline], {cwd: root});
fs.writeFileSync(path.join(directory, 'source.patch'), patch);
const files = execFileSync('git', ['diff', '--name-only', baseline], {cwd: root, encoding: 'utf8'}).trim().split('\n').filter(Boolean);
const source = {
  revision: 'dom-target-v1', baseline,
  workingTreeHead: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
  sourceIsUncommitted: true,
  packageVersion: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version,
  patchSha256: sha(patch),
  files: files.map(file => ({file, sha256: sha(fs.readFileSync(path.join(root, file)))})),
};
fs.writeFileSync(path.join(directory, 'source-manifest.json'), JSON.stringify(source, null, 2) + '\n');
const result = await build({
  absWorkingDir: root,
  stdin: {contents: fs.readFileSync(path.join(directory, 'probe.ts'), 'utf8'), resolveDir: root, sourcefile: 'ime-native-probe.ts', loader: 'ts'},
  outfile: path.join(directory, 'after.js'), bundle: true, format: 'iife', metafile: true,
  tsconfig: path.join(root, 'tsconfig.json'), conditions: ['source'],
  define: {__DEV__: 'true', 'process.env.NODE_ENV': '"development"', 'process.env.LEXICAL_VERSION': '"0.52.0+cb21da40.dom-target-v1"'},
});
const inputs = {};
for (const input of Object.keys(result.metafile.inputs)) {
  const fixture = input === 'ime-native-probe.ts';
  const absolute = fixture ? path.join(directory, 'probe.ts') : path.resolve(root, input);
  inputs[fixture ? 'probe.ts' : path.relative(root, absolute)] = sha(fs.readFileSync(absolute));
}
const manifest = {
  revision: 'dom-target-v1', baseline, packageVersion: source.packageVersion,
  node: process.version, esbuild: version, variant: 'current-source-only; historical baseline reused',
  sourceManifestSha256: sha(fs.readFileSync(path.join(directory, 'source-manifest.json'))),
  inputs, bundleSha256: sha(fs.readFileSync(path.join(directory, 'after.js'))), fixtureHashes: {},
};
for (const name of ['probe.ts', 'index.html', 'scenarios.json', 'build.mjs', 'Probe.swift']) manifest.fixtureHashes[name] = sha(fs.readFileSync(path.join(directory, name)));
fs.writeFileSync(path.join(directory, 'build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({revision: manifest.revision, bundleSha256: manifest.bundleSha256, inputs: Object.keys(inputs).length, sourceFiles: files.length, sourcePatchSha256: source.patchSha256}));
