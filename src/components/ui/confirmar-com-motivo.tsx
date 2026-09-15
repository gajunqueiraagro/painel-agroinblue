/**
 * CONFIRMAR COM MOTIVO — o painel de cancelamento lógico, com a justificativa obrigatória.
 *
 * ⚠ ELE NÃO EXISTIA, E JÁ HAVIA DUAS CÓPIAS. `AbaDocumentosOC` e `AbaDocumentosLancamento` montam
 * este mesmo painel à mão — moldura rosa, `Input` de motivo, "Voltar" e "Confirmar cancelamento",
 * botão travado enquanto o motivo está vazio. São o mesmo gesto escrito duas vezes, e a terceira
 * cópia (o histórico da quebra) seria a que faz as três divergirem. Extraído aqui em vez disso.
 * ⚠ AS DUAS CÓPIAS NÃO FORAM MIGRADAS neste PR — elas vivem em telas de Compra e Financeiro, fora
 * do escopo do estoque. Quem for adotá-las começa por aqui: o desenho abaixo é o da
 * `AbaDocumentosOC`, que é a mais completa das duas.
 * ⚠ O `DecisaoDerivadosDialog`, que o briefing sugeriu reusar, NÃO serve: ele é o protocolo de
 * invalidação de origem do extrato — recebe `extratoId`, chama a própria RPC e lista derivados.
 * Genérico ele não é.
 *
 * ⚠ O BOTÃO TRAVA NO `trim()`, não no comprimento: um motivo de espaços em branco é um motivo
 * vazio, e o banco o recusaria com `CANCELAMENTO_SEM_MOTIVO` — travar antes é dizer a mesma coisa
 * sem gastar uma ida ao servidor.
 *
 * Módulo folha: `Button`, `Input` e `cn`.
 */
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function ConfirmarComMotivo({
  titulo, motivo, onMotivoChange, onVoltar, onConfirmar, confirmando, className,
}: {
  /** O que vai ser cancelado, em uma linha — "Cancelar esta quebra (lógico — continua no histórico)". */
  titulo: string;
  motivo: string;
  onMotivoChange: (v: string) => void;
  onVoltar: () => void;
  onConfirmar: () => void;
  confirmando?: boolean;
  className?: string;
}) {
  const vazio = !motivo.trim();
  return (
    <div className={cn('space-y-1 rounded-md border border-rose-200 bg-rose-50 p-2', className)}>
      <div className="text-[11px] font-semibold text-rose-700">{titulo}</div>
      <Input value={motivo} onChange={e => onMotivoChange(e.target.value)}
        placeholder="Motivo do cancelamento (obrigatório)" className="h-7 text-[11px]" />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px]"
          onClick={onVoltar}>
          Voltar
        </Button>
        {/* ⚠ O MOTIVO DE ESTAR TRAVADO FICA NO `title`, não só no cinza — regra da OC. */}
        <Button type="button" variant="destructive" size="sm" className="h-6 text-[11px]"
          disabled={vazio || confirmando}
          title={vazio ? 'Informe o motivo do cancelamento.' : 'Confirmar cancelamento'}
          onClick={onConfirmar}>
          Confirmar cancelamento
        </Button>
      </div>
    </div>
  );
}
