# 🤝 CONTRIBUTING.md

## 1. How to Contribute

We welcome contributions from the community! Whether you are fixing bugs, improving documentation, or adding new features, please follow these guidelines.

### 1.1 Development Workflow
1.  **Fork** the repository and create your branch from `main`.
2.  Follow the **[Development Guide](./DEVELOPMENT.md)** to set up your local environment.
3.  Implement your changes. Ensure you are using the shared packages (e.g., `packages/security`) for any sensitive logic.
4.  Write **tests** for your features.
5.  Submit a **Pull Request** with a clear description of the problem and your solution.

---

## 2. Coding Standards

- **TypeScript**: We enforce strict type checking. Avoid `any` at all costs.
- **Naming**: 
  - Variables/Functions: `camelCase`
  - Classes/Interfaces: `PascalCase`
  - Files: `kebab-case`
- **Frontend**: Use `shadcn/ui` components for consistency. Avoid custom CSS unless absolutely necessary (use Tailwind).
- **Backend**: Use Fastify hooks for validation and pre-processing.

---

## 3. Pull Request Policy

- **Atomic Commits**: Keep your commits small and focused.
- **Linting**: Ensure `npm run lint` passes before submitting.
- **Review**: All PRs require at least one approval from a core maintainer.

---

## 4. Security Policy

If you find a security vulnerability, **do not open a public issue**. Please email security@deployforge.com or use the private security advisory feature on GitHub.
