import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AdminIdentity = {
    id: string;
    email: string;
    role: 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR' | string;
    lastLoginAt?: string | null;
};

interface AdminAuthState {
    admin: AdminIdentity | null;
    adminToken: string | null;
    isAdminAuthenticated: boolean;
    hasHydrated: boolean;
    setAdminSession: (session: { admin: AdminIdentity; adminAccessToken: string }) => void;
    setAdmin: (admin: AdminIdentity | null) => void;
    setHasHydrated: (value: boolean) => void;
    logoutAdmin: () => void;
}

export const useAdminAuthStore = create<AdminAuthState>()(
    persist(
        (set) => ({
            admin: null,
            adminToken: null,
            isAdminAuthenticated: false,
            hasHydrated: false,
            setAdminSession: ({ admin, adminAccessToken }) => {
                if (typeof window !== 'undefined') {
                    localStorage.setItem('df_admin_token', adminAccessToken);
                }
                set({ admin, adminToken: adminAccessToken, isAdminAuthenticated: true });
            },
            setAdmin: (admin) => set((state) => ({ admin, isAdminAuthenticated: Boolean(admin && state.adminToken) })),
            setHasHydrated: (value) => set({ hasHydrated: value }),
            logoutAdmin: () => {
                if (typeof window !== 'undefined') localStorage.removeItem('df_admin_token');
                set({ admin: null, adminToken: null, isAdminAuthenticated: false });
            },
        }),
        {
            name: 'df-admin-auth-storage',
            partialize: (state) => ({
                admin: state.admin,
                adminToken: state.adminToken,
                isAdminAuthenticated: state.isAdminAuthenticated,
            }),
            onRehydrateStorage: () => (state) => {
                state?.setHasHydrated(true);
                if (typeof window !== 'undefined' && state?.adminToken) {
                    localStorage.setItem('df_admin_token', state.adminToken);
                }
            },
        }
    )
);
