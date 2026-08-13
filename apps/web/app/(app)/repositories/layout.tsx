import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Repositories',
    robots: {
        index: false,
        follow: false,
    },
};

export default function RepositoriesLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
