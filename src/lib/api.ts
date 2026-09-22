import { supabase } from "./supabaseClient";
import { lastDueDate } from "./period";
import type { MaintenanceResult, PointStatus } from "./database.types";

export interface EquipmentView {
  id: string;
  equipmentTypeId: string;
  code: string;
  description: string;
  location: string;
  brand: string;
  model: string;
  status: "pending" | "done";
  hasWarnings: boolean;
  completedAt: string | null;
  maintenanceId: string | null;
}

export interface ReviewPointView {
  id: string;
  code: string;
  label: string;
  description: string;
  mandatory: boolean;
  photoRequired: boolean;
  commentsAllowed: boolean;
}

export async function fetchEquipmentForOperator(clientIds: string[]): Promise<EquipmentView[]> {
  if (clientIds.length === 0) return [];

  const { data: types, error: typesErr } = await supabase
    .from("equipment_types")
    .select("id, client_id")
    .in("client_id", clientIds)
    .eq("active", true);
  if (typesErr) throw typesErr;
  if (!types || types.length === 0) return [];

  const typeIds = types.map((t) => t.id);
  const { data: plans, error: plansErr } = await supabase
    .from("maintenance_plans")
    .select("equipment_type_id, frequency_months, start_month, start_year")
    .in("equipment_type_id", typeIds)
    .eq("active", true);
  if (plansErr) throw plansErr;

  const today = new Date();
  const dueDateByType = new Map<string, Date>();
  for (const plan of plans ?? []) {
    const due = lastDueDate(plan, today);
    if (due) dueDateByType.set(plan.equipment_type_id, due);
  }

  const dueTypeIds = [...dueDateByType.keys()];
  if (dueTypeIds.length === 0) return [];

  const { data: equipment, error: eqErr } = await supabase
    .from("equipment")
    .select("id, equipment_type_id, code, description, location, brand, model")
    .in("equipment_type_id", dueTypeIds)
    .eq("active", true);
  if (eqErr) throw eqErr;
  if (!equipment || equipment.length === 0) return [];

  const equipmentIds = equipment.map((e) => e.id);
  const { data: maintenances, error: mErr } = await supabase
    .from("maintenances")
    .select("id, equipment_id, completed_at, overall_result")
    .in("equipment_id", equipmentIds)
    .eq("status", "completed")
    .order("completed_at", { ascending: false });
  if (mErr) throw mErr;

  const latestCompletedByEquipment = new Map<string, { id: string; completed_at: string; overall_result: MaintenanceResult | null }>();
  for (const m of maintenances ?? []) {
    if (!m.completed_at) continue;
    if (!latestCompletedByEquipment.has(m.equipment_id)) {
      latestCompletedByEquipment.set(m.equipment_id, { id: m.id, completed_at: m.completed_at, overall_result: m.overall_result });
    }
  }

  return equipment.map((e): EquipmentView => {
    const due = dueDateByType.get(e.equipment_type_id)!;
    const latest = latestCompletedByEquipment.get(e.id);
    const isDone = !!latest && new Date(latest.completed_at) >= due;

    return {
      id: e.id,
      equipmentTypeId: e.equipment_type_id,
      code: e.code,
      description: e.description ?? "",
      location: e.location ?? "",
      brand: e.brand ?? "",
      model: e.model ?? "",
      status: isDone ? "done" : "pending",
      hasWarnings: isDone && latest!.overall_result !== "ok",
      completedAt: isDone ? latest!.completed_at : null,
      maintenanceId: isDone ? latest!.id : null,
    };
  });
}

export interface MaintenanceDetailItem {
  reviewPointId: string;
  label: string;
  description: string;
  status: PointStatus;
  comment: string;
}

export interface MaintenanceDetail {
  completedAt: string | null;
  overallResult: MaintenanceResult | null;
  photoUrl: string | null;
  items: MaintenanceDetailItem[];
}

export async function fetchMaintenanceDetail(maintenanceId: string): Promise<MaintenanceDetail> {
  const [itemsRes, photosRes, maintenanceRes] = await Promise.all([
    supabase
      .from("maintenance_items")
      .select("review_point_id, client_description, operator_description, status, comments, display_order")
      .eq("maintenance_id", maintenanceId)
      .order("display_order", { ascending: true }),
    supabase.from("maintenance_photos").select("file_url").eq("maintenance_id", maintenanceId).limit(1),
    supabase.from("maintenances").select("completed_at, overall_result").eq("id", maintenanceId).single(),
  ]);
  if (itemsRes.error) throw itemsRes.error;
  if (photosRes.error) throw photosRes.error;
  if (maintenanceRes.error) throw maintenanceRes.error;

  return {
    completedAt: maintenanceRes.data?.completed_at ?? null,
    overallResult: maintenanceRes.data?.overall_result ?? null,
    photoUrl: photosRes.data?.[0]?.file_url ?? null,
    items: (itemsRes.data ?? []).map((it) => ({
      reviewPointId: it.review_point_id,
      label: it.client_description,
      description: it.operator_description,
      status: it.status,
      comment: it.comments ?? "",
    })),
  };
}

