CREATE TABLE "activity_days" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"minutes" integer DEFAULT 0 NOT NULL,
	"first_at" timestamp with time zone NOT NULL,
	"last_at" timestamp with time zone NOT NULL,
	CONSTRAINT "activity_days_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "checklist_misses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"demand_id" uuid NOT NULL,
	"template_id" uuid,
	"item" text NOT NULL,
	"quantity" text,
	"impact" text,
	"added_to_template" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_template_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"section" text,
	"text" text NOT NULL,
	"quantity" integer,
	"unit" text,
	"per_action" boolean DEFAULT false NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"note" text,
	"to_validate" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"client_id" uuid,
	"category_id" uuid,
	"type_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"double_check" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routine_runs" (
	"routine_id" uuid NOT NULL,
	"occurrence" date NOT NULL,
	"demand_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routine_runs_routine_id_occurrence_pk" PRIMARY KEY("routine_id","occurrence")
);
--> statement-breakpoint
CREATE TABLE "routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"client_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"type_id" uuid,
	"assignee_id" uuid NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"frequency" text NOT NULL,
	"weekdays" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"month_day" integer,
	"interval_days" integer,
	"start_date" date NOT NULL,
	"lead_days" integer DEFAULT 0 NOT NULL,
	"due_offset_days" integer DEFAULT 0 NOT NULL,
	"template_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"demand_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"minutes" integer NOT NULL,
	"source" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "time_entries_minutes_ck" CHECK ("time_entries"."minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "timers" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"demand_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "monthly_value_cents" integer;--> statement-breakpoint
ALTER TABLE "demand_checklist_items" ADD COLUMN "section" text;--> statement-breakpoint
ALTER TABLE "demand_checklist_items" ADD COLUMN "quantity" integer;--> statement-breakpoint
ALTER TABLE "demand_checklist_items" ADD COLUMN "unit" text;--> statement-breakpoint
ALTER TABLE "demand_checklist_items" ADD COLUMN "required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "demand_checklist_items" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "demand_checklist_items" ADD COLUMN "not_applicable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "demand_checklist_items" ADD COLUMN "na_reason" text;--> statement-breakpoint
ALTER TABLE "demand_checklist_items" ADD COLUMN "verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "demand_checklist_items" ADD COLUMN "verified_by" uuid;--> statement-breakpoint
ALTER TABLE "demand_checklist_items" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "demands" ADD COLUMN "routine_id" uuid;--> statement-breakpoint
ALTER TABLE "demands" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "demands" ADD COLUMN "template_version" integer;--> statement-breakpoint
ALTER TABLE "demands" ADD COLUMN "actions_count" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "weekly_hours" integer DEFAULT 40 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cost_per_hour_cents" integer;--> statement-breakpoint
ALTER TABLE "activity_days" ADD CONSTRAINT "activity_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_misses" ADD CONSTRAINT "checklist_misses_demand_id_demands_id_fk" FOREIGN KEY ("demand_id") REFERENCES "public"."demands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_misses" ADD CONSTRAINT "checklist_misses_template_id_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_misses" ADD CONSTRAINT "checklist_misses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_template_items" ADD CONSTRAINT "checklist_template_items_template_id_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_type_id_demand_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."demand_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_runs" ADD CONSTRAINT "routine_runs_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_runs" ADD CONSTRAINT "routine_runs_demand_id_demands_id_fk" FOREIGN KEY ("demand_id") REFERENCES "public"."demands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_type_id_demand_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."demand_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_template_id_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_demand_id_demands_id_fk" FOREIGN KEY ("demand_id") REFERENCES "public"."demands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timers" ADD CONSTRAINT "timers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timers" ADD CONSTRAINT "timers_demand_id_demands_id_fk" FOREIGN KEY ("demand_id") REFERENCES "public"."demands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checklist_misses_tpl_idx" ON "checklist_misses" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "checklist_template_items_tpl_idx" ON "checklist_template_items" USING btree ("template_id","version");--> statement-breakpoint
CREATE INDEX "time_entries_user_day_idx" ON "time_entries" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "time_entries_demand_idx" ON "time_entries" USING btree ("demand_id");--> statement-breakpoint
ALTER TABLE "demand_checklist_items" ADD CONSTRAINT "demand_checklist_items_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;