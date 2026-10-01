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

## Snap Downloads

Every user receives **3 free Snap downloads per day**.

- Resets at **00:00 Asia/Yangon** (UTC+6:30)
- Tracked via `DailyDownloadCounter` (atomic `UPDATE ... WHERE count < limit`)
- Unused free downloads do **not** roll over
- Accounting is per-user and server-authoritative — no client-side counter

### Spending rule

| Action | Cost |
|--------|------|
| Snap download (beyond 3/day free) | 1 Spark |

- Flat cost on every plan (`SPARK_DOWNLOAD_COST = 1` in `lib/spark-service.ts`)
- The user must confirm before the Spark is spent; the server independently
  re-verifies authentication, the exhausted free allowance, the plan, and the
  Spark balance — `confirmed: true` is intent, never authority
- The debit goes through the existing ledger as `SNAP_DOWNLOAD`
  (`source: SNAP`, `referenceType: snap`) with subscription Sparks spent first
- Idempotent on the client's download key (`(userId, type, referenceId)`):
  retries and concurrent confirms replay the existing charge instead of
  charging twice

### API

1. `GET /api/downloads/usage` — today's free-download usage (auth required)
2. `POST /api/downloads/authorize` — validates the idempotency key, consumes a
   free slot when one remains, otherwise (only with `confirmed: true`) spends
   1 Spark. `SPARK_REQUIRED` asks the client to confirm; `403` +
   `insufficient_sparks` means nothing was charged
3. Image bytes transfer through the unchanged `lib/download-image.ts` +
   `/api/download-image` proxy only after authorization succeeds

### Known limitations

- A lost response on a **free** download can consume one extra free slot if
  the user starts a new logical request; the atomic cap still guarantees at
  most 3 free downloads per day.
- The browser cannot prove file receipt, so a failed image transfer after a
  confirmed charge retries with the same idempotency key — no refund and no
  second charge.
- Image bytes come from public CDN URLs; gating the byte layer itself
  (signed URLs) is a future enhancement — authorization governs the product
  download flow, not raw URL access.
- Rate limiting for the authorize endpoint is a future hardening item;
  authentication, atomic accounting, the Spark ledger, and idempotency are the
  primary protections.

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

---

## S5 — Spark UI Foundation

S5 makes the existing Spark and subscription state visible to users. It is a
**UI/product-surface milestone only**: no accounting rule, cost, balance,
grant, expiration behavior, or database structure changes. The economy
remains exactly as defined in S1–S4, and payment integration remains
deferred to **S7**.

### Profile Sparks card

The shared profile surface (`components/profile/ProfilePageClient.tsx`) now
renders a **profile Sparks card**
(`components/sparks/SparkBalanceCard.tsx`) in the existing card style:

```text
Sparks
Total          123 ✨
Earned          23 ✨
Subscription   100 ✨
Plan           Spark Plus
Status         Active
Renews / ends  Oct 26, 2026
```

Displayed values:

- **Total / Earned / Subscription Sparks** — straight from the server summary.
- **Plan** — the server-resolved effective plan (`FREE` renders as `Free`).
- **Status** — the derived `subscriptionStatus` field below.
- **Renews / ends** — only when the server reports a billing-period end.

A user with no subscription row sees `Free plan`, `Subscription 0 ✨`,
status `Free`, and **no** expiration date: no subscription, period, or
payment record is ever fabricated for display. A canceled subscription keeps
showing its real status until the existing period end — cancellation is
non-renewing, not immediate expiration.

### Web/PWA + Telegram Mini App (shared surface)

The card lives inside the shared profile component, so `/profile` and
`/telegram/app/profile` — and therefore Web, PWA, and the Telegram Mini App —
all show identical numbers from one implementation. No separate Telegram
Spark UI, navigation entry, or new route was added.

### subscriptionStatus (derived response field)

`SparkUsageSummary` gained one additive, server-derived field:

| Value | Meaning |
|-------|---------|
| `ACTIVE` | Paid subscription; benefits run through `subscriptionPeriodEnd` |
| `CANCELED` | Non-renewing; benefits continue until `subscriptionPeriodEnd` |
| `EXPIRED` | Paid row whose benefits ended; effective plan is already `FREE` and its subscription Sparks are already excluded from balances |
| `null` | Free state — no paid subscription row |

It is computed in `getSparkUsageSummary` from the existing subscription row
and the same `isSubscriptionActive` check that plan resolution uses. It is
**not** a Prisma field: no schema change, no migration, no subscription
history, no payment records. A paid row whose period has ended reports
`EXPIRED` whether or not the status sweep has run, and the ledger is never
mutated or deleted.

### Server-authoritative rendering

The card calls the existing `useSparkUsage` hook → `GET /api/sparks/usage`
and renders `SparkUsageSummary` verbatim. The client performs **no** economy
calculation: no balance, cost, affordability, or expiration math, and no
hard-coded plan values or plan pricing. While the request is loading the
card shows a skeleton (never zeros); on failure it shows `role="alert"` and
invents no balance. The rest of the profile page is unaffected by a failed
fetch, and no new API endpoint was added.

### Out of scope (unchanged rules)

S5 adds **no** pricing display, plan-selection UI, purchase flow, payment
method, upgrade button, transaction/ledger history, subscription history, or
settings page — and S5 does not change economy behavior. Payment integration
stays in **S7**.

## S6 — Spark Plan UI Foundation

S6 adds a shared, **display-only** plan comparison section to the profile
surface so users can understand the four available plans and see which one
currently applies to them. S6 performs **zero subscription mutations**:
payment and subscription lifecycle changes remain the **S7** milestone.

### Component and data flow

```text
PLAN_CONFIG
    ↓
SparkPlanSection
    ↑
useSparkUsage()
    ↑
GET /api/sparks/usage

ProfilePageClient
    ├── SparkBalanceCard   ← S5, unchanged
    └── SparkPlanSection   ← S6, new
```

`components/sparks/SparkPlanSection.tsx` renders directly beneath
`<SparkBalanceCard />` inside the shared
`components/profile/ProfilePageClient.tsx`, which automatically gives parity
across Web `/profile`, PWA `/profile`, and the Telegram Mini App
`/telegram/app/profile`. No separate Telegram plan UI exists.

### Authoritative plan configuration

Every rendered value — plan name, monthly price, subscription Spark grant,
free uploads per day, extra upload cost, and caption edit cost — is read from
the single authoritative `PLAN_CONFIG` in `lib/subscription-plans.ts`.
Prices are formatted with `Intl.NumberFormat` from
`PLAN_CONFIG[plan].monthlyPriceMmk`; the component hard-codes no price
digits, no Spark constants, and no configuration of its own. S6 does not
modify `lib/subscription-plans.ts`, does not duplicate or relocate any
constant, and introduces no second configuration source.

### Current plan from the server

The "Your plan" marker is the server-reported `usage.plan` from the existing
`SparkUsageSummary` (`useSparkUsage()` → `GET /api/sparks/usage`) — the same
source `SparkBalanceCard` renders, so the section can never contradict the
card:

- **Free:** `usage.plan` resolves to `FREE`, so the Free card is marked.
- **ACTIVE:** the server-reported paid plan is marked.
- **CANCELED:** the paid plan remains marked while benefits continue through
  the billing period.
- **EXPIRED:** the server has already resolved the effective plan to `FREE`,
  so Free is marked.

The client performs no expiration, status, balance, or affordability
calculation and adds no second subscription state machine.

### Display-only behavior

- The section issues no API call of its own; `GET /api/sparks/usage` remains
  the only Spark endpoint, and no new route (`/api/subscription`,
  `/api/plans`, …) exists.
- Availability copy ("Plan activation will be available in a future update.")
  is informational only: no working call to action, and nothing
  implies that payment or activation has completed.
- While loading, the section shows skeletons instead of guessing state. On a
  failed fetch it renders the static authoritative configuration with a
  local `role="alert"` message and marks no current plan — no plan or
  balance value is ever invented, and the rest of the profile page keeps
  working.

### Tests

`scripts/spark-s6.test.ts` (`npm run test:spark-s6`) is source-level and
covers: consumption of `PLAN_CONFIG` with no hard-coded price literals, all
four plans rendered in order, configuration-driven features, current plan
from `usage.plan`, absence of client-side economy/status/expiration math, no
API call and no subscription/plans route, no payment functionality, shared
profile integration for Web/PWA/Telegram, S5 and protected economy files
unchanged, and documentation coverage.

### Out of scope (unchanged rules)

S6 adds no checkout, payment method, payment provider, webhook,
confirmation, refund, proration, invoice, or payment history — and no
activation, cancellation, upgrade, downgrade, reactivation, or expiration
sweep wiring. `components/payment/**`, `app/profile/payment/**`, and
`public/images/payments/**` remain completely isolated from S6. Payment
integration and subscription lifecycle mutations stay in **S7**.

## S7-A — Subscription Purchase Foundation

S7-A adds a provider-independent server-side foundation for recording a
subscription purchase intent and managing cancellation. It does **not**
confirm, simulate, or fulfill a payment. No payment provider, provider API,
credential, webhook, or payment UI is integrated in this milestone.

### Purchase record and authoritative configuration

`SubscriptionPurchase` stores the authenticated user, requested paid plan,
server-derived amount/currency snapshot, stable order reference, hashed
idempotency key, provider-neutral purchase status, lifecycle timestamps,
optional server-verified period start, and an optional link to the resulting
`Subscription`. The additive migration creates this model and `PurchaseStatus`
without rewriting subscription or Spark ledger rows. Provider-specific
references are isolated to the purchase record, not `Subscription`.

The client submits only a paid plan and an `Idempotency-Key` header. The
server validates the plan against `PAID_PLANS`, reads the amount exclusively
from `PLAN_CONFIG[plan].monthlyPriceMmk`, and derives currency, order
reference, and initial status itself. Benefits and subscription Sparks
remain derived from `PLAN_CONFIG` in existing server services. The original
idempotency key is hashed before persistence; the hash is unique per user.
A repeated key and same plan returns the existing intent; reuse with another
plan conflicts.

### Purchase lifecycle and authorization

Purchase states are `INITIALIZED`, `PENDING`, `SUCCEEDED`, `FAILED`,
`CANCELED`, and `EXPIRED`. S7-A exposes authenticated create-intent and
owner-scoped read routes. Purchase status, price, Spark amount, period,
subscription status, and user identity are not writable from the client.
A purchase intent is not proof of payment and does not activate a plan.

