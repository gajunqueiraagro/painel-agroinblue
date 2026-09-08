/**
 * "É transferência para/de ▾" — [ENRIQUECER-EXPLICA-02] (133i-b item 1). DUMB.
 *
 * ⚠ O RÓTULO MUDA COM O SENTIDO DO DINHEIRO: uma saída vai PARA outra conta, uma entrada vem
 * DE outra conta. Um rótulo só ("transferência com ▾") obrigaria o operador a deduzir de que
 * lado a conta que ele escolhe entra — e é justamente o que a RPC resolve por ele.
 *
 * ⚠ A PRÓPRIA CONTA SAI DA LISTA. A RPC recusa com "a outra conta tem de ser diferente da
 * conta do lancamento"; oferecê-la seria empurrar o operador para um erro que a tela já sabe
 * evitar. `excluirIds` é do `ContaBancariaSelect` e existe para isto desde o PR-H2.
 *
 * ⚠ SIMULA, MOSTRA, CONFIRMA — nesta ordem. O gesto reescreve tipo e classificação de um
 * lançamento conciliado; a confirmação diz de qual conta para qual, com o valor, e é a
 * simulação do banco que a preenche — não uma frase montada aqui.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ContaBancariaSelect, type ContaSelecionavel } from '@/components/shared/ContaBancariaSelect';
import { fmtBRL } from './fmt';
import { useTransferenciaAplicar, type SimulacaoTransferencia } from '@/v2/hooks/useTransferenciaAplicar';

export interface AcaoEhTransferenciaProps {
  lancamentoId: string;
  /** 'saida' | 'entrada' — decide o rótulo. `null` não oferece a ação. */
  sentido: 'entrada' | 'saida' | null;
  /** A conta do próprio lançamento, para sair da lista. */
  contaPropriaId: string | null;
  contas: readonly ContaSelecionavel[];
  /** Sugestão do detector (cota-capital), já escolhida. */
  contaSugeridaId?: string | null;
  onAplicado: () => void;
  onErro: (mensagem: string) => void;
}

export function AcaoEhTransferencia({
  lancamentoId, sentido, contaPropriaId, contas, contaSugeridaId, onAplicado, onErro,
}: AcaoEhTransferenciaProps) {
  const [aberto, setAberto] = useState(false);
  const [contaId, setContaId] = useState<string>(contaSugeridaId ?? '');
  const [sim, setSim] = useState<SimulacaoTransferencia | null>(null);
  const { simular, aplicar, ocupado, msgErro } = useTransferenciaAplicar();

  if (!sentido) return null;
  const rotulo = sentido === 'saida' ? 'É transferência para' : 'É transferência de';

  const nomeDaConta = (id: string | null | undefined): string => {
    if (!id) return '—';
    const c = contas.find((x) => x.id === id);
    return c ? (c.nome_exibicao || c.nome_conta) : '—';
  };

  async function escolher(id: string) {
    setContaId(id);
    setSim(null);
    if (!id) return;
    try { setSim(await simular(lancamentoId, id)); }
    catch (e: unknown) { onErro(msgErro(e)); }
  }

  async function confirmar() {
    try {
      await aplicar(lancamentoId, contaId);
      setAberto(false); setSim(null); setContaId('');
      onAplicado();
    } catch (e: unknown) { onErro(msgErro(e)); }
  }

  if (!aberto) {
    return (
      <Button type="button" size="sm" variant="outline" className="h-6 shrink-0 px-1.5 text-[10px]"
        title="Transformar em transferência entre contas, mantendo o vínculo com o extrato."
        onClick={() => { setAberto(true); if (contaSugeridaId) void escolher(contaSugeridaId); }}>
        {rotulo} ▾
      </Button>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="w-[190px] shrink-0">
        <ContaBancariaSelect
          value={contaId || '__none__'}
          onValueChange={(id) => { void escolher(id); }}
          contas={[...contas]}
          excluirIds={contaPropriaId ? [contaPropriaId] : undefined}
          placeholder={sentido === 'saida' ? 'Para qual conta?' : 'De qual conta?'}
          size="compact"
          className="h-6 text-[10px]"
        />
      </span>
      {/* ⚠ O RESUMO É O DA SIMULAÇÃO, não uma frase montada: origem, destino e valor saem do
          banco, que é quem vai gravar. */}
      {sim && (
        <span className="min-w-0 truncate text-[10px] text-sky-800 dark:text-sky-300">
          {nomeDaConta(sim.conta_origem_id)} → {nomeDaConta(sim.conta_destino_id)} · {fmtBRL(sim.valor)}
        </span>
      )}
      <Button type="button" size="sm" className="h-6 shrink-0 px-2 text-[10px]"
        disabled={!sim || ocupado}
        title={!sim ? 'Escolha a outra conta.' : 'Aplicar.'}
        onClick={() => { void confirmar(); }}>
        {ocupado ? 'Aplicando…' : 'Confirmar'}
      </Button>
      <Button type="button" size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[10px]"
        onClick={() => { setAberto(false); setSim(null); setContaId(''); }}>
        Não
      </Button>
    </span>
  );
}
