CREATE TABLE "product_mixes" (
	"tenant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"network_id" uuid NOT NULL,
	"format" text NOT NULL,
	"product_id" uuid NOT NULL,
	"chain_code" text,
	"seq" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_mixes_network_id_format_product_id_pk" PRIMARY KEY("network_id","format","product_id")
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "reference_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "format" text DEFAULT 'varejo' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_mixes" ADD CONSTRAINT "product_mixes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_mixes" ADD CONSTRAINT "product_mixes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_mixes" ADD CONSTRAINT "product_mixes_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_mixes" ADD CONSTRAINT "product_mixes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mixes_client_idx" ON "product_mixes" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_client_code_uq" ON "products" USING btree ("client_id","code");--> statement-breakpoint
ALTER TABLE "product_mixes" ENABLE ROW LEVEL SECURITY;
