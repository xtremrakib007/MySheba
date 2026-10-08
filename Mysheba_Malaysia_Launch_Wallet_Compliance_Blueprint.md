# Mysheba Malaysia Launch & Wallet Compliance Blueprint

**Version:** 1.0  
**Purpose:** Pre-launch product, wallet, partner, compliance, security, and operational blueprint for launching Mysheba in Malaysia.

> **Important:** This document is a business/technical planning blueprint, not legal advice. Before accepting real customer funds, have the exact wallet and money-flow model reviewed by a Malaysian lawyer/compliance specialist and the relevant licensed payment/e-money partner.

---

## 1. Mysheba Business Model

Mysheba is intended to operate as a Malaysian digital-services and entertainment platform with:

### Digital services
- Mobile recharge — domestic and international
- Internet/data package recharge — domestic and international
- Bill payments
- Games recharge
- Entertainment recharge

### Travel
- Bus ticket inquiry
- Train ticket inquiry
- Flight ticket inquiry
- Potential future ticket booking/issuance through appropriate partners

### Social/entertainment
- User profiles
- Feed
- Gifts
- Gift history/showcase
- Gift value credited to the recipient's wallet according to the approved wallet model

### Wallet
- Users fund their Mysheba balance
- Balance is used for Mysheba services
- Users may transfer eligible balance to other Mysheba users
- **No cash withdrawal**
- No bank-account withdrawal
- No cryptocurrency conversion
- No cash resale of points

---

# 2. Recommended Malaysian Operating Model

## Core principle

Mysheba should operate primarily as:

> **Technology + customer experience + service marketplace**

rather than independently becoming an unlicensed issuer of stored value or payment service.

Recommended structure:

```text
                         MYSHEBA APP
                              |
          +-------------------+-------------------+
          |                   |                   |
       SOCIAL              WALLET              SERVICES
          |                   |                   |
     Feed / Gifts      Licensed partner      API providers
                              |                   |
                              |          +--------+--------+
                              |          |        |        |
                              |       Recharge   Bills   Games
                              |          |
                              |      Entertainment
                              |
                              +------ Travel partners
```

### Recommended responsibility split

| Area | Mysheba | Licensed/authorised partner |
|---|---:|---:|
| App UI | YES | |
| Website UI | YES | |
| User experience | YES | |
| Feed | YES | |
| Profiles | YES | |
| Gift presentation/history | YES | |
| Wallet UI | YES | |
| Regulated stored-value layer | | YES |
| Underlying regulated funds | | YES |
| Payment/wallet compliance | | YES |
| Applicable KYC/AML controls | Shared | YES |
| Mobile recharge | Interface/API orchestration | Recharge provider |
| Internet packages | Interface/API orchestration | Recharge provider |
| Bill payments | Interface/API orchestration | Bill provider |
| Games | Interface/API orchestration | Digital provider |
| Entertainment | Interface/API orchestration | Digital provider |
| Flight inquiry | Interface/API orchestration | Travel provider |
| Ticket issuance | | Appropriate licensed/authorised travel partner |
| Customer support | YES | Escalation |
| Financial reconciliation | Shared | Wallet/payment partner |

---

# 3. Regulatory Priority

The highest-priority issue is the wallet.

The intended model is:

```text
User transfers RM100
        |
        v
Funding account / approved funding mechanism
        |
        v
Mysheba verifies/receives confirmation
        |
        v
Wallet receives RM100 equivalent
        |
        +-------------------+
        |                   |
        v                   v
Mysheba services       P2P transfer
                            |
                            v
                       Another user
```

The fact that Mysheba does not permit cash withdrawal reduces one risk, but does not automatically mean the wallet is outside Malaysian e-money/payment regulation.

The exact economic and legal characteristics matter:

