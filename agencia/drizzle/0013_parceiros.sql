CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "store_brands" ADD COLUMN "partner_id" uuid;--> statement-breakpoint
ALTER TABLE "store_brands" ADD COLUMN "visits_per_period" integer;--> statement-breakpoint
ALTER TABLE "store_brands" ADD COLUMN "period" text;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "partners_agency_name_uq" ON "partners" USING btree ("agency_id",lower("name"));--> statement-breakpoint
ALTER TABLE "store_brands" ADD CONSTRAINT "store_brands_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ENABLE ROW LEVEL SECURITY;
