# 🤝 Contributing to DeployForge

Thank you for your interest in contributing to DeployForge! This guide outlines the workflow, coding standards, and guidelines for contributing to our self-hosted deployment platform.

---

## 1. How to Contribute

### 1.1 Development Workflow
1. **Fork the Repository:** Create a personal fork of the repository and clone it to your local machine.
2. **Create a Feature Branch:** Branch off from the `main` branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Environment Setup:** Follow the instructions in [SETUP.md](docs/SETUP.md) to initialize your database, cache, and launch local development services.
4. **Develop and Implement:** 
   - Write your code following the monorepo architecture.
   - Utilize existing shared workspace packages (`packages/security` for crypto/hashing, `packages/vps` for SSH) to ensure system uniformity.
5. **Code Style & Verification:** Ensure that all types are correct and linting passes without warnings.
6. **Submit a Pull Request:** Open a Pull Request targeting the `main` branch of the upstream repository. Include a clear description of the problem, the proposed solution, and details of any tests run.

---

## 2. Coding Standards

### 2.1 TypeScript & Type Safety
* **Strict Type Safety:** Avoid using type assertions like `as any` or declaring variables/parameters as `any`. If custom Fastify attributes are added, make sure to augment the module declarations.
* **Shared Types:** Share API input/output structures between the Next.js frontend (`apps/web`) and Fastify backend (`apps/api`) by adding them to `@deployforge/shared`.

### 2.2 Monorepo Packages
Ensure proper separation of concerns by putting core business logic in the correct package:
* `packages/security` — Crytographic operations, AES-256-GCM encryption, Argon2id hashing, and tokens.
* `packages/vps` — SSH connection pools, remote execution scripts, and SFTP transfers.
* `packages/database` — Prisma schema, client singleton, and database helper methods.
* `packages/mail` — Mail transporter, templating engine, and delivery validation.
* `packages/shared` — Interfaces, API schemas, error representations, and common validators.

### 2.3 Package Management
* Always use `pnpm` to manage dependencies:
  ```bash
  pnpm install
  pnpm add <package-name> --filter <workspace-name>
  ```
* Do **not** commit `package-lock.json` or `yarn.lock` files to the repository.

---

## 3. Pull Request Guidelines

* **Lint and Build Check:** Run a full type check and build validation before submitting your code:
  ```bash
  pnpm build
  ```
* **Commit Messages:** Keep commit messages clear, descriptive, and structured (e.g., `feat(api): add session revocation on password reset`).
* **Code Review:** All pull requests must receive approval from at least one core maintainer. Avoid merging incomplete features or disabled test placeholders.
