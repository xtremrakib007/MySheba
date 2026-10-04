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

## What is actually in the catalogue

From the supplied `BD_Mobile_Operator_Packages.xlsx` (239 regular packs + 211
drive packs, captured from the Success TopUp app):

| Category | Regular | Drive |
| --- | --- | --- |
| Bundle (data + minutes) | 56 | 103 |
| Data | 83 | 52 |
| Voice | 76 | 52 |
| Call Rate | 24 | 4 |

Operator coverage, against the six the app offers in `src/data/countries.js`:

| Operator | Regular | Drive |
| --- | --- | --- |
| Grameenphone | 63 | 55 |
| Robi | 58 | 77 |
| Airtel | 60 | 58 |
| Banglalink | 38 | 21 |
| Teletalk | 20 | **none** |
| Skitto | **none** | **none** |

Two consequences the app now handles rather than showing a blank step: Skitto
has no packages in either catalogue, and Teletalk has no drive packs.

**There is no entertainment product.** A keyword sweep of all 450 package
descriptions for Toffee, Bioscope, Hoichoi, Chorki, YouTube, TV, streaming,
music and game matched nothing. Every drive pack carries a commission, 0-12% of
price and averaging 4.9% - so "Drive Recharge" is a parallel, higher-margin
catalogue of the SAME minutes-and-data packs, not content. Anything that offers
drive packs as "Entertainment" is mislabelling them.

`src/utils/packageCategory.js` routes packages by the category the provider
returns: Data and Bundle to Internet, Voice and Call Rate to neither screen
(use Recharge), and streaming/TV/game categories to Entertainment - which is
empty today and will populate itself if Success TopUp ever adds such SKUs. An
unknown or missing category is kept rather than hidden, so a renamed category
cannot silently empty the picker.

## The three package services

All three buy the same way - POST `/api/recharge` with a `package_id` from
`/api/drives` - and differ only in which catalogue they read and what they keep:

| Service | Catalogue | Kept | On sale |
| --- | --- | --- | --- |
| Internet | `regular` | Data + Bundle | always |
| **Offer Packs** | `drive` | everything | **10:00-22:00 Dhaka** |
| Entertainment | `regular` + `drive` | entertainment categories only | always (empty today) |

**Offer Packs** is its own service, not a mode of Internet, because the drive
catalogue is 103 Bundle / 52 Voice / 52 Data / 4 Call Rate - and a voice-minutes
pack under an "Internet" heading is the mislabelling this app already shipped
once. It is also the only catalogue that pays a commission (0-12% of price,
averaging 4.9%), so it is where the margin is.

It takes no category filter: all four categories are legitimately on offer there.

## Internet and Entertainment packages

Both are the same transaction to Success TopUp. There is no separate package or
entertainment endpoint: a bundle is listed with `/api/drives` and bought by
POSTing `/api/recharge` with that package's `package_id` at its exact catalogue
price. The two services differ only in which catalogue they read:

| Service | `/api/drives` `type` | Kept from the result |
| --- | --- | --- |
| Internet | `regular` | Data and Bundle categories |
| Entertainment | `regular` + `drive` | entertainment categories only |

Server-side they share one code path (`SUCCESS_TOPUP_PACKAGE_SERVICES` in
`functions/apiProviderService.js`), and a package order with no `packageId` is
rejected rather than silently sent as a plain top-up of the package price.

The drive catalogue is NOT entertainment - see the section above. Entertainment
reads both catalogues and keeps only what the provider itself categorises as
entertainment, which is nothing today; the picker says so and points at Internet
and Recharge instead.

## Drive packages are sold 10am-10pm Bangladesh time

Drive packages are only on sale **10:00-22:00 Asia/Dhaka**, which is
**12:00-00:00 Asia/Kuala_Lumpur** and **04:00-16:00 UTC**. Regular packages are
unaffected and sell around the clock.

The window lives in UTC on purpose. Asia/Dhaka is a fixed +06:00 and
Asia/Kuala_Lumpur a fixed +08:00 - neither has observed DST since 2009 - so a UTC
comparison needs no timezone database, which matters because a React Native build
may not ship full ICU and a Cloud Functions locale is not something to depend on.

Enforced on the server, twice:

