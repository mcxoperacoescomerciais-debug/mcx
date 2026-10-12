ALTER TABLE "agencies" ADD COLUMN "kind" text DEFAULT 'client' NOT NULL;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "logo" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "platform" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_kind_ck" CHECK ("agencies"."kind" in ('client','platform'));--> statement-breakpoint
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_status_ck" CHECK ("agencies"."status" in ('active','suspended'));