CREATE TABLE "stock_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"ref_key" text NOT NULL,
	"demand_id" uuid NOT NULL,
	"day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"counted" integer NOT NULL,
	"balance_at_count" integer NOT NULL,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"user_id" uuid NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"brand" text,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"unit" text DEFAULT 'un' NOT NULL,
	"min_quantity" integer DEFAULT 0 NOT NULL,
	"location" text,
	"tracks_expiry" boolean DEFAULT false NOT NULL,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_items_category_ck" CHECK ("stock_items"."category" in ('product','disposable','pdv','equipment'))
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"delta" integer NOT NULL,
	"day" date NOT NULL,
	"counterpart" text,
	"reference" text,
	"lot" text,
	"expires_on" date,
	"city" text,
	"store" text,
	"promoter" text,
	"reason" text,
	"demand_id" uuid,
	"checklist_item_id" uuid,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_kind_ck" CHECK ("stock_movements"."kind" in ('in','out','return','adjust','loss')),
	CONSTRAINT "stock_movements_delta_ck" CHECK ("stock_movements"."delta" <> 0)
);
--> statement-breakpoint
CREATE TABLE "stock_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"label" text NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"holder" text,
	"due_back" date,
	"demand_id" uuid,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_units_status_ck" CHECK ("stock_units"."status" in ('available','in_use','maintenance'))
);
--> statement-breakpoint
ALTER TABLE "checklist_template_items" ADD COLUMN "stock_item_id" uuid;--> statement-breakpoint
ALTER TABLE "demand_checklist_items" ADD COLUMN "stock_item_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_demand_id_demands_id_fk" FOREIGN KEY ("demand_id") REFERENCES "public"."demands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_item_id_stock_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_stock_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_demand_id_demands_id_fk" FOREIGN KEY ("demand_id") REFERENCES "public"."demands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_units" ADD CONSTRAINT "stock_units_item_id_stock_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_units" ADD CONSTRAINT "stock_units_demand_id_demands_id_fk" FOREIGN KEY ("demand_id") REFERENCES "public"."demands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_alerts_day_uq" ON "stock_alerts" USING btree ("kind","ref_key","day");--> statement-breakpoint
CREATE INDEX "stock_counts_item_idx" ON "stock_counts" USING btree ("item_id","status");--> statement-breakpoint
CREATE INDEX "stock_items_client_idx" ON "stock_items" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "stock_movements_item_idx" ON "stock_movements" USING btree ("item_id","day");--> statement-breakpoint
CREATE INDEX "stock_movements_demand_idx" ON "stock_movements" USING btree ("demand_id");--> statement-breakpoint
CREATE INDEX "stock_units_item_idx" ON "stock_units" USING btree ("item_id");