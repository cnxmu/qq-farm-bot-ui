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

module.exports = {
    shouldRefuseDefaultAdminPassword,
};
