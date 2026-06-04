-- ============================================================
-- Script 16: Plantillas de Modificadores / Guarniciones
-- Tabla nueva, no modifica nada existente.
-- Ejecutar en: Supabase Dashboard → SQL Editor (producción y staging)
-- ============================================================

CREATE TABLE IF NOT EXISTS modifier_templates (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id   UUID        NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  grupo_nombre TEXT        NOT NULL,
  opciones     JSONB       NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_modifier_templates_negocio
  ON modifier_templates (negocio_id);

-- RLS
ALTER TABLE modifier_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "modifier_templates_tenant_select" ON modifier_templates
  FOR SELECT USING (
    negocio_id = (current_setting('request.jwt.claims', true)::jsonb->>'negocio_id')::uuid
  );

CREATE POLICY "modifier_templates_tenant_insert" ON modifier_templates
  FOR INSERT WITH CHECK (
    negocio_id = (current_setting('request.jwt.claims', true)::jsonb->>'negocio_id')::uuid
  );

CREATE POLICY "modifier_templates_tenant_delete" ON modifier_templates
  FOR DELETE USING (
    negocio_id = (current_setting('request.jwt.claims', true)::jsonb->>'negocio_id')::uuid
  );

-- Refrescar schema cache
SELECT pg_notify('pgrst', 'reload schema');
