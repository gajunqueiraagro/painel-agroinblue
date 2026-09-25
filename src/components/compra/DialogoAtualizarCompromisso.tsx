/**
 * O diálogo de "Atualizar compromisso" — [OC-EDITAR-LOTE-FECHADA] 128b/128e.
 *
 * ⚠ IRMÃO DO `DialogoExcluirLoteOC`, e de propósito: mesma mecânica (simula ao abrir,
 * lista o rol do banco, pede motivo, executa com a versão da tela), porque o operador
 * aprende UM gesto e o usa nos dois. O que muda é o que ele afirma — aqui há um valor
 * antigo e um novo, e eles são a razão do diálogo existir.
 *
 * ⚠ ENQUANTO A SIMULAÇÃO NÃO CHEGA, O BOTÃO NÃO EXISTE: um "Atualizar" clicável sobre uma
 * lista vazia diria "nada acontece" sobre algo que cancela título e cria parcela.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertTriangle } from 'lucide-react';
import type { ReprogramarCompromissoApi, SimulacaoReprogramacao } from '@/hooks/useReprogramarCompromissoLote';

const brl = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function DialogoAtualizarCompromisso({
  api, loteId, rotulo, versao, onFechar, onAtualizado, motivoReabertura = null,
}: {
  api: ReprogramarCompromissoApi;
  loteId: string;
  /** "Touros · 2 cab" — a identidade do lote cujo compromisso será refeito. */
  rotulo: string;
  versao: number | null;
  onFechar: () => void;
  onAtualizado: (versaoNova: number) => void;
  /**
   * FIN-V2-CANCEL-MOTIVO-01 (b) — o motivo da reabertura desta sessao da OC (venda/abate).
   * ⚠ VALOR SUGERIDO E' VALOR ACEITO: nasce no campo, EDITAVEL, e marcado em ambar enquanto for
   * a sugestao intocada — o operador ve' que nao foi ele quem escreveu. Nada grava sem o clique.
   * ⚠ NAO FUNDE AS DUAS PERGUNTAS: entre reabrir e atualizar o operador edita o lote; sao duas
   * decisoes, com dois registros. Omitido (compra) = campo vazio, como sempre.
   */
  motivoReabertura?: string | null;
}) {
  const [simulacao, setSimulacao] = useState<SimulacaoReprogramacao | null>(null);
  const [motivo, setMotivo] = useState(motivoReabertura ?? '');
  const motivoESugestao = !!motivoReabertura && motivo === motivoReabertura;

  useEffect(() => {
    let vivo = true;
    void api.simular(loteId).then(s => { if (vivo) setSimulacao(s); });
    return () => { vivo = false; };
  }, [api, loteId]);

  const bloqueado = !!simulacao && simulacao.bloqueios.length > 0;
  const motivoTravado = !simulacao ? 'Consultando o que será refeito…'
    : bloqueado ? 'Há título realizado ou conciliado; estorne antes.'
    : !motivo.trim() ? 'Informe o motivo.'
    : versao == null ? 'Versão da operação indisponível; reabra a operação.'
    : null;

  const confirmar = async () => {
    if (motivoTravado || versao == null) return;
    const r = await api.reprogramar(loteId, versao, motivo.trim());
    if (r) onAtualizado(r.operacaoVersao);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogTitle className="text-[14px]">Atualizar compromisso</DialogTitle>
        <DialogDescription className="text-[11px]">
          {rotulo} — o compromisso volta a valer o que o lote vale hoje.
        </DialogDescription>

        {!simulacao ? (
          <p className="py-3 text-[11px] text-muted-foreground">Consultando o que será refeito…</p>
        ) : bloqueado ? (
          <div className="space-y-1 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> Não é possível atualizar agora
            </div>
            <ul className="ml-4 list-disc text-[11px] leading-tight text-destructive">
              {simulacao.bloqueios.map((b, i) => <li key={i}>{b.descricao}</li>)}
            </ul>
            {/* ⚠ DINHEIRO REALIZADO NÃO SE MEXE SEM ESTORNO — a divergência fica INFORMADA
                na aba, que é a decisão do 128b: informar é melhor que refazer por baixo. */}
            <p className="text-[10px] leading-tight text-muted-foreground">
              Estorne o pagamento ou a conciliação pelo Financeiro e tente de novo. Até lá a
              divergência fica visível na aba, sem ser desfeita.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-baseline gap-2 rounded-md border bg-muted/20 px-3 py-2 text-[12px] tabular-nums">
              <span className="text-muted-foreground line-through">{brl(simulacao.valorAntigo)}</span>
              <span aria-hidden className="text-muted-foreground">→</span>
              <span className="font-medium">{brl(simulacao.valorNovo)}</span>
            </div>
            <div className="rounded-md border bg-muted/20 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">O que será refeito</div>
              <ul className="mt-1 space-y-0.5 text-[11px] leading-tight">
                {simulacao.rol.length === 0
                  ? <li className="text-muted-foreground">Nada a desfazer — só o valor muda.</li>
                  : simulacao.rol.map((r, i) => <li key={i}>· {r.descricao}</li>)}
              </ul>
            </div>
            <Textarea rows={2} value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder="Motivo da atualização" data-testid="motivo-atualizar"
              className={`text-[12px] ${motivoESugestao ? 'bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-800' : ''}`} />
            {motivoESugestao && (
              <div className="text-[10px] leading-tight text-amber-800 dark:text-amber-300" data-testid="motivo-sugerido">
                motivo da reabertura — confirme ou troque
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          {motivoTravado && !bloqueado && (
            <span className="mr-auto text-[10px] leading-tight text-muted-foreground">{motivoTravado}</span>
          )}
          <Button type="button" variant="ghost" onClick={onFechar}>Voltar</Button>
          {!bloqueado && (
            <Button type="button" disabled={!!motivoTravado || api.reprogramando}
              title={motivoTravado ?? 'Cancelar as parcelas não pagas e reprogramar pelo valor novo'}
              onClick={() => { void confirmar(); }}>
              {api.reprogramando ? 'Atualizando…' : 'Atualizar compromisso'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
