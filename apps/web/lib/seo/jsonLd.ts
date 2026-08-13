/**
 * Reusable JSON-LD Structured Data Schema Generators for DeployForge
 */

export function getOrganizationSchema() {
    return {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'DeployForge',
        url: 'https://deployforge.dev',
        logo: 'https://deployforge.dev/icon.svg',
        description: 'Production-grade self-hosted deployment platform automating application builds, VPS deployments, and container monitoring.',
        sameAs: [
            'https://github.com/akramhossain-dev/DeployForge',
        ],
    };
}

export function getWebSiteSchema() {
    return {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'DeployForge',
        url: 'https://deployforge.dev',
        description: 'Self-hosted application deployment and VPS orchestration platform.',
        publisher: {
            '@type': 'Organization',
            name: 'DeployForge',
        },
    };
}

export function getSoftwareApplicationSchema() {
    return {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'DeployForge',
        operatingSystem: 'Linux, POSIX, Docker',
        applicationCategory: 'DeveloperApplication',
        offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'USD',
        },
        description: 'Self-hosted PaaS platform for automated Git builds, agentless VPS orchestration, zero-config Nginx proxying, and container monitoring.',
    };
}

export function getBreadcrumbSchema(items: { name: string; item: string }[]) {
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map((it, idx) => ({
            '@type': 'ListItem',
            position: idx + 1,
            name: it.name,
            item: it.item,
        })),
    };
}
