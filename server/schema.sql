CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS classes (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  capacity INT NOT NULL CHECK (capacity > 0),
  booked INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (booked >= 0 AND booked <= capacity)
);

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  class_id INT NOT NULL REFERENCES classes(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_booking
  ON bookings (user_id, class_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_classes_starts_at ON classes (starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_class ON bookings (class_id);
CREATE TABLE IF NOT EXISTS booking_events (
  id SERIAL PRIMARY KEY,
  booking_id INT NOT NULL REFERENCES bookings(id),
  user_id INT NOT NULL REFERENCES users(id),
  class_id INT NOT NULL REFERENCES classes(id),
  action TEXT NOT NULL CHECK (action IN ('booked', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Shared by the append-only tables (booking_events, meal_item_events).
CREATE OR REPLACE FUNCTION block_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER booking_events_no_change
  BEFORE UPDATE OR DELETE ON booking_events
  FOR EACH ROW EXECUTE FUNCTION block_changes();
CREATE TABLE IF NOT EXISTS foods (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  calories_per_100g NUMERIC(7,2) NOT NULL CHECK (calories_per_100g >= 0),
  protein_per_100g NUMERIC(6,2) NOT NULL CHECK (protein_per_100g >= 0),
  fat_per_100g NUMERIC(6,2) NOT NULL CHECK (fat_per_100g >= 0),
  carbs_per_100g NUMERIC(6,2) NOT NULL CHECK (carbs_per_100g >= 0)
);

CREATE TABLE IF NOT EXISTS meals (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  eaten_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meals_user_eaten ON meals (user_id, eaten_at);

CREATE TABLE IF NOT EXISTS meal_items (
  id SERIAL PRIMARY KEY,
  meal_id INT NOT NULL REFERENCES meals(id),
  food_id INT NOT NULL REFERENCES foods(id),
  grams NUMERIC(7,2) NOT NULL CHECK (grams > 0 AND grams <= 5000)
);
CREATE INDEX IF NOT EXISTS idx_meal_items_meal ON meal_items (meal_id);

-- A meal item is either a row from foods (food_id) or an AI-estimated food
-- that isn't in the table (custom_name + est_* values per 100 g).
ALTER TABLE meal_items ALTER COLUMN food_id DROP NOT NULL;
ALTER TABLE meal_items
  ADD COLUMN IF NOT EXISTS custom_name TEXT,
  ADD COLUMN IF NOT EXISTS est_calories_per_100g NUMERIC(7,2) CHECK (est_calories_per_100g >= 0),
  ADD COLUMN IF NOT EXISTS est_protein_per_100g NUMERIC(6,2) CHECK (est_protein_per_100g >= 0),
  ADD COLUMN IF NOT EXISTS est_fat_per_100g NUMERIC(6,2) CHECK (est_fat_per_100g >= 0),
  ADD COLUMN IF NOT EXISTS est_carbs_per_100g NUMERIC(6,2) CHECK (est_carbs_per_100g >= 0);
ALTER TABLE meal_items DROP CONSTRAINT IF EXISTS meal_items_food_or_estimate;
ALTER TABLE meal_items ADD CONSTRAINT meal_items_food_or_estimate CHECK (
  (food_id IS NOT NULL
    AND custom_name IS NULL
    AND est_calories_per_100g IS NULL AND est_protein_per_100g IS NULL
    AND est_fat_per_100g IS NULL AND est_carbs_per_100g IS NULL)
  OR
  (food_id IS NULL
    AND custom_name IS NOT NULL
    AND est_calories_per_100g IS NOT NULL AND est_protein_per_100g IS NOT NULL
    AND est_fat_per_100g IS NOT NULL AND est_carbs_per_100g IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS water_logs (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  ml INT NOT NULL CHECK (ml > 0 AND ml <= 2000),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_water_user_logged ON water_logs (user_id, logged_at);

CREATE TABLE IF NOT EXISTS user_targets (
  user_id INT PRIMARY KEY REFERENCES users(id),
  calories INT NOT NULL CHECK (calories > 0),
  protein_g INT NOT NULL CHECK (protein_g >= 0),
  fat_g INT NOT NULL CHECK (fat_g >= 0),
  carbs_g INT NOT NULL CHECK (carbs_g >= 0),
  water_ml INT NOT NULL CHECK (water_ml > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_foods_name_trgm ON foods USING gin (name gin_trgm_ops);

-- Class waitlist. One 'waiting' entry per user and class; the oldest waiting
-- entry (created_at, id) is promoted when a place frees up.
CREATE TABLE IF NOT EXISTS waitlist (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  class_id INT NOT NULL REFERENCES classes(id),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'promoted', 'left')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_waiting_entry
  ON waitlist (user_id, class_id) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_waitlist_class_status_created
  ON waitlist (class_id, status, created_at);

-- Waitlist events in booking_events. 'waitlisted' and 'left_waitlist' have no
-- booking, so booking_id becomes nullable and waitlist_id points at the entry
-- instead ('promoted' sets both). Every event refers to at least one of them.
-- ALTER TABLE doesn't fire the append-only row trigger, which stays as is.
ALTER TABLE booking_events ADD COLUMN IF NOT EXISTS waitlist_id INT REFERENCES waitlist(id);
ALTER TABLE booking_events ALTER COLUMN booking_id DROP NOT NULL;
-- The full list of actions lives here (class cancellation below adds
-- 'class_cancelled'); keep it in one place so a re-run never re-adds a shorter
-- list that existing rows would fail.
ALTER TABLE booking_events DROP CONSTRAINT IF EXISTS booking_events_action_check;
ALTER TABLE booking_events ADD CONSTRAINT booking_events_action_check CHECK (
  action IN ('booked', 'cancelled', 'waitlisted', 'promoted', 'left_waitlist', 'class_cancelled')
);
ALTER TABLE booking_events DROP CONSTRAINT IF EXISTS booking_events_booking_or_waitlist;
ALTER TABLE booking_events ADD CONSTRAINT booking_events_booking_or_waitlist CHECK (
  booking_id IS NOT NULL OR waitlist_id IS NOT NULL
);

-- Admin class cancellation. A cancelled class keeps its row (bookings and
-- events reference it); 'class_cancelled' events are allowed above.
ALTER TABLE classes ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'scheduled';
ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_status_check;
ALTER TABLE classes ADD CONSTRAINT classes_status_check CHECK (status IN ('scheduled', 'cancelled'));
ALTER TABLE classes ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- Meal history and versioned edits. Items are never deleted: deleted_at marks
-- them removed, version goes up on every change, and meal_item_events keeps
-- every state (snapshots of the item row before and after the change).
ALTER TABLE meal_items ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
ALTER TABLE meal_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS meal_item_events (
  id SERIAL PRIMARY KEY,
  meal_item_id INT NOT NULL REFERENCES meal_items(id),
  meal_id INT NOT NULL REFERENCES meals(id),
  user_id INT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('created', 'edited', 'removed')),
  before JSONB,
  after JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT meal_item_events_snapshots CHECK (
    (action = 'created' AND before IS NULL AND after IS NOT NULL)
    OR (action = 'edited' AND before IS NOT NULL AND after IS NOT NULL)
    OR (action = 'removed' AND before IS NOT NULL AND after IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_meal_item_events_meal ON meal_item_events (meal_id, id);

CREATE OR REPLACE TRIGGER meal_item_events_no_change
  BEFORE UPDATE OR DELETE ON meal_item_events
  FOR EACH ROW EXECUTE FUNCTION block_changes();

-- One row per photo analysis (successful or not), for the daily photo limit.
CREATE TABLE IF NOT EXISTS photo_analyses (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  vision_provider TEXT,
  duration_ms INT NOT NULL CHECK (duration_ms >= 0),
  ok BOOLEAN NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photo_analyses_user_created ON photo_analyses (user_id, created_at);
