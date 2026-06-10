import { useAuthStore } from '@/lib/store/useAuthStore';

export type ApiErrorShape = {
    success: false;
    message: string;
    context?: string;
};

export class ApiError extends Error {
    status: number;
    context?: string;

    constructor(message: string, status: number, context?: string) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.context = context;
    }
}

export type ApiResponse<T> = {
    success?: boolean;
    data?: T;
    message?: string;
} & T;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function getToken() {
    if (typeof window === 'undefined') return null;
    return useAuthStore.getState().token || localStorage.getItem('df_token');
}

async function parseResponse(response: Response) {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        return response.text();
    }
    return response.json();
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = getToken();
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
        };

        if (typeof window !== 'undefined') {
            console.error('[api:error]', { method, path, status: response.status, message: apiError.message, context: apiError.context });
        }

        if (response.status === 401 && typeof window !== 'undefined') {
            useAuthStore.getState().logout();
        }

        throw new ApiError(apiError.message, response.status, apiError.context);
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
    delete: <T>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: 'DELETE' }),
};

export default api;
