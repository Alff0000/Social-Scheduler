import type { PublishReadiness } from "@/lib/publish-readiness";

/**
 * The "Post now" warning block, shared by every surface that offers it (composer,
 * schedule-from-library, post editor's Add-a-send). Renders ALL applicable warnings —
 * not just the first — because dry-run, the kill switch, and the worker being offline
 * are independent conditions that can co-occur, and each one silently prevents the
 * send in its own way. See lib/publish-readiness.ts for why these are read live.
 */
export function PostNowReadinessNotice({ readiness }: { readiness: PublishReadiness }) {
  return (
    <div className="space-y-2 rounded-lg bg-surface-sunken px-3 py-2.5 text-xs">
      {readiness.dryRun ? (
        <p className="font-medium text-accent-strong">
          O modo de simulação está ativado — isto será simulado e nada será publicado de
          verdade. Defina{" "}
          <code className="data rounded bg-surface px-1 py-0.5">DRY_RUN=0</code> no{" "}
          <code className="data rounded bg-surface px-1 py-0.5">.env</code> para publicar de
          verdade.
        </p>
      ) : null}
      {readiness.killSwitch ? (
        <p className="font-medium text-accent-strong">
          O interruptor de emergência está ativado — o worker está rodando mas não vai
          publicar nada até que{" "}
          <code className="data rounded bg-surface px-1 py-0.5">KILL_SWITCH=0</code> seja
          definido no <code className="data rounded bg-surface px-1 py-0.5">.env</code>.
        </p>
      ) : null}
      {!readiness.workerOnline ? (
        <p className="font-medium text-accent-strong">
          O worker não está rodando — nada vai pegar isto até que esteja. O envio vai
          simplesmente esperar.
        </p>
      ) : null}
      {!readiness.dryRun && !readiness.killSwitch && readiness.workerOnline ? (
        <p className="text-muted">
          Publica na próxima verificação do worker, dentro de cerca de um minuto — não
          instantaneamente.
        </p>
      ) : null}
      <p className="text-muted">Pula a etapa de aprovação, mesmo para contas que a exigem.</p>
    </div>
  );
}
