ALTER TABLE "attendances" ADD COLUMN "report_link_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "attendances_report_link_uq" ON "attendances" USING btree ("report_link_id");