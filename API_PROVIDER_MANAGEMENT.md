# API Provider Management

Added a Superadmin-only **API Management** option under **Superadmin Features → Service APIs**.

Supported service slots:
- Recharge
- Internet
- Bus
- Train
- Flight
- Mobile Banking
- Remittance

Each provider can store a name, base URL, authentication mode, credentials, active state, priority, timeout, and notes. Provider records are server-managed through callable Cloud Functions; the client Firestore rules deny direct reads/writes to `api_providers` so credentials are not exposed through normal client queries.

## Important
This adds the provider-management/configuration layer. It does **not** claim that a provider's live business API is integrated automatically. Each real provider still needs its API documentation/schema (authentication, endpoints, request fields, response/status mapping, webhooks where applicable) before it can be wired into the corresponding transaction flow.

For Recharge/Internet and Mobile Banking/Remittance, the existing MySheba wallet/order flow remains unchanged until a concrete provider is connected. Bus/Train/Flight currently retain their existing app flows until a ticketing provider is connected.


## Secret storage

Provider API keys and passwords are stored in Google Cloud Secret Manager, not in Firestore. Firestore stores only non-sensitive provider configuration and Secret Manager secret names.

### Deployment IAM

The Cloud Functions runtime service account must have `roles/secretmanager.secretAccessor` on the project (or the individual provider secrets). The one-time `migrateApiProviderSecrets` callable also requires permission to create secrets and add secret versions. Grant `roles/secretmanager.admin` temporarily to the runtime service account for migration, run the migration once, then remove the admin role and retain only `roles/secretmanager.secretAccessor`.

### Migration order

1. Deploy the functions containing the Secret Manager implementation.
2. Grant temporary Secret Manager Admin plus runtime access.
3. Call `migrateApiProviderSecrets` once as a superadmin.
4. Verify the returned migrated count and confirm `apiKey`/`password` fields are absent from `api_providers`.
5. Remove temporary Secret Manager Admin; keep Secret Manager Secret Accessor.
6. Only then enable live provider integrations.

Never put provider API keys, passwords, client secrets, private keys, or access tokens into Firestore, mobile app configuration, Expo public environment variables, or the admin web bundle.
