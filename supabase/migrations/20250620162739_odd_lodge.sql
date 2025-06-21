/*
  # Add Missing Settings

  1. New Settings
    - Add missing settings keys that are referenced in the Settings component
    - Ensure all settings have default values
    
  2. Purpose
    - Fix "JSON object requested, multiple (or no) rows returned" error
    - Ensure all settings referenced in the UI exist in the database
    
  3. Settings Added
    - Receipt settings: receipt_width, show_logo, auto_print
    - Tax settings: tax_inclusive
    - Alert settings: email_alerts
    - Printer settings: printer_type, printer_ip, print_duplicate
*/

-- Insert missing settings with default values
INSERT INTO settings (key, value, category, description)
VALUES
  -- Receipt settings
  ('receipt_width', '80mm', 'receipt', 'Width of receipt paper'),
  ('show_logo', 'false', 'receipt', 'Show store logo on receipt'),
  ('auto_print', 'true', 'receipt', 'Automatically print receipt after sale'),
  
  -- Tax settings
  ('tax_inclusive', 'false', 'tax', 'Whether prices include tax'),
  
  -- Alert settings
  ('email_alerts', 'false', 'alerts', 'Send email alerts for inventory and sales'),
  
  -- Printer settings
  ('printer_type', 'browser', 'printer', 'Type of printer (browser, thermal, network)'),
  ('printer_ip', '', 'printer', 'IP address for network printer'),
  ('print_duplicate', 'false', 'printer', 'Print duplicate copy of receipt')
ON CONFLICT (key) DO NOTHING;

-- Update existing tax_rate setting if it exists
UPDATE settings 
SET key = 'default_tax_rate' 
WHERE key = 'tax_rate';

-- Add helpful comments
COMMENT ON TABLE settings IS 'System configuration settings';
COMMENT ON COLUMN settings.key IS 'Unique identifier for the setting';
COMMENT ON COLUMN settings.value IS 'Value of the setting';
COMMENT ON COLUMN settings.category IS 'Category for grouping settings';
COMMENT ON COLUMN settings.description IS 'Description of what the setting does';