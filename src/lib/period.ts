/**
 * Un equipo queda "pendiente" desde el 1er día del último mes de ciclo que ya
 * pasó (según start_month/start_year + frequency_months del plan) hasta que
 * exista una maintenance completada con completed_at >= esa fecha. Así un
 * equipo atrasado sigue apareciendo como pendiente en vez de desaparecer al
 * cambiar de mes.
 */
export function lastDueDate(plan: { frequency_months: number; start_month: number; start_year: number }, today = new Date()): Date | null {
  const start = new Date(plan.start_year, plan.start_month - 1, 1);
  if (start > today) return null;

  const monthsSinceStart = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
  const cyclesElapsed = Math.floor(monthsSinceStart / plan.frequency_months);
  const dueMonthsOffset = cyclesElapsed * plan.frequency_months;

  return new Date(start.getFullYear(), start.getMonth() + dueMonthsOffset, 1);
}
