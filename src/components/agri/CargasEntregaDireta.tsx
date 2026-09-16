/**
 * A LISTA DE CARGAS DE UMA CULTURA DE ENTREGA DIRETA — mandioca industrial.
 *
 * ⚠ TABELA IRMÃ, NÃO UM RAMO DENTRO DA OUTRA. A lista da saca estocável tem catorze colunas com
 * larguras medidas no navegador e documentadas como "lei anti-estouro"; tecer condicionais nela
 * para tirar seis colunas e pôr quatro colocaria em risco a tela do amendoim, que funciona. Aqui
 * a gramática é outra e mora à parte — o `CargasDaArea` só escolhe qual montar, pelo mapa.
 * ⚠ E É ISSO QUE PROVA QUE O AMENDOIM NÃO MUDOU: o diff do arquivo dele é a escolha, nada mais.
 *
 * ⚠ NENHUMA CONTA AQUI. `toneladas`, `rendimento_g` e o valor vêm gravados — o valor do próprio
 * lançamento de venda que a RPC criou, lido por `papel`, nunca recalculado de `t × g × R$/g`.
 * Refazer a conta na tela daria um segundo número para a mesma carga, e um dia eles divergiriam.
 */
import { useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatNum, formatMoeda } from '@/lib/calculos/formatters';
import type { ColheitaRow, VendaDaCarga } from '@/hooks/useColheita';

/** As larguras, na mesma gramática de px fixos da tabela irmã. */
const LARGURAS = ['6%', '9%', '9%', '13%', '18%', '9%', '8%', '13%', '10%', '5%'];

type Chave = 'faz' | 'talhao' | 'data' | 'nf' | 'industria' | 't' | 'g' | 'valor' | 'status';

const CABECALHOS: ReadonlyArray<{ chave: Chave; h: string; direita?: boolean }> = [
  { chave: 'faz', h: 'Faz' },
  { chave: 'talhao', h: 'Talhão' },
  { chave: 'data', h: 'Data' },
  { chave: 'nf', h: 'NF' },
  { chave: 'industria', h: 'Indústria' },
  { chave: 't', h: 't', direita: true },
  { chave: 'g', h: 'g', direita: true },
  { chave: 'valor', h: 'Valor', direita: true },
  { chave: 'status', h: 'Financeiro' },
];

const TH = 'sticky top-0 z-10 bg-primary px-1 py-0.5 text-[9px] font-semibold uppercase'
  + ' tracking-wide text-primary-foreground';

