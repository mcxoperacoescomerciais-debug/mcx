CREATE TABLE "improvement_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"user_name" text NOT NULL,
	"user_role" text NOT NULL,
	"origin" text,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"reply" text,
	"analysis_status" text DEFAULT 'pending' NOT NULL,
	"analysis" jsonb,
	"analysis_error" text,
	"analyzed_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "improvement_requests" ADD CONSTRAINT "improvement_requests_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement_requests" ADD CONSTRAINT "improvement_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "improvement_requests_created_idx" ON "improvement_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "improvement_requests_user_idx" ON "improvement_requests" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "improvement_requests" ENABLE ROW LEVEL SECURITY;
