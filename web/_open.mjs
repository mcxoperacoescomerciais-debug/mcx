import { PGlite } from "@electric-sql/pglite";
const db = new PGlite(process.argv[2], { debug: 1 });
try { await db.waitReady; console.log((await db.query("select count(*) from visits")).rows); } catch (e) { console.error("ERRO:", e); }
