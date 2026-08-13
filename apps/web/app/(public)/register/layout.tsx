import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Create Account — DeployForge Platform',
    description: 'Register for DeployForge to deploy and orchestrate web applications on your self-hosted servers.',
    robots: {
        index: false,
        follow: true,
    },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
