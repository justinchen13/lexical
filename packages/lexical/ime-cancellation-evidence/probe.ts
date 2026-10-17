import {buildEditorFromExtensions} from '@lexical/extension';
import {PlainTextExtension} from '@lexical/plain-text';
import {RichTextExtension} from '@lexical/rich-text';
import {$sliceSelectedTextNodeContent} from '@lexical/selection';
import {
  $cloneWithPropertiesEphemeral, $createParagraphNode, $createRangeSelection,
  $createTextNode, $getRoot, $getSelection, $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL, CONTROLLED_TEXT_INSERTION_COMMAND,
  KEY_BACKSPACE_COMMAND, KEY_ENTER_COMMAND, TextNode,
} from 'lexical';

type Scenario = {id:string; richText:boolean; initial:string; operation?:string; cancel:string; expected?:string; expectedMode?:string; ordinaryBackspace?:boolean; backspaceExpected?:string};
const host = globalThis as any;
const check = (condition: unknown, message: string) => {if (!condition) throw new Error(message);};
host.makeFinalProbe = (root: HTMLElement, scenario: Scenario) => {
  const commands: string[] = [];
  const errors: string[] = [];
  const events: any[] = [];
  let hookCount = 0;
  let insertionChecks = 0;
  const editor = buildEditorFromExtensions({name:'public-final-ime-probe',dependencies:[scenario.richText ? RichTextExtension : PlainTextExtension]});
  const log = (record: any) => host.webkit?.messageHandlers.evidence.postMessage(JSON.stringify({revision:'active-node-v4',scenario:scenario.id,...record}));
  const fail = (error: unknown) => {const message=String(error);errors.push(message);log({type:'probe-failure',message});};
  const $state = () => {
    const s=$getSelection();const p=editor._inputState.compositionPlaceholder;
    return {model:$getRoot().getTextContent(),dom:root.textContent,composing:editor.isComposing(),phase:editor._inputState.compositionPhase,compositionKey:editor._compositionKey,placeholder:p?{...p}:null,selection:$isRangeSelection(s)?{anchorKey:s.anchor.key,anchor:s.anchor.offset,focusKey:s.focus.key,focus:s.focus.offset}:null,commands:[...commands],hookCount,insertionChecks,errors:[...errors]};
  };
  const snapshot = () => editor.read($state);
  editor.setRootElement(root);root.focus();
  editor.update(() => {
    const paragraph=$createParagraphNode();$getRoot().clear().append(paragraph);
    if (!scenario.initial) {paragraph.selectEnd();return;}
    const node=$createTextNode(scenario.initial);paragraph.append(node);
    if (scenario.id==='multi') {
      const last=$createTextNode('DEFZ');$getRoot().append($createParagraphNode().append(last));
      node.select().setTextNodeRange(node,2,last,3);
    } else if (scenario.operation==='copy-insertion') {node.select(1,1).format=1;}
    else if (scenario.operation) node.select(1,2);
    else node.selectEnd();
  },{discrete:true});
  editor.registerCommand(KEY_ENTER_COMMAND,e=>{e?.preventDefault();commands.push('enter');return true;},COMMAND_PRIORITY_CRITICAL);
  editor.registerCommand(KEY_BACKSPACE_COMMAND,()=>{commands.push('backspace');return false;},COMMAND_PRIORITY_CRITICAL);
  const editCopy = (copy:TextNode,method:string,text:string) => {
    if(method==='set')copy.setTextContent(text);
    else if(method==='splice')copy.spliceText(0,copy.getTextContentSize(),text);
    else copy.updateFromJSON({...copy.exportJSON(),text});
  };
  if (scenario.operation==='copy-insertion') editor.registerCommand(CONTROLLED_TEXT_INSERTION_COMMAND,()=>{
    if(!editor._inputState.isInsertingCompositionPlaceholder)return false;
    try {
      const live=$getRoot().getAllTextNodes()[0];const original=live.getTextContent();
      for(const method of ['set','splice','json']) {
        const copy=$cloneWithPropertiesEphemeral(live);
        editCopy(copy,method,'a\u00a0bc');
        check(copy.getTextContent()==='a\u00a0bc','copy insertion failed: '+method);
        check(live.getTextContent()===original,'copy insertion changed live text: '+method);
        check(editor._inputState.compositionPlaceholder===null,'copy insertion established live marker: '+method);
        insertionChecks++;
      }
      log({type:'copy-insertion-checks',state:$state()});
    } catch(error) {fail(error);}
    return true;
  },COMMAND_PRIORITY_CRITICAL);
  const runStartHook = () => {
    if(!scenario.operation)return;
    const before=snapshot();
    if(scenario.operation==='copy-insertion') {
      check(insertionChecks===3,'copy insertion handler did not run three checks');
      check(before.placeholder===null,'copy insertion left marker');
    } else {
      check(before.placeholder?.offset===1,'expected owned marker at offset 1 before hook');
      if(scenario.operation==='copies') {
        editor.read(()=>{
          const live=$getRoot().getAllTextNodes()[0];
          for(const method of ['set','splice','json']) {
            const copy=$cloneWithPropertiesEphemeral(live);
            if(method==='splice')copy.spliceText(0,0,'XX');
            else editCopy(copy,method,'XX'+copy.getTextContent());
            check(copy.getTextContent()==='XXa\u00a0b\u00a0c','ephemeral prefix failed: '+method);
          }
          const selection=$createRangeSelection();selection.setTextNodeRange(live,2,live,5);
          const clone=$sliceSelectedTextNodeContent(selection,live,'clone');
          const ephemeral=$cloneWithPropertiesEphemeral(live);
          $sliceSelectedTextNodeContent(selection,ephemeral,'self');
          check(clone.getTextContent()==='b\u00a0c'&&ephemeral.getTextContent()==='b\u00a0c','export slice failed');
        });
        for(const method of ['set','splice','json']) {
          const copy=editor.read(()=>$cloneWithPropertiesEphemeral($getRoot().getAllTextNodes()[0]));
          editor.getEditorState().read(()=>{
            editCopy(copy,method,'export-copy');
            check(copy.getTextContent()==='export-copy','editor-free copy failed: '+method);
          });
        }
        const after=snapshot();
        check(after.model===before.model,'copies changed live model');
        check(JSON.stringify(after.placeholder)===JSON.stringify(before.placeholder),'copies changed live marker');
      } else {
        editor.update(()=>{
          const node=$getRoot().getAllTextNodes()[0].getWritable();
          if(scenario.operation==='json-insert') {
            node.updateFromJSON({...node.exportJSON(),text:'X'+node.getTextContent()});
            node.select(2,2);
          } else if(scenario.operation==='json-replace') {
            node.updateFromJSON({...node.exportJSON(),text:'X\u00a0Z'});node.select(1,1);
          } else {
            const selection=$createRangeSelection();
            const offset=scenario.operation==='slice-live'?2:scenario.operation==='slice-owned'?1:3;
            selection.setTextNodeRange(node,offset,node,scenario.operation==='slice-live'?5:offset+1);
            $sliceSelectedTextNodeContent(selection,node,'self');node.select(0,0);
          }
        },{discrete:true});
        const after=snapshot();
        if(scenario.operation==='json-insert')check(after.placeholder?.offset===2,'JSON prefix did not move marker to 2');
        else if(scenario.operation==='slice-owned')check(after.placeholder?.offset===0,'owned slice did not move marker to 0');
        else check(after.placeholder===null,'removed/ambiguous placeholder remained owned');
      }
    }
    hookCount++;
    log({type:'start-hook-result',operation:scenario.operation,before,after:snapshot()});
  };
  for(const type of ['keydown','keyup','compositionstart','compositionupdate','compositionend','beforeinput','input'])root.addEventListener(type,(e:any)=>{
    const record={type,key:e.key,keyCode:e.keyCode,data:e.data,inputType:e.inputType,isComposing:e.isComposing,isTrusted:e.isTrusted,altKey:e.altKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey,shiftKey:e.shiftKey,dom:root.textContent};
    events.push(record);log(record);
    queueMicrotask(()=>log({type:'after-'+type,...snapshot()}));
  },true);
  root.addEventListener('compositionstart',(e:any)=>{
    try {check(e.isTrusted||host.__probeDryRun,'compositionstart is not trusted');runStartHook();}catch(error){fail(error);}
  });
  const validate=(stage:string)=>{
    const state=snapshot();const issues:string[]=[];
    if(errors.length)issues.push(...errors);
    if(scenario.operation&&hookCount!==1)issues.push('expected exactly one start hook');
    if(stage==='composing') {if(!state.composing)issues.push('native ni did not leave an active composition');}
    else {
      let expected=stage==='backspace-result'?scenario.backspaceExpected:scenario.expected;
      if(scenario.expectedMode==='committed-data') {
        const end=events.filter(e=>e.type==='compositionend').at(-1);
        if(!end?.data)issues.push('Enter confirmation has no committed data');
        expected=scenario.initial+(end?.data??'');
        if(stage==='backspace-result')expected=Array.from(expected).slice(0,-1).join('');
      }
      if(state.model!==expected||state.dom!==expected)issues.push('text mismatch: expected '+JSON.stringify(expected)+' got model='+JSON.stringify(state.model)+' dom='+JSON.stringify(state.dom));
      if(state.composing||state.compositionKey!==null||state.placeholder!==null)issues.push('composition or placeholder remains active');
      const expectedCommands=stage==='cancel-result'?[]:stage==='enter-result'?['enter']:['enter','backspace'];
      if(JSON.stringify(commands)!==JSON.stringify(expectedCommands))issues.push('command mismatch: '+JSON.stringify(commands));
    }
    return {ok:issues.length===0,issues,state};
  };
  log({type:'ready',richText:scenario.richText,ua:navigator.userAgent,state:snapshot()});
  return {snapshot,validate,dispose:()=>editor.dispose(),events};
};
