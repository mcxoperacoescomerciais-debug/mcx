import type { MetadataRoute } from "next";
import { urlBase } from "@/lib/url";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${urlBase}/sitemap.xml`,
  };
}
