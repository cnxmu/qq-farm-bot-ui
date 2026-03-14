const crypto = require('node:crypto');

function base64UrlEncode(input) {
    return Buffer.from(input)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function base64UrlDecode(input) {
    const normalized = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
    const padLength = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + '='.repeat(padLength);
    return Buffer.from(padded, 'base64').toString('utf8');
}

function timingSafeEqualText(a, b) {
    const ab = Buffer.from(String(a || ''));
    const bb = Buffer.from(String(b || ''));
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
}

function buildSigningSecret(input) {
    const text = String(input || '').trim();
    if (text.length >= 16) return text;
    return crypto.createHash('sha256').update(`fallback-jwt-secret:${text || 'default'}`).digest('hex');
}

function signJwt(payload, secret) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const h = base64UrlEncode(JSON.stringify(header));
    const p = base64UrlEncode(JSON.stringify(payload));
    const body = `${h}.${p}`;
    const sig = crypto.createHmac('sha256', secret).update(body).digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
    return `${body}.${sig}`;
}

function verifyJwt(token, secret) {
    const raw = String(token || '').trim();
    if (!raw) return { ok: false, error: 'missing_token' };
    const parts = raw.split('.');
    if (parts.length !== 3) return { ok: false, error: 'malformed_token' };
    const [h, p, s] = parts;

    let header;
    try {
        header = JSON.parse(base64UrlDecode(h));
    } catch {
        return { ok: false, error: 'invalid_header' };
    }
    if (!header || header.alg !== 'HS256' || header.typ !== 'JWT') {
        return { ok: false, error: 'invalid_header' };
    }

    const body = `${h}.${p}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(body).digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
    if (!timingSafeEqualText(expectedSig, s)) {
        return { ok: false, error: 'invalid_signature' };
    }

    let payload;
    try {
        payload = JSON.parse(base64UrlDecode(p));
    } catch {
        return { ok: false, error: 'invalid_payload' };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const exp = Number(payload.exp || 0);
    if (!Number.isFinite(exp) || exp <= nowSec) {
        return { ok: false, error: 'token_expired' };
    }

    return { ok: true, payload };
}

function issueAdminToken({ secret, ip = '', ttlSec = 24 * 60 * 60 }) {
    const nowSec = Math.floor(Date.now() / 1000);
    const safeTtl = Math.max(60, Number(ttlSec) || 24 * 60 * 60);
    const jti = crypto.randomBytes(16).toString('hex');
    const payload = {
        sub: 'admin',
        role: 'admin',
        ip: String(ip || ''),
        iat: nowSec,
        exp: nowSec + safeTtl,
        jti,
    };
    const token = signJwt(payload, secret);
    return { token, payload };
}

module.exports = {
    buildSigningSecret,
    issueAdminToken,
    verifyJwt,
};
