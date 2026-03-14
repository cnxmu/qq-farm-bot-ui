function registerQrRoutes({ app, store, MiniProgramLoginSession, handleApiError, sendApiError, ApiError }) {
    // ============ QR Code Login APIs ============
    app.post('/api/qr/create', async (req, res) => {
        try {
            const qrLogin = store.getQrLoginConfig ? store.getQrLoginConfig() : { apiDomain: 'q.qq.com' };
            const result = await MiniProgramLoginSession.requestLoginCode({ apiDomain: qrLogin.apiDomain });
            res.json({ ok: true, data: result });
        } catch (e) {
            return handleApiError(res, e);
        }
    });

    app.post('/api/qr/check', async (req, res) => {
        const { code } = req.body || {};
        if (!code) {
            return sendApiError(res, new ApiError('Missing code', 400, 'MISSING_CODE'));
        }

        try {
            const qrLogin = store.getQrLoginConfig ? store.getQrLoginConfig() : { apiDomain: 'q.qq.com' };
            const result = await MiniProgramLoginSession.queryStatus(code, { apiDomain: qrLogin.apiDomain });

            if (result.status === 'OK') {
                const ticket = result.ticket;
                const uin = result.uin || '';
                const nickname = result.nickname || '';
                const appid = '1112386029';

                const authCode = await MiniProgramLoginSession.getAuthCode(ticket, appid, { apiDomain: qrLogin.apiDomain });

                let avatar = '';
                if (uin) {
                    avatar = `https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=640`;
                }

                res.json({ ok: true, data: { status: 'OK', code: authCode, uin, avatar, nickname } });
            } else if (result.status === 'Used') {
                res.json({ ok: true, data: { status: 'Used' } });
            } else if (result.status === 'Wait') {
                res.json({ ok: true, data: { status: 'Wait' } });
            } else {
                res.json({ ok: true, data: { status: 'Error', error: result.msg } });
            }
        } catch (e) {
            return handleApiError(res, e);
        }
    });
}

module.exports = {
    registerQrRoutes,
};
