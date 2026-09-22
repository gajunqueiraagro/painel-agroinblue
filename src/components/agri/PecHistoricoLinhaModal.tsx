/**
 * O HISTÓRICO DE UMA LINHA DO DRE DA PECUÁRIA — DRE-HISTORICO-LINHA-01a.
 *
 * ⚠ ELE RESPONDE DUAS PERGUNTAS, e as duas metades da tela são elas: "como esta linha evoluiu?"
 * (as barras, safra a safra, contra a meta) e "quanto ela pesa no todo?" (o donut). Art. 19 da
 * Constituição nº 2 — a leitura vem com os companheiros que a tornam interpretável.
 *
 * ⚠ NENHUMA LEITURA PRÓPRIA. Os anos, o realizado e a meta chegam prontos de quem já os tinha em
 * cache: `useDrePecuariaLista` e `useDrePecuaria`, as MESMAS chaves da visão x Anos. Uma consulta
 * daqui seria a segunda fonte do mesmo número — e a segunda fonte é a que diverge.
 * ⚠ E NENHUMA CONTA DE UNIDADE PRÓPRIA: `valorNaUnidade` e a cascata vêm de `drePecRegua`, o
 * módulo que nasceu deste PR justamente para não haver duas contas de R$/@ na casa.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import { Segmentado } from '@/components/ui/segmentado';
import { BarrasCompactas, type BarraCompacta } from '@/components/ui/barras-compactas';
import { Donut, traco, VERDE, VERMELHO } from '@/components/agri/dreGrade';
import {
  LINHAS_PEC, BASE_DO_PERCENTUAL, ROTULO_UNIDADE, UNIDADES_PEC,
  centrosDoBloco, percentual, valorDe, valorNaUnidade,
  type ColunaPec, type UnidadePec, type DefPec,
} from '@/components/agri/drePecRegua';
import {
  BLOCO_DA_LINHA, rotuloCurtoPeriodo,
  type ChaveLinhaPec, type DrePecuaria, type DrePecLinhas,
} from '@/hooks/useDrePecuaria';

/** A linha que o operador clicou — a chave da cascata e, se for filha, o centro dela. */
export interface RecorteHistoricoPec {
  chave: ChaveLinhaPec;
  /** `null` = a própria linha da cascata; preenchido = a filha (centro de custo). */
  centro: string | null;
  /** O rótulo que a grade mostra, inteiro — é o título do modal. */
  rotulo: string;
  fazendaId: string | null;
  fazendaNome: string;
}

/** Um ponto da série — uma safra, o período da tela, ou a meta. */
interface Ponto {
  chave: string;
  rotulo: string;
  linhas: DrePecLinhas | null;
  meses: number;
  meta?: boolean;
}

/**
 * AS CORES DA NATUREZA — classes LITERAIS, nunca montadas por interpolação.
 *
 * ⚠ O Tailwind varre o código atrás do nome inteiro da classe: `bg-${cor}-600` não existe no CSS
 * gerado e a barra sairia transparente. Por isso as quatro variantes estão escritas por extenso.
 * ⚠ RESULTADO É RECEITA AQUI, e a razão é a leitura: verde e vermelho neste modal dizem "linha que
 * traz" e "linha que consome". Uma margem negativa aparece com número negativo — o sinal é do
 * número, não da paleta da linha.
 */
const CORES = {
  custo: {
    texto: VERMELHO, barra: 'bg-red-600', barraFraca: 'bg-red-200',
    coluna: 'bg-red-50', fatia: '#dc2626',
  },
  receita: {
    texto: VERDE, barra: 'bg-green-700', barraFraca: 'bg-green-200',
    coluna: 'bg-green-50', fatia: '#15803d',
  },
} as const;
export type Natureza = keyof typeof CORES;

/**
 * AS CORES DAS OUTRAS FATIAS — separadas entre si, nunca cinza.
 *
 * ⚠ CINZA SIGNIFICA "SEM DADO" NESTA CASA (o traço, a barra tracejada). Um pedaço cinza do donut
 * leria como ausência, quando é o irmão que está ali com valor próprio.
 */
const CORES_FATIA = ['#0d9488', '#7c3aed', '#d97706', '#2563eb', '#db2777', '#65a30d'];
const MAX_FATIAS = 5;

