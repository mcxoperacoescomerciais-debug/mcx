CREATE TABLE "fixed_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"start_month" text NOT NULL,
	"end_month" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "fixed_expenses" ADD CONSTRAINT "fixed_expenses_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fixed_expenses_agency_idx" ON "fixed_expenses" USING btree ("agency_id","start_month");--> statement-breakpoint
ALTER TABLE "fixed_expenses" ENABLE ROW LEVEL SECURITY;
