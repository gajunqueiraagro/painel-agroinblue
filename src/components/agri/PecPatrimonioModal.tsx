/**
 * A VARIAÇÃO DO VALOR DO REBANHO — VARIACAO-REBANHO-MODAL-01-fix1 (mock v7).
 *
 * ⚠ ELE EXISTE PARA SEPARAR DUAS COISAS QUE SOMAM IGUAL E QUEREM DIZER O OPOSTO. A produção é o
 * rebanho que mudou com o PREÇO TRAVADO no início; o mercado é o preço que mudou com as ARROBAS
 * travadas no fim. Fundi-las numa "variação de patrimônio" esconderia qual das duas respondeu pelo
 * resultado — que é a pergunta que o produtor faz quando o número sobe sem ele ter vendido nada.
 *
 * ⚠ UMA TABELA SÓ, OITO COLUNAS, IGUAL NAS TRÊS ABAS, e é isso que torna a comparação possível: o
 * que muda entre elas é QUAL COLUNA ESTÁ TRAVADA (em cinza), não o desenho. Trocar de aba não move
 * uma coluna — as larguras são as mesmas nas três, por construção.
 *
 * ⚠ E A SOMA FECHA POR CONSTRUÇÃO: Δ(Produção) + Δ(Mercado) = Δ(Resumo), categoria a categoria e no
 * total. Os três Δ saem dos MESMOS três valores do payload — `v0` (início a preço do início),
 * `v1_p0` (fim a preço do início) e `v1_p1` (fim a preço do fim). Sem o valor do MEIO as duas
 * variações seriam indistinguíveis.
 *
 * ⚠ A ARROBA É A DA CASA, NÃO UM FATOR INVENTADO: `kgToArrobas` (`src/types/cattle.ts`), peso vivo
 * ÷ 30. O ÷15 do repositório é de CARCAÇA (abate) e não se aplica a estoque vivo. O DRE não serve
 * de fonte aqui: as arrobas dele (`at_produzida`, `at_desfrutada`, `at_comprada`) são de FLUXO — o
 * que a fazenda fabricou, vendeu ou comprou no período —, e o que este modal mostra é ESTOQUE.
 *
 * ⚠ NÃO HÁ ABA "LANÇAMENTOS", e isso é dado, não omissão: patrimônio não tem lançamento. Ele sai do
 * fechamento do rebanho — a foto do mês.
 */
import { useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import { BarrasCompactas, type BarraCompacta } from '@/components/ui/barras-compactas';
import { kgToArrobas } from '@/types/cattle';
import type { PatrimonioPec, CategoriaPatrimonio } from '@/hooks/useDrePecuaria';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (am: string) => {
  const [a, m] = (am || '').split('-');
  const i = Number(m) - 1;
  return i >= 0 && i < 12 ? `${MESES[i]}/${a.slice(2)}` : (am || '—');
};

/** ⚠ AUSÊNCIA É TRAÇO, ZERO É NÚMERO — a sentinela do projeto. */
const n2 = (v: number | null | undefined, casas = 2) => (v == null ? '—' : formatNum(v, casas));
const pct = (v: number | null, base: number | null) =>
  (v == null || base == null || base === 0 ? '—' : `${formatNum((v / Math.abs(base)) * 100, 1)} %`);
const comSinal = (v: number | null, casas = 2) =>
  (v == null ? '—' : `${v > 0 ? '+' : ''}${formatNum(v, casas)}`);

/** As cores do mock v7. */
const NAVY = '#0C447C';
const CAB_ESCURO = '#2C3E5C';
const CINZA_TOTAL = '#D3D1C7';
const VERDE = 'text-emerald-700';
const VERMELHO = 'text-destructive';
const corSinal = (v: number | null) => (v == null || v === 0 ? '' : v > 0 ? VERDE : VERMELHO);

type Aba = 'producao' | 'mercado' | 'resumo';

/**
 * UMA LINHA DA TABELA, JÁ NA UNIDADE DA TELA — e o que a aba faz é TRAVAR uma das pontas.
 *
 * ⚠ O TRAVAMENTO É DADO, NÃO ENFEITE: na Produção o preço do fim É o do início (por isso a coluna
 * sai cinza), e na Mercado as arrobas do início SÃO as do fim. A célula cinza não é "indisponível":
 * ela diz "esta ponta foi congelada para isolar a outra".
 */
interface LinhaVM {
  categoria: string;
  pkIni: number | null;   // R$/@ do início
  pkFim: number | null;   // R$/@ do fim (na aba Produção, igual ao do início)
  atIni: number | null;   // @ do início (na aba Mercado, igual às do fim)
  atFim: number | null;   // @ do fim
  vIni: number;
  vFim: number;
  delta: number;
}

/**
 * @ de uma ponta: cabeças × peso médio, em arrobas da casa.
 *
 * ⚠ ZERO CABEÇAS É ZERO ARROBA, NÃO AUSÊNCIA, e a distinção decide o número grande da aba. Uma
 * categoria que não existia no início vem com `q = 0` e `peso = null` — "não há peso médio de
 * nenhum animal" é verdade, mas o estoque dela é ZERO, e isso se sabe. Tratar como ausência fazia
 * o total de @ virar `null` (a soma propaga), e a aba Produção abria com "— @" por causa de uma
 * categoria vazia. Medido no NJ jul/22-jun/23, categoria `bois`.
 */
const arrobasDe = (q: number, pm: number | null): number | null =>
  (q === 0 ? 0 : pm == null ? null : kgToArrobas(q * pm));
/** R$/@ = valor ÷ @. ⚠ Nunca média simples de preços: a mistura de categorias muda a média. */
const porArroba = (valor: number, at: number | null): number | null =>
  (at == null || at === 0 ? null : valor / at);

function montar(cats: readonly CategoriaPatrimonio[], aba: Aba): LinhaVM[] {
  return cats.map(c => {
    const atIni = arrobasDe(c.q0, c.pm0);
    const atFim = arrobasDe(c.q1, c.pm1);
    const pkIni = porArroba(c.v0, atIni);
    const pkFimReal = porArroba(c.v1_p1, atFim);
    if (aba === 'producao') {
      /* preço travado: as duas colunas de valor usam o R$/@ do início. Δ = vpb. */
      return { categoria: c.categoria, pkIni, pkFim: pkIni, atIni, atFim,
        vIni: c.v0, vFim: c.v1_p0, delta: c.vpb };
    }
    if (aba === 'mercado') {
      /* arrobas travadas: as duas colunas de valor usam as @ do fim. Δ = efeito. */
      return { categoria: c.categoria, pkIni, pkFim: pkFimReal, atIni: atFim, atFim,
        vIni: c.v1_p0, vFim: c.v1_p1, delta: c.efeito };
    }
    return { categoria: c.categoria, pkIni, pkFim: pkFimReal, atIni, atFim,
      vIni: c.v0, vFim: c.v1_p1, delta: c.vpb + c.efeito };
  });
}

/** ⚠ O TOTAL DE R$/@ É PONDERADO (valor ÷ @), nunca a média das categorias. */
function totalDe(linhas: readonly LinhaVM[]): LinhaVM {
  const soma = (f: (l: LinhaVM) => number | null) =>
    linhas.reduce<number | null>((a, l) => { const v = f(l); return a == null || v == null ? null : a + v; }, 0);
  const atIni = soma(l => l.atIni); const atFim = soma(l => l.atFim);
  const vIni = linhas.reduce((a, l) => a + l.vIni, 0);
  const vFim = linhas.reduce((a, l) => a + l.vFim, 0);
  return { categoria: 'Total', pkIni: porArroba(vIni, atIni), pkFim: porArroba(vFim, atFim),
    atIni, atFim, vIni, vFim, delta: linhas.reduce((a, l) => a + l.delta, 0) };
}

/** As oito colunas, com largura fixa — IDÊNTICAS nas três abas. */
const COLS: ReadonlyArray<{ chave: string; rotulo: string; largura: number; esq?: boolean }> = [
  { chave: 'categoria', rotulo: 'Categoria', largura: 150, esq: true },
  { chave: 'pkIni', rotulo: 'R$/@ início', largura: 104 },
  { chave: 'pkFim', rotulo: 'R$/@ fim', largura: 104 },
  { chave: 'atIni', rotulo: '@ início', largura: 108 },
  { chave: 'atFim', rotulo: '@ fim', largura: 108 },
  { chave: 'vIni', rotulo: 'Valor início', largura: 128 },
  { chave: 'vFim', rotulo: 'Valor fim', largura: 128 },
  { chave: 'delta', rotulo: 'Δ', largura: 128 },
];
const LARGURA = COLS.reduce((a, c) => a + c.largura, 0);

/** Qual coluna sai em cinza — a ponta que a aba congelou. */
const travada = (aba: Aba): string | null =>
  (aba === 'producao' ? 'pkFim' : aba === 'mercado' ? 'atIni' : null);

const TD = 'truncate px-2 py-0.5 text-[11px] tabular-nums';

export function PecPatrimonioModal({
  aberto, fazendaNome, clienteNome, qual, patrimonio, carregando, periodo, onFechar,
}: {
  aberto: boolean;
  fazendaNome: string;
  clienteNome: string;
  /** Qual linha do DRE abriu — escolhe a aba inicial. */
  qual: 'vpb' | 'efeito';
  patrimonio: PatrimonioPec | null;
  carregando: boolean;
  /** O período DA COLUNA clicada — ver `onAbrirDidatico` em `PecDrePanel`. */
  periodo: { de: string; ate: string };
  onFechar: () => void;
}) {
  const [aba, setAba] = useState<Aba>(qual === 'efeito' ? 'mercado' : 'producao');

  const p0 = patrimonio?.p0 ?? '';
  const p1 = patrimonio?.p1 ?? '';
  const cats = patrimonio?.categorias ?? [];

  const linhas = useMemo(() => montar(cats, aba), [cats, aba]);
  const tot = useMemo(() => totalDe(linhas), [linhas]);
  /* ⚠ O NÚMERO GRANDE SAI DO TOTAL DA ABA, não de uma conta à parte: é o mesmo Δ da última coluna,
     na unidade que a aba isola. */
  const totReal = useMemo(() => totalDe(montar(cats, 'resumo')), [cats]);

  const trav = travada(aba);
  const cel = (l: LinhaVM, chave: string): string => {
    switch (chave) {
      case 'categoria': return l.categoria;
      case 'pkIni': return n2(l.pkIni);
      case 'pkFim': return n2(l.pkFim);
      case 'atIni': return n2(l.atIni);
      case 'atFim': return n2(l.atFim);
      case 'vIni': return n2(l.vIni);
      case 'vFim': return n2(l.vFim);
      default: return comSinal(l.delta);
    }
  };

  /* ─── O TOPO DA ABA: o nome da linha do DRE, o número na unidade da aba e a frase ─── */
  const dAt = tot.atFim != null && tot.atIni != null ? tot.atFim - tot.atIni : null;
  const dPk = tot.pkFim != null && tot.pkIni != null ? tot.pkFim - tot.pkIni : null;
  const topo = aba === 'producao'
    ? { titulo: 'Variação por produção', numero: `${comSinal(dAt)} @`,
        frase: 'O que o rebanho ganhou ou perdeu em arrobas, com o preço congelado no início — é a produção, sem mercado.' }
    : aba === 'mercado'
      ? { titulo: 'Efeito de mercado', numero: `${comSinal(dPk)} R$/@`,
          frase: 'Quanto o preço da arroba mudou, com o rebanho congelado no fim — é o mercado, sem produção.' }
      : { titulo: 'Variação do estoque', numero: comSinal(totReal.delta),
          frase: 'O rebanho valia um tanto no início e vale outro no fim; a diferença é a soma das duas abas.' };

  /* ─── OS GRÁFICOS ───
     ⚠ A PONTE DE @ DA PRODUÇÃO NÃO É POSSÍVEL HOJE, e por isso ela não é desenhada pela metade:
     `fn_dre_pecuaria_patrimonio` devolve só as duas PONTAS (q/peso/preço no início e no fim). As
     parcelas do meio — compras, @ produzidas, desfrute e mortes, em arroba — não estão no payload.
     Desenhar quatro barras com três delas inventadas seria pior que duas barras honestas. O que
     falta está no relatório do PR. */
  const barras: BarraCompacta[] = aba === 'producao'
    ? [{ rotulo: rotuloMes(p0), valor: tot.atIni, texto: n2(tot.atIni, 0) },
       { rotulo: rotuloMes(p1), valor: tot.atFim, texto: n2(tot.atFim, 0) }]
    : aba === 'mercado'
      ? linhas.slice(0, 4).flatMap(l => ([
          { rotulo: l.categoria.slice(0, 6), valor: l.pkIni, texto: n2(l.pkIni, 0) },
          { rotulo: '', valor: l.pkFim, texto: n2(l.pkFim, 0), cor: 'bg-emerald-600' },
        ]))
      : [{ rotulo: 'início', valor: totReal.vIni, texto: n2(totReal.vIni, 0) },
         { rotulo: 'produção', valor: Math.abs(tot.delta), texto: comSinal(totalDe(montar(cats, 'producao')).delta, 0) },
         { rotulo: 'mercado', valor: Math.abs(totalDe(montar(cats, 'mercado')).delta), texto: comSinal(totalDe(montar(cats, 'mercado')).delta, 0) },
         { rotulo: 'fim', valor: totReal.vFim, texto: n2(totReal.vFim, 0) }];

  const nota = aba === 'producao'
    ? 'O R$/@ é igual nas duas colunas em cada categoria — ele está travado no início. A média do '
      + 'Total muda porque a MISTURA do rebanho mudou: mais jovens ou mais adultos deslocam a média '
      + 'ponderada sem que nenhum preço tenha mudado.'
    : aba === 'mercado'
      ? 'As arrobas são iguais nas duas colunas — elas estão travadas no fim. O que muda é só o '
        + 'preço, e por isso esta aba isola o mercado.'
      : 'Nada está travado aqui: as duas pontas são reais. O Δ desta aba é a soma do Δ da Produção '
        + 'com o Δ do Mercado, categoria a categoria.';

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        {/* ⚠ AS ABAS MORAM NO CABEÇALHO, à direita — mock v7. Elas são navegação do modal, não um
            controle do conteúdo: postas abaixo, competiam com o título da aba logo em seguida. */}
        <div className="flex items-start justify-between gap-3 px-4 py-2.5 text-white" style={{ backgroundColor: NAVY }}>
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold leading-tight">Variação do valor do rebanho</h2>
            <div className="mt-0.5 truncate text-[11px] text-white/80">
              {[clienteNome, fazendaNome, p0 && p1 ? `${rotuloMes(p0)} → ${rotuloMes(p1)}`
                : `${periodo.de} → ${periodo.ate}`].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {([['producao', 'Produção'], ['mercado', 'Mercado'], ['resumo', 'Resumo']] as const).map(([v, r]) => (
              <button key={v} type="button" onClick={() => setAba(v)}
                className={cn('rounded px-2 py-1 text-[11px] font-medium transition-colors',
                  aba === v ? 'bg-white text-[#0C447C]' : 'text-white/80 hover:bg-white/10')}>
                {r}
              </button>
            ))}
            <button type="button" onClick={onFechar} aria-label="Fechar"
              className="ml-1 text-white/80 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {carregando || !patrimonio ? (
          <div className="bg-muted/30 px-3 py-8 text-center text-[11px] text-muted-foreground">
            <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin align-[-2px]" /> Carregando…
          </div>
        ) : (
          <div className="space-y-2 bg-muted/30 p-3">
            {/* TOPO: texto à esquerda, gráfico à direita */}
            <div className="grid gap-3 md:grid-cols-[1fr_300px]">
              <div className="min-w-0 rounded-md border bg-card px-3 py-2">
                <div className="truncate text-[15px] font-medium">{topo.titulo}</div>
                <div className={cn('mt-1 truncate text-[24px] font-medium leading-none tabular-nums',
                  aba === 'resumo' ? corSinal(totReal.delta) : aba === 'producao' ? corSinal(dAt) : corSinal(dPk))}>
                  {topo.numero}
                </div>
                <div className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{topo.frase}</div>
              </div>
              <div className="min-w-0 rounded-md border bg-card p-2">
                <BarrasCompactas barras={barras} titulo="" larguraMax={284} altura={86}
                  larguraBarra={aba === 'mercado' ? 14 : 22} preencherLargura={aba !== 'mercado'} />
              </div>
            </div>

            {/* A TABELA — uma só, oito colunas, igual nas três abas */}
            <div className="max-h-[42vh] overflow-auto rounded-md border bg-card">
              <table className="border-collapse text-[11px] leading-none"
                style={{ tableLayout: 'fixed', width: LARGURA }}>
                <colgroup>{COLS.map(c => <col key={c.chave} style={{ width: c.largura }} />)}</colgroup>
                <thead>
                  <tr style={{ height: 24 }}>
                    {COLS.map(c => (
                      <th key={c.chave} title={c.rotulo}
                        className={cn('sticky top-0 z-10 truncate px-2 py-1 text-[10px] font-semibold text-white',
                          c.esq ? 'text-left' : 'text-right')}
                        /* ⚠ A COLUNA TRAVADA GANHA O NAVY do cabeçalho do modal: é o mesmo sinal
                           visual, e o operador liga a coluna cinza à ponta congelada. */
                        style={{ backgroundColor: trav === c.chave ? NAVY : CAB_ESCURO }}>
                        {c.rotulo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhas.length === 0 ? (
                    <tr style={{ height: 20 }}>
                      <td colSpan={COLS.length} className="px-2 text-center text-[10px] text-muted-foreground">—</td>
                    </tr>
                  ) : linhas.map(l => (
                    <tr key={l.categoria} className="bg-card" style={{ height: 20 }}>
                      {COLS.map(c => (
                        <td key={c.chave} title={cel(l, c.chave)}
                          className={cn(TD, c.esq ? 'text-left' : 'text-right',
                            trav === c.chave && 'bg-muted/60 text-muted-foreground',
                            c.chave === 'delta' && corSinal(l.delta))}>
                          {cel(l, c.chave)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {/* ⚠ O TOTAL É LINHA DA MESMA TABELA, não uma segunda tabela: duas tabelas com o
                      mesmo `colgroup` já desalinharam nesta casa quando uma ganhou barra de rolagem. */}
                  <tr style={{ height: 24, backgroundColor: CINZA_TOTAL, borderTop: '2px solid #9a988f' }}>
                    {COLS.map(c => (
                      <td key={c.chave}
                        className={cn(TD, 'font-medium', c.esq ? 'text-left' : 'text-right',
                          c.chave === 'delta' && corSinal(tot.delta))}>
                        {cel(tot, c.chave)}
                      </td>
                    ))}
                  </tr>
                  {/* A LINHA "VARIAÇÃO": valor E percentual, sob cada par. */}
                  <tr style={{ height: 22, backgroundColor: CINZA_TOTAL }}>
                    <td className={cn(TD, 'text-left font-medium')}>Variação</td>
                    <td className={cn(TD, 'text-right', corSinal(dPk))}>{comSinal(dPk)}</td>
                    <td className={cn(TD, 'text-right', corSinal(dPk))}>{pct(dPk, tot.pkIni)}</td>
                    <td className={cn(TD, 'text-right', corSinal(dAt))}>{comSinal(dAt)}</td>
                    <td className={cn(TD, 'text-right', corSinal(dAt))}>{pct(dAt, tot.atIni)}</td>
                    <td className={cn(TD, 'text-right', corSinal(tot.delta))}>{comSinal(tot.delta)}</td>
                    <td className={cn(TD, 'text-right', corSinal(tot.delta))}>{pct(tot.delta, tot.vIni)}</td>
                    <td className={TD} />
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="px-0.5 text-[11px] leading-snug text-muted-foreground">{nota}</div>
          </div>
        )}

        <div className="px-4 py-1.5 text-[10px] text-white/80" style={{ backgroundColor: NAVY }}>
          Valores estimados · preços do valor do rebanho de cada mês · arrobas do fechamento de pastos
        </div>
      </DialogContent>
    </Dialog>
  );
}
