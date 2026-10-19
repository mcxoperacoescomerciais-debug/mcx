ALTER TABLE "photos" ADD COLUMN "placement" text;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "origin" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
-- Programações já existentes: as de roteiro ficam "route"; as que batem com um dia fixo de atribuição, "assignment".
UPDATE "schedules" SET "origin" = 'route' WHERE "route_id" IS NOT NULL;--> statement-breakpoint
UPDATE "schedules" sc SET "origin" = 'assignment'
WHERE sc."route_id" IS NULL AND EXISTS (
  SELECT 1 FROM "visit_targets" vt
  WHERE vt."promoter_id" = sc."promoter_id" AND vt."store_id" = sc."store_id"
    AND vt."weekdays" @> to_jsonb(extract(dow from sc."date")::int)
);