/** O escopo da coluna que abriu o modal: o total, ou uma fazenda. */
const linhasDoEscopo = (d: DrePecuaria | null, fazendaId: string | null): DrePecLinhas | null => {
  if (!d) return null;
  if (fazendaId === null) return d.total;
  return d.fazendas.find(f => f.fazenda_id === fazendaId)?.linhas ?? null;
};

/** O valor da linha (ou da filha) num ponto. ⚠ `null` é ausência — nunca zero. */
const valorDoRecorte = (l: DrePecLinhas | null, r: RecorteHistoricoPec): number | null => {
  if (!l) return null;
  if (r.centro === null) return valorDe(l, r.chave);
  const bloco = BLOCO_DA_LINHA[r.chave];
  if (!bloco) return null;
  return centrosDoBloco(l, bloco).find(c => c.centro === r.centro)?.valor ?? null;
};

/**
 * O TEXTO DE UM VALOR NA UNIDADE ESCOLHIDA.
 *
 * ⚠ A COLUNA FALSA É ADAPTAÇÃO DE FORMA, NÃO CONTA NOVA: `valorNaUnidade` pede uma `ColunaPec`
 * porque nasceu na grade, e do contrato dela usa só `linhas` e `meses` — que é exatamente o que um
 * ponto da série tem. Reescrever a função com outra assinatura faria dela a segunda dona da conta
 * da @, cuja base muda por linha; montar a forma que ela pede não muda nenhum número.
 */
const comoColuna = (l: DrePecLinhas | null, meses: number): ColunaPec => ({
  chave: '', nome: '', sub: '', fazendaId: null, linhas: l, total: false,
  tipo: 'valor', unidade: 'ha', de: '', ate: '', cenario: 'realizado', meses, atual: false,
});

/** ⚠ O R$ NÃO PASSA POR `valorNaUnidade` — ele é a célula de dinheiro, com milhar e 2 casas (A19). */
const texto = (u: UnidadePec, v: number | null, p: Ponto, chave: ChaveLinhaPec): string => {
  if (!p.linhas) return traco;
  if (u === 'rs') return v == null ? traco : formatNum(v, 2);
  return valorNaUnidade(u, v, comoColuna(p.linhas, p.meses), chave);
};

/**
 * O Δ CONTRA A META — e o sinal da COR depende da natureza, não do sinal do número.
 *
 * ⚠ GASTAR MAIS QUE O PLANEJADO É VERMELHO; FATURAR MAIS É VERDE. O mesmo "+12%" é boa notícia numa
 * linha de venda e má notícia numa de nutrição. Pintar pelo sinal do número diria o contrário em
 * metade da cascata.
 * ⚠ E BASE NULA DÁ TRAÇO, nunca 0%: meta ausente não é meta zerada.
 */
export function deltaMeta(atual: number | null, meta: number | null, natureza: Natureza) {
  if (atual == null || meta == null || !(Math.abs(meta) > 0)) return null;
  const pct = ((atual - meta) / Math.abs(meta)) * 100;
  const acima = pct > 0;
  const ruim = natureza === 'custo' ? acima : !acima;
  return {
    texto: `${acima ? '▲' : '▼'} ${formatNum(Math.abs(pct), 1)} %`,
    cor: ruim ? VERMELHO : VERDE,
  };
}


/** O que o anel mostra e contra o que o centro mede. */
export interface BaseDonut {
  /** O nome da base — o pai da filha, ou "= VBP". */
  rotuloBase: string;
  total: number;
  valorLinha: number | null;
  fatias: Array<{ nome: string; valor: number }>;
  /** A fatia que É a linha clicada — pintada na cor da natureza. */
  destaque: string | null;
}

/**
 * O QUE O DONUT MOSTRA — três bases, uma por tipo de linha (decisão do Gabriel):
 *   filha  → ela contra as IRMÃS (o peso dentro do bloco do pai);
 *   grupo  → a composição das próprias filhas;
 *   "=" e topo sem pai → ela contra o RESTANTE DO VBP.
 *
 * ⚠ O CENTRO RESPONDE SEMPRE A MESMA PERGUNTA: quanto ESTA linha pesa na base dela. No grupo, o
 * anel mostra as filhas e o centro continua dizendo o peso do grupo no VBP — senão o número do
 * meio seria 100% e não diria nada.
 * ⚠ FUNÇÃO PURA E EXPORTADA, não um `useMemo` escondido no render: é a regra que decide a leitura
 * inteira do modal, e dentro do JSX ela só seria testável montando a tela com cinco anos de dado.
 * ⚠ VALOR ABSOLUTO NAS FATIAS: um anel não desenha número negativo, e um centro com valor negativo
 * (reposição, dedução) faria a fatia sumir em vez de pesar.
 */
