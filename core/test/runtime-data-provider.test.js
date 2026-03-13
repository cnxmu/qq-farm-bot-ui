const test = require('node:test');
const assert = require('node:assert/strict');

const { createDataProvider } = require('../src/runtime/data-provider');

test('getLogs prefers worker scoped logs for account query', () => {
    const workers = {
        '1': {
            logs: [{ accountId: '1', msg: 'worker-log', ts: Date.now(), tag: '系统', meta: {} }],
        },
    };
    const globalLogs = [
        { accountId: '1', msg: 'global-old', ts: Date.now(), tag: '系统', meta: {} },
        { accountId: '2', msg: 'other', ts: Date.now(), tag: '系统', meta: {} },
    ];

    const provider = createDataProvider({
        workers,
        globalLogs,
        accountLogs: [],
        store: {},
        getAccounts: () => ({ accounts: [{ id: '1' }] }),
        callWorkerApi: async () => null,
        buildDefaultStatus: () => ({}),
        normalizeStatusForPanel: (s) => s,
        filterLogs: (list) => list,
        addAccountLog: () => null,
        nextConfigRevision: () => 1,
        broadcastConfigToWorkers: () => null,
        startWorker: () => null,
        stopWorker: () => null,
        restartWorker: () => null,
    });

    const logs = provider.getLogs('1', { limit: 100 });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].msg, 'worker-log');
});