const dataBR = (iso: string | null) => (iso && iso.length >= 10
  ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

/**
 * A PÍLULA DO FINANCEIRO — o que aconteceu com o dinheiro daquela carga.
 *
 * ⚠ "PROGRAMADO" NÃO É ERRO, e por isso é âmbar e não vermelho: a RPC grava tudo programado, e a
 * baixa é do Financeiro. Vermelho ali diria ao operador que algo falhou na carga.
 * ⚠ SEM LANÇAMENTO É "—", nunca "programado": carga antiga, anterior à RPC, não tem elo — e
 * inventar um status seria afirmar o que não se sabe.
 */
function Pilula({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const realizado = status === 'realizado';
  return (
    <span className={cn('inline-block whitespace-nowrap rounded-[3px] border px-1 text-[9px] leading-[12px]',
      realizado ? 'border-green-700 text-green-700' : 'border-amber-600 text-amber-700')}>
      {realizado ? 'Realizado' : 'Programado'}
    </span>
  );
}

export function CargasEntregaDireta({
  linhas, vendaPorCarga, industriaPorId, nomePorId, fazPorId,
  somenteLeitura, onEditar, onExcluir,
}: {
  linhas: readonly ColheitaRow[];
  vendaPorCarga: Map<string, VendaDaCarga>;
  industriaPorId: Map<string, string>;
  nomePorId: Map<string, string>;
  fazPorId: Map<string, string>;
  somenteLeitura?: boolean;
  onEditar: (l: ColheitaRow) => void;
  onExcluir: (l: ColheitaRow) => void;
}) {
  /* ⚠ ORDENAÇÃO PRÓPRIA, e nasce por DATA como a da irmã: a carga se confere na ordem em que
     entrou na indústria. */
  const [ordem, setOrdem] = useState<{ chave: Chave; desc: boolean }>({ chave: 'data', desc: false });

  const valorDe = (l: ColheitaRow, c: Chave): string | number => {
    switch (c) {
      case 'faz': return fazPorId.get(l.safra_area_id) ?? '';
      case 'talhao': return nomePorId.get(l.safra_area_id) ?? '';
      case 'data': return l.data_colheita ?? '';
      case 'nf': return l.nf_produtor ?? '';
      case 'industria': return l.industria_id ? (industriaPorId.get(l.industria_id) ?? '') : '';
      case 't': return l.toneladas ?? 0;
      case 'g': return l.rendimento_g ?? 0;
      case 'valor': return vendaPorCarga.get(l.id)?.valor ?? 0;
      case 'status': return vendaPorCarga.get(l.id)?.status ?? '';
    }
  };

  const ordenadas = useMemo(() => {
    const arr = [...linhas];
    arr.sort((a, b) => {
      const va = valorDe(a, ordem.chave); const vb = valorDe(b, ordem.chave);
      const r = typeof va === 'number' && typeof vb === 'number'
        ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
      return ordem.desc ? -r : r;
    });
    return arr;
    /* eslint-disable-next-line react-hooks/exhaustive-deps -- `valorDe` é pura e deriva dos mapas. */
  }, [linhas, ordem, vendaPorCarga, industriaPorId, nomePorId, fazPorId]);

  const totalT = useMemo(
    () => linhas.reduce((a, l) => a + (l.toneladas ?? 0), 0), [linhas]);
  const totalValor = useMemo(
    () => linhas.reduce((a, l) => a + (vendaPorCarga.get(l.id)?.valor ?? 0), 0), [linhas, vendaPorCarga]);

  return (
    <table className="w-full table-fixed border-collapse text-[10px] leading-tight">
      <colgroup>{LARGURAS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
      <thead>
        <tr>
          {CABECALHOS.map(c => (
            <th key={c.chave}
              onClick={() => setOrdem(o => ({ chave: c.chave, desc: o.chave === c.chave ? !o.desc : false }))}
              className={cn(TH, c.direita && 'text-right', 'cursor-pointer select-none')}>
              {c.h}{ordem.chave === c.chave ? (ordem.desc ? ' ▾' : ' ▴') : ''}
            </th>
          ))}
          <th className={cn(TH, 'text-right')} />
        </tr>
      </thead>
      <tbody>
        {ordenadas.length === 0 && (
          <tr><td colSpan={CABECALHOS.length + 1}
            className="px-2 py-3 text-center text-[11px] text-muted-foreground">
            Nenhuma carga lançada neste talhão.
          </td></tr>
        )}
        {ordenadas.map(l => {
          const v = vendaPorCarga.get(l.id);
          const ind = l.industria_id ? industriaPorId.get(l.industria_id) : null;
          return (
            <tr key={l.id} className="border-t border-slate-100 odd:bg-[#1e3a5f]/[0.03]">
              <td className="truncate px-1 py-0" title={fazPorId.get(l.safra_area_id) || undefined}>
                {fazPorId.get(l.safra_area_id) || '—'}
              </td>
              <td className="truncate px-1 py-0" title={nomePorId.get(l.safra_area_id) || undefined}>
                {nomePorId.get(l.safra_area_id) || '—'}
              </td>
              <td className="whitespace-nowrap px-1 py-0 tabular-nums">{dataBR(l.data_colheita)}</td>
              <td className="truncate px-1 py-0" title={l.nf_produtor ?? undefined}>{l.nf_produtor || '—'}</td>
              <td className="truncate px-1 py-0" title={ind ?? undefined}>{ind || '—'}</td>
              {/* ⚠ DUAS CASAS NA TONELADA, como a RPC grava; o rendimento é inteiro em gramas. */}
              <td className="px-1 py-0 text-right tabular-nums">
                {l.toneladas != null ? formatNum(l.toneladas, 2) : '—'}
              </td>
              <td className="px-1 py-0 text-right tabular-nums">
                {l.rendimento_g != null ? formatNum(l.rendimento_g, 0) : '—'}
              </td>
              <td className="px-1 py-0 text-right tabular-nums text-green-700"
                title={v?.valor != null ? formatMoeda(v.valor) : undefined}>
                {v?.valor != null ? formatNum(v.valor, 2) : '—'}
              </td>
              <td className="px-1 py-0"><Pilula status={v?.status ?? null} /></td>
              <td className="whitespace-nowrap px-1 py-0 text-right">
                <Button variant="ghost" size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  disabled={somenteLeitura} title="Editar esta carga" onClick={() => onEditar(l)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  disabled={somenteLeitura} title="Excluir esta carga" onClick={() => onExcluir(l)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </td>
            </tr>
          );
        })}
      </tbody>
      {/* ⚠ O TOTAL CAI EMBAIXO DA SUA COLUNA, como na tabela irmã — não numa faixa solta. */}
      <tfoot>
        <tr className="border-t-2 border-slate-300 bg-card font-semibold">
          <td className="px-1 py-0.5" colSpan={5}>{ordenadas.length} carga(s)</td>
          <td className="px-1 py-0.5 text-right tabular-nums">{formatNum(totalT, 2)}</td>
          <td />
          <td className="px-1 py-0.5 text-right tabular-nums text-green-700"
            title={formatMoeda(totalValor)}>{formatNum(totalValor, 2)}</td>
          <td colSpan={2} />
        </tr>
      </tfoot>
    </table>
  );
}