- Is the balance funded by real money?
- Is it stored?
- Can it be spent later?
- Can it be transferred?
- Can another user receive it?
- Is it redeemable?
- Who legally holds the underlying funds?
- Who issues the stored value?
- Where are funds held?
- Who performs KYC/AML?
- What transaction limits apply?

These questions must be answered before public launch.

---

# 4. Preferred Wallet Structure

## Preferred model

Use a Malaysian licensed EMI/payment partner or suitable white-label wallet arrangement.

Conceptually:

```text
Customer
   |
   | Bank transfer / approved funding
   v
Licensed wallet/payment infrastructure
   |
   v
Mysheba Wallet experience
   |
   +---- Service payments
   |
   +---- Eligible P2P transfer
   |
   +---- Eligible gift transfer
```

Mysheba should not independently create regulated stored value merely by receiving deposits into its ordinary company bank account.

The partner must explicitly confirm that its approved product can support:

1. Bank-transfer funding
2. Mysheba-branded wallet
3. Stored value
4. P2P transfer
5. Gift-related value transfer, if applicable
6. Spending on Mysheba services
7. No cash withdrawal
8. Appropriate transaction limits
9. Required KYC/AML controls
10. Settlement and reconciliation

---

# 5. Bank-Transfer Funding Model

## Desired customer experience

Mysheba does not need to use a traditional card/checkout gateway if the chosen compliant structure supports bank-transfer funding.

Example:

```text
User selects:
Add RM100

        |
        v

Mysheba shows:
Approved payment instructions
Unique reference
Amount
Deadline

        |
        v

User transfers RM100

        |
        v

Bank/partner confirms transaction

        |
        v

Mysheba receives confirmation

        |
        v

Wallet credited
```

## Receipt upload

Receipt upload may be retained as supporting evidence.

It should NOT be the only authoritative source of truth where automatic bank/partner confirmation is available.

### Never do this:

```text
User uploads screenshot
        |
        v
Frontend immediately adds RM100
```

### Prefer:

```text
Bank/partner transaction
        |
        v
Verified reference/amount
        |
        v
Backend reconciliation
        |
        v
Wallet credit
```

If manual verification is necessary during a controlled beta, the credit must still happen through the secure backend ledger after authorised review.

---

# 6. Wallet Rules

## Allowed

- Add balance through approved funding mechanism
- Spend on eligible Mysheba services
- Mobile recharge
- Internet/data packages
- Bill payments
- Games
- Entertainment
- Eligible travel services
- Transfer eligible balance to another Mysheba user
- Receive eligible gift value

## Not allowed in the initial model

- Cash withdrawal
- Bank-account withdrawal
- Cash-out
- Selling points for cash
- Cryptocurrency conversion
- External wallet transfer
- Anonymous P2P transfers
- Unrestricted money-transfer functionality
- Gambling/betting wallet functionality

---

# 7. P2P Transfer

Example:

```text
User A
Balance: RM100

Transfer RM20 to User B

User A:
RM100 - RM20 = RM80

User B:
Existing balance + RM20
```

## Recommended controls

- Verified Mysheba accounts
- Sender authentication
- Recipient confirmation
- Transaction limits
- Daily/monthly limits
- Velocity monitoring
- Fraud detection
- Suspicious transaction monitoring
- Transaction history
- Wallet freeze capability
- Audit trail
- Dispute process

The final limits must be agreed with the licensed wallet/payment partner and compliance adviser.

---

# 8. Gifts

If a gift has monetary value, treat the monetary movement as a wallet transaction.

Example:

```text
User A
   |
   | Gift worth RM10
   v
Wallet/ledger transfer
   |
   v
User B
   |
   +--> Wallet +RM10
   |
   +--> Gift History / Showcase
```

The gift object itself can remain a non-financial visual record:

```text
Gift History

Gift: Rose
From: User A
Value: RM10
Date: YYYY-MM-DD
```

Do not create a separate hidden money system for gifts.

---

# 9. Wallet Ledger Architecture

