-- The shop's orders database (PostgreSQL).
CREATE TABLE customers (
  id uuid PRIMARY KEY,
  email varchar(255) NOT NULL UNIQUE,
  name text NOT NULL
);

CREATE TABLE orders (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  placed_at timestamptz NOT NULL DEFAULT now(),
  total_cents integer NOT NULL CHECK (total_cents >= 0)
);

CREATE TABLE order_items (
  order_id uuid NOT NULL,
  product_sku varchar(32) NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  PRIMARY KEY (order_id, product_sku),
  FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
);

CREATE INDEX orders_by_customer ON orders (customer_id);

CREATE TRIGGER orders_touch BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
