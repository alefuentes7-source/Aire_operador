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
    .select("equipment_id, completed_at, overall_result")
    .in("equipment_id", equipmentIds)
    .eq("status", "completed")
    .order("completed_at", { ascending: false });
  if (mErr) throw mErr;

  const latestCompletedByEquipment = new Map<string, { completed_at: string; overall_result: MaintenanceResult | null }>();
  for (const m of maintenances ?? []) {
    if (!m.completed_at) continue;
    if (!latestCompletedByEquipment.has(m.equipment_id)) {
      latestCompletedByEquipment.set(m.equipment_id, { completed_at: m.completed_at, overall_result: m.overall_result });
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
    };
  });
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

  const { data: maintenance, error: mErr } = await supabase
    .from("maintenances")
    .insert({
      equipment_id: input.equipmentId,
      assigned_to: input.operatorId,
      scheduled_date: new Date().toISOString().slice(0, 10),
      started_at: input.startedAt.toISOString(),
      completed_at: new Date().toISOString(),
      status: "completed",
      overall_result: overallResult,
    })
    .select("id")
    .single();
  if (mErr) throw mErr;

  const pointById = new Map(input.reviewPoints.map((p) => [p.id, p]));
  const itemsPayload = input.items.map((item, index) => {
    const point = pointById.get(item.reviewPointId)!;
    return {
      maintenance_id: maintenance.id,
      review_point_id: item.reviewPointId,
      code: point.code,
      client_description: point.label,
      operator_description: point.description,
      display_order: index,
      status: item.status,
      comments: item.comment || null,
      reviewed_at: new Date().toISOString(),
    };
  });

  const { error: itemsErr } = await supabase.from("maintenance_items").insert(itemsPayload);
  if (itemsErr) throw itemsErr;

  const ext = input.photoFile.name.split(".").pop() || "jpg";
  const path = `${maintenance.id}/equipo.${ext}`;
  const { error: uploadErr } = await supabase.storage.from("maintenance-photos").upload(path, input.photoFile, {
    upsert: true,
    contentType: input.photoFile.type,
  });
  if (uploadErr) throw uploadErr;

  const { data: publicUrl } = supabase.storage.from("maintenance-photos").getPublicUrl(path);

  const { error: photoErr } = await supabase.from("maintenance_photos").insert({
    maintenance_id: maintenance.id,
    review_point_id: null,
    file_url: publicUrl.publicUrl,
    photo_type: "equipo",
  });
  if (photoErr) throw photoErr;
}
