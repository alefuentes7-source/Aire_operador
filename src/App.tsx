import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "./lib/auth";
import { useSimulatedDate, localDateString } from "./lib/simulatedDate";
import {
  fetchEquipmentForOperator,
  fetchReviewPoints,
  finishMaintenance,
  fetchMaintenanceDetail,
  type EquipmentView,
  type ReviewPointView,
  type MaintenanceDetail,
} from "./lib/api";
import type { PointStatus } from "./lib/database.types";

type CheckStatus = "ok" | "warning";

interface Answer {
  status: CheckStatus | null;
  comment: string;
}

type Answers = Record<string, Answer>;

// ── persistencia del wizard en curso ────────────────────────────────────────
// El navegador (sobre todo en el celular) puede recargar la página al volver
// de otra app — por ejemplo al tomar la foto con la cámara nativa, o si el
// sistema descarta la pestaña en segundo plano. Esto guarda el progreso para
// retomarlo automáticamente en vez de perder toda la revisión.

const WIZARD_STORAGE_KEY = "airmaintain:wizard";

interface WizardSnapshot {
  equipmentId: string;
  step: "checks" | "photo";
  currentCheckIndex: number;
  answers: Answers;
  startedAt: string;
}

function loadWizardSnapshot(equipmentId: string): WizardSnapshot | null {
  try {
    const raw = sessionStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as WizardSnapshot;
    return snap.equipmentId === equipmentId ? snap : null;
  } catch {
    return null;
  }
}

function peekWizardEquipmentId(): string | null {
  try {
    const raw = sessionStorage.getItem(WIZARD_STORAGE_KEY);
    return raw ? ((JSON.parse(raw) as WizardSnapshot).equipmentId ?? null) : null;
  } catch {
    return null;
  }
}

function saveWizardSnapshot(snap: WizardSnapshot) {
  try {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(snap));
  } catch {
    // Modo privado u otra restricción del navegador: se pierde el resume, no es crítico.
  }
}

function clearWizardSnapshot() {
  try {
    sessionStorage.removeItem(WIZARD_STORAGE_KEY);
  } catch {
    // noop
  }
}

type View = "list" | "wizard" | "detail";

// ── shared components ─────────────────────────────────────────────────────────

const inputCls = "w-full bg-slate-100 border border-slate-300 rounded px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-cyan-500 transition-colors";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-1.5 block">{children}</label>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-3">{children}</h2>;
}

