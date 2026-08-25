ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "parsedAge" INTEGER;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "parsedGender" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "parsedCity" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "isAktobeResident" BOOLEAN;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "parsedName" TEXT;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'leads'
AND column_name IN ('parsedAge', 'parsedGender', 'parsedCity', 'isAktobeResident', 'parsedName')
ORDER BY column_name;