Do NOT use a simple mutable balance as the financial source of truth.

Avoid:

```text
users.balance = 100
```

Use an immutable transaction ledger.

## wallet_accounts

Suggested fields:

- wallet_id
- user_id
- currency
- provider_wallet_id
- status
- created_at
- updated_at

## wallet_transactions

Suggested fields:

- transaction_id
- wallet_id
- transaction_type
- amount
- direction
- balance_before
- balance_after
- status
- provider_reference
- related_transaction_id
- idempotency_key
- created_at
- updated_at

## transfer_transactions

Suggested fields:

- transfer_id
- sender_wallet_id
- receiver_wallet_id
- amount
- status
- provider_reference
- idempotency_key
- created_at

## service_transactions

Suggested fields:

- transaction_id
- user_id
- service_type
- provider
- provider_reference
- amount
- wallet_transaction_id
- status
- failure_reason
- created_at

---

# 10. Never Allow Client-Side Balance Modification

The mobile app must never be able to directly set:

```text
balance = balance + 100
```

All wallet changes must go through a secure backend and authorised financial/wallet infrastructure.

Correct:

```text
Flutter App
    |
    v
Mysheba Backend
    |
    v
Authorised wallet/ledger system
    |
    v
Transaction result
    |
    v
Mysheba displays updated balance
```

---

# 11. Deposit Verification

Suggested workflow:

```text
PENDING
   |
   v
UNDER_REVIEW
   |
   +---- REJECTED
   |
   v
APPROVED
   |
   v
CREDITED
```

Deposit record:

```text
deposit_id
user_id
amount
payment_reference
receipt_image
submitted_at
verified_at
verified_by
status
provider_reference
```

Use idempotency controls so the same payment cannot be credited twice.

---

# 12. Reconciliation

Mysheba should reconcile wallet and service transactions regularly.

Example:

```text
Mysheba recorded wallet funding:
RM100,000

Partner recorded corresponding value:
RM100,000

Service usage:
Mobile recharge = RM35,000
Bills = RM20,000
Games = RM10,000
Entertainment = RM5,000

Remaining:
RM30,000
```

Any mismatch must enter:

```text
RECONCILIATION_REQUIRED
```

Do not silently correct balances.

---

# 13. Failed Service Transactions

Example:

```text
User wallet
RM100

Recharge request
RM20

Wallet debit
- RM20

Recharge provider
FAILED
```

The system should reconcile and refund/reverse appropriately:

```text
Wallet
+ RM20
```

Never rely solely on the frontend status.

A transaction should have states such as:

- CREATED
- PENDING
- PROCESSING
- SUCCESS
- FAILED
- REFUND_PENDING
- REFUNDED
- REVERSED
- RECONCILIATION_REQUIRED

---

# 14. Mobile Recharge

Recommended architecture:

```text
Mysheba
   |
   v
Recharge API / Aggregator
   |
   v
Telecom Operator
   |
   v
Customer
```

Mysheba handles:

- Product catalogue
- Phone number input
- Operator/product selection
- Wallet payment request
- Transaction status
- Receipt
- Customer support

Provider handles:

- Operator connectivity
- Recharge execution
- Provider settlement
- Operator confirmation

---

# 15. Internet/Data Packages

Same architecture:

```text
Mysheba
   |
   v
Recharge/Data API
   |
   v
Operator
```

Support:

- Domestic packages
- International recharge
- Data packages
- Package catalogue
- Price
- Validity
- Status

Do not claim a package is successful until the provider confirms success.

---

# 16. Bill Payment

Recommended:

```text
Mysheba
   |
   v
Bill Payment Aggregator
   |
   v
Bill Issuer
```

The bill provider should handle:

- Bill verification
- Payment processing
- Settlement
- Provider confirmation

Mysheba handles:

- UI
- Customer account/biller information
- Transaction history
- Receipt
- Support

---

# 17. Games and Entertainment