export async function fetchReviewPoints(equipmentTypeId: string): Promise<ReviewPointView[]> {
  const { data, error } = await supabase
    .from("review_points")
    .select("id, code, operator_description, client_description, mandatory, photo_required, comments_allowed, display_order")
    .eq("equipment_type_id", equipmentTypeId)
    .eq("active", true)
    .order("display_order", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((p) => ({
    id: p.id,
    code: p.code,
    label: p.client_description,
    description: p.operator_description,
    mandatory: p.mandatory,
    photoRequired: p.photo_required,
    commentsAllowed: p.comments_allowed,
  }));
}

export interface FinishMaintenanceInput {
  equipmentId: string;
  operatorId: string;
  startedAt: Date;
  items: { reviewPointId: string; status: PointStatus; comment: string }[];
  reviewPoints: ReviewPointView[];
  photoFile: File;
}

export async function finishMaintenance(input: FinishMaintenanceInput): Promise<void> {
  const overallResult: MaintenanceResult = input.items.some((i) => i.status === "critical")
    ? "critical"
    : input.items.some((i) => i.status === "warning")
      ? "warning"
      : "ok";

  // El cron del admin ya deja una mantención "pending" por equipo; se reutiliza
  // esa fila. Un trigger en la base crea sus maintenance_items al insertarla.
  const { data: openRows, error: openErr } = await supabase
    .from("maintenances")
    .select("id")
    .eq("equipment_id", input.equipmentId)
    .in("status", ["pending", "in_progress"])
    .order("scheduled_date", { ascending: false })
    .limit(1);
  if (openErr) throw new Error(`Buscar mantención: ${openErr.message}`);

  const existingId = openRows?.[0]?.id;
  const maintenanceId = existingId ?? crypto.randomUUID();

  // La foto se sube primero: si falla, no queda nada a medias en la base.
  const ext = input.photoFile.name.split(".").pop() || "jpg";
  const path = `${maintenanceId}/equipo.${ext}`;
  const { error: uploadErr } = await supabase.storage.from("maintenance-photos").upload(path, input.photoFile, {
    contentType: input.photoFile.type,
    upsert: true,
  });
  if (uploadErr) throw new Error(`Subida de foto: ${uploadErr.message}`);

  const { data: publicUrl } = supabase.storage.from("maintenance-photos").getPublicUrl(path);

  if (!existingId) {
    const { error: insErr } = await supabase.from("maintenances").insert({
      id: maintenanceId,
      equipment_id: input.equipmentId,
      assigned_to: input.operatorId,
      scheduled_date: new Date().toISOString().slice(0, 10),
      started_at: input.startedAt.toISOString(),
      status: "in_progress",
    });
    if (insErr) throw new Error(`Registro de mantención: ${insErr.message}`);
  }

  const reviewedAt = new Date().toISOString();
  const itemResults = await Promise.all(
    input.items.map((item) =>
      supabase
        .from("maintenance_items")
        .update({ status: item.status, comments: item.comment || null, reviewed_at: reviewedAt })
        .eq("maintenance_id", maintenanceId)
        .eq("review_point_id", item.reviewPointId)
    )
  );
  const itemErr = itemResults.find((r) => r.error)?.error;
  if (itemErr) throw new Error(`Puntos de revisión: ${itemErr.message}`);

  const { error: photoErr } = await supabase.from("maintenance_photos").insert({
    maintenance_id: maintenanceId,
    review_point_id: null,
    file_url: publicUrl.publicUrl,
    photo_type: "evidence",
  });
  if (photoErr) throw new Error(`Registro de foto: ${photoErr.message}`);

  const { error: doneErr } = await supabase
    .from("maintenances")
    .update({
      assigned_to: input.operatorId,
      started_at: input.startedAt.toISOString(),
      completed_at: new Date().toISOString(),
      status: "completed",
      overall_result: overallResult,
    })
    .eq("id", maintenanceId);
  if (doneErr) throw new Error(`Cerrar mantención: ${doneErr.message}`);
}
