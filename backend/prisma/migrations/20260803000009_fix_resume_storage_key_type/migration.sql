-- Resume storage keys are path-like object keys (e.g. resumes/<candidate>/<file>)
-- and must be stored as text, not UUID.
ALTER TABLE "resumes"
    ALTER COLUMN "storageKey" TYPE VARCHAR(1024)
    USING "storageKey"::text;