Use authorised digital-service providers.

Allowed categories should be clearly defined.

Avoid:

- Gambling
- Betting
- Casino
- Lottery/wagering products
- Cash-out gaming
- Services with unclear Malaysian legality

The product catalogue should be controlled from the admin backend.

---

# 18. Travel

## Phase 1

Start with:

- Bus inquiry
- Train inquiry
- Flight inquiry

## Phase 2

Add actual ticket booking/issuance through the appropriate partner structure.

For flight ticket sales, confirm the Malaysian travel-agency/ticketing licensing requirements and use an appropriately licensed travel partner where necessary.

Architecture:

```text
Mysheba
   |
   v
Travel API / Licensed Partner
   |
   +---- GDS
   |
   +---- Airline
   |
   +---- Bus operator
   |
   +---- Train operator
```

Do not assume an API provider automatically makes Mysheba legally authorised to sell tickets.

---

# 19. Malaysian Company Structure

Before launch:

- Maintain a properly registered Malaysian business/company
- Ensure the company's business activities accurately reflect the actual operations
- Maintain proper accounting
- Maintain contracts with all service providers
- Maintain customer terms
- Maintain supplier agreements
- Maintain appropriate insurance where commercially appropriate

---

# 20. Terms and Policies Required

Mysheba should prepare:

### General
- Terms & Conditions
- Privacy Notice
- Acceptable Use Policy
- User Agreement

### Wallet
- Wallet Terms
- Funding Rules
- P2P Transfer Rules
- Wallet Limits
- Suspension/Freeze Rules
- Refund/Reversal Rules

### Services
- Mobile Recharge Terms
- Bill Payment Terms
- Games/Entertainment Terms
- Travel Terms

### Consumer
- Refund Policy
- Cancellation Policy
- Complaints Procedure
- Customer Support Policy

### Gifts
- Gift Rules
- Gift Reversal/Fraud Rules
- Gift History Policy

---

# 21. PDPA / Personal Data

Mysheba will potentially process:

- Name
- Phone number
- Email
- Account information
- Transaction history
- Recharge information
- Bill-payment information
- Travel information
- Potential identity/passport information for travel
- Device information
- Security/fraud information

The Malaysian Personal Data Protection framework must be built into the platform.

Review:

- Privacy notice
- Data collection
- Purpose limitation
- Access control
- Retention
- Deletion
- Data breach response
- DPO requirements where applicable
- DPIA requirements where applicable
- Cross-border data transfers
- Third-party processor agreements

---

# 22. Firebase Architecture

Mysheba can continue using separate Firebase projects for app and website if appropriate.

However:

```text
Firebase
    |
    +-- Authentication
    +-- Profile
    +-- Feed
    +-- Notifications
    +-- Non-financial application data

Secure Backend
    |
    +-- Wallet orchestration
    +-- Financial transaction references
    +-- Reconciliation
    +-- Service transactions
    +-- Fraud controls
```

The client-side Firebase database should not be the authoritative source of financial balances.

---

# 23. Admin Dashboard

Create separate permissions.

### Super Admin

- Business configuration
- Provider configuration
- High-level reporting

### Finance Admin

- Deposit review
- Reconciliation
- Refund workflows
- Financial reports

### Support Admin

- User support
- Transaction investigation
- No direct balance editing

### Compliance/Fraud Admin

- Risk review
- Wallet freeze
- Suspicious transactions
- Account investigation

### Content Admin

- Feed
- Gifts
- Service catalogue
- Banners

No normal administrator should have a direct:

> "Add money to wallet"

button.

Any exceptional credit must use an auditable, authorised workflow.

---

# 24. Security Requirements

Minimum controls:

