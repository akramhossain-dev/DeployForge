# 💻 DEVELOPMENT.md

## 1. Local Setup

### Prerequisites
- **Node.js**: v20 or higher
- **pnpm**: v8 or higher
- **Docker**: For running local DB/Redis or testing deployments
- **PostgreSQL**: Local instance or Docker container

### Getting Started

1.  **Clone & Install**:
    ```bash
    git clone https://github.com/akramhossain-dev/DeployForge.git
    cd DeployForge
    pnpm install
    ```

2.  **Environment Variables**:
    Copy `.env.example` to `.env` in the root and in `apps/api` and `apps/web`.
    
    Key variables for `apps/api`:
    - `DATABASE_URL`: PostgreSQL connection string.
    - `REDIS_URL`: Redis connection string.
    - `ENCRYPTION_KEY`: A 64-character hex string for AES-256.
    - `JWT_SECRET`: Secret for signing tokens.
    - See `docs/ENVIRONMENT.md` for the complete environment variable reference.

3.  **Database Setup**:
    ```bash
    pnpm prisma migrate dev
    pnpm prisma db seed
    ```

4.  **Run Development Server**:
    ```bash
    pnpm dev
    ```
    - API: `http://localhost:4000`
    - Frontend: `http://localhost:3000`

---

## 2. Working with Monorepo

DeployForge uses **Turborepo** to manage the mono-structure.

- To run only the API: `pnpm --filter api dev`
- To run only the Web: `pnpm --filter web dev`
- To build everything: `pnpm build`

---

## 3. Testing

- **Backend Tests**: Root `pnpm test:api` (Vitest)
- **Frontend Tests**: Root `pnpm test:web` (Cypress/Playwright)
- **Shared Packages**: Run tests within individual package directories.

---

## 4. Troubleshooting

- **Redis Error**: Ensure Redis is running locally (`docker run -p 6379:6379 redis`).
- **Prisma Types**: If types are missing, run `pnpm prisma generate`.
- **SSH Issues**: Ensure you have an active SSH agent if testing local VPS connection.
