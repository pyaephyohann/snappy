# Spark Economy v1 — Foundation

> **Milestone**: S1 — Spark Foundation
> **Status**: Locked rules (v1)
> **Pricing**: Plan prices are defined as server-side product configuration
> (S4 — `PLAN_CONFIG`). They are **not** payment integration; see
> [S4 — Subscription Foundation](#s4--subscription-foundation) below.
> **S2 — Snap Integration**: user-facing upload integration built *on top of* S1 (see [S2 — Snap Integration](#s2--snap-integration-user-facing))
> **S4 — Subscription Foundation**: subscription/accounting foundation (plans, grants, expiration, plan-aware costs)

---

## Terminology

| Term | Meaning |
|------|---------|
| **Sparks** | User-facing currency name. Never "Points" in the UI. |
| **Spark** | Internal code name. Used in models, enums, and service names. |
| **Earned Sparks** | Sparks credited through eligible Snap uploads. Never expire. |
| **Subscription Sparks** | Sparks granted by a subscription. Expire at billing period end. |

---

## Architecture

### Shared Upload Service

All Snap creation flows through a single authoritative service:

```
                 Web / PWA
                    │
          Telegram Mini App
                    │
             Telegram Bot
                    │
                    ▼
       lib/snap-upload-service.ts
       (createSnapWithSparkAccounting)
                    │
        ┌───────────┴───────────┐
        │                       │
   Spark accounting        Snap creation
   (daily counters,        (prisma.snap.create)
    spending, earning)
        │                       │
        └───────────┬───────────┘
                    ▼
               PostgreSQL
```

- `POST /api/snaps` → calls `createSnapWithSparkAccounting`
- `POST /api/telegram/mini-app/snaps` → calls `createSnapWithSparkAccounting`
- `lib/telegram/upload-snap.ts` → calls `createSnapWithSparkAccounting`

Cloudinary upload is external (client-side or Telegram bot upload) and stays outside the database transaction.

### Atomic Transaction

Every Snap creation is a single `prisma.$transaction`:

```
BEGIN
  1. Resolve target user + uploader
  2. Atomically increment DailyUploadCounter (or spend Sparks)
  3. Create Snap record
  4. Record UploadUsage
  5. If eligible: atomically increment DailySparkEarnCounter + create reward
COMMIT
```

If any step fails: `ROLLBACK` — no partial state.

---

## Free Uploads

Every user receives **10 free Snap uploads per day**.

- Resets at **00:00 Asia/Yangon** (UTC+6:30)
- Tracked via `DailyUploadCounter` (atomic `SELECT ... FOR UPDATE`)
- Unused free uploads do **not** roll over
- Configured via `PLAN_CONFIG` (`freeUploadsPerDay`) — 10/day on the Free,
  Spark+, and Spark Pro plans; 15/day on Spark Ultra (S4)

---

## Spark Earning

An eligible (free) Snap upload earns **+1 Spark**.

- Maximum earned Sparks: **10 per day**
- Tracked via `DailySparkEarnCounter` (atomic `UPDATE ... WHERE count < limit`)
- Once the cap is reached, additional eligible uploads earn **0 Sparks**
- Spark-paid uploads do **not** generate a Spark reward
- The earning cap resets at **00:00 Yangon** with the new daily period

---

## Spark Spending

### Free-Plan Costs

| Action | Cost |
|--------|------|
| Extra Snap upload (beyond 10/day free) | 5 Sparks |
| Caption edit | 2 Sparks |

### Subscription Plan Costs (S4)

Authoritative per-plan rules live in **one place**: `PLAN_CONFIG` in
`lib/subscription-plans.ts` (server-side only). The server resolves the
user's effective plan from the database on every operation — costs are never
hard-coded throughout the application and never accepted from the client.

| Plan | Monthly Price | Subscription Sparks | Free Uploads/day | Extra Upload Cost | Caption Edit Cost |
|------|--------------:|--------------------:|------------------:|-------------------|-------------------|
| Free | 0 MMK | 0 | 10 | 5 Sparks | 2 Sparks |
| Spark+ | 29,000 MMK | 100 | 10 | 4 Sparks | 1 Spark |
| Spark Pro | 59,000 MMK | 300 | 10 | 3 Sparks | 1 Spark |
| Spark Ultra | 99,000 MMK | 1,000 | 15 | 2 Sparks | 1 Spark |

> Prices are **product configuration only** (S4). Payment integration,
> checkout, and purchase flows are deferred (S7).

### Spending Priority

**Subscription Sparks are consumed first.** Earned Sparks are used only after applicable subscription Sparks have been exhausted.

---

## Spark Types

### Earned Sparks

- Created through eligible Snap uploads
- Never expire
- Cannot be transferred or converted to cash

### Subscription Sparks

- Granted by the subscription service at the start of each billing period
  (S4 — `activateSubscription` / `grantSubscriptionSparks`)
- Have an expiration date (end of billing period)
- Expired subscription Sparks are excluded from available balance

---

## Ledger Architecture

The Spark economy uses a **transaction ledger** as the single source of truth.

> **Never store a mutable `user.sparks` counter.**

### Schema

```
spark_transactions
├── id            (cuid, primary key)
├── userId        (FK → users)
├── amount        (signed integer: +credit, -debit)
├── type          (SparkTransactionType enum)
├── source        (SparkTransactionSource enum)
├── sparkKind     (SparkKind: EARNED | SUBSCRIPTION)
├── expiresAt     (nullable — subscription Sparks expire)
├── referenceType (nullable — "snap", "subscription", etc.)
├── referenceId   (non-nullable — idempotency key)
├── metadata      (nullable JSON — audit info)
└── createdAt     (auto-timestamp)
```

### Unique Constraint

`@@unique([userId, type, referenceId, sparkKind])`

Because `referenceId` is **non-nullable**, PostgreSQL correctly enforces
uniqueness for every row — no NULL bypass possible. The per-`sparkKind`
component allows a spend that draws from both Spark kinds to record one debit
per kind under the same logical reference (see S4 spending priority);
idempotency checks always look at `(userId, type, referenceId)` across kinds.

### Upload Operation Idempotency

Upload idempotency is separate from Spark ledger idempotency. `snap_upload_operations` is the authoritative record for the logical upload:

```
snap_upload_operations
├── id
├── userId
├── idempotencyKey
├── snapId (UNIQUE, linked after Snap creation)
├── isFreeUpload
├── sparkRewardCredited
└── createdAt / updatedAt
```

`UNIQUE(userId, idempotencyKey)` means one logical upload key maps to exactly one Snap. The operation record, counter changes, Snap, `UploadUsage`, Spark spend, and reward are committed in the same PostgreSQL transaction. A concurrent unique-key conflict retries the transaction and returns the winner's Snap.

### Idempotency Rules

| Transaction Type | Idempotency Key | Guarantee |
|-----------------|----------------|-----------|
| `UPLOAD_REWARD` | `snap.id` | One reward per snap |
| `EXTRA_SNAP_UPLOAD` | Client `idempotencyKey` | One charge per logical upload |
| `CAPTION_EDIT` | Client `idempotencyKey` or `snapId` | One charge per edit operation |
| `SUBSCRIPTION_GRANT` | `sub-grant:{subscriptionId}:{periodStart}` | One grant per billing period |
| `ADMIN_ADJUSTMENT` | Explicit admin reference | Explicit key required |
| `REFUND` | Explicit reference | Explicit key required |

### Stable Client Idempotency

The upload client generates a UUID v4 **once per logical upload operation**:

```typescript
const idempotencyKey = crypto.randomUUID(); // before Cloudinary upload
// ... Cloudinary upload ...
// POST /api/snaps { ..., idempotencyKey }
// retry → same idempotencyKey → no double charge
```

Generated in `lib/snap-upload-client.ts` via `generateIdempotencyKey()`. The Web/PWA and Mini App client functions accept an optional key so a caller can preserve it across a full request retry. The Telegram Bot uses the stable Telegram `update_id` for the photo submission, so webhook reprocessing reuses the same key.

Retry guarantee:

```
same (userId, idempotencyKey)
→ same Snap/result
→ one UploadUsage
→ at most one Spark charge
→ at most one upload reward
```

---

## Daily Counters

### DailyUploadCounter

Tracks free daily uploads per user per Yangon calendar day.

```
daily_upload_counters
├── id, userId, day (UNIQUE), count, createdAt, updatedAt
```

Updated atomically via:
```sql
UPDATE daily_upload_counters
SET count = count + 1
WHERE userId = $1 AND day = $2 AND count < $3
RETURNING count
```

### DailySparkEarnCounter

Tracks daily Spark earning per user per Yangon calendar day.

```
daily_spark_earn_counters
├── id, userId, day (UNIQUE), count, createdAt, updatedAt
```

Updated atomically via:
```sql
UPDATE daily_spark_earn_counters
SET count = count + 1
WHERE userId = $1 AND day = $2 AND count < $3
RETURNING count
```

### Daily Reset

Both counters reset naturally at Yangon midnight because the `day` key changes to a new date. No cron job required.

---

## Concurrency Guarantees

### Daily Free Upload Limit

- `DailyUploadCounter` with `SELECT ... FOR UPDATE` (via Prisma interactive transaction)
- `WHERE count < limit` ensures only one request succeeds at capacity
- Concurrent requests for the last slot: at most 1 succeeds

### Daily Spark Earning Cap

- `DailySparkEarnCounter` with atomic `UPDATE ... WHERE count < limit`
- Same pattern as upload counter
- Concurrent requests at cap boundary: at most 1 earns

### Spark Spending

- `SELECT SUM(amount) ... FOR UPDATE` within `prisma.$transaction`
- Subscription-first priority enforced atomically
- Concurrent spends: row-level lock serializes balance reads

### Caption Editing

- `prisma.$transaction` wrapping: authorization + spend + caption update
- If update fails: `ROLLBACK` → no Spark charge
- Idempotent retry: same key → single charge

---

## Timezone

All daily periods use **Asia/Yangon** (UTC+6:30).

Midnight Yangon = 17:30 UTC previous day.

No cron job required — daily boundaries computed from timestamps.

---

## Transaction Types

| Type | Description | Direction |
|------|-------------|-----------|
| `UPLOAD_REWARD` | +1 Spark for eligible upload | Credit (+) |
| `SUBSCRIPTION_GRANT` | Monthly subscription allocation | Credit (+) |
| `EXTRA_SNAP_UPLOAD` | Cost for upload beyond free limit | Debit (-) |
| `CAPTION_EDIT` | Cost for editing a caption | Debit (-) |
| `SUBSCRIPTION_EXPIRATION` | Expired subscription Sparks removed | Debit (-) |
| `ADMIN_ADJUSTMENT` | Manual admin correction | ± |
| `REFUND` | Refund of previously spent Sparks | Credit (+) |

---

## API Integration

### Snap Upload (`POST /api/snaps`)

1. Validate request + idempotencyKey
2. Validate media (Cloudinary URL/publicId)
3. Call `createSnapWithSparkAccounting` (atomic DB transaction)
4. Return snap + spark metadata

Response:
```json
{
  "snap": { "id": "...", "imageUrl": "...", ... },
  "spark": { "isFreeUpload": true, "sparkRewardCredited": true }
}
```

### Caption Edit (`PATCH /api/snaps/[snapId]/caption`)

1. Validate request + optional idempotencyKey
2. Atomic: authorize → spend Sparks → update caption
3. Return updated snap + spark metadata

### Security Rules

- **All Spark mutations happen server-side**
- The client never submits `sparkAmount`
- The server determines costs and rewards
- Authentication required for all Spark operations

---

## S2 — Snap Integration (user-facing)

> S2 does **not** change any S1 accounting rule. It surfaces the existing,
> server-authoritative state in the Snap upload experience. All numbers shown
> to the user come from the server; the frontend never computes balances,
> costs, or eligibility.

### Milestone boundaries

| Milestone | Scope |
|-----------|-------|
| **S1** | Ledger, daily counters, atomic spend/earn, upload idempotency, shared `createSnapWithSparkAccounting()` — *accounting foundation* |
| **S2** | Usage summary API + Spark UI in the Snap upload flow (Web/PWA, Telegram Mini App, Telegram Bot) — *integration only* |
| **S4** | Subscription/accounting foundation: plans, grants, expiration, plan-aware costs — *no payment* |
| **Later** | Checkout, payment gateway, Spark purchases/packs, pricing page, caption-edit charging UI — **not implemented** |

### Spark usage summary (server-authoritative)

`getSparkUsageSummary(userId)` in `lib/spark-service.ts` derives a
presentation-only projection from the ledger + daily counters, and it is
exposed as:

```
GET /api/sparks/usage  →  { usage: SparkUsageSummary }
```

```ts
{
  balance,               // available Sparks (earned + non-expired subscription)
  freeUploadsUsed,       // free uploads used today
  freeUploadsRemaining,  // free uploads left today
  freeDailyUploads,      // 10
  dailyEarnedSparks,     // Sparks earned today
  dailyEarnRemaining,    // remaining earning capacity today
  dailyEarningCap,       // 10
  extraUploadCost,       // 5
  uploadReward,          // 1
  nextUploadIsPaid,      // free allowance exhausted?
  canAffordNextUpload,   // enough Sparks for the paid upload?
}
```

No ledger internals (transaction ids, sources, history) are exposed. The
shared type lives in `lib/spark-usage.ts` (safe to import from client code).

### Upload responses

Both `POST /api/snaps` and `POST /api/telegram/mini-app/snaps` now return the
actual server outcome for the logical upload plus a refreshed summary, so the
UI updates without a second request:

```json
{
  "snap": { "id": "..." },
  "spark": {
    "isFreeUpload": true,
    "sparkRewardCredited": true,
    "sparkSpent": 0,
    "sparkRewarded": 1
  },
  "idempotent": false,
  "usage": { "balance": 8, "freeUploadsUsed": 5, "...": "..." }
}
```

Insufficient-Sparks rejections are machine-readable: HTTP 403 with
`code: "insufficient_sparks"`.

### Web/PWA + Telegram Mini App (shared UI)

Both flows render inside the shared `SnapCreateComposerModal`, so the Mini App
inherits the identical behavior — same rules, same terminology, no forked
economy code.

**Indicator** (always visible while loaded):

```
✨ 7 Sparks          Free uploads today: 6 / 10
```

**Before the free limit** — a helper line states that the upload uses one of
today's free uploads and earns `+1 Spark ✨` (the reward claim is only shown
when the server reports remaining daily earning capacity).

**Success feedback** — driven by the server result, not an assumption:

```
Snap uploaded
+1 Spark ✨      (free upload that earned a reward)
```

```
Snap uploaded
-5 Sparks ✨     (Spark-paid upload)
```

A free upload at the daily earning cap shows "Snap uploaded" with no reward
line. An idempotent replay reports the outcome recorded for that logical
upload, so it never implies a second charge.

**Paid confirmation** — only when `nextUploadIsPaid && canAffordNextUpload`:

```
Use 5 Sparks to upload this Snap?
✨ You have 12 Sparks
[Cancel] [Upload for 5 Sparks]
```

The confirmation is advisory: the server re-decides the charge at request
time, and its response wins.

**Insufficient Sparks** — when the free allowance is exhausted *and* the
balance is below `extraUploadCost`, the Upload button is disabled and:

```
You're out of Sparks ✨
You've used all 10 free uploads today. An extra upload costs 5 Sparks — you have 2.
Free uploads reset at 00:00 (Asia/Yangon).
```

### Circular-UX constraint (unchanged rules)

A user with `0 Sparks` and `10/10 free uploads used` cannot upload, so they
cannot earn a Spark by uploading. This is the intended consequence of the
locked S1 rules: there is no free path that forges a new rule. S2 surfaces the
state honestly (including the Yangon reset time) instead of offering a
workaround. Earning and spending both resume at the 00:00 Asia/Yangon daily
boundary.

### Refresh & consistency

1. Preferred: adopt the `usage` field returned with the upload response.
2. Fallback: a single `GET /api/sparks/usage` refetch.
3. On upload failure: refetch, since the server state may have changed.
4. On fetch failure: the indicator stays hidden — the client never guesses a
   balance.

### Error handling

| Case | Behavior |
|------|----------|
| Insufficient Sparks | HTTP 403 `code: "insufficient_sparks"` → friendly message, no success feedback |
| Daily free limit reached | Upload becomes Spark-paid → confirmation step |
| Upload failure | No reward/deduction message is shown |
| Network failure | No invented Spark state; the stable `idempotencyKey` protects retries |
| Session/auth failure | Existing 401 → "Your Snappy session has expired." (no second auth system) |

### Telegram Bot

The bot reply reflects the actual server result:

```
✅ Snap uploaded!

Your Snap is now on Snappy.
+1 Spark ✨        (free upload reward)
```

```
✅ Snap uploaded!

Your Snap is now on Snappy.
-5 Sparks ✨       (Spark-paid upload)
```

On rejection:

```
✨ You're out of Sparks

You've used all 10 free uploads today.
An extra upload costs 5 Sparks — you have 2.

Free uploads reset at 00:00 (Asia/Yangon).
```

Idempotent webhook replays reuse the `tg-…-update-<update_id>` key, so a
reprocessed photo returns the original Snap and its recorded outcome — one
Snap, one charge, one reward.

## S3 — Caption Editing

> S3 integrates the locked caption-edit rule into the existing My Snaps editor.
> It does not change S1 accounting or S2 upload rules.

### Free-plan rule

| Action | Cost |
|--------|------|
| Caption edit | **2 Sparks** |

The server determines and enforces this cost through the existing atomic Spark
spending path. The client never submits an amount or decides whether an edit
is affordable.

### User experience

Caption editing remains available only for the authenticated user's **My
Snaps**. Before saving, the editor shows the server-provided caption cost and
current balance, then asks for confirmation:

```
Edit caption for 2 Sparks?
✨ You have 7 Sparks.
[Cancel] [Save for 2 Sparks]
```

When the server confirms a charged edit, the viewer shows:

```
Caption updated
-2 Sparks ✨
```

The usage display adopts the authoritative `SparkUsageSummary` returned by the
server. If the response cannot include usage, the existing S2 usage endpoint
is refetched; the UI never subtracts Sparks locally.

### Atomicity, validation, and stale state

`PATCH /api/snaps/[snapId]/caption` validates the caption, authenticates the
session, verifies `Snap.uploadedById`, and performs the caption update plus
`CAPTION_EDIT` debit in one database transaction. A failed validation,
unauthorized edit, insufficient balance, or failed transaction leaves both the
caption and Spark balance unchanged.

The request carries a stable idempotency key for one logical edit. A retry
returns the existing result without charging twice. Saving the exact current
caption is a no-op: it leaves the database and Spark ledger unchanged.

If the UI's balance is stale, the server still decides. An insufficient-Spark
response is HTTP 403 with `code: "insufficient_sparks"`; the editor shows the
server error and refreshes usage rather than displaying a deduction.

### Surface scope

Caption editing is integrated in the existing Web/PWA My Snaps flow. Telegram
currently has no caption-edit surface, so S3 adds no new Telegram editor or
parallel accounting path. Telegram upload-time captions remain part of Snap
creation and are unaffected.

### Out of scope (later milestones)

Subscription plans, subscription checkout, payment gateway, Spark purchases
or packs, annual billing, premium features, caption-edit discounts,
subscription management UI, pricing page, new economy rules, and any change to
Spark earning amounts or daily limits.

---

## S4 — Subscription Foundation

> **S4 = subscription/accounting foundation.**
> **S7 = payment integration.**
>
> S4 establishes the backend subscription domain, plan configuration, and
> accounting behavior only. It adds **no** payment gateway (KPay/AYA/UAB,
> Stripe), no checkout, no payment webhooks, no pricing page, no subscription
> purchase UI, no annual billing, no proration, no refunds, no Spark packs,
> and no new earning mechanisms. Frontend purchase flows belong to S7.

### Subscription plans

Plan identity is the `SubscriptionPlan` enum (`FREE`, `SPARK_PLUS`,
`SPARK_PRO`, `SPARK_ULTRA`). All per-plan product rules live in **one
authoritative server-side configuration**, `PLAN_CONFIG` in
`lib/subscription-plans.ts`:

| Plan | Monthly Price | Subscription Sparks | Free Uploads/day | Extra Upload | Caption Edit |
|------|--------------:|--------------------:|------------------:|-------------:|-------------:|
| Free | 0 MMK | 0 | 10 | 5 Sparks | 2 Sparks |
| Spark+ | 29,000 MMK | 100 | 10 | 4 Sparks | 1 Spark |
| Spark Pro | 59,000 MMK | 300 | 10 | 3 Sparks | 1 Spark |
| Spark Ultra | 99,000 MMK | 1,000 | 15 | 2 Sparks | 1 Spark |

Prices are product configuration only — nothing in S4 reads them for
payment. The daily Spark earning cap (10/day) and upload reward (+1) remain
locked S1 rules and are **not** per-plan.

### Subscription period model

One `Subscription` row per user (`subscriptions`, `userId` unique):

```
subscriptions
├── id
├── userId             (UNIQUE → users)
├── plan               (SubscriptionPlan)
├── status             (SubscriptionStatus: ACTIVE | CANCELED | EXPIRED)
├── currentPeriodStart (explicit timestamp)
├── currentPeriodEnd   (explicit timestamp)
└── createdAt / updatedAt
```

Billing periods are explicit, deterministic timestamps: `currentPeriodEnd =
currentPeriodStart + 1 calendar month` computed in UTC by
`addBillingMonths()` (month-end clamped). Daily usage boundaries remain
`00:00 Asia/Yangon` as in S1 — daily counters are unrelated to billing
periods. No accounting identity ever uses `Date.now()` or a random UUID.

Statuses are minimal and domain-meaningful (no payment-provider states such
as `TRIALING`/`PAST_DUE`/`PAYMENT_FAILED` — those arrive with S7):

| Status | Meaning |
|--------|---------|
| `ACTIVE` | Current billing period; benefits apply |
| `CANCELED` | Non-renewing; benefits continue until `currentPeriodEnd` |
| `EXPIRED` | Terminal; billing period ended without renewal |

**Free users (Phase 13):** a user with **no** subscription row is implicitly
the Free plan. `resolveEffectivePlan()` falls back to `FREE` for absent,
Free, expired, or past-period rows, so there is never an ambiguous state and
Free users need no payment record. The effective plan is always computed
server-side from the database.

### Subscription Spark grants

At the start of a billing period, `grantSubscriptionSparks()` credits the
plan's subscription Sparks as a ledger transaction:

```
type:   SUBSCRIPTION_GRANT
source: SUBSCRIPTION
sparkKind: SUBSCRIPTION
amount: PLAN_CONFIG[plan].subscriptionSparks
expiresAt: currentPeriodEnd
```

`activateSubscription({ userId, plan, periodStart? })` (in
`lib/subscription-service.ts`) is the internal, service-level operation that
establishes a subscription: it creates/updates the row and grants the period
Sparks in one atomic transaction. It is **not** exposed as an HTTP endpoint;
a future payment milestone calls it after a successful payment. There is no
frontend purchase button.

### Grant idempotency

Grant identity is deterministic: `subscriptionGrantReference()` produces

```
sub-grant:{subscriptionId}:{currentPeriodStart.toISOString()}
```

e.g. `sub-grant:cmxx…:2026-09-26T10:00:00.000Z` — the same billing-period
event always maps to the same accounting operation. Combined with the ledger
unique constraint `(userId, type, referenceId, sparkKind)` and a
`SELECT … FOR UPDATE` lock on the user row, running the grant **once, twice,
or ten times — including concurrently — credits the allocation exactly
once**. No `Date.now()` or per-retry random identity is used anywhere in the
subscription service.

### Subscription Spark expiration

Subscription Sparks expire at the end of their billing period via
`expiresAt = currentPeriodEnd` on the grant row. Balance and spend queries
already count only rows with `expiresAt IS NULL OR expiresAt > now`, so
expiration is a **pure function of time**:

- Historical `SUBSCRIPTION_GRANT` rows are **never mutated or deleted**.
- No `SUBSCRIPTION_EXPIRATION` transaction is written — writing one would
  double-subtract from an already-excluded grant.
- `expireDueSubscriptions()` is an idempotent bookkeeping sweep that flips
  the subscription row to `EXPIRED`; it never touches the ledger, and safety
  does not depend on it running.

**Earned Spark permanence:** Earned Sparks have `expiresAt = NULL` and are
untouched by subscription expiration.

```
Earned: 20   Subscription: 100
period ends
Earned: 20   Subscription: 0   (grant excluded, ledger unchanged)
```

### Spending priority

Subscription Sparks are consumed first, earned Sparks second. Because the
balance is tracked per Spark kind, a spend that spans both kinds records
**one debit row per kind** under the same logical reference:

```
subscription = 3, earned = 10, spend 5 (Free plan)
→ SUBSCRIPTION debit −3 (expiresAt = pool period end)
→ EARNED      debit −2
→ subscription = 0, earned = 8
```

The subscription debit inherits `expiresAt` from the subscription Sparks it
draws from, so grant and debit expire together at the period boundary — an
expired pool has zero residue and the balance can never go negative.

All spending keeps the S1 concurrency guarantees: the canonical user row is
locked with `SELECT … FOR UPDATE` inside one Prisma transaction, then
balances are summed and debits inserted while holding the lock. Two
simultaneous spends are serialized; a same-key concurrent replay returns the
original charge instead of charging twice. There is **no** read-calculate-
write implementation anywhere.

### Plan-aware upload and caption costs

The server resolves the effective plan on every operation and reads
`freeUploadsPerDay`, `extraUploadCost`, and `captionEditCost` from
`PLAN_CONFIG`:

- **Uploads:** `createSnapWithSparkAccounting` applies the plan's daily free
  allowance to `DailyUploadCounter` and charges the plan's extra-upload cost
  when the allowance is exhausted.
- **Caption edits:** `atomicSpendSparks` charges the plan's caption cost
  through the same atomic, server-authoritative path as S3.

The client never submits a plan; a claimed `plan = "SPARK_ULTRA"` in a
request body is ignored by every route.

### Usage summary extension

`SparkUsageSummary` (S2, server-authoritative) now additionally reports:

```ts
{
  plan,                    // FREE | SPARK_PLUS | SPARK_PRO | SPARK_ULTRA
  balance,                 // total available Sparks
  subscriptionSparks,      // non-expired subscription Sparks
  earnedSparks,            // earned Sparks (never expire)
  subscriptionPeriodEnd,   // ISO timestamp or null when not on a paid plan
  freeDailyUploads,        // plan's daily free allowance
  extraUploadCost,         // plan's extra upload cost
  captionEditCost,         // plan's caption edit cost
  // …existing S2 fields unchanged
}
```

This is backend/domain information for future S5/S6 UI — S4 builds no
pricing UI.

### Transitions and upgrade/downgrade rules

S4 safely supports **Free → paid** (and paid → paid **after** the previous
period has ended) via `activateSubscription`, which creates a fresh billing
period and exactly one grant for it. While a paid subscription is still
active:

- replaying the same activation is **idempotent** (no second grant);
- activating a *different* paid plan is **rejected** (`already_active`).

Immediate upgrades/downgrades mid-period — prorated Sparks, refunds,
partial-month grants, rollover bonuses, or double grants — are **explicitly
deferred** to the payment/subscription-lifecycle milestone and are not
invented in S4.

### Concurrency

All subscription operations (`activateSubscription`,
`grantSubscriptionSparks`, `cancelSubscription`, spends) serialize on the
canonical `users` row lock in a single, consistent order, wrapped in
`prisma.$transaction`. Two simultaneous activation/grant requests produce
**one** subscription row and **one** grant; the ledger unique constraint is
the final backstop. Expiration is time-based (no job race), so a spend at
the period boundary can never consume expired subscription Sparks.

### Milestone boundaries

| Concern | Milestone |
|---------|-----------|
| Plans, grants, idempotency, expiration, plan-aware costs, internal activation | **S4 — done (this milestone)** |
| Payment gateway (KPay/AYA/UAB, Stripe), checkout, payment webhooks, pricing page, purchase UI, proration, refunds | **S7 — deferred** |