| Where | Outside the window |
| --- | --- |
| `listSuccessTopUpDrives` with `type: 'drive'` | returns no packages, plus `driveWindowOpen: false` and a message |
| `resolveOrderPackage`, at charge time | skips the drive catalogue, so a drive id cannot be bought |

The order-time check is the one that counts: a customer can hold a package on
screen past 22:00 Dhaka, or skip the listing altogether. When a drive id is
submitted while the window is shut, the order is refused with the hours rather
than a generic "no longer available", so the customer knows to come back.

`src/utils/driveWindow.js` mirrors the constants for the app, which uses them
only to skip the drive request and say when it reopens. It decides nothing.
`npm run test:successtopup` fails if the two copies drift, and checks both
against the IANA timezone database for all 24 hours rather than against the
offsets the modules assume.

**Superadmin prices around the clock.** Only selling is time-boxed, so
`listSuccessTopUpCatalogForAdmin` is not gated - it reports the window state and
the pricing screen says prices will apply when it reopens.

## Setting prices (Superadmin)

Bangladesh packages arrive live from `/api/drives`, so there is no hardcoded list
to edit by index the way **Admin > Internet Package Prices** edits the other
countries. They get their own surface - **Success TopUp Internet Prices (BD)**
and **Success TopUp Entertainment Prices (BD)** in the same Pricing tab - keyed
by the provider's own package id.

Two prices, and they must not be confused:

| | What it is | Where it goes |
| --- | --- | --- |
| **Cost** | the package's catalogue price | `/api/recharge`'s `amount`, beside `package_id` |
| **Sell** | what the customer pays | the wallet charge |

`/api/recharge` validates `amount` against `package_id`, so the catalogue price
is what the provider must receive. A price set in Superadmin raises only the sell
side, and the difference is margin. A package with no override sells at cost,
which is how it behaved before this existed.

Stored as `internetPricing/{operator}.apiPackages[packageId] = { price?, hidden? }`
- the same per-operator doc the built-in list already uses, gated by
`can('settings')` in `firestore.rules`. `hidden: true` removes a package from
the customer's picker without touching the provider.

Both prices are resolved server-side in `functions/successTopUpCatalog.js`:

- `listSuccessTopUpDrives` (any signed-in user) returns the **sell** price as
  `price` and never returns cost.
- `listSuccessTopUpCatalogForAdmin` (superadmin only) returns cost, sell, and
  whether each package is overridden or hidden - that is what the pricing screen
  reads.
- `chargeProduct` calls `resolvePackagePricing` before computing anything, which
  re-reads the live catalogue and the override and **replaces** the amount the
  app submitted. Previously the charge was converted straight from the client's
  `amount`, so a tampered client could have named an expensive `package_id` with
  a one-taka amount. If the price has moved since the customer saw it, the order
  is refused with "This package price has changed - please review your order"
  rather than silently charging the new figure.

The per-order resolution costs one extra `/api/drives` call. That is deliberate:
listings are frequent and orders are not, and a package order must never be
priced from a stale number.

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

`https://us-central1-satulink-solutions.cloudfunctions.net/apiWebhook/<PROVIDER_ID>`

The provider id is a path segment rather than a `?providerId=` query parameter,
because IIMMPACT's dashboard refuses to save a callback URL that already carries
a query string. The older `?providerId=<PROVIDER_ID>` form is still accepted, so
a Success TopUp webhook already registered that way keeps working and does not
need re-registering.

The webhook is server-side only. A Success callback completes the transaction; Processing keeps the wallet charge pending; Cancel refunds the exact wallet charge once.

## Status safety net

`pollSuccessTopUpStatus` runs every five minutes. It checks processing transactions for the configured Success TopUp provider through `/api/status` and applies Success/Processing/Cancel idempotently.

## India and Nepal

Success TopUp's public site advertises international recharge for India and Nepal, but its public mobile-recharge API documentation currently documents the Bangladesh `/api/recharge` schema and Bangladesh operator codes. Do not send India/Nepal numbers through the Bangladesh operator mapping.

India/Nepal should be enabled only after Success TopUp provides the international API endpoint, request schema, operator identifiers, and currency/amount rules for the API account.

## Security

The API key and secret are stored server-side in `api_providers` and are never returned by the provider-list callable. Never put either credential in React Native code, Expo config, Firestore client-writable data, or a public repository.
