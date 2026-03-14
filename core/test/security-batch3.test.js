const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { ApiError, toApiError } = require('../src/services/api-error');
const { acquireSingleWriterLease } = require('../src/services/single-writer-lock');
const { writeTextFileAtomic, readTextFile } = require('../src/services/json-db');

test('api-error keeps unified payload fields and conflict mapping', () => {
    const mapped = toApiError({ code: 'CONFIG_WRITE_CONFLICT', message: 'conflict' });
    assert.equal(mapped.status, 409);
    assert.equal(mapped.code, 'CONFIG_WRITE_CONFLICT');
    assert.equal(mapped.message, 'conflict');

    const err = new ApiError('bad input', 400, 'BAD_INPUT', { field: 'id' });
    assert.equal(err.details.field, 'id');
    assert.equal(Object.prototype.hasOwnProperty.call(err, 'error'), false);
});

test('admin controller has no legacy direct "ok:false" status-json branches', () => {
    const file = path.join(__dirname, '../src/controllers/admin.js');
    const content = fs.readFileSync(file, 'utf8');
    const legacyPattern = /res\.status\([^\n]*\)\.json\(\{\s*ok:\s*false/;
    const legacy200Pattern = /res\.json\(\{\s*ok:\s*false/;
    assert.equal(legacyPattern.test(content), false);
    assert.equal(legacy200Pattern.test(content), false);
});

test('single-writer lease rejects concurrent writer in strict mode', () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-writer-lock-'));
    const first = acquireSingleWriterLease({ dataDir, strict: true });
    assert.equal(first.ok, true);

    assert.throws(() => {
        acquireSingleWriterLease({ dataDir, strict: true });
    }, /single-writer lease already held/);

    first.release();
});

test('json-db atomic write acquires lock and persists content', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-json-db-'));
    const filePath = path.join(dir, 'sample.json');
    writeTextFileAtomic(filePath, '{"ok":true}');
    const text = readTextFile(filePath, '');
    assert.equal(text, '{"ok":true}');
    assert.equal(fs.existsSync(`${filePath}.lock`), false);
});


test('security middleware uses unified message/code payload instead of legacy error field', () => {
    const file = path.join(__dirname, '../src/services/security.js');
    const content = fs.readFileSync(file, 'utf8');
    assert.equal(content.includes("error: strength.feedback[0]"), false);
    assert.equal(content.includes("error: '请求过于频繁，请稍后重试'"), false);
    assert.equal(content.includes("message: strength.feedback[0]"), true);
    assert.equal(content.includes("code: 'RATE_LIMITED'"), true);
});

