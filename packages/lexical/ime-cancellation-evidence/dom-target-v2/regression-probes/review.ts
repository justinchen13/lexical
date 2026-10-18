import {buildEditorFromExtensions} from '@lexical/extension';
import {PlainTextExtension} from '@lexical/plain-text';
import {$createParagraphNode,$createTextNode,$getRoot,$getSelection,$isRangeSelection,CONTROLLED_TEXT_INSERTION_COMMAND,COMMAND_PRIORITY_CRITICAL,COMPOSITION_END_COMMAND} from 'lexical';

const flush=()=>new Promise<void>(r=>setTimeout(r,0));
(globalThis as any).runReview=async(kind:string)=>{
 const root=document.createElement('div'); root.contentEditable='true'; document.body.append(root);
 const editor=buildEditorFromExtensions({name:'review-probe',dependencies:[PlainTextExtension]});
 editor.setRootElement(root); root.focus();
 editor.update(()=>{
  const n=$createTextNode('abc');
  $getRoot().clear().append($createParagraphNode().append(n));
  n.select(kind==='token-middle'||kind==='reject-placeholder'?1:3);
  if(kind==='token-middle')n.setMode('token');
  if(kind==='reject-placeholder')($getSelection() as any).format=1;
  if(kind==='multi-selection'||kind==='multi-backward'||kind==='multi-ascii'){
   n.setTextContent(kind==='multi-ascii'?'abcd':'a\u00a0bc');const second=$createTextNode(kind==='multi-ascii'?'DEFZ':'DEF\u00a0Z');
   $getRoot().append($createParagraphNode().append(second));
   const s=$getSelection() as any;
   const forward=kind!=='multi-backward';s.setTextNodeRange(forward?n:second,forward?2:3,forward?second:n,forward?3:2);
  }
 },{discrete:true});
 if(kind==='reject-placeholder')editor.registerCommand(CONTROLLED_TEXT_INSERTION_COMMAND,()=>true,COMMAND_PRIORITY_CRITICAL);
 const state=()=>editor.read(()=>{
  const s=$getSelection();
  return {model:$getRoot().getTextContent(),dom:root.textContent,composing:editor.isComposing(),phase:editor._inputState.compositionPhase,start:editor._inputState.compositionStart,selection:$isRangeSelection(s)?{key:s.anchor.key,offset:s.anchor.offset}:null,nodes:$getRoot().getAllTextNodes().map(n=>({key:n.getKey(),text:n.getTextContent(),mode:n.getMode()}))};
 });
 root.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));await flush();
 const started=state();
 const composingMutation=(text:string,offset:number,inputType:string,data:string|null)=>{
  const s=document.getSelection()!;const dom=s.anchorNode as Text;
  dom.data=text;s.setBaseAndExtent(dom,offset,dom,offset);
  const event=new InputEvent('input',{bubbles:true,inputType,data,isComposing:inputType==='insertCompositionText'});
  Object.defineProperty(event,'inputType',{value:inputType});root.dispatchEvent(event);
 };
 if(kind==='external-insert'||kind==='external-delete'){
  composingMutation('abcni\u00a0',5,'insertCompositionText','ni');await flush();
  editor.update(()=>{
   const n=$getRoot().getAllTextNodes()[0];
   n.spliceText(0,kind==='external-delete'?1:0,kind==='external-insert'?'X':'');
  },{discrete:true});
  const text=kind==='external-insert'?'Xabc':'bc';
  composingMutation(text+'\u00a0',text.length,'deleteCompositionText',null);await flush();
 }
 if(kind==='move-selection'){
  editor.update(()=>{const n=$createTextNode('other');$getRoot().append($createParagraphNode().append(n));n.selectEnd();},{discrete:true});
 }
 const beforeEnd=state();
 root.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:''}));await flush();
 const ended=state();
 if(editor.isComposing())editor.dispatchCommand(COMPOSITION_END_COMMAND,new CompositionEvent('compositionend',{data:''}));await flush();
 const forced=state();
 editor.dispose();root.remove();return {kind,started,beforeEnd,ended,forced};
};
