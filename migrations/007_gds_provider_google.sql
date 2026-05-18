ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_gds_provider_check;

ALTER TABLE users
  ADD CONSTRAINT users_gds_provider_check
    CHECK (gds_provider IN ('auto', 'kiwi', 'vietjet', 'airlabs', 'google'));
