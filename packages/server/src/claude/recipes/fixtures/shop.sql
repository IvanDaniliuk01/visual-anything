-- Database: orders (PostgreSQL).
CREATE SCHEMA shop;

CREATE TYPE shop.order_status AS ENUM ('placed', 'paid', 'shipped');

CREATE TABLE shop.customers (
  id uuid PRIMARY KEY,
  email varchar(255) NOT NULL UNIQUE,
  name text NOT NULL
);

CREATE TABLE shop.orders (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES shop.customers (id) ON DELETE CASCADE,
  status shop.order_status NOT NULL DEFAULT 'placed',
  placed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  total_cents integer NOT NULL CHECK (total_cents >= 0)
);

CREATE TABLE shop.order_items (
  order_id uuid NOT NULL,
  product_sku varchar(32) NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  PRIMARY KEY (order_id, product_sku),
  FOREIGN KEY (order_id) REFERENCES shop.orders (id) ON DELETE CASCADE
);

CREATE INDEX orders_by_customer ON shop.orders (customer_id);

CREATE VIEW shop.open_orders AS
  SELECT o.id, c.email, o.total_cents
  FROM shop.orders o JOIN shop.customers c ON c.id = o.customer_id
  WHERE o.status <> 'shipped';

CREATE FUNCTION shop.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_touch BEFORE UPDATE ON shop.orders
  FOR EACH ROW EXECUTE FUNCTION shop.touch_updated_at();
