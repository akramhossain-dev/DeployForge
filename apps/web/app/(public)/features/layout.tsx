import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Features — Self-Hosted Application Deployment & Monitoring',
    description: 'Explore DeployForge features: agentless SSH server setup, automated GitHub webhooks, isolated Docker builds, zero-config Nginx proxying, and real-time log monitoring.',
    openGraph: {
        title: 'Features — Self-Hosted Application Deployment & Monitoring | DeployForge',
        description: 'Explore DeployForge features: agentless SSH server setup, automated GitHub webhooks, isolated Docker builds, zero-config Nginx proxying, and real-time log monitoring.',
        url: 'https://deployforge.dev/features',
    },
    alternates: {
        canonical: 'https://deployforge.dev/features',
    },
};

export default function FeaturesLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
