/**
 * OPENFINANCE-P3b (f) — no Resumo do mês, o SALDO QUE O BANCO INFORMOU (Open Finance, a última leitura gravada pelo "Buscar do banco")
 * × o EXTRATO DO SISTEMA no fim do mesmo dia (abertura do mês + linhas vivas do mês até o dia). Só AVISO: âmbar se divergir em R$ 0,01
 * ou mais; nada se ajusta (o saldo do mês segue o de sempre). Sem leitura do banco para a conta, nada aparece. Fica no FIM do rolador
 * do Resumo: aparecer depois não empurra nada (nada se desloca).
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatMoeda } from '@/lib/calculos/formatters';
import { ddmmaaaa, diaEHoraEmBrasilia, extratoDoSistemaNoDia, saldoBancoXSistema, type SaldoBancoXSistema } from '@/lib/openfinance/extratoDoBanco';

interface Leitura { saldo: number; quando: { dia: string; hora: string } | null; lidoEm: string }

export function SaldoDoBanco({ clienteId, contaId, anoMes, abertura }: {
  clienteId: string | null | undefined; contaId: string | null; anoMes: string; abertura: number | null;
}) {
  const [estado, setEstado] = useState<{ leitura: Leitura; cmp: SaldoBancoXSistema } | null>(null);

  useEffect(() => {
    let vivo = true;
    setEstado(null);
    if (!clienteId || !contaId) return () => { vivo = false; };
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: a tabela nova ainda não está no types.ts
      const { data, error } = await (supabase as any).from('openfinance_saldos').select('saldo, saldo_em, lido_em')
        .eq('cliente_id', clienteId).eq('conta_bancaria_id', contaId).order('lido_em', { ascending: false }).limit(1);
      if (!vivo || error || !data || data.length === 0) return;
      const l = data[0];
      const quando = diaEHoraEmBrasilia(l.saldo_em ?? null);
      const leitura: Leitura = { saldo: Number(l.saldo), quando, lidoEm: String(l.lido_em) };
      let sistema: number | null = null;
      if (quando && quando.dia.slice(0, 7) === anoMes && abertura !== null) {
        const { data: linhas, error: e2 } = await supabase.from('extrato_bancario_v2').select('data_movimento, valor')
          .eq('conta_bancaria_id', contaId).is('cancelado_em', null).is('ignorado_em', null)
          .gte('data_movimento', `${anoMes}-01`).lte('data_movimento', quando.dia).limit(5000);
        if (!vivo) return;
        if (!e2) sistema = extratoDoSistemaNoDia(abertura, anoMes, (linhas ?? []).map((x) => ({ data: String(x.data_movimento), valor: Number(x.valor) })), quando.dia);
      }
      if (vivo) setEstado({ leitura, cmp: saldoBancoXSistema(leitura.saldo, sistema) });
    })();
    return () => { vivo = false; };
  }, [clienteId, contaId, anoMes, abertura]);

  if (!estado) return null;
  const { leitura, cmp } = estado;
  const quando = leitura.quando ? `${ddmmaaaa(leitura.quando.dia)} ${leitura.quando.hora}` : 'sem hora do banco';
  const foraDoMes = !leitura.quando || leitura.quando.dia.slice(0, 7) !== anoMes;
  const titulo = 'Saldo que o banco informou pelo Open Finance × o extrato no sistema no fim do mesmo dia (abertura do mês + linhas do extrato até o dia). '
    + 'Só aviso: nada se ajusta.';
  /* CONC-LAYOUT-FIXO-01 (4) — UMA linha pequena (19px) no painel; o texto inteiro no `title` (era um aviso de 2 linhas) */
  const dif = cmp.diferenca === null ? '—' : cmp.diverge ? formatMoeda(cmp.diferenca) : 'confere';
  const texto = `Open Finance ${quando}: banco ${formatMoeda(cmp.banco)} · extrato no sistema ${cmp.sistema === null ? '—' : formatMoeda(cmp.sistema)} · diferença ${dif}`
    + (foraDoMes && cmp.sistema === null ? ' (a leitura do banco é de outro mês)' : '');
  return (
    <div className={`mx-2 mt-1 flex h-[19px] items-center overflow-hidden whitespace-nowrap rounded px-2 text-[9.5px] ${cmp.diverge ? 'bg-warning/10 text-warning' : 'bg-muted/50 text-muted-foreground'}`}
      data-testid="resumo-saldo-do-banco" title={`${texto}\n${titulo}`}>
      <span className="min-w-0 flex-1 truncate">
        Open Finance {quando}: banco <span className="tabular-nums font-medium">{formatMoeda(cmp.banco)}</span>
        {' · '}diferença <span className="tabular-nums font-medium" data-testid="resumo-saldo-do-banco-diferenca">{dif}</span>
        {' · '}extrato no sistema <span className="tabular-nums">{cmp.sistema === null ? '—' : formatMoeda(cmp.sistema)}</span>
        {foraDoMes && cmp.sistema === null && <span> (a leitura do banco é de outro mês)</span>}
      </span>
    </div>
  );
}
