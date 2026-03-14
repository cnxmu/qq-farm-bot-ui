function shouldRefuseDefaultAdminPassword(options = {}) {
    const {
        nodeEnv = '',
        hasPasswordHash = false,
        adminPassword = '',
    } = options;

    const isProduction = String(nodeEnv || '').toLowerCase() === 'production';
    const usingDefaultPassword = String(adminPassword || '') === 'admin';
    return isProduction && !hasPasswordHash && usingDefaultPassword;
}


function shouldRefuseUnsafeTrustProxy(options = {}) {
    const {
        nodeEnv = '',
        trustProxy = '',
    } = options;

    const isProduction = String(nodeEnv || '').toLowerCase() === 'production';
    const value = String(trustProxy || '').trim().toLowerCase();
    // express trust proxy=true trusts all upstream proxies and allows spoofed client ip.
    return isProduction && value === 'true';
}

function shouldRefuseWeakJwtSecret(options = {}) {
    const {
        nodeEnv = '',
        adminJwtSecret = '',
    } = options;

    const isProduction = String(nodeEnv || '').toLowerCase() === 'production';
    const secret = String(adminJwtSecret || '').trim();
    return isProduction && secret.length < 16;
}

module.exports = {
    shouldRefuseDefaultAdminPassword,
    shouldRefuseWeakJwtSecret,
    shouldRefuseUnsafeTrustProxy,
};
