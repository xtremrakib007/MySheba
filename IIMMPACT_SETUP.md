# iimmpact setup

What the app now does for itself, and the handful of values you still have to
supply. Nothing here needs a code change.

iimmpact is configured as an ordinary API provider under
**Admin → API Provider Management**, the same screen as Success TopUp. It is
intended for every country except Bangladesh, which stays on Success TopUp.

## 1. Credentials

From **iimmpact Dashboard → API Keys**, take two values:

| Value | Goes in | Notes |
| --- | --- | --- |
| API key | Credentials → API Key | sent as `X-Api-Key` |
| HMAC secret | Credentials → API Secret | **base64, exactly as shown** |

The secret is base64 and is decoded to bytes before signing. Re-typing it,
converting it to hex, or pasting a trimmed version produces a different key and
**every** call comes back 401 with nothing to say which half was wrong. The form
refuses a secret that is not valid base64 for exactly that reason, while you are
still looking at it.

Both are stored in Secret Manager, not in the provider document.

## 2. Provider record

Tap **Fill iimmpact defaults** on the add/edit provider sheet. It sets:

| Field | Value |
| --- | --- |
| Base URL | `https://api.iimmpact.com` (staging is `https://staging.iimmpact.com`) |
| Endpoint | `/v2/topup` |
| Method | `POST` |
| Authentication | `iimmpact (HMAC)` |
| Success path / values | `data.status` / `Succesful, Successful` |
| Pending path / values | `data.status` / `Accepted, Processing` |
| Reference path | `data.refid` |
| Message path | `data.remarks` |
| PIN path | `data.pin` |

Two of those are traps rather than preferences:

* **`Succesful` has one `s`.** iimmpact's docs call the typo permanent.
  `/v2/transactions` spells it `Successful`, so both are listed.
* **`Accepted` and `Processing` must be listed as pending.** Both arrive with
  HTTP 200 and a transaction the provider has already created. Treated as a
  refusal, the customer is refunded for a top-up that then completes, and the
  money leaves twice.

The one value the preset cannot know is **`product`** in the request body. Get
the product code for each operator or biller from `GET /v2/product-list` (or the
Price List CSV in their dashboard) and put it in the body template.

Set **Country** to the country this record serves, and **Priority** above any
other provider for the same service and country. A record with country `ALL`
is used for any country that has no exact match, so Bangladesh must keep its own
Success TopUp record at a higher priority.

## 3. Callback

**iimmpact's transaction callback carries no token.** It authenticates only by
source address, so the webhook screen accepts a list of allowed IPs instead:

1. **Admin → API Provider Management → Webhook** for the iimmpact provider.
2. Leave **Webhook token** empty.
3. Put their callback addresses in **Allowed source IP addresses**
   (comma separated). Their walkthrough gives `18.140.170.98` — **confirm the
   current list with iimmpact rather than trusting this file**, and ask whether
   they publish more than one.
4. Set **Our reference, in their callback** to the field echoing the `refid` we
   sent.
5. Status values:
   * done → `Succesful, Successful`
   * not finished → `Accepted, Processing`
   * **refund the customer → `Failed, Refund`**

That last one matters: every value in the refund list gives the money back, and
a failure name left out of it leaves the customer charged for a transaction
iimmpact has already reversed. `Refund` is their status for a voided
transaction, so it belongs there beside `Failed`.

Give them the webhook URL shown on that screen. An enabled webhook with neither
a token nor an IP list is refused at save time, and a callback from an
unlisted address is refused with 401 and logged.

An IP allowlist is weaker than a signed callback. It is used because it is the
strongest check this provider offers. Note that their **payment** webhooks
(orders, refunds) *are* signed, with `IIMMPACT-Signature` — but those belong to
their hosted-checkout flow, which this app does not use: MySheba pays from its
own iimmpact balance and the customer pays MySheba in points.

## 4. Testing

**Test Connection** on the provider row calls `GET /v2/balance` — their own
recommended probe. It costs nothing, creates nothing, and exercises the whole
signing path, so it tells you whether the credentials and the signature are
right before any customer money is involved. On success it reports the account
balance.

