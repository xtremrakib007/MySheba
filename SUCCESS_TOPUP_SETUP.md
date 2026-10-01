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

All eight codes below are mapped server-side in `SUCCESS_TOPUP_OPERATORS`
(`functions/apiProviderService.js`). An operator the map cannot resolve now
fails before the provider is called: it used to be forwarded as its display
name, so an Airtel, Teletalk or Skitto recharge was charged to the wallet and
then rejected by Success TopUp.

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

## Internet and Entertainment packages

Both are the same transaction to Success TopUp. There is no separate package or
entertainment endpoint: a bundle is listed with `/api/drives` and bought by
POSTing `/api/recharge` with that package's `package_id` at its exact catalogue
price. The two services differ only in which catalogue they read:

| Service | `/api/drives` `type` |
| --- | --- |
| Internet | `regular` |
| Entertainment | `drive` |

Server-side they share one code path (`SUCCESS_TOPUP_PACKAGE_SERVICES` in
`functions/apiProviderService.js`), and a package order with no `packageId` is
rejected rather than silently sent as a plain top-up of the package price.

If Success TopUp's `drive` catalogue has no entries for an operator, the
Entertainment picker shows "No entertainment packages are available" rather than
an empty screen. Nothing needs changing here if they later add entertainment
SKUs to that catalogue - they appear automatically.

## Companion providers

Superadmin configures ONE provider: `Success TopUp` / `Recharge`. Saving it
provisions three companions from the same credentials, because
`executeConfiguredApi` selects a provider by service:

| Document ID | Service | Endpoint |
| --- | --- | --- |
| `success-topup-internet` | Internet | `/api/recharge` + `package_id` |
| `success-topup-entertainment` | Entertainment | `/api/recharge` + `package_id` |
| `success-topup-bill-payment` | Bill Payment | `/api/bill-pay` |

They are hidden from `listApiProviders` and must not be edited by hand -
re-saving the Recharge provider overwrites them. Saving it also switches
Recharge, Internet, Entertainment and Bill Payment to `api` mode.

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
