import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Terms of Service — Platform Usage & Licensing Terms',
    description: 'DeployForge Terms of Service outlining acceptable use policies, open-source software licensing, user responsibilities, and system operation terms.',
    openGraph: {
        title: 'Terms of Service — Platform Usage & Licensing Terms | DeployForge',
        description: 'DeployForge Terms of Service outlining acceptable use policies, open-source software licensing, user responsibilities, and system operation terms.',
        url: 'https://deployforge.dev/terms',
    },
    alternates: {
        canonical: 'https://deployforge.dev/terms',
    },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
