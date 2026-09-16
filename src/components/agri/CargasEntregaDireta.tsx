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
 *
 * ⚠ UMA LINHA É UMA CARGA, NÃO UMA LINHA DE `agri_colheita` — AGRI-MANDIOCA-01c §3. O caminhão
 * que sai com 21,10 t pode ter arrancado metade num talhão e metade no outro, e o backfill gravou
 * essas metades como duas colheitas. Elas são a mesma carga: saíram na mesma nota, no mesmo
 * ticket, e geraram UM lançamento de venda. Mostrá-las separadas dobrava a lista (42 linhas para
 * 21 cargas) e obrigava o operador a somar de cabeça para conferir contra o romaneio.
 * ⚠ A CHAVE É O LANÇAMENTO DE VENDA, e não a NF nem o ticket: é ele que a RPC criou UMA vez por
 * carga, então ele é o que define "a mesma carga" no dado, e não numa convenção de digitação.
 * Medido no Proto em 16/09: os 21 grupos têm exatamente 2 colheitas e UM `rendimento_g` cada.
 * ⚠ CARGA SEM ELO FICA SOZINHA, com chave própria: sem lançamento não há o que agrupar, e juntar
 * pela NF as cargas antigas inventaria um vínculo que o banco não tem.
 */
import { useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatNum, formatMoeda } from '@/lib/calculos/formatters';
import type { ColheitaRow, VendaDaCarga } from '@/hooks/useColheita';

/**
 * UMA CARGA — as colheitas que compartilham o mesmo lançamento de venda.
 *
 * ⚠ `ids` GUARDA TODAS AS COLHEITAS, porque editar e excluir agem sobre a carga inteira: corrigir
 * só uma metade deixaria a outra com a nota velha e o mesmo lançamento apontando para duas
 * verdades.
 */
export interface CargaAgrupada {
  chave: string;
  ids: string[];
  /** A colheita que representa a carga nos campos que não se somam (data, NF, preço). */
  principal: ColheitaRow;
  faz: string;
  /** Os talhões das metades, unidos por " · " em ordem alfabética. */
  talhao: string;
  comprador: string;
  toneladas: number;
  rendimento_g: number | null;
  preco_g: number | null;
  valor: number | null;
  status: string | null;
}

/** As larguras, na mesma gramática da tabela irmã. */
const LARGURAS = ['5%', '13%', '8%', '11%', '15%', '8%', '7%', '8%', '12%', '9%', '4%'];

type Chave = 'faz' | 'talhao' | 'data' | 'nf' | 'comprador' | 't' | 'g' | 'preco' | 'valor' | 'status';

