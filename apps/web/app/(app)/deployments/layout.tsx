import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Deployments Console',
    robots: {
        index: false,
        follow: false,
    },
};

export default function DeploymentsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