function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-mono font-medium ${className}`}>
      {children}
    </span>
  );
}

function Btn({
  children,
  onClick,
  variant = "primary",
  className = "",
  type = "button",
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost";
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const base = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-cyan-500 text-slate-900 hover:bg-cyan-400",
    ghost: "text-slate-500 hover:text-slate-900 hover:bg-slate-100",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

function HeroBanner({ subtitle }: { subtitle: string }) {
  return (
    <div className="relative mb-6 rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
      <div className="grid grid-cols-3 h-32 sm:h-44">
        <img src="/hero/hero-1.jpg" alt="Técnico instalando un split de aire acondicionado" className="w-full h-full object-cover" />
        <img src="/hero/hero-2.jpg" alt="Técnico revisando la unidad exterior de un aire acondicionado" className="w-full h-full object-cover" />
        <img src="/hero/hero-3.jpg" alt="Unidad exterior de aire acondicionado" className="w-full h-full object-cover" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-slate-900/10 to-transparent" />
      <div className="absolute bottom-0 left-0 p-4">
        <h1 className="text-white font-semibold text-xl drop-shadow-sm">Mantención A/C</h1>
        <p className="text-slate-200 text-sm mt-0.5 drop-shadow-sm capitalize">{subtitle}</p>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-slate-50 text-slate-900" style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}>
      {children}
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      <div className="min-h-screen flex items-center justify-center text-center px-6 text-slate-500 text-sm">
        <div>{children}</div>
      </div>
    </Shell>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const { session, profile, clientIds, loading: authLoading, error: authError, signIn, signOut } = useAuth();

  if (authLoading) return <CenteredMessage>Cargando…</CenteredMessage>;
  if (!session) return <LoginScreen onSignIn={signIn} />;
  if (authError || !profile) {
    return (
      <CenteredMessage>
        <p className="mb-4 text-red-600">{authError ?? "No se pudo cargar tu perfil."}</p>
        <Btn variant="ghost" onClick={() => signOut()}>Cerrar sesión</Btn>
      </CenteredMessage>
    );
  }

  return <AuthenticatedApp operatorId={profile.id} operatorEmail={profile.email} clientIds={clientIds} onSignOut={signOut} />;
}

function LoginScreen({ onSignIn }: { onSignIn: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSignIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell>
      <div className="min-h-screen flex items-center justify-center p-4">
        <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4">
          <div className="mb-2">
            <span className="font-semibold text-slate-900 text-lg">Mantención A/C</span>
            <p className="text-xs text-slate-500 mt-0.5">Panel de operadores</p>
          </div>
          <div>
            <FieldLabel>Email</FieldLabel>
            <input type="email" required className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="operador@empresa.com" />
          </div>
          <div>
            <FieldLabel>Contraseña</FieldLabel>
            <input type="password" required className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Btn type="submit" disabled={submitting} className="justify-center mt-2">
            {submitting ? "Ingresando…" : "Ingresar"}
          </Btn>
        </form>
      </div>
    </Shell>
  );
}

function AuthenticatedApp({
  operatorId,
  operatorEmail,
  clientIds,
  onSignOut,
}: {
  operatorId: string;
  operatorEmail: string;
  clientIds: string[];
  onSignOut: () => void;
}) {
  const [equipmentList, setEquipmentList] = useState<EquipmentView[]>([]);
  const [loadingEquipment, setLoadingEquipment] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>("list");
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentView | null>(null);

  const { getNow } = useSimulatedDate();

  const reload = useCallback(async () => {
    setLoadingEquipment(true);
    setLoadError(null);
    try {
      const list = await fetchEquipmentForOperator(clientIds, getNow());
      setEquipmentList(list);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "No se pudo cargar los equipos.");
    } finally {
      setLoadingEquipment(false);
    }
  }, [clientIds, getNow]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Si la página se recargó con una revisión en curso (la app quedó en
  // segundo plano y el navegador la descartó), retoma automáticamente ese
  // equipo en vez de mostrar la lista como si nada.
  useEffect(() => {
    if (view !== "list" || loadingEquipment) return;
    const savedId = peekWizardEquipmentId();
    if (!savedId) return;
    const eq = equipmentList.find((e) => e.id === savedId && e.status === "pending");
    if (eq) {
      setSelectedEquipment(eq);
      setView("wizard");
    } else {
      clearWizardSnapshot();
    }
  }, [view, loadingEquipment, equipmentList]);

  const handleSelect = (eq: EquipmentView) => {
    setSelectedEquipment(eq);
    setView(eq.status === "pending" ? "wizard" : "detail");
  };

  const handleComplete = async () => {
    clearWizardSnapshot();
    setView("list");
    setSelectedEquipment(null);
    await reload();
  };

  const handleBack = () => {
    clearWizardSnapshot();
    setView("list");
    setSelectedEquipment(null);
  };

  if (view === "wizard" && selectedEquipment) {
    return <WizardView equipment={selectedEquipment} operatorId={operatorId} onComplete={handleComplete} onBack={handleBack} />;
  }

  if (view === "detail" && selectedEquipment) {
    return <DetailView equipment={selectedEquipment} onBack={handleBack} />;
  }

  if (loadingEquipment) return <CenteredMessage>Cargando equipos…</CenteredMessage>;
  if (loadError) {
    return (
      <CenteredMessage>
        <p className="mb-4 text-red-600">{loadError}</p>
        <Btn variant="ghost" onClick={reload}>Reintentar</Btn>
      </CenteredMessage>
    );
  }

  return <ListView equipmentList={equipmentList} operatorEmail={operatorEmail} onSelect={handleSelect} onSignOut={onSignOut} />;
}

function SimulationBanner({ now }: { now: Date }) {
  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-xs text-center py-1.5 px-4">
      Modo prueba: la app funciona como si hoy fuera {now.toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" })}.
      Las revisiones que cierres se guardarán con esa fecha.
    </div>
  );
}

function ListView({
  equipmentList,
  operatorEmail,
  onSelect,
  onSignOut,
}: {
  equipmentList: EquipmentView[];
  operatorEmail: string;
  onSelect: (eq: EquipmentView) => void;
  onSignOut: () => void;
}) {
  const pending = equipmentList.filter((e) => e.status === "pending");
  const done = equipmentList.filter((e) => e.status === "done");
  const { simulatedDate, setSimulatedDate, getNow } = useSimulatedDate();
  const now = getNow();
  const today = now.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <Shell>
      <header className="sticky top-0 z-10 bg-slate-50/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-semibold text-slate-900 text-sm">Mantención A/C</span>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {simulatedDate && <Badge className="text-amber-600 bg-amber-50 border-amber-200">Simulado</Badge>}
            <input
              type="date"
              value={localDateString(now)}
              onChange={(e) => setSimulatedDate(e.target.value || null)}
              title="Simular la fecha actual (para pruebas)"
              className="text-xs bg-slate-100 border border-slate-300 rounded px-2 py-1 text-slate-700 focus:outline-none focus:border-cyan-500 cursor-pointer"
            />
            {simulatedDate && (
              <Btn variant="ghost" onClick={() => setSimulatedDate(null)} className="text-xs">Hoy</Btn>
            )}
            <span className="text-xs text-slate-500 hidden sm:inline">{operatorEmail}</span>
            <Btn variant="ghost" onClick={onSignOut} className="text-xs">Cerrar sesión</Btn>
          </div>
        </div>
      </header>
      {simulatedDate && <SimulationBanner now={now} />}

      <main className="max-w-2xl mx-auto px-4 py-6">
        <HeroBanner subtitle={today} />

        <div className="grid grid-cols-3 gap-3 mb-8">
          <StatCard label="Total" value={equipmentList.length} valueClass="text-slate-900" />
          <StatCard label="Pendientes" value={pending.length} valueClass="text-amber-600" />
          <StatCard label="Realizados" value={done.length} valueClass="text-emerald-600" />
        </div>

        {pending.length === 0 && done.length === 0 && (
          <p className="text-center text-sm text-slate-500 py-8">
            No hay equipos con mantención vigente para tus clientes asignados.
          </p>
        )}

        {pending.length > 0 && (
          <section className="mb-8">
            <SectionTitle>Pendientes · {pending.length}</SectionTitle>
            <div className="flex flex-col gap-3">
              {pending.map((eq) => (
                <EquipmentCard key={eq.id} equipment={eq} onSelect={onSelect} />
              ))}
            </div>
          </section>
        )}

        {done.length > 0 && (
          <section>
            <SectionTitle>Realizados · {done.length}</SectionTitle>
            <div className="flex flex-col gap-3">
              {done.map((eq) => (
                <EquipmentCard key={eq.id} equipment={eq} onSelect={onSelect} />
              ))}
            </div>
          </section>
        )}
      </main>
    </Shell>
  );
}

function StatCard({ label, value, valueClass }: { label: string; value: number; valueClass: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-3 text-center">
      <div className={`text-2xl font-semibold ${valueClass}`}>{value}</div>
      <div className="text-xs font-mono uppercase tracking-wider text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

function EquipmentCard({ equipment: eq, onSelect }: { equipment: EquipmentView; onSelect: (eq: EquipmentView) => void }) {
  const isPending = eq.status === "pending";
  const completedAtLabel = eq.completedAt
    ? new Date(eq.completedAt).toLocaleDateString("es-CL") + " " + new Date(eq.completedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <button
      onClick={() => onSelect(eq)}
      className={`w-full text-left bg-white border border-slate-200 rounded-xl p-4 transition-all duration-150 hover:border-slate-400 cursor-pointer ${
        isPending ? "" : "opacity-75"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <Badge className="text-slate-600 bg-slate-100 border-slate-200">{eq.code}</Badge>
            {isPending ? (
              <Badge className="text-amber-600 bg-amber-50 border-amber-200">Pendiente</Badge>
            ) : (
              <Badge className={eq.hasWarnings ? "text-amber-600 bg-amber-50 border-amber-200" : "text-emerald-600 bg-emerald-50 border-emerald-200"}>
                {eq.hasWarnings ? "Con advertencias" : "Realizado · OK"}
              </Badge>
            )}
          </div>
          <div className="font-semibold text-slate-900 leading-tight">{eq.description}</div>
          <div className="text-sm text-slate-500 mt-0.5">
            {eq.brand} · {eq.model}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-sm text-slate-600">
            <LocationIcon className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
            <span className="truncate">{eq.location}</span>
          </div>
          {!isPending && completedAtLabel && (
            <div className="flex items-center gap-1.5 mt-1 text-xs text-emerald-600">
              <CheckCircleIcon className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Completado {completedAtLabel}</span>
            </div>
          )}
        </div>
        <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center mt-1 ${isPending ? "bg-cyan-500" : "bg-slate-100 border border-slate-200"}`}>
          <ChevronRightIcon className={`w-5 h-5 ${isPending ? "text-slate-900" : "text-slate-400"}`} />
        </div>
      </div>
    </button>
  );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

// ─── Detalle de una revisión ya realizada (solo lectura) ──────────────────────

function DetailView({ equipment, onBack }: { equipment: EquipmentView; onBack: () => void }) {
  const [detail, setDetail] = useState<MaintenanceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!equipment.maintenanceId) {
      setError("Esta revisión no tiene un registro asociado.");
      return;
    }
    let cancelled = false;
    fetchMaintenanceDetail(equipment.maintenanceId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((err) => {
        if (!cancelled) {
          const msg = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "";
          setError(`No se pudo cargar la revisión${msg ? `: ${msg}` : "."}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [equipment.maintenanceId]);

  const completedAtLabel = detail?.completedAt
    ? new Date(detail.completedAt).toLocaleDateString("es-CL") + " " + new Date(detail.completedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <Shell>
      <header className="sticky top-0 z-10 bg-slate-50/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="w-9 h-9 rounded-lg bg-white border border-slate-200 hover:border-slate-400 flex items-center justify-center cursor-pointer transition-colors"
              aria-label="Volver"
            >
              <ChevronLeftIcon className="w-5 h-5 text-slate-700" />
            </button>
            <div className="flex-1 min-w-0">
              <Badge className="text-slate-600 bg-slate-100 border-slate-200">{equipment.code}</Badge>
              <div className="font-semibold text-slate-900 leading-tight truncate mt-1">{equipment.description}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
            <LocationIcon className="w-3.5 h-3.5 text-slate-400" />
            <span>{equipment.location}</span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
        {error && <p className="text-sm text-center text-red-600 py-8">{error}</p>}

        {!error && !detail && <div className="text-center py-16 text-slate-500 text-sm font-mono">Cargando revisión…</div>}

        {detail && (
          <>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <SectionTitle>Revisión completada</SectionTitle>
                {detail.overallResult && (
                  <Badge className={detail.overallResult === "ok" ? "text-emerald-600 bg-emerald-50 border-emerald-200" : "text-amber-600 bg-amber-50 border-amber-200"}>
                    {detail.overallResult === "ok" ? "OK" : detail.overallResult === "warning" ? "Con advertencias" : "Crítico"}
                  </Badge>
                )}
              </div>
              {completedAtLabel && <p className="text-sm text-slate-500 mt-1">Completado {completedAtLabel}</p>}
            </div>

            {detail.photoUrl && (
              <div className="bg-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                <img src={detail.photoUrl} alt="Foto del equipo" className="w-full object-contain" style={{ maxHeight: 360 }} />
              </div>
            )}

            <div>
              <SectionTitle>Puntos revisados</SectionTitle>
              {detail.items.length === 0 && (
                <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-lg p-3">
                  No hay puntos de revisión registrados para esta revisión.
                </p>
              )}
              <div className="flex flex-col gap-2">
                {detail.items.map((item, i) => (
                  <div key={`${item.reviewPointId}-${i}`} className="bg-white border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-900">{item.label}</span>
                      <Badge className={item.status === "ok" ? "text-emerald-600 bg-emerald-50 border-emerald-200" : "text-amber-600 bg-amber-50 border-amber-200"}>
                        {item.status === "ok" ? "OK" : item.status === "warning" ? "Advertencia" : "Crítico"}
                      </Badge>
                    </div>
                    {item.comment && <p className="text-sm text-slate-500 mt-1">{item.comment}</p>}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </Shell>
  );
}

type WizardStep = "loading" | "checks" | "photo" | "error" | "empty";

function WizardView({
  equipment,
  operatorId,
  onComplete,
  onBack,
}: {
  equipment: EquipmentView;
  operatorId: string;
  onComplete: () => void;
  onBack: () => void;
}) {
  const initialSnapshot = loadWizardSnapshot(equipment.id);
  const [step, setStep] = useState<WizardStep>("loading");
  const [reviewPoints, setReviewPoints] = useState<ReviewPointView[]>([]);
  const [currentCheckIndex, setCurrentCheckIndex] = useState(initialSnapshot?.currentCheckIndex ?? 0);
  const [answers, setAnswers] = useState<Answers>(initialSnapshot?.answers ?? {});
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { simulatedDate, getNow } = useSimulatedDate();
  const startedAtRef = useRef(initialSnapshot ? new Date(initialSnapshot.startedAt) : getNow());

  useEffect(() => {
    let cancelled = false;
    fetchReviewPoints(equipment.equipmentTypeId)
      .then((points) => {
        if (cancelled) return;
        setReviewPoints(points);
        if (points.length === 0) {
          setStep("empty");
          return;
        }
        setStep(initialSnapshot?.step === "photo" ? "photo" : "checks");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "No se pudieron cargar los puntos de revisión.");
        setStep("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipment.equipmentTypeId]);

  // Guarda el progreso a cada cambio, para poder retomarlo si la página se recarga sola.
  useEffect(() => {
    if (step !== "checks" && step !== "photo") return;
    saveWizardSnapshot({
      equipmentId: equipment.id,
      step,
      currentCheckIndex,
      answers,
      startedAt: startedAtRef.current.toISOString(),
    });
  }, [equipment.id, step, currentCheckIndex, answers]);

  const currentCheck = reviewPoints[currentCheckIndex];
  const answeredCount = reviewPoints.filter((p) => answers[p.id]?.status).length;
  const progress = reviewPoints.length ? (answeredCount / reviewPoints.length) * 100 : 0;
  const missingMandatory = reviewPoints.filter((p) => p.mandatory && !answers[p.id]?.status);
  const isLast = currentCheckIndex === reviewPoints.length - 1;

  const [commentRequiredError, setCommentRequiredError] = useState(false);

  const updateAnswer = (patch: Partial<Answer>) => {
    setAnswers((prev) => ({
      ...prev,
      [currentCheck.id]: { ...(prev[currentCheck.id] ?? { status: null, comment: "" }), ...patch },
    }));
  };

  const handleStatus = (status: CheckStatus) => {
    const current = answers[currentCheck.id];
    if (current?.status === status) {
      updateAnswer({ status: null });
      setCommentRequiredError(false);
      return;
    }
    if (status === "warning" && currentCheck.commentsAllowed && !current?.comment?.trim()) {
      setCommentRequiredError(true);
      return;
    }
    setCommentRequiredError(false);
    updateAnswer({ status });
    if (!isLast) setCurrentCheckIndex(currentCheckIndex + 1);
  };

  const goToIndex = (index: number) => {
    setCommentRequiredError(false);
    setCurrentCheckIndex(index);
  };
  const goPrev = () => goToIndex(Math.max(0, currentCheckIndex - 1));
  const goNext = () => goToIndex(Math.min(reviewPoints.length - 1, currentCheckIndex + 1));

  const handlePhotoCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  }, []);

  const handleFinish = async () => {
    if (!photoFile) return;
    setSubmitting(true);
    setError(null);
    try {
      await finishMaintenance({
        equipmentId: equipment.id,
        operatorId,
        startedAt: startedAtRef.current,
        now: getNow(),
        items: reviewPoints
          .filter((p) => answers[p.id]?.status)
          .map((p) => ({ reviewPointId: p.id, status: answers[p.id].status as PointStatus, comment: answers[p.id].comment })),
        reviewPoints,
        photoFile,
      });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cerrar la revisión.");
      setSubmitting(false);
    }
  };

  return (
    <Shell>
      <header className="sticky top-0 z-10 bg-slate-50/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="w-9 h-9 rounded-lg bg-white border border-slate-200 hover:border-slate-400 flex items-center justify-center cursor-pointer transition-colors"
              aria-label="Volver"
            >
              <ChevronLeftIcon className="w-5 h-5 text-slate-700" />
            </button>
            <div className="flex-1 min-w-0">
              <Badge className="text-slate-600 bg-slate-100 border-slate-200">{equipment.code}</Badge>
              <div className="font-semibold text-slate-900 leading-tight truncate mt-1">{equipment.description}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
            <LocationIcon className="w-3.5 h-3.5 text-slate-400" />
            <span>{equipment.location}</span>
          </div>

          {step !== "loading" && step !== "error" && step !== "empty" && (
            <div className="flex items-center gap-2 mt-4">
              <StepDot active={step === "checks"} done={step === "photo"} label="Revisión" />
              <div className={`flex-1 h-px ${step === "photo" ? "bg-cyan-500" : "bg-slate-300"}`} />
              <StepDot active={step === "photo"} done={false} label="Foto" />
            </div>
          )}
        </div>
      </header>
      {simulatedDate && <SimulationBanner now={getNow()} />}

      <main className="max-w-2xl mx-auto">
        {step === "loading" && <div className="text-center py-16 text-slate-500 text-sm font-mono">Cargando puntos de revisión…</div>}
        {step === "empty" && (
          <div className="text-center py-16 px-4">
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
              <WarningIcon className="w-6 h-6 text-amber-600" />
            </div>
            <p className="font-semibold text-slate-900 mb-1">Este equipo no tiene puntos de revisión</p>
            <p className="text-sm text-slate-500 mb-6">
              Aún no se han configurado puntos de revisión para este tipo de equipo. Avisa a un administrador para que los agregue.
            </p>
            <Btn variant="ghost" onClick={onBack}>Volver</Btn>
          </div>
        )}
        {step === "error" && (
          <div className="text-center py-16 px-4">
            <p className="mb-4 text-red-600 text-sm">{error}</p>
            <Btn variant="ghost" onClick={onBack}>Volver</Btn>
          </div>
        )}
        {step === "checks" && currentCheck && (
          <CheckStep
            checkpoints={reviewPoints}
            currentIndex={currentCheckIndex}
            progress={progress}
            answers={answers}
            missingMandatory={missingMandatory.length}
            commentRequiredError={commentRequiredError}
            onCommentChange={(comment) => {
              updateAnswer({ comment });
              setCommentRequiredError(false);
            }}
            onStatus={handleStatus}
            onPrev={goPrev}
            onNext={goNext}
            onJump={goToIndex}
            onContinue={() => setStep("photo")}
          />
        )}
        {step === "photo" && (
          <PhotoStep
            photoPreviewUrl={photoPreviewUrl}
            fileInputRef={fileInputRef}
            onPhotoCapture={handlePhotoCapture}
            onFileInputClick={() => fileInputRef.current?.click()}
            answers={answers}
            total={reviewPoints.length}
            onBack={() => setStep("checks")}
            onFinish={handleFinish}
            submitting={submitting}
            error={error}
          />
        )}
      </main>
    </Shell>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
          done ? "bg-emerald-500 text-white" : active ? "bg-cyan-500 text-slate-900" : "bg-slate-200 text-slate-500"
        }`}
      >
        {done ? "✓" : ""}
      </div>
      <span className={`text-xs font-mono uppercase tracking-wider ${active ? "text-cyan-600" : done ? "text-emerald-600" : "text-slate-500"}`}>{label}</span>
    </div>
  );
}

function CheckStep({
  checkpoints, currentIndex, progress, answers, missingMandatory, commentRequiredError, onCommentChange, onStatus, onPrev, onNext, onJump, onContinue
}: {
  checkpoints: ReviewPointView[];
  currentIndex: number;
  progress: number;
  answers: Answers;
  missingMandatory: number;
  commentRequiredError: boolean;
  onCommentChange: (v: string) => void;
  onStatus: (status: CheckStatus) => void;
  onPrev: () => void;
  onNext: () => void;
  onJump: (index: number) => void;
  onContinue: () => void;
}) {
  const check = checkpoints[currentIndex];
  const answer = answers[check.id];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === checkpoints.length - 1;
  const answeredCount = checkpoints.filter((p) => answers[p.id]?.status).length;

  const statusBtn = (status: CheckStatus) => {
    const selected = answer?.status === status;
    const palette =
      status === "ok"
        ? selected
          ? "bg-emerald-500 border-emerald-500 text-white"
          : "bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100"
        : selected
          ? "bg-amber-500 border-amber-500 text-white"
          : "bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100";
    return (
      <button
        onClick={() => onStatus(status)}
        className={`rounded-lg py-3.5 font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer border ${palette}`}
      >
        {status === "ok" ? <CheckCircleIcon className="w-5 h-5" /> : <WarningIcon className="w-5 h-5" />}
        {status === "ok" ? "OK" : "Advertencia"}
      </button>
    );
  };

  return (
    <div className="px-4 py-6 flex flex-col gap-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono uppercase tracking-wider text-slate-500">
            Punto {currentIndex + 1} de {checkpoints.length} · {answeredCount} revisados
          </span>
          <span className="text-xs font-mono text-cyan-600">{Math.round(progress)}%</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-slate-200">
          <div className="h-1.5 rounded-full bg-cyan-500 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0">
            <WrenchIcon className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-lg text-slate-900">{check.label}</span>
              {check.mandatory && <Badge className="text-slate-500 bg-slate-100 border-slate-200">Obligatorio</Badge>}
            </div>
            <div className="text-sm mt-1 leading-relaxed text-slate-500">{check.description}</div>
          </div>
        </div>

        {check.commentsAllowed && (
          <div className="mb-4">
            <FieldLabel>Comentario {answer?.status === "warning" ? "(obligatorio con advertencia)" : "(opcional)"}</FieldLabel>
            <textarea
              rows={2}
              value={answer?.comment ?? ""}
              onChange={(e) => onCommentChange(e.target.value)}
              placeholder="Describe lo observado..."
              className={`${inputCls} resize-none ${commentRequiredError ? "border-amber-400 focus:border-amber-500" : ""}`}
            />
            {commentRequiredError && (
              <p className="text-xs text-amber-600 mt-1.5">Escribe un comentario antes de marcar Advertencia.</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {statusBtn("warning")}
          {statusBtn("ok")}
        </div>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
          <Btn variant="ghost" onClick={onPrev} disabled={isFirst}>
            <ChevronLeftIcon className="w-4 h-4" />
            Anterior
          </Btn>
          <Btn variant="ghost" onClick={onNext} disabled={isLast}>
            {answer?.status ? "Siguiente" : "Saltar"}
            <ChevronRightIcon className="w-4 h-4" />
          </Btn>
        </div>
      </div>

      <div>
        <SectionTitle>Todos los puntos</SectionTitle>
        <div className="flex flex-col gap-2">
          {checkpoints.map((p, i) => {
            const st = answers[p.id]?.status;
            return (
              <button
                key={p.id}
                onClick={() => onJump(i)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg bg-white border text-left cursor-pointer transition-colors ${
                  i === currentIndex ? "border-cyan-500" : "border-slate-200 hover:border-slate-400"
                }`}
              >
                <span className="text-sm text-slate-600">{i + 1}. {p.label}</span>
                {st ? (
                  <Badge className={st === "ok" ? "text-emerald-600 bg-emerald-50 border-emerald-200" : "text-amber-600 bg-amber-50 border-amber-200"}>
                    {st === "ok" ? "OK" : "Advertencia"}
                  </Badge>
                ) : (
                  <Badge className="text-slate-400 bg-slate-50 border-slate-200">Sin revisar</Badge>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        {missingMandatory > 0 && (
          <p className="text-xs text-amber-600 mb-2 text-center">
            Faltan {missingMandatory} punto{missingMandatory > 1 ? "s" : ""} obligatorio{missingMandatory > 1 ? "s" : ""} por revisar.
          </p>
        )}
        <Btn onClick={onContinue} disabled={missingMandatory > 0} className="w-full justify-center py-3 text-base">
          Continuar a la foto
          <ChevronRightIcon className="w-5 h-5" />
        </Btn>
      </div>
    </div>
  );
}

function PhotoStep({
  photoPreviewUrl,
  fileInputRef,
  onPhotoCapture,
  onFileInputClick,
  answers,
  total,
  onBack,
  onFinish,
  submitting,
  error,
}: {
  photoPreviewUrl: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onPhotoCapture: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFileInputClick: () => void;
  answers: Answers;
  total: number;
  onBack: () => void;
  onFinish: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const statuses = Object.values(answers).map((a) => a.status);
  const warnings = statuses.filter((s) => s === "warning").length;
  const oks = statuses.filter((s) => s === "ok").length;
  const skipped = total - oks - warnings;
  const canFinish = !!photoPreviewUrl && !submitting;

  return (
    <div className="px-4 py-6 flex flex-col gap-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <SectionTitle>Resumen de revisión</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg px-3 py-3 text-center bg-emerald-50 border border-emerald-200">
            <div className="text-2xl font-semibold text-emerald-600">{oks}</div>
            <div className="text-xs font-mono uppercase tracking-wider text-emerald-600 mt-0.5">Puntos OK</div>
          </div>
          <div className={`rounded-lg px-3 py-3 text-center border ${warnings > 0 ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200"}`}>
            <div className={`text-2xl font-semibold ${warnings > 0 ? "text-amber-600" : "text-slate-400"}`}>{warnings}</div>
            <div className={`text-xs font-mono uppercase tracking-wider mt-0.5 ${warnings > 0 ? "text-amber-600" : "text-slate-400"}`}>Advertencias</div>
          </div>
        </div>
        {skipped > 0 && <p className="text-xs text-slate-500 mt-3 text-center">{skipped} punto{skipped > 1 ? "s" : ""} sin revisar (no obligatorio{skipped > 1 ? "s" : ""}).</p>}
        <Btn variant="ghost" onClick={onBack} className="mt-3 w-full justify-center">
          <ChevronLeftIcon className="w-4 h-4" />
          Volver a la revisión
        </Btn>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 pt-4 pb-3">
          <div className="font-semibold text-slate-900">Foto del equipo</div>
          <div className="text-sm mt-0.5 text-slate-500">Capture el estado actual del equipo como evidencia</div>
        </div>

        {photoPreviewUrl ? (
          <div className="relative mx-4 mb-4 rounded-lg overflow-hidden" style={{ height: 220 }}>
            <img src={photoPreviewUrl} alt="Equipo capturado" className="w-full h-full object-cover" />
            <button
              onClick={onFileInputClick}
              className="absolute bottom-3 right-3 rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-1.5 bg-white/90 text-cyan-600 border border-cyan-500 cursor-pointer"
            >
              <CameraIcon className="w-4 h-4" />
              Cambiar
            </button>
          </div>
        ) : (
          <button
            onClick={onFileInputClick}
            className="mx-4 mb-4 w-[calc(100%-2rem)] rounded-lg flex flex-col items-center justify-center gap-3 transition-colors cursor-pointer bg-slate-50 hover:bg-slate-100 border-2 border-dashed border-slate-300"
            style={{ height: 180 }}
          >
            <div className="w-14 h-14 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
              <CameraIcon className="w-7 h-7 text-cyan-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Tomar o seleccionar foto</div>
              <div className="text-xs mt-0.5 text-center text-slate-500">JPG, PNG hasta 10 MB</div>
            </div>
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPhotoCapture}
        />
      </div>

      {error && <p className="text-sm text-center text-red-600">{error}</p>}

      <Btn onClick={onFinish} disabled={!canFinish} className="w-full justify-center py-3 text-base">
        <CheckCircleIcon className="w-5 h-5" />
        {submitting ? "Guardando…" : "Cerrar revisión"}
      </Btn>
    </div>
  );
}


// ─── Icons ────────────────────────────────────────────────────────────────────

function LocationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function WrenchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
