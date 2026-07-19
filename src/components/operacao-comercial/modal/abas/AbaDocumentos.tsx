import { UploadCloud, Info } from 'lucide-react';
import type { ModalOCCtx } from '../tipos';

// Aba 5 — Documentos. Layout fiel ao contrato visual, porém SEM backend nesta etapa
// (sem bucket privado, RPC ou policy): upload desabilitado, estado vazio real, nenhum
// documento fictício. Infra documental = frente própria (registrada no relatório).
export function AbaDocumentos({ ctx: _ctx }: { ctx: ModalOCCtx }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-lg">Documentos da Operação</h3>
          <p className="text-sm text-muted-foreground">Anexe e gerencie os documentos relacionados a esta operação.</p>
        </div>
        <span className="rounded-md border px-2 py-1 text-xs text-muted-foreground">0 arquivos anexados</span>
      </div>

      <div
        aria-disabled
        title="Anexos indisponíveis nesta etapa"
        className="mt-4 rounded-lg border-2 border-dashed bg-muted/30 px-4 py-10 text-center opacity-60 cursor-not-allowed"
      >
        <UploadCloud className="h-8 w-8 mx-auto text-muted-foreground" />
        <div className="mt-2 font-medium text-muted-foreground">Arraste e solte os arquivos aqui</div>
        <div className="text-xs text-muted-foreground">ou clique para selecionar</div>
        <div className="text-[11px] text-muted-foreground mt-1">PDF, JPG, JPEG, PNG • Tamanho máximo: 10MB por arquivo</div>
      </div>

      <div className="mt-4">
        <div className="font-semibold text-sm mb-1">Arquivos anexados</div>
        <div className="rounded-md border px-3 py-6 text-center text-xs text-muted-foreground">
          Nenhum documento anexado.
        </div>
      </div>

      <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 flex items-center gap-2">
        <Info className="h-4 w-4 shrink-0" />
        Anexos ainda indisponíveis: a infraestrutura documental (armazenamento privado, políticas e contrato transacional) será entregue em frente própria.
      </div>
    </div>
  );
}
