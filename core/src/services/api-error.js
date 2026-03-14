class ApiError extends Error {
    constructor(message, status = 400, code = 'BAD_REQUEST', details = null) {
        super(message || 'Bad Request');
        this.name = 'ApiError';
        this.status = Number(status) || 400;
        this.code = String(code || 'BAD_REQUEST');
        this.details = details && typeof details === 'object' ? details : null;
    }
}

function toApiError(input, fallbackMessage = '服务器内部错误') {
    if (input instanceof ApiError) return input;

    if (input && typeof input === 'object') {
        const status = Number(input.status);
        const code = String(input.code || '').trim();
        const message = (input && input.message) ? input.message : fallbackMessage;
        if (Number.isInteger(status) && status >= 400 && status < 600 && code) {
            return new ApiError(message, status, code, input.details || null);
        }
        if (code === 'CONFIG_WRITE_CONFLICT') {
            return new ApiError(message, 409, code, input.details || null);
        }
    }

    const message = (input && input.message) ? input.message : fallbackMessage;
    return new ApiError(message, 500, 'INTERNAL_ERROR');
}

function sendApiError(res, input, fallbackMessage = '服务器内部错误') {
    const err = toApiError(input, fallbackMessage);
    const payload = {
        ok: false,
        message: err.message,
        code: err.code,
    };
    if (err.details) payload.details = err.details;
    return res.status(err.status).json(payload);
}

module.exports = {
    ApiError,
    toApiError,
    sendApiError,
};
