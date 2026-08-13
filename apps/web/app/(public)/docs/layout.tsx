import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Documentation — Architecture, Webhooks & VPS Deployment Guide',
    description: 'Technical documentation for DeployForge. Learn how to connect VPS nodes over SSH, configure GitHub deployment webhooks, manage environment variables, and audit container logs.',
    openGraph: {
        title: 'Documentation — Architecture, Webhooks & VPS Deployment Guide | DeployForge',
        description: 'Technical documentation for DeployForge. Learn how to connect VPS nodes over SSH, configure GitHub deployment webhooks, manage environment variables, and audit container logs.',
        url: 'https://deployforge.dev/docs',
    },
    alternates: {
        canonical: 'https://deployforge.dev/docs',
    },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
