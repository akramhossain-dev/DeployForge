export type ApiErrorCode =
    | 'BAD_REQUEST'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'RATE_LIMITED'
    | 'RATE_LIMIT_EXCEEDED'
    | 'CSRF_TOKEN_INVALID'
    | 'VALIDATION_ERROR'
    | 'INTERNAL_ERROR';

export type ApiErrorPayload = {
    code: ApiErrorCode | string;
    message: string;
    stage?: string;
};

export type ApiSuccessResponse<T> = {
    success: true;
    data: T;
};

export type ApiErrorResponse = {
    success: false;
    error: ApiErrorPayload;
};

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export type PaginationMeta = {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
};

export type PaginatedData<T> = {
    items: T[];
    pagination: PaginationMeta;
};

export type PaginationInput = {
    page?: unknown;
    limit?: unknown;
};

export type PaginationDefaults = {
    page: number;
    limit: number;
    maxLimit: number;
};

export const DEFAULT_PAGINATION: PaginationDefaults = {
    page: 1,
    limit: 20,
    maxLimit: 100,
};

export function createApiSuccess<T>(data: T): ApiSuccessResponse<T> {
    return {
        success: true,
        data,
    };
}

export function createApiMessage(message: string): ApiSuccessResponse<{ message: string }> {
    return createApiSuccess({ message });
}

export function createApiError(code: ApiErrorCode | string, message: string, stage?: string): ApiErrorResponse {
    return {
        success: false,
        error: {
            code,
            message,
            ...(stage ? { stage } : {}),
        },
    };
}

export function parsePagination(input: PaginationInput, defaults = DEFAULT_PAGINATION) {
    const page = Math.max(1, Number(input.page) || defaults.page);
    const limit = Math.max(1, Math.min(defaults.maxLimit, Number(input.limit) || defaults.limit));
    return {
        page,
        limit,
        skip: (page - 1) * limit,
    };
}

export function paginationMeta(total: number, page: number, limit: number): PaginationMeta {
    return {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
    };
}
