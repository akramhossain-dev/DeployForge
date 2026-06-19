import { create } from 'zustand';

export type AdminIdentity = {
    id: string;
    email: string;
    role: 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR' | string;
    lastLoginAt?: string | null;
};

interface AdminAuthState {
    admin: AdminIdentity | null;
    isAdminAuthenticated: boolean;
    hasHydrated: boolean;
    setAdminSession: (session: { admin: AdminIdentity }) => void;
    setAdmin: (admin: AdminIdentity | null) => void;
    setHasHydrated: (value: boolean) => void;
    logoutAdmin: () => void;
}

export const useAdminAuthStore = create<AdminAuthState>()((set) => ({
    admin: null,
    isAdminAuthenticated: false,
    hasHydrated: true,
    setAdminSession: ({ admin }) => set({ admin, isAdminAuthenticated: true }),
    setAdmin: (admin) => set({ admin, isAdminAuthenticated: Boolean(admin) }),
    setHasHydrated: (value) => set({ hasHydrated: value }),
    logoutAdmin: () => set({ admin: null, isAdminAuthenticated: false }),
}));
