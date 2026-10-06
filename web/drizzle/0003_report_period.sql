DROP INDEX "weekly_client_period_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_client_period_uq" ON "weekly_reports" USING btree ("client_id","period_start","period_end");