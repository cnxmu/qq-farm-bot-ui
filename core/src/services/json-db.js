const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');

const DEFAULT_LOCK_STALE_MS = 30_000;
const DEFAULT_LOCK_RETRY = 5;
const DEFAULT_LOCK_WAIT_MS = 20;

function sleepMs(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function safeParseJson(input) {
    try {
        return JSON.parse(String(input || ''));
    } catch {
        return null;
    }
}

function isProcessAlive(pid) {
    const id = Number(pid);
    if (!Number.isInteger(id) || id <= 0) return false;
    try {
        process.kill(id, 0);
        return true;
    } catch {
        return false;
    }
}

function cleanupStaleLock(lockPath, staleMs) {
    try {
        const stat = fs.statSync(lockPath);
        const age = Date.now() - Number(stat.mtimeMs || 0);
        const raw = fs.readFileSync(lockPath, 'utf8');
        const payload = safeParseJson(raw) || {};
        const lockPid = Number(payload.pid || 0);
        const holderAlive = isProcessAlive(lockPid);
        if (!holderAlive || age > staleMs) {
            fs.unlinkSync(lockPath);
            return true;
        }
    } catch {
        // ignore stale lock cleanup failures
    }
    return false;
}

function ensureParentDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function withFileLock(filePath, fn, options = {}) {
    const staleMs = Math.max(1_000, Number(options.staleMs) || DEFAULT_LOCK_STALE_MS);
    const retry = Math.max(0, Number(options.retry) || DEFAULT_LOCK_RETRY);
    const waitMs = Math.max(1, Number(options.waitMs) || DEFAULT_LOCK_WAIT_MS);
    const lockPath = `${filePath}.lock`;
    ensureParentDir(lockPath);

    let lastAcquireError = null;
    for (let i = 0; i <= retry; i += 1) {
        let lockFd = null;
        try {
            lockFd = fs.openSync(lockPath, 'wx', 0o600);
            const payload = JSON.stringify({ pid: process.pid, acquiredAt: Date.now(), filePath });
            fs.writeFileSync(lockFd, payload, 'utf8');
            try {
                return fn();
            } finally {
                try { fs.closeSync(lockFd); } catch {}
                try { fs.unlinkSync(lockPath); } catch {}
            }
        } catch (err) {
            if (lockFd !== null) {
                try { fs.closeSync(lockFd); } catch {}
            }

            // Non-lock-acquire errors come from fn() after lock acquisition;
            // rethrow original error instead of converting to FILE_LOCK_FAILED.
            if (!err || err.code !== 'EEXIST') {
                throw err;
            }

            lastAcquireError = err;
            cleanupStaleLock(lockPath, staleMs);
            if (i < retry) sleepMs(waitMs);
        }
    }

    const message = `failed to acquire file lock: ${lockPath}`;
    const lockError = new Error(message);
    lockError.code = 'FILE_LOCK_FAILED';
    lockError.cause = lastAcquireError;
    throw lockError;
}

function readTextFile(filePath, fallback = '') {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        return fs.readFileSync(filePath, 'utf8');
    } catch {
        return fallback;
    }
}

function readJsonFile(filePath, fallbackFactory = () => ({})) {
    const fallback = typeof fallbackFactory === 'function' ? fallbackFactory() : (fallbackFactory || {});
    try {
        if (!fs.existsSync(filePath)) return fallback;
        const raw = fs.readFileSync(filePath, 'utf8');
        if (!raw || !raw.trim()) return fallback;
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function writeJsonFileAtomic(filePath, data, space = 2) {
    const json = JSON.stringify(data, null, space);
    writeTextFileAtomic(filePath, json);
}

function fsyncDirBestEffort(dirPath) {
    let dirFd = null;
    try {
        dirFd = fs.openSync(dirPath, 'r');
        fs.fsyncSync(dirFd);
    } catch (err) {
        // Directory fsync is not supported uniformly across platforms/filesystems
        // (notably EPERM/EINVAL on Windows). Keep atomic rename semantics and
        // treat this as best-effort durability enhancement.
        const code = err && err.code;
        if (code !== 'EPERM' && code !== 'EINVAL' && code !== 'ENOTSUP' && code !== 'EBADF') {
            throw err;
        }
    } finally {
        if (dirFd !== null) {
            try { fs.closeSync(dirFd); } catch {}
        }
    }
}

function writeTextFileAtomic(filePath, text = '') {
    withFileLock(filePath, () => {
        ensureParentDir(filePath);
        const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
        const dirPath = path.dirname(filePath);
        let fd = null;

        try {
            fd = fs.openSync(tmpPath, 'w', 0o600);
            fs.writeFileSync(fd, String(text), 'utf8');
            // Ensure tmp file content is flushed before rename.
            fs.fsyncSync(fd);
            fs.closeSync(fd);
            fd = null;

            // Atomic replace target.
            fs.renameSync(tmpPath, filePath);

            // Best-effort metadata flush (platform dependent).
            fsyncDirBestEffort(dirPath);
        } finally {
            if (fd !== null) {
                try { fs.closeSync(fd); } catch {}
            }
            try {
                if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
            } catch {
                // ignore cleanup errors
            }
        }
    });
}

module.exports = {
    readTextFile,
    readJsonFile,
    writeTextFileAtomic,
    writeJsonFileAtomic,
};
