import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Sign In — DeployForge Control Panel',
    description: 'Sign in to your self-hosted DeployForge account to manage applications, VPS nodes, and deployment pipelines.',
    robots: {
        index: false,
        follow: true,
    },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
