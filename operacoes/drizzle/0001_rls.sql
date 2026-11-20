-- Defesa em profundidade (Supabase): o navegador nunca acessa o banco direto.
-- RLS ligado SEM politicas: a API REST automatica do Supabase nao devolve nenhuma linha.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_brands" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "demand_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "demands" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "demand_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "demand_checklist_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "demand_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "demand_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;
