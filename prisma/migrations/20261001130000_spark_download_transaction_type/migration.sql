-- D3 — Download Snap Limit with Sparks: Spark-paid Snap download ledger type.
-- Additive only: one new SparkTransactionType value for the existing Spark
-- ledger (spark_transactions). No existing rows, balances, or types change.

-- AlterEnum
ALTER TYPE "SparkTransactionType" ADD VALUE 'SNAP_DOWNLOAD';
