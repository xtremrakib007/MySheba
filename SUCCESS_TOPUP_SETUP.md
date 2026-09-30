# Success TopUp integration

MySheba uses the existing server-side API provider and transaction pipeline for Success TopUp. Do not add provider credentials to the mobile app.

## Bangladesh recharge provider

In Superadmin -> API Management -> Recharge, create/enable:

- Name: `Success TopUp`
- Base URL: `https://api.successtopup.com`
- HTTP method: `POST`
- Endpoint path: `/api/recharge`
- Authentication: `none`
- API Key: Success TopUp API key
- Secret Key: Success TopUp API secret
- Request Template:

```json
{
  "number": "{{phone}}",
  "type": "prepaid",
  "operator": "{{operator}}",
  "amount": "{{amount}}",
  "trxid": "{{requestId}}",
  "successtopup_key": "{{apiKey}}",
  "successtopup_secret": "{{secretKey}}"
}
```

Success TopUp documents these Bangladesh operator codes:

- GP = Grameenphone
- RB = Robi
- AT = Airtel
- BL = Banglalink
- TT = Teletalk
- SK = Skitto
- BT = Brilliant
- RY = Ryze

Minimum recharge amount documented by Success TopUp is BDT 9.

## Webhook

Create a webhook for the Success TopUp provider:

- Header: `x-webhook-token`
- Token: the token configured in the Success TopUp dashboard
- Transaction ID path: `transactionId`
- Status path: `status`
- Message path: `comment`
- Success status: `Success`
- Processing status: `Processing`
- Cancel status: `Cancel`

Webhook URL:

`https://us-central1-satulink-solutions.cloudfunctions.net/apiWebhook?providerId=<PROVIDER_ID>`

The webhook is server-side only. A Success callback completes the transaction; Processing keeps the wallet charge pending; Cancel refunds the exact wallet charge once.

## Status safety net

`pollSuccessTopUpStatus` runs every five minutes. It checks processing transactions for the configured Success TopUp provider through `/api/status` and applies Success/Processing/Cancel idempotently.

## India and Nepal

Success TopUp's public site advertises international recharge for India and Nepal, but its public mobile-recharge API documentation currently documents the Bangladesh `/api/recharge` schema and Bangladesh operator codes. Do not send India/Nepal numbers through the Bangladesh operator mapping.

India/Nepal should be enabled only after Success TopUp provides the international API endpoint, request schema, operator identifiers, and currency/amount rules for the API account.

## Security

The API key and secret are stored server-side in `api_providers` and are never returned by the provider-list callable. Never put either credential in React Native code, Expo config, Firestore client-writable data, or a public repository.
