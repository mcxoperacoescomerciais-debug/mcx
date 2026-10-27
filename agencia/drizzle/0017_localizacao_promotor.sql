ALTER TABLE "users" ADD COLUMN "geo_permission" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "geo_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_lat" double precision;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_lng" double precision;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_accuracy_m" double precision;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_geo_at" timestamp with time zone;