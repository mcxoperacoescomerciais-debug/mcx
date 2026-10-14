CREATE TABLE "product_mixes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"chain_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"name" text NOT NULL,
	"product_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_mixes" (
	"store_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"mix_id" uuid NOT NULL,
	"chosen_by" uuid,
	"chosen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_mixes_store_id_brand_id_pk" PRIMARY KEY("store_id","brand_id")
);
--> statement-breakpoint
ALTER TABLE "product_mixes" ADD CONSTRAINT "product_mixes_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_mixes" ADD CONSTRAINT "product_mixes_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_mixes" ADD CONSTRAINT "product_mixes_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_mixes" ADD CONSTRAINT "store_mixes_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_mixes" ADD CONSTRAINT "store_mixes_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_mixes" ADD CONSTRAINT "store_mixes_mix_id_product_mixes_id_fk" FOREIGN KEY ("mix_id") REFERENCES "public"."product_mixes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_mixes_uq" ON "product_mixes" USING btree ("chain_id","brand_id",lower("name"));--> statement-breakpoint
ALTER TABLE "product_mixes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "store_mixes" ENABLE ROW LEVEL SECURITY;
