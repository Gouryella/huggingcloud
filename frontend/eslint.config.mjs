import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // Existing codebase relies on these patterns; keep lint actionable
      // without forcing a broad React Compiler refactor in this change set.
      'react-hooks/error-boundaries': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
    },
  },
  {
    ignores: ['.next/**', 'node_modules/**'],
  },
];

export default config;
