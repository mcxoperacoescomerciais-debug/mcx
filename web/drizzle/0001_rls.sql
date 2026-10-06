-- Defesa em profundidade para o Supabase: o navegador nunca acessa o banco
-- diretamente (todo acesso passa pelo servidor Next.js, que conecta com o
-- usuário do banco e aplica o escopo em src/server/scope.ts). Habilitar RLS
-- SEM políticas para os papéis "anon"/"authenticated" garante que a API REST
-- automática do Supabase não devolva nenhuma linha, mesmo se a chave pública vazar.
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "networks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "store_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "visits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "occurrences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "occurrence_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "occurrence_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "weekly_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
