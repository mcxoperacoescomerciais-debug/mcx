import { site } from "@/config/site";

/**
 * Endereço base usado em metadados, sitemap e robots. Enquanto o domínio não
 * estiver definido, usa o endereço local de desenvolvimento.
 */
export const urlBase = (site.url || "http://localhost:3400").replace(/\/+$/, "");
