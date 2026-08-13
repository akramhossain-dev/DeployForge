import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Contact — Technical Support & System Diagnostics',
    description: 'Get in touch with the DeployForge engineering team for technical support, infrastructure guidance, or self-hosted deployment assistance.',
    openGraph: {
        title: 'Contact — Technical Support & System Diagnostics | DeployForge',
        description: 'Get in touch with the DeployForge engineering team for technical support, infrastructure guidance, or self-hosted deployment assistance.',
        url: 'https://deployforge.dev/contact',
    },
    alternates: {
        canonical: 'https://deployforge.dev/contact',
    },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
