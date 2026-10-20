CREATE TABLE "tasters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"city" text NOT NULL,
	"state" text DEFAULT 'MG' NOT NULL,
	"region" text,
	"area" text,
	"availability" text,
	"experience" text,
	"usual_fee" numeric(12, 2),
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "tasting_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"brand_id" uuid,
	"file_id" uuid,
	"rows_read" integer DEFAULT 0 NOT NULL,
	"rows_imported" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "tasting_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tasting_id" uuid NOT NULL,
	"taster_id" uuid NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "tasting_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"tasting_id" uuid,
	"batch_id" uuid,
	"kind" text DEFAULT 'other' NOT NULL,
	"name" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "tasting_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"number" text,
	"issue_date" date NOT NULL,
	"due_date" date,
	"amount" numeric(12, 2) NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"received_amount" numeric(12, 2),
	"received_at" date,
	"notes" text,
	"sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "tasting_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tasting_id" uuid NOT NULL,
	"item" text NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"checked_by" uuid,
	"checked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tastings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"store_id" uuid,
	"chain_name" text,
	"store_name" text NOT NULL,
	"city" text NOT NULL,
	"state" text DEFAULT 'MG' NOT NULL,
	"date" date NOT NULL,
	"start_time" text,
	"end_time" text,
	"product" text,
	"description" text,
	"materials_note" text,
	"notes" text,
	"responsible_id" uuid,
	"order_ref" text,
	"action_code" text,
	"billing_terms" text,
	"brand_payment_due" date,
	"taster_payment_due" date,
	"photo_proof" boolean DEFAULT false NOT NULL,
	"required_evidence" text,
	"status" text DEFAULT 'awaiting_taster' NOT NULL,
	"doc_status" text DEFAULT 'na' NOT NULL,
	"taster_id" uuid,
	"contact_status" text DEFAULT 'not_contacted' NOT NULL,
	"revenue" numeric(12, 2),
	"taxes" numeric(12, 2),
	"taster_fee" numeric(12, 2),
	"transport" numeric(12, 2),
	"food" numeric(12, 2),
	"materials_cost" numeric(12, 2),
	"other_cost" numeric(12, 2),
	"revenue_actual" numeric(12, 2),
	"taxes_actual" numeric(12, 2),
	"taster_fee_actual" numeric(12, 2),
	"transport_actual" numeric(12, 2),
	"food_actual" numeric(12, 2),
	"materials_cost_actual" numeric(12, 2),
	"other_cost_actual" numeric(12, 2),
	"cancellation_fee" numeric(12, 2),
	"billing_status" text DEFAULT 'not_billed' NOT NULL,
	"billed_amount" numeric(12, 2),
	"invoice_id" uuid,
	"receipt_status" text DEFAULT 'pending' NOT NULL,
	"received_amount" numeric(12, 2),
	"received_at" date,
	"taster_payment_status" text DEFAULT 'pending' NOT NULL,
	"paid_amount" numeric(12, 2),
	"paid_at" date,
	"completed_at" timestamp with time zone,
	"cancel_reason" text,
	"batch_id" uuid,
	"sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "tastings_time_ck" CHECK (("tastings"."start_time" is null or "tastings"."start_time" ~ '^[0-2][0-9]:[0-5][0-9]$') and ("tastings"."end_time" is null or "tastings"."end_time" ~ '^[0-2][0-9]:[0-5][0-9]$'))
);
--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "monthly_fee" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "visit_targets" ADD COLUMN "pay_value" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "tasters" ADD CONSTRAINT "tasters_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasting_batches" ADD CONSTRAINT "tasting_batches_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasting_batches" ADD CONSTRAINT "tasting_batches_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasting_contacts" ADD CONSTRAINT "tasting_contacts_tasting_id_tastings_id_fk" FOREIGN KEY ("tasting_id") REFERENCES "public"."tastings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasting_contacts" ADD CONSTRAINT "tasting_contacts_taster_id_tasters_id_fk" FOREIGN KEY ("taster_id") REFERENCES "public"."tasters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasting_files" ADD CONSTRAINT "tasting_files_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasting_files" ADD CONSTRAINT "tasting_files_tasting_id_tastings_id_fk" FOREIGN KEY ("tasting_id") REFERENCES "public"."tastings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasting_files" ADD CONSTRAINT "tasting_files_batch_id_tasting_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."tasting_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasting_invoices" ADD CONSTRAINT "tasting_invoices_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasting_invoices" ADD CONSTRAINT "tasting_invoices_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasting_materials" ADD CONSTRAINT "tasting_materials_tasting_id_tastings_id_fk" FOREIGN KEY ("tasting_id") REFERENCES "public"."tastings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tastings" ADD CONSTRAINT "tastings_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tastings" ADD CONSTRAINT "tastings_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tastings" ADD CONSTRAINT "tastings_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tastings" ADD CONSTRAINT "tastings_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tastings" ADD CONSTRAINT "tastings_taster_id_tasters_id_fk" FOREIGN KEY ("taster_id") REFERENCES "public"."tasters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tastings" ADD CONSTRAINT "tastings_invoice_id_tasting_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."tasting_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tastings" ADD CONSTRAINT "tastings_batch_id_tasting_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."tasting_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasters_agency_city_idx" ON "tasters" USING btree ("agency_id","city");--> statement-breakpoint
CREATE INDEX "tasting_contacts_tasting_idx" ON "tasting_contacts" USING btree ("tasting_id","created_at");--> statement-breakpoint
CREATE INDEX "tasting_files_tasting_idx" ON "tasting_files" USING btree ("tasting_id");--> statement-breakpoint
CREATE INDEX "tasting_files_batch_idx" ON "tasting_files" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "tasting_invoices_agency_idx" ON "tasting_invoices" USING btree ("agency_id","issue_date");--> statement-breakpoint
CREATE UNIQUE INDEX "tasting_materials_uq" ON "tasting_materials" USING btree ("tasting_id","item");--> statement-breakpoint
CREATE INDEX "tastings_agency_date_idx" ON "tastings" USING btree ("agency_id","date");--> statement-breakpoint
CREATE INDEX "tastings_taster_idx" ON "tastings" USING btree ("taster_id");--> statement-breakpoint
ALTER TABLE "tasters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasting_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasting_invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tastings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasting_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasting_materials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasting_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Painéis novos: quem é Gestor da agência e já tinha a lista de painéis marcada ganha Degustações e Financeiro.
UPDATE "users" SET "permissions" = "permissions" || '["degustacoes","financeiro"]'::jsonb
WHERE "role" = 'admin' AND "permissions" IS NOT NULL AND jsonb_typeof("permissions") = 'array';
