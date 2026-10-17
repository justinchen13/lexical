"""Verify the metadata-only commit rewrite without fetching historical commits."""

import hashlib
import json
from pathlib import Path

directory = Path(__file__).resolve().parent
mapping = json.loads((directory / 'commit-identity-map.json').read_text())
previous_old = previous_new = mapping['baseline']


def read_commit(name, expected):
    data = (directory / name).read_bytes()
    assert hashlib.sha1(b'commit ' + str(len(data)).encode() + b'\0' + data).hexdigest() == expected
    header, message = data.split(b'\n\n', 1)
    fields = dict(line.split(b' ', 1) for line in header.splitlines())
    assert set(fields) == {b'tree', b'parent', b'author', b'committer'}
    return fields, message


for row in mapping['commits']:
    old, old_message = read_commit(row['oldCommitFile'], row['old'])
    new, new_message = read_commit(row['newCommitFile'], row['new'])
    assert old[b'parent'].decode() == previous_old
    assert new[b'parent'].decode() == previous_new
    assert old[b'tree'] == new[b'tree'] == row['tree'].encode()
    assert old_message == new_message
    for field in (b'author', b'committer'):
        old_identity, old_date = old[field].rsplit(b'> ', 1)
        new_identity, new_date = new[field].rsplit(b'> ', 1)
        assert old_identity + b'>' == mapping['previousIdentity'].encode()
        assert new_identity + b'>' == mapping['currentIdentity'].encode()
        assert old_date == new_date
    previous_old, previous_new = row['old'], row['new']

current = json.loads((directory / 'current-source-manifest.json').read_text())
assert current['sourceCommit'] == previous_new == mapping['currentSourceCommit']
assert current['previousSourceCommit'] == previous_old
assert current['patchSha256'] == mapping['patchSha256']
assert hashlib.sha256((directory / 'fix.patch').read_bytes()).hexdigest() == mapping['patchSha256']
assert current['captureSourceManifestSha256'] == hashlib.sha256((directory / 'source-manifest.json').read_bytes()).hexdigest()
print('Identity rewrite verified: 2/2 commit trees, messages and dates unchanged; only identities and the second parent changed.')
print('Current source: ' + previous_new)
print('Patch bytes unchanged; capture manifests and physical evidence retained. No new physical run.')
