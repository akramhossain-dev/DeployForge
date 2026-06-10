'use client';

import { useEffect } from 'react';
import { GlobalErrorView } from '@/components/system/SystemFallbacks';
import './globals.css';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[app:global-error]', error);
    }, [error]);

    return (
        <html lang="en" className="dark">
            <body className="bg-slate-950 text-slate-50 antialiased">
                <GlobalErrorView reset={reset} />
            </body>
        </html>
    );
}
