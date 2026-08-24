-- ═══════════════════════════════════════════════════════════════════════
-- УДАЛЕНИЕ СТАРЫХ ЛИДОВ ДО 22 АВГУСТА 2026
-- ═══════════════════════════════════════════════════════════════════════
-- 
-- ВАЖНО: Этот скрипт удаляет ТОЛЬКО лиды (Lead), но НЕ клиентов и сообщения
-- Clients и Messages остаются для истории
--
-- Дата: 22 августа 2026 00:00:00 UTC
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- Показать сколько лидов будет удалено
SELECT 
  COUNT(*) as total_leads_to_delete,
  MIN(created_at) as oldest_lead,
  MAX(created_at) as newest_lead_to_delete
FROM "Lead"
WHERE created_at < '2026-08-22 00:00:00';

-- Удалить лиды до 22 августа 2026
DELETE FROM "Lead"
WHERE created_at < '2026-08-22 00:00:00';

-- Показать результат
SELECT 
  COUNT(*) as remaining_leads,
  MIN(created_at) as oldest_remaining_lead,
  MAX(created_at) as newest_lead
FROM "Lead";

COMMIT;
