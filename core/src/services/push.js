/**
 * 推送接口封装（基于 pushoo / 自定义 JSON）
 */

const axios = require('axios');
const dns = require('node:dns').promises;
const net = require('node:net');
const https = require('node:https');
const pushoo = require('pushoo').default;

function isPrivateIp(ip) {
    if (!ip) return true;
    const v4 = net.isIP(ip) === 4;
    const v6 = net.isIP(ip) === 6;
    if (!v4 && !v6) return true;
    const lower = String(ip).toLowerCase();
    if (v6) {
        if (lower === '::1') return true;
        if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
        if (lower.startsWith('fe80:')) return true;
        if (lower.startsWith('::ffff:')) {
            const tail = lower.replace('::ffff:', '');
            return isPrivateIp(tail);
        }
        return false;
    }
    const [a, b] = lower.split('.').map(n => Number(n));
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
}

function assertRequiredText(name, value) {
    const text = String(value || '').trim();
    if (!text) {
        throw new Error(`${name} 不能为空`);
    }
    return text;
}

async function resolveValidatedAddresses(hostname) {
    let addresses = [];
    try {
        addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    } catch {
        throw new Error('endpoint 域名解析失败');
    }
    if (!Array.isArray(addresses) || addresses.length === 0) {
        throw new Error('endpoint 域名解析为空');
    }
    const hasPrivate = addresses.some(item => isPrivateIp(item && item.address));
    if (hasPrivate) {
        throw new Error('禁止访问内网/本地地址');
    }
    return addresses;
}

function buildPinnedHttpsAgent(hostname, addresses) {
    const candidate = addresses.find(item => net.isIP(item && item.address)) || addresses[0];
    const pinnedAddress = String(candidate && candidate.address ? candidate.address : '');
    const pinnedFamily = Number(candidate && candidate.family ? candidate.family : 4);
    if (!pinnedAddress || !net.isIP(pinnedAddress)) {
        throw new Error('endpoint 域名解析失败');
    }

    const lookup = (lookupHost, _options, callback) => {
        if (String(lookupHost || '').trim().toLowerCase() !== String(hostname || '').trim().toLowerCase()) {
            return callback(new Error('hostname mismatch during pinned lookup'));
        }
        callback(null, pinnedAddress, pinnedFamily);
    };

    return new https.Agent({
        keepAlive: false,
        lookup,
        servername: hostname,
    });
}

async function assertSafeOutboundEndpoint(endpoint, options = {}) {
    const value = assertRequiredText('endpoint', endpoint);
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error('endpoint 非法');
    }

    const protocol = String(parsed.protocol || '').toLowerCase();
    if (protocol !== 'https:') {
        throw new Error('仅允许 https 推送地址');
    }

    const hostname = String(parsed.hostname || '').trim();
    if (!hostname) throw new Error('endpoint 缺少主机名');

    const allowPrivate = !!options.allowPrivateNetwork;
    let addresses = [];
    if (!allowPrivate) {
        if (net.isIP(hostname) && isPrivateIp(hostname)) {
            throw new Error('禁止访问内网/本地地址');
        }
        addresses = await resolveValidatedAddresses(hostname);
    }

    if (options.withResolved === true) {
        return {
            url: parsed.toString(),
            parsed,
            addresses,
        };
    }

    return parsed.toString();
}

async function postPinnedHttps(endpoint, body, headers = {}) {
    const prepared = await assertSafeOutboundEndpoint(endpoint, { withResolved: true });
    const httpsAgent = buildPinnedHttpsAgent(prepared.parsed.hostname, prepared.addresses);
    try {
        const response = await axios.post(prepared.url, body, {
            headers,
            httpsAgent,
            maxRedirects: 0,
            timeout: 15000,
            validateStatus: () => true,
        });
        return response;
    } finally {
        try { httpsAgent.destroy(); } catch {}
    }
}

/**
 * 发送推送
 */
