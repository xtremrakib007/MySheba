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

// Hooks. The real plugin now, not the stub that used to stand in for it.
//
// The stub existed so that the `// eslint-disable-next-line
// react-hooks/exhaustive-deps` comments this codebase already carried would not
// each be reported as an error for naming an undefined rule. It did that by
// declaring BOTH hook rules as no-ops - including rules-of-hooks, which is not
// a style opinion at all. It is the check for a guaranteed crash.
//
// It cost one: a useAppSync() call was added to Sidebar below its
// `if (!sidebarVisible) return null`, so the hook ran only when the drawer was
// open. React counts hooks per render, closed-then-open is "more hooks than the
// previous render", and the whole app went to the error screen the first time
// anybody opened the sidebar. Lint passed, every audit passed, and it threw
// only on the device - exactly the shape this config exists to catch.
//
// exhaustive-deps stays off. It judges dependency arrays, which is the style
// pass this config deliberately is not, and the existing disable comments stay
// harmless because the rule is defined.
import reactHooks from 'eslint-plugin-react-hooks';

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
    plugins: { 'react-hooks': reactHooks },
    linterOptions: { reportUnusedDisableDirectives: false },
    rules: { 'no-undef': 'error', 'react-hooks/rules-of-hooks': 'error' },
  },
  {
    // Cloud Functions and build scripts are CommonJS under Node.
    files: ['functions/**/*.js', 'scripts/**/*.js', '*.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
];
