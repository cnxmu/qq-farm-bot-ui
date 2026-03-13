class ApiError extends Error {
    constructor(message, status = 400, code = 'BAD_REQUEST') {
        super(message || 'Bad Request');
        this.name = 'ApiError';
        this.status = Number(status) || 400;
        this.code = String(code || 'BAD_REQUEST');
    }
}

function toApiError(input, fallbackMessage = '服务器内部错误') {
    if (input instanceof ApiError) return input;
    const message = (input && input.message) ? input.message : fallbackMessage;
    return new ApiError(message, 500, 'INTERNAL_ERROR');
}

function sendApiError(res, input, fallbackMessage = '服务器内部错误') {
    const err = toApiError(input, fallbackMessage);
    return res.status(err.status).json({
        ok: false,
        error: err.message,
        code: err.code,
    });
}

module.exports = {
    ApiError,
    toApiError,
    sendApiError,
};
