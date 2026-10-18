import {buildEditorFromExtensions} from '@lexical/extension';
import {PlainTextExtension} from '@lexical/plain-text';
import {$createParagraphNode,$createTextNode,$getRoot,$getSelection,$isRangeSelection} from 'lexical';
const flush=()=>new Promise<void>(r=>setTimeout(r,0));
(globalThis as any).runEdge=async(kind:string)=>{
 const root=document.createElement('div');root.contentEditable='true';document.body.append(root);
 const editor=buildEditorFromExtensions({name:'review-edge',dependencies:[PlainTextExtension]});
 editor.setRootElement(root);root.focus();
 editor.update(()=>{const n=$createTextNode('a\u00a0b');$getRoot().clear().append($createParagraphNode().append(n));n.select(1,2);},{discrete:true});
 const state=()=>editor.read(()=>{const s=$getSelection();return {model:$getRoot().getTextContent(),dom:root.textContent,placeholder:editor._inputState.compositionPlaceholder?{...editor._inputState.compositionPlaceholder}:null,selection:$isRangeSelection(s)?{key:s.anchor.key,offset:s.anchor.offset}:null};});
 root.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));await flush();
 const started=state();
 editor.update(()=>{
  const n=$getRoot().getAllTextNodes()[0];
  const text=kind.endsWith('insert')?'X'+n.getTextContent():'X\u00a0Z';
  if(kind.startsWith('json'))n.updateFromJSON({...n.exportJSON(),text});
  else n.setTextContent(text);
 },{discrete:true});
 const changed=state();
 root.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:''}));await flush();
 const ended=state();editor.dispose();root.remove();return {kind,started,changed,ended};
};
