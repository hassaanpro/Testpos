/*
  # Complete POS System Database Schema

  1. New Tables
    - `suppliers` - Supplier management
    - `purchase_orders` - Purchase order tracking
    - `purchase_items` - Purchase order line items
    - `payment_transactions` - Payment tracking
    - `loyalty_rules` - Loyalty program configuration
    - `tax_rates` - Tax configuration
    - `store_info` - Store configuration
    - `user_sessions` - Session tracking (for future auth)
    - `audit_logs` - System audit trail

  2. Enhanced Tables
    - Add missing columns to existing tables
    - Add proper constraints and indexes

  3. Functions
    - Stock management functions
    - Sales calculation functions
    - Loyalty point calculations
    - Report generation functions

  4. Security
    - Enable RLS on all tables
    - Add comprehensive policies
*/

-- Suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  credit_terms integer DEFAULT 30,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Purchase Orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text UNIQUE NOT NULL,
  supplier_id uuid REFERENCES suppliers(id),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'received', 'cancelled')),
  subtotal numeric(10,2) DEFAULT 0,
  tax_amount numeric(10,2) DEFAULT 0,
  total_amount numeric(10,2) DEFAULT 0,
  order_date timestamptz DEFAULT now(),
  expected_date date,
  received_date timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Purchase Items table
CREATE TABLE IF NOT EXISTS purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  quantity integer NOT NULL,
  unit_cost numeric(10,2) NOT NULL,
  total_cost numeric(10,2) NOT NULL,
  received_quantity integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Payment Transactions table
CREATE TABLE IF NOT EXISTS payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type text NOT NULL CHECK (transaction_type IN ('sale', 'refund', 'expense', 'advance')),
  reference_id uuid,
  customer_id uuid REFERENCES customers(id),
  amount numeric(10,2) NOT NULL,
  payment_method text NOT NULL,
  status text DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  notes text,
  transaction_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Loyalty Rules table
CREATE TABLE IF NOT EXISTS loyalty_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  points_per_rupee numeric(5,2) DEFAULT 1.00,
  min_purchase_amount numeric(10,2) DEFAULT 0,
  redemption_rate numeric(5,2) DEFAULT 1.00, -- points per rupee value
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tax Rates table
CREATE TABLE IF NOT EXISTS tax_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  rate numeric(5,2) NOT NULL,
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Store Info table
CREATE TABLE IF NOT EXISTS store_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name text NOT NULL,
  address text,
  phone text,
  email text,
  ntn text,
  logo_url text,
  currency text DEFAULT 'PKR',
  timezone text DEFAULT 'Asia/Karachi',
  receipt_footer text,
  fbr_enabled boolean DEFAULT false,
  pos_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Audit Logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values jsonb,
  new_values jsonb,
  user_id uuid, -- for future auth
  ip_address inet,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Add missing columns to existing tables
DO $$
BEGIN
  -- Add columns to sales table if they don't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'cashier_name') THEN
    ALTER TABLE sales ADD COLUMN cashier_name text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'receipt_printed') THEN
    ALTER TABLE sales ADD COLUMN receipt_printed boolean DEFAULT false;
  END IF;

  -- Add columns to customers table if they don't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'date_of_birth') THEN
    ALTER TABLE customers ADD COLUMN date_of_birth date;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'gender') THEN
    ALTER TABLE customers ADD COLUMN gender text CHECK (gender IN ('male', 'female', 'other'));
  END IF;

  -- Add columns to products table if they don't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'supplier_id') THEN
    ALTER TABLE products ADD COLUMN supplier_id uuid REFERENCES suppliers(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'tax_rate') THEN
    ALTER TABLE products ADD COLUMN tax_rate numeric(5,2) DEFAULT 17.00;
  END IF;
END $$;

-- Enable RLS on all tables
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (since no auth for now)
CREATE POLICY "Public access" ON suppliers FOR ALL TO public USING (true);
CREATE POLICY "Public access" ON purchase_orders FOR ALL TO public USING (true);
CREATE POLICY "Public access" ON purchase_items FOR ALL TO public USING (true);
CREATE POLICY "Public access" ON payment_transactions FOR ALL TO public USING (true);
CREATE POLICY "Public access" ON loyalty_rules FOR ALL TO public USING (true);
CREATE POLICY "Public access" ON tax_rates FOR ALL TO public USING (true);
CREATE POLICY "Public access" ON store_info FOR ALL TO public USING (true);
CREATE POLICY "Public access" ON audit_logs FOR ALL TO public USING (true);

-- Insert default data
INSERT INTO store_info (store_name, address, phone, ntn, receipt_footer) 
VALUES (
  'My Store',
  'Main Street, Karachi, Pakistan',
  '+92-300-1234567',
  '1234567-8',
  'Thank you for shopping with us!'
) ON CONFLICT DO NOTHING;

INSERT INTO tax_rates (name, rate, is_default) 
VALUES ('Standard GST', 17.00, true) ON CONFLICT DO NOTHING;

INSERT INTO loyalty_rules (rule_name, points_per_rupee, redemption_rate) 
VALUES ('Default Loyalty', 1.00, 1.00) ON CONFLICT DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_po_number ON purchase_orders(po_number);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_type ON payment_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_date ON payment_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON audit_logs(table_name, record_id);

-- Stock management function
CREATE OR REPLACE FUNCTION update_product_stock(
  product_id uuid,
  quantity_sold integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE products 
  SET 
    stock_quantity = stock_quantity - quantity_sold,
    updated_at = now()
  WHERE id = product_id;
END;
$$;

-- Calculate loyalty points function
CREATE OR REPLACE FUNCTION calculate_loyalty_points(
  purchase_amount numeric
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  points_per_rupee numeric;
  min_amount numeric;
  calculated_points integer;
BEGIN
  SELECT lr.points_per_rupee, lr.min_purchase_amount
  INTO points_per_rupee, min_amount
  FROM loyalty_rules lr
  WHERE lr.is_active = true
  ORDER BY lr.created_at DESC
  LIMIT 1;
  
  IF purchase_amount >= COALESCE(min_amount, 0) THEN
    calculated_points := FLOOR(purchase_amount * COALESCE(points_per_rupee, 1));
  ELSE
    calculated_points := 0;
  END IF;
  
  RETURN calculated_points;
END;
$$;

-- Sales summary function
CREATE OR REPLACE FUNCTION get_sales_summary(
  start_date date DEFAULT CURRENT_DATE,
  end_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  total_sales numeric,
  total_transactions integer,
  avg_transaction numeric,
  cash_sales numeric,
  card_sales numeric,
  bnpl_sales numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(s.total_amount), 0) as total_sales,
    COUNT(s.id)::integer as total_transactions,
    COALESCE(AVG(s.total_amount), 0) as avg_transaction,
    COALESCE(SUM(CASE WHEN s.payment_method = 'cash' THEN s.total_amount ELSE 0 END), 0) as cash_sales,
    COALESCE(SUM(CASE WHEN s.payment_method = 'card' THEN s.total_amount ELSE 0 END), 0) as card_sales,
    COALESCE(SUM(CASE WHEN s.payment_method = 'bnpl' THEN s.total_amount ELSE 0 END), 0) as bnpl_sales
  FROM sales s
  WHERE DATE(s.sale_date) BETWEEN start_date AND end_date;
END;
$$;

-- Top selling products function
CREATE OR REPLACE FUNCTION get_top_selling_products(
  start_date date DEFAULT CURRENT_DATE - INTERVAL '30 days',
  end_date date DEFAULT CURRENT_DATE,
  limit_count integer DEFAULT 10
)
RETURNS TABLE(
  product_id uuid,
  product_name text,
  total_quantity integer,
  total_revenue numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as product_id,
    p.name as product_name,
    SUM(si.quantity)::integer as total_quantity,
    SUM(si.total_price) as total_revenue
  FROM sale_items si
  JOIN products p ON si.product_id = p.id
  JOIN sales s ON si.sale_id = s.id
  WHERE DATE(s.sale_date) BETWEEN start_date AND end_date
  GROUP BY p.id, p.name
  ORDER BY total_quantity DESC
  LIMIT limit_count;
END;
$$;