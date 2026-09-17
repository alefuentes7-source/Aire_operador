import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "./lib/auth";
import { fetchEquipmentForOperator, fetchReviewPoints, finishMaintenance, type EquipmentView, type ReviewPointView } from "./lib/api";
import type { PointStatus } from "./lib/database.types";

interface CheckResult {
  reviewPointId: string;
  status: "ok" | "warning";
  comment: string;
}

type View = "list" | "wizard";

export default function App() {
  const { session, profile, clientIds, loading: authLoading, error: authError, signIn, signOut } = useAuth();

  if (authLoading) return <CenteredMessage>Cargando…</CenteredMessage>;
  if (!session) return <LoginScreen onSignIn={signIn} />;
  if (authError || !profile) {
    return (
      <CenteredMessage>
        <p className="mb-4">{authError ?? "No se pudo cargar tu perfil."}</p>
        <button onClick={() => signOut()} className="text-sm underline" style={{ color: "#38bdf8" }}>
          Cerrar sesión
        </button>
      </CenteredMessage>
    );
  }

  return <AuthenticatedApp operatorId={profile.id} operatorInitials={initials(profile.name)} clientIds={clientIds} onSignOut={signOut} />;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full flex items-center justify-center text-center px-6" style={{ background: "#0f1117", color: "#f0f2f8" }}>
      <div>{children}</div>
    </div>
  );
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
    <div className="min-h-full flex items-center justify-center px-6" style={{ background: "#0f1117" }}>
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl p-6" style={{ background: "#1a1e2e", border: "1px solid #252d45" }}>
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#38bdf8" }}>
            <SnowflakeIcon className="w-5 h-5" style={{ color: "#0c1520" }} />
          </div>
          <span className="font-bold text-lg tracking-tight" style={{ fontFamily: "Outfit", color: "#f0f2f8" }}>AirMaintain</span>
        </div>

        <label className="text-xs font-medium mb-1.5 block" style={{ color: "#6b7a99" }}>Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl px-3.5 py-3 text-sm outline-none mb-4"
          style={{ background: "#0f1117", border: "1px solid #252d45", color: "#f0f2f8" }}
        />

        <label className="text-xs font-medium mb-1.5 block" style={{ color: "#6b7a99" }}>Contraseña</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl px-3.5 py-3 text-sm outline-none mb-4"
          style={{ background: "#0f1117", border: "1px solid #252d45", color: "#f0f2f8" }}
        />

        {error && <p className="text-sm mb-4" style={{ color: "#f59e0b" }}>{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl py-3 font-semibold text-base disabled:opacity-50"
          style={{ background: "#38bdf8", color: "#0c1520", fontFamily: "Outfit" }}
        >
          {submitting ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </div>
  );
}

function AuthenticatedApp({
  operatorId,
  operatorInitials,
  clientIds,
  onSignOut,
}: {
  operatorId: string;
  operatorInitials: string;
  clientIds: string[];
  onSignOut: () => void;
}) {
  const [equipmentList, setEquipmentList] = useState<EquipmentView[]>([]);
  const [loadingEquipment, setLoadingEquipment] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>("list");
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentView | null>(null);

  const reload = useCallback(async () => {
    setLoadingEquipment(true);
    setLoadError(null);
    try {
      const list = await fetchEquipmentForOperator(clientIds);
      setEquipmentList(list);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "No se pudo cargar los equipos.");
    } finally {
      setLoadingEquipment(false);
    }
  }, [clientIds]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleSelect = (eq: EquipmentView) => {
    setSelectedEquipment(eq);
    setView("wizard");
  };

  const handleComplete = async () => {
    setView("list");
    setSelectedEquipment(null);
    await reload();
  };

  const handleBack = () => {
    setView("list");
    setSelectedEquipment(null);
  };

  if (view === "wizard" && selectedEquipment) {
    return <WizardView equipment={selectedEquipment} operatorId={operatorId} onComplete={handleComplete} onBack={handleBack} />;
  }

  if (loadingEquipment) return <CenteredMessage>Cargando equipos…</CenteredMessage>;
  if (loadError) {
    return (
      <CenteredMessage>
        <p className="mb-4">{loadError}</p>
        <button onClick={reload} className="text-sm underline" style={{ color: "#38bdf8" }}>Reintentar</button>
      </CenteredMessage>
    );
  }

  return <ListView equipmentList={equipmentList} operatorInitials={operatorInitials} onSelect={handleSelect} onSignOut={onSignOut} />;
}

function ListView({
  equipmentList,
  operatorInitials,
  onSelect,
  onSignOut,
}: {
  equipmentList: EquipmentView[];
  operatorInitials: string;
  onSelect: (eq: EquipmentView) => void;
  onSignOut: () => void;
}) {
  const pending = equipmentList.filter((e) => e.status === "pending");
  const done = equipmentList.filter((e) => e.status === "done");
  const today = new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="min-h-full" style={{ background: "#0f1117" }}>
      <div className="sticky top-0 z-10" style={{ background: "#0f1117", borderBottom: "1px solid #252d45" }}>
        <div className="px-4 pt-5 pb-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#38bdf8" }}>
                <SnowflakeIcon className="w-5 h-5" style={{ color: "#0c1520" }} />
              </div>
              <span className="font-bold text-lg tracking-tight" style={{ fontFamily: "Outfit", color: "#f0f2f8" }}>
                AirMaintain
              </span>
            </div>
            <button
              onClick={onSignOut}
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ background: "#1e2540", color: "#38bdf8" }}
              title="Cerrar sesión"
            >
              {operatorInitials}
            </button>
          </div>
          <p className="text-xs mt-1 capitalize" style={{ color: "#6b7a99" }}>
            {today}
          </p>
        </div>

        <div className="px-4 pb-4 grid grid-cols-3 gap-3">
          <StatCard label="Total" value={equipmentList.length} color="#38bdf8" />
          <StatCard label="Pendientes" value={pending.length} color="#f59e0b" />
          <StatCard label="Realizados" value={done.length} color="#22c55e" />
        </div>
      </div>

      <div className="px-4 pb-8">
        {pending.length === 0 && done.length === 0 && (
          <div className="mt-8 text-center text-sm" style={{ color: "#6b7a99" }}>
            No hay equipos con mantención vigente para tus clientes asignados.
          </div>
        )}

        {pending.length > 0 && (
          <div className="mt-5">
            <SectionHeader label="Pendientes" count={pending.length} dot="#f59e0b" />
            <div className="mt-3 flex flex-col gap-3">
              {pending.map((eq) => (
                <EquipmentCard key={eq.id} equipment={eq} onSelect={onSelect} />
              ))}
            </div>
          </div>
        )}

        {done.length > 0 && (
          <div className="mt-7">
            <SectionHeader label="Realizados" count={done.length} dot="#22c55e" />
            <div className="mt-3 flex flex-col gap-3">
              {done.map((eq) => (
                <EquipmentCard key={eq.id} equipment={eq} onSelect={onSelect} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: "#1a1e2e", border: "1px solid #252d45" }}>
      <div className="text-2xl font-bold" style={{ fontFamily: "Outfit", color }}>{value}</div>
      <div className="text-xs mt-0.5" style={{ color: "#6b7a99" }}>{label}</div>
    </div>
  );
}

function SectionHeader({ label, count, dot }: { label: string; count: number; dot: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full" style={{ background: dot }} />
      <span className="text-sm font-semibold" style={{ fontFamily: "Outfit", color: "#94a3c0" }}>
        {label}
      </span>
      <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "#1e2540", color: "#6b7a99" }}>
        {count}
      </span>
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
      onClick={() => isPending && onSelect(eq)}
      className="w-full text-left rounded-2xl p-4 transition-all duration-150"
      style={{
        background: "#1a1e2e",
        border: `1px solid ${isPending ? "#252d45" : "#1e2d1e"}`,
        opacity: isPending ? 1 : 0.75,
        cursor: isPending ? "pointer" : "default",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono px-2 py-0.5 rounded-md" style={{ background: "#0f1117", color: "#38bdf8", border: "1px solid #252d45" }}>
              {eq.code}
            </span>
            {!isPending && (
              <span className="text-xs px-2 py-0.5 rounded-md font-medium" style={{ background: eq.hasWarnings ? "#2d1f0a" : "#0d2618", color: eq.hasWarnings ? "#f59e0b" : "#22c55e" }}>
                {eq.hasWarnings ? "Con advertencias" : "OK"}
              </span>
            )}
          </div>
          <div className="font-semibold text-base leading-tight" style={{ fontFamily: "Outfit", color: "#f0f2f8" }}>
            {eq.description}
          </div>
          <div className="text-sm mt-0.5" style={{ color: "#6b7a99" }}>
            {eq.brand} · {eq.model}
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <LocationIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#6b7a99" }} />
            <span className="text-sm truncate" style={{ color: "#94a3c0" }}>{eq.location}</span>
          </div>
          {!isPending && completedAtLabel && (
            <div className="flex items-center gap-1.5 mt-1">
              <CheckCircleIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#22c55e" }} />
              <span className="text-xs" style={{ color: "#22c55e" }}>Completado {completedAtLabel}</span>
            </div>
          )}
        </div>
        <div className="flex-shrink-0 flex flex-col items-center gap-1 mt-1">
          {isPending ? (
            <>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#38bdf8" }}>
                <ChevronRightIcon className="w-5 h-5" style={{ color: "#0c1520" }} />
              </div>
              <span className="text-xs" style={{ color: "#f59e0b" }}>Pendiente</span>
            </>
          ) : (
            <>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#0d2618" }}>
                <CheckCircleIcon className="w-5 h-5" style={{ color: "#22c55e" }} />
              </div>
              <span className="text-xs" style={{ color: "#22c55e" }}>Listo</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

type WizardStep = "loading" | "checks" | "photo" | "error";

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
  const [step, setStep] = useState<WizardStep>("loading");
  const [reviewPoints, setReviewPoints] = useState<ReviewPointView[]>([]);
  const [currentCheckIndex, setCurrentCheckIndex] = useState(0);
  const [results, setResults] = useState<CheckResult[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string>("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const startedAtRef = useRef(new Date());

  useEffect(() => {
    let cancelled = false;
    fetchReviewPoints(equipment.equipmentTypeId)
      .then((points) => {
        if (cancelled) return;
        setReviewPoints(points);
        setStep("checks");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "No se pudieron cargar los puntos de revisión.");
        setStep("error");
      });
    return () => {
      cancelled = true;
    };
  }, [equipment.equipmentTypeId]);

  const currentCheck = reviewPoints[currentCheckIndex];
  const progress = reviewPoints.length ? (currentCheckIndex / reviewPoints.length) * 100 : 0;

  const handleCheckResult = (status: "ok" | "warning") => {
    const result: CheckResult = { reviewPointId: currentCheck.id, status, comment };
    const newResults = [...results, result];
    setResults(newResults);
    setComment("");

    if (currentCheckIndex < reviewPoints.length - 1) {
      setCurrentCheckIndex(currentCheckIndex + 1);
    } else {
      setStep("photo");
    }
  };

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
        items: results.map((r) => ({ reviewPointId: r.reviewPointId, status: r.status as PointStatus, comment: r.comment })),
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
    <div className="min-h-full flex flex-col" style={{ background: "#0f1117" }}>
      <div className="sticky top-0 z-10" style={{ background: "#0f1117", borderBottom: "1px solid #252d45" }}>
        <div className="px-4 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#1a1e2e", border: "1px solid #252d45" }}>
              <ChevronLeftIcon className="w-5 h-5" style={{ color: "#f0f2f8" }} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono" style={{ color: "#38bdf8" }}>{equipment.code}</div>
              <div className="font-bold text-base leading-tight truncate" style={{ fontFamily: "Outfit", color: "#f0f2f8" }}>{equipment.description}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <LocationIcon className="w-3.5 h-3.5" style={{ color: "#6b7a99" }} />
            <span className="text-xs" style={{ color: "#94a3c0" }}>{equipment.location}</span>
          </div>

          {step !== "loading" && step !== "error" && (
            <div className="flex items-center gap-2 mt-4">
              <StepDot active={step === "checks"} done={step === "photo"} label="Revisión" />
              <div className="flex-1 h-px" style={{ background: step === "photo" ? "#38bdf8" : "#252d45" }} />
              <StepDot active={step === "photo"} done={false} label="Foto" />
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {step === "loading" && <CenteredMessage>Cargando puntos de revisión…</CenteredMessage>}
        {step === "error" && (
          <CenteredMessage>
            <p className="mb-4">{error}</p>
            <button onClick={onBack} className="text-sm underline" style={{ color: "#38bdf8" }}>Volver</button>
          </CenteredMessage>
        )}
        {step === "checks" && currentCheck && (
          <CheckStep
            checkpoints={reviewPoints}
            currentIndex={currentCheckIndex}
            progress={progress}
            comment={comment}
            onCommentChange={setComment}
            onResult={handleCheckResult}
            results={results}
          />
        )}
        {step === "photo" && (
          <PhotoStep
            photoPreviewUrl={photoPreviewUrl}
            fileInputRef={fileInputRef}
            onPhotoCapture={handlePhotoCapture}
            onFileInputClick={() => fileInputRef.current?.click()}
            results={results}
            onFinish={handleFinish}
            submitting={submitting}
            error={error}
          />
        )}
      </div>
    </div>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
        style={{
          background: done ? "#22c55e" : active ? "#38bdf8" : "#1e2540",
          color: done || active ? "#0c1520" : "#6b7a99",
        }}
      >
        {done ? "✓" : ""}
      </div>
      <span className="text-xs" style={{ color: active ? "#38bdf8" : done ? "#22c55e" : "#6b7a99" }}>{label}</span>
    </div>
  );
}

function CheckStep({
  checkpoints, currentIndex, progress, comment, onCommentChange, onResult, results
}: {
  checkpoints: ReviewPointView[];
  currentIndex: number;
  progress: number;
  comment: string;
  onCommentChange: (v: string) => void;
  onResult: (status: "ok" | "warning") => void;
  results: CheckResult[];
}) {
  const check = checkpoints[currentIndex];

  return (
    <div className="px-4 py-5 flex flex-col gap-5">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs" style={{ color: "#6b7a99" }}>Punto {currentIndex + 1} de {checkpoints.length}</span>
          <span className="text-xs font-medium" style={{ color: "#38bdf8" }}>{Math.round(progress)}%</span>
        </div>
        <div className="w-full h-2 rounded-full" style={{ background: "#1e2540" }}>
          <div
            className="h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%`, background: "linear-gradient(90deg, #38bdf8, #22d3ee)" }}
          />
        </div>
      </div>

      <div className="rounded-2xl p-5" style={{ background: "#1a1e2e", border: "1px solid #252d45" }}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#0f1117", border: "1px solid #252d45" }}>
            <WrenchIcon className="w-5 h-5" style={{ color: "#38bdf8" }} />
          </div>
          <div>
            <div className="font-bold text-lg" style={{ fontFamily: "Outfit", color: "#f0f2f8" }}>{check.label}</div>
            <div className="text-sm mt-1 leading-relaxed" style={{ color: "#94a3c0" }}>{check.description}</div>
          </div>
        </div>

        {check.commentsAllowed && (
          <div className="mb-4">
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "#6b7a99" }}>Comentario (opcional)</label>
            <textarea
              rows={2}
              value={comment}
              onChange={(e) => onCommentChange(e.target.value)}
              placeholder="Describe lo observado..."
              className="w-full rounded-xl px-3.5 py-3 text-sm resize-none outline-none transition-colors"
              style={{
                background: "#0f1117",
                border: "1px solid #252d45",
                color: "#f0f2f8",
                fontFamily: "Inter",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#38bdf8")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#252d45")}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onResult("warning")}
            className="rounded-xl py-4 font-semibold text-base flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{ background: "#2d1f0a", border: "1px solid #92400e", color: "#f59e0b", fontFamily: "Outfit" }}
          >
            <WarningIcon className="w-5 h-5" />
            Advertencia
          </button>
          <button
            onClick={() => onResult("ok")}
            className="rounded-xl py-4 font-semibold text-base flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{ background: "#0d2618", border: "1px solid #166534", color: "#22c55e", fontFamily: "Outfit" }}
          >
            <CheckCircleIcon className="w-5 h-5" />
            OK
          </button>
        </div>
      </div>

      {results.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-2" style={{ color: "#6b7a99" }}>Revisados anteriormente</div>
          <div className="flex flex-col gap-2">
            {results.map((r, i) => (
              <div key={r.reviewPointId} className="flex items-center justify-between px-3 py-2 rounded-xl" style={{ background: "#1a1e2e", border: "1px solid #252d45" }}>
                <span className="text-sm" style={{ color: "#94a3c0" }}>{checkpoints[i].label}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-lg" style={{ background: r.status === "ok" ? "#0d2618" : "#2d1f0a", color: r.status === "ok" ? "#22c55e" : "#f59e0b" }}>
                  {r.status === "ok" ? "OK" : "Advertencia"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PhotoStep({
  photoPreviewUrl,
  fileInputRef,
  onPhotoCapture,
  onFileInputClick,
  results,
  onFinish,
  submitting,
  error,
}: {
  photoPreviewUrl: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onPhotoCapture: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFileInputClick: () => void;
  results: CheckResult[];
  onFinish: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const warnings = results.filter((r) => r.status === "warning").length;
  const oks = results.filter((r) => r.status === "ok").length;
  const canFinish = !!photoPreviewUrl && !submitting;

  return (
    <div className="px-4 py-5 flex flex-col gap-5">
      <div className="rounded-2xl p-4" style={{ background: "#1a1e2e", border: "1px solid #252d45" }}>
        <div className="font-semibold mb-3" style={{ fontFamily: "Outfit", color: "#f0f2f8" }}>Resumen de revisión</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl px-3 py-3 text-center" style={{ background: "#0d2618" }}>
            <div className="text-2xl font-bold" style={{ fontFamily: "Outfit", color: "#22c55e" }}>{oks}</div>
            <div className="text-xs mt-0.5" style={{ color: "#22c55e" }}>Puntos OK</div>
          </div>
          <div className="rounded-xl px-3 py-3 text-center" style={{ background: warnings > 0 ? "#2d1f0a" : "#1e2540" }}>
            <div className="text-2xl font-bold" style={{ fontFamily: "Outfit", color: warnings > 0 ? "#f59e0b" : "#6b7a99" }}>{warnings}</div>
            <div className="text-xs mt-0.5" style={{ color: warnings > 0 ? "#f59e0b" : "#6b7a99" }}>Advertencias</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl" style={{ background: "#1a1e2e", border: "1px solid #252d45", overflow: "hidden" }}>
        <div className="px-4 pt-4 pb-3">
          <div className="font-semibold" style={{ fontFamily: "Outfit", color: "#f0f2f8" }}>Foto del equipo</div>
          <div className="text-sm mt-0.5" style={{ color: "#6b7a99" }}>Capture el estado actual del equipo como evidencia</div>
        </div>

        {photoPreviewUrl ? (
          <div className="relative mx-4 mb-4 rounded-xl overflow-hidden" style={{ height: 220 }}>
            <img src={photoPreviewUrl} alt="Equipo capturado" className="w-full h-full object-cover" />
            <button
              onClick={onFileInputClick}
              className="absolute bottom-3 right-3 rounded-xl px-3 py-2 text-sm font-medium flex items-center gap-1.5"
              style={{ background: "rgba(15,17,23,0.85)", color: "#38bdf8", border: "1px solid #38bdf8" }}
            >
              <CameraIcon className="w-4 h-4" />
              Cambiar
            </button>
          </div>
        ) : (
          <button
            onClick={onFileInputClick}
            className="mx-4 mb-4 w-[calc(100%-2rem)] rounded-xl flex flex-col items-center justify-center gap-3 transition-all active:scale-98"
            style={{ background: "#0f1117", border: "2px dashed #252d45", height: 180 }}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "#1e2540" }}>
              <CameraIcon className="w-7 h-7" style={{ color: "#38bdf8" }} />
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: "#f0f2f8" }}>Tomar o seleccionar foto</div>
              <div className="text-xs mt-0.5 text-center" style={{ color: "#6b7a99" }}>JPG, PNG hasta 10 MB</div>
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

      {error && <p className="text-sm text-center" style={{ color: "#f59e0b" }}>{error}</p>}

      <button
        onClick={onFinish}
        disabled={!canFinish}
        className="w-full rounded-2xl py-4 font-bold text-lg flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-40"
        style={{
          background: canFinish ? "#38bdf8" : "#1e2540",
          color: canFinish ? "#0c1520" : "#6b7a99",
          fontFamily: "Outfit",
        }}
      >
        <CheckCircleIcon className="w-6 h-6" />
        {submitting ? "Guardando…" : "Cerrar revisión"}
      </button>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function SnowflakeIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="22" />
      <path d="M17 7l-5 5-5-5" />
      <path d="M17 17l-5-5-5 5" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M7 7L2 12l5 5" />
      <path d="M17 7l5 5-5 5" />
    </svg>
  );
}

function LocationIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ChevronRightIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ChevronLeftIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function CheckCircleIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function WrenchIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function WarningIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function CameraIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
