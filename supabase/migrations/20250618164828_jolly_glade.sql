/*
  # POS System Database Schema

  1. Core Tables
    - categories: Product categories with code and name
    - products: Complete product information with SKU, pricing, stock
    - customers: Customer management with loyalty and credit
    - sales: Sales transactions with payment details
    - sale_items: Individual items in each sale
    - expenses: Business expense tracking
    - cash_ledger: Petty cash management
    - stock_movements: Inventory movement tracking
    - loyalty_transactions: Customer loyalty point history
    - settings: System configuration

  2. Security
    - Enable RLS on all tables
    - Add policies for public access (no auth required initially)

  3. Features
    - Auto-generated SKUs with category prefixes
    - Comprehensive inventory tracking
    - Customer loyalty and BNPL system
    - Financial management
    - Configurable system settings
*/

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sku text NOT NULL UNIQUE,
  barcode text UNIQUE,
  category_id uuid REFERENCES categories(id),
  cost_price decimal(10,2) NOT NULL DEFAULT 0,
  sale_price decimal(10,2) NOT NULL DEFAULT 0,
  stock_quantity integer NOT NULL DEFAULT 0,
  min_stock_level integer DEFAULT 10,
  expiry_date date,
  batch_number text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  address text,
  credit_limit decimal(10,2) DEFAULT 0,
  current_balance decimal(10,2) DEFAULT 0,
  loyalty_points integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Sales table
CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  customer_id uuid REFERENCES customers(id),
  subtotal decimal(10,2) NOT NULL DEFAULT 0,
  discount_amount decimal(10,2) DEFAULT 0,
  tax_amount decimal(10,2) DEFAULT 0,
  total_amount decimal(10,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash',
  payment_status text DEFAULT 'paid',
  notes text,
  sale_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Sale items table
CREATE TABLE IF NOT EXISTS sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid REFERENCES sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  quantity integer NOT NULL,
  unit_price decimal(10,2) NOT NULL,
  discount_amount decimal(10,2) DEFAULT 0,
  total_price decimal(10,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  description text NOT NULL,
  amount decimal(10,2) NOT NULL,
  expense_date timestamptz DEFAULT now(),
  receipt_number text,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Cash ledger table
CREATE TABLE IF NOT EXISTS cash_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type text NOT NULL, -- 'opening', 'closing', 'expense', 'advance'
  amount decimal(10,2) NOT NULL,
  description text NOT NULL,
  reference_id uuid, -- Reference to sale or expense
  transaction_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Stock movements table
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id),
  movement_type text NOT NULL, -- 'in', 'out', 'adjustment', 'damage', 'expired'
  quantity integer NOT NULL,
  reference_type text, -- 'sale', 'purchase', 'adjustment', 'damage'
  reference_id uuid,
  notes text,
  movement_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Loyalty transactions table
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id),
  sale_id uuid REFERENCES sales(id),
  points_earned integer DEFAULT 0,
  points_redeemed integer DEFAULT 0,
  transaction_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  category text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (no auth required)
CREATE POLICY "Public access" ON categories FOR ALL USING (true);
CREATE POLICY "Public access" ON products FOR ALL USING (true);
CREATE POLICY "Public access" ON customers FOR ALL USING (true);
CREATE POLICY "Public access" ON sales FOR ALL USING (true);
CREATE POLICY "Public access" ON sale_items FOR ALL USING (true);
CREATE POLICY "Public access" ON expenses FOR ALL USING (true);
CREATE POLICY "Public access" ON cash_ledger FOR ALL USING (true);
CREATE POLICY "Public access" ON stock_movements FOR ALL USING (true);
CREATE POLICY "Public access" ON loyalty_transactions FOR ALL USING (true);
CREATE POLICY "Public access" ON settings FOR ALL USING (true);

-- Insert default categories
INSERT INTO categories (name, code, description) VALUES
  ('General', 'GEN', 'General products'),
  ('Electronics', 'ELE', 'Electronic items'),
  ('Clothing', 'CLO', 'Clothing and apparel'),
  ('Food', 'FOD', 'Food items'),
  ('Medicine', 'MED', 'Medical supplies'),
  ('Stationery', 'STA', 'Office and school supplies');

-- Insert default settings
INSERT INTO settings (key, value, category, description) VALUES
  ('store_name', 'My Store', 'store', 'Store name'),
  ('store_address', 'Main Street, Karachi, Pakistan', 'store', 'Store address'),
  ('store_phone', '+92-300-1234567', 'store', 'Store phone number'),
  ('store_ntn', '1234567-8', 'store', 'Store NTN number'),
  ('tax_rate', '17', 'tax', 'Default tax rate percentage'),
  ('currency_symbol', '₨', 'currency', 'Currency symbol'),
  ('receipt_footer', 'Thank you for shopping with us!', 'receipt', 'Receipt footer message'),
  ('low_stock_threshold', '10', 'inventory', 'Low stock alert threshold'),
  ('expiry_alert_days', '30', 'inventory', 'Days before expiry to show alert'),
  ('loyalty_points_rate', '1', 'loyalty', 'Points earned per PKR spent'),
  ('enable_fbr', 'false', 'receipt', 'Enable FBR integration on receipts');

-- Insert default walk-in customer
INSERT INTO customers (name, phone, address) VALUES
  ('Walk-in Customer', '', 'N/A');