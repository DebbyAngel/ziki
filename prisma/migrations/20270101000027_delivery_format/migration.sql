-- What a deliverable is handed over as (lib/delivery-formats.ts): a doc, a design
-- file, a draft or plain text. Non-engineering work has no pull request to point
-- at, so the report form names the format instead. Older rows keep none.
-- Safe to run again.
ALTER TABLE "Idea" ADD COLUMN IF NOT EXISTS "deliveryFormat" TEXT;
ALTER TABLE "Bug" ADD COLUMN IF NOT EXISTS "deliveryFormat" TEXT;
