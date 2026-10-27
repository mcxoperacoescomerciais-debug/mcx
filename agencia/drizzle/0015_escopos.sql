CREATE TABLE "scope_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"client_name" text NOT NULL,
	"title" text NOT NULL,
	"intro" text,
	"details" text,
	"closing_text" text,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "scope_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"answers" jsonb NOT NULL,
	"general_note" text,
	"signer_name" text NOT NULL,
	"signer_role" text NOT NULL,
	"signer_email" text,
	"snapshot" jsonb NOT NULL,
	"user_agent" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "scope_responses" ADD CONSTRAINT "scope_responses_form_id_scope_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."scope_forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scope_forms_token_uq" ON "scope_forms" USING btree ("token");--> statement-breakpoint
CREATE INDEX "scope_responses_form_idx" ON "scope_responses" USING btree ("form_id","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scope_responses_current_uq" ON "scope_responses" USING btree ("form_id") WHERE superseded_at is null;--> statement-breakpoint
ALTER TABLE "scope_forms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scope_responses" ENABLE ROW LEVEL SECURITY;
