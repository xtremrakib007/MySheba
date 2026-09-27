// One rule: no-undef.
//
// Four crashes in this app have been the same shape - an identifier used
// that is not in scope. The file parses, esbuild bundles it, every audit
// here passes, and it throws only when a person opens that screen:
//
//   viewingSection      AdminHomeScreen, from a deleted destructure line
//   gridManagement      AdminHomeScreen, missed when that line was restored
//   useRef              LoginScreen, used without being imported
//   DateTimePicker      ui.js, from a package that was never a dependency
//
// no-undef is the check that catches all four. The config is deliberately
// narrow - this is not a style pass, and turning on a full preset would
// bury a real crash under hundreds of formatting opinions.
import globals from 'globals';

// The codebase carries `// eslint-disable-next-line react-hooks/exhaustive-deps`
// comments from before there was any lint setup. Without the rule defined,
// each of those is itself reported as an error and buries the real ones, so
// the rule is declared as a no-op. This config does not judge dependency
// arrays - it only looks for identifiers that do not exist.
const reactHooksStub = {
  rules: { 'exhaustive-deps': { create: () => ({}) }, 'rules-of-hooks': { create: () => ({}) } },
};

export default [
  {
    files: ['**/*.js'],
    ignores: ['node_modules/**', 'patches/**', 'functions/node_modules/**'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,   // fetch, console, setTimeout, URL...
        ...globals.es2021,
        __DEV__: 'readonly',  // React Native
        global: 'readonly',
        process: 'readonly',
        require: 'readonly',
        module: 'writable',
        exports: 'writable',
        __dirname: 'readonly',
      },
    },
    plugins: { 'react-hooks': reactHooksStub },
    linterOptions: { reportUnusedDisableDirectives: false },
    rules: { 'no-undef': 'error' },
  },
  {
    // Cloud Functions and build scripts are CommonJS under Node.
    files: ['functions/**/*.js', 'scripts/**/*.js', '*.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
];