Test against staging first: `https://staging.iimmpact.com`, and product code
`FP` always reports an interruption there if you want to see that path.

## 5. JomPAY

JomPAY has its own home tile and its own flow, because the rail asks for a
biller **code** off the customer's bill rather than a biller from a list. The
screen collects Biller Code, Ref-1, Ref-2 (when the bill shows one) and the
payer's IC or passport.

**The IC is not optional.** JomPAY falls under Malaysia's AMLA and iimmpact
requires a verified IC (Malaysians) or passport number (non-Malaysians) on every
JomPAY transaction, with account suspension as the stated penalty for sending a
fictitious one. It is asked for per payment rather than taken from the profile
so that whoever is paying confirms whose number it is. It is stored on the
transaction because the provider needs it on a retry, and shown masked to the
last four on screen and on the receipt.

The JomPAY request body differs from the others and the preset picks it up when
the provider name contains "jompay":

```json
{
  "refid": "{{requestId}}",
  "product": "JOMPAY",
  "account": "{{accountNumber}}",
  "amount": "{{amount}}",
  "extras": { "biller_code": "{{billerCode}}", "ic_number": "{{icNumber}}", "ref2": "{{ref2}}" }
}
```

So name that record something like **iimmpact JomPAY** and give it the
Bill Payment feature.

## 6. Per-number data plans (Malaysia internet)

iimmpact personalises mobile-data plans per phone number, so two customers on
the same operator get different lists. The Internet step now asks
`GET /v2/subproducts` for the number the customer typed and offers what comes
back, under the heading **Plans available on 01…**.

Tapping **Fill iimmpact defaults** on an **Internet** provider record sets the
catalogue up: path `/v2/subproducts`, method `GET`, **Priced per phone
number** `true`, and the query `{"product_code":"{{operator}}",
"account_number":"{{account}}"}`.

**Operator product codes** maps each operator to the iimmpact product its plans
come from. The default:

| Operator | Product code |
| --- | --- |
| Celcom | `CEL` |
| CelcomDigi | `CEL`, `DI` |
| Hotlink | `HI` |
| U Mobile | `UMI` |
| Tunetalk | `TI` |
| XOX | `OXI` |
| Yes | `YESI` |
| Unifi | *(none — iimmpact publishes no internet product for it)* |

**CelcomDigi is deliberately two codes.** Celcom and Digi merged under one brand
but iimmpact still sells `CEL` and `DI` separately, and our prefix table answers
"CelcomDigi" for 010/011/013/016/019 without knowing which half a number is on.
Guessing one would offer a Celcom customer Digi's plans. Instead both are asked;
because the catalogue is per-number the provider answers for only the one the
number is actually on, and each plan keeps the code it came from so the order is
placed against that product. Each extra code is one more request per listing, so
the list is capped at four.

An operator with no code keeps the built-in package list exactly as before —
nothing regresses for Unifi, or for any country without such a provider.

Two things to verify against a live call before going to production:

* **The list path.** The preset reads the plans from `data`, inferred from
  iimmpact's `data` envelope elsewhere. If the real response nests them further,
  set **List path in the response** on the provider record — no deploy needed.
  A wrong path does not fail silently: the error names the fields that did
  arrive.
* **The price field.** The preset reads `denomination` first, deliberately —
  that is the face value and is what must be sent back as `amount`. `cost` is a
  different number (what you pay) and sending it buys a different product.

### Pricing and margin

Set your sell price per plan in **Admin → Pricing**, keyed by the plan's
subproduct code, exactly as for the Bangladesh catalogue. With no override the
customer pays the denomination. The customer is charged the sell price; the
provider is sent the denomination.

The price is now resolved **on the server** at charge time, against the same
number the plans were listed for. Before this, a Malaysian package order was
priced by whatever the client sent — it was only ever safe because the provider
rejects a nonsense denomination.

## Still to do

* **Bill presentment.** `GET /v2/bill-presentment` would show the outstanding
  amount before paying, and would catch an invalid account number before the
  charge. Not wired up.
* **Network status.** `GET /v2/networkstatus?product=…` would warn the customer
  about a provider interruption without blocking the payment. Not wired up.
