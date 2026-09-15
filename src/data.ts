export type EquipmentStatus = "pending" | "done";
export type CheckStatus = "ok" | "warning" | "pending";

export interface CheckPoint {
  id: string;
  label: string;
  description: string;
}

export interface CheckResult {
  checkId: string;
  status: "ok" | "warning";
  comment: string;
}

export interface Equipment {
  id: string;
  description: string;
  location: string;
  status: EquipmentStatus;
  brand: string;
  model: string;
  lastMaintenance: string;
  checkResults?: CheckResult[];
  photoDataUrl?: string;
  completedAt?: string;
}

export const CHECKPOINTS: CheckPoint[] = [
  { id: "cp1", label: "Filtros de aire", description: "Verificar limpieza y estado de filtros. Limpiar o reemplazar si es necesario." },
  { id: "cp2", label: "Serpentín evaporador", description: "Inspeccionar serpentín por suciedad, corrosión o daños físicos." },
  { id: "cp3", label: "Serpentín condensador", description: "Revisar limpieza del serpentín exterior. Verificar que no esté obstruido." },
  { id: "cp4", label: "Compresor", description: "Verificar ruido inusual, vibraciones y temperatura superficial del compresor." },
  { id: "cp5", label: "Nivel de refrigerante", description: "Comprobar presión de gases. Detectar posibles fugas con detector." },
  { id: "cp6", label: "Drenaje y bandeja", description: "Verificar que el drenaje esté libre y la bandeja sin acumulación de agua." },
  { id: "cp7", label: "Sistema eléctrico", description: "Revisar conexiones, terminales y estado del tablero eléctrico." },
  { id: "cp8", label: "Ventiladores y motores", description: "Verificar estado de aspas, rodamientos y corriente de los motores." },
];

export const INITIAL_EQUIPMENT: Equipment[] = [
  {
    id: "AC-001",
    description: "Split Inverter 18.000 BTU",
    location: "Oficina Gerencia - Piso 3",
    status: "pending",
    brand: "Daikin",
    model: "FTXS18LVMA",
    lastMaintenance: "12/03/2026",
  },
  {
    id: "AC-002",
    description: "Cassette 24.000 BTU",
    location: "Sala de Reuniones A - Piso 2",
    status: "pending",
    brand: "Mitsubishi",
    model: "PL-24EA",
    lastMaintenance: "10/03/2026",
  },
  {
    id: "AC-003",
    description: "Condensadora Central",
    location: "Azotea - Torre Norte",
    status: "pending",
    brand: "Carrier",
    model: "38CKS036",
    lastMaintenance: "01/02/2026",
  },
  {
    id: "AC-004",
    description: "Split 12.000 BTU",
    location: "Recepción Principal - Piso 1",
    status: "pending",
    brand: "LG",
    model: "LS-Q12YNZA",
    lastMaintenance: "15/03/2026",
  },
  {
    id: "AC-005",
    description: "Manejadora de Aire 36.000 BTU",
    location: "Data Center - Subsuelo",
    status: "done",
    brand: "York",
    model: "YHME036",
    lastMaintenance: "11/09/2026",
    completedAt: "11/09/2026 08:30",
  },
  {
    id: "AC-006",
    description: "Split Inverter 9.000 BTU",
    location: "Sala de Descanso - Piso 2",
    status: "done",
    brand: "Midea",
    model: "MSA09CRN",
    lastMaintenance: "11/09/2026",
    completedAt: "11/09/2026 09:15",
  },
];
