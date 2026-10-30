/**
 * "ITENS DA NOTA" — ITENS-NOTA-01 (mock aprovado: claude.ai/artifact/XEP27qurTx78MrDLqX9hEf). A MESMA componente no lancamento (aba
 * "Itens da nota (N)") e na aba Documentos da OC. So' desenha: o que vem e' a nota lida agora ou a guardada (`lidosDoBanco`), na mesma forma.
 *   · o cabecalho da nota + os TOTAIS (produtos, desconto, frete, seguro, outras, IPI + ST, valor da nota) e os tributos aproximados (Lei
 *     12.741, so' informacao);
 *   · a barra: "Valores" (padrao) | "Fiscal" (decisao do Gabriel); o selo da PROVA (soma dos liquidos = valor da nota); a marca do rateio
 *     (PDF); "a conta do lancamento manda no DRE e no caixa" — o item nao tem conta nesta etapa;
 *   · a tabela na REGUA (a de Recorrencias): cabecalho e total presos, so' o corpo rola, descricao com "…" e o inteiro no `title`,
 *     numero nunca corta. O quadro ocupa a altura que o pai der (modal fixo, sem rolagem).
 */
import { useState, type ReactNode } from 'react';
import { Segmentado } from '@/components/ui/segmentado';
import { QUADRO_REGUA, RODAPE_REGUA } from '@/components/ui/regua-tabela';
import { conferirSoma, type CabecalhoDaNota, type ItemFiscal, type ItensLidos } from '@/lib/financeiro/nfe/itensDaNota';
import { documentoFormatado, numeroDaNota, reais } from '@/lib/financeiro/nfe/formatos';
import { cn } from '@/lib/utils';

type Visao = 'valores' | 'fiscal' | 'contas';
const VISOES: { valor: Visao; rotulo: string }[] = [{ valor: 'valores', rotulo: 'Valores' }, { valor: 'fiscal', rotulo: 'Fiscal' }];
const VISOES_COM_CONTAS: { valor: Visao; rotulo: string }[] = [...VISOES, { valor: 'contas', rotulo: 'Contas' }];
const REGIME: Record<string, string> = { '1': 'Simples Nacional', '2': 'Simples (excesso)', '3': 'Regime normal', '4': 'MEI' };
const CHIP = 'inline-flex h-[18px] shrink-0 items-center whitespace-nowrap rounded-full px-2 text-[10px] font-medium leading-none';
/* ITENS-NOTA-FONTE-01 (Gabriel 22/10 08h10 e 08h47) — a tabela dos itens e' COMPACTA (excecao declarada ao piso de 9,5px, como a grade do
   DRE): 8,5px, linha de 14px, cabecalho e rodape de 16px — ate' 18 itens cabem sem rolar a partir de 1126x579; acima, so' o corpo rola. */
const TH_ITENS = 'h-[16px] px-1 py-0 text-[8.5px] font-medium text-primary-foreground normal-case tracking-normal whitespace-nowrap';
const TD_ITENS = 'h-[14px] px-1 py-0 text-[8.5px] leading-none';
const TD_ITENS_TEXTO = cn(TD_ITENS, 'truncate');
const TD_ITENS_NUM = cn(TD_ITENS, 'text-right tabular-nums whitespace-nowrap');

/** 'YYYY-MM-DD' -> 'dd/mm/aaaa'. */
const dataBr = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
/** "2.0000" -> "2"; "1.5000" -> "1,5"; ate' 4 casas. */
const qtd = (q: string | null) => (!q ? '—' : (q.includes('.') ? q.replace(/\.?0+$/, '') : q).replace('.', ','));
/** "50.0000000000" -> "50,00" (o unitario com 2 casas, ou mais quando a nota traz). */
function unitario(u: string | null): string {
  if (!u) return '—';
  const [i, d = ''] = u.split('.');
  const dec = (d.replace(/0+$/, '') + '00').slice(0, Math.max(2, d.replace(/0+$/, '').length));
  return `${Number(i).toLocaleString('pt-BR')},${dec}`;
}
const acrescimos = (i: ItemFiscal) => i.freteCent + i.seguroCent + i.outrasCent + (i.ipi?.valorCent ?? 0) + (i.icmsSt?.valorCent ?? 0) + (i.fcpSt?.valorCent ?? 0);
const imp = (v: { valorCent?: number } | null) => (v?.valorCent ? reais(v.valorCent) : '0,00');

