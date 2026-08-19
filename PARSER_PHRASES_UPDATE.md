# PARSER PHRASES UPDATE — 15.08.2026

## ПРОБЛЕМА

В БД 704 из 705 leads имели `botResult = NULL`.

Frontend показывал "—" в колонке "Результат".

**Причина:**
- Фразы "ХОЧУ ЗАПИСАТЬСЯ" не были добавлены в `determineResult()` метод
- Казахские варианты с ошибками/сокращениями не распознавались

## РЕШЕНИЕ

Добавлены **40+ расширенных казахских фраз** для BOOKED:

### КАЗАХСКИЙ — ХОЧУ ЗАПИСАТЬСЯ
```
жазылғым келеді, жазылгым келеді, жазылғым келед, жазылгым келед
жазылғым келіп тұр, жазылгым келіп тур, жазылгым келип тур
жазылуға келдім, жазылуга келдим
жазылып алайын, жазылып алайыншы
жазылып қояйын, жазылып кояйын
жазып қояйын, жазып кояйын
```

### ЖАЗЫП ҚОЮ — ВАРИАНТЫ
```
жазып қойыңыз, жазып койыңыз, жазып қойыныз, жазып коюыныз
жазып қой, жазып кой
жазып қоя беріңіз, жазып коя бериниз
жаза беріңіз, жаза бериниз
жазып қойыңызшы, жазып койыңызшы
жазып алыңыз, жазып алыныз
жазып беріңіз, жазып бериниз
жаза бер
жазылдым
```

### ДАТА + ЗАПИСЬ
```
ертеңге жаза беріңіз, ертенге жаза бериниз
ертеңге жазып қойыңыз, ертенге жазып койыныз
бүгінге жазып қойыңыз, бугинге жазып койыныз
сол күнге жазып қойыңыз
```

### ВРЕМЯ + ЗАПИСЬ (REGEX)
```
сағат 4-ке жазып қойыңыз
16:00-ге жазып қой
```

### РУССКИЙ — ХОЧУ ЗАПИСАТЬСЯ
```
хочу записаться, хочу записаться на, хочу записаться к
хочу записаться завтра, хочу записаться сегодня
хочу записаться к вам, хочу записаться на процедуру
хочу записаться на приём, хочу записаться на прием
```

## TESTS

Создан `test-parser-phrases.ts`:

```
✅ 27 / 27 tests passed

BOOKED:
✅ жазылғым келеді
✅ жазылгым келед
✅ жазып қойыныз
✅ жазып койыныз
✅ ертеңге жаза бериниз
✅ жазып қояйын
✅ хочу записаться
✅ ХОЧУ ЗАПИСАТЬСЯ ПОДТЯЖКУ ЛИЦА ВСЕГО ЗА 3990 ТГ
✅ сағат 4-ке жазып қойыңыз
✅ 16:00-ге жазып қой

LOST:
✅ бармайм
✅ қымбат
✅ жоқ
✅ дорого

UNKNOWN:
✅ ойланам
✅ подумаю
✅ потом

NULL (нейтральные):
✅ иа
✅ барам
✅ Привет! Можно узнать об этом подробнее?
```

## DEPLOYMENT

```bash
# Build
npm run build

# Deploy
tar -czf dist-phrases.tar.gz dist/
scp dist-phrases.tar.gz root@188.241.217.76:/root/backend/
ssh root@188.241.217.76 "cd /root/backend && rm -rf dist && tar -xzf dist-phrases.tar.gz && pm2 restart whatsapp-crm-api"
```

**Status:**
- Deployed: 15.08.2026 19:01 UTC
- PM2 restart #34
- Build: 0 errors

## DATABASE STATUS

```
Total leads:     705
botResult NULL:  704 (expected — старые leads не обновляем)
botResult SET:   1   (manually updated test lead)
```

## ВАЖНО

### НЕ ИЗМЕНЯЛИСЬ:
- `extractPrice()` — старый parser
- `matchOffer()` — старый parser
- `normalizeText()` — старый parser
- `extractDate()` — дата parser
- `extractTime()` — время parser

### ИЗМЕНЁН ТОЛЬКО:
- `determineResult()` — BOOKED/LOST/UNKNOWN result parser
- Добавлены BOOKED_PHRASES (40+ вариантов)
- Добавлены time-booking regex patterns
- Обновлены LOST_PHRASES (с ошибками)
- Обновлены UNKNOWN_PHRASES (билмеймин, кейин жазам)

## NEXT STEPS

### 1. Wait for NEW incoming message

Monitor DB:
```sql
SELECT 
  c.phone,
  l."originalMessage",
  l."botResult",
  to_char(l."createdAt", 'DD.MM HH24:MI:SS') as created
FROM leads l
JOIN clients c ON c.id = l."clientId"
WHERE l."createdAt" > '2026-08-15 19:01:00'
ORDER BY l."createdAt" DESC
LIMIT 10;
```

### 2. Expected results

**Message:** "хочу записаться на подтяжку лица"
→ `botResult = BOOKED` ✅

**Message:** "жазылғым келеді трихологияға"
→ `botResult = BOOKED` ✅

**Message:** "бармайм"
→ `botResult = LOST` ✅

**Message:** "ойланам"
→ `botResult = UNKNOWN` ✅

**Message:** "Привет! Можно узнать подробнее?"
→ `botResult = NULL` ✅

### 3. Frontend verification

После появления НОВОГО lead с `botResult != NULL`:

1. Открыть frontend: Leads Management
2. Проверить колонку "Результат"
3. Ожидается:
   - BOOKED → "Записан" (зелёный)
   - LOST → "Потерян" (красный)
   - UNKNOWN → "Неизвестно" (жёлтый)
   - NULL → "—" (серый)

## ФАЙЛЫ

Modified:
- `backend/src/modules/whatsapp/whatsapp-parser.service.ts`

Created:
- `backend/test-parser-phrases.ts`
- `backend/dist-phrases.tar.gz`
- `backend/PARSER_PHRASES_UPDATE.md`

## SUMMARY

✅ 40+ казахских BOOKED фраз добавлены
✅ "хочу записаться" + варианты добавлены
✅ Time+booking regex patterns добавлены
✅ 27/27 unit tests passed
✅ Build: 0 errors
✅ Deployed: 15.08.2026 19:01 UTC (restart #34)
⏳ Waiting: NEW incoming message для E2E verification

**Status:** READY FOR LIVE TEST
