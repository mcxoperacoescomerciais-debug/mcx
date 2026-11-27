ALTER TABLE "photos" DROP CONSTRAINT "photos_kind_ck";--> statement-breakpoint
ALTER TABLE "attendances" ADD COLUMN "action_result" jsonb;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_kind_ck" CHECK ("photos"."kind" in ('before','after','rupture','occurrence','validity','damage','closing'));