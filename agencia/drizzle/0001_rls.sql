-- Defesa em profundidade (Supabase): o navegador nunca acessa o banco direto;
-- todo acesso passa pelo servidor Next.js, que aplica o escopo (src/server/scope.ts).
-- RLS habilitado SEM políticas para anon/authenticated: a API REST automática do
-- Supabase não devolve nenhuma linha, mesmo que a chave pública vaze.
ALTER TABLE "agencies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "brands" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chains" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "correction_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "issue_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "occurrences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "route_stops" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "routes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rupture_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ruptures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "schedule_brands" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "store_brands" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "store_products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "unregistered_products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_brands" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_stores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "visits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_manager_fk" FOREIGN KEY ("manager_id") REFERENCES "users"("id");
