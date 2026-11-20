CREATE TABLE "alert_runs" (
	"kind" text NOT NULL,
	"ref_key" text NOT NULL,
	"demand_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_runs_kind_ref_key_pk" PRIMARY KEY("kind","ref_key")
);
--> statement-breakpoint
CREATE TABLE "contract_amendments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"day" date NOT NULL,
	"description" text NOT NULL,
	"previous_value_cents" integer NOT NULL,
	"new_value_cents" integer NOT NULL,
	"previous_end_date" date,
	"new_end_date" date,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"services" text NOT NULL,
	"monthly_value_cents" integer DEFAULT 0 NOT NULL,
	"due_day" integer,
	"start_date" date,
	"term_months" integer DEFAULT 6 NOT NULL,
	"end_date" date,
	"auto_renew" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"lead_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "contracts_status_ck" CHECK ("contracts"."status" in ('draft','active','ended','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"client_id" uuid,
	"contract_id" uuid,
	"brand" text,
	"promoter" text,
	"restricted" boolean DEFAULT false NOT NULL,
	"expires_on" date,
	"current_version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "operational_profile" jsonb;--> statement-breakpoint
ALTER TABLE "alert_runs" ADD CONSTRAINT "alert_runs_demand_id_demands_id_fk" FOREIGN KEY ("demand_id") REFERENCES "public"."demands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_amendments" ADD CONSTRAINT "contract_amendments_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_amendments" ADD CONSTRAINT "contract_amendments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contract_amendments_contract_idx" ON "contract_amendments" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "contracts_client_idx" ON "contracts" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_uq" ON "document_versions" USING btree ("document_id","version");--> statement-breakpoint
CREATE INDEX "documents_client_idx" ON "documents" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "documents_contract_idx" ON "documents" USING btree ("contract_id");