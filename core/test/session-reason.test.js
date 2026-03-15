const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyKickoutReason, isReloginRequiredReason } = require('../src/services/session-reason');

test('isReloginRequiredReason identifies inactivity relogin text', () => {
    assert.equal(isReloginRequiredReason('由于长时间未操作，您已经断开链接，请重新登录。'), true);
    assert.equal(isReloginRequiredReason('会话过期，请重新登录'), true);
    assert.equal(isReloginRequiredReason('网络波动'), false);
});

test('classifyKickoutReason returns actionable hints for relogin-required cases', () => {
    const info = classifyKickoutReason('由于长时间未操作，您已经断开链接，请重新登录。');
    assert.equal(info.category, 'session_expired');
    assert.equal(info.reloginRequired, true);
    assert.equal(info.actionHint.includes('更新登录 code'), true);
});
