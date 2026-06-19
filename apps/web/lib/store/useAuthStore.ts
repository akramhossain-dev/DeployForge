import { create } from 'zustand';

interface User {
    id: string;
    email?: string | null;
    name?: string;
    avatarUrl?: string;
    githubId?: string | null;
    githubUsername?: string | null;
    githubAvatar?: string | null;
    googleId?: string | null;
    googleEmail?: string | null;
    googleAvatar?: string | null;
    provider?: string;
    authProvider?: string;
    connectedProviders?: {
        google: boolean;
        github: boolean;
        local: boolean;
    };
    isVerified?: boolean;
    role?: string;
    status?: string;
}

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    hasHydrated: boolean;
    setUser: (user: User | null) => void;
    setSession: (session: { user: User }) => void;
    setHasHydrated: (value: boolean) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
    user: null,
    isAuthenticated: false,
    hasHydrated: true,
    setUser: (user) => set({ user, isAuthenticated: !!user }),
    setSession: ({ user }) => set({ user, isAuthenticated: true }),
    setHasHydrated: (value) => set({ hasHydrated: value }),
    logout: () => set({ user: null, isAuthenticated: false }),
}));
