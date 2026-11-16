-- ============================================================================
-- CRM V2: Migration 011 - Single Choke Point Wallet Hardening & DB-Level Safety
-- Zero bypass paths, DB-level non-negative constraint, and idempotency protection
-- ============================================================================

-- 1. DB-Level Non-Negative Balance Constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_user_wallets_balance_non_negative'
    ) THEN
        ALTER TABLE user_wallets ADD CONSTRAINT chk_user_wallets_balance_non_negative CHECK (balance >= 0);
    END IF;
END $$;

-- 2. Ledger Hardening: Idempotency Key, Reference Type, Integer Minor Units & Exchange Rate
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallet_transactions' AND column_name = 'idempotency_key') THEN
        ALTER TABLE wallet_transactions ADD COLUMN idempotency_key VARCHAR(128);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallet_transactions' AND column_name = 'reference_type') THEN
        ALTER TABLE wallet_transactions ADD COLUMN reference_type VARCHAR(64);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallet_transactions' AND column_name = 'amount_minor_units') THEN
        ALTER TABLE wallet_transactions ADD COLUMN amount_minor_units BIGINT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallet_transactions' AND column_name = 'exchange_rate') THEN
        ALTER TABLE wallet_transactions ADD COLUMN exchange_rate NUMERIC(14, 6) DEFAULT 1.0;
    END IF;
END $$;

-- 3. Unique Index for Strict Idempotency Protection
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_tx_idempotency ON wallet_transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wallet_tx_ref ON wallet_transactions(reference_type, reference_id);

