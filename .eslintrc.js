module.exports = {
  env: {
    node: true,
    es2021: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:node/recommended',
    'plugin:security/recommended',
    'prettier', // Must be last to override other configs
  ],
  plugins: ['node', 'security'],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
  },
  rules: {
    // Error Prevention
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-var': 'error',
    'prefer-const': 'error',

    // Security Best Practices
    'security/detect-object-injection': 'warn',
    'security/detect-non-literal-regexp': 'warn',
    'security/detect-unsafe-regex': 'error',
    'security/detect-buffer-noassert': 'error',
    'security/detect-child-process': 'warn',
    'security/detect-disable-mustache-escape': 'error',
    'security/detect-eval-with-expression': 'error',
    'security/detect-no-csrf-before-method-override': 'error',
    'security/detect-non-literal-fs-filename': 'warn',
    'security/detect-non-literal-require': 'warn',
    'security/detect-possible-timing-attacks': 'warn',
    'security/detect-pseudoRandomBytes': 'error',

    // Code Quality
    'complexity': ['warn', 15], // Maximum cyclomatic complexity
    'max-depth': ['warn', 4],
    'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
    'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true, skipComments: true }],
    'max-nested-callbacks': ['warn', 3],
    'max-params': ['warn', 5],

    // Node.js Specific
    'node/no-unpublished-require': 'off', // Allow dev dependencies in tests
    'node/no-missing-require': 'error',
    'node/no-extraneous-require': 'error',
    'node/no-deprecated-api': 'error',
    'node/exports-style': ['error', 'module.exports'],
    'node/file-extension-in-import': 'off',
    'node/prefer-global/buffer': ['error', 'always'],
    'node/prefer-global/console': ['error', 'always'],
    'node/prefer-global/process': ['error', 'always'],
    'node/prefer-promises/dns': 'error',
    'node/prefer-promises/fs': 'error',

    // Best Practices
    'eqeqeq': ['error', 'always', { null: 'ignore' }],
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-param-reassign': ['warn', { props: false }],
    'no-return-await': 'error',
    'require-await': 'warn',
    'no-throw-literal': 'error',
    'prefer-promise-reject-errors': 'error',

    // ES6+
    'arrow-body-style': ['warn', 'as-needed'],
    'no-duplicate-imports': 'error',
    'prefer-arrow-callback': 'warn',
    'prefer-destructuring': ['warn', { object: true, array: false }],
    'prefer-template': 'warn',
  },
  overrides: [
    {
      // Test files can be more lenient
      files: ['**/*.test.js', '**/*.spec.js', 'tests/**/*.js'],
      env: {
        jest: true,
      },
      rules: {
        'no-console': 'off',
        'max-lines-per-function': 'off',
        'max-nested-callbacks': 'off',
        'node/no-unpublished-require': 'off',
      },
    },
    {
      // Scripts can use console and have fewer restrictions
      files: ['scripts/**/*.js'],
      rules: {
        'no-console': 'off',
        'security/detect-child-process': 'off',
        'node/shebang': 'off',
      },
    },
  ],
  ignorePatterns: [
    'node_modules/',
    'coverage/',
    'dist/',
    'build/',
    '*.min.js',
    'public/js/**/*.js', // Client-side JS has different rules
  ],
};
