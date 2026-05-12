ALTER TABLE users
  ADD COLUMN IF NOT EXISTS gds_provider TEXT NOT NULL DEFAULT 'auto'
    CHECK (gds_provider IN ('auto', 'kiwi', 'vietjet', 'airlabs'));
