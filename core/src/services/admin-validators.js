const MAX_TEXT_LEN = 128;
const MAX_CODE_LEN = 4096;
const ALLOWED_PLATFORMS = new Set(['qq', 'wx']);

function toTrimmedText(input, maxLen = MAX_TEXT_LEN) {
    const text = String(input || '').trim();
    if (!text) return '';
    return text.slice(0, maxLen);
}

function sanitizeAccountPayload(input, options = {}) {
    const body = (input && typeof input === 'object') ? input : {};
    const isUpdate = !!options.isUpdate;
    const output = {};

    if (isUpdate) {
        const id = toTrimmedText(body.id, 64);
        if (!id) {
            const err = new Error('id 不能为空');
            err.code = 'INVALID_ID';
            throw err;
        }
        output.id = id;
    }

    const name = toTrimmedText(body.name, 64);
    if (name) output.name = name;

    const code = toTrimmedText(body.code, MAX_CODE_LEN);
    if (code) output.code = code;

    const platform = toTrimmedText(body.platform, 8).toLowerCase();
    if (platform && ALLOWED_PLATFORMS.has(platform)) {
        output.platform = platform;
    }

    const gid = toTrimmedText(body.gid, 32);
    if (gid) output.gid = gid;

    const openId = toTrimmedText(body.openId, 128);
    if (openId) output.openId = openId;

    const uin = toTrimmedText(body.uin, 32);
    if (uin) output.uin = uin;

    const qq = toTrimmedText(body.qq, 32);
    if (qq) output.qq = qq;

    const avatar = toTrimmedText(body.avatar || body.avatarUrl, 512);
    if (avatar) {
        output.avatar = avatar;
        output.avatarUrl = avatar;
    }

    return output;
}

function parseImportGids(input, options = {}) {
    const maxImport = Math.max(1, Number(options.maxImport) || 500);
    let source = [];
    if (typeof input === 'string') {
        source = input.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean);
    } else if (Array.isArray(input)) {
        source = input;
    }

    const dedup = new Set();
    const valid = [];
    for (const item of source) {
        const gid = Number(item);
        if (!Number.isFinite(gid) || gid <= 0) continue;
        if (dedup.has(gid)) continue;
        dedup.add(gid);
        valid.push(gid);
        if (valid.length >= maxImport) break;
    }
    return {
        gids: valid,
        truncated: source.length > valid.length,
    };
}

module.exports = {
    sanitizeAccountPayload,
    parseImportGids,
};