The fulfillment primitive is internal to the server service and requires an
opaque verification capability that no S7-A route or client code can mint.
There is no public fulfillment route. S7-B may provide that capability only
after adding an actual server-side verification mechanism and stable paid
period information. It must bind the verified amount/currency/order to the
stored purchase, persist one period start, and fulfill atomically.

### Idempotency and Spark grant boundary

Purchase creation serializes on the user row and is protected by a unique
(user, idempotency-key-hash) constraint plus deterministic order identity.
Future verified fulfillment must run in one transaction: lock the canonical
user row, verify the pending purchase, activate through the existing
transaction-aware subscription service primitive, create the existing
period-keyed Spark grant, link the purchase, and mark it succeeded. Replays
return the linked result without selecting a new period or extending the
subscription. Spark grant uniqueness and deterministic `subscriptionGrantReference`
remain the final duplicate-grant backstop.

### Cancellation and expiration

`POST /api/subscription/cancel` authenticates the app user and derives the
user id only from that session; it delegates to `cancelSubscription()`.
Cancellation remains non-renewing: status becomes `CANCELED`, benefits and
subscription Sparks remain effective through `currentPeriodEnd`, and there is
no refund, immediate Free transition, or Spark reversal. Existing expiration
semantics remain unchanged: after the period, effective usage resolves to
Free; `expireDueSubscriptions()` remains bookkeeping only.

### S7-B boundary

Provider selection, credentials, provider APIs, payment UI/instructions,
webhooks/signature verification, payment reconciliation, and actual payment
fulfillment are deferred to **S7-B**. Until a verified server-side event is
available, S7-A purchase records remain non-fulfilled intents and no client
request can manufacture payment success.

## S7-B.1 — Payment Domain + Wave Adapter Foundation

S7-B.1 adds the provider-independent payment domain, an explicit purchase
state machine, and a Wave Money adapter foundation. This milestone performs
**no real payments**: no provider is contacted, no credentials exist, no
webhook/callback route is added, no payment initialization API is added, and
S6 UI is not wired.

### Provider abstraction and normalized payment concepts

`lib/payment/payment-contract.ts` defines the provider-independent contract:
`PaymentProvider` with `createPayment(input)` and `verifyCallback(input)`,
plus normalized domain types (`CreatePaymentInput`, `CreatePaymentResult`,
`VerifyCallbackInput`, `VerifiedPaymentResult`, `NormalizedPaymentStatus`).
The contract carries payment-domain data only — no Prisma models, no provider
payload shapes. `CreatePaymentInput` is constructed exclusively by the server
from the stored purchase and provider configuration (purchase id, order
reference, amount, currency, expiry/TTL, callback URL, return URL,
description); the client never supplies or overrides any of it.
`VerifiedPaymentResult` represents server-verified provider data — a
signature-checked provider callback — never a client claim. Provider-specific
request/response structures stay inside the adapter.

### State machine

`lib/payment/payment-state.ts` is a pure, deterministic state machine over
`INITIALIZED / PENDING / SUCCEEDED / FAILED / CANCELED / EXPIRED` (mirroring
the `PurchaseStatus` enum; parity is asserted in tests). Transitions are
classified by trigger: `provider_authoritative`, `server_timeout`,
`user_cancellation`, `reconciliation`. Legal transitions: INITIALIZED →
PENDING (provider accepts initialization), INITIALIZED → CANCELED (user),
PENDING → SUCCEEDED / FAILED / CANCELED (verified provider outcome), PENDING
→ EXPIRED (server TTL sweep), FAILED → SUCCEEDED (late verified confirmation
= reconciliation). Terminal states accept only idempotent repeats.
`INSUFFICIENT_BALANCE` never settles a purchase (documented provider
"pending" outcome). No client request may transition a purchase to SUCCEEDED:
only a verified provider outcome event can, and only a server-side verifier
produces those events. `TIMED_OUT` provider outcomes settle as FAILED, with
EXPIRED reserved for the server-side TTL sweep so late verified successes can
still reconcile.

### Wave adapter boundary

`lib/payment/wave-payment-provider.ts` implements `PaymentProvider` for the
documented Pay with Wave Payment Gateway merchant integration: the
form-encoded `/payment` request with documented fields, the `/authenticate`
payment URL, and JSON callback verification. Field mapping:
`order_id` ← `orderReferenceId`, `merchant_reference_id` ← `purchaseId`,
`paymentRequestId` → `providerReferenceId` (documented primary tracking id),
`transactionId` → `providerEventId`. Documented response codes are normalized
(409 → duplicate, 400/404 → provider rejection, 422 → invalid input, 200
without a transaction id → unexpected). Documented ambiguity carried to
S7-B.2 rather than guessed: the request table types `order_id` /
`merchant_reference_id` as "string" while the PHP sample comments describe
them as "unsigned integer"; the adapter sends the documented string form and
S7-B.2 confirms the accepted format in the provider sandbox.

### Signature verification

`lib/payment/wave-signature.ts` isolates the documented HMAC-SHA256 contract:
lowercase-hex digest, canonical message = documented field values
concatenated without separator in documented order (request:
`time_to_live_in_seconds+merchant_id+order_id+amount+backend_result_url+
merchant_reference_id`; callback:
`status+timeToLiveSeconds+merchantId+orderId+amount+backendResultUrl+
merchantReferenceId+initiatorMsisdn+transactionId+paymentRequestId+
requestTime`), and the documented null rule (a null value hashes as the
literal string "null"). Verification is constant-time
(`crypto.timingSafeEqual`) and rejects malformed signatures (wrong length,
non-hex) without throwing. Unknown provider statuses are rejected safely and
never normalized to an outcome.

### Configuration boundary

`lib/payment/payment-config.ts` resolves server-only configuration from
`PAYMENT_PROVIDER`, `PAYMENT_ENVIRONMENT`, `PAYMENT_MERCHANT_ID`,
`PAYMENT_MERCHANT_NAME`, `PAYMENT_MERCHANT_SECRET`, `PAYMENT_API_BASE_URL`.
Missing or invalid configuration fails loudly with the offending variable
names only — never defaulted or fabricated credentials, never secret values
in errors. Secrets live only in the server-side config object and HMAC
computation; nothing is exposed via NEXT_PUBLIC_* variables, client bundles,
API responses, logs, or safe purchase projections. No real credentials are
committed; these variables are unset in development.

### No provider calls, no credentials, no webhook, no UI

The HTTP boundary (`lib/payment/http-transport.ts`) is an injectable
interface only — S7-B.1 ships no concrete transport and performs **zero
network calls**; tests inject a fake transport. There is no payment
initialization API, no webhook/callback route, no provider SDK, no refund
logic, and S6 remains display-only. The S7-A fulfillment security boundary is
untouched: `fulfillVerifiedPurchase` still requires the module-branded
verification capability and there is still no public fulfillment route.

### Renewal policy (unchanged, deferred)

Manual monthly renewal remains the policy (no auto-renewal exists). Renewal
implementation is deferred to a later milestone: the S7-A fulfillment path
correctly rejects fulfillment while a subscription is active, and the
renewal Spark-grant timing rule (grants must not be issued early for the next
period) needs an explicit product decision plus an activation-helper change.
Nothing in S7-B.1 modifies activation, grant, or period logic.

### Schema

No migration. The existing `SubscriptionPurchase.providerReferenceId`
(nullable unique) cleanly represents Wave's `paymentRequestId` (the
documented primary tracking id); the create-response `transaction_id` is an
encrypted redirect handle that belongs only in the payment URL, not in a
persistent identity column. No `paymentProvider` field is added — S7-A
records remain provider-independent.

### S7-B.2 boundary

S7-B.2 (next milestone) adds: the payment initialization API route, the real
HTTP transport, the webhook/callback route with signature verification,
state-machine persistence wired to `SubscriptionPurchase`, and the guarded
minting entry point that turns a `VerifiedPaymentResult` into S7-A's branded
verification capability for `fulfillVerifiedPurchase`. Until then no route
can initialize a provider payment or mark a purchase paid.

## S7-B.2 — Payment Initialization API

### Endpoint

`POST /api/subscription/purchases/[id]/payment` — initializes the provider
payment for an existing purchase. The client supplies only the purchase id
(URL path) and an `Idempotency-Key` header (same format rules as S7-A:
8–128 chars of `[A-Za-z0-9._:-]`). The request body is never read; there is
no client-controlled `amount`, `currency`, `plan`, `merchantId`,
`merchantReference`, `orderId`, `signature`, `backendUrl`, `frontendUrl`,
`merchantSecret`, `providerReferenceId`, or `paymentStatus`.

### Authentication and ownership

The route authenticates via the existing session convention
(`requireAuthenticatedAppUser`) and loads the purchase scoped to the session
user (`where: { id, userId }`). A purchase owned by another user is
indistinguishable from a missing one: both return 404 with no purchase
details. A user id is never accepted from the client.

### Server-authoritative purchase data

Every payment-critical value is derived from the persisted purchase row:
`amountMmk` (the historical server-authoritative amount recorded at purchase
time — never recalculated or overwritten), `currency` (MMK),
`orderReferenceId`, `id` (mapped to Wave's `merchant_reference_id`), and a
server-derived plan label for the payment description. The payment description
comes from `lib/subscription-plan-labels.ts` (server-only), never the client.

### Plan configuration integrity

Before initialization the service verifies the purchase still matches current
server-side plan semantics: the plan exists in `PLAN_CONFIG`, the plan is a
paid plan, `amountMmk > 0`, `currency === "MMK"`, and `planConfigVersion ===
"1"`. An impossible configuration fails closed with
`purchase_configuration_invalid` (HTTP 409) and never reaches the provider.

### Purchase-state eligibility

| Status      | Behavior |
|-------------|----------|
| INITIALIZED | Payment initialization allowed |
| PENDING     | With a stored provider reference: safe replay — the existing payment is returned, no duplicate provider call. Without a reference: rejected (defensive; inconsistent state) |
| SUCCEEDED   | Rejected (409); terminal, never reopened |
| FAILED      | Rejected (409); a new attempt would be a new purchase, not a retry of this row |
| CANCELED    | Rejected (409) |
| EXPIRED     | Rejected (409) |

All decisions flow through the S7-B.1 state machine
(`decidePurchaseTransition(current, { type: "payment_initiated" })`), so no
terminal purchase can be reopened and no state can reach SUCCEEDED from
initialization.

### Idempotency design

Payment-initialization idempotency is distinct from S7-A's
purchase-creation idempotency (`userId + idempotencyKeyHash`). The
`Idempotency-Key` header here is validated for format only; purchase identity
comes from the purchase id in the URL. One purchase row represents at most
one logical payment attempt: Wave's `(order_id, merchant_reference_id)` pair
is deterministic from the purchase row (`orderReferenceId` unique per
purchase; `merchant_reference_id` = purchase id). A replayed request hits
Wave's documented 409 "Record already exists", which maps to
`payment_already_requested` (HTTP 409). **No new schema fields or tables were
needed** — the existing `providerReferenceId` (unique, nullable) durably
records the accepted attempt.

### Concurrency protection

The flow serializes on the canonical `users` row lock
(`SELECT ... FOR UPDATE`, mirroring spark-service.ts and S7-A), so two
concurrent initializations cannot both observe INITIALIZED. The persisted
transition uses a guarded `updateMany({ where: { id, status: "INITIALIZED" }
})` and fails closed unless exactly one row changed. Provider creation
happens OUTSIDE the database transaction (an external HTTP call cannot roll
back); atomicity across Postgres and Wave is explicitly NOT claimed. The
orphan window (provider accepted, process died before persistence) is safe
by construction: the purchase stays INITIALIZED and any retry re-hits Wave's
409 for the same deterministic reference — a second provider payment cannot
be created for one purchase.

### Wave initialization

The service calls only `PaymentProvider.createPayment(input)` with a
server-created `CreatePaymentInput`. No Wave payloads, signing, or endpoint
selection exist outside the adapter (`lib/payment/wave-payment-provider.ts`).
The provider instance is wired by `lib/payment/payment-provider-factory.ts`
(server-only): `resolveWaveProviderConfig()` + the concrete transport.

### HTTP transport

`lib/payment/fetch-http-transport.ts` implements the S7-B.1 `HttpTransport`
interface with platform-native `fetch` (no third-party library): HTTPS only
(non-https URLs rejected before any network call), bounded timeout (one shot
via `AbortSignal.timeout`, never retried — a retry loop could duplicate a
payment request), bounded response size (oversized/truncated bodies are
dropped so the adapter fails closed), `redirect: "error"`, and no logging of
request forms (which contain signatures) or response bodies. All failures map
to `PaymentProviderError` with static messages.

### Configuration and response contract

`lib/payment/payment-urls.ts` derives the backend callback URL and frontend
return URL from `SNAPPY_PUBLIC_URL` / `VERCEL_PROJECT_PRODUCTION_URL` (and
optional `PAYMENT_CALLBACK_BASE_URL`), HTTPS-only, fail-closed (503) when no
usable origin exists. Merchant credentials never leave the server. A
successful response contains only:

```json
{
  "purchaseId": "...",
  "status": "PENDING",
  "paymentUrl": "https://…/authenticate?transaction_id=…",
  "expiresAt": "…"
}
```

No merchant secret, signature, raw Wave response, internal configuration, or
database internals are returned. Error responses carry safe application
messages only; operational logs use static error categories and never serialize
raw exception objects. Status mapping: 400 invalid Idempotency-Key, 401
unauthenticated, 404 not found / not owned, 409 not-eligible state /
configuration invalid / payment already requested, 502 provider error
(timeout, network, rejection, malformed response), 503 configuration
unavailable, 500 unexpected.

### PENDING semantics and timeout/recovery behavior

A 200 response means the PROVIDER ACCEPTED the payment request. It does NOT
mean the customer paid. The only persisted transition during initialization
is `INITIALIZED → PENDING` (plus `providerReferenceId`,
`paymentInitiatedAt`, `expiresAt`). No code path in initialization can set
`SUCCEEDED` or `paymentSucceededAt`; that requires a server-verified provider
callback (S7-B.3) flowing through S7-A's branded `fulfillVerifiedPurchase`.

A provider timeout is a `transport_error`, never success: the purchase stays
INITIALIZED with no reference, and the client gets 502. Because Wave binds
payments to the deterministic `(order_id, merchant_reference_id)`, a retry
cannot create a second payment. If Wave may have accepted before the timeout,
the same purchase re-initialization deterministically maps to the existing
provider request (409) rather than a new one; explicit reconciliation (e.g.
recovering the redirect URL or confirming the outcome) is deferred to
S7-B.3 and the current behavior is deliberately fail-closed.

### Provider error mapping

Wave adapter (S7-B.1) errors map to application responses without exposing
raw provider payloads: 409 → `payment_already_requested`; 400/404
(`INVALID_HASH`/`No record found`) and all rejections → generic
`payment_provider_error`; 422 and malformed/unexpected responses →
`payment_provider_error`; timeout/network → `payment_provider_error` (502).
Configuration failure (`PaymentConfigError`) → 503 before any mutation.

### Tests

`npm run test:spark-s7b2` (`scripts/spark-s7b2.test.ts`): source-level
security checks (no client-controlled payment data, no secret exposure,
initialization can never reach SUCCEEDED, HTTPS-only retry-free transport,
server-derived URLs) plus live-DB tests (auth/ownership, state eligibility,
server-derived provider input, PENDING replay without duplication, provider
reference persistence, paymentSucceededAt stays null, timeout/400/409/422/
malformed fail closed, impossible configuration fails safely, and concurrent
initialization of one purchase ending in exactly one PENDING purchase with
one provider reference).

### S7-B.3 boundary

Webhook/callback route, fulfillment minting, and reconciliation remain
S7-B.3. Renewal remains deferred (manual monthly renewal policy unchanged).
No refunds, no auto-renewal, no additional providers, no S6 UI wiring, and
no changes to Spark grant timing or the profile-photo payment system.

## S7-B.3 — Wave Callback Verification + Guarded Fulfillment

### Callback endpoint

`POST /api/payments/wave/callback` — provider-to-server only. NO browser
session is involved or accepted; the provider authenticates itself through
the documented HMAC callback signature. GET/PUT/DELETE return 405.

### Raw request handling

- Content-Type must be `application/json` (documented Wave callback format);
  other types → 415.
- Body bounded at 64 KiB; oversized payloads → 413 and are never parsed.
  The exact raw body is what the signature covers, so it is decoded but not
  transformed.
- No raw payloads, signatures, or secrets are ever logged; log lines carry
  static outcome codes only.
- Nothing from the callback selects a user, plan, price, or Spark amount.

### Signature verification (first, before any trust decision)

Flow: raw body → safe parse + shape validation → HMAC verification → only
then are payment fields trusted. All of this happens inside the Wave adapter
(`verifyCallback`), which reuses the S7-B.1 helpers: documented field
ordering, null → `"null"` rule, HMAC-SHA256 lowercase hex, constant-time
comparison (`crypto.timingSafeEqual`), and rejection of malformed signatures
(wrong length / non-hex / missing) without throwing. Merchant ID binding is
checked against configuration. No signing logic exists outside the adapter.
An unsigned, malformed, foreign-merchant, or unknown-status callback is
rejected before any database read or state change.

### Provider normalization

The route and service see only the provider-neutral `VerifiedPaymentResult`
(`providerReferenceId`, `orderReferenceId`, `merchantReferenceId`,
`amountMmk`, `currency`, normalized `status`, `verifiedAt`,
`providerEventId`). Raw Wave payloads never leak into the purchase service.
`merchantReferenceId` was added to the contract in S7-B.3 (additive) so the
callback service can verify Wave's `merchant_reference_id` (= purchase id at
initialization) without duplicating Wave parsing.

### Purchase identification

The purchase is found by BOTH server-persisted references in one query:
`orderReferenceId === callback orderId` AND `providerReferenceId ===
callback paymentRequestId`. A row must match both. No user-controlled field
participates. If the verified `merchantReferenceId` then differs from the
matched row's id, the callback is rejected (fail closed).

### Amount / currency verification

Strict integer equality (`verified.amountMmk === purchase.amountMmk`) with
no rounding or approximation; currency must equal the persisted currency
(normalized `MMK`). Any mismatch rejects fulfillment and leaves the purchase
untouched.

### Status handling and state transitions

Only the normalized `SUCCEEDED` outcome can enter fulfillment. Non-success
document statuses route through the S7-B.1 state machine:
`INSUFFICIENT_BALANCE` is a noop (stays PENDING, never settles);
`TRANSACTION_TIMED_OUT`/`SCHEDULER_TRANSACTION_TIMED_OUT` → FAILED;
`PAYMENT_REQUEST_CANCELLED` → CANCELED; `BILL_COLLECTION_FAILED`/
`ACCOUNT_LOCKED` → FAILED; unknown statuses are rejected by the adapter.
State transition requirements: `PENDING → SUCCEEDED` is the only legitimate
success path. `INITIALIZED → SUCCEEDED` is illegal and fails closed — a
callback for an INITIALIZED row means Wave holds an orphaned payment request
whose persistence never committed, and guessing is forbidden (see orphan
limitation below). `CANCELED`/`EXPIRED` are terminal and never reopen into
success. The `FAILED → SUCCEEDED` reconciliation transition exists in the
state machine but fulfillment currently rejects it (S7-A requires PENDING);
this is a documented, deliberate fail-closed limitation until an explicit
product rule exists.

### Replay protection

