import { ReactNode } from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export default function PublicLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen min-h-[100dvh] bg-black text-white flex flex-col">
            <Header />
            <div className="flex-1">{children}</div>
            <Footer />
        </div>
    );
}
