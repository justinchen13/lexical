import {buildEditorFromExtensions} from '@lexical/extension';
import {PlainTextExtension} from '@lexical/plain-text';
import {$createCodeHighlightNode,$createCodeNode,CodeHighlightNode,CodeNode} from '@lexical/code-core';
import {$sliceSelectedTextNodeContent} from '@lexical/selection';
import {$cloneWithPropertiesEphemeral,$create,$createParagraphNode,$createRangeSelection,$createTextNode,$getRoot,$getSelection,$isRangeSelection,TextNode} from 'lexical';
const flush=()=>new Promise<void>(r=>setTimeout(r,0));
let setterCalls=0;
class SetterText extends TextNode{
 $config(){return this.config('setter-review',{extends:TextNode});}
 setTextContent(text:string):this{setterCalls++;return super.setTextContent(text);}
}
(globalThis as any).runExtra=async(kind:string)=>{
 const root=document.createElement('div');root.contentEditable='true';document.body.append(root);
 const editor=buildEditorFromExtensions({name:'review-extra',dependencies:[PlainTextExtension],nodes:[CodeNode,CodeHighlightNode,SetterText]});
 editor.setRootElement(root);root.focus();
 editor.update(()=>{
  const n=kind.includes('code')?$createCodeHighlightNode('a\u00a0b','keyword'):kind.includes('custom')?$create(SetterText).setTextContent('a\u00a0b'):$createTextNode(kind==='slice-live'||kind==='ephemeral-set'||kind==='ephemeral-json'?'a\u00a0b\u00a0c':'a\u00a0b');
  $getRoot().clear().append((kind.includes('code')?$createCodeNode():$createParagraphNode()).append(n));n.select(1,2);
 },{discrete:true});
 const state=()=>editor.read(()=>{const s=$getSelection();return {model:$getRoot().getTextContent(),dom:root.textContent,placeholder:editor._inputState.compositionPlaceholder?{...editor._inputState.compositionPlaceholder}:null,selection:$isRangeSelection(s)?{key:s.anchor.key,offset:s.anchor.offset}:null};});
 if(kind==='ephemeral-no-editor'){
  let outcome:any;
  const clone=editor.read(()=>$cloneWithPropertiesEphemeral($getRoot().getAllTextNodes()[0]));
  try{outcome=editor.getEditorState().read(()=>{
   clone.setTextContent('export-copy');return {text:clone.getTextContent()};
  });}catch(e){outcome={error:String(e)};}
  const live=state();editor.dispose();root.remove();return {kind,outcome,live};
 }
 root.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));await flush();
 const started=state();let extra:any;
 if(kind==='ephemeral-set'||kind==='ephemeral-json'){
  extra=editor.read(()=>{
   const clone=$cloneWithPropertiesEphemeral($getRoot().getAllTextNodes()[0]);
   if(kind==='ephemeral-set')clone.setTextContent('XX'+clone.getTextContent());else clone.updateFromJSON({...clone.exportJSON(),text:'XX'+clone.getTextContent()});
   return {cloneText:clone.getTextContent()};
  });
 }else if(kind==='slice-live'){
  editor.update(()=>{
   const n=$getRoot().getAllTextNodes()[0].getWritable();const s=$createRangeSelection();s.setTextNodeRange(n,2,n,5);
   $sliceSelectedTextNodeContent(s,n,'self');
  },{discrete:true});
 }else{
  editor.update(()=>{const n=$getRoot().getAllTextNodes()[0];const beforeCalls=setterCalls;n.updateFromJSON({...n.exportJSON(),text:kind.endsWith('insert')?'X'+n.getTextContent():'X\u00a0Z'});extra={setterCalls: setterCalls-beforeCalls};},{discrete:true});
 }
 const changed=state();root.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:''}));await flush();
 const ended=state();editor.dispose();root.remove();return {kind,started,changed,ended,extra};
};
