-- ============================================================
-- LOGOSPOS - MÓDULO RESTAURANTE
-- Script 08: Tipos de Orden (Mesa / Venta Rápida / Para Llevar / Delivery)
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Permitir table_id NULL (Barra, Para Llevar y Delivery no tienen mesa física)
ALTER TABLE restaurant_orders
  ALTER COLUMN table_id DROP NOT NULL;

-- 2. Columna tipo_orden
ALTER TABLE restaurant_orders
  ADD COLUMN IF NOT EXISTS tipo_orden VARCHAR(20) NOT NULL DEFAULT 'mesa'
    CHECK (tipo_orden IN ('mesa', 'barra', 'llevar', 'delivery'));

-- 3. Datos del cliente (Para Llevar y Delivery)
ALTER TABLE restaurant_orders
  ADD COLUMN IF NOT EXISTS cliente_nombre    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cliente_telefono  VARCHAR(30),
  ADD COLUMN IF NOT EXISTS direccion_entrega TEXT;

-- 4. Número de pedido visible del día (ej: "Pedido #7")
--    Solo se asigna a órdenes de tipo barra/llevar/delivery
ALTER TABLE restaurant_orders
  ADD COLUMN IF NOT EXISTS numero_pedido_dia SMALLINT;

-- 5. Trigger: asignar número de pedido del día automáticamente
CREATE OR REPLACE FUNCTION asignar_numero_pedido_dia()
RETURNS TRIGGER AS $$
DECLARE
  v_numero SMALLINT;
BEGIN
  IF NEW.tipo_orden IN ('barra', 'llevar', 'delivery') THEN
    SELECT COALESCE(MAX(numero_pedido_dia), 0) + 1
      INTO v_numero
      FROM restaurant_orders
     WHERE negocio_id  = NEW.negocio_id
       AND tipo_orden  IN ('barra', 'llevar', 'delivery')
       AND (created_at AT TIME ZONE 'America/Santo_Domingo')::date
             = (NOW() AT TIME ZONE 'America/Santo_Domingo')::date;

    NEW.numero_pedido_dia := v_numero;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_numero_pedido_dia ON restaurant_orders;
CREATE TRIGGER trg_numero_pedido_dia
  BEFORE INSERT ON restaurant_orders
  FOR EACH ROW EXECUTE FUNCTION asignar_numero_pedido_dia();

-- 6. Índice para buscar órdenes activas por tipo (para la cola de llevar/delivery)
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_tipo
  ON restaurant_orders (negocio_id, tipo_orden, estado);

-- 7. Comentarios
COMMENT ON COLUMN restaurant_orders.tipo_orden IS
  'mesa=orden en mesa física | barra=venta rápida sin mesa | llevar=para recoger | delivery=entrega a domicilio';
COMMENT ON COLUMN restaurant_orders.cliente_nombre IS
  'Nombre del cliente para órdenes de llevar/delivery';
COMMENT ON COLUMN restaurant_orders.cliente_telefono IS
  'Teléfono de contacto para llevar/delivery';
COMMENT ON COLUMN restaurant_orders.direccion_entrega IS
  'Dirección de entrega (solo delivery)';
COMMENT ON COLUMN restaurant_orders.numero_pedido_dia IS
  'Número correlativo del día visible al cliente (Pedido #1, #2...). Solo barra/llevar/delivery.';

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'restaurant_orders'
  AND column_name IN (
    'tipo_orden', 'cliente_nombre', 'cliente_telefono',
    'direccion_entrega', 'numero_pedido_dia', 'table_id'
  )
ORDER BY column_name;
