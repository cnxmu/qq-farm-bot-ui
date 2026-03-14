const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSigningSecret, issueAdminToken, verifyJwt } = require('../src/services/auth-token');
const { assertSafeOutboundEndpoint } = require('../src/services/push');
const { shouldRefuseDefaultAdminPassword, shouldRefuseWeakJwtSecret, shouldRefuseUnsafeTrustProxy } = require('../src/services/startup-security');

test('auth-token issues and verifies JWT with exp', () => {
    const secret = buildSigningSecret('1234567890abcdef1234');
    const issued = issueAdminToken({ secret, ip: '127.0.0.1', ttlSec: 3600 });
    assert.ok(issued.token);

    const verified = verifyJwt(issued.token, secret);
    assert.equal(verified.ok, true);
    assert.equal(verified.payload.sub, 'admin');
    assert.ok(verified.payload.exp > verified.payload.iat);
});

test('auth-token rejects invalid signature', () => {
    const secret = buildSigningSecret('1234567890abcdef1234');
    const issued = issueAdminToken({ secret, ip: '127.0.0.1', ttlSec: 3600 });
    const bad = `${issued.token}x`;
    const verified = verifyJwt(bad, secret);
    assert.equal(verified.ok, false);
});


test('auth-token rejects token with unexpected header alg', () => {
    const secret = buildSigningSecret('1234567890abcdef1234');
    const issued = issueAdminToken({ secret, ip: '127.0.0.1', ttlSec: 3600 });
    const parts = issued.token.split('.');
    const badHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const tampered = `${badHeader}.${parts[1]}.${parts[2]}`;
    const verified = verifyJwt(tampered, secret);
    assert.equal(verified.ok, false);
    assert.equal(verified.error, 'invalid_header');
});

test('startup-security refuses default admin password in production without hash', () => {
    assert.equal(shouldRefuseDefaultAdminPassword({
        nodeEnv: 'production',
        hasPasswordHash: false,
        adminPassword: 'admin',
    }), true);

    assert.equal(shouldRefuseDefaultAdminPassword({
        nodeEnv: 'development',
        hasPasswordHash: false,
        adminPassword: 'admin',
    }), false);

    assert.equal(shouldRefuseDefaultAdminPassword({
        nodeEnv: 'production',
        hasPasswordHash: true,
        adminPassword: 'admin',
    }), false);
});

test('startup-security refuses weak jwt secret in production', () => {
    assert.equal(shouldRefuseWeakJwtSecret({
        nodeEnv: 'production',
        adminJwtSecret: '',
    }), true);

    assert.equal(shouldRefuseWeakJwtSecret({
        nodeEnv: 'production',
        adminJwtSecret: 'short',
    }), true);

    assert.equal(shouldRefuseWeakJwtSecret({
        nodeEnv: 'production',
        adminJwtSecret: '1234567890abcdef',
    }), false);

    assert.equal(shouldRefuseWeakJwtSecret({
        nodeEnv: 'development',
        adminJwtSecret: '',
    }), false);
});

test('push endpoint rejects private network target', async () => {
    await assert.rejects(
        () => assertSafeOutboundEndpoint('https://127.0.0.1/hook'),
        /禁止访问内网\/本地地址/,
    );
});

test('push endpoint rejects non-https target', async () => {
    await assert.rejects(
        () => assertSafeOutboundEndpoint('http://example.com/hook'),
        /仅允许 https 推送地址/,
    );
});


test('startup-security refuses unsafe trust proxy=true in production', () => {
    assert.equal(shouldRefuseUnsafeTrustProxy({ nodeEnv: 'production', trustProxy: 'true' }), true);
    assert.equal(shouldRefuseUnsafeTrustProxy({ nodeEnv: 'production', trustProxy: 'loopback, linklocal, uniquelocal' }), false);
    assert.equal(shouldRefuseUnsafeTrustProxy({ nodeEnv: 'development', trustProxy: 'true' }), false);
});

