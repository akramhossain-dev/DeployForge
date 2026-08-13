import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';

export const metadata: Metadata = {
    title: {
        default: 'Admin Portal',
        template: '%s | Admin Portal',
    },
    robots: {
        index: false,
        follow: false,
    },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
    return <AdminShell>{children}</AdminShell>;
}
