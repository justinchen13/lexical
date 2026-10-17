import {buildEditorFromExtensions} from '@lexical/extension';
import {PlainTextExtension} from '@lexical/plain-text';
import {$createParagraphNode, $createTextNode, $getRoot, $getSelection, $isRangeSelection, COMMAND_PRIORITY_CRITICAL, KEY_ENTER_COMMAND, CONTROLLED_TEXT_INSERTION_COMMAND} from 'lexical';
declare const PROBE_VARIANT: string;
const host = globalThis as any;
host.factories ??= {};
host.factories[PROBE_VARIANT] = (root: HTMLElement, scenario: string) => {
  const commands: string[] = [];
  const editor = buildEditorFromExtensions({name: 'public-ime-repro', dependencies: [PlainTextExtension]});
  editor.setRootElement(root);
  root.focus();
  const initial = scenario === 'empty' || scenario === 'immediate' ? '' : scenario === 'nbsp' ? 'a\u00a0b\u00a0' : scenario === 'selection' ? 'abcDEF' : scenario === 'multi' ? 'abcd' : 'abc';
  editor.update(() => {
    const p = $createParagraphNode();
    $getRoot().clear().append(p);
    if (initial) {
      const text = $createTextNode(initial);
      p.append(text);
      if (scenario === 'multi') {
        const last = $createTextNode('DEFZ');
        $getRoot().append($createParagraphNode().append(last));
        text.select().setTextNodeRange(text, 2, last, 3);
      } else {
        const selection = text.select(scenario === 'intercepted' ? 1 : scenario === 'selection' ? 3 : initial.length, initial.length);
        if (scenario === 'intercepted') {text.select(1,1).format=1;}
      }
    } else p.selectEnd();
  }, {discrete: true});
  if (scenario === 'intercepted') editor.registerCommand(CONTROLLED_TEXT_INSERTION_COMMAND, () => true, COMMAND_PRIORITY_CRITICAL);
  editor.registerCommand(KEY_ENTER_COMMAND, e => {e?.preventDefault();commands.push('enter');return true}, COMMAND_PRIORITY_CRITICAL);
  const snapshot = () => editor.read(() => {
    const s = $getSelection();
    return {model: $getRoot().getTextContent(), dom: root.textContent, composing: editor.isComposing(), phase: editor._inputState.compositionPhase, compositionKey: editor._compositionKey, selection: $isRangeSelection(s) ? {anchor: s.anchor.offset, focus:s.focus.offset} : null, commands:[...commands]};
  });
  const log = (record: any) => host.webkit?.messageHandlers.evidence.postMessage(JSON.stringify({variant: PROBE_VARIANT, scenario, ...record}));
  for (const type of ['keydown','keyup','compositionstart','compositionupdate','compositionend','beforeinput','input']) root.addEventListener(type, (e: any) => {
    log({type, key:e.key, keyCode:e.keyCode, data:e.data,inputType:e.inputType,isComposing:e.isComposing,isTrusted:e.isTrusted, dom:root.textContent});
    queueMicrotask(() => log({type:'after-'+type,...snapshot()}));
  }, true);
  log({type:'ready', ua:navigator.userAgent,...snapshot()});
  return {snapshot,dispose:()=>editor.dispose()};
};
