function normalizeReasonText(input) {
    return String(input || '').trim();
}

function isReloginRequiredReason(input) {
    const reason = normalizeReasonText(input).toLowerCase();
    if (!reason) return false;
    return reason.includes('请重新登录')
        || reason.includes('重新登录')
        || reason.includes('断开链接')
        || reason.includes('登录失效')
        || reason.includes('会话过期')
        || reason.includes('长时间未操作');
}

function classifyKickoutReason(input) {
    const reason = normalizeReasonText(input);
    const reloginRequired = isReloginRequiredReason(reason);
    if (reloginRequired) {
        return {
            reason,
            category: 'session_expired',
            reloginRequired: true,
            actionHint: '需要更新登录 code 后重新登录',
        };
    }

    return {
        reason,
        category: 'kickout',
        reloginRequired: false,
        actionHint: '',
    };
}

module.exports = {
    normalizeReasonText,
    isReloginRequiredReason,
    classifyKickoutReason,
};
