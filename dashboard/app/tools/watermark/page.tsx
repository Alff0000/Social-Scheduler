import { WatermarkTool } from "@/components/watermark-tool";

export const dynamic = "force-dynamic";

export default function WatermarkToolPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-ink">Remover marca d&apos;água</h1>
        <p className="mt-1 text-sm text-muted">
          Cobre uma região da sua própria foto ou vídeo com um borrão forte — não reconstrói o
          que estava atrás, só esconde. Nada aqui é salvo na Biblioteca.
        </p>
      </header>
      <WatermarkTool />
    </div>
  );
}
