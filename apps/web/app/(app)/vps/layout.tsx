import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'VPS Instances',
    robots: {
        index: false,
        follow: false,
    },
};

export default function VpsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