export function ItensDaNota({ cabecalho, lidos, contaDoLancamento, testId = 'itens-da-nota', vistaContas }: {
  cabecalho: CabecalhoDaNota;
  lidos: ItensLidos;
  /** FIN-CLASSIF-DIVIDIDA-01b — a vista "Contas" (a conta de cada item e o dividir): so' no lancamento salvo que pode dividir */
  vistaContas?: ReactNode;
  /** o subcentro do lancamento (a conta que vale para DRE e caixa) — so' para dizer na barra */
  contaDoLancamento?: string | null;
  testId?: string;
}) {
  const [visao, setVisao] = useState<Visao>('valores');
  const t = lidos.totais;
  const prova = conferirSoma(lidos);
  const rateado = lidos.itens.some((i) => i.rateado);
  const ipiSt = t.ipiCent + t.stCent + t.fcpStCent;
  const totais: [string, number, boolean][] = [
    ['Produtos', t.produtosCent, false], ['Desconto', t.descontoCent, false], ['Frete', t.freteCent, false], ['Seguro', t.seguroCent, false],
    ['Outras', t.outrasCent, false], ['IPI + ST', ipiSt, false], ['Valor NF', t.notaCent, true],
  ];
  const valores = visao !== 'fiscal';
  /* o codigo NUNCA corta: a coluna tem a largura do maior codigo da nota (em `ch` da fonte da tabela); a descricao cede */
  const maiorCodigo = Math.max(9, ...lidos.itens.map((i) => (i.codigo ?? '').length));   // 9ch: o rotulo "Cód. forn." inteiro
  const larguraCodigo = `calc(${maiorCodigo}ch + 10px)`;
  /* as colunas: Nº, codigo, descricao (o resto da largura) e as de numero, que nunca cortam */
  const cols: { h: string; w?: number | string; num?: boolean; codigo?: boolean; f: (i: ItemFiscal) => string; titulo?: (i: ItemFiscal) => string }[] = valores ? [
    { h: 'Nº', w: 22, num: true, f: (i) => String(i.nItem) },
    { h: 'Cód. forn.', w: larguraCodigo, codigo: true, f: (i) => i.codigo ?? '—' },
    { h: 'Descrição na nota', f: (i) => i.descricao, titulo: (i) => [i.descricao, i.infoAdicional].filter(Boolean).join(' · ') },
    { h: 'Qtd', w: 44, num: true, f: (i) => qtd(i.quantidade) },
    { h: 'Un', w: 26, f: (i) => i.unidade ?? '—' },
    { h: 'Unitário', w: 62, num: true, f: (i) => unitario(i.unitario) },
    { h: 'Total', w: 66, num: true, f: (i) => reais(i.produtoCent) },
    { h: 'Desc.', w: 54, num: true, f: (i) => reais(i.descontoCent) },
    { h: 'Acrésc.', w: 54, num: true, f: (i) => reais(acrescimos(i)) },
    { h: 'Líquido', w: 70, num: true, f: (i) => reais(i.liquidoCent) },
  ] : [
    { h: 'Nº', w: 22, num: true, f: (i) => String(i.nItem) },
    { h: 'Descrição na nota', f: (i) => i.descricao, titulo: (i) => i.descricao },
    { h: 'NCM', w: 56, codigo: true, f: (i) => i.ncm ?? '—' },
    { h: 'CFOP', w: 34, codigo: true, f: (i) => i.cfop ?? '—' },
    { h: 'CST/CSOSN', w: 60, f: (i) => i.csosn ?? i.cst ?? '—' },
    { h: 'BC ICMS', w: 60, num: true, f: (i) => (i.icms?.bcCent ? reais(i.icms.bcCent) : '0,00') },
    { h: 'ICMS', w: 52, num: true, f: (i) => imp(i.icms) },
    { h: 'ST', w: 50, num: true, f: (i) => imp(i.icmsSt) },
    { h: 'IPI', w: 50, num: true, f: (i) => imp(i.ipi) },
    { h: 'PIS/COFINS', w: 62, num: true, f: (i) => reais((i.pis?.valorCent ?? 0) + (i.cofins?.valorCent ?? 0)) },
    { h: 'IBS/CBS', w: 54, f: (i) => i.ibsCbs?.cClassTrib ?? (i.ibsCbs ? 'sim' : '—'), titulo: (i) => (i.ibsCbs ? Object.entries(i.ibsCbs).map(([k, v]) => `${k} ${v}`).join(' · ') : '') },
  ];
  const colgroup = <colgroup>{cols.map((c) => <col key={c.h} style={c.w ? { width: c.w } : undefined} />)}</colgroup>;
  const soma = (f: (i: ItemFiscal) => number) => reais(lidos.itens.reduce((s, i) => s + f(i), 0));

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5" data-testid={testId}>
      {/* ── O CABECALHO DA NOTA E OS TOTAIS ─────────────────────────────────────────────────────────────────────────── */}
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] gap-x-3 rounded-lg border bg-card px-2.5 py-1.5 text-[9.5px] leading-[15px]" data-testid="itens-cabecalho">
        <div className="min-w-0">
          <div className="flex min-w-0 gap-1.5 whitespace-nowrap">
            <span className="text-muted-foreground">NF-e</span><b className="tabular-nums">{numeroDaNota(cabecalho.numero ?? '')}</b>
            <span className="text-muted-foreground">série {cabecalho.serie ?? '—'}</span>
            <span className="text-muted-foreground">Emissão</span><b className="tabular-nums">{dataBr(cabecalho.emissao)}</b>
          </div>
          <div className="uma-linha-que-rola font-semibold" title={cabecalho.emitenteNome ?? ''}>{cabecalho.emitenteNome ?? '—'}</div>
          <div className="flex min-w-0 gap-1.5 whitespace-nowrap">
            <span className="text-muted-foreground">CNPJ</span><b className="tabular-nums">{documentoFormatado(cabecalho.emitenteDocumento)}</b>
            <span className="uma-linha-que-rola text-muted-foreground">{REGIME[lidos.regime ?? ''] ?? (lidos.origem === 'pdf' ? 'lida do PDF' : '')}</span>
          </div>
        </div>
        <div className="min-w-0">
          <div className="grid grid-cols-7 gap-x-1.5 tabular-nums" data-testid="itens-totais">
            {totais.map(([r]) => <span key={r} className="uma-linha-que-rola text-right text-[8px] tracking-normal text-muted-foreground">{r}</span>)}
            {totais.map(([r, v, nf]) => <b key={r} className={cn('whitespace-nowrap text-right', nf ? 'text-primary' : v === 0 && 'font-normal text-muted-foreground')}>{reais(v)}</b>)}
          </div>
          <div className="uma-linha-que-rola text-[8px] text-muted-foreground/70" data-testid="itens-tributos">
            Tributos aprox. (Lei 12.741): {t.tributosAproxCent != null ? <span className="font-medium">R$ {reais(t.tributosAproxCent)}</span> : '—'} · só informação
          </div>
        </div>
      </div>

      {/* ── A BARRA ──────────────────────────────────────────────────────────────────────────────────────────────────── */}
      <div className="flex h-[22px] shrink-0 items-center gap-1.5 overflow-hidden">
        <Segmentado<Visao> altura={22} valor={visao} onEscolher={setVisao}
          opcoes={vistaContas ? VISOES_COM_CONTAS : VISOES} />
        <span className={cn(CHIP, prova.confere ? 'bg-[#e5f4ea] text-[#1f7a45]' : 'bg-amber-50 text-amber-800')} data-testid="itens-prova">
          {prova.confere ? '✓ Soma dos itens = valor da nota' : `Soma dos itens ${reais(prova.somaCent)} · nota ${reais(prova.notaCent)}`}
        </span>
        {rateado && <span className={cn(CHIP, 'bg-amber-50 text-amber-800')} title="O PDF só traz desconto, frete, seguro e outras no total: repartidos pelo valor de cada item.">desconto/frete rateados</span>}
        <span className="ml-auto" />
        <span className={cn(CHIP, 'min-w-0 shrink bg-sky-50 text-sky-800')} title={contaDoLancamento ? `Conta do lançamento: ${contaDoLancamento}` : undefined}>
          {/* min-w-0: o selo encolhe e o texto rola no lugar dele (a 750 a barra passava da largura: o texto segurava o selo) */}
          <span className="min-w-0 uma-linha-que-rola">Conta do lançamento manda no DRE e no caixa{contaDoLancamento ? ` · ${contaDoLancamento}` : ''}</span>
        </span>
      </div>

      {/* ── A TABELA (a regua) — Valores x Fiscal trocam as COLUNAS de proposito (`data-desloca-livre`); a barra acima segue medida ── */}
      {visao === 'contas' && vistaContas ? <div className="min-h-0 flex-1" data-desloca-livre="">{vistaContas}</div> : (
      <div className={cn(QUADRO_REGUA, 'min-h-0 flex-1')} data-testid="itens-quadro" data-desloca-livre="">
        <table className="w-full shrink-0 table-fixed border-collapse bg-primary text-[8.5px]">{colgroup}
          <thead><tr>{cols.map((c) => <th key={c.h} className={cn(TH_ITENS, 'truncate', c.num ? 'text-right' : 'text-left')} title={c.h}>{c.h}</th>)}</tr></thead>
        </table>
        <div className="min-h-0 flex-1 overflow-y-auto" data-testid="itens-rolagem">
          <table className="w-full table-fixed border-collapse text-[8.5px]">{colgroup}
            <tbody>
              {lidos.itens.map((i) => (
                <tr key={i.nItem} className="border-b border-border/50 even:bg-muted/30" data-testid="itens-linha">
                  {cols.map((c) => {
                    const v = c.f(i);
                    return c.num ? <td key={c.h} className={TD_ITENS_NUM}>{v}</td>
                      : c.codigo ? <td key={c.h} className={cn(TD_ITENS, 'whitespace-nowrap tabular-nums')}>{v}</td>
                        : <td key={c.h} className={TD_ITENS_TEXTO} title={c.titulo ? c.titulo(i) : v}>{v}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <table className={cn('w-full table-fixed border-collapse', RODAPE_REGUA, 'text-[8.5px]')}>{colgroup}
          <tbody><tr data-testid="itens-rodape">
            {cols.map((c, k) => {
              let v = '';
              if (c.h === 'Descrição na nota') v = `${lidos.itens.length} ${lidos.itens.length === 1 ? 'item' : 'itens'}`;
              else if (c.h === 'Total') v = soma((i) => i.produtoCent);
              else if (c.h === 'Desc.') v = soma((i) => i.descontoCent);
              else if (c.h === 'Acrésc.') v = soma(acrescimos);
              else if (c.h === 'Líquido') v = soma((i) => i.liquidoCent);
              return <td key={c.h} className={cn(c.num ? TD_ITENS_NUM : TD_ITENS, 'h-[16px] font-semibold')} data-col={k}>{v}</td>;
            })}
          </tr></tbody>
        </table>
      </div>
      )}
    </div>
  );
}
