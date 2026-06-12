'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { ToastContainer } from '@/components/system/ToastContainer';
import { ErrorDrawer } from '@/components/system/ErrorDrawer';

export function Providers({ children }: { children: ReactNode }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 15_000,
                        refetchOnWindowFocus: false,
                        retry: (failureCount, error: any) => error?.status !== 401 && failureCount < 2,
                    },
                },
            })
    );

    return (
        <QueryClientProvider client={queryClient}>
            {children}
            <ToastContainer />
            <ErrorDrawer />
        </QueryClientProvider>
    );
}
