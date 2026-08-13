import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Privacy Policy — Data Handling & Security Specifications',
    description: 'DeployForge Privacy Policy detailing data handling practices, encrypted credential storage, GitHub OAuth integration, and system audit log retention.',
    openGraph: {
        title: 'Privacy Policy — Data Handling & Security Specifications | DeployForge',
        description: 'DeployForge Privacy Policy detailing data handling practices, encrypted credential storage, GitHub OAuth integration, and system audit log retention.',
        url: 'https://deployforge.dev/privacy-policy',
    },
    alternates: {
        canonical: 'https://deployforge.dev/privacy-policy',
    },
};

export default function PrivacyPolicyLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
