import argparse, hashlib, json
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('--checkout',type=Path)
parser.add_argument('--local-binary',action='store_true')
args=parser.parse_args()
directory=Path(__file__).resolve().parent
sha=lambda data:hashlib.sha256(data).hexdigest()
records=[json.loads(line) for line in (directory/'events.jsonl').read_text().splitlines()]
scenarios=json.loads((directory/'scenarios.json').read_text())
manifest_path=directory/'capture-build-manifest.json'
if not manifest_path.exists():manifest_path=directory/'build-manifest.json'
build=json.loads(manifest_path.read_text())
start=next(r for r in records if r['type']=='capture-start')
assert start['revision']=='active-node-v4' and start['variant']=='final-only'
assert start['bundleSha256']==build['bundleSha256']
assert start['buildManifestSha256']==sha(manifest_path.read_bytes())
assert start['scenarioPlanSha256']==sha((directory/'scenarios.json').read_bytes())
assert not any(r['type'] in ['fatal','observation-mismatch','focus-abort','probe-failure'] for r in records)
assert records[-1]['type']=='finished' and records[-1]['success'] is True
restored=next(r for r in records if r['type']=='restored')
assert restored['inputSourceRestored'] and restored['previousApplicationFocused'],restored
assert not restored['previousFocusElementAvailable'] or restored['previousFocusElementRestored'],restored
if (directory/'after.js').exists():assert sha((directory/'after.js').read_bytes())==build['bundleSha256']
if args.local_binary:assert sha((directory/'probe').read_bytes())==start['binarySha256']
if args.checkout:
    captured_source_bytes=(directory/'source-manifest.json').read_bytes()
    captured_source=json.loads(captured_source_bytes)
    current_path=directory/'current-source-manifest.json'
    source=json.loads(current_path.read_text()) if current_path.exists() else captured_source
    if current_path.exists():
        assert sha(captured_source_bytes)==source['captureSourceManifestSha256']
        test='packages/lexical/src/__tests__/browser/LexicalSafariComposition.test.ts'
        changed=[name for name,digest in source['files'].items() if digest!=captured_source['files'][name]]
        assert changed==[test] and test not in build['inputs'],changed
        text=(args.checkout/test).read_text()
        for before,after in [('const $slice = () => {','const slice = () => {'),('t.editor.update($slice, {discrete: true});','t.editor.update(slice, {discrete: true});'),('t.editor.read($slice);','t.editor.read(slice);')]:
            assert text.count(before)==1,before
            text=text.replace(before,after)
        assert sha(text.encode())==captured_source['files'][test]
        assert sha((directory/'fix.patch').read_bytes())==source['patchSha256']
        assert sha((directory/'capture-fix.patch').read_bytes())==captured_source['patchSha256']
        assert len(build['inputs'])==134
    for file,digest in source['files'].items():assert sha((args.checkout/file).read_bytes())==digest,file
    for file,digest in build['inputs'].items():
        path=directory/file if file=='probe.ts' else args.checkout/file
        assert sha(path.read_bytes())==digest,file

native_types=['keydown','keyup','compositionstart','compositionupdate','compositionend','beforeinput','input']
events=[r for r in records if r.get('source')=='WKWebView' and r['type'] in native_types]
assert events and all(r['isTrusted'] for r in events)
keys=[r for r in events if r['type']=='keydown']
assert all(not r.get(flag,False) for r in keys for flag in ['altKey','ctrlKey','metaKey','shiftKey'])
posts=[r for r in records if r['type']=='hid-post' and r['down']]
assert posts and all(r['flags']==0 and r['inputSource']=='com.apple.inputmethod.SCIM.ITABC' for r in posts)
source_records=[r for r in records if r['type']=='input-source']
assert len(source_records)==14 and all(r['selectResult']==0 and r['selected']=='com.apple.inputmethod.SCIM.ITABC' for r in source_records)
passed=[r['scenario'] for r in records if r['type']=='scenario-passed']
assert passed==[s['id'] for s in scenarios],passed
summary=[]
for scenario in scenarios:
    sid=scenario['id'];rows=[r for r in records if r.get('scenario')==sid]
    dom=[r for r in rows if r.get('source')=='WKWebView' and r['type'] in native_types]
    ends=[r for r in dom if r['type']=='compositionend']
    assert len(ends)==1,(sid,ends)
    end=ends[0]
    assert len([r for r in dom if r['type']=='compositionstart'])==1,sid
    expected=scenario.get('expected')
    if scenario.get('expectedMode')=='committed-data':
        assert end['data'],sid
        expected=scenario['initial']+end['data']
    elif scenario['cancel'] in ['backspace','escape']:assert end['data']=='',(sid,end)
    else:assert end['data']=='你',(sid,end)
    for stage in ['cancel-result','enter-result']:
        row=next(r for r in rows if r['type']==stage);assert row['result']['ok'],row
        state=row['result']['state'];assert state['model']==state['dom']==expected,row
        assert state['commands']==([] if stage=='cancel-result' else ['enter']),row
        assert not state['composing'] and state['compositionKey'] is None and state['placeholder'] is None,row
    if 'backspaceExpected' in scenario or scenario.get('ordinaryBackspace'):
        row=next(r for r in rows if r['type']=='backspace-result');assert row['result']['ok'],row
        expected_back=scenario.get('backspaceExpected',expected[:-1])
        assert row['result']['state']['model']==row['result']['state']['dom']==expected_back,row
        assert any(r['type']=='keydown' and r['keyCode']==8 for r in dom),sid
    assert any(r['type']=='keydown' and r['keyCode']==13 for r in dom),sid
    end_index=dom.index(end)
    tail=[{'key':r.get('key'),'keyCode':r.get('keyCode')} for r in dom[end_index+1:] if r['type']=='keydown']
    if scenario.get('operation'):
        hook=next(r for r in rows if r['type']=='start-hook-result')
        assert hook['after']['hookCount']==1 and not hook['after']['errors'],hook
    summary.append({'scenario':sid,'editor':'RichText' if scenario['richText'] else 'PlainText','result':'passed','textAfterCancellationOrConfirmation':expected,'compositionendData':end['data'],'inputTypes':[r['inputType'] for r in dom if r['type']=='beforeinput'],'keysAfterCompositionend':tail,'ordinaryBackspaceChecked':'backspaceExpected' in scenario or bool(scenario.get('ordinaryBackspace'))})

history_path=directory/'historical-events-v2.jsonl'
history=[json.loads(line)for line in history_path.read_text().splitlines()]
assert sha(history_path.read_bytes())=='97635e96bb9b9f66acd702ffff9a534f07ce827fba09a30d0d675473ac9116d1'
for sid in ['backspace','escape','selection','nbsp','multi','intercepted']:
    canceled=next(r for r in history if r.get('variant')=='before'and r.get('scenario')==sid and r['type']=='cancel-result')
    entered=next(r for r in history if r.get('variant')=='before'and r.get('scenario')==sid and r['type']=='enter-result')
    assert canceled['state']['composing'] and entered['state']['commands']==[],sid
result={'revision':'active-node-v4','scenarios':summary,'trustedDOMEvents':len(events),'trustedKeydowns':len(keys),'nativeHIDKeydowns':len(posts),'sourceID':'com.apple.inputmethod.SCIM.ITABC','capture':start,'restoration':restored,'reusedBaseline':{'revision':'cb21da40de69c1eedc2b9ec60001fef0d3b1770a','captureDataset':'range-cleanup-v2 before variant','missingEnterCases':6,'newBaselineRun':False},'allPassed':True}
(directory/'capture-summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print('Native final active-node-v4: 14/14 scenarios passed (6 PlainText, 8 RichText).')
print(f'All {len(events)} DOM input/composition/key events and {len(keys)} keydowns are trusted; no modifier shortcut was used.')
print('Exact system Pinyin verified; previous input source and application/focus restored.')
print('Historical exact-upstream baseline reused: 6 missing-Enter failures; no baseline rerun.')

if args.checkout and (directory/'current-source-manifest.json').exists():print('Source reuse verified: 9/10 captured file hashes unchanged; exact test callback rename; 134/134 native inputs unchanged. No new physical run.')
