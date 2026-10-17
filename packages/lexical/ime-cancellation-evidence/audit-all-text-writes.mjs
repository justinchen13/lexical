import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(path.join(process.cwd(),'package.json'));
const ts=require('typescript');
const writes=[],files=[],mentions=[];
const excluded=new Set(['node_modules','dist','build','coverage','__tests__','__mocks__','__fixtures__','test','tests','.vitest']);
function visitFile(file) {
 const code=fs.readFileSync(file,'utf8');files.push(file);
 if(!code.includes('__text'))return;
 mentions.push(file);
 const source=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true);
 function record(node,kind){const {line}=source.getLineAndCharacterOfPosition(node.getStart(source));writes.push({file,line:line+1,kind,code:node.getText(source)});}
 function isTextProperty(n){return(ts.isPropertyAccessExpression(n)&&n.name.text==='__text')||(ts.isElementAccessExpression(n)&&n.argumentExpression&&ts.isStringLiteral(n.argumentExpression)&&n.argumentExpression.text==='__text');}
 function visit(n) {
  if(ts.isBinaryExpression(n)&&ts.isAssignmentOperator(n.operatorToken.kind)&&isTextProperty(n.left))record(n,'assignment');
  if((ts.isPrefixUnaryExpression(n)||ts.isPostfixUnaryExpression(n))&&isTextProperty(n.operand))record(n,'unary mutation');
  if((ts.isPropertyAssignment(n)||ts.isPropertyDeclaration(n))&&n.name&&['__text','"__text"',"'__text'"].includes(n.name.getText(source))&&n.initializer)record(n,'initializer/property');
  if(ts.isCallExpression(n)&&n.expression.getText(source)==='Object.defineProperty'&&n.arguments[1]&&ts.isStringLiteral(n.arguments[1])&&n.arguments[1].text==='__text')record(n,'defineProperty');
  ts.forEachChild(n,visit);
 }
 visit(source);
}
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(excluded.has(e.name)||e.isSymbolicLink())continue;const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(?:[cm]?js|[cm]?ts|tsx|jsx)$/.test(e.name)&&!/(?:\.test\.|\.spec\.|\.d\.ts$)/.test(e.name))visitFile(p);}}
walk('packages');
console.log(JSON.stringify({scope:'All production JS/TS under packages, not limited to src or selected packages',excludedDirectories:[...excluded],scannedFiles:files.length,textMentionFiles:mentions,writes,dynamicPathsReviewed:['LexicalUtils.$walkSetters: text schema resolves to method setter (TextNode and CodeHighlight generated/walk parity tested)','LexicalUtils synthesized afterCloneFrom: copies current storage to clone; does not change logical-node text']},null,2));
