import type { Metadata } from "next";
import { requireRole } from "@/server/auth";
import { PromoterApp } from "./_components/promoter-app";

export const metadata: Metadata = { title: "Promotor" };

export default async function PromoterPage() {
  await requireRole(["promoter"]);
  return <PromoterApp />;
}
