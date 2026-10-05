import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { rotuloCurtoDaConta } from '@/lib/financeiro/rotuloConta';
import { dataCurtaDespesa } from '@/components/compra/TabelaDespesasOC';

/* OC-VENDA-FINANCEIRO-COMPLETO-01a — "+ Buscar despesa no Financeiro": a despesa ja' lancada no Financeiro (frete, comissao,
   Fundersul) que ainda nao pertence a OC nenhuma. Esta tela so' ACHA e escolhe; quem vincula e' o `VincularOperacaoDialog` de
   sempre, aberto com esta OC ja' escolhida — a regra de candidata, item e substituicao continua no banco
   (`oc_candidatas_vinculo` e `oc_vincular_lancamento` com `p_simular`).
   ⚠ O FILTRO E' DE CONVENIENCIA, NAO DE REGRA: saidas do cliente, nos subcentros de despesa da operacao, sem parte viva, com
     competencia ate' 60 dias antes ou depois da data da OC. Medido: so' nos dois subcentros de despesa ha' 2.737 saidas no proto
     — sem a janela a lista nao serviria. O que ficar de fora se vincula pelo Financeiro, como sempre.
   ⚠ SO' O REALIZADO (fix1): sem o filtro de cenario a busca oferecia lancamento de META — na prova de tela da compra do Agnaldo
     1337bb2d, as duas linhas eram "Prev. Comissão/Frete - Compra 200 Desmama M", `cenario = 'meta'`. Meta nao e' despesa paga.
   ⚠ PARTE VIVA = `zoo_operacao_partes.cancelada = false`, nunca `origem_lancamento` (regra VINCULO COM OC = PARTE VIVA). */

const JANELA_DIAS = 60;
const LIMITE = 200;

const TH = 'sticky top-0 z-10 h-[17px] whitespace-nowrap bg-primary px-[4px] text-center text-[9.5px] font-semibold text-white';
const TD = 'h-[18px] whitespace-nowrap border-b border-[#eceae4] px-[4px] text-[10px]';
const TDQ = 'h-[18px] border-b border-[#eceae4] px-[4px] py-[1px] text-[10px] leading-[12px] break-words';

interface Candidato {
  id: string; descricao: string | null; valor: number; competencia: string | null; pagamento: string | null;
  subcentro: string | null; favorecidoId: string | null;
}

