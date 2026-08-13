import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://deployforge.dev';

    const publicRoutes = [
        '',
        '/features',
        '/about',
        '/docs',
        '/contact',
        '/privacy-policy',
        '/terms',
    ];

    return publicRoutes.map((route) => ({
        url: `${baseUrl}${route}`,
        lastModified: new Date(),
        changeFrequency: route === '' ? 'daily' : 'weekly',
        priority: route === '' ? 1.0 : route === '/features' || route === '/docs' ? 0.8 : 0.5,
    }));
}
