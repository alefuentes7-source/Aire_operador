/**
 * Un equipo aparece en la lista del operador solo en los meses en que le toca
 * mantención según su plan (start_month/start_year + frequency_months). Mismo
 * criterio que el calendario del panel admin. Devuelve el 1er día del mes
 * actual si toca, o null si no.
 */
export function dueThisMonth(plan: { frequency_months: number; start_month: number; start_year: number }, today = new Date()): Date | null {
  const offset = (today.getFullYear() - plan.start_year) * 12 + (today.getMonth() + 1 - plan.start_month);
  if (offset < 0 || offset % plan.frequency_months !== 0) return null;
  return new Date(today.getFullYear(), today.getMonth(), 1);
}
