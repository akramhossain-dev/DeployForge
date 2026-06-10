import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
    id: string;
    email?: string | null;
    name?: string;
    avatarUrl?: string;
    githubId?: string | null;
    githubUsername?: string | null;
    githubAvatar?: string | null;
    provider?: string;
    isVerified?: boolean;
    role?: string;
    status?: string;
}

interface AuthState {
    user: User | null;
    token: string | null;
    refreshToken: string | null;
    isAuthenticated: boolean;
    hasHydrated: boolean;
    setUser: (user: User | null) => void;
    setSession: (session: { user: User; accessToken: string; refreshToken?: string | null }) => void;
    setToken: (token: string | null, refreshToken?: string | null) => void;
    setHasHydrated: (value: boolean) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            token: null,
            refreshToken: null,
            isAuthenticated: false,
            hasHydrated: false,
            setUser: (user) => set({ user, isAuthenticated: !!user }),
            setSession: ({ user, accessToken, refreshToken }) => {
                if (typeof window !== 'undefined') {
                    localStorage.setItem('df_token', accessToken);
                    if (refreshToken) localStorage.setItem('df_refresh_token', refreshToken);
                }
                set({ user, token: accessToken, refreshToken: refreshToken || null, isAuthenticated: true });
            },
            setToken: (token, refreshToken = null) => {
                if (typeof window !== 'undefined') {
                    if (token) localStorage.setItem('df_token', token);
                    else localStorage.removeItem('df_token');
                    if (refreshToken) localStorage.setItem('df_refresh_token', refreshToken);
                    else if (refreshToken === null) localStorage.removeItem('df_refresh_token');
                }
                set((state) => ({ token, refreshToken, isAuthenticated: !!token && !!state.user }));
            },
            setHasHydrated: (value) => set({ hasHydrated: value }),
            logout: () => {
                if (typeof window !== 'undefined') {
                    localStorage.removeItem('df_token');
                    localStorage.removeItem('df_refresh_token');
                }
                set({ user: null, token: null, refreshToken: null, isAuthenticated: false });
            },
        }),
        {
            name: 'df-auth-storage',
            partialize: (state) => ({
                user: state.user,
                token: state.token,
                refreshToken: state.refreshToken,
                isAuthenticated: state.isAuthenticated,
            }),
            onRehydrateStorage: () => (state) => {
                state?.setHasHydrated(true);
                if (typeof window !== 'undefined' && state?.token) {
                    localStorage.setItem('df_token', state.token);
                }
            },
        }
    )
);
