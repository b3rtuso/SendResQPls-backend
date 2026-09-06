-- Enable Row Level Security on CallLog and IncidentActivity
ALTER TABLE "CallLog" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'CallLog' AND policyname = 'calllog_admin_all'
  ) THEN
    CREATE POLICY "calllog_admin_all" ON "CallLog"
      FOR ALL TO app_role
      USING (current_setting('app.current_user_role', true) = 'ADMIN')
      WITH CHECK (current_setting('app.current_user_role', true) = 'ADMIN');
  END IF;
END $$;

ALTER TABLE "IncidentActivity" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'IncidentActivity' AND policyname = 'incidentactivity_select'
  ) THEN
    CREATE POLICY "incidentactivity_select" ON "IncidentActivity"
      FOR SELECT TO app_role
      USING (
        EXISTS (
          SELECT 1 FROM "Incident"
          WHERE "Incident".id = "IncidentActivity"."incidentId"
            AND (
              "Incident"."reporterId" = current_setting('app.current_user_id', true)
              OR current_setting('app.current_user_role', true) = 'ADMIN'
            )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'IncidentActivity' AND policyname = 'incidentactivity_write'
  ) THEN
    CREATE POLICY "incidentactivity_write" ON "IncidentActivity"
      FOR ALL TO app_role
      USING (current_setting('app.current_user_role', true) = 'ADMIN')
      WITH CHECK (current_setting('app.current_user_role', true) = 'ADMIN');
  END IF;
END $$;
