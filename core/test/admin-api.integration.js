const assert = require('node:assert/strict');
const http = require('node:http');

const { CONFIG } = require('../src/config/config');
const store = require('../src/models/store');
const { startAdminServer, stopAdminServer } = require('../src/controllers/admin');

function requestJson({ method = 'GET', port, path, headers = {}, body = null }) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1',
            port,
            path,
            method,
            headers: { Connection: 'close', ...headers },
            agent: false,
        }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                let data = null;
                try { data = text ? JSON.parse(text) : null; } catch {}
                resolve({ status: res.statusCode || 0, data, text });
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

function createProvider() {
    return {
        getAccounts: () => ({ accounts: [{ id: '1', name: 'A' }] }),
        resolveAccountId: (id) => String(id || ''),
        getStatus: () => ({ status: { level: 1, exp: 1 } }),
        getAccountLogs: () => [{ ts: Date.now(), action: 'x' }],
        broadcastConfig: () => {},
    };
}

async function login(port, headers = {}) {
    const res = await requestJson({
        method: 'POST',
        port,
        path: '/api/login',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ password: CONFIG.adminPassword }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.ok, true);
    return res.data.data.token;
}

async function main() {
    const oldPort = CONFIG.adminPort;
    const oldOrigins = CONFIG.adminAllowedOrigins;
    const oldBindIp = CONFIG.adminBindTokenIp;
    const oldEnv = process.env.NODE_ENV;
    const oldTrustProxy = process.env.ADMIN_TRUST_PROXY;
    CONFIG.adminPort = 3911;
    CONFIG.adminAllowedOrigins = 'http://allowed.local';
    process.env.NODE_ENV = 'production';
    process.env.ADMIN_TRUST_PROXY = 'true';
    CONFIG.adminBindTokenIp = true;

    await stopAdminServer();
    startAdminServer(createProvider());

    const unauthorized = await requestJson({ port: 3911, path: '/api/status', headers: { 'x-account-id': '1' } });
    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorized.data.ok, false);
    assert.equal(typeof unauthorized.data.code, 'string');
    assert.equal(typeof unauthorized.data.message, 'string');
    assert.equal(unauthorized.data.error, undefined);

    const token = await login(3911, { 'x-forwarded-for': '1.1.1.1' });
    const authHeaders = { 'x-admin-token': token, 'x-forwarded-for': '1.1.1.1' };

    const qrUnauthorized = await requestJson({ method: 'POST', port: 3911, path: '/api/qr/create', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(qrUnauthorized.status, 401);
    assert.equal(qrUnauthorized.data.ok, false);


    const ipMismatch = await requestJson({
        port: 3911,
        path: '/api/status',
        headers: { 'x-account-id': '1', 'x-admin-token': token, 'x-forwarded-for': '2.2.2.2' },
    });
    assert.equal(ipMismatch.status, 401);
    assert.equal(ipMismatch.data.ok, false);

    const accountLogs = await requestJson({ port: 3911, path: '/api/account-logs?limit=5', headers: authHeaders });
    assert.equal(accountLogs.status, 200);
    assert.equal(accountLogs.data.ok, true);
    assert.ok(Array.isArray(accountLogs.data.data));

    const original = store.setFriendBlacklist;
    store.setFriendBlacklist = () => { throw new Error('boom'); };
    try {
        const toggled = await requestJson({
            method: 'POST',
            port: 3911,
            path: '/api/friend-blacklist/toggle',
            headers: { 'content-type': 'application/json', ...authHeaders, 'x-account-id': '1' },
            body: JSON.stringify({ gid: 123 }),
        });
        assert.equal(toggled.status, 500);
        assert.equal(toggled.data.ok, false);
        assert.equal(toggled.data.code, 'INTERNAL_ERROR');
        assert.equal(toggled.data.error, undefined);
    } finally {
        store.setFriendBlacklist = original;
    }

    const socketDenied = await requestJson({
        port: 3911,
        path: '/socket.io/?EIO=4&transport=polling',
        headers: { origin: 'http://evil.local' },
    });
    assert.equal(socketDenied.status >= 400, true);

    await stopAdminServer();
    CONFIG.adminPort = oldPort;
    CONFIG.adminAllowedOrigins = oldOrigins;
    CONFIG.adminBindTokenIp = oldBindIp;
    process.env.NODE_ENV = oldEnv;
    process.env.ADMIN_TRUST_PROXY = oldTrustProxy;
}

main().then(() => {
    console.log('admin-api.integration: ok');
    process.exit(0);
}).catch(async (err) => {
    console.error('admin-api.integration: failed', err);
    try { await stopAdminServer(); } catch {}
    process.exit(1);
});