export function baseDoDonut(
  l: DrePecLinhas | null, recorte: RecorteHistoricoPec | null, def: DefPec | null,
): BaseDonut | null {
  {
    if (!recorte || !l) return null;
    const bloco = BLOCO_DA_LINHA[recorte.chave];
    const vbp = valorDe(l, BASE_DO_PERCENTUAL);
    const mostrarFilhas = recorte.centro === null && !!def?.expande && !!bloco;

    if (recorte.centro !== null && bloco) {
      const irmas = centrosDoBloco(l, bloco);
      const minha = irmas.find(c => c.centro === recorte.centro)?.valor ?? null;
      const total = irmas.reduce((a, c) => a + Math.abs(c.valor), 0);
      return {
        rotuloBase: def?.rotulo ?? '', total,
        valorLinha: minha,
        fatias: irmas.map(c => ({ nome: c.centro === '(sem)' ? 'sem centro' : c.centro, valor: Math.abs(c.valor) })),
        destaque: recorte.centro === '(sem)' ? 'sem centro' : recorte.centro,
      };
    }
    if (mostrarFilhas && bloco) {
      const filhas = centrosDoBloco(l, bloco);
      const total = filhas.reduce((a, c) => a + Math.abs(c.valor), 0);
      return {
        rotuloBase: '= VBP', total: vbp == null ? 0 : Math.abs(vbp),
        valorLinha: valorDe(l, recorte.chave),
        fatias: filhas.map(c => ({ nome: c.centro === '(sem)' ? 'sem centro' : c.centro, valor: Math.abs(c.valor) })),
        destaque: null,
      };
    }
    const v = valorDe(l, recorte.chave);
    const base = vbp == null ? 0 : Math.abs(vbp);
    const resto = Math.max(0, base - Math.abs(v ?? 0));
    return {
      rotuloBase: '= VBP', total: base, valorLinha: v,
      fatias: [{ nome: recorte.rotulo, valor: Math.abs(v ?? 0) }, { nome: 'restante do VBP', valor: resto }],
      destaque: recorte.rotulo,
    };
  }
}

