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

CREATE OR REPLACE FUNCTION block_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'booking_events is append-only';
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