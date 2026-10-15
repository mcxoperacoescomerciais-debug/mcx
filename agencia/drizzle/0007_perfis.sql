ALTER TABLE "users" ADD COLUMN "platform_role" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "permissions" jsonb;--> statement-breakpoint
-- Equipe MCX: o administrador principal é o Dono; os demais, Master.
UPDATE "users" SET "platform_role" = CASE WHEN lower("username") = 'eduardo' THEN 'owner' ELSE 'master' END WHERE "platform" = true;
