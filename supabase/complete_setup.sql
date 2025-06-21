-- Complete POS System Database Setup
-- Run this script in your new Supabase project SQL editor

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create store_info table
CREATE TABLE store_info (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_name VARCHAR(100) NOT NULL DEFAULT 'My Store',
  address TEXT,
  phone VARCHAR(20),
  email VARCHAR(100),
  ntn VARCHAR(50),
  strn VARCHAR(50),
  fbr_enabled BOOLEAN DEFAULT false,
  pos_id VARCHAR(50),
  receipt_footer TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create categories table
CREATE TABLE categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create products table
CREATE TABLE products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  sku VARCHAR(50) UNIQUE NOT NULL,
  barcode VARCHAR(50) UNIQUE,
  category_id UUID REFERENCES categories(id),
  cost_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  sale_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  min_stock_level INTEGER NOT NULL DEFAULT 10,
  expiry_date DATE,
  batch_number VARCHAR(100),
  supplier_id UUID,
  tax_rate DECIMAL(5,2) NOT NULL DEFAULT 17.00,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create customers table
CREATE TABLE customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(100),
  address TEXT,
  credit_limit DECIMAL(12,2) DEFAULT 0,
  current_balance DECIMAL(12,2) DEFAULT 0,
  loyalty_points INTEGER DEFAULT 0,
  total_outstanding_dues DECIMAL(12,2) DEFAULT 0,
  available_credit DECIMAL(12,2) DEFAULT 0,
  gender VARCHAR(10),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create payment_details table
CREATE TABLE payment_details (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
  payment_provider VARCHAR(50) NOT NULL,
  account_number VARCHAR(100) NOT NULL,
  transaction_id VARCHAR(100),
  account_holder_name VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create sales table
CREATE TABLE sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  receipt_number VARCHAR(50) UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id),
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(50) NOT NULL,
  payment_status VARCHAR(50) NOT NULL DEFAULT 'paid',
  cashier_name VARCHAR(100),
  receipt_printed BOOLEAN DEFAULT false,
  receipt_printed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  sale_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  return_status VARCHAR(50) DEFAULT 'none',
  payment_details_id UUID REFERENCES payment_details(id),
  digital_payment_provider VARCHAR(50),
  digital_payment_account VARCHAR(100)
);

-- Create sale_items table
CREATE TABLE sale_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_price DECIMAL(10,2) NOT NULL,
  returned_quantity INTEGER DEFAULT 0,
  is_returned BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create bnpl_transactions table
CREATE TABLE bnpl_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id),
  original_amount DECIMAL(12,2) NOT NULL,
  amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
  amount_due DECIMAL(12,2) NOT NULL,
  due_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create loyalty_rules table
CREATE TABLE loyalty_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_name VARCHAR(100) NOT NULL,
  points_per_currency DECIMAL(5,2) NOT NULL DEFAULT 1.00,
  min_purchase_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create expenses table
CREATE TABLE expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  expense_date DATE NOT NULL,
  receipt_number VARCHAR(50),
  notes TEXT,
  expense_cash_ledger_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create settings table
CREATE TABLE settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  category VARCHAR(50) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create suppliers table
CREATE TABLE suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  contact_person VARCHAR(100),
  phone VARCHAR(20),
  email VARCHAR(100),
  address TEXT,
  credit_terms INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create purchase_orders table
