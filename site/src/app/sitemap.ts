import type { MetadataRoute } from "next";
import { urlBase } from "@/lib/url";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${urlBase}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${urlBase}/politica-de-privacidade/`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
