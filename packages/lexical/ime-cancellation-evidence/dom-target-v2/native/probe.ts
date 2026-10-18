import {buildEditorFromExtensions} from '@lexical/extension';
import {PlainTextExtension} from '@lexical/plain-text';
import {RichTextExtension} from '@lexical/rich-text';
import {$sliceSelectedTextNodeContent} from '@lexical/selection';
import {
  $cloneWithPropertiesEphemeral, $create, $createParagraphNode,
  $createRangeSelection, $createTextNode, $getRoot, $getSelection,
  $isRangeSelection, $getState, $setState, createState,
  COMMAND_PRIORITY_CRITICAL, CONTROLLED_TEXT_INSERTION_COMMAND,
  KEY_BACKSPACE_COMMAND, KEY_ENTER_COMMAND, TextNode,
} from 'lexical';

type Scenario = {
  id: string; richText: boolean; initial: string; placement?: string;
  operation?: string; cancel: string; prepared: string; expected?: string;
  expectedMode?: string; ordinaryBackspace?: boolean; backspaceExpected?: string;
};
const host = globalThis as any;
const revision = 'dom-target-v2';
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
const identity = createState('probeIdentity', {parse: value => String(value ?? '')});
class CustomTextNode extends TextNode {
  $config() {return this.config('probe-custom-text', {extends: TextNode});}
}