CREATE TABLE purchase_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  po_number VARCHAR(50) UNIQUE NOT NULL,
  supplier_id UUID REFERENCES suppliers(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  order_date DATE NOT NULL,
  expected_date DATE,
  received_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create purchase_items table
CREATE TABLE purchase_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_cost DECIMAL(10,2) NOT NULL,
  total_cost DECIMAL(10,2) NOT NULL,
  received_quantity INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create stock_movements table
CREATE TABLE stock_movements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES products(id),
  movement_type VARCHAR(20) NOT NULL,
  quantity INTEGER NOT NULL,
  reference_type VARCHAR(50),
  reference_id UUID,
  notes TEXT,
  movement_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create inventory_receipts table
CREATE TABLE inventory_receipts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES products(id),
  purchase_order_id UUID REFERENCES purchase_orders(id),
  quantity INTEGER NOT NULL,
  unit_cost DECIMAL(10,2) NOT NULL,
  supplier_id UUID REFERENCES suppliers(id),
  batch_number VARCHAR(100),
  expiry_date DATE,
  notes TEXT,
  received_by VARCHAR(100) NOT NULL,
  received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  new_average_cost DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create damage_reports table
CREATE TABLE damage_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES products(id),
  quantity INTEGER NOT NULL,
  reason TEXT NOT NULL,
  cost_impact DECIMAL(10,2) NOT NULL,
  recorded_by VARCHAR(100) NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  approved_by VARCHAR(100),
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create profit_analysis table
CREATE TABLE profit_analysis (
  product_id UUID REFERENCES products(id) PRIMARY KEY,
  stock_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  average_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  selling_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  profit_per_unit DECIMAL(10,2) NOT NULL DEFAULT 0,
  profit_margin DECIMAL(5,2) NOT NULL DEFAULT 0,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  last_calculated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create returns table
CREATE TABLE returns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID REFERENCES sales(id),
  customer_id UUID REFERENCES customers(id),
  return_date DATE NOT NULL,
  return_reason TEXT NOT NULL,
  return_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  refund_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  refund_method VARCHAR(50),
  processed_by VARCHAR(100) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create return_items table
CREATE TABLE return_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  return_id UUID REFERENCES returns(id) ON DELETE CASCADE,
  sale_item_id UUID REFERENCES sale_items(id),
  product_id UUID REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  refund_price DECIMAL(10,2) NOT NULL,
  condition VARCHAR(20) NOT NULL DEFAULT 'good',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create refund_transactions table
CREATE TABLE refund_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  return_id UUID REFERENCES returns(id),
  sale_id UUID REFERENCES sales(id),
  customer_id UUID REFERENCES customers(id),
  amount DECIMAL(12,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  transaction_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_sales_customer ON sales(customer_id);
CREATE INDEX idx_sales_date ON sales(sale_date);
CREATE INDEX idx_sales_payment_method ON sales(payment_method);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);
CREATE INDEX idx_bnpl_transactions_customer ON bnpl_transactions(customer_id);
CREATE INDEX idx_bnpl_transactions_status ON bnpl_transactions(status);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_date ON stock_movements(movement_date);
CREATE INDEX idx_payment_details_sale_id ON payment_details(sale_id);
CREATE INDEX idx_payment_details_provider ON payment_details(payment_provider);

-- Create functions

-- Function to update product stock
CREATE OR REPLACE FUNCTION update_product_stock(product_id UUID, quantity_sold INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE products 
  SET stock_quantity = stock_quantity - quantity_sold,
      updated_at = NOW()
  WHERE id = product_id;
END;
$$ LANGUAGE plpgsql;

-- Function to generate receipt number
CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS VARCHAR AS $$
DECLARE
  next_number INTEGER;
  receipt_number VARCHAR(50);
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(s.receipt_number FROM 'RCP-(\d+)') AS INTEGER)), 0) + 1
  INTO next_number
  FROM sales s;
  
  receipt_number := 'RCP-' || LPAD(next_number::TEXT, 6, '0');
  RETURN receipt_number;
END;
$$ LANGUAGE plpgsql;

-- Function to create BNPL transaction
CREATE OR REPLACE FUNCTION create_bnpl_transaction(p_sale_id UUID, p_customer_id UUID, p_amount DECIMAL)
RETURNS void AS $$
BEGIN
  INSERT INTO bnpl_transactions (sale_id, customer_id, original_amount, amount_due, due_date, status)
  VALUES (p_sale_id, p_customer_id, p_amount, p_amount, CURRENT_DATE + INTERVAL '30 days', 'pending');
  
  -- Update customer balance
  UPDATE customers 
  SET current_balance = current_balance + p_amount,
      total_outstanding_dues = total_outstanding_dues + p_amount,
      available_credit = credit_limit - (current_balance + p_amount),
      updated_at = NOW()
  WHERE id = p_customer_id;
END;
$$ LANGUAGE plpgsql;

-- Function to award loyalty points
CREATE OR REPLACE FUNCTION award_loyalty_points(p_customer_id UUID, p_purchase_amount DECIMAL)
RETURNS void AS $$
DECLARE
  points_to_award INTEGER;
  rule_points DECIMAL;
BEGIN
  -- Get points per currency from active loyalty rule
  SELECT points_per_currency INTO rule_points
  FROM loyalty_rules
  WHERE is_active = true
  ORDER BY min_purchase_amount DESC
  LIMIT 1;
  
  IF rule_points IS NULL THEN
    rule_points := 1.0; -- Default 1 point per currency
  END IF;
  
  points_to_award := FLOOR(p_purchase_amount * rule_points);
  
  -- Award points to customer
  UPDATE customers 
  SET loyalty_points = loyalty_points + points_to_award,
      updated_at = NOW()
  WHERE id = p_customer_id;
END;
$$ LANGUAGE plpgsql;

