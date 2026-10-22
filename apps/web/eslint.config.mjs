import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';
import unusedImports from 'eslint-plugin-unused-imports';

export default defineConfig([
  ...nextVitals,
  {
    files: ['**/*.{ts,tsx}'],
    // These React Compiler rules require broad state-model refactors. The
    // compiler is not enabled; retain the established effect-driven behavior
    // while the Next 16 runtime migration is validated independently.
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'unused-imports': unusedImports,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'unused-imports/no-unused-imports': 'error',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
    },
  },
  globalIgnores(['.next/**', 'node_modules/**', 'next-env.d.ts']),
]);
