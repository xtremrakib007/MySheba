# IIMMPACT Webhooks

Firebase project: `satulink-solutions`
Region: `us-central1`

## Endpoints added by this change

- Catalog changes: `https://us-central1-satulink-solutions.cloudfunctions.net/iimmpactCatalogChangeWebhook`
- Balance notifications: `https://us-central1-satulink-solutions.cloudfunctions.net/iimmpactBalanceWebhook`

These URLs become usable only after the pull request is merged and the functions are deployed.

## Secrets

- Catalog changes: `mysheba-iimmpact-webhook-secret-catalog`
- Balance: `mysheba-webhook-secret-balance`

The values must be the corresponding signing secrets supplied/configured for the matching webhook in IIMMPACT. Never put secret values in source control or chat.

## Catalog-change events

The catalog handler accepts POST JSON events for all twelve event names:

- `product.created`, `product.updated`, `product.deleted`
- `option.created`, `option.updated`, `option.deleted`
- `category.created`, `category.updated`, `category.deleted`
- `group.created`, `group.updated`, `group.deleted`

It checks `X-Webhook-Signature` as `sha256=<hex HMAC-SHA256(raw request body)>`, verifies the exact raw request bytes, validates the event/resource pairing, sanitizes sensitive-looking fields, and writes a deduplicated event to `iimmpactCatalogChangeEvents`. A successful first delivery or duplicate returns 200. A temporary Firestore failure returns 503 so the provider can retry.

The handler records catalog change notifications; it does not write directly into a separate MySheba catalog collection. The app's IIMMPACT product catalog remains provider-backed, and follow-up work may connect these stored events to cache invalidation/re-fetch if required.

## Balance notifications

The balance handler is intentionally non-financial: it verifies an HMAC signature using `X-Webhook-Signature`, records only common operational fields in `iimmpactBalanceWebhookEvents`, deduplicates retries, and never credits/debits customer wallets or mutates provider configuration.

**Before registering the Balance URL**, confirm with IIMMPACT that Balance webhook deliveries use the same `X-Webhook-Signature: sha256=<hex>` HMAC-SHA256 raw-body format and confirm their payload schema. The supplied information so far does not document those two details. If their Balance webhook contract differs, adapt the handler before enabling it.

## Deployment and smoke test

From Termux after merging this PR:

```sh
cd ~/mysheba-sdk53-fix
git fetch origin
git checkout main
git pull --ff-only origin main
npm run audit:functions
npm run deploy:functions iimmpactCatalogChangeWebhook iimmpactBalanceWebhook -- --project satulink-solutions
```

The deploy command above assumes the repository's existing `deploy:functions` script accepts multiple function names; if it rejects multiple names, deploy each function separately:

```sh
npm run deploy:functions iimmpactCatalogChangeWebhook -- --project satulink-solutions
npm run deploy:functions iimmpactBalanceWebhook -- --project satulink-solutions
```

After deploy, register the Catalog Change URL in the Catalog Webhook screen. Register Balance only after confirming its signature/payload contract. Test a valid signed event, an invalid signature (401), an unsupported catalog event (400), and a repeated delivery (200 with `duplicate: true`). Do not test by sending fake events to production unless IIMMPACT provides a test mode.