export function PecHistoricoLinhaModal({
  aberto, recorte, atual, meta, anos, periodoRotulo, clienteNome, unidadeInicial, onFechar,
}: {
  aberto: boolean;
  recorte: RecorteHistoricoPec | null;
  /** O realizado do período da tela — a coluna "atual" da série. */
  atual: DrePecuaria | null;
  meta: DrePecuaria | null;
  /** Os anteriores, do MAIS RECENTE ao mais antigo — como `useDrePecuariaLista` devolve. */
  anos: readonly { de: string; ate: string; dre: DrePecuaria | null; carregando: boolean }[];
  periodoRotulo: string;
  clienteNome: string;
  /** A primeira unidade marcada nos chips do DRE — o modal abre nela. */
  unidadeInicial: UnidadePec;
  onFechar: () => void;
}) {
  /* ⚠ TODOS OS HOOKS ANTES DE QUALQUER `return` — o modal tem saída antecipada (`!recorte`), e um
     `useMemo` abaixo dela é o React #310 que derrubou duas telas em 21/09. */
  const [unidade, setUnidade] = useState<UnidadePec>(unidadeInicial);
  const [selecionada, setSelecionada] = useState<string | null>(null);

  /* ⚠ ABRIR É RECOMEÇAR: a unidade volta à do DRE e a safra ao período da tela. Sem isso, o modal
     da segunda linha abriria na unidade que o operador escolheu na primeira. */
  useEffect(() => {
    if (aberto) { setUnidade(unidadeInicial); setSelecionada(null); }
  }, [aberto, unidadeInicial, recorte?.chave, recorte?.centro]);

  const def = useMemo(
    () => LINHAS_PEC.find(d => d.chave === recorte?.chave) ?? null, [recorte?.chave]);
  const natureza: Natureza = def?.tom === 'custo' ? 'custo' : 'receita';
  const cores = CORES[natureza];

  /** A série, em ORDEM CRONOLÓGICA: o mais antigo à esquerda, o período da tela, a meta por último. */
  const pontos = useMemo((): Ponto[] => {
    const anteriores = [...anos].reverse().map((a, i): Ponto => ({
      chave: `ano-${i}`,
      rotulo: rotuloCurtoPeriodo(a.de, a.ate),
      linhas: linhasDoEscopo(a.dre, recorte?.fazendaId ?? null),
      meses: a.dre?.periodo.meses ?? 0,
    }));
    const doAtual: Ponto = {
      chave: 'atual', rotulo: periodoRotulo,
      linhas: linhasDoEscopo(atual, recorte?.fazendaId ?? null),
      meses: atual?.periodo.meses ?? 0,
    };
    const daMeta: Ponto = {
      chave: 'meta', rotulo: 'Meta',
      linhas: linhasDoEscopo(meta, recorte?.fazendaId ?? null),
      meses: meta?.periodo.meses ?? doAtual.meses, meta: true,
    };
    return [...anteriores, doAtual, daMeta];
  }, [anos, atual, meta, periodoRotulo, recorte?.fazendaId]);

  const escolhida = selecionada ?? 'atual';
  const pontoEscolhido = useMemo(
    () => pontos.find(p => p.chave === escolhida) ?? null, [pontos, escolhida]);

  const donut = useMemo(
    () => baseDoDonut(pontoEscolhido?.linhas ?? null, recorte, def),
    [pontoEscolhido, recorte, def]);


  /** As fatias desenhadas: as 5 maiores mais "Outros" — um anel de vinte fatias não se lê. */
  const fatias = useMemo(() => {
    if (!donut) return [];
    const ordenadas = [...donut.fatias].filter(f => f.valor > 0).sort((a, b) => b.valor - a.valor);
    if (ordenadas.length <= MAX_FATIAS + 1) return ordenadas;
    const cabeca = ordenadas.slice(0, MAX_FATIAS);
    const cauda = ordenadas.slice(MAX_FATIAS).reduce((a, f) => a + f.valor, 0);
    /* ⚠ A FATIA CLICADA NUNCA VAI PARA "Outros": ela é o motivo do modal estar aberto. */
    const destaqueFora = donut.destaque && !cabeca.some(f => f.nome === donut.destaque)
      ? ordenadas.find(f => f.nome === donut.destaque) : null;
    const base = destaqueFora ? [...cabeca.slice(0, MAX_FATIAS - 1), destaqueFora] : cabeca;
    const somaCauda = ordenadas.filter(f => !base.includes(f)).reduce((a, f) => a + f.valor, 0);
    return [...base, { nome: 'Outros', valor: destaqueFora ? somaCauda : cauda }];
  }, [donut]);

  if (!aberto || !recorte) return null;

  const chave = recorte.chave;
  const paiRotulo = recorte.centro !== null ? (def?.rotulo ?? '') : null;
  const valorAtual = valorDoRecorte(pontos.find(p => p.chave === 'atual')?.linhas ?? null, recorte);
  const valorMeta = valorDoRecorte(pontos.find(p => p.chave === 'meta')?.linhas ?? null, recorte);

  const barras: BarraCompacta[] = pontos.map(p => {
    const v = valorDoRecorte(p.linhas, recorte);
    const t = texto(unidade, v, p, chave);
    return {
      rotulo: p.rotulo,
      valor: t === traco ? null : v,
      texto: t,
      meta: p.meta,
      cor: p.meta ? undefined : (p.chave === escolhida ? cores.barra : cores.barraFraca),
      corTexto: p.meta ? 'text-amber-600' : cores.texto,
    };
  });

  const valorDonut = donut?.valorLinha ?? null;
  const pctDonut = donut && donut.total > 0 && valorDonut != null
    ? percentual(Math.abs(valorDonut), donut.total) : traco;
  const corDaFatia = (_i: number, nome: string) => {
    if (donut?.destaque && nome === donut.destaque) return cores.fatia;
    const i = fatias.findIndex(f => f.nome === nome);
    return CORES_FATIA[i % CORES_FATIA.length];
  };

  const semArrobaNaMeta = unidade === 'arroba'
    && (pontos.find(p => p.chave === 'meta')?.linhas?.producao.at_produzida ?? null) == null;

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      {/* ⚠ LARGURA FIXA: trocar unidade ou safra não pode mexer no tamanho de nada — o operador
          compara números, e uma caixa que respira a cada clique desfaz a comparação. */}
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        {/* ⚠ O CABEÇALHO AZUL É O DO `PecLancamentosModal`, o vizinho desta mesma tela. */}
        <div className="flex items-start justify-between gap-2 bg-primary px-4 py-2.5 text-primary-foreground">
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-medium leading-tight">{recorte.rotulo} · histórico</h2>
            <div className="mt-0.5 truncate text-[11px] text-primary-foreground/80">
              {[clienteNome, recorte.fazendaId === null ? 'Global' : recorte.fazendaNome,
                paiRotulo ? `dentro de ${paiRotulo}` : null].filter(Boolean).join(' · ')}
            </div>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar"
            className="shrink-0 text-primary-foreground/80 hover:text-primary-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-auto px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <Segmentado altura={22} valor={unidade} onEscolher={setUnidade}
              opcoes={UNIDADES_PEC.map(u => ({ valor: u, rotulo: ROTULO_UNIDADE[u] }))} />
          </div>

          {/* ⚠ DUAS METADES IGUAIS, topo alinhado: as barras e o donut respondem perguntas
              diferentes sobre a MESMA linha, e nenhuma manda na outra. */}
          <div className="grid grid-cols-2 items-start gap-3">
            <BarrasCompactas barras={barras} titulo={`${recorte.rotulo} · ${ROTULO_UNIDADE[unidade]}`}
              altura={150} larguraMax={330} preencherLargura larguraBarra={22} fonteValor={9}
              onClickBarra={i => setSelecionada(pontos[i]?.chave ?? null)} />

            <div className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className={cn('truncate text-[13px] font-medium', cores.texto)}>
                  {recorte.rotulo} {texto(unidade, valorDonut, pontoEscolhido ?? pontos[0], chave)}
                  <span className="ml-1 text-[11px] font-normal">{ROTULO_UNIDADE[unidade]}</span>
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{pontoEscolhido?.rotulo ?? ''}</span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                de {donut ? formatNum(donut.total, 2) : traco} {ROTULO_UNIDADE.rs} do{' '}
                {donut?.rotuloBase ?? traco}
              </div>
              <div className="flex items-center gap-2">
                <Donut dados={fatias} cor={corDaFatia} total={donut?.total ?? 0} rotuloTotal=""
                  tamanho={140}
                  centro={<span className="text-[15px] font-medium tabular-nums">{pctDonut}</span>} />
                {/* ⚠ LEGENDA DE LARGURA FIXA E UMA LINHA POR ITEM: um nome de centro comprido
                    quebraria a linha e empurraria o donut para cima — o modal mudaria de altura ao
                    trocar de safra, que é o oposto do que se pede dele. */}
                <div className="flex w-[130px] shrink-0 flex-col gap-0.5">
                  {fatias.map((f, i) => (
                    <div key={f.nome} className="flex items-center gap-1 text-[9px] leading-[12px]">
                      <span className="h-[7px] w-[7px] shrink-0 rounded-[2px]"
                        style={{ backgroundColor: corDaFatia(i, f.nome) }} />
                      <span className="truncate whitespace-nowrap" title={f.nome}>{f.nome}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <TabelaHistorico pontos={pontos} recorte={recorte} chave={chave} escolhida={escolhida}
            unidade={unidade} cores={cores} natureza={natureza}
            paiRotulo={donut?.rotuloBase ?? null}
            valorAtual={valorAtual} valorMeta={valorMeta} />
        </div>

        {/* ⚠ O RODAPÉ DECLARA O DIVISOR (Art. 19): sem o denominador à mão, o operador não tem como
            refazer a conta que a tela mostra. */}
        <div className="bg-primary px-4 py-1.5 text-[11px] leading-[14px] text-primary-foreground/80">
          R$/ha ÷ área média do período · R$/cab/mês ÷ cabeça média ÷ meses · R$/@ ÷ @ vendida
          (receita e deduções), comprada (reposição) ou produzida (demais)
          {semArrobaNaMeta && ' · meta sem @ produzida no banco (traço)'}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ⚠ A TABELA É A PROVA DO GRÁFICO: as quatro unidades do mesmo número, safra a safra. Quem
   desconfiar da barra confere aqui — e é ela que leva o Δ contra a meta. */
function TabelaHistorico({
  pontos, recorte, chave, escolhida, unidade, cores, natureza, paiRotulo, valorAtual, valorMeta,
}: {
  pontos: readonly Ponto[];
  recorte: RecorteHistoricoPec;
  chave: ChaveLinhaPec;
  escolhida: string;
  unidade: UnidadePec;
  cores: typeof CORES[Natureza];
  natureza: Natureza;
  paiRotulo: string | null;
  valorAtual: number | null;
  valorMeta: number | null;
}) {
  const W_UNIDADE = 96;
  const W_PONTO = 78;
  const W_DELTA = 74;
  const delta = deltaMeta(valorAtual, valorMeta, natureza);
  const semMeta = pontos.find(p => p.chave === 'meta');
  const largura = W_UNIDADE + pontos.length * W_PONTO + W_DELTA;

  /** A linha de percentual: o peso da linha na base, ponto a ponto. */
  const pctDoPonto = (p: Ponto) => {
    if (!p.linhas) return traco;
    const v = valorDoRecorte(p.linhas, recorte);
    const bloco = BLOCO_DA_LINHA[chave];
    const base = recorte.centro !== null && bloco
      ? centrosDoBloco(p.linhas, bloco).reduce((a, c) => a + Math.abs(c.valor), 0)
      : Math.abs(valorDe(p.linhas, BASE_DO_PERCENTUAL) ?? 0);
    return v == null ? traco : percentual(Math.abs(v), base);
  };

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="border-collapse text-[11px] leading-none" style={{ tableLayout: 'fixed', width: largura }}>
        <colgroup>
          <col style={{ width: W_UNIDADE }} />
          {pontos.map(p => <col key={p.chave} style={{ width: W_PONTO }} />)}
          <col style={{ width: W_DELTA }} />
        </colgroup>
        <thead>
          <tr style={{ height: 18 }} className="bg-muted">
            <th className="truncate px-[7px] text-left text-[9px] font-medium text-muted-foreground">Unidade</th>
            {pontos.map(p => (
              <th key={p.chave}
                className={cn('truncate px-[7px] text-right text-[9px] font-medium',
                  p.meta ? 'text-amber-600' : 'text-muted-foreground',
                  p.chave === escolhida && !p.meta && cores.coluna)}
                title={p.rotulo}>
                {p.rotulo}
              </th>
            ))}
            <th className="truncate px-[7px] text-right text-[9px] font-medium text-muted-foreground"
              title="o período da tela contra a meta">Δ meta</th>
          </tr>
        </thead>
        <tbody>
          {UNIDADES_PEC.map(u => (
            <tr key={u} style={{ height: 16 }} className="border-t border-border/60">
              <td className={cn('truncate px-[7px] text-[9px]', u === unidade ? 'font-medium' : 'text-muted-foreground')}>
                {ROTULO_UNIDADE[u]}
              </td>
              {pontos.map(p => (
                <td key={p.chave}
                  className={cn('truncate px-[7px] text-right tabular-nums',
                    u === unidade ? 'text-[9.5px] font-medium' : 'text-[9px] font-normal',
                    p.meta ? 'text-amber-600' : cores.texto,
                    p.chave === escolhida && !p.meta && cores.coluna)}>
                  {texto(u, valorDoRecorte(p.linhas, recorte), p, chave)}
                </td>
              ))}
              <td className="truncate px-[7px] text-right text-[9px] tabular-nums text-muted-foreground">
                {u === unidade && delta
                  ? <span className={delta.cor}>{delta.texto}</span>
                  : u === unidade ? traco : ''}
              </td>
            </tr>
          ))}
          {/* ⚠ A ÚLTIMA LINHA É O PESO, e ela fecha a pergunta do modal: a evolução acima, o peso
              aqui, na mesma tabela e safra a safra. */}
          <tr style={{ height: 16 }} className="border-t border-border/60 bg-muted/40">
            <td className="truncate px-[7px] text-[9px] text-muted-foreground"
              title={paiRotulo ?? undefined}>
              % do {recorte.centro !== null ? 'bloco' : 'VBP'}
            </td>
            {pontos.map(p => (
              <td key={p.chave}
                className={cn('truncate px-[7px] text-right text-[9px] tabular-nums text-muted-foreground',
                  p.chave === escolhida && !p.meta && cores.coluna)}>
                {pctDoPonto(p)}
              </td>
            ))}
            <td />
          </tr>
        </tbody>
      </table>
      {!semMeta && <div className="mt-1 text-[9px] text-muted-foreground">sem meta no período</div>}
    </div>
  );
}