/** A janela da busca em volta da data da OC (ISO yyyy-mm-dd). Sem data, sem janela. */
export function janelaDaBusca(dataOperacao: string | null, dias = JANELA_DIAS): { de: string; ate: string } | null {
  if (!dataOperacao) return null;
  const d = new Date(`${dataOperacao}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const mais = (n: number) => new Date(d.getTime() + n * 86_400_000).toISOString().slice(0, 10);
  return { de: mais(-dias), ate: mais(dias) };
}

export function BuscarDespesaOCDialog({ clienteId, dataOperacao, subcentros, nomeFavorecido, onEscolher, onFechar, saldo }: {
  /**
   * OC-VINCULAR-RECEBIMENTO-PARCIAL-01 — a MESMA busca, para o saldo de uma parcela: `lado` troca a direção (receber =
   * entradas) e os textos; `subcentros` é o do compromisso. Ausente = a busca de despesa de sempre.
   */
  saldo?: { lado: 'receber' | 'pagar' };
  clienteId: string;
  dataOperacao: string | null;
  subcentros: readonly string[];
  nomeFavorecido: (id: string | null) => string | null;
  onEscolher: (lancamentoId: string) => void;
  onFechar: () => void;
}) {
  const [itens, setItens] = useState<Candidato[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [tentou, setTentou] = useState(false);
  const janela = useMemo(() => janelaDaBusca(dataOperacao), [dataOperacao]);
  const chaveSub = subcentros.join('|');

  useEffect(() => {
    let vivo = true;
    const subs = chaveSub ? chaveSub.split('|') : [];
    if (subs.length === 0) { setItens([]); return; }
    void (async () => {
      let q = supabase.from('financeiro_lancamentos_v2')
        .select('id, descricao, valor, data_competencia, data_pagamento, subcentro, favorecido_id')
        .eq('cliente_id', clienteId).eq('tipo_operacao', saldo?.lado === 'receber' ? '1-Entradas' : '2-Saídas').eq('cancelado', false).eq('cenario', 'realizado')
        .in('subcentro', subs);
      if (janela) q = q.gte('data_competencia', janela.de).lte('data_competencia', janela.ate);
      const { data, error } = await q.order('data_competencia', { ascending: true }).limit(LIMITE);
      if (!vivo) return;
      if (error) { setErro('Não foi possível buscar as despesas no Financeiro.'); setItens([]); return; }
      const ids = (data ?? []).map(r => r.id);
      let comParte = new Set<string>();
      if (ids.length > 0) {
        const { data: partes, error: e2 } = await supabase.from('zoo_operacao_partes')
          .select('financeiro_lancamento_id').in('financeiro_lancamento_id', ids).eq('cancelada', false);
        if (!vivo) return;
        if (e2) { setErro('Não foi possível conferir quais despesas já pertencem a uma OC.'); setItens([]); return; }
        comParte = new Set((partes ?? []).map(p => p.financeiro_lancamento_id).filter((v): v is string => !!v));
      }
      setItens((data ?? []).filter(r => !comParte.has(r.id)).map(r => ({
        id: r.id, descricao: r.descricao, valor: Number(r.valor ?? 0), competencia: r.data_competencia,
        pagamento: r.data_pagamento, subcentro: r.subcentro, favorecidoId: r.favorecido_id,
      })));
    })();
    return () => { vivo = false; };
  }, [clienteId, chaveSub, janela, saldo?.lado]);

  const faltaEscolha = tentou && !escolhido;
  const seguir = () => {
    setTentou(true);
    if (!escolhido) return;
    onEscolher(escolhido);
  };

  return (
    <Dialog open onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-[820px]" data-testid="buscar-despesa-oc">
        <DialogHeader><DialogTitle className="text-[12px]">{saldo ? (saldo.lado === 'receber' ? 'Buscar recebimento no Financeiro' : 'Buscar pagamento no Financeiro') : 'Buscar despesa no Financeiro'}</DialogTitle></DialogHeader>
        <div className="text-[10px] text-muted-foreground">
          {saldo ? (saldo.lado === 'receber' ? 'Entradas na conta deste item' : 'Saídas na conta deste item') : 'Saídas nas contas de despesa desta operação'} que ainda não pertencem a nenhuma OC
          {janela ? `, com competência entre ${dataCurtaDespesa(janela.de)} e ${dataCurtaDespesa(janela.ate)}` : ''}. Ao seguir, abre o
          vincular com esta OC já escolhida — valor, pagamento e conciliação do lançamento não mudam.
        </div>
        <div className="max-h-[50vh] overflow-auto rounded border">
          <table className="w-full table-fixed border-separate border-spacing-0 tabular-nums">
            <colgroup>
              <col style={{ width: 56 }} /><col style={{ width: 56 }} /><col /><col style={{ width: 160 }} />
              <col style={{ width: 160 }} /><col style={{ width: 84 }} />
            </colgroup>
            <thead>
              <tr>{['Comp.', 'Pgto.', 'Descrição', 'Favorecido', 'Conta', 'Valor R$'].map(h => <th key={h} className={TH}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {itens === null && <tr><td colSpan={6} className={`${TD} py-3 text-center text-muted-foreground`}>Carregando…</td></tr>}
              {itens?.length === 0 && !erro && (
                <tr><td colSpan={6} className={`${TD} py-3 text-center text-muted-foreground`}>{saldo ? (saldo.lado === 'receber' ? 'Nenhum recebimento disponível para vincular.' : 'Nenhum pagamento disponível para vincular.') : 'Nenhuma despesa disponível para vincular.'}</td></tr>
              )}
              {itens?.map(r => (
                <tr key={r.id} data-lancamento={r.id} onClick={() => setEscolhido(r.id)}
                  className={`cursor-pointer ${escolhido === r.id ? 'bg-primary/10' : 'bg-white hover:bg-[#e8eef6]'}`}>
                  <td className={`${TD} text-center`}>{dataCurtaDespesa(r.competencia)}</td>
                  <td className={`${TD} text-center`}>{dataCurtaDespesa(r.pagamento)}</td>
                  <td className={TDQ}>{r.descricao ?? '—'}</td>
                  <td className={TDQ}>{nomeFavorecido(r.favorecidoId) ?? '—'}</td>
                  <td className={TDQ} title={r.subcentro ?? undefined}>{rotuloCurtoDaConta(r.subcentro) ?? '—'}</td>
                  <td className={`${TD} text-right text-[#b91c1c]`}>{Math.abs(r.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {faltaEscolha && <div className="text-[10px] text-destructive">{saldo ? (saldo.lado === 'receber' ? 'Escolha o recebimento.' : 'Escolha o pagamento.') : 'Escolha a despesa.'}</div>}
        <DialogFooter className="items-center">
          {erro && <span className="mr-auto text-[10px] text-destructive" role="alert">{erro}</span>}
          <Button type="button" variant="ghost" size="sm" className="h-[22px] px-[9px] text-[10px]" onClick={onFechar}>Cancelar</Button>
          <Button type="button" size="sm" className="h-[22px] px-[9px] text-[10px]" onClick={seguir}>Vincular…</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
