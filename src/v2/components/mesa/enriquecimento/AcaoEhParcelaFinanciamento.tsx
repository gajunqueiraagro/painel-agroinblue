/**
 * "É parcela de financiamento ▾" — [133i-c item 3]. DUMB, irmã da AcaoEhTransferencia.
 *
 * ⚠ SIMULA, MOSTRA, CONFIRMA — a mesma ordem da irmã, e pelo mesmo motivo: o gesto paga
 * uma parcela com a data e o valor do extrato, cria o principal (e os juros, quando
 * houver), vincula ao extrato e CANCELA o lançamento cru. Quem confirma precisa ver os
 * números que o banco vai gravar, e eles saem da própria RPC com `p_simular = true` —
 * não de uma conta montada aqui.
 *
 * ⚠ ERRO DO BANCO VAI CRU PARA O CHAMADOR (idioma do 133i-b): a RPC recusa por motivos
 * que a tela não conhece (parcela já paga, contrato cancelado, cru já vinculado), e
 * reescrever a mensagem esconderia justamente o que o operador precisa ler.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { fmtBRL } from './fmt';
import type { ParcelaCandidata } from '@/v2/hooks/useParcelasFinanciamento';

export interface AcaoEhParcelaFinanciamentoProps {
  lancamentoCruId: string;
  candidatas: readonly ParcelaCandidata[];
  onAplicado: () => void;
  onErro: (mensagem: string) => void;
}

interface Simulacao {
  principal?: number | null;
  juros_previstos?: number | null;
  juros_reais?: number | null;
  valor_extrato?: number | null;
  data?: string | null;
}

const dataBR = (iso: string | null | undefined) =>
  iso ? iso.split('-').reverse().join('/') : '—';

function msgErro(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return e instanceof Error ? e.message : String(e);
}

export function AcaoEhParcelaFinanciamento({
  lancamentoCruId, candidatas, onAplicado, onErro,
}: AcaoEhParcelaFinanciamentoProps) {
  const [aberto, setAberto] = useState(false);
  const [parcelaId, setParcelaId] = useState<string>('');
  const [sim, setSim] = useState<Simulacao | null>(null);
  const [ocupado, setOcupado] = useState(false);

  if (candidatas.length === 0) return null;

  async function chamar(pId: string, simular: boolean) {
    const { data, error } = await supabase.rpc('fn_financiamento_pagar_pelo_extrato', {
      p_lancamento_cru_id: lancamentoCruId,
      p_parcela_id: pId,
      p_simular: simular,
    });
    if (error) throw error;
    return data;
  }

  async function escolher(pId: string) {
    setParcelaId(pId);
    setSim(null);
    if (!pId) return;
    setOcupado(true);
    try {
      const r = await chamar(pId, true);
      setSim((Array.isArray(r) ? r[0] : r) as Simulacao);
    } catch (e: unknown) { onErro(msgErro(e)); }
    finally { setOcupado(false); }
  }

  async function confirmar() {
    setOcupado(true);
    try {
      await chamar(parcelaId, false);
      setAberto(false); setSim(null); setParcelaId('');
      onAplicado();
    } catch (e: unknown) { onErro(msgErro(e)); }
    finally { setOcupado(false); }
  }

  if (!aberto) {
    return (
      <Button type="button" size="sm" variant="outline" className="h-6 shrink-0 px-1.5 text-[10px]"
        title="Pagar uma parcela de financiamento com a data e o valor deste extrato."
        onClick={() => setAberto(true)}>
        É parcela de financiamento ▾
      </Button>
    );
  }

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {/* ⚠ A LINHA DA CANDIDATA DIZ O CONTRATO, A POSIÇÃO E O DINHEIRO. "parcela 3/12" sem
          o nome do contrato não distingue duas parcelas do mesmo mês, que é exatamente o
          caso em que escolher errado paga a dívida errada. */}
      {/* ⚠ `Select` DO SISTEMA, nunca `<select>` cru — o gate `check:ui-nativo` barra o
          nativo, e com razão: ele abre o menu do sistema operacional, com outra fonte e
          outro idioma em cada máquina. `position="popper"` dá a largura do gatilho. */}
      <Select value={parcelaId} onValueChange={(v) => { void escolher(v); }}>
        <SelectTrigger className="h-6 w-[340px] shrink-0 text-[10px]">
          <SelectValue placeholder="Qual parcela?" />
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-64 overflow-y-auto rolagem-fina">
          {candidatas.map((c) => (
            <SelectItem key={c.parcela_id} value={c.parcela_id}>
              {c.contrato_descricao} · parcela {c.numero_parcela}/{c.total_parcelas}
              {' · vence '}{dataBR(c.data_vencimento)}
              {' · principal '}{fmtBRL(c.valor_principal)}
              {c.natureza !== 'parcelamento' ? ` · juros prev. ${fmtBRL(c.valor_juros)}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {sim && (
        <span className="min-w-0 truncate text-[10px] text-sky-800 dark:text-sky-300">
          principal {fmtBRL(sim.principal ?? 0)}
          {' · juros prev. '}{fmtBRL(sim.juros_previstos ?? 0)}
          {' · juros reais '}{fmtBRL(sim.juros_reais ?? 0)}
          {' · extrato '}{fmtBRL(sim.valor_extrato ?? 0)} em {dataBR(sim.data)}
        </span>
      )}
      <Button type="button" size="sm" className="h-6 shrink-0 px-2 text-[10px]"
        disabled={!sim || ocupado}
        title={!sim ? 'Escolha a parcela.' : 'Pagar esta parcela com o extrato.'}
        onClick={() => { void confirmar(); }}>
        {ocupado ? 'Aplicando…' : 'Confirmar'}
      </Button>
      <Button type="button" size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[10px]"
        onClick={() => { setAberto(false); setSim(null); setParcelaId(''); }}>
        Não
      </Button>
    </span>
  );
}
