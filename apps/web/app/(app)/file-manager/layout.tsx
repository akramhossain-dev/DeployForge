import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'File Manager',
    robots: {
        index: false,
        follow: false,
    },
};

export default function FileManagerLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