const CABECALHOS: ReadonlyArray<{ chave: Chave; h: string; direita?: boolean; title?: string }> = [
  { chave: 'faz', h: 'Faz' },
  { chave: 'talhao', h: 'Talhão' },
  { chave: 'data', h: 'Data' },
  { chave: 'nf', h: 'NF' },
  { chave: 'comprador', h: 'Comprador' },
  { chave: 't', h: 't', direita: true, title: 'Peso líquido entregue, em toneladas' },
  { chave: 'g', h: 'g', direita: true, title: 'Rendimento: gramas de amido por 5 kg' },
  { chave: 'preco', h: 'R$/g', direita: true, title: 'Preço por grama de rendimento' },
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

/**
 * AS COLHEITAS VIRAM CARGAS.
 *
 * ⚠ EXPORTADA PARA O TESTE, e é ela que carrega a regra do §3 — a chave, a união dos talhões e o
 * que se soma. Deixá-la dentro do componente obrigaria a montar a tabela para conferir a conta.
 */
export function agruparCargas(
  linhas: readonly ColheitaRow[],
  vendaPorCarga: Map<string, VendaDaCarga>,
  industriaPorId: Map<string, string>,
  nomePorId: Map<string, string>,
  fazPorId: Map<string, string>,
): CargaAgrupada[] {
  const porChave = new Map<string, ColheitaRow[]>();
  for (const l of linhas) {
    const elo = vendaPorCarga.get(l.id);
    /* ⚠ O PREFIXO EVITA COLISÃO: um id de colheita nunca é um id de lançamento, mas a chave é
       texto, e prefixar diz no próprio valor de onde ela veio. */
    const chave = elo ? `venda:${elo.lancamento_id}` : `avulsa:${l.id}`;
    const atual = porChave.get(chave);
    if (atual) atual.push(l); else porChave.set(chave, [l]);
  }

  const cargas: CargaAgrupada[] = [];
  for (const [chave, itens] of porChave) {
    /* ⚠ A PRINCIPAL É A PRIMEIRA POR id, não "a que vier": a ordem do `select` pode mudar, e a
       linha da tabela mudaria de data com ela sem que nada tivesse acontecido. */
    const ordenadas = [...itens].sort((a, b) => a.id.localeCompare(b.id));
    const principal = ordenadas[0];
    const elo = vendaPorCarga.get(principal.id);
    const talhoes = Array.from(new Set(
      ordenadas.map(l => nomePorId.get(l.safra_area_id) ?? '').filter(Boolean),
    )).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const fazendas = Array.from(new Set(
      ordenadas.map(l => fazPorId.get(l.safra_area_id) ?? '').filter(Boolean),
    )).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    /* ⚠ O RENDIMENTO NÃO SE MEDIA: é o da carga, e as metades carregam o mesmo número (medido:
       um `rendimento_g` distinto por grupo nos 21). Fazer média aqui inventaria um terceiro
       valor nas cargas em que o banco, um dia, divergir — e esconderia a divergência. */
    cargas.push({
      chave,
      ids: ordenadas.map(l => l.id),
      principal,
      faz: fazendas.join(' · '),
      talhao: talhoes.join(' · '),
      comprador: principal.industria_id ? (industriaPorId.get(principal.industria_id) ?? '') : '',
      /* O peso líquido da carga é a soma das metades — §3. */
      toneladas: ordenadas.reduce((a, l) => a + (l.toneladas ?? 0), 0),
      rendimento_g: principal.rendimento_g,
      preco_g: principal.preco_g,
      /* ⚠ O VALOR É LIDO UMA VEZ, do lançamento: somar o valor das duas metades contaria o mesmo
         dinheiro duas vezes, porque as duas apontam para o MESMO lançamento. */
      valor: elo?.valor ?? null,
      status: elo?.status ?? null,
    });
  }
  return cargas;
}

export function CargasEntregaDireta({
  linhas, vendaPorCarga, industriaPorId, nomePorId, fazPorId,
  rendimentoMedioG, somenteLeitura, onEditar, onExcluir,
}: {
  linhas: readonly ColheitaRow[];
  vendaPorCarga: Map<string, VendaDaCarga>;
  industriaPorId: Map<string, string>;
  nomePorId: Map<string, string>;
  fazPorId: Map<string, string>;
  /**
   * O g médio do rodapé — vem de `entrega.rendimento_medio_g`, a RPC.
   *
   * ⚠ NÃO SE CALCULA AQUI, e a diferença é real: a média da safra é PONDERADA PELA TONELADA
   * (`sum(rendimento_g*toneladas)/sum(toneladas)`), e a média simples das 21 linhas daria outro
   * número. Dois totais para a mesma pergunta é o que faz o operador duvidar da tela.
   */
  rendimentoMedioG?: number | null;
  somenteLeitura?: boolean;
  onEditar: (c: CargaAgrupada) => void;
  onExcluir: (c: CargaAgrupada) => void;
}) {
  /* ⚠ ORDENAÇÃO PRÓPRIA, e nasce por DATA como a da irmã: a carga se confere na ordem em que
     entrou na indústria. */
  const [ordem, setOrdem] = useState<{ chave: Chave; desc: boolean }>({ chave: 'data', desc: false });

  const cargas = useMemo(
    () => agruparCargas(linhas, vendaPorCarga, industriaPorId, nomePorId, fazPorId),
    [linhas, vendaPorCarga, industriaPorId, nomePorId, fazPorId]);

  const valorDe = (c: CargaAgrupada, k: Chave): string | number => {
    switch (k) {
      case 'faz': return c.faz;
      case 'talhao': return c.talhao;
      case 'data': return c.principal.data_colheita ?? '';
      case 'nf': return c.principal.nf_produtor ?? '';
      case 'comprador': return c.comprador;
      case 't': return c.toneladas;
      case 'g': return c.rendimento_g ?? 0;
      case 'preco': return c.preco_g ?? 0;
      case 'valor': return c.valor ?? 0;
      case 'status': return c.status ?? '';
    }
  };

  const ordenadas = useMemo(() => {
    const arr = [...cargas];
    arr.sort((a, b) => {
      const va = valorDe(a, ordem.chave); const vb = valorDe(b, ordem.chave);
      const r = typeof va === 'number' && typeof vb === 'number'
        ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
      return ordem.desc ? -r : r;
    });
    return arr;
    /* eslint-disable-next-line react-hooks/exhaustive-deps -- `valorDe` é pura e deriva de `cargas`. */
  }, [cargas, ordem]);

  const totalT = useMemo(() => cargas.reduce((a, c) => a + c.toneladas, 0), [cargas]);
  const totalValor = useMemo(() => cargas.reduce((a, c) => a + (c.valor ?? 0), 0), [cargas]);

  return (
    <table className="w-full table-fixed border-collapse text-[10px] leading-tight">
      <colgroup>{LARGURAS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
      <thead>
        <tr>
          {CABECALHOS.map(c => (
            <th key={c.chave} title={c.title}
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
        {ordenadas.map(c => (
          <tr key={c.chave} className="border-t border-slate-100 odd:bg-[#1e3a5f]/[0.03]">
            <td className="truncate px-1 py-0" title={c.faz || undefined}>{c.faz || '—'}</td>
            {/* ⚠ O `title` GUARDA OS DOIS TALHÕES INTEIROS: com largura fixa "IND.05 · IND.06"
                corta, e é justamente a segunda metade que se quer conferir. */}
            <td className="truncate px-1 py-0" title={c.talhao || undefined}>{c.talhao || '—'}</td>
            <td className="whitespace-nowrap px-1 py-0 tabular-nums">{dataBR(c.principal.data_colheita)}</td>
            <td className="truncate px-1 py-0" title={c.principal.nf_produtor ?? undefined}>
              {c.principal.nf_produtor || '—'}
            </td>
            <td className="truncate px-1 py-0" title={c.comprador || undefined}>{c.comprador || '—'}</td>
            {/* ⚠ DUAS CASAS NA TONELADA, como a RPC grava; o rendimento é inteiro em gramas. */}
            <td className="px-1 py-0 text-right tabular-nums">{formatNum(c.toneladas, 2)}</td>
            <td className="px-1 py-0 text-right tabular-nums">
              {c.rendimento_g != null ? formatNum(c.rendimento_g, 0) : '—'}
            </td>
            <td className="px-1 py-0 text-right tabular-nums">
              {c.preco_g != null ? formatNum(c.preco_g, 2) : '—'}
            </td>
            <td className="px-1 py-0 text-right tabular-nums text-green-700"
              title={c.valor != null ? formatMoeda(c.valor) : undefined}>
              {c.valor != null ? formatNum(c.valor, 2) : '—'}
            </td>
            <td className="px-1 py-0"><Pilula status={c.status} /></td>
            <td className="whitespace-nowrap px-1 py-0 text-right">
              <Button variant="ghost" size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                disabled={somenteLeitura} title="Editar esta carga" onClick={() => onEditar(c)}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                disabled={somenteLeitura}
                title={c.ids.length > 1
                  ? `Excluir esta carga — as ${c.ids.length} colheitas que a compõem`
                  : 'Excluir esta carga'}
                onClick={() => onExcluir(c)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
      {/* ⚠ O TOTAL CAI EMBAIXO DA SUA COLUNA, como na tabela irmã — não numa faixa solta. */}
      <tfoot>
        <tr className="border-t-2 border-slate-300 bg-card font-semibold">
          <td className="px-1 py-0.5" colSpan={5}>{ordenadas.length} carga(s)</td>
          <td className="px-1 py-0.5 text-right tabular-nums">{formatNum(totalT, 2)}</td>
          {/* ⚠ O g DO RODAPÉ É A MÉDIA DA RPC, ponderada pela tonelada — ver a prop. */}
          <td className="px-1 py-0.5 text-right tabular-nums"
            title="Rendimento médio da safra, ponderado pela tonelada">
            {rendimentoMedioG != null ? formatNum(rendimentoMedioG, 0) : '—'}
          </td>
          <td />
          <td className="px-1 py-0.5 text-right tabular-nums text-green-700"
            title={formatMoeda(totalValor)}>{formatNum(totalValor, 2)}</td>
          <td colSpan={2} />
        </tr>
      </tfoot>
    </table>
  );
}
