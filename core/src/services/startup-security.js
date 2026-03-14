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
};