-- Function to mark receipt as printed
CREATE OR REPLACE FUNCTION mark_receipt_printed(p_sale_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE sales 
  SET receipt_printed = true,
      receipt_printed_at = NOW()
  WHERE id = p_sale_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get receipt history
CREATE OR REPLACE FUNCTION get_receipt_history(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_customer_filter VARCHAR DEFAULT NULL,
  p_payment_method_filter VARCHAR DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  receipt_number VARCHAR,
  invoice_number VARCHAR,
  sale_date TIMESTAMP WITH TIME ZONE,
  customer_name VARCHAR,
  total_amount DECIMAL,
  payment_method VARCHAR,
  payment_status VARCHAR,
  cashier_name VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.receipt_number,
    s.invoice_number,
    s.sale_date,
    c.name as customer_name,
    s.total_amount,
    s.payment_method,
    s.payment_status,
    s.cashier_name
  FROM sales s
  LEFT JOIN customers c ON s.customer_id = c.id
  WHERE (p_start_date IS NULL OR s.sale_date >= p_start_date)
    AND (p_end_date IS NULL OR s.sale_date <= p_end_date)
    AND (p_customer_filter IS NULL OR c.name ILIKE '%' || p_customer_filter || '%')
    AND (p_payment_method_filter IS NULL OR s.payment_method = p_payment_method_filter)
  ORDER BY s.sale_date DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get daily receipt stats
CREATE OR REPLACE FUNCTION get_daily_receipt_stats(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
  total_sales INTEGER,
  total_amount DECIMAL,
  cash_amount DECIMAL,
  card_amount DECIMAL,
  bnpl_amount DECIMAL,
  digital_amount DECIMAL,
  avg_sale_amount DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER as total_sales,
    COALESCE(SUM(total_amount), 0) as total_amount,
    COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0) as cash_amount,
    COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END), 0) as card_amount,
    COALESCE(SUM(CASE WHEN payment_method = 'bnpl' THEN total_amount ELSE 0 END), 0) as bnpl_amount,
    COALESCE(SUM(CASE WHEN payment_method IN ('jazzcash', 'easypaisa', 'sadapay', 'nayapay') THEN total_amount ELSE 0 END), 0) as digital_amount,
    COALESCE(AVG(total_amount), 0) as avg_sale_amount
  FROM sales
  WHERE DATE(sale_date) = p_date;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to tables with updated_at
CREATE TRIGGER update_store_info_updated_at BEFORE UPDATE ON store_info FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payment_details_updated_at BEFORE UPDATE ON payment_details FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bnpl_transactions_updated_at BEFORE UPDATE ON bnpl_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_loyalty_rules_updated_at BEFORE UPDATE ON loyalty_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_returns_updated_at BEFORE UPDATE ON returns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data

-- Insert default store info
INSERT INTO store_info (store_name, address, phone, email, ntn, strn) 
VALUES ('My POS Store', '123 Main Street, City', '+92-300-1234567', 'info@mystore.com', '1234567-8', '12-34-5678901-234');

-- Insert default categories
INSERT INTO categories (name, code, description) VALUES
('Electronics', 'ELEC', 'Electronic devices and accessories'),
('Clothing', 'CLOTH', 'Apparel and fashion items'),
('Food & Beverages', 'FOOD', 'Food and drink products'),
('Home & Garden', 'HOME', 'Home improvement and garden items'),
('Books', 'BOOKS', 'Books and publications');

-- Insert default loyalty rule
INSERT INTO loyalty_rules (rule_name, points_per_currency, min_purchase_amount) 
VALUES ('Standard Loyalty', 1.0, 0);

-- Insert default settings
INSERT INTO settings (key, value, category, description) VALUES
('tax_rate', '17', 'general', 'Default tax rate percentage'),
('currency', 'PKR', 'general', 'Default currency'),
('receipt_footer', 'Thank you for your business!', 'receipt', 'Default receipt footer text'),
('low_stock_threshold', '10', 'inventory', 'Default low stock threshold');

-- Insert sample customers
INSERT INTO customers (name, phone, email, address, credit_limit, gender) VALUES
('John Doe', '+92-300-1111111', 'john@example.com', '123 Customer St', 50000, 'male'),
('Jane Smith', '+92-300-2222222', 'jane@example.com', '456 Customer Ave', 30000, 'female'),
('Walk-in Customer', NULL, NULL, NULL, 0, NULL);

-- Insert sample products
INSERT INTO products (name, sku, barcode, category_id, cost_price, sale_price, stock_quantity, min_stock_level, tax_rate) 
SELECT 
  'Sample Product ' || i,
  'SKU' || LPAD(i::TEXT, 3, '0'),
  '123456789' || LPAD(i::TEXT, 3, '0'),
  (SELECT id FROM categories WHERE code = 'ELEC' LIMIT 1),
  100 + (i * 10),
  150 + (i * 15),
  50 + (i * 5),
  10,
  17
FROM generate_series(1, 10) i;

-- Grant necessary permissions (adjust based on your RLS policies)
ALTER TABLE store_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE bnpl_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE damage_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE profit_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_transactions ENABLE ROW LEVEL SECURITY;

-- Create basic RLS policies (you may want to customize these)
CREATE POLICY "Enable read access for all users" ON store_info FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON categories FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON products FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON customers FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON sales FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON sale_items FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON payment_details FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON bnpl_transactions FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON loyalty_rules FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON expenses FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON settings FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON suppliers FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON purchase_orders FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON purchase_items FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON stock_movements FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON inventory_receipts FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON damage_reports FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON profit_analysis FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON returns FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON return_items FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON refund_transactions FOR SELECT USING (true);

-- Enable insert/update/delete for authenticated users (customize as needed)
CREATE POLICY "Enable insert for authenticated users" ON store_info FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON store_info FOR UPDATE USING (true);
CREATE POLICY "Enable delete for authenticated users" ON store_info FOR DELETE USING (true);

-- Repeat for other tables as needed...

COMMIT; 