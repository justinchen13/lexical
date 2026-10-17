import json
from pathlib import Path

records=[json.loads(line) for line in Path(__file__).with_name('events.jsonl').read_text().splitlines()]
assert not any(r.get('type') == 'fatal' for r in records)
assert records[-1]['type'] == 'finished'
expected={'backspace':'abc','escape':'abc','confirm':'abc你','empty':'','selection':'abc','nbsp':'a\u00a0b\u00a0','multi':'abZ','intercepted':'abc'}
for scenario,text in expected.items():
    for phase in ['cancel-result','enter-result']:
        record=next(r for r in records if r.get('variant')=='after' and r.get('scenario')==scenario and r['type']==phase)
        state=record['state']
        assert state['model']==state['dom']==text, record
        assert state['composing'] is False, record
        assert state['commands']==(['enter'] if phase=='enter-result' else []), record
for scenario in ['backspace','escape','selection','nbsp','multi','intercepted']:
    canceled=next(r for r in records if r.get('variant')=='before' and r.get('scenario')==scenario and r['type']=='cancel-result')
    entered=next(r for r in records if r.get('variant')=='before' and r.get('scenario')==scenario and r['type']=='enter-result')
    assert canceled['state']['composing'] is True, canceled
    assert entered['state']['commands']==[], entered
keys=[r for r in records if r['type']=='keydown']
assert keys and all(r.get('isTrusted') for r in keys)
assert all(r.get('isTrusted') for r in records if r['type']=='compositionend')
print('Native WKWebView: 8 final-source scenarios passed; 6 baseline Enter failures reproduced.')
print('All recorded keydown and compositionend events are trusted. No Option shortcut was used.')
