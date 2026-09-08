import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {standaloneLicenses} from '../standalone/licenses.js';

test('system keeps six existing licenses and compat adds only packaged Gecko notices', async () => {
  const system = standaloneLicenses('system'), compat = standaloneLicenses('compat');
  assert.equal(system.length,6); assert.equal(compat.length,8);
  assert.deepEqual(compat.slice(0,6),system);
  assert.deepEqual(standaloneLicenses('preview'),system);
  for (const entry of compat) {
    const url = new URL(entry.url);
    const source = entry.id.startsWith('GeckoView-') ? url : new URL('../tools/space-cadet/' + entry.id,import.meta.url);
    assert.ok((await readFile(source)).length > 100,entry.id);
    assert.ok(Object.isFrozen(entry));
  }
});

test('complete Gecko text matches its provenance and includes MPL, third-party, and font notices', async () => {
  const base = new URL('../standalone/licenses/',import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('GeckoView-PROVENANCE.json',base),'utf8'));
  const bytes = await readFile(new URL('GeckoView-NOTICES.txt',base)), text = bytes.toString();
  assert.equal(bytes.length,manifest.noticeBytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.noticeSha256);
  for (const clause of ['Mozilla Public License 2.0','Exhibit A','Exhibit B','GNU Lesser General Public License 2.1','GNU Lesser General Public License 3.0','Other Required Notices','LICENSE_FOXIT','LICENSE_LIBERATION']) assert.ok(text.includes(clause),clause);
  assert.equal(manifest.originalFiles.length,4);
  const source = await readFile(new URL('GeckoView-SOURCE.txt',base),'utf8');
  assert.ok(source.includes(manifest.dependency));
  assert.ok(source.includes('/rev/' + manifest.sourceRevision));
  assert.ok(source.includes('/archive/' + manifest.sourceRevision + '.tar.gz'));
});
