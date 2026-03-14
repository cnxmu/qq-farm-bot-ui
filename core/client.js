const process = require('node:process');
/**
 * 主程序 - 进程管理器
 * 负责启动 Web 面板，并管理多个 Bot 子进程
 */

const {
    startAdminServer,
    emitRealtimeStatus,
    emitRealtimeLog,
    emitRealtimeAccountLog,
} = require('./src/controllers/admin');
const store = require('./src/models/store');
const { CONFIG } = require('./src/config/config');
const { shouldRefuseDefaultAdminPassword, shouldRefuseWeakJwtSecret } = require('./src/services/startup-security');
const { createRuntimeEngine } = require('./src/runtime/runtime-engine');
const { createModuleLogger } = require('./src/services/logger');
const mainLogger = createModuleLogger('main');

// 打包后 worker 由当前可执行文件以 --worker 模式启动
const isWorkerProcess = process.env.FARM_WORKER === '1';
if (isWorkerProcess) {
    require('./src/core/worker');
} else {
    const hasPasswordHash = !!(store.getAdminPasswordHash && store.getAdminPasswordHash());
    if (shouldRefuseDefaultAdminPassword({
        nodeEnv: process.env.NODE_ENV,
        hasPasswordHash,
        adminPassword: CONFIG.adminPassword,
    })) {
        mainLogger.error('refuse to start with default admin password in production');
        process.exit(1);
    }

    if (shouldRefuseWeakJwtSecret({
        nodeEnv: process.env.NODE_ENV,
        adminJwtSecret: CONFIG.adminJwtSecret,
    })) {
        mainLogger.error('refuse to start with weak ADMIN_JWT_SECRET in production (must be >=16 chars)');
        process.exit(1);
    }

    const runtimeEngine = createRuntimeEngine({
        processRef: process,
        mainEntryPath: __filename,
        startAdminServer,
        onStatusSync: (accountId, status) => {
            emitRealtimeStatus(accountId, status);
        },
        onLog: (entry) => {
            emitRealtimeLog(entry);
        },
        onAccountLog: (entry) => {
            emitRealtimeAccountLog(entry);
        },
    });

    runtimeEngine.start({
        startAdminServer: true,
        autoStartAccounts: true,
    }).catch((err) => {
        mainLogger.error('runtime bootstrap failed', { error: err && err.message ? err.message : String(err) });
    });
}
