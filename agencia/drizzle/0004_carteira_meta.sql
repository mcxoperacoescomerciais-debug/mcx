CREATE TABLE "visit_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"promoter_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"per_week" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "visit_targets_per_week_ck" CHECK ("visit_targets"."per_week" between 1 and 14)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "work_mode" text;--> statement-breakpoint
ALTER TABLE "visit_targets" ADD CONSTRAINT "visit_targets_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_targets" ADD CONSTRAINT "visit_targets_promoter_id_users_id_fk" FOREIGN KEY ("promoter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_targets" ADD CONSTRAINT "visit_targets_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_targets" ADD CONSTRAINT "visit_targets_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "visit_targets_uq" ON "visit_targets" USING btree ("promoter_id","store_id","brand_id");--> statement-breakpoint
CREATE INDEX "visit_targets_agency_idx" ON "visit_targets" USING btree ("agency_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_work_mode_ck" CHECK ("users"."work_mode" is null or "users"."work_mode" in ('route','portfolio'));--> statement-breakpoint
ALTER TABLE "visit_targets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Produtos: só UNIDADE e CAIXA (pacote, fardo, display e kg viram unidade).
UPDATE "products" SET "unit" = 'un' WHERE "unit" NOT IN ('un','cx');--> statement-breakpoint
-- ETROS trabalha por carteira com meta semanal (o gestor pode mudar em Configurações).
UPDATE "agencies" SET "settings" = jsonb_set(coalesce("settings", '{}'::jsonb), '{defaultWorkMode}', '"portfolio"') WHERE "kind" = 'client' AND lower("name") LIKE 'etros%';
