import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = process.cwd(); const dir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(root, 'package.json'));
const {webkit, chromium} = require('playwright');
const scenarios = JSON.parse(fs.readFileSync(path.join(dir, 'native/scenarios.json'), 'utf8'));
const results = [];
for (const [engine, api] of [['webkit', webkit], ['chromium', chromium]]) {
  const browser = await api.launch({headless: true});
  try {
    const page = await browser.newPage({userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15'});
    await page.setContent('<html><body><div id="root" contenteditable="true"></div></body></html>');
    await page.evaluate(() => {globalThis.__probeDryRun = true; globalThis.__records = []; globalThis.webkit = {messageHandlers: {evidence: {postMessage: value => globalThis.__records.push(JSON.parse(value))}}};});
    await page.addScriptTag({path: path.join(dir, 'native/after.js')});
    for (const scenario of scenarios) {
      try {
        const result = await page.evaluate(async scenario => {
          globalThis.current?.dispose();
          const old = document.querySelector('#root'); const root = old.cloneNode(false); old.replaceWith(root);
          globalThis.current = globalThis.makeFinalProbe(root, scenario);
          const flush = () => new Promise(resolve => setTimeout(resolve, 0));
          const composition = (type, data = '') => root.dispatchEvent(new CompositionEvent(type, {bubbles: true, data}));
          const key = (name, keyCode) => root.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, cancelable: true, key: name, keyCode}));
          const input = (type, inputType, data) => {
            const event = new InputEvent(type, {bubbles: true, cancelable: type === 'beforeinput', inputType, data, isComposing: inputType === 'insertCompositionText'});
            Object.defineProperty(event, 'inputType', {value: inputType}); root.dispatchEvent(event);
          };
          composition('compositionstart'); await flush();
          const selection = document.getSelection(); const target = selection.anchorNode; const start = Math.min(selection.anchorOffset, selection.focusOffset); const replaceEnd = Math.max(selection.anchorOffset, selection.focusOffset);
          if (!(target instanceof Text)) throw Error('No DOM composition target');
          const prefix = target.data.slice(0, start); const suffix = target.data.slice(replaceEnd);
          const set = (text, offset) => {target.data = text; selection.setBaseAndExtent(target, offset, target, offset);};
          const compose = async text => {
            composition('compositionupdate', text); input('beforeinput', 'insertCompositionText', text);
            set(prefix + text + suffix, start + text.length); input('input', 'insertCompositionText', text); await flush(); key(text.at(-1) ?? 'Backspace', 229);
          };
          await compose('n'); await compose('ni');
          const composing = globalThis.current.validate('composing');
          if (scenario.cancel === 'backspace') await compose('n');
          input('beforeinput', 'deleteCompositionText', null); set(prefix + suffix, start); input('input', 'deleteCompositionText', null); await flush();
          if (scenario.cancel === 'space' || scenario.cancel === 'enter') {
            const data = scenario.cancel === 'space' ? '你' : 'ni';
            input('beforeinput', 'insertFromComposition', data); await flush(); composition('compositionend', data); key(scenario.cancel === 'space' ? ' ' : 'Enter', 229);
          } else {composition('compositionend'); key(scenario.cancel === 'backspace' ? 'Backspace' : 'Escape', 229);}
          await flush(); const ended = globalThis.current.validate('cancel-result');
          key('Enter', 13); await flush(); const entered = globalThis.current.validate('enter-result');
          let backspace = null;
          if (scenario.backspaceExpected !== undefined || scenario.ordinaryBackspace) {key('Backspace', 8); await flush(); backspace = globalThis.current.validate('backspace-result');}
          return {id: scenario.id, composing, ended, entered, backspace, pass: composing.ok && ended.ok && entered.ok && (!backspace || backspace.ok)};
        }, scenario);
        results.push({engine, ...result});
      } catch (error) {results.push({engine, id: scenario.id, pass: false, error: String(error)});}
    }
    const records = await page.evaluate(() => globalThis.__records);
    fs.writeFileSync(path.join(dir, 'native-dry-run-' + engine + '-events.json'), JSON.stringify(records, null, 2) + '\n');
  } finally {await browser.close();}
}
fs.writeFileSync(path.join(dir, 'new-native-dry-run-results.json'), JSON.stringify(results, null, 2) + '\n');
for (const engine of ['webkit', 'chromium']) {
  const rows = results.filter(row => row.engine === engine);
  console.log(JSON.stringify({engine, synthetic: true, passed: rows.filter(row => row.pass).length, total: rows.length, failed: rows.filter(row => !row.pass)}));
}
process.exitCode = results.some(row => !row.pass) ? 1 : 0;
