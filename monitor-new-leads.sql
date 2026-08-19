-- ════════════════════════════════════════════════════════════
-- MONITOR NEW LEADS AFTER PARSER DEPLOYMENT
-- Deployed: 15.08.2026 19:01 UTC (restart #34)
-- ════════════════════════════════════════════════════════════

\echo '═══════════════════════════════════════════════════════════'
\echo '  NEW LEADS SINCE DEPLOYMENT'
\echo '═══════════════════════════════════════════════════════════'
\echo ''

SELECT
  substring(l.id::text, 1, 8) as id_short,
  c.phone,
  substring(l."originalMessage", 1, 50) as message,
  l."parsedProcedures"[1] as procedure,
  l."parsedPrice" as price,
  l."botResult" as result,
  to_char(l."createdAt", 'DD.MM HH24:MI') as created
FROM leads l
JOIN clients c ON c.id = l."clientId"
WHERE l."createdAt" > '2026-08-15 19:01:00'
ORDER BY l."createdAt" DESC
LIMIT 20;

\echo ''
\echo '═══════════════════════════════════════════════════════════'
\echo '  LEADS WITH "ХОЧУ ЗАПИСАТЬСЯ" (SHOULD BE BOOKED)'
\echo '═══════════════════════════════════════════════════════════'
\echo ''

SELECT
  substring(l.id::text, 1, 8) as id_short,
  c.phone,
  l."originalMessage",
  l."botResult" as result,
  CASE 
    WHEN l."botResult" = 'BOOKED' THEN '✅'
    WHEN l."botResult" IS NULL THEN '❌ NULL'
    ELSE '⚠️ ' || l."botResult"::text
  END as status
FROM leads l
JOIN clients c ON c.id = l."clientId"
WHERE l."originalMessage" ILIKE '%ХОЧУ ЗАПИСАТЬСЯ%'
  AND l."createdAt" > '2026-08-15 19:01:00'
ORDER BY l."createdAt" DESC
LIMIT 10;

\echo ''
\echo '═══════════════════════════════════════════════════════════'
\echo '  LEADS WITH KAZAKH "ЖАЗЫП ҚОЮ" (SHOULD BE BOOKED)'
\echo '═══════════════════════════════════════════════════════════'
\echo ''

SELECT
  substring(l.id::text, 1, 8) as id_short,
  c.phone,
  substring(l."originalMessage", 1, 60) as message,
  l."botResult" as result,
  CASE 
    WHEN l."botResult" = 'BOOKED' THEN '✅'
    WHEN l."botResult" IS NULL THEN '❌ NULL'
    ELSE '⚠️ ' || l."botResult"::text
  END as status
FROM leads l
JOIN clients c ON c.id = l."clientId"
WHERE (
  l."originalMessage" ILIKE '%жазып қой%'
  OR l."originalMessage" ILIKE '%жазып кой%'
  OR l."originalMessage" ILIKE '%жаза бер%'
  OR l."originalMessage" ILIKE '%жазылғым келед%'
  OR l."originalMessage" ILIKE '%жазылгым келед%'
)
  AND l."createdAt" > '2026-08-15 19:01:00'
ORDER BY l."createdAt" DESC
LIMIT 10;

\echo ''
\echo '═══════════════════════════════════════════════════════════'
\echo '  OVERALL STATS'
\echo '═══════════════════════════════════════════════════════════'
\echo ''

SELECT
  'Since deployment' as period,
  COUNT(*) as total_leads,
  COUNT(*) FILTER (WHERE "botResult" IS NOT NULL) as with_result,
  COUNT(*) FILTER (WHERE "botResult" = 'BOOKED') as booked,
  COUNT(*) FILTER (WHERE "botResult" = 'LOST') as lost,
  COUNT(*) FILTER (WHERE "botResult" = 'UNKNOWN') as unknown,
  COUNT(*) FILTER (WHERE "botResult" IS NULL) as null_result,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE "botResult" IS NOT NULL) / NULLIF(COUNT(*), 0),
    1
  ) || '%' as result_rate
FROM leads
WHERE "createdAt" > '2026-08-15 19:01:00';

\echo ''
\echo '═══════════════════════════════════════════════════════════'
\echo '  RUN COMMAND:'
\echo '  psql "postgresql://...?sslmode=require" -f monitor-new-leads.sql'
\echo '═══════════════════════════════════════════════════════════'
