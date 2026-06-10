'use client';

import { useEffect } from 'react';
import { GlobalErrorView } from '@/components/system/SystemFallbacks';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[app:error-boundary]', error);
    }, [error]);

    return <GlobalErrorView reset={reset} />;
}
