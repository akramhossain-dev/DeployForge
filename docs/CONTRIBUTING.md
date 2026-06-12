# 🤝 CONTRIBUTING.md

Follow these instructions if you want to contribute features, bug fixes, or documentation modifications to DeployForge.

---

## 1. How to Contribute

### 1.1 Development Workflow
1.  **Fork** the repository and create your branch from `main`.
2.  Follow the **[Development Guide](./DEVELOPMENT.md)** to set up your environment.
3.  Implement your changes using the shared workspace packages (`packages/security` or `packages/vps`) for any encryption or SSH operations.
4.  Ensure all code passes strict TypeScript checks.
5.  Submit a **Pull Request** explaining the context, problem description, and how your changes resolve the issue.

---

## 2. Coding Standards

*   **TypeScript:** Strict type checking is active. Do not bypass type definitions.
*   **Package Manager:** Always use `pnpm` to install packages and add dependencies. Do not commit `package-lock.json` or `yarn.lock` files.
*   **Frontend UI:** Build components using Tailwind CSS and shadcn/ui. Ensure styling is clean, responsive, and conforms to the dashboard's design system.
*   **Backend API:** Structure new logic inside `apps/api/src/services/` where appropriate, using Fastify routes, schemas, and guards to handle requests.

---

## 3. Pull Request Guidelines

*   **Lint checks:** Run `pnpm lint` and make sure it passes.
*   **Commits:** Group commits in focused, atomic logical blocks.
*   **Approval:** All PR submissions must receive approval from a core repository maintainer.
