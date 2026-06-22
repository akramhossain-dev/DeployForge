import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // 1. Admin routes - protect all /admin/* pages except login
    if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
        const adminToken = request.cookies.get('adminAccessToken')?.value;
        if (!adminToken) {
            return NextResponse.redirect(new URL('/admin/login', request.url));
        }
    }

    // 2. Admin login page - redirect to admin dashboard if already logged in
    if (pathname === '/admin/login') {
        const adminToken = request.cookies.get('adminAccessToken')?.value;
        if (adminToken) {
            return NextResponse.redirect(new URL('/admin', request.url));
        }
    }

    // 3. User protected routes - protect all dashboard/vps/monitoring etc.
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
        if (!token && !refreshToken) {
            return NextResponse.redirect(new URL('/login', request.url));
        }
    }

    // 4. User auth pages (login, register, forgot-password, reset-password) - redirect to dashboard if logged in
    const authPages = ['/login', '/register', '/forgot-password', '/reset-password'];
    if (authPages.includes(pathname)) {
        const token = request.cookies.get('accessToken')?.value;
        const refreshToken = request.cookies.get('refreshToken')?.value;
        if (token || refreshToken) {
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
