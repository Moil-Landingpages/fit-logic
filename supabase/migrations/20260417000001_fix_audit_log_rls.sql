-- Fix RLS violation on audit_log:
-- The audit_patient_changes() trigger runs in the caller's security context,
-- so authenticated/anon users are blocked by the INSERT-less RLS policy.
-- Adding SECURITY DEFINER makes the function execute as its owner (postgres),
-- which bypasses RLS and can always write to audit_log.

CREATE OR REPLACE FUNCTION public.audit_patient_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, new_data)
    VALUES ('patients', NEW.id, 'INSERT', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, old_data, new_data)
    VALUES ('patients', NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, old_data)
    VALUES ('patients', OLD.id, 'DELETE', to_jsonb(OLD));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