The same callback may arrive repeatedly. Fulfillment is S7-A's
`fulfillVerifiedPurchase`, which is idempotent for an already-SUCCEEDED
purchase: it returns the recorded subscription and grant without re-granting
(replay detection via the recorded period + provider reference, plus the
ledger's unique constraint). Result: one activation, one Spark grant, one
success state, no matter how many duplicate callbacks arrive. No new
fulfillment ledger was added.

### Concurrency protection

Concurrent identical callbacks serialize on the canonical `users` row lock
inside the fulfillment transaction (existing S7-A pattern); the Spark grant's
deterministic reference plus its unique constraint is the final backstop.
Non-success terminal transitions use a guarded `updateMany` on the exact
prior status, so a concurrent settlement wins deterministically. Verified by
a live-DB test running three simultaneous callbacks: exactly one grant, one
subscription, one SUCCEEDED state.

### S7-A verification boundary (preserved, non-negotiable)

The `verificationBrand` unique symbol remains module-private in
`lib/subscription-purchase-service.ts`; the brand is NOT exported. S7-B.3
adds `mintVerifiedPurchasePayment()` — the guarded internal entry point
S7-A anticipated — callable only from server payment code that has already
(a) HMAC-verified the callback via the adapter and (b) matched the
normalized result to a persisted purchase by server-side references. The
minter re-asserts the orderReferenceId/amount/currency binding before
minting, and `fulfillVerifiedPurchase` independently re-validates again
inside the transaction. The brand cannot be manufactured from any client
payload, and no route touches the minter (enforced by a source-level test
over ALL route files).

### Fulfillment transaction

For a verified success, one atomic transaction coordinates: purchase →
SUCCEEDED with `paymentSucceededAt`, `providerReferenceId`, deterministic
`periodStart` (= server-verified confirmation time, persisted exactly once
and reused on replay), and `subscriptionId`; subscription activation via
`activateSubscriptionInTransaction`; the plan's subscription Spark grant
(via `grantSubscriptionSparks`, expiring at period end). No Sparks are
issued outside the transaction; no duplicate subscription rows are possible
(the user row is locked; a user has at most one subscription row).

### Existing active subscription / renewal

Renewal is deferred to a later milestone and requires an explicit Spark
timing rule. A confirmed success whose target period conflicts with an
already-active subscription follows existing S7-A behavior and fails
(`subscription_already_active`) rather than silently stacking a renewal.

### Callback HTTP response semantics

Deterministic, detail-free (no subscription/Spark/purchase details):
- `200` — verified callback handled: fulfilled, idempotent duplicate, or a
  non-settling outcome acknowledged. (200 does NOT mean the customer paid.)
- `400` — malformed/unverifiable (bad JSON, failed signature, unknown
  status, merchant mismatch). Retrying cannot help; the provider should not.
- `404` — verified but no persisted purchase matches the references
  (includes the orphan case). Never guessed, never fulfilled.
- `409` — verified and matched but rejected: reference/amount/currency
  mismatch, illegal transition (INITIALIZED/CANCELED/EXPIRED), or S7-A
  fulfillment rejection (e.g. active-subscription conflict).
- `503` — temporary server/database failure: the provider may retry; the
  callback is idempotent, so retry is safe (Cases A/B/C from the milestone
  spec: fulfill→200, DB-down→5xx-retry, lost-response→idempotent replay).

### Orphan-payment limitation (documented, fail-closed)

Scenario: Wave accepts the payment request, but the S7-B.2 initialization
persistence fails — the purchase stays INITIALIZED with
`providerReferenceId = null`. When the callback arrives, its
`paymentRequestId` cannot match any persisted reference, so the callback is
rejected with 404 and NEVER fulfilled or guessed. The money remains
provider-held against an untracked purchase. Explicit reconciliation (a
server-side provider query by order reference, or a merchant-portal flow)
is deferred to a future milestone; until then such payments cannot fulfill
and cannot double-pay, because Wave binds the payment request to the
deterministic `(order_id, merchant_reference_id)` pair.

### Tests

`npm run test:spark-s7b3` (`scripts/spark-s7b3.test.ts`), 18 tests: signed
callback fixtures verify the documented HMAC contract (valid; tampered
payload/signature; malformed/missing signatures; constant-time path; foreign
merchant; unknown status); source checks prove the route is POST-only,
bounded, content-type-gated, detail-free, and that NO route file can reach
the fulfillment capability; live-DB tests cover exact fulfillment (state,
reference, `paymentSucceededAt`, one grant of 100), the orphan scenario,
wrong paymentRequestId/merchant reference/unknown order rejection, amount
and currency mismatch rejection, INSUFFICIENT_BALANCE/timeout/cancel
non-fulfillment, terminal-state and INITIALIZED fail-closed behavior,
concurrent identical callbacks producing exactly one grant/subscription, and
the S7-A boundary (a structurally-forged, brandless verification object is
rejected with `payment_verification_required`).

### No browser success authority

Browser redirects (frontend return URL) carry no payment authority and are
never consumed as evidence; only this signature-verified server callback
path can settle a purchase, and only via the S7-A branded fulfillment
boundary. No refunds, no auto-renewal, no additional providers, no S6 UI
wiring, no profile-photo changes.

## S7-B.4 — Spark Plan Purchase Flow + Payment Status Polling

Connects the S6 Spark Plan UI to the S7-A purchase and S7-B.2 payment
initialization APIs, opens the provider payment flow safely, and observes
server-authoritative purchase status by polling. This milestone adds NO
new backend capability: every money, identity, and state decision remains
inside the locked S7-A/S7-B.2/S7-B.3 services.

### Plan selection

The plan cards (shared `SparkPlanSection` rendered from
`ProfilePageClient`, so Web, PWA, and Telegram Mini App all show the same
UI) keep their S6 visual foundation. Each card gains one purchase
affordance (`SparkPlanPurchaseAction`):

- FREE → no purchase action at all (never purchasable).
- the user's current plan → “Current plan”.
- a paid plan while a subscription is active → a clear server-derived
  “unavailable” state instead of a fake affordance.
- otherwise → “Choose plan”.

Plan names and display labels come from the server-backed plan
configuration; the price shown for an in-flight purchase always comes from
the server-created purchase record (`amountMmk`/`currency`). The browser
never sends, stores, or duplicates any price.

### Purchase creation

`start(plan)` → `POST /api/subscription/purchases` with a JSON body of
exactly `{ plan }` (plan identifier only) and an `Idempotency-Key` header
generated with `crypto.randomUUID()`. The server validates the plan and
derives the amount from `PLAN_CONFIG`; FREE is rejected client-side and
server-side.

Duplicate-purchase protection:

- an in-flight guard makes double-clicks, repeated taps, and re-renders
  no-ops;
- retrying after a network interruption reuses the SAME idempotency key
  as the original attempt (per-attempt key kept in a ref), so the server
  replays the original purchase instead of creating a second one;
- a fresh key is generated per distinct attempt — never one permanent
  key, never a user-derived key.

Errors map to safe, non-technical messages: already-active subscription,
sign-in required, unknown purchase, provider unavailable, and generic
failures. Internal details (database errors, stack traces, merchant
identifiers) never reach the UI.

### Payment initialization

After the purchase exists, `POST /api/subscription/purchases/[id]/payment`
is called with the purchase id in the URL, a fresh `Idempotency-Key`
header, and NO request body — no amount, currency, order reference,
provider reference, signature, merchant secret, callback URL, or plan
price ever crosses the wire. All of those are derived server-side from the
persisted purchase row (the S7-B.2 contract).

If the purchase becomes ineligible (e.g. a conflict response), the client
does not retry blindly or invent an outcome: it begins observing the
server status instead.

### Payment URL behavior

The response `paymentUrl` is passed through `toSafePaymentUrl`, which
accepts only absolute `http(s)` URLs. `javascript:`, `data:`, relative,
and protocol-relative values are refused outright. The accepted URL is
opened with `openExternalLink` (the Telegram Mini App link opener inside
Telegram; a `noopener,noreferrer` new tab on Web/PWA) — it is never
rendered as HTML, never injected into the DOM, and the provider page is
never manipulated. A refused or absent URL degrades to status observation.

### Server-authoritative status

The owner-scoped `GET /api/subscription/purchases/[id]` endpoint is the
single source of truth for client payment state. The client may observe
INITIALIZED, PENDING, SUCCEEDED, FAILED, CANCELED, and EXPIRED but can
never cause a transition: the status client performs GET reads only.

### Polling

`usePurchaseStatus` runs ONE bounded loop per purchase (a timer ref
prevents stacked loops):

- cadence: one read every 3 seconds (the 2–4s band), never hammering the
  API;
- stops on the first polling-terminal status (SUCCEEDED, FAILED, CANCELED,
  EXPIRED) — PENDING and INITIALIZED keep polling;
- pauses while the tab is hidden and resumes with an immediate check on
  visibility;
- aborts in-flight requests and clears timers on unmount, request
  cancellation, or when the user leaves the flow;
- transient network errors keep the loop alive (they prove nothing),
  while auth/not-found errors stop it because polling cannot fix them.

### Polling timeout

The polling window is bounded at 8 minutes (the 5–10 minute band, chosen
against the payment attempt TTL). When it expires the UI shows:

> Payment is still being processed. You can check your Spark balance later.

It never claims “payment failed” unless the server reports FAILED, and
never claims success unless the server reports SUCCEEDED. The manual
“Check status” action restarts the window.

### Browser redirect limitation

`/subscription/checkout/return` (the `frontendReturnUrl` target) reads NO
URL query parameter — provider result parameters are navigation context
only and are never parsed or trusted. The page resolves the purchase id
from the session-scoped marker written before the payment opened (a lookup
key only), then loads the purchase status from the server. No browser
action, redirect, or query string can mark a purchase SUCCEEDED; only the
S7-B.3 signature-verified callback path settles payments.

### Web/PWA/Telegram parity

One shared `SparkPlanSection` + purchase flow drives every platform
(`ProfilePageClient` is the single mount point). The only
platform-divergent behavior is link opening, delegated to the existing
`useTelegramWebApp().openExternalLink`; the flow, messages, and server
endpoints are identical everywhere.

### Success refresh

Only when the server reports SUCCEEDED does the client show success
messaging, clear the session marker, dispatch the shared
`snappy:spark-usage-updated` event (consumed by `useSparkUsage`), and call
`router.refresh()`. The client never locally adds Sparks, never flips the
plan, and never mutates balances — it re-fetches authoritative server
data. A page refresh mid-flow resumes observing the same purchase via the
session marker (never a new purchase).

### Renewal

Renewal, auto-renewal, refunds, and additional providers remain deferred  to later milestones. An active subscription simply blocks new purchases
  with a clear server-derived state.


### Tests

`npm run test:spark-s7b4` (`scripts/spark-s7b4.test.ts`), 39 tests:
source-level checks (plan selection sends only the plan identifier; no
client price constants or duplicated plan configuration; double-submit
and retry-key protection; payment init with no body and no
money/provider fields; safe URL handling; bounded single-loop polling;
browser-return URL-parameter blindness; authoritative success refresh;
shared-UI parity), pure unit tests of the status client (URL safety,
neutral status copy, terminal sets), and live-DB tests (server-derived
pricing for every paid plan, idempotent replay, idempotency-conflict,
FREE rejection, active-subscription blocking, stub-provider payment
initialization with server-derived inputs, PENDING replay without
re-hitting the provider, fail-closed provider errors, terminal-purchase
protection, cross-user opaque rejection, and safe-field-only status
reads).

## S7-B.5 — Payment Reconciliation & Orphan Recovery

Status: **BLOCKED — provider reconciliation capability not verified.**
This milestone makes NO code changes: the documented Pay with Wave
Payment Gateway (WPPG) contract provides no authoritative server-side
payment lookup, so an orphan-recovery path cannot be implemented without
inventing provider behavior. Per the milestone stop condition the orphan
scenario remains fail-closed exactly as S7-B.3 left it.

### Exact orphan scenario

The reconciliation target is precisely one state:

- `purchase.status = INITIALIZED` AND `purchase.providerReferenceId IS
  NULL`, while the provider may already have accepted the payment (the
  process died between provider acceptance and local persistence, or the
  signed callback was never delivered).

Normal PENDING purchases are not orphans (they carry a persisted provider
reference and the signed callback identifies them). SUCCEEDED, FAILED,
CANCELED, and EXPIRED are never reopened. In the orphan state the signed
callback cannot identify the purchase (its `paymentRequestId` matches no
persisted reference), so `lib/payment-callback-service.ts` fails closed
with `purchase_not_found` and fulfills nothing.

### Provider lookup capability: documented surface only

The full documented WPPG merchant surface consists of exactly three
operations (verified against the repo adapter, the complete official
integration document, and the original provider specification):

1. `POST /payment` — create a payment request (form-encoded, documented
   request hash). Documented responses: 200 (created, returns a redirect
   handle), 409 ("Record already exists"), 400 (invalid hash), 422
   (invalid fields), 404 (invalid merchant account).
2. `GET /authenticate?transaction_id=…` — the customer payment screen.
3. Signed JSON callback to `backend_result_url` — the ONLY documented
   channel that reports payment outcomes (`PAYMENT_CONFIRMED` is the only
   success; all other statuses are reporting outcomes).

There is NO documented server-to-server transaction status, inquiry, or
lookup endpoint — nothing queryable by `order_id`,
`merchant_reference_id`, `paymentRequestId`, or `transactionId`. There is
no documented callback re-send/replay mechanism. The transport boundary
(`lib/payment/http-transport.ts`) accordingly supports only form POSTs.

### What capability is missing

An authoritative server-side lookup that answers, for the deterministic
purchase identity (`order_id` = `orderReferenceId`,
`merchant_reference_id` = `purchase.id`) or for `paymentRequestId`:

- the payment status (success vs pending/failed/canceled/expired),
- the amount and currency,
- the `paymentRequestId` and `transactionId`,

and whose answer is provider-authenticated (HMAC-signed like the
callback, or served over a mutually-authenticated channel) so it can
replace a callback as verification evidence.

### Why no substitute is acceptable

- Re-POSTing the identical `/payment` request returns 409 "Record already
  exists": it proves a request exists and says nothing about the payment
  outcome, amount, or transaction identity.
- Browser redirects and result URLs are navigation context only, never
  payment proof.
- Client-supplied transaction ids or statuses are client-attested and
  inadmissible.
- Amount/plan/user/order matching alone never binds a payment to the
  exact purchase and is explicitly forbidden.
- A callback replay cannot be requested and would arrive without
  re-verifiable provider identity beyond what is already rejected today.

### Behavior retained (unchanged)

Orphan purchases stay INITIALIZED and fail closed; no fulfillment path
was added, removed, or altered; the S7-B.3 verification and S7-A branded
fulfillment boundaries are untouched; the FAILED → SUCCEEDED
`reconciliation` transition in `lib/payment/payment-state.ts` remains
reserved for a future verified reconciliation and is still unused;
normal `GET /api/subscription/purchases/[id]` polling remains a local DB
read that never contacts the provider; no schema change, no UI change,
no renewal logic.

### What unblocks S7-B.5

Any one of:

1. a documented, provider-authenticated transaction status/inquiry
   endpoint keyed by order identity or `paymentRequestId`;
2. a documented callback re-send/replay mechanism merchants can trigger;
3. a signed merchant-portal reconciliation export usable server-side.

When one exists, the design is already reserved: `PaymentProvider` gains
a provider-neutral `reconcilePayment(...)` whose response is verified
inside the adapter and flows through the SAME private branded
verification + fulfillment boundary as S7-B.3 (never a second
fulfillment path), with exact identity checks (order reference, merchant
reference, provider reference when present), exact amount/currency
checks, fail-closed unknown statuses, and a server-side cooldown so
reconciliation can never hammer the provider.

## S7-C — Payment Production Readiness

Status: **code hardening and deployment procedure documented; production
configuration and live-provider verification remain operational tasks.**
This milestone does not implement S7-B.5 or claim a production payment has
been tested. It changes neither plan pricing/grants/period semantics nor the
callback verification and fulfillment boundary.

### Configuration inventory and safety

The payment adapter reads these required server environment variables:

| Variable | Purpose | Validation / exposure |
|---|---|---|
| `PAYMENT_PROVIDER` | Selects the existing `wavepay` adapter | Required; only `wavepay` accepted; resolved on the server during payment initialization |
| `PAYMENT_ENVIRONMENT` | Declares `test` or `production` | Required; checked against the configured Wave endpoint family |
| `PAYMENT_MERCHANT_ID` | Provider-issued merchant identity | Required; server-side HMAC and provider request only |
| `PAYMENT_MERCHANT_NAME` | Provider payment-screen display name | Required; provider request only |
| `PAYMENT_MERCHANT_SECRET` | Provider-issued HMAC key | Required; server-side HMAC only; never returned or logged |
| `PAYMENT_API_BASE_URL` | Wave API origin | Required absolute HTTPS origin; no credentials/path/query/fragment |
| `PAYMENT_CALLBACK_BASE_URL` | Optional explicit HTTPS callback origin | If set, invalid value fails closed; callback route path is appended server-side |
| `SNAPPY_PUBLIC_URL` | Explicit public app origin for return URL and default callback origin | If set, must be HTTPS; request Host/browser origin is never consulted |
| `VERCEL_PROJECT_PRODUCTION_URL` | Host-only deployment-origin fallback when `SNAPPY_PUBLIC_URL` is absent | Normalized to HTTPS; never accepted from a request |

These values are server configuration, not `NEXT_PUBLIC_*`; payment
configuration and provider factory are imported only by server payment
routes/services. The browser receives only the safe purchase projection or
payment-initialization result. There is no hardcoded credential fallback.
Configuration is resolved lazily at payment initialization, so missing
credentials do not prevent unrelated application features from booting.
Missing/invalid payment settings fail the payment-init request with a generic
503 response. A purchase intent may exist in `INITIALIZED` if a user creates
one before payment setup is available; it is never represented as provider
accepted/PENDING and cannot fulfill without the signed callback.

`PAYMENT_ENVIRONMENT` + `PAYMENT_API_BASE_URL` are strictly paired with the
verified project endpoints: `production` accepts only
`https://payments.wavemoney.io`; `test` accepts only
`https://testpayments.wavemoney.io:8107`. Other hosts, ports, and mismatched
environment labels fail configuration validation. This checks endpoint and
environment selection, not merchant credential provenance: operators must
verify the issued merchant ID/secret with Wave and provision the matching
credentials in the target environment. Do not copy production credentials
into a test deployment or vice versa.

### URL and transport hardening

Provider HTTP calls use HTTPS only, bounded timeout and response size, no
redirects, and no retry loop. Callback and return origins come only from
explicit server environment configuration or the server-provided Vercel
production hostname. Invalid explicitly configured origins fail closed
instead of falling back. Neither untrusted `Host`, browser origin, nor query
parameters influence the callback. Wave receives the exact endpoint
`POST /api/payments/wave/callback`; the frontend return URL remains
navigation-only and cannot assert success. No payment URL is persisted, and
an initialization replay does not return an old provider redirect URL. The
first successful initialization response is private/no-store; purchase
creation and status reads also set `Cache-Control: private, no-store`.

### Callback, fulfillment, and API boundaries re-verified

The callback remains POST-only, requires JSON, bounds the raw request body at
64 KiB, preserves its contents for adapter signature verification, and
verifies HMAC with timing-safe comparison before database matching or
mutation. Malformed signatures/payloads, unknown statuses, and foreign
merchants are rejected. The callback route logs only static categories or
error codes, never the raw body, signature, or provider response. There is no
second fulfillment route: a verified success still flows through the
module-private `verificationBrand` capability and the existing transactional
fulfillment service.

Purchase creation and payment initialization require the authenticated app
user, are owner-scoped, and use best-effort per-process per-user mutation
rate limiting (shared existing limiter: 30 attempts per 60 seconds per
instance). This limiter is not distributed across serverless instances and
is not represented as a global abuse-control guarantee. Status GET is an
owner-scoped local database read; it never contacts Wave. Purchase API errors
do not log raw database/provider exception objects; callback errors remain
detail-free to callers. The safe purchase projection excludes provider
references and idempotency hashes. The init response is limited to purchase
id, PENDING status, one-time payment URL, and server expiry.

The server sets the Wave TTL (600 seconds); the client cannot supply or
extend it. No payment URL is persisted, and it is returned only on initial
provider acceptance rather than on a later initialization replay.

### Deployment checklist (all items unverified here)

Leave each item unchecked until the named operational verification is
performed in the target environment. A code test is not evidence of account
approval, secret provisioning, network reachability, or a live transaction.

- [ ] Production `PAYMENT_PROVIDER=wavepay` and `PAYMENT_ENVIRONMENT=production` configured in the deployment secret manager.
- [ ] Production merchant ID, name, and secret provisioned by Wave and verified outside source control; secret is not committed or placed in a `NEXT_PUBLIC_*` variable.
- [ ] `PAYMENT_API_BASE_URL` is the approved production HTTPS origin `https://payments.wavemoney.io`.
- [ ] `SNAPPY_PUBLIC_URL` (or the deployment hostname fallback) resolves to the intended public HTTPS application origin.
- [ ] Optional `PAYMENT_CALLBACK_BASE_URL`, if used, is the intended HTTPS callback origin.
- [ ] Configured callback target is `POST /api/payments/wave/callback` and matches the URL registered with Wave.
- [ ] Wave merchant account is approved and enabled for production.
- [ ] Production callback endpoint reachability has been verified without sending a real payment.
- [ ] Provider-generated payment URL/domain has been checked against Wave's approved domain.
- [ ] Sandbox/test payment has been completed and the signed callback, one-time grant, replay idempotency, and profile refresh have been observed.
- [ ] Production payment URL and callback behavior have been verified with Wave/operator-approved non-customer test arrangements.
- [ ] Support/operations know that lost callback/orphan payments have no implemented authoritative reconciliation path; escalation is through Wave's documented merchant support process, not a fabricated API.

### Production smoke procedure (do not run with real funds without approval)

Use a Wave-approved sandbox first. For production, use only an explicitly
approved test transaction/account and obtain authorization before any real
charge. Record purchase id, timestamps, observed status, and grant outcome;
never record secrets, signatures, or raw callback bodies in the test report.

1. Sign in as a test user and select a paid Spark plan. Confirm the browser
   sends only the plan identifier and idempotency key; the server creates an
   owner-scoped `INITIALIZED` purchase and derives amount/currency from
   server plan configuration.
2. Initialize payment. Confirm the provider receives the server-derived
   amount, MMK currency, order/purchase references, 600-second TTL, and
   configured callback/return URLs. The accepted result becomes `PENDING`;
   it is not success.
3. Confirm the response payment URL opens the expected Wave HTTPS domain.
   Do not treat the browser return or URL parameters as payment evidence.
4. Complete the sandbox/approved payment through Wave. Confirm the signed
   callback reaches `POST /api/payments/wave/callback`, passes verification,
   and the owner-scoped status read reports `SUCCEEDED`.
5. Verify the subscription activates with the expected existing plan/period
   semantics and exactly the configured Spark grant, then refresh the
   profile and confirm its displayed plan and balance come from the server.
6. Replay the same provider callback only through a provider-supported
   mechanism/test fixture; verify the purchase remains succeeded and the
   grant is not duplicated. Do not fabricate a callback or assume Wave
   supports callback replay in production.
7. Verify another user's status request cannot read the purchase, and verify
   status polling remains provider-free. Verify logs contain no credentials,
   HMAC signature, raw callback body, or provider payload.

Known recovery limitation: `provider accepts payment but local persistence or
the callback is lost → no authoritative reconciliation currently available`.
The purchase can remain stuck and funds may require provider-assisted
investigation. It is recoverable only if Wave supplies a documented,
authoritative reconciliation mechanism; do not infer success from a redirect,
re-POST conflict, client-provided ID, or matching amount. **S7-B.5 remains
BLOCKED. No reconciliation endpoint was invented. No provider inquiry API
was assumed.**

### Validation and scope

S7-C's deterministic source/config tests cover fail-closed configuration,
endpoint/environment pairing, HTTPS callback-origin construction, callback
route security invariants, no-store API behavior, best-effort rate limiting,
exception-log safety, owner-scoped/provider-free status, and absence of server
secrets or fulfillment/reconciliation access in client code. Existing
S7-B.1–B.4 and S7-A behavior remains subject to the regression suite. No
schema or migration change is part of S7-C. No provider credentials were
added. No live-money transaction is performed by this milestone.

Code verification, deployment environment configuration, Wave account
approval, endpoint reachability, sandbox acceptance, and live payment testing
are separate gates; only the code/test gates can be assessed from this
checkout.

### Explicitly unchanged

No price, grant amount, billing period, renewal, refund, provider selection,
profile-photo payment, callback verifier, signature rule, or fulfillment
path is changed. The S7-B.5 blocker remains intact: **no reconciliation
endpoint was invented and no provider inquiry API was assumed.**

### S7-C test command

`npm run test:spark-s7c` runs deterministic local tests only. It does not
contact Wave or require real credentials.

### Final audit evidence

- S7-C config/source suite: 10/10 passed.
- Requested 14-suite regression sweep: 152 non-database tests passed; 63 database-dependent tests skipped because `DATABASE_URL` was not set for the final sweep. Including S7-C's 10 passing tests, 162 tests passed across 15 suites. An earlier configured Neon attempt could not connect, so live database results are unverified.
- TypeScript: `npx tsc --noEmit` passed.
- Lint: passed with three warnings in untouched `MessageList.tsx` and `CameraSplash.tsx`.
- `git diff --check`: passed.
- Production environment, provider account, reachability, sandbox/live payment: unverified; no live payment run.
- Schema/migration: unchanged. Credentials: none added. Commit/push: none.
- S7-B.5 remains **BLOCKED**; no reconciliation endpoint was invented and no provider inquiry API was assumed.

The deployment checklist above intentionally remains unchecked until each item is operationally verified.

## S8 — Payment Production Verification & Deployment Readiness

S7-C is APPROVED/LOCKED. S8 is an **operational verification** milestone:
an audit/documentation-only pass with **no code changes**. Every locked
boundary — S7-B.3 callback verification, `verificationBrand`, the fulfillment
transaction, Spark grant logic, subscription activation logic, S7-B.4 UI,
and the S7-B.5 blocker — is untouched. No provider capability was added or
assumed.

Three gates are kept strictly separate and every item below carries exactly
one status:

- **VERIFIED** — checked directly in this checkout (code, configuration
  logic, deterministic or live tests where noted).
- **NOT VERIFIED** — requires a deployed environment or live traffic this
  checkout cannot reach.
- **REQUIRES PROVIDER/WAVE ACCOUNT ACTION** — depends on Wave merchant
  onboarding or sandbox provisioning outside this repository.

### 1. Environment audit

| Variable | Consumed in | Purpose |
| --- | --- | --- |
| `PAYMENT_PROVIDER` | `lib/payment/payment-config.ts` | must be `wavepay` |
| `PAYMENT_ENVIRONMENT` | `lib/payment/payment-config.ts` | `test`/`production`, bound to the endpoint family |
| `PAYMENT_MERCHANT_ID` | config → Wave adapter | merchant id (HMAC input) |
| `PAYMENT_MERCHANT_NAME` | config → Wave adapter | name on the provider payment screen |
| `PAYMENT_MERCHANT_SECRET` | config → `lib/payment/wave-signature.ts` | HMAC key; never leaves the server |
| `PAYMENT_API_BASE_URL` | config → adapter/transport | Wave API origin (HTTPS only) |
| `SNAPPY_PUBLIC_URL` | `lib/payment/payment-urls.ts` | public HTTPS origin (callback + return URLs) |
| `PAYMENT_CALLBACK_BASE_URL` (optional) | `lib/payment/payment-urls.ts` | dedicated callback origin when set |
| `VERCEL_PROJECT_PRODUCTION_URL` (fallback) | `lib/payment/payment-urls.ts` | host-only fallback when `SNAPPY_PUBLIC_URL` is unset |

- **VERIFIED** — payment secrets are server-only: payment config, URL
  derivation, provider factory/adapter, and payment services are imported
  only from `app/api/**` server routes; no client component imports them; no
  `NEXT_PUBLIC_*` payment variable exists anywhere in the codebase.
- **VERIFIED** — no secret value is logged, committed, exposed to client
  bundles, or returned by any API. Configuration errors carry variable NAMES
  only; payment routes log static categories or error codes only; the HTTP
  transport performs no logging at all. `.env*` files are gitignored; only
  the name-only `.env.example` template is tracked.
- **VERIFIED** — no hardcoded fallback secret: missing or invalid
  configuration throws, and payment requests fail closed (503 "Payment is
  not available") while the rest of the app stays usable.
- **NOT VERIFIED** — the actual environment values configured in the
  deployment (none are present in this checkout; none were fabricated).

### 2. Wave configuration

- **VERIFIED** — endpoint/environment pairing is enforced against the Wave
  hosts already established in this project's documentation: `production` →
  `https://payments.wavemoney.io` (no port), `test` →
  `https://testpayments.wavemoney.io:8107`. Any other host, port, or
  mismatched pair is rejected before any provider call. No host was invented.
- **VERIFIED** — the callback URL sent to Wave is exactly
  `<origin>/api/payments/wave/callback`, matching the S7-B.3 route.
- **VERIFIED** — HTTPS requirements: `PAYMENT_API_BASE_URL` must be an HTTPS
  origin (no credentials, path, query, or fragment), the fetch transport
  rejects non-HTTPS URLs and never follows redirects, and public/callback
  origins are HTTPS-only with fail-closed behavior on invalid explicit
  values. No silent HTTP downgrade exists.
- **REQUIRES PROVIDER/WAVE ACCOUNT ACTION** — confirm issued credentials
  belong to the intended environment, and that Wave can reach/allow-list the
  production callback URL.

### 3. Deployment configuration (Vercel/server)

- **VERIFIED** — public callback URL construction is server-side only:
  `SNAPPY_PUBLIC_URL` (or the Vercel production-host fallback) plus the
  optional `PAYMENT_CALLBACK_BASE_URL`. Request `Host`, browser origin, and
  query parameters are never consulted; invalid explicit values fail closed
  (503) instead of silently falling back.
- **VERIFIED** — payment initialization runs through the existing provider
  adapter chain (`payment-provider-factory` → `wave-payment-provider` →
  `FetchHttpTransport`); amount, currency, plan, and references are all
  server-derived from the persisted purchase.
- **VERIFIED** — `GET /api/subscription/purchases/[id]` (owner-scoped local
  DB read) remains the client's sole source of truth; the checkout return
  page reads no URL parameter and mutates nothing — only the signed callback
  path can change payment state.
- **VERIFIED** — API responses expose only the safe purchase projection (no
  provider reference, no idempotency hash, no secrets); payment init returns
  only `{purchaseId, status, paymentUrl, expiresAt}`; the callback route
  answers with detail-free bodies. Purchase/payment responses carry
  `Cache-Control: private, no-store`.
- **VERIFIED** — logging is limited to static categories and error codes; no
  exception objects, secrets, signatures, or raw provider payloads reach
  application logs.
- **VERIFIED** — best-effort per-user rate limiting guards purchase creation
  and payment initialization (in-memory, per instance).
- **NOT VERIFIED** — real deployment environment variables, deployed
  configuration, and runtime reachability of the callback URL from Wave's
  network.

### 4. Sandbox smoke procedure (documented — NOT executed)

S8 ran **no real-money and no sandbox payment**: no provider credentials are
configured in this checkout and no Wave sandbox account is provisioned here.
Execute the following against the Wave sandbox (test environment pairing)
before any production cutover:

1. **Purchase creation** — sign in, pick a paid plan; `POST
   /api/subscription/purchases` returns 201 with an `INITIALIZED` purchase
   and the server-derived amount. Replaying the same `Idempotency-Key`
   returns the same purchase; the same key with a different plan → 409.
2. **Payment initialization** — `POST
   /api/subscription/purchases/[id]/payment` moves the purchase to `PENDING`
   exactly once (request body ignored); a second call is a safe replay and
   never creates a second provider payment.
3. **Payment URL** — the returned `paymentUrl` opens the sandbox payment
   screen; it is exposed only through this response (never persisted,
   cached, or re-derivable) while the purchase is valid.
4. **Callback delivery** — after paying on the sandbox screen, Wave POSTs
   the signed callback to `/api/payments/wave/callback`; the server verifies
   the signature before any state change and logs no body or signature.
5. **Successful fulfillment** — the purchase becomes `SUCCEEDED`; the
   subscription activates with the existing period semantics; exactly the
   configured Spark grant is recorded once.
6. **Duplicate callback** — re-deliver the same verified callback (through a
   provider-supported mechanism or test fixture only): the purchase stays
   `SUCCEEDED` and activation/grant are NOT duplicated.
7. **Failed/canceled payment** — a `BILL_COLLECTION_FAILED` /
   `PAYMENT_REQUEST_CANCELLED` sandbox outcome transitions the purchase to
   `FAILED`/`CANCELED`, activating and granting nothing.
8. **Purchase status polling** — `GET /api/subscription/purchases/[id]`
   reflects each state from the local DB without touching the provider; a
   different user receives 404.
9. **Subscription activation** — the profile shows the new plan from the
   server.
10. **Spark grant** — the balance increases by exactly the configured grant.
11. **Exactly-once** — across steps 5–6 the `SUBSCRIPTION_GRANT` row exists
    exactly once for the billing period; repeated callbacks never double
    grant.

**Sandbox smoke-test result: NOT EXECUTED (NOT VERIFIED)** — provider
sandbox account/credentials are not available in this environment.

Known recovery limitation: `provider accepts payment but local persistence or
the callback is lost → no authoritative reconciliation currently available`.
Such a purchase is recoverable only if Wave supplies a documented,
authoritative reconciliation mechanism. **S7-B.5 remains BLOCKED. No
reconciliation endpoint was invented. No provider inquiry API was assumed.**

### 5. Production checklist status

| Item | Status |
| --- | --- |
| Payment secrets server-only; never logged/committed/exposed | VERIFIED (code) |
| No secrets in API responses, logs, or client bundle | VERIFIED (code) |
| Environment ↔ Wave endpoint pairing enforced | VERIFIED (code) |
| Callback URL exactly `/api/payments/wave/callback` | VERIFIED (code) |
| HTTPS-only provider/callback/public URLs | VERIFIED (code) |
| Payment init via existing provider adapter; server-derived amounts | VERIFIED (code) |
| Purchase status sole client source of truth; browser return read-only | VERIFIED (code) |
| Safe API responses and logging | VERIFIED (code) |
| Duplicate callback exactly-once (idempotent fulfillment) | VERIFIED (code + deterministic tests) |
| Expired/terminal purchases cannot be re-opened or re-initialized | VERIFIED (code + deterministic tests) |
| `PAYMENT_*` variables configured in the deployment | NOT VERIFIED (deployment-side) |
| `SNAPPY_PUBLIC_URL` / callback HTTPS origin configured | NOT VERIFIED (deployment-side) |
| `PAYMENT_ENVIRONMENT` matches the environment the credentials were issued for | REQUIRES PROVIDER/WAVE ACCOUNT ACTION |
| Wave merchant account approved, credentials issued | REQUIRES PROVIDER/WAVE ACCOUNT ACTION |
| Sandbox smoke procedure executed end-to-end | NOT VERIFIED (needs sandbox account) |
| Production callback reachable from Wave's servers | NOT VERIFIED (needs deployment) |
| Live payment tested | NOT VERIFIED (needs provider + explicit approval) |
| Deployment log-sink audit (no secrets/signatures) | NOT VERIFIED (deployment-side) |
| Production observability, DB backups, runbook | NOT VERIFIED (deployment-side) |

### 6. Locked boundaries preserved

S8 changed no code at all, so trivially: no change to S7-B.3 callback
verification, `verificationBrand`, the fulfillment transaction, Spark grant
logic, subscription activation logic, S7-B.4 UI, profile-photo payment,
pricing, grant amounts, or period semantics. No reconciliation/inquiry
workaround, renewal, auto-renewal, refund, second provider, or payment-state
redesign was implemented. The S7-B.5 blocker stands.

### 7. Test & validation evidence (S8)

- No code change was required, so no S8 test suite was created (per the
  milestone rule). The S7-C suite remains the deterministic payment guard:
  10/10 passing.
- Full `test:*` sweep: 36 suites run; 32 green. 4 failures, all pre-existing
  and outside payment scope (each in committed/untouched files):
  - `test:auth` and `test:spark` require `DATABASE_URL` (npm scripts do not
    load `.env.local`) and crash at Prisma import without it.
  - `test:spark` with the live DB: 11/35 pass — shared test-DB residue
    (`createTestUser` unique `name` collisions cascade), one daily-cap
    date-boundary assertion, and one `getYangonDayDate` expectation vs.
    implementation mismatch.
  - `test:telegram-mini-app-home` asserts that the preserved untracked
    `components/telegram/TelegramSnapFeed.tsx` does not exist; it fails
    because that known-unrelated file exists and must remain untouched.
  - `test:social-s8` asserts the newest migration is
    `20260924120000_social_user_presence`; S7-A's committed
    `20260927120000_subscription_purchase_foundation` migration postdates
    it. Stale social-milestone assertion.
- Live database: connection **VERIFIED** this session (`SELECT 1`);
  `auth-logic` 5/5 and `spark-s7a` (purchase foundation) 11/11 pass against
  the live DB; `spark-service` DB results as classified above.
- TypeScript (`npx tsc --noEmit`): passed. Lint: 0 errors, 3 pre-existing
  warnings (`MessageList.tsx` ×2, `CameraSplash.tsx`). `git diff --check`:
  passed.
- Schema/migrations: unchanged by S8 (24 migrations; none added).
- Code verification, deployment environment configuration, Wave account
  approval, endpoint reachability, sandbox acceptance, and live payment
  testing remain separate gates. Only the code/test gates plus live-DB
  connectivity could be assessed from this checkout.

## S8.4 — Subscription payment sandbox smoke harness

### Purpose

`scripts/spark-s8.4-smoke.ts` is a single runnable harness that walks the
existing subscription purchase flow end to end and prints **which stage
fails**: purchase creation → payment initialization → provider reference →
callback → fulfillment → terminal state → subscription activation → Spark
grant → replay/idempotency → cleanup. It is a verification harness, not a new
payment architecture: it reuses the production purchase service, payment
provider factory, Wave adapter, initialization service, callback service,
state machine, and fulfillment boundary, and duplicates none of their logic.

### Command

```bash
npm run test:spark-s84        # the harness
npm run test:spark-s84-unit   # focused deterministic checks (no provider)
```

Exit codes: `0` = PASS, `1` = FAIL, `2` = BLOCKED. **BLOCKED is never a
success** — a skipped provider tier can never produce PASS.

### Required environment

Nothing is required for the deterministic tier beyond the normal local setup
(`DATABASE_URL`, and a resolvable HTTPS `SNAPPY_PUBLIC_URL`/callback origin).
The live tier additionally requires, all positively established:

```text
PAYMENT_PROVIDER=wavepay
PAYMENT_ENVIRONMENT=test            # production is refused unconditionally
PAYMENT_MERCHANT_ID / PAYMENT_MERCHANT_NAME / PAYMENT_MERCHANT_SECRET
PAYMENT_API_BASE_URL=https://testpayments.wavemoney.io:8107
SMOKE_LIVE_SANDBOX=1                # explicit opt-in for the live tier
```

`PAYMENT_ENVIRONMENT=production` is refused before anything else runs. There
is deliberately **no flag that enables production payment traffic**.

### Safe / unsafe execution boundaries

Safe (deterministic tier): runs the real adapter and the real callback
verifier against an in-process transport and a synthetic, run-scoped secret,
with test data isolated by a per-run `RUN_ID`. No network, no real credential.

Unsafe / out of scope: real-money payments, production configuration, forged
callbacks presented as provider verification, reconciliation or inquiry
endpoints, refunds, and renewal. None are implemented here; S7-B.5 stays
blocked.

### Stages

| # | Stage | Deterministic tier | Live tier |
| --- | --- | --- | --- |
| 1 | Configuration / readiness | PASS/BLOCKED | same |
| 2 | Create subscription purchase | PASS (server-derived amount, idempotent replay) | same |
| 3 | Initialize provider payment | PASS (documented request fields present) | real provider call |
| 4 | Confirm provider payment reference | PASS (persisted reference, initiation time, expiry) | plus the live Wave interaction |
| 5 | Callback | PASS (real verifier + HMAC; tamper rejected) | PASS only on a genuine provider callback |
| 6 | Fulfill purchase | PASS (SUCCEEDED, subscription linked, period set) | same |
| 7 | Terminal state | PASS | same |
| 8 | Subscription activation | PASS (plan, ACTIVE, period end) | same |
| 9 | Subscription Sparks grant | PASS (exactly one, deterministic reference) | same |
| 10 | Replay / idempotency | PASS (same provider event replayed; no duplicate grant/subscription/transaction) | exactly-once counts verified |
| 11 | Final summary + cleanup | PASS (only this run's records) | same |

### Result semantics

`PASS` — stage verified. `FAIL` — stage verified and wrong. `SKIPPED` — stage
could not run (e.g. no live sandbox access). `BLOCKED` — a mandatory stage did
not pass, so the run is inconclusive. When provider access is unavailable the
deterministic stages report PASS, the provider stages report SKIPPED, and the
overall result is:

```text
S8.4 RESULT: BLOCKED — Wave sandbox unavailable
```

### Example output (no secrets)

```text
S8.4 — subscription payment sandbox smoke harness
RUN_ID: s84_20260930165646_8980b335
MODE: LOCAL_DETERMINISTIC

[01] Configuration / readiness...... PASS  sandbox config established: no | callback origin configured: yes | database configured: yes
[02] Create subscription purchase... PASS  plan=SPARK_PLUS | amount=29000 MMK (server-derived) | currency=MMK | idempotent replay: yes
[03] Initialize provider payment.... PASS  purchase status=PENDING | payment URL: https://testpayments.wavemoney.io:8107/authenticate?<redacted>
[04] Confirm payment reference...... PASS  reference persisted: yes (s84-…35 (len 34)) | owner-scoped service status: PENDING
[04] LIVE provider interaction...... SKIPPED  SKIPPED — LIVE WAVE SANDBOX NOT AVAILABLE
[05] Callback verification.......... PASS  real adapter + HMAC verified (synthetic key); tamper rejected: yes
[06] Fulfill purchase............... PASS  purchase status=SUCCEEDED | subscription linked: yes
[07] Terminal state................. PASS  status=SUCCEEDED
[08] Subscription activation........ PASS  plan=SPARK_PLUS | status=ACTIVE
[09] Sparks grant................... PASS  grant count=1 | amount=100 | deterministic reference: yes
[10] Replay / idempotency........... PASS  replay of the same provider event: acknowledged | grants after replay=1 | new transactions=0
[11] Final summary.................. PASS  purchase=SUCCEEDED | subscription=ACTIVE | duplicate grants=0
[12] Cleanup (this run only)........ PASS  removed transactions=1, subscriptions=1, purchases=1, users=1

S8.4 RESULT: BLOCKED — Wave sandbox unavailable
```

### Cleanup

Cleanup targets only rows owned by this run's smoke user (`smoke_s84_<RUN_ID>`)
and refuses to delete anything if that identity cannot be verified; no unscoped
`deleteMany` exists in the harness. Residue from an interrupted run is inert
because identities are run-scoped.

### Callback re-delivery observation (documented contract; not an S8.4 failure)

**Same provider event replay is supported and idempotent.** Re-submitting the
identical verified callback is acknowledged, the purchase stays `SUCCEEDED`,
and no duplicate subscription, Spark grant, or ledger transaction is created.
The harness exercises exactly this, using a pinned verification clock in the
same way the locked S7-B.3 suite does.

**A genuinely later verification timestamp for the same payment currently
reaches `payment_verification_mismatch`** inside the locked fulfiller. In that
case:

- the purchase remains `SUCCEEDED`;
- no duplicate subscription is created;
- no duplicate Spark grant is created;
- no duplicate ledger transaction is created;
- the later re-delivery is currently **not acknowledged** — it is rejected
  rather than answered as a successful replay.

This is a **known follow-up issue, not an S8.4 failure**: the harness documents
it here instead of asserting a fix, and the behaviour is pinned by a
characterization test so any future change becomes visible.

Scope note: this describes only how our own verification-time handling behaves.
It makes **no claim about Wave's retry behaviour** (which is not documented
here) and assumes no provider retry, replay, or reconciliation semantics.
Correcting it would change S7-A/S7-B.3 (`verificationBrand` minting and the
fulfillment transaction), so it is explicitly out of scope for this milestone:
the fulfillment logic, payment state machine, and S7-B.5 all remain untouched.

### TODO — future callback-idempotency investigation

Investigate whether a re-delivered callback carrying a genuinely later
verification timestamp should be treated as the same provider event — for
example by deriving the billing period from a stable, documented
provider-supplied event identity/time instead of the server verification clock
— and whether the locked fulfiller should then acknowledge the re-delivery
instead of rejecting it. This needs a product decision plus an explicit,
documented provider event-time rule; no such rule may be inferred. S7-B.5
(provider reconciliation) is **BLOCKED** and is not part of this investigation.

### Explicit limits

**S7-B.5 remains BLOCKED.** No reconciliation endpoint was invented and no
provider inquiry API was assumed.

This harness does **not** prove production readiness: it does not establish
that Wave approved the merchant, that the deployed credentials are valid, that
the production callback endpoint is reachable, or that a real payment settles.
A successful **sandbox** callback test does not establish production merchant
approval or production payment readiness — those remain separate operational
gates requiring provider/account access.

## S8.5 — Deployment hygiene & reachability preparation

Status: **deployment/configuration hygiene only.** No payment logic changed.
S7-A, S7-B.1–B.5, S7-C, the S8.3 readiness route, and the S8.4 harness are
untouched; no schema, no migration, no new provider capability, and no live
provider request or real payment was made. This milestone makes the deployment
configuration explicit and runnable without credentials.

### Required payment environment variables

Names only — values are server-side secrets and are never committed. These are
read from the existing resolvers `lib/payment/payment-config.ts` (S7-B.1) and
`lib/payment/payment-urls.ts` (S7-B.2); no variable was invented here.

| Variable | Required | Consumed by | Purpose / validation |
| --- | --- | --- | --- |
| `PAYMENT_PROVIDER` | Yes | `payment-config.ts` | Only `wavepay` is accepted |
| `PAYMENT_ENVIRONMENT` | Yes | `payment-config.ts` | `test` or `production`; bound to the endpoint family below |
| `PAYMENT_MERCHANT_ID` | Yes | `payment-config.ts` → adapter | Provider-issued merchant id (HMAC input) |
| `PAYMENT_MERCHANT_NAME` | Yes | `payment-config.ts` → adapter | Display name on the provider payment screen |
| `PAYMENT_MERCHANT_SECRET` | Yes | `payment-config.ts` → `wave-signature.ts` | Provider-issued HMAC key; never leaves the server |
| `PAYMENT_API_BASE_URL` | Yes | `payment-config.ts` → transport | Absolute HTTPS origin; no credentials/path/query/fragment |
| `SNAPPY_PUBLIC_URL` | Effectively (see below) | `payment-urls.ts` | Explicit public HTTPS app origin (return URL + default callback origin) |
| `PAYMENT_CALLBACK_BASE_URL` | Optional | `payment-urls.ts` | Dedicated HTTPS callback origin; invalid value fails closed |
| `VERCEL_PROJECT_PRODUCTION_URL` | Fallback only | `payment-urls.ts` | Host-only origin provided by Vercel when `SNAPPY_PUBLIC_URL` is unset |

`.env.example` now documents the server-side payment variables with safe
placeholders only (`PAYMENT_PROVIDER="wavepay"`, every secret left empty).
`SNAPPY_PUBLIC_URL` and `VERCEL_PROJECT_PRODUCTION_URL` are documented there in
context rather than re-declared, so no duplicate key is introduced.

### Server-only secret handling

- All payment variables are **server-only**. None may be prefixed with
  `NEXT_PUBLIC_`; there is no `NEXT_PUBLIC_PAYMENT*` variable anywhere in the
  codebase, and none is introduced here.
- The payment config, URL resolver, provider factory/adapter, and payment
  services are imported only from server routes; no client component imports
  them. Configuration errors carry variable **names** only, never values.
- The committed `.env.example` template carries names/placeholders only.
  `.env*` is gitignored (`.env.local` is not tracked); only the template is
  tracked, and it must never contain a real credential.
- Secrets (`PAYMENT_MERCHANT_SECRET`, and any future provider token) are held
  only in the resolved server config object and fed into HMAC computation.
  They are never returned by an API, logged, or placed in a client bundle.

### Production / test endpoint pairing

`PAYMENT_ENVIRONMENT` and `PAYMENT_API_BASE_URL` are validated together —
provided by the code, documented here, never inferred:

| `PAYMENT_ENVIRONMENT` | Accepted `PAYMENT_API_BASE_URL` |
| --- | --- |
| `production` | `https://payments.wavemoney.io` (no port) |
| `test` | `https://testpayments.wavemoney.io:8107` |

Any other host/port, or a mismatched pair (for example `environment=test` with
the production origin), fails `resolveWaveProviderConfig` before any provider
call. Operators must provision the credentials issued for the matching
environment and must not copy production credentials into a test deployment or
vice versa. `PAYMENT_ENVIRONMENT=production` is refused by the S8.4 harness
unconditionally; that harness behavior is unchanged by this milestone.

### Callback origin and the canonical-domain question

How the code derives the origins (all from `lib/payment/payment-urls.ts`):

1. **Public origin** — `SNAPPY_PUBLIC_URL` when present; otherwise
   `VERCEL_PROJECT_PRODUCTION_URL` (host-only, normalized to HTTPS). Request
   `Host`, browser origin, and query parameters are never consulted.
2. **Callback origin** — `PAYMENT_CALLBACK_BASE_URL` when set, otherwise the
   public origin above.
3. **Wave callback URL** — exactly
   `<callbackOrigin>/api/payments/wave/callback` (the S7-B.3 route).
4. **Browser return URL** — `<publicOrigin>/subscription/checkout/return`
   (navigation only; never proof of payment).

Invalid explicit values fail closed: no origin means the payment-init request
returns a generic 503 rather than falling back to a different deployment.

**Canonical origin — UNRESOLVED, deliberately not decided here.** The
repository contains no authoritative canonical-domain convention for the
payment callback, and two hosts appear in existing configuration/documentation:

- `snapppy.info` (no `www`): `docs/telegram.md` states the production
  environment as `https://snapppy.info/` and gives the Mini App deep-link
  example `https://snapppy.info/telegram/app?…`; the configured
  `SNAPPY_PUBLIC_URL` value is `https://snapppy.info`.
- `www.snapppy.info`: the configured Telegram webhook origin is
  `https://www.snapppy.info/api/telegram/webhook`.

Because no source of truth exists in the repository, this milestone does
**not** choose a canonical host, does **not** modify any callback or origin
behavior, and does **not** guess. The discrepancy is recorded so deployment
configuration can resolve it explicitly: the operator must set
`SNAPPY_PUBLIC_URL` (and/or `PAYMENT_CALLBACK_BASE_URL`) to whichever host is
actually registered with Wave. No redirect exists, so a mismatch between the
origin registered with Wave and the deployed origin would prevent callback
delivery.

### Relationship between S8.3 readiness and deployment verification

`GET /api/admin/payments/readiness` is a **configuration-only** diagnostic. It
is admin-gated, never contacts Wave, never reads the database, and returns only
booleans and safe category strings.

**`ready: true` from S8.3 does NOT prove deployment reachability or Wave
sandbox/production readiness.** `ready: true` means only that the server-side
payment configuration is internally valid and the deployment configuration is
ready to be checked. It does **not** establish any of the following, all of
which remain separate operational gates:

- Wave merchant approval has been granted;
- the provisioned credentials are valid or accepted by Wave;
- the deployment is reachable from the public internet;
- a signed callback can actually be delivered;
- a sandbox payment has succeeded;
- production is ready for real payments.

So a green readiness probe and a deployed `SNAPPY_PUBLIC_URL` still do not
prove that Wave can reach `POST /api/payments/wave/callback`, nor that a real
payment settles.

### No live credential testing

This milestone added no credential and made no network call to Wave: no
merchant secret, API token, cookie, or real Wave credential was requested,
added, printed, or stored, and no real payment was attempted. The
configuration checks are source/config-only and run without any credential.

### Explicit limits

**S7-B.5 remains BLOCKED.** No reconciliation endpoint was invented and no
provider inquiry API was assumed.

**S8.4 remains BLOCKED for live sandbox access** (missing Wave sandbox
configuration, not a code failure). Confirming the deployment's real origins
and endpoint reachability, and any live sandbox payment, still require
deployment/provider access and are not claimed here.