- TLS/HTTPS everywhere
- Strong backend authentication
- Role-based access control
- MFA for administrators
- Secure API authentication
- API rate limiting
- Idempotency keys
- Audit logs
- Encryption at rest where appropriate
- Secrets management
- Firebase security rules
- Server-side validation
- Input validation
- Device/session monitoring
- Fraud detection
- Account takeover protection
- Backup and disaster recovery
- Monitoring and alerting
- Vulnerability management
- Penetration testing before major launch

---

# 25. Fraud Controls

Monitor:

- Duplicate receipts
- Duplicate payment references
- Multiple accounts
- Rapid P2P transfers
- Unusual gift activity
- Abnormally high recharge volume
- Account takeover
- Repeated failed funding
- Suspicious device patterns
- Rapid movement of newly funded value
- Provider/payment mismatches

Actions:

```text
Normal
  |
  v
Allow

Suspicious
  |
  v
Review

High risk
  |
  v
Temporary restriction / freeze
```

---

# 26. Beta Launch

Do not immediately launch unlimited public deposits.

Recommended:

```text
Internal testing
      |
      v
Closed beta
      |
      v
Limited Malaysian users
      |
      v
Low/partner-approved limits
      |
      v
Monitor
      |
      v
Reconcile
      |
      v
Security audit
      |
      v
Public launch
```

---

# 27. Partner Selection Checklist

## Wallet/EMI partner

Ask:

1. Are you currently licensed/approved by BNM for the relevant activity?
2. Can you support a white-label/partner wallet?
3. Can customers fund the wallet by bank transfer?
4. Can you support Mysheba branding?
5. Can users transfer value to other Mysheba users?
6. Can gifts transfer value between users?
7. Can the wallet be used for third-party services?
8. Is cash withdrawal disabled?
9. Who legally holds the stored value?
10. Who performs KYC?
11. Who performs AML/CFT controls?
12. What transaction limits apply?
13. What wallet limits apply?
14. What settlement model is used?
15. What API/webhook capabilities exist?
16. What happens when a payment is reversed?
17. What happens when a service fails?
18. What are the setup fees?
19. What are the transaction fees?
20. What are the monthly minimums?
21. What is the integration timeline?
22. What audit/reporting data is available?
23. What fraud monitoring is provided?
24. What happens if the partnership ends?

Get the answers in writing.

---

# 28. Service Provider Checklist

For every recharge/bill/game/entertainment/travel provider confirm:

- Malaysian operating rights/authorisation where applicable
- Supplier agreement
- API documentation
- SLA
- Settlement terms
- Refund process
- Failed transaction handling
- Duplicate transaction protection
- Transaction status API
- Webhooks
- Reconciliation reports
- Support escalation
- Data-processing responsibilities
- Data location/cross-border processing
- Pricing
- Commission
- Taxes/fees
- Contract termination procedure

---

# 29. Recommended Launch Sequence

## Phase 0 — Regulatory design

**Do first**

- Freeze wallet specification
- Document RM flow
- Document P2P flow
- Document gift flow
- Determine who holds funds
- Determine who issues stored value
- Obtain Malaysian legal/compliance review
- Approach licensed EMI/white-label providers

**Do not accept public funds yet.**

---

## Phase 1 — Corporate and contracts

- Malaysian company structure
- Provider contracts
- Wallet agreement
- Recharge agreement
- Bill-payment agreement
- Digital-service agreements
- Travel partner agreement
- Terms & Conditions
- Privacy Notice
- Refund Policy
- Wallet Terms

---

## Phase 2 — Wallet backend

Build:

- Wallet account
- Transaction ledger
- Funding records
- P2P transfer
- Gift transfer
- Service payment
- Refund/reversal
- Reconciliation
- Audit logs
- Fraud controls
- Admin permissions

---

## Phase 3 — Service integration

Integrate:

1. Mobile recharge
2. Internet packages
3. Bills
4. Games
5. Entertainment
6. Bus inquiry
7. Train inquiry
8. Flight inquiry

Then ticket issuance/booking where the partner and regulatory structure allow it.

---

