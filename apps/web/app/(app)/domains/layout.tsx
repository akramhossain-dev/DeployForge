import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Domain Management',
    robots: {
        index: false,
        follow: false,
    },
};

export default function DomainsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
