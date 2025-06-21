/*
  # Inventory Management System

  1. New Tables
    - `inventory_receipts` - Track all stock receipts with weighted average cost calculation
    - `damage_reports` - Manage product damage reporting and approval workflow  
    - `profit_analysis` - Store calculated profit metrics per product

  2. Enhanced Functions
    - Enhanced `update_product_stock_and_cost` function with inventory receipt creation
    - `approve_damage_report` - Handle damage approval and stock adjustment
    - `update_profit_analysis` - Calculate profit metrics
    - Automatic triggers for profit analysis updates

  3. Security
    - Enable RLS on all new tables
    - Add policies for public access (matching existing pattern)
    - Add performance indexes
*/

-- Create inventory_receipts table
CREATE TABLE IF NOT EXISTS inventory_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_cost numeric(10,2) NOT NULL CHECK (unit_cost >= 0),
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  batch_number text,
  expiry_date date,
  notes text,
  received_by text NOT NULL,
  received_at timestamp with time zone DEFAULT now(),
  new_average_cost numeric(10,2) NOT NULL CHECK (new_average_cost >= 0),
  created_at timestamp with time zone DEFAULT now()
);

-- Create damage_reports table
CREATE TABLE IF NOT EXISTS damage_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  reason text NOT NULL,
  cost_impact numeric(10,2) NOT NULL DEFAULT 0 CHECK (cost_impact >= 0),
  recorded_by text NOT NULL,
  recorded_at timestamp with time zone DEFAULT now(),
  notes text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  approved_by text,
  approved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- Create profit_analysis table
