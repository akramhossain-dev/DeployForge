export const APP_NAME = 'DeployForge';
export const DEFAULT_PORT_RANGE = { start: 3000, end: 4000 };
export const SUPPORTED_FRAMEWORKS = ['NEXTJS', 'NODEJS', 'DJANGO', 'LARAVEL', 'REACT', 'VITE'] as const;
export const DEPLOYMENT_STATUSES = ['PENDING', 'BUILDING', 'DEPLOYING', 'CLONING', 'UPLOADING', 'EXTRACTING', 'RUNNING', 'PAUSED', 'SUCCESS', 'FAILED', 'STOPPED', 'DELETING', 'ROLLED_BACK', 'DELETED'] as const;
export const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR'] as const;
export const USER_ROLES = [...ADMIN_ROLES, 'USER'] as const;
