import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://deployforge.dev';

    return {
        rules: [
            {
                userAgent: '*',
                allow: ['/', '/features', '/about', '/docs', '/contact', '/privacy-policy', '/terms'],
                disallow: [
                    '/dashboard/',
                    '/deployments/',
                    '/settings/',
                    '/vps/',
                    '/domains/',
                    '/file-manager/',
                    '/repositories/',
                    '/terminal/',
                    '/team/',
                    '/notifications/',
                    '/profile/',
                    '/admin/',
                    '/login',
                    '/register',
                    '/forgot-password',
                    '/reset-password',
                    '/verify-email',
                    '/api/',
                ],
            },
        ],
        sitemap: `${baseUrl}/sitemap.xml`,
    };
}