## Phase 4 — Security/PDPA

Complete:

- Security audit
- Firebase rules audit
- API audit
- Wallet authorization audit
- Admin permission audit
- Penetration test
- PDPA review
- Data-flow mapping
- Data retention policy
- Incident response plan

---

## Phase 5 — Closed beta

Use:

- Limited users
- Limited transaction limits
- Limited services
- Manual monitoring
- Daily reconciliation
- Fraud monitoring
- Support monitoring

---

## Phase 6 — Public Malaysian launch

Only after:

- Wallet structure confirmed
- Partner contract signed
- Required regulatory position confirmed
- Service provider contracts signed
- Security review complete
- Policies published
- Refund process tested
- Reconciliation tested
- Fraud controls tested
- Customer support operational

---

# 30. Final Recommended Architecture

```text
                         MYSHEBA
                            |
       +--------------------+--------------------+
       |                    |                    |
    SOCIAL                WALLET              SERVICES
       |                    |                    |
 Feed / Profile      Licensed Partner      API Providers
 Gifts / History          / EMI                  |
       |                    |             +------+------+
       |                    |             |      |      |
       |                    |          Recharge Bills Games
       |                    |             |      |
       |                    |             +-- Entertainment
       |                    |
       |                    +-------- P2P Transfer
       |                    |
       |                    +-------- Wallet Funding
       |
       +-------------------------------- Travel
                                             |
                                      Travel Partner
                                             |
                              +--------------+--------------+
                              |              |              |
                            Bus            Train          Flight
```

---

# 31. Go/No-Go Decision

## GO

Proceed with development and partner discussions if:

- Mysheba is positioned as a digital-service platform
- Wallet is structured through an appropriate licensed partner or legally confirmed arrangement
- No cash withdrawal
- P2P functionality is approved/supported by the wallet structure
- Service providers are properly contracted
- Travel ticketing is handled through the appropriate licensed/authorised structure
- PDPA/security controls are implemented

## NO-GO

Do not publicly accept customer deposits if:

- Mysheba is simply receiving money into its ordinary company account and independently creating transferable stored value without regulatory confirmation
- Users can cash out
- Admins can freely create money balances
- P2P transfers are uncontrolled
- Receipt screenshots are the only source of financial verification
- Financial balances are controlled by client-side Firebase
- Travel ticketing is offered without the appropriate partner/licensing structure
- Gambling/betting products are introduced without separate legal review

---

# 32. Immediate Action List

### Priority 1
**Prepare the Mysheba Wallet Regulatory Specification**

Include:

```text
RM funding
   ↓
Wallet
   ↓
Service payment
   ↓
P2P transfer
   ↓
Gift transfer
   ↓
No withdrawal
```

### Priority 2
Approach Malaysian licensed EMI/white-label providers.

### Priority 3
Ask them to confirm the exact model in writing.

### Priority 4
Obtain Malaysian legal/compliance review of the final structure.

### Priority 5
Select recharge/bill/digital/travel providers.

### Priority 6
Implement the wallet ledger and reconciliation architecture.

### Priority 7
Complete PDPA/security work.

### Priority 8
Run a controlled Malaysian beta.

### Priority 9
Perform final go-live compliance review.

### Priority 10
Public launch.

---

# Bottom Line

The recommended Mysheba strategy is:

> **Mysheba should be the super-app and service platform.**

> **A suitable licensed Malaysian partner should provide the regulated wallet/payment infrastructure where required.**

> **Recharge, bill, digital-entertainment and travel partners should provide the underlying services.**

> **Mysheba should not independently receive unlimited customer deposits and create transferable stored value until the exact Malaysian regulatory position has been confirmed.**

This preserves your desired product experience:

**Bank transfer → Mysheba Wallet → Recharge/Bills/Games/Entertainment/Travel → P2P transfer → No cash withdrawal**

while separating Mysheba's technology/business role from regulated financial functions.
