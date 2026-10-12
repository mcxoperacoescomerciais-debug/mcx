"use server";

import { revalidatePath } from "next/cache";
import { getScope } from "@/server/auth";
import * as sch from "@/server/schedules";
import type { FormState } from "../actions";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const done = (r: Awaited<ReturnType<typeof sch.createSchedule>>): FormState => {
  if (r.ok) revalidatePath("/painel", "layout");
  return r;
};

export async function createScheduleAction(_: FormState, fd: FormData): Promise<FormState> {
  return done(
    await sch.createSchedule(await getScope(), {
      promoterId: str(fd, "promoterId"),
      storeId: str(fd, "storeId"),
      date: str(fd, "date"),
      plannedStart: str(fd, "plannedStart") || null,
      brandIds: fd.getAll("brandIds").map(String),
      notes: str(fd, "notes") || null,
    }),
  );
}

export async function updateScheduleAction(_: FormState, fd: FormData): Promise<FormState> {
  return done(await sch.updateSchedule(await getScope(), str(fd, "id"), { plannedStart: str(fd, "plannedStart") || null, brandIds: fd.getAll("brandIds").map(String) }, str(fd, "reason")));
}

export async function cancelScheduleAction(_: FormState, fd: FormData): Promise<FormState> {
  return done(await sch.cancelSchedule(await getScope(), str(fd, "id"), str(fd, "reason")));
}

export async function moveScheduleAction(fd: FormData): Promise<void> {
  await sch.moveSchedule(await getScope(), str(fd, "id"), str(fd, "dir") === "up" ? -1 : 1);
  revalidatePath("/painel/programacao");
}

export async function generateAction(_: FormState, fd: FormData): Promise<FormState> {
  return done(await sch.generateFromRoutes(await getScope(), str(fd, "from"), str(fd, "to")));
}

export async function saveRouteAction(_: FormState, fd: FormData): Promise<FormState> {
  const storeIds = fd.getAll("stopStore").map(String);
  const times = fd.getAll("stopTime").map(String);
  return done(
    await sch.saveRoute(
      await getScope(),
      {
        id: str(fd, "id") || null,
        name: str(fd, "name"),
        region: str(fd, "region") || null,
        promoterId: str(fd, "promoterId") || null,
        weekdays: fd.getAll("weekdays").map(Number).filter((n) => n >= 0 && n <= 6),
        status: str(fd, "status") === "inactive" ? "inactive" : "active",
        stops: storeIds.map((storeId, i) => ({ storeId, plannedStart: times[i] || null })).filter((x) => x.storeId),
      },
      str(fd, "reason"),
    ),
  );
}
