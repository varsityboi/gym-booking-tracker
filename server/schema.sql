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