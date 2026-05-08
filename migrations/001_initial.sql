-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users (populated by NextAuth + Google OAuth)
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  name        TEXT,
  google_id   TEXT UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trips
CREATE TABLE IF NOT EXISTS trips (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title                     TEXT NOT NULL,
  origin_airport            TEXT NOT NULL,            -- IATA code e.g. 'HAN'
  destination_city          TEXT,
  destination_country       TEXT,
  start_date                DATE NOT NULL,
  end_date                  DATE NOT NULL,
  flexibility_days          INT NOT NULL DEFAULT 0,
  preference_cheapest       BOOLEAN NOT NULL DEFAULT TRUE,
  preference_flight_time    TEXT NOT NULL DEFAULT 'any' CHECK (preference_flight_time IN ('day', 'night', 'any')),
  trip_type                 TEXT NOT NULL DEFAULT 'round_trip' CHECK (trip_type IN ('round_trip', 'one_way')),
  status                    TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  last_flight_refresh_at    TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trips_user_id_idx ON trips(user_id);
CREATE INDEX IF NOT EXISTS trips_status_idx ON trips(status);

-- SG1 raw options (AI-generated trip concept options)
CREATE TABLE IF NOT EXISTS trip_raw_options (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id            UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  llm_raw_plan_json  JSONB NOT NULL,
  selected           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trip_raw_options_trip_id_idx ON trip_raw_options(trip_id);

-- SG2 itinerary versions (self-to-self chain)
CREATE TABLE IF NOT EXISTS itineraries (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id                   UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  version                   INT NOT NULL,
  parent_version_id         UUID REFERENCES itineraries(id),
  status                    TEXT NOT NULL DEFAULT 'current' CHECK (status IN ('current', 'superseded')),
  itinerary_json            JSONB NOT NULL,
  snapshot_flight_data_json JSONB NOT NULL,
  cheapest_total_price      NUMERIC(10, 2) NOT NULL,
  currency                  TEXT NOT NULL DEFAULT 'USD',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(trip_id, version)
);

CREATE INDEX IF NOT EXISTS itineraries_trip_id_status_idx ON itineraries(trip_id, status);

-- Flight data cache (per search params hash, TTL enforced by application)
CREATE TABLE IF NOT EXISTS flights_cache (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id       UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL DEFAULT 'kiwi_tequila',
  search_hash   TEXT NOT NULL,
  request_json  JSONB NOT NULL,
  response_json JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(trip_id, search_hash)
);

-- Trip watchers (owner + invited viewers)
CREATE TABLE IF NOT EXISTS trip_watchers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id              UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  email                TEXT NOT NULL,
  role                 TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'viewer')),
  invite_token         UUID NOT NULL DEFAULT gen_random_uuid(),
  invite_accepted_at   TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(trip_id, email)
);

CREATE INDEX IF NOT EXISTS trip_watchers_trip_id_idx ON trip_watchers(trip_id);
CREATE UNIQUE INDEX IF NOT EXISTS trip_watchers_invite_token_idx ON trip_watchers(invite_token);

-- Notifications (queued, sent via SES)
CREATE TABLE IF NOT EXISTS notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id         UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  watcher_email   TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('price_change', 'new_itinerary_version', 'invite')),
  payload_json    JSONB NOT NULL DEFAULT '{}',
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_unsent_idx ON notifications(sent_at) WHERE sent_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_trip_id_idx ON notifications(trip_id);

-- Auto-update updated_at on trips
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trips_updated_at
  BEFORE UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