async function sendPushooMessage(payload = {}) {
    const channelRaw = String(payload.channel || '').trim().toLowerCase();
    if (channelRaw === 'custom_request') {
        return await _sendCustomJsonMessage(payload);
    }
    if (channelRaw === 'webhook') {
        return await _sendWebhookMessage(payload);
    }

    const channel = assertRequiredText('channel', payload.channel);
    const rawToken = String(payload.token || '').trim();
    const token = assertRequiredText('token', rawToken);
    const title = assertRequiredText('title', payload.title);
    const content = assertRequiredText('content', payload.content);

    const request = { title, content, token };
    const result = await pushoo(channel, request);

    const raw = (result && typeof result === 'object') ? result : { data: result };
    const hasError = !!(raw && raw.error);
    const code = String(raw.code || raw.errcode || (hasError ? 'error' : 'ok'));
    const message = String(raw.msg || raw.message || (hasError ? (raw.error.message || 'push failed') : 'ok'));
    const ok = !hasError && (code === 'ok' || code === '0' || code === '' || String(raw.status || '').toLowerCase() === 'success');

    return {
        ok,
        code,
        msg: message,
        raw,
    };
}

async function _sendWebhookMessage(payload) {
    try {
        const endpoint = assertRequiredText('endpoint', payload.endpoint);
        const title = assertRequiredText('title', payload.title);
        const content = assertRequiredText('content', payload.content);
        const token = String(payload.token || '').trim();

        const body = { title, content };
        if (token) body.token = token;

        const response = await postPinnedHttps(endpoint, body, {
            'content-type': 'application/json',
        });

        if (response.status >= 200 && response.status < 300) {
            return { ok: true, code: 'ok', msg: 'success', raw: response.data };
        }
        return {
            ok: false,
            code: `HTTP_${response.status}`,
            msg: `Webhook 推送失败: HTTP ${response.status}`,
            raw: response.data,
        };
    } catch (e) {
        return {
            ok: false,
            code: e.code || 'error',
            msg: `Webhook 推送失败: ${e.message}`,
            raw: e,
        };
    }
}

/**
 * 递归替换对象中的占位符
 */
function _recursiveReplace(obj, title, content) {
    if (typeof obj === 'string') {
        return obj.replace(/\{\{title\}\}/g, title).replace(/\{\{content\}\}/g, content);
    }
    if (Array.isArray(obj)) {
        return obj.map(item => _recursiveReplace(item, title, content));
    }
    if (obj !== null && typeof obj === 'object') {
        const newObj = {};
        for (const key in obj) {
            newObj[key] = _recursiveReplace(obj[key], title, content);
        }
        return newObj;
    }
    return obj;
}

/**
 * 发送自定义 JSON 推送
 */
async function _sendCustomJsonMessage(payload) {
    try {
        const endpoint = assertRequiredText('endpoint', payload.endpoint);
        const title = payload.title || '';
        const content = payload.content || '';

        const headers = JSON.parse(payload.custom_headers || '{}');
        if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
            return {
                ok: false,
                code: 'invalid_headers',
                msg: '自定义 JSON 推送失败: Headers 必须是一个 JSON 对象',
            };
        }

        const bodyTemplate = JSON.parse(payload.custom_body || '{}');
        const body = _recursiveReplace(bodyTemplate, title, content);

        const response = await postPinnedHttps(endpoint, body, headers);

        if (response.status >= 200 && response.status < 300) {
            return { ok: true, code: 'ok', msg: 'success', raw: response.data };
        }
        return {
            ok: false,
            code: `HTTP_${response.status}`,
            msg: `自定义 JSON 推送失败: HTTP ${response.status}`,
            raw: response.data,
        };
    } catch (e) {
        return {
            ok: false,
            code: e.code || 'error',
            msg: `自定义 JSON 推送失败: ${e.message}`,
            raw: e,
        };
    }
}

module.exports = {
    sendPushooMessage,
    assertSafeOutboundEndpoint,
};
