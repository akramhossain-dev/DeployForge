import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'About — Open-Source VPS Orchestration & Infrastructure',
    description: 'Learn about DeployForge, an open-source, self-hosted deployment platform designed for developers seeking complete infrastructure ownership without PaaS lock-in.',
    openGraph: {
        title: 'About — Open-Source VPS Orchestration & Infrastructure | DeployForge',
        description: 'Learn about DeployForge, an open-source, self-hosted deployment platform designed for developers seeking complete infrastructure ownership without PaaS lock-in.',
        url: 'https://deployforge.dev/about',
    },
    alternates: {
        canonical: 'https://deployforge.dev/about',
    },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
