import { useAuthStore } from '@/lib/store/useAuthStore';
import { useAdminAuthStore } from '@/lib/store/useAdminAuthStore';

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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function getToken(path: string) {
    if (typeof window === 'undefined') return null;
    if (path.startsWith('/admin') && path !== '/admin/login') {
        return useAdminAuthStore.getState().adminToken || localStorage.getItem('df_admin_token');
    }
    return useAuthStore.getState().token || localStorage.getItem('df_token');
}

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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = getToken(path);
    const headers = new Headers(init.headers);
    const method = init.method || 'GET';

    if (!headers.has('Content-Type') && init.body) {
        headers.set('Content-Type', 'application/json');
    }
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    if (typeof window !== 'undefined') {
        console.debug('[api:request]', { method, path, authenticated: Boolean(token) });
    }

    const response = await fetch(`${API_URL}${path}`, {
        ...init,
        headers,
        cache: 'no-store',
    });

    const payload = await parseResponse(response).catch(() => null);

    if (!response.ok) {
        const apiError: ApiErrorShape = {
            success: false,
            message: payload?.message || 'Something went wrong. Please try again.',
            context: payload?.context,
            errorCode: payload?.errorCode,
        };

        if (typeof window !== 'undefined') {
            console.error('[api:error]', { method, path, status: response.status, message: apiError.message, context: apiError.context });
        }

        if (response.status === 401) handleUnauthorized(path);

        throw new ApiError(apiError.message, response.status, apiError.context, apiError.errorCode);
    }

    if (typeof window !== 'undefined') {
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
        request<T>(path, { ...init, method: 'POST', body: body ? JSON.stringify(body) : undefined }),
    patch: <T>(path: string, body?: unknown, init?: RequestInit) =>
        request<T>(path, { ...init, method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
    delete: <T>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: 'DELETE' }),
};

export default api;
