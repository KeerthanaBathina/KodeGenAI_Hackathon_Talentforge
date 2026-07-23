-- RLS policies for EP-DATA / US-001
-- NOTE: Apply after core schema migration has created all referenced tables.
-- Uses Supabase built-in auth.uid() and auth.role() helpers.

ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE screenings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY candidates_candidate_select ON candidates
  FOR SELECT
  USING (auth.role() = 'candidate' AND id = auth.uid());

CREATE POLICY candidates_candidate_update ON candidates
  FOR UPDATE
  USING (auth.role() = 'candidate' AND id = auth.uid());

CREATE POLICY candidates_hr_select ON candidates
  FOR SELECT
  USING (auth.role() IN ('hr_reviewer', 'recruiter', 'hr_manager', 'tech_interviewer'));

CREATE POLICY candidates_admin_all ON candidates
  FOR ALL
  USING (auth.role() = 'admin');

CREATE POLICY applications_candidate_select ON applications
  FOR SELECT
  USING (auth.role() = 'candidate' AND "candidateId" = auth.uid());

CREATE POLICY applications_candidate_insert ON applications
  FOR INSERT
  WITH CHECK (auth.role() = 'candidate' AND "candidateId" = auth.uid());

CREATE POLICY applications_hr_select ON applications
  FOR SELECT
  USING (auth.role() IN ('hr_reviewer', 'recruiter', 'hr_manager', 'tech_interviewer'));

CREATE POLICY applications_hr_update ON applications
  FOR UPDATE
  USING (auth.role() IN ('recruiter', 'hr_manager'));

CREATE POLICY applications_admin_all ON applications
  FOR ALL
  USING (auth.role() = 'admin');

CREATE POLICY screenings_candidate_select ON screenings
  FOR SELECT
  USING (
    auth.role() = 'candidate' AND
    "applicationId" IN (SELECT id FROM applications WHERE "candidateId" = auth.uid())
  );

CREATE POLICY screenings_hr_select ON screenings
  FOR SELECT
  USING (auth.role() IN ('hr_reviewer', 'recruiter', 'hr_manager', 'tech_interviewer'));

CREATE POLICY screenings_hr_write ON screenings
  FOR ALL
  USING (auth.role() IN ('hr_reviewer', 'recruiter', 'hr_manager'));

CREATE POLICY screenings_admin_all ON screenings
  FOR ALL
  USING (auth.role() = 'admin');

CREATE POLICY reviews_candidate_select ON reviews
  FOR SELECT
  USING (
    auth.role() = 'candidate' AND
    "applicationId" IN (SELECT id FROM applications WHERE "candidateId" = auth.uid())
  );

CREATE POLICY reviews_hr_all ON reviews
  FOR ALL
  USING (auth.role() IN ('hr_reviewer', 'recruiter', 'hr_manager'));

CREATE POLICY reviews_admin_all ON reviews
  FOR ALL
  USING (auth.role() = 'admin');

CREATE POLICY decisions_candidate_select ON decisions
  FOR SELECT
  USING (
    auth.role() = 'candidate' AND
    "applicationId" IN (SELECT id FROM applications WHERE "candidateId" = auth.uid())
  );

CREATE POLICY decisions_hr_all ON decisions
  FOR ALL
  USING (auth.role() IN ('hr_reviewer', 'hr_manager', 'recruiter'));

CREATE POLICY decisions_admin_all ON decisions
  FOR ALL
  USING (auth.role() = 'admin');
