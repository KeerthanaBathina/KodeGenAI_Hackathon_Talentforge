SELECT conname,
       conrelid::regclass AS table_name,
       confrelid::regclass AS referenced_table,
       confdeltype
FROM pg_constraint
WHERE contype = 'f'
  AND conrelid::regclass::text IN ('applications','resumes','screenings','reviews','decisions','audit_events')
ORDER BY conrelid::regclass::text, conname;
