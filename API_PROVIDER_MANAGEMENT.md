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


## Credential security

Provider API keys, API secrets, and Basic-auth passwords are stored in **Google Cloud Secret Manager**, not as plaintext values in the `api_providers` Firestore documents.

The Firestore document keeps only secret-name references such as `apiKeySecretName`, `secretKeySecretName`, and `passwordSecretName`. Provider execution reads the secrets server-side; admin/mobile clients receive only presence flags and never receive the credential values.

### Existing providers

After deploying the Functions changes, a superadmin can run the one-time `migrateApiProviderSecrets` callable. It copies existing plaintext provider credentials into Secret Manager and removes the plaintext credential fields from Firestore.

### IAM requirement

The Firebase Functions runtime service account must have Secret Manager access before running the migration. Because MySheba creates and rotates provider-specific secrets dynamically, the runtime needs permission to create secrets, add versions, read versions, and delete unused secrets. Prefer granting the narrowest Secret Manager scope available for your deployment. At minimum, secret payload reads use `roles/secretmanager.secretAccessor`; secret version creation uses `roles/secretmanager.secretVersionAdder`; creating/deleting secret resources requires Secret Manager administration permissions. See Google Cloud's current Secret Manager IAM documentation before granting project-level roles.

Provider-management callables now require Firebase App Check in addition to Superadmin authorization. The native client must therefore have App Check/Play Integrity configured before these actions are used in production.
