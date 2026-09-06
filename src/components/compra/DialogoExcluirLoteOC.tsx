/**
 * O diálogo de excluir lote — a MESMA peça para compra, venda e abate ([OC-EXCLUIR-LOTE]).
 *
 * ⚠ ELE PERGUNTA AO BANCO ANTES DE PROMETER. Ao abrir, chama `oc_excluir_lote` com
 * `p_simular = true` e lista o rol que a própria execução produziria. Escrever a lista aqui
 * seria a segunda resposta para "o que acontece se eu excluir" — e a primeira vez que
 * divergisse do banco, o operador confiaria na errada.
 *
 * ⚠ ENQUANTO A SIMULAÇÃO NÃO CHEGA, O BOTÃO NÃO EXISTE. Um "Excluir lote" clicável sobre
 * uma lista vazia diria "nada acontece" sobre algo que apaga movimentação e cancela título.
 *
 * ⚠ TRÊS SHELLS, UM ARQUIVO. Mora em `components/compra/` porque a aba de lotes de compra e
 * venda já mora aqui e o abate a importa — mover os três para uma pasta neutra é dívida
 * anotada, não trabalho deste PR.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertTriangle } from 'lucide-react';
import type { ExcluirLoteApi, SimulacaoExclusao } from '@/hooks/useExcluirLoteOC';

export function DialogoExcluirLoteOC({
  api, loteId, rotulo, versao, onFechar, onExcluido,
}: {
  api: ExcluirLoteApi;
  /** O id do lote NO BANCO. Lote ainda não salvo não passa por aqui — some do estado local. */
  loteId: string;
  /** "Touros · 2 cab" — a identidade que o operador confere antes de confirmar. */
  rotulo: string;
  /** A versão corrente da operação; a RPC recusa com 40001 se estiver velha. */
  versao: number | null;
  onFechar: () => void;
  /** Recebe a versão nova: quem chama relê a OC e notifica a lista de lançamentos. */
  onExcluido: (versaoNova: number) => void;
}) {
  const [simulacao, setSimulacao] = useState<SimulacaoExclusao | null>(null);
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    let vivo = true;
    void api.simular(loteId).then(s => { if (vivo) setSimulacao(s); });
    return () => { vivo = false; };
  }, [api, loteId]);

  const bloqueado = !!simulacao && simulacao.bloqueios.length > 0;
  /* Fonte única do `disabled`, do `title` e da dica ao lado — nunca três textos que possam
     discordar entre si. */
  const motivoTravado = !simulacao ? 'Consultando o que será desfeito…'
    : bloqueado ? 'Há título conciliado; estorne a conciliação primeiro.'
    : !motivo.trim() ? 'Informe o motivo.'
    : versao == null ? 'Versão da operação indisponível; reabra a operação.'
    : null;

  const confirmar = async () => {
    if (motivoTravado || versao == null) return;
    const r = await api.excluir(loteId, versao, motivo.trim());
    if (r) onExcluido(r.operacaoVersao);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogTitle className="text-[14px]">Excluir lote</DialogTitle>
        <DialogDescription className="text-[11px]">
          {rotulo} — o que este lote arrasta é desfeito junto. Confira antes de confirmar.
        </DialogDescription>

        {!simulacao ? (
          <p className="py-3 text-[11px] text-muted-foreground">Consultando o que será desfeito…</p>
        ) : bloqueado ? (
          <div className="space-y-1 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> Não é possível excluir agora
            </div>
            <ul className="ml-4 list-disc text-[11px] leading-tight text-destructive">
              {simulacao.bloqueios.map((b, i) => <li key={i}>{b.descricao}</li>)}
            </ul>
            {/* ⚠ SEM LINK, DE PROPÓSITO: a seção Conciliação não tem endereço por URL (o
                V2Index não lê `?section=`), e um link que não leva a lugar nenhum é pior
                que a instrução escrita. O texto do banco já diz qual estorno fazer. */}
            <p className="text-[10px] leading-tight text-muted-foreground">
              Estorne a conciliação do título em Financeiro › Conciliação e tente de novo.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="rounded-md border bg-muted/20 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">O que será desfeito</div>
              <ul className="mt-1 space-y-0.5 text-[11px] leading-tight">
                {simulacao.rol.map((r, i) => <li key={i}>· {r.descricao}</li>)}
              </ul>
            </div>
            <div>
              {/* Motivo obrigatório: ele vai para o evento, e é o que a auditoria vai
                  mostrar daqui a um ano. */}
              <Textarea rows={2} value={motivo} onChange={e => setMotivo(e.target.value)}
                placeholder="Motivo da exclusão" className="text-[12px]" />
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          {motivoTravado && !bloqueado && (
            <span className="mr-auto text-[10px] leading-tight text-muted-foreground">{motivoTravado}</span>
          )}
          <Button type="button" variant="ghost" onClick={onFechar}>Voltar</Button>
          {!bloqueado && (
            <Button type="button" variant="destructive"
              disabled={!!motivoTravado || api.excluindo}
              title={motivoTravado ?? 'Excluir o lote e desfazer o que ele arrasta'}
              onClick={() => { void confirmar(); }}>
              {api.excluindo ? 'Excluindo…' : 'Excluir lote'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
