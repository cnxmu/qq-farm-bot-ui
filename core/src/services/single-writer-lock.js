const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');

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

function readLock(lockFile) {
    try {
        const raw = fs.readFileSync(lockFile, 'utf8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function acquireSingleWriterLease({
    dataDir,
    lockName = '.writer.lock',
    strict = true,
} = {}) {
    const dir = String(dataDir || '').trim();
    if (!dir) {
        throw new Error('dataDir is required for single-writer lease');
    }
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const lockFile = path.join(dir, lockName);

    const createLease = () => {
        const fd = fs.openSync(lockFile, 'wx', 0o600);
        const payload = {
            pid: process.pid,
            startedAt: Date.now(),
            nodeEnv: process.env.NODE_ENV || '',
        };
        fs.writeFileSync(fd, JSON.stringify(payload), 'utf8');
        fs.fsyncSync(fd);
        return fd;
    };

    let fd = null;
    try {
        fd = createLease();
    } catch (err) {
        if (!(err && err.code === 'EEXIST')) throw err;

        const existing = readLock(lockFile) || {};
        const existingPid = Number(existing.pid || 0);
        if (!isProcessAlive(existingPid)) {
            try { fs.unlinkSync(lockFile); } catch {}
            fd = createLease();
        } else {
            const msg = `single-writer lease already held (pid=${existingPid})`;
            if (strict) {
                const lockError = new Error(msg);
                lockError.code = 'SINGLE_WRITER_LOCKED';
                throw lockError;
            }
            return {
                ok: false,
                reason: msg,
                release: () => {},
            };
        }
    }

    const release = () => {
        if (fd === null) return;
        try { fs.closeSync(fd); } catch {}
        fd = null;
        try { fs.unlinkSync(lockFile); } catch {}
    };

    return {
        ok: true,
        lockFile,
        release,
    };
}

module.exports = {
    acquireSingleWriterLease,
};
