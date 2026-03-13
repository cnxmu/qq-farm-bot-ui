const test = require('node:test');
const assert = require('node:assert/strict');

const { sanitizeAccountPayload, parseImportGids } = require('../src/services/admin-validators');

test('sanitizeAccountPayload keeps only allowlisted fields', () => {
    const payload = sanitizeAccountPayload({
        id: '100',
        name: '  abc  ',
        code: 'xyz',
        platform: 'QQ',
        gid: '123',
        openId: 'oid',
        uin: 'uin',
        avatar: 'http://example.com/a.png',
        hacked: '<script>alert(1)</script>',
        nested: { x: 1 },
    }, { isUpdate: true });

    assert.deepEqual(Object.keys(payload).sort(), [
        'avatar', 'avatarUrl', 'code', 'gid', 'id', 'name', 'openId', 'platform', 'uin',
    ].sort());
    assert.equal(payload.platform, 'qq');
    assert.equal(payload.name, 'abc');
});

test('parseImportGids deduplicates and limits size', () => {
    const input = Array.from({ length: 1000 }, (_, i) => String((i % 600) + 1));
    const { gids, truncated } = parseImportGids(input, { maxImport: 500 });
    assert.equal(gids.length, 500);
    assert.equal(truncated, true);
    assert.equal(new Set(gids).size, gids.length);
});
