ALTER TABLE "users" ADD COLUMN "identification_code" text;
UPDATE "users" SET "identification_code" = LPAD((FLOOR(RANDOM() * 900000) + 100000)::TEXT, 6, '0') WHERE "identification_code" IS NULL;
CREATE UNIQUE INDEX "users_identification_code_idx" ON "users" ("identification_code");
