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
