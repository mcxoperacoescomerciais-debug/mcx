CREATE TABLE "agencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agencies_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "attendances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"visit_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"activities_done" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"exception_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exception_reason" text,
	"exception_note" text,
	"cancel_reason" text,
	"review_status" text DEFAULT 'none' NOT NULL,
	"review_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "attendances_status_ck" CHECK ("attendances"."status" in ('in_progress','completed','correction_requested','cancelled')),
	CONSTRAINT "attendances_finish_ck" CHECK ("attendances"."finished_at" is null or "attendances"."finished_at" >= "attendances"."started_at"),
	CONSTRAINT "attendances_exception_ck" CHECK (jsonb_array_length("attendances"."exception_items") = 0 or ("attendances"."exception_reason" is not null and length(coalesce("attendances"."exception_note", '')) >= 5)),
	CONSTRAINT "attendances_cancel_ck" CHECK ("attendances"."status" <> 'cancelled' or length(coalesce("attendances"."cancel_reason", '')) >= 5)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"user_id" uuid,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"reason" text,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"min_before_photos" integer DEFAULT 1 NOT NULL,
	"min_after_photos" integer DEFAULT 1 NOT NULL,
	"require_stock" boolean DEFAULT true NOT NULL,
	"rupture_photo_required" boolean DEFAULT false NOT NULL,
	"allow_gallery" boolean DEFAULT true NOT NULL,
	"activities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "brands_photos_ck" CHECK ("brands"."min_before_photos" between 0 and 10 and "brands"."min_after_photos" between 0 and 10)
);
--> statement-breakpoint
CREATE TABLE "chains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "correction_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"attendance_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"requested_by" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	"answered_by" uuid,
	"snapshot" jsonb
);
--> statement-breakpoint
CREATE TABLE "issue_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"issue_key" text NOT NULL,
	"status" text NOT NULL,
	"action" text NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "occurrences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"attendance_id" uuid NOT NULL,
	"category" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"action" text,
	"handled_by" uuid,
	"handled_at" timestamp with time zone,
	"recorded_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"attendance_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"rupture_id" uuid,
	"occurrence_id" uuid,
	"source" text DEFAULT 'camera' NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"uploaded_at" timestamp with time zone,
	"storage_key" text,
	"thumb_key" text,
	"content_type" text,
	"bytes" integer,
	"width" integer,
	"height" integer,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "photos_kind_ck" CHECK ("photos"."kind" in ('before','after','rupture','occurrence')),
	CONSTRAINT "photos_upload_ck" CHECK ("photos"."uploaded_at" is null or "photos"."storage_key" is not null)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"sku" text NOT NULL,
	"ean" text,
	"category" text,
	"variant" text,
	"package" text,
	"unit" text DEFAULT 'un' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "products_unit_ck" CHECK ("products"."unit" in ('un','pct','cx','fd','kg','dp'))
);
--> statement-breakpoint
CREATE TABLE "route_stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	"planned_start" text,
	"brand_ids" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" text NOT NULL,
	"region" text,
	"promoter_id" uuid,
	"weekdays" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "rupture_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rupture_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"action" text,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ruptures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"attendance_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"situation" text NOT NULL,
	"known_stock" integer,
	"note" text,
	"from_stock_suggestion" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"resolution_action" text,
	"resolved_at" timestamp with time zone,
	"recorded_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "ruptures_situation_ck" CHECK ("ruptures"."situation" in ('shelf_empty','backroom_empty','missing_display','registered_not_found','unavailable_other','unconfirmed')),
	CONSTRAINT "ruptures_status_ck" CHECK ("ruptures"."status" in ('new','analysis','treatment','resolved','not_confirmed','closed')),
	CONSTRAINT "ruptures_known_stock_ck" CHECK ("ruptures"."known_stock" is null or "ruptures"."known_stock" >= 0)
);
--> statement-breakpoint
CREATE TABLE "schedule_brands" (
	"schedule_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	CONSTRAINT "schedule_brands_schedule_id_brand_id_pk" PRIMARY KEY("schedule_id","brand_id")
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"promoter_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"date" date NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	"planned_start" text,
	"planned_end" text,
	"route_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"cancel_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "schedules_time_ck" CHECK (("schedules"."planned_start" is null or "schedules"."planned_start" ~ '^[0-2][0-9]:[0-5][0-9]$'))
);
--> statement-breakpoint
CREATE TABLE "stock_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"attendance_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"state" text NOT NULL,
	"quantity" integer,
	"unit" text NOT NULL,
	"note" text,
	"recorded_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "stock_state_ck" CHECK ("stock_entries"."state" in ('quantity','zero','not_found','not_applicable')),
	CONSTRAINT "stock_quantity_ck" CHECK (("stock_entries"."state" = 'quantity' and "stock_entries"."quantity" > 0) or ("stock_entries"."state" = 'zero' and "stock_entries"."quantity" = 0) or ("stock_entries"."state" in ('not_found','not_applicable') and "stock_entries"."quantity" is null))
);
--> statement-breakpoint
CREATE TABLE "store_brands" (
	"store_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_brands_store_id_brand_id_pk" PRIMARY KEY("store_id","brand_id")
);
--> statement-breakpoint
CREATE TABLE "store_products" (
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_products_store_id_product_id_pk" PRIMARY KEY("store_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"chain_id" uuid,
	"name" text NOT NULL,
	"code" text,
	"cnpj" text,
	"address" text,
	"district" text,
	"city" text NOT NULL,
	"state" text DEFAULT 'MG' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"status" text DEFAULT 'active' NOT NULL,
	"rules" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "unregistered_products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"attendance_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" integer,
	"note" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "user_brands" (
	"user_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_brands_user_id_brand_id_pk" PRIMARY KEY("user_id","brand_id")
);
--> statement-breakpoint
CREATE TABLE "user_stores" (
	"user_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_stores_user_id_store_id_pk" PRIMARY KEY("user_id","store_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"role" text NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"email" text,
	"phone" text,
	"internal_code" text,
	"employment" text,
	"region" text,
	"manager_id" uuid,
	"all_brands" boolean DEFAULT true NOT NULL,
	"team_only" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"session_version" integer DEFAULT 1 NOT NULL,
	"last_login_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "users_role_ck" CHECK ("users"."role" in ('admin','manager','promoter')),
	CONSTRAINT "users_employment_ck" CHECK ("users"."employment" is null or "users"."employment" in ('fixed','freelancer'))
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"promoter_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"schedule_id" uuid,
	"visit_date" date NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"origin" text DEFAULT 'scheduled' NOT NULL,
	"extra_reason" text,
	"close_reason" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"lat" double precision,
	"lng" double precision,
	"accuracy_m" double precision,
	"geo_status" text,
	"notes" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "visits_status_ck" CHECK ("visits"."status" in ('in_progress','completed','closed_incomplete','cancelled')),
	CONSTRAINT "visits_close_reason_ck" CHECK ("visits"."status" <> 'closed_incomplete' or length(coalesce("visits"."close_reason", '')) >= 5),
	CONSTRAINT "visits_extra_ck" CHECK ("visits"."origin" <> 'extra' or length(coalesce("visits"."extra_reason", '')) >= 5),
	CONSTRAINT "visits_finish_ck" CHECK ("visits"."finished_at" is null or "visits"."finished_at" >= "visits"."started_at")
);
--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chains" ADD CONSTRAINT "chains_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_attendance_id_attendances_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_reviews" ADD CONSTRAINT "issue_reviews_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrences_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrences_attendance_id_attendances_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_attendance_id_attendances_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_promoter_id_users_id_fk" FOREIGN KEY ("promoter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rupture_events" ADD CONSTRAINT "rupture_events_rupture_id_ruptures_id_fk" FOREIGN KEY ("rupture_id") REFERENCES "public"."ruptures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruptures" ADD CONSTRAINT "ruptures_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruptures" ADD CONSTRAINT "ruptures_attendance_id_attendances_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruptures" ADD CONSTRAINT "ruptures_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_brands" ADD CONSTRAINT "schedule_brands_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_brands" ADD CONSTRAINT "schedule_brands_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_promoter_id_users_id_fk" FOREIGN KEY ("promoter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_entries" ADD CONSTRAINT "stock_entries_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_entries" ADD CONSTRAINT "stock_entries_attendance_id_attendances_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_entries" ADD CONSTRAINT "stock_entries_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_brands" ADD CONSTRAINT "store_brands_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_brands" ADD CONSTRAINT "store_brands_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unregistered_products" ADD CONSTRAINT "unregistered_products_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unregistered_products" ADD CONSTRAINT "unregistered_products_attendance_id_attendances_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_brands" ADD CONSTRAINT "user_brands_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_brands" ADD CONSTRAINT "user_brands_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stores" ADD CONSTRAINT "user_stores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stores" ADD CONSTRAINT "user_stores_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_promoter_id_users_id_fk" FOREIGN KEY ("promoter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendances_visit_brand_uq" ON "attendances" USING btree ("visit_id","brand_id");--> statement-breakpoint
CREATE INDEX "attendances_agency_idx" ON "attendances" USING btree ("agency_id","status");--> statement-breakpoint
CREATE INDEX "attendances_brand_idx" ON "attendances" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "audit_agency_created_idx" ON "audit_logs" USING btree ("agency_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_agency_code_uq" ON "brands" USING btree ("agency_id",lower("code"));--> statement-breakpoint
CREATE UNIQUE INDEX "brands_agency_name_uq" ON "brands" USING btree ("agency_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "chains_agency_name_uq" ON "chains" USING btree ("agency_id",lower("name"));--> statement-breakpoint
CREATE INDEX "corrections_attendance_idx" ON "correction_requests" USING btree ("attendance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "corrections_one_open_uq" ON "correction_requests" USING btree ("attendance_id") WHERE "correction_requests"."status" = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "issue_reviews_key_uq" ON "issue_reviews" USING btree ("agency_id","issue_key");--> statement-breakpoint
CREATE INDEX "occurrences_attendance_idx" ON "occurrences" USING btree ("attendance_id");--> statement-breakpoint
CREATE INDEX "occurrences_agency_status_idx" ON "occurrences" USING btree ("agency_id","status");--> statement-breakpoint
CREATE INDEX "photos_attendance_idx" ON "photos" USING btree ("attendance_id","kind");--> statement-breakpoint
CREATE INDEX "photos_agency_created_idx" ON "photos" USING btree ("agency_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "products_brand_sku_uq" ON "products" USING btree ("brand_id",lower("sku"));--> statement-breakpoint
CREATE UNIQUE INDEX "products_brand_namekey_uq" ON "products" USING btree ("brand_id","name_key");--> statement-breakpoint
CREATE INDEX "products_agency_idx" ON "products" USING btree ("agency_id","brand_id");--> statement-breakpoint
CREATE INDEX "route_stops_route_idx" ON "route_stops" USING btree ("route_id");--> statement-breakpoint
CREATE UNIQUE INDEX "route_stops_uq" ON "route_stops" USING btree ("route_id","store_id");--> statement-breakpoint
CREATE INDEX "routes_agency_idx" ON "routes" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "rupture_events_rupture_idx" ON "rupture_events" USING btree ("rupture_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ruptures_attendance_product_uq" ON "ruptures" USING btree ("attendance_id","product_id") WHERE "ruptures"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ruptures_agency_status_idx" ON "ruptures" USING btree ("agency_id","status");--> statement-breakpoint
CREATE INDEX "ruptures_product_idx" ON "ruptures" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "schedule_brands_brand_idx" ON "schedule_brands" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "schedules_agency_date_idx" ON "schedules" USING btree ("agency_id","date");--> statement-breakpoint
CREATE INDEX "schedules_promoter_date_idx" ON "schedules" USING btree ("promoter_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "schedules_active_uq" ON "schedules" USING btree ("promoter_id","date","store_id") WHERE "schedules"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "stock_attendance_product_uq" ON "stock_entries" USING btree ("attendance_id","product_id");--> statement-breakpoint
CREATE INDEX "stock_product_idx" ON "stock_entries" USING btree ("product_id","recorded_at");--> statement-breakpoint
CREATE INDEX "store_brands_brand_idx" ON "store_brands" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "store_products_product_idx" ON "store_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "stores_agency_idx" ON "stores" USING btree ("agency_id","status");--> statement-breakpoint
CREATE INDEX "stores_chain_idx" ON "stores" USING btree ("chain_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stores_agency_code_uq" ON "stores" USING btree ("agency_id","chain_id","code") WHERE "stores"."code" is not null;--> statement-breakpoint
CREATE INDEX "unregistered_attendance_idx" ON "unregistered_products" USING btree ("attendance_id");--> statement-breakpoint
CREATE INDEX "user_brands_brand_idx" ON "user_brands" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "user_stores_store_idx" ON "user_stores" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_uq" ON "users" USING btree (lower("username"));--> statement-breakpoint
CREATE INDEX "users_agency_role_idx" ON "users" USING btree ("agency_id","role");--> statement-breakpoint
CREATE INDEX "visits_agency_date_idx" ON "visits" USING btree ("agency_id","visit_date");--> statement-breakpoint
CREATE INDEX "visits_promoter_date_idx" ON "visits" USING btree ("promoter_id","visit_date");--> statement-breakpoint
CREATE INDEX "visits_store_date_idx" ON "visits" USING btree ("store_id","visit_date");--> statement-breakpoint
CREATE UNIQUE INDEX "visits_schedule_uq" ON "visits" USING btree ("schedule_id") WHERE "visits"."schedule_id" is not null and "visits"."status" <> 'cancelled';--> statement-breakpoint
CREATE UNIQUE INDEX "visits_one_open_uq" ON "visits" USING btree ("promoter_id") WHERE "visits"."status" = 'in_progress';