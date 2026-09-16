# Security audit migration

This branch migrates transaction rejection from the legacy walletService callables to the hardened `rejectTransaction` callable exposed by `secureIndexV2.js`.

The legacy walletService source is intentionally retained until a complete source-level removal can be performed without reconstructing unrelated wallet functionality.