host.makeFinalProbe = (root: HTMLElement, scenario: Scenario) => {
  const commands: string[] = [];
  const errors: string[] = [];
  const events: any[] = [];
  let hookCount = 0;
  let insertionChecks = 0;
  let originalCustomKey: string | null = null;
  let preparedTargetKey: string | null = null;
  const editor = buildEditorFromExtensions({
    name: 'public-dom-target-ime-probe',
    dependencies: [scenario.richText ? RichTextExtension : PlainTextExtension],
    nodes: [CustomTextNode],
  });
  const log = (record: any) => host.webkit?.messageHandlers.evidence.postMessage(
    JSON.stringify({revision, scenario: scenario.id, ...record}),
  );
  const fail = (error: unknown) => {
    const message = String(error); errors.push(message);
    log({type: 'probe-failure', message});
  };
  const $state = () => {
    const s = $getSelection();
    return {
      model: $getRoot().getTextContent(), dom: root.textContent,
      composing: editor.isComposing(), phase: editor._inputState.compositionPhase,
      compositionKey: editor._compositionKey,
      preparing: editor._inputState.isPreparingComposition,
      selection: $isRangeSelection(s) ? {
        anchorKey: s.anchor.key, anchor: s.anchor.offset,
        focusKey: s.focus.key, focus: s.focus.offset,
      } : null,
      nodes: $getRoot().getAllTextNodes().map(node => ({
        key: node.getKey(), type: node.getType(), text: node.getTextContent(),
        mode: node.getMode(), format: node.getFormat(), identity: $getState(node, identity),
      })),
      commands: [...commands], hookCount, insertionChecks, errors: [...errors],
    };
  };
  const snapshot = () => editor.read($state);
  editor.setRootElement(root); root.focus();
  editor.update(() => {
    const paragraph = $createParagraphNode(); $getRoot().clear().append(paragraph);
    if (!scenario.initial) {paragraph.selectEnd(); return;}
    const custom = scenario.placement === 'custom' || scenario.placement === 'segmented';
    const node = custom ? $create(CustomTextNode).setTextContent(scenario.initial) : $createTextNode(scenario.initial);
    paragraph.append(node);
    if (custom) {$setState(node, identity, 'fixed-test-state'); originalCustomKey = node.getKey();}
    if (scenario.placement?.startsWith('multi')) {
      const last = $createTextNode(scenario.placement === 'multi-backward' ? 'DEF\u00a0Z' : 'DEFZ');
      $getRoot().append($createParagraphNode().append(last));
      const backward = scenario.placement === 'multi-backward';
      node.select().setTextNodeRange(backward ? last : node, backward ? 3 : 2, backward ? node : last, backward ? 2 : 3);
    } else if (scenario.placement === 'format' || scenario.operation === 'copy-insertion') {
      node.select(1, 1).format = 1;
    } else if (scenario.placement === 'token') {
      node.setMode('token').selectEnd();
    } else if (scenario.placement === 'segmented') {
      node.setMode('segmented').select(1, 1);
    } else if (scenario.placement === 'selection') {
      node.select(2, node.getTextContentSize());
    } else if (scenario.operation) {
      node.select(1, 2);
    } else node.selectEnd();
  }, {discrete: true});
  editor.registerCommand(KEY_ENTER_COMMAND, event => {
    event?.preventDefault(); commands.push('enter');
    log({type: 'command', command: 'enter', keyCode: event?.keyCode, isTrusted: event?.isTrusted});
    return true;
  }, COMMAND_PRIORITY_CRITICAL);
  editor.registerCommand(KEY_BACKSPACE_COMMAND, event => {
    commands.push('backspace');
    log({type: 'command', command: 'backspace', keyCode: event?.keyCode, isTrusted: event?.isTrusted});
    return false;
  }, COMMAND_PRIORITY_CRITICAL);
  const editCopy = (copy: TextNode, method: string, text: string) => {
    if (method === 'set') copy.setTextContent(text);
    else if (method === 'splice') copy.spliceText(0, copy.getTextContentSize(), text);
    else copy.updateFromJSON({...copy.exportJSON(), text});
  };
  if (scenario.operation === 'copy-insertion') editor.registerCommand(CONTROLLED_TEXT_INSERTION_COMMAND, text => {
    if (!editor._inputState.isPreparingComposition) return false;
    try {
      check(text === '\u00a0', 'composition-start command payload changed');
      const live = $getRoot().getAllTextNodes()[0]; const original = live.getTextContent();
      for (const method of ['set', 'splice', 'json']) {
        const copy = $cloneWithPropertiesEphemeral(live);
        editCopy(copy, method, 'a\u00a0bc');
        check(copy.getTextContent() === 'a\u00a0bc', 'copy insertion failed: ' + method);
        check(live.getTextContent() === original, 'copy insertion changed the body: ' + method);
        insertionChecks++;
      }
      log({type: 'copy-insertion-checks', state: $state()});
    } catch (error) {fail(error);}
    return true;
  }, COMMAND_PRIORITY_CRITICAL);
  const runStartHook = () => {
    const before = snapshot();
    preparedTargetKey = before.compositionKey;
    check(before.model === scenario.prepared, 'start preparation changed document text: ' + JSON.stringify(before.model));
    check(!before.preparing, 'preparation flag escaped the synchronous command');
    if (scenario.operation === 'copy-insertion') {
      check(insertionChecks === 3, 'copy insertion handler did not run all checks');
    } else if (scenario.operation === 'copies') {
      editor.read(() => {
        const live = $getRoot().getAllTextNodes()[0];
        for (const method of ['set', 'splice', 'json']) {
          const copy = $cloneWithPropertiesEphemeral(live);
          editCopy(copy, method, 'XX' + copy.getTextContent());
          check(copy.getTextContent() === 'XXab\u00a0c', 'ephemeral prefix failed: ' + method);
        }
        const selection = $createRangeSelection();
        selection.setTextNodeRange(live, 1, live, live.getTextContentSize());
        const clone = $sliceSelectedTextNodeContent(selection, live, 'clone');
        const ephemeral = $cloneWithPropertiesEphemeral(live);
        $sliceSelectedTextNodeContent(selection, ephemeral, 'self');
        check(clone.getTextContent() === 'b\u00a0c' && ephemeral.getTextContent() === 'b\u00a0c', 'export slice failed');
      });
      for (const method of ['set', 'splice', 'json']) {
        const copy = editor.read(() => $cloneWithPropertiesEphemeral($getRoot().getAllTextNodes()[0]));
        editor.getEditorState().read(() => {
          editCopy(copy, method, 'export-copy');
          check(copy.getTextContent() === 'export-copy', 'editor-free copy failed: ' + method);
        });
      }
      check(snapshot().model === before.model, 'copies changed the live model');
    } else if (scenario.operation) {
      editor.update(() => {
        const node = $getRoot().getAllTextNodes()[0].getWritable();
        if (scenario.operation === 'json-replace') {
          node.updateFromJSON({...node.exportJSON(), text: 'X\u00a0Z'}); node.select(1, 1);
        } else {
          const selection = $createRangeSelection();
          const start = scenario.operation === 'slice-live' ? 1 : 2;
          const end = scenario.operation === 'slice-live' ? node.getTextContentSize() : start + 1;
          selection.setTextNodeRange(node, start, node, end);
          $sliceSelectedTextNodeContent(selection, node, 'self'); node.select(0, 0);
        }
      }, {discrete: true});
    }
    hookCount++;
    log({type: 'start-hook-result', operation: scenario.operation ?? 'none', before, after: snapshot()});
  };
  const domPoint = (node: Node | null, offset: number) => {
    const key = node ? Array.from(editor._keyToDOMMap).find(([key, element]) => key !== 'root' && element.hasAttribute('data-lexical-text') && (element === node || element.contains(node)))?.[0] : null;
    return {key: key ?? null, offset, text: node?.textContent ?? null};
  };
  for (const type of ['keydown', 'keyup', 'compositionstart', 'compositionupdate', 'compositionend', 'beforeinput', 'input']) root.addEventListener(type, (event: any) => {
    const nativeSelection = root.ownerDocument.getSelection();
    const domSelection = nativeSelection ? {anchor: domPoint(nativeSelection.anchorNode, nativeSelection.anchorOffset), focus: domPoint(nativeSelection.focusNode, nativeSelection.focusOffset)} : null;
    const targetRanges = typeof event.getTargetRanges === 'function' ? Array.from(event.getTargetRanges() as StaticRange[]).map(range => ({start: domPoint(range.startContainer, range.startOffset), end: domPoint(range.endContainer, range.endOffset)})) : [];

    const record = {
      type, key: event.key, keyCode: event.keyCode, data: event.data,
      inputType: event.inputType, isComposing: event.isComposing, isTrusted: event.isTrusted,
      altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey,
      dom: root.textContent, domSelection, targetRanges,
    };
    events.push(record); log(record);
    queueMicrotask(() => log({type: 'after-capture-listener-' + type, ...editor.read('latest', $state)}));
  }, true);
  root.addEventListener('compositionstart', (event: CompositionEvent) => {
    try {
      check(event.isTrusted || host.__probeDryRun, 'compositionstart is not trusted');
      if (hookCount === 0) runStartHook();
      else log({type: 'repeated-compositionstart', data: event.data, state: editor.read('latest', $state)});
    }
    catch (error) {fail(error);}
  });
  const validate = (stage: string) => {
    const state = snapshot(); const issues: string[] = [...errors];
    if (hookCount !== 1) issues.push('expected the model start hook to run exactly once');
    if (state.preparing) issues.push('preparation flag remains active');
    if (stage === 'composing') {
      if (!state.composing) issues.push('native ni did not leave an active composition');
      if (scenario.placement === 'format' || scenario.placement === 'token') {
        const target = state.nodes.find(node => node.key === preparedTargetKey);
        if (!target?.text || state.compositionKey !== preparedTargetKey) issues.push('native input left the prepared DOM target');
        if (scenario.placement === 'format' && target?.format !== 1) issues.push('native input lost the requested bold format');
        if (scenario.placement === 'token' && !state.nodes.some(node => node.mode === 'token' && node.text === scenario.initial)) issues.push('native input modified the token body');
      }
    } else {
      let expected = stage === 'backspace-result' ? scenario.backspaceExpected : scenario.expected;
      const end = events.filter(event => event.type === 'compositionend').at(-1);
      if (!end) issues.push('no DOM compositionend observed');
      if (scenario.expectedMode === 'committed-data') {
        if (!end?.data) issues.push('confirmation has no committed data');
        expected = scenario.initial + (end?.data ?? '');
        if (stage === 'backspace-result') expected = Array.from(expected).slice(0, -1).join('');
      } else if (end?.data !== '') issues.push('cancellation produced nonempty data');
      if (state.model !== expected || state.dom !== expected) issues.push('text mismatch: expected ' + JSON.stringify(expected) + ' got model=' + JSON.stringify(state.model) + ' dom=' + JSON.stringify(state.dom));
      if (state.composing || state.compositionKey !== null) issues.push('composition remains active');
      const expectedCommands = stage === 'cancel-result' ? [] : stage === 'enter-result' ? ['enter'] : ['enter', 'backspace'];
      if (JSON.stringify(commands) !== JSON.stringify(expectedCommands)) issues.push('command mismatch: ' + JSON.stringify(commands));
      if (state.nodes.some(node => node.text === '')) issues.push('empty composition target remains after termination');
      if (scenario.placement === 'custom') {
        const custom = state.nodes.find(node => node.key === originalCustomKey);
        if (custom?.type !== 'probe-custom-text' || custom?.identity !== 'fixed-test-state') issues.push('normal subclass identity was lost');
      }
      if (scenario.placement === 'segmented' && state.nodes.some(node => node.type !== 'text')) issues.push('segmented subclass did not become plain text');
    }
    if (!host.__probeDryRun && events.some(event => !event.isTrusted)) issues.push('untrusted DOM event in native capture');
    return {ok: issues.length === 0, issues, state};
  };
  log({type: 'ready', richText: scenario.richText, ua: navigator.userAgent, state: snapshot()});
  return {snapshot, validate, dispose: () => editor.dispose(), events};
};
