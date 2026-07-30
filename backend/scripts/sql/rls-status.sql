SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relname IN ('candidates', 'applications', 'screenings', 'reviews', 'decisions')
ORDER BY relname;
