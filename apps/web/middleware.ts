import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * M-2: Decodes a JWT payload without verifying the signature.
 * We cannot verify the signature in Edge middleware (no access to the secret),
 * but we CAN check the `exp` claim to catch obviously expired tokens and
 * clear stale cookies rather than letting users sit on dead sessions.
 * The API enforces full cryptographic verification on every request.
 */
function isTokenExpired(token: string): boolean {
    try {
        const [, payloadB64] = token.split('.');
        const payload = JSON.parse(
            Buffer.from(payloadB64, 'base64url').toString('utf8'),
        );
        return typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000);
    } catch {
        // Malformed token — treat as expired
        return true;
    }
}

function clearAuthCookies(response: NextResponse): NextResponse {
    response.cookies.delete('accessToken');
    response.cookies.delete('refreshToken');
    return response;
}

function clearAdminCookies(response: NextResponse): NextResponse {
    response.cookies.delete('adminAccessToken');
    return response;
}

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // 1. Admin routes - protect all /admin/* pages except login
    if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
        const adminToken = request.cookies.get('adminAccessToken')?.value;
        if (!adminToken || isTokenExpired(adminToken)) {
            const redirect = NextResponse.redirect(new URL('/admin/login', request.url));
            // Clear expired token cookie so it doesn't loop
            if (adminToken) clearAdminCookies(redirect);
            return redirect;
        }
    }

    // 2. Admin login page - redirect to admin dashboard if already logged in
    if (pathname === '/admin/login') {
        const adminToken = request.cookies.get('adminAccessToken')?.value;
        if (adminToken && !isTokenExpired(adminToken)) {
            return NextResponse.redirect(new URL('/admin', request.url));
        }
    }

    // 3. User protected routes
    const userProtectedPaths = [
        '/dashboard',
        '/deployments',
        '/repositories',
        '/vps',
        '/terminal',
        '/monitoring',
        '/settings',
    ];
    const isUserProtected = userProtectedPaths.some(p => pathname.startsWith(p));
    if (isUserProtected) {
        const token = request.cookies.get('accessToken')?.value;
        const refreshToken = request.cookies.get('refreshToken')?.value;

        const accessValid = token && !isTokenExpired(token);
        const hasRefresh = Boolean(refreshToken);

        if (!accessValid && !hasRefresh) {
            const redirect = NextResponse.redirect(new URL('/login', request.url));
            if (token) clearAuthCookies(redirect); // clear expired access token
            return redirect;
        }
    }

    // 4. Auth pages - redirect to dashboard if already logged in
    const authPages = ['/login', '/register', '/forgot-password', '/reset-password'];
    if (authPages.includes(pathname)) {
        const token = request.cookies.get('accessToken')?.value;
        const refreshToken = request.cookies.get('refreshToken')?.value;
        if ((token && !isTokenExpired(token)) || refreshToken) {
            return NextResponse.redirect(new URL('/dashboard', request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
};
