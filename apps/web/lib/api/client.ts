import { useAuthStore } from '@/lib/store/useAuthStore';
import { useAdminAuthStore } from '@/lib/store/useAdminAuthStore';
import { webConfig } from '@/lib/config/env';

export type ApiErrorShape = {
    success: false;
    message: string;
    context?: string;
    errorCode?: string;
};

export class ApiError extends Error {
    status: number;
    context?: string;
    errorCode?: string;

    constructor(message: string, status: number, context?: string, errorCode?: string) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.context = context;
        this.errorCode = errorCode;
    }
}

export type ApiResponse<T> = {
    success?: boolean;
    data?: T;
    message?: string;
} & T;

const API_URL = webConfig.apiUrl;
const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
let csrfToken: string | null = null;

function handleUnauthorized(path: string) {
    if (typeof window === 'undefined') return;

    if (path.startsWith('/admin')) {
        useAdminAuthStore.getState().logoutAdmin();
        if (!window.location.pathname.startsWith('/admin/login')) {
            window.location.assign('/admin/login');
        }
        return;
    }

    useAuthStore.getState().logout();
    if (window.location.pathname !== '/') {
        window.location.assign('/');
    }
}

async function parseResponse(response: Response) {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        return response.text();
    }
    return response.json();
}

function readCookie(name: string) {
    if (typeof document === 'undefined') return null;
    return document.cookie
        .split(';')
        .map((cookie) => cookie.trim())
        .find((cookie) => cookie.startsWith(`${name}=`))
        ?.slice(name.length + 1) || null;
}

async function ensureCsrfToken(force = false) {
    if (typeof window === 'undefined') return null;
    if (!force) {
        csrfToken = csrfToken || readCookie('csrfToken');
        if (csrfToken) return csrfToken;
    } else {
        csrfToken = null;
    }

    const response = await fetch(`${API_URL}/auth/csrf`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
    });
    const payload = await parseResponse(response).catch(() => null);
    if (!response.ok) return null;

    csrfToken = payload?.data?.csrfToken || readCookie('csrfToken');
    return csrfToken;
}

function apiErrorCode(payload: any) {
    return payload?.error?.code || payload?.errorCode || null;
}

async function request<T>(path: string, init: RequestInit = {}, hasRetried = false): Promise<T> {
    const headers = new Headers(init.headers);
    const method = (init.method || 'GET').toUpperCase();
    const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;

    if (!headers.has('Content-Type') && init.body && !isFormData) {
        headers.set('Content-Type', 'application/json');
    }

    if (unsafeMethods.has(method)) {
        const token = await ensureCsrfToken();
        if (token) headers.set('X-CSRF-Token', token);
    }

    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        console.debug('[api:request]', { method, path });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
        response = await fetch(`${API_URL}${path}`, {
            ...init,
            headers,
            cache: 'no-store',
            credentials: 'include',
            signal: controller.signal,
        });
    } catch (error: any) {
        if (error.name === 'AbortError') {
            throw new ApiError('Request timed out. Please try again.', 0, undefined, 'TIMEOUT');
        }
        throw new ApiError('Network connection error. Please check your internet connection.', 0, undefined, 'NETWORK_ERROR');
    } finally {
        clearTimeout(timeoutId);
    }

    const payload = await parseResponse(response).catch(() => null);

    if (!response.ok) {
        const canRefresh = response.status === 401
            && !hasRetried
            && !path.startsWith('/auth/login')
            && !path.startsWith('/auth/refresh')
            && !path.startsWith('/auth/logout')
            && !path.startsWith('/admin');

        if (canRefresh) {
            await request('/auth/refresh', { method: 'POST' }, true);
            return request<T>(path, init, true);
        }

        if (response.status === 403 && apiErrorCode(payload) === 'CSRF_TOKEN_INVALID' && !hasRetried) {
            csrfToken = null;
            if (typeof document !== 'undefined') {
                document.cookie = 'csrfToken=; Path=/; Max-Age=0; SameSite=Lax';
            }
            await ensureCsrfToken(true);
            return request<T>(path, init, true);
        }

        const apiError: ApiErrorShape = {
            success: false,
            message: payload?.error?.message || payload?.message || 'Something went wrong. Please try again.',
            context: payload?.context,
            errorCode: payload?.error?.code || payload?.errorCode,
        };

        if (response.status === 500 && (!payload || !payload.error?.message)) {
            apiError.message = 'Internal Server Error';
        }

        if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
            console.error('[api:error]', { method, path, status: response.status, message: apiError.message, context: apiError.context });
        }

        if (response.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/admin/login')) {
            handleUnauthorized(path);
        }

        throw new ApiError(apiError.message, response.status, apiError.context, apiError.errorCode);
    }

    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        console.debug('[api:response]', { method, path, status: response.status });
    }

    if (payload && typeof payload === 'object' && 'data' in payload) {
        return payload.data as T;
    }

    return payload as T;
}

export const api = {
    baseUrl: API_URL,
    get: <T>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: 'GET' }),
    post: <T>(path: string, body?: unknown, init?: RequestInit) =>
        request<T>(path, { ...init, method: 'POST', body: typeof FormData !== 'undefined' && body instanceof FormData ? body : body ? JSON.stringify(body) : undefined }),
    put: <T>(path: string, body?: unknown, init?: RequestInit) =>
        request<T>(path, { ...init, method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
    patch: <T>(path: string, body?: unknown, init?: RequestInit) =>
        request<T>(path, { ...init, method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
    delete: <T>(path: string, body?: unknown, init?: RequestInit) =>
        request<T>(path, { ...init, method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
};

export default api;