CREATE TABLE IF NOT EXISTS profit_analysis (
  product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  stock_value numeric(10,2) NOT NULL DEFAULT 0 CHECK (stock_value >= 0),
  average_cost numeric(10,2) NOT NULL DEFAULT 0 CHECK (average_cost >= 0),
  selling_price numeric(10,2) NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
  profit_per_unit numeric(10,2) NOT NULL DEFAULT 0,
  profit_margin numeric(5,2) NOT NULL DEFAULT 0,
  stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  last_calculated timestamp with time zone DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE inventory_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE damage_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE profit_analysis ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (matching existing pattern)
CREATE POLICY "Public access" ON inventory_receipts FOR ALL TO public USING (true);
CREATE POLICY "Public access" ON damage_reports FOR ALL TO public USING (true);
CREATE POLICY "Public access" ON profit_analysis FOR ALL TO public USING (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_inventory_receipts_product_id ON inventory_receipts(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_receipts_received_at ON inventory_receipts(received_at);
CREATE INDEX IF NOT EXISTS idx_inventory_receipts_purchase_order_id ON inventory_receipts(purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_damage_reports_product_id ON damage_reports(product_id);
CREATE INDEX IF NOT EXISTS idx_damage_reports_status ON damage_reports(status);
CREATE INDEX IF NOT EXISTS idx_damage_reports_recorded_at ON damage_reports(recorded_at);

-- Update the existing update_product_stock_and_cost function to create inventory receipt
CREATE OR REPLACE FUNCTION update_product_stock_and_cost(
  p_product_id uuid,
  p_new_quantity integer,
  p_new_unit_cost numeric(10,2),
  p_received_by text DEFAULT 'System',
  p_purchase_order_id uuid DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL,
  p_batch_number text DEFAULT NULL,
  p_expiry_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_stock integer;
  current_cost numeric(10,2);
  new_total_cost numeric(10,2);
  new_weighted_avg_cost numeric(10,2);
  total_quantity integer;
BEGIN
  -- Get current product data
  SELECT stock_quantity, cost_price 
  INTO current_stock, current_cost
  FROM products 
  WHERE id = p_product_id;
  
  -- Calculate new weighted average cost
  IF current_stock = 0 THEN
    -- If no existing stock, use new cost as the cost price
    new_weighted_avg_cost := p_new_unit_cost;
  ELSE
    -- Calculate weighted average
    new_total_cost := (current_stock * current_cost) + (p_new_quantity * p_new_unit_cost);
    total_quantity := current_stock + p_new_quantity;
    new_weighted_avg_cost := new_total_cost / total_quantity;
  END IF;
  
  -- Update product with new stock and weighted average cost
  UPDATE products 
  SET 
    stock_quantity = current_stock + p_new_quantity,
    cost_price = new_weighted_avg_cost,
    updated_at = now()
  WHERE id = p_product_id;
  
  -- Record stock movement
  INSERT INTO stock_movements (
    product_id,
    movement_type,
    quantity,
    reference_type,
    reference_id,
    notes
  ) VALUES (
    p_product_id,
    'in',
    p_new_quantity,
    'purchase',
    p_purchase_order_id,
    'Stock received - Cost: ' || p_new_unit_cost || ', New Avg Cost: ' || new_weighted_avg_cost
  );
  
  -- Create inventory receipt record
  INSERT INTO inventory_receipts (
    product_id,
    purchase_order_id,
    quantity,
    unit_cost,
    supplier_id,
    batch_number,
    expiry_date,
    notes,
    received_by,
    new_average_cost
  ) VALUES (
    p_product_id,
    p_purchase_order_id,
    p_new_quantity,
    p_new_unit_cost,
    p_supplier_id,
    p_batch_number,
    p_expiry_date,
    p_notes,
    p_received_by,
    new_weighted_avg_cost
  );
  
  -- Update or create profit analysis
  PERFORM update_profit_analysis(p_product_id);
END;
$$;

-- Function to approve damage report and adjust stock
CREATE OR REPLACE FUNCTION approve_damage_report(
  p_damage_report_id uuid,
  p_approved_by_user text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  damage_record RECORD;
  current_stock integer;
BEGIN
  -- Get damage report details
  SELECT * INTO damage_record
  FROM damage_reports
  WHERE id = p_damage_report_id AND status = 'PENDING';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Damage report not found or already processed';
  END IF;
  
  -- Get current stock
  SELECT stock_quantity INTO current_stock
  FROM products
  WHERE id = damage_record.product_id;
  
  -- Check if we have enough stock
  IF current_stock < damage_record.quantity THEN
    RAISE EXCEPTION 'Insufficient stock. Available: %, Required: %', current_stock, damage_record.quantity;
  END IF;
  
  -- Update damage report status
  UPDATE damage_reports
  SET 
    status = 'APPROVED',
    approved_by = p_approved_by_user,
    approved_at = now()
  WHERE id = p_damage_report_id;
  
  -- Reduce product stock
  UPDATE products
  SET 
    stock_quantity = stock_quantity - damage_record.quantity,
    updated_at = now()
  WHERE id = damage_record.product_id;
  
  -- Record stock movement
  INSERT INTO stock_movements (
    product_id,
    movement_type,
    quantity,
    reference_type,
    reference_id,
    notes
  ) VALUES (
    damage_record.product_id,
    'out',
    -damage_record.quantity,
    'damage',
    p_damage_report_id,
    'Stock damaged - Reason: ' || damage_record.reason
  );
  
  -- Update profit analysis
  PERFORM update_profit_analysis(damage_record.product_id);
END;
$$;

-- Function to reject damage report
CREATE OR REPLACE FUNCTION reject_damage_report(
  p_damage_report_id uuid,
  p_rejected_by_user text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update damage report status
  UPDATE damage_reports
  SET 
    status = 'REJECTED',
    approved_by = p_rejected_by_user,
    approved_at = now()
  WHERE id = p_damage_report_id AND status = 'PENDING';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Damage report not found or already processed';
  END IF;
END;
$$;

-- Function to calculate and update profit analysis for a product
CREATE OR REPLACE FUNCTION update_profit_analysis(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  product_record RECORD;
  calc_stock_value numeric(10,2);
  calc_profit_per_unit numeric(10,2);
  calc_profit_margin numeric(5,2);
BEGIN
  -- Get product details
  SELECT * INTO product_record
  FROM products
  WHERE id = p_product_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Calculate values
  calc_stock_value := product_record.stock_quantity * product_record.cost_price;
  calc_profit_per_unit := product_record.sale_price - product_record.cost_price;
  
  -- Calculate profit margin percentage
  IF product_record.sale_price > 0 THEN
    calc_profit_margin := (calc_profit_per_unit / product_record.sale_price) * 100;
  ELSE
    calc_profit_margin := 0;
  END IF;
  
  -- Insert or update profit analysis
  INSERT INTO profit_analysis (
    product_id,
    stock_value,
    average_cost,
    selling_price,
    profit_per_unit,
    profit_margin,
    stock_quantity,
    last_calculated
  ) VALUES (
    p_product_id,
    calc_stock_value,
    product_record.cost_price,
    product_record.sale_price,
    calc_profit_per_unit,
    calc_profit_margin,
    product_record.stock_quantity,
    now()
  )
  ON CONFLICT (product_id) DO UPDATE SET
    stock_value = EXCLUDED.stock_value,
    average_cost = EXCLUDED.average_cost,
    selling_price = EXCLUDED.selling_price,
    profit_per_unit = EXCLUDED.profit_per_unit,
    profit_margin = EXCLUDED.profit_margin,
    stock_quantity = EXCLUDED.stock_quantity,
    last_calculated = EXCLUDED.last_calculated;
END;
$$;

-- Function to bulk update profit analysis for all products
CREATE OR REPLACE FUNCTION update_all_profit_analysis()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  p_id uuid;
BEGIN
  FOR p_id IN SELECT id FROM products WHERE is_active = true
  LOOP
    PERFORM update_profit_analysis(p_id);
  END LOOP;
END;
$$;

-- Function to get inventory receipts with product and supplier details
CREATE OR REPLACE FUNCTION get_inventory_receipts(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_product_filter uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  product_name text,
  product_sku text,
  supplier_name text,
  quantity integer,
  unit_cost numeric(10,2),
  new_average_cost numeric(10,2),
  batch_number text,
  expiry_date date,
  received_by text,
  received_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ir.id,
    p.name as product_name,
    p.sku as product_sku,
    s.name as supplier_name,
    ir.quantity,
    ir.unit_cost,
    ir.new_average_cost,
    ir.batch_number,
    ir.expiry_date,
    ir.received_by,
    ir.received_at
  FROM inventory_receipts ir
  JOIN products p ON ir.product_id = p.id
  LEFT JOIN suppliers s ON ir.supplier_id = s.id
  WHERE 
    (p_start_date IS NULL OR ir.received_at::date >= p_start_date) AND
    (p_end_date IS NULL OR ir.received_at::date <= p_end_date) AND
    (p_product_filter IS NULL OR ir.product_id = p_product_filter)
  ORDER BY ir.received_at DESC;
END;
$$;

-- Function to get damage reports with product details
CREATE OR REPLACE FUNCTION get_damage_reports(
  p_status_filter text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  product_name text,
  product_sku text,
  quantity integer,
  reason text,
  cost_impact numeric(10,2),
  status text,
  recorded_by text,
  recorded_at timestamp with time zone,
  approved_by text,
  approved_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dr.id,
    p.name as product_name,
    p.sku as product_sku,
    dr.quantity,
    dr.reason,
    dr.cost_impact,
    dr.status,
    dr.recorded_by,
    dr.recorded_at,
    dr.approved_by,
    dr.approved_at
  FROM damage_reports dr
  JOIN products p ON dr.product_id = p.id
  WHERE 
    (p_status_filter IS NULL OR dr.status = p_status_filter) AND
    (p_start_date IS NULL OR dr.recorded_at::date >= p_start_date) AND
    (p_end_date IS NULL OR dr.recorded_at::date <= p_end_date)
  ORDER BY dr.recorded_at DESC;
END;
$$;

-- Trigger to automatically calculate profit analysis when product prices change
CREATE OR REPLACE FUNCTION trigger_update_profit_analysis()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update profit analysis when cost_price or sale_price changes
  IF (OLD.cost_price != NEW.cost_price OR OLD.sale_price != NEW.sale_price OR OLD.stock_quantity != NEW.stock_quantity) THEN
    PERFORM update_profit_analysis(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on products table
DROP TRIGGER IF EXISTS trigger_product_profit_analysis ON products;
CREATE TRIGGER trigger_product_profit_analysis
  AFTER UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_profit_analysis();

-- Initialize profit analysis for existing products
SELECT update_all_profit_analysis();