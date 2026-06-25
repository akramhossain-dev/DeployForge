import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function isTokenExpired(token: string): boolean {
    try {
        const [, payloadB64] = token.split('.');
        const payload = JSON.parse(
            Buffer.from(payloadB64, 'base64url').toString('utf8'),
        );
        return typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000);
    } catch {
        
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

    if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
        const adminToken = request.cookies.get('adminAccessToken')?.value;
        if (!adminToken || isTokenExpired(adminToken)) {
            const redirect = NextResponse.redirect(new URL('/admin/login', request.url));
            
            if (adminToken) clearAdminCookies(redirect);
            return redirect;
        }
    }

    if (pathname === '/admin/login') {
        const adminToken = request.cookies.get('adminAccessToken')?.value;
        if (adminToken && !isTokenExpired(adminToken)) {
            return NextResponse.redirect(new URL('/admin', request.url));
        }
    }

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
            if (token) clearAuthCookies(redirect); 
            return redirect;
        }
    }

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
        
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
};
