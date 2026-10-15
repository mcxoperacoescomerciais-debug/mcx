ALTER TABLE "visit_targets" DROP CONSTRAINT "visit_targets_per_week_ck";--> statement-breakpoint
ALTER TABLE "visit_targets" ADD COLUMN "period" text DEFAULT 'week' NOT NULL;--> statement-breakpoint
ALTER TABLE "visit_targets" ADD COLUMN "weekdays" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "visit_targets" ADD CONSTRAINT "visit_targets_period_ck" CHECK ("visit_targets"."period" in ('week','fortnight','month'));--> statement-breakpoint
ALTER TABLE "visit_targets" ADD CONSTRAINT "visit_targets_per_week_ck" CHECK ("visit_targets"."per_week" between 1 and 31);