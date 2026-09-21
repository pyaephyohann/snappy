# Spark Economy v1 — Foundation

> **Milestone**: S1 — Spark Foundation
> **Status**: Locked rules (v1)
> **Pricing**: TBD — do not treat any prices in this document as final

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
- Configured via `FREE_DAILY_UPLOADS` constant (future: per-plan)

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

### Subscription-Plan Costs (Future)

> **Pricing TBD** — architectural placeholders only.

| Plan | Monthly Sparks | Free Uploads/day | Extra Upload Cost | Caption Edit Cost |
|------|---------------|------------------|-------------------|-------------------|
| Spark+ | 100 | 10 | 4 Sparks | 1 Spark |
| Spark Pro | 300 | 10 | 3 Sparks | 1 Spark |
| Spark Ultra | 1,000 | 15 | 2 Sparks | 1 Spark |

### Spending Priority

**Subscription Sparks are consumed first.** Earned Sparks are used only after applicable subscription Sparks have been exhausted.

---

## Spark Types

### Earned Sparks

- Created through eligible Snap uploads
- Never expire
- Cannot be transferred or converted to cash

### Subscription Sparks

- Granted by subscription billing (not yet implemented)
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

`@@unique([userId, type, referenceId])`

Because `referenceId` is **non-nullable**, PostgreSQL correctly enforces uniqueness for every row — no NULL bypass possible.

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
| `SUBSCRIPTION_GRANT` | Billing period identifier (future) | One grant per billing period |
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
