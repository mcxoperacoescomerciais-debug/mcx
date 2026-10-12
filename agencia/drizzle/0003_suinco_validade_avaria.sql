CREATE TABLE "damages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"attendance_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit" text DEFAULT 'un' NOT NULL,
	"expiry_date" date,
	"lot" text,
	"note" text,
	"recorded_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "damages_quantity_ck" CHECK ("damages"."quantity" > 0),
	CONSTRAINT "damages_kind_ck" CHECK ("damages"."kind" in ('damaged_package','violated','no_vacuum','strange_color','liquid','unfit','other'))
);
--> statement-breakpoint
CREATE TABLE "validities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"attendance_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"location" text DEFAULT 'sales_floor' NOT NULL,
	"quantity" integer NOT NULL,
	"unit" text DEFAULT 'un' NOT NULL,
	"expiry_date" date NOT NULL,
	"days_to_expiry" integer NOT NULL,
	"severity" text NOT NULL,
	"lot" text,
	"price" numeric(10, 2),
	"note" text,
	"recorded_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "validities_location_ck" CHECK ("validities"."location" in ('sales_floor','stock')),
	CONSTRAINT "validities_quantity_ck" CHECK ("validities"."quantity" > 0),
	CONSTRAINT "validities_severity_ck" CHECK ("validities"."severity" in ('expired','critical','high','attention','monitor','normal'))
);
--> statement-breakpoint
CREATE TABLE "whatsapp_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"attendance_id" uuid NOT NULL,
	"items" integer NOT NULL,
	"sent_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "photos" DROP CONSTRAINT "photos_kind_ck";--> statement-breakpoint
ALTER TABLE "ruptures" DROP CONSTRAINT "ruptures_situation_ck";--> statement-breakpoint
ALTER TABLE "ruptures" ALTER COLUMN "situation" SET DEFAULT 'total';--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "validity_id" uuid;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "damage_id" uuid;--> statement-breakpoint
ALTER TABLE "damages" ADD CONSTRAINT "damages_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damages" ADD CONSTRAINT "damages_attendance_id_attendances_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damages" ADD CONSTRAINT "damages_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validities" ADD CONSTRAINT "validities_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validities" ADD CONSTRAINT "validities_attendance_id_attendances_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validities" ADD CONSTRAINT "validities_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_alerts" ADD CONSTRAINT "whatsapp_alerts_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_alerts" ADD CONSTRAINT "whatsapp_alerts_attendance_id_attendances_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "damages_attendance_idx" ON "damages" USING btree ("attendance_id");--> statement-breakpoint
CREATE INDEX "damages_agency_idx" ON "damages" USING btree ("agency_id","created_at");--> statement-breakpoint
CREATE INDEX "validities_attendance_idx" ON "validities" USING btree ("attendance_id");--> statement-breakpoint
CREATE INDEX "validities_agency_severity_idx" ON "validities" USING btree ("agency_id","severity");--> statement-breakpoint
CREATE INDEX "validities_product_idx" ON "validities" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_alerts_attendance_uq" ON "whatsapp_alerts" USING btree ("attendance_id");--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_kind_ck" CHECK ("photos"."kind" in ('before','after','rupture','occurrence','validity','damage'));--> statement-breakpoint
ALTER TABLE "ruptures" ADD CONSTRAINT "ruptures_situation_ck" CHECK ("ruptures"."situation" in ('total','shelf_empty','backroom_empty','missing_display','registered_not_found','unavailable_other','unconfirmed'));--> statement-breakpoint
-- Mesma defesa das demais tabelas (ver 0001_rls.sql): RLS sem políticas.
ALTER TABLE "validities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "damages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "whatsapp_alerts" ENABLE ROW LEVEL SECURITY;
