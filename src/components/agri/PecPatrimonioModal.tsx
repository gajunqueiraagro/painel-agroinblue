/**
 * O MODAL DAS DUAS VARIAÇÕES DO REBANHO — VARIACAO-REBANHO-MODAL-01 (mock v7).
 *
 * ⚠ ELE EXISTE PARA SEPARAR DUAS COISAS QUE SOMAM IGUAL E QUEREM DIZER O OPOSTO. "Variação por
 * produção" é o rebanho que mudou com o PREÇO TRAVADO no início; "Efeito de mercado" é o preço que
 * mudou com o REBANHO travado no fim. Fundi-las numa "variação de patrimônio" esconderia qual das
 * duas respondeu pelo resultado — que é exatamente a pergunta que o produtor faz quando o número
 * sobe sem ele ter vendido nada.
 * ⚠ O VALOR DO MEIO É A CHAVE. São três valores para duas datas: `v0` (início a preço do início),
 * `v1_p0` (fim a preço do INÍCIO) e `v1_p1` (fim a preço do fim). VPB = `v1_p0 − v0`; Efeito =
 * `v1_p1 − v1_p0`. Sem o valor do meio as duas variações seriam indistinguíveis.
 *
 * ⚠ UMA ABA, UMA PERGUNTA (Constituição 2, Art. 19). "Produção" responde o que a produção fez, a
 * preço travado; "Mercado" responde o que o preço fez, a rebanho travado; "Resumo" fecha a conta.
 * Cada indicador vem com os companheiros que permitem refazê-lo — cabeças, peso e R$/kg ao lado do
 * valor —, e o cabeçalho diz de ONDE cada ponta veio. O modal não decide nada.
 *
 * ⚠ NÃO HÁ ABA "LANÇAMENTOS", e isso é dado, não omissão: patrimônio não tem lançamento. Ele sai
 * do fechamento do rebanho — a foto do mês. Oferecer a aba e mostrá-la vazia faria parecer que
 * falta cadastro.
 */
import { useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X, Loader2, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import { Segmentado } from '@/components/ui/segmentado';
import { corDoSinal } from '@/components/agri/dreGrade';
import type { PatrimonioPec, CategoriaPatrimonio } from '@/hooks/useDrePecuaria';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-07" → "jul/26" — o mesmo idioma do seletor de período. */
const rotuloMes = (am: string) => {
  const [a, m] = (am || '').split('-');
  const i = Number(m) - 1;
  return i >= 0 && i < 12 ? `${MESES[i]}/${a.slice(2)}` : (am || '—');
};

/** Mês por extenso, para a frase didática do Resumo. */
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesLongo = (am: string) => {
  const [a, m] = (am || '').split('-');
  const i = Number(m) - 1;
  return i >= 0 && i < 12 ? `${MESES_LONGOS[i]} de ${a}` : (am || '—');
};

/** ⚠ AUSÊNCIA É TRAÇO, ZERO É NÚMERO — a sentinela do projeto, aqui como em toda tela. */
const num = (v: number | null | undefined, casas = 2) => (v == null ? '—' : formatNum(v, casas));

/**
 * A FONTE DE CADA PONTA, EM UMA FRASE — VPB-REGRA-UNICA-01.
 *
 * ⚠ ELA EXPLICA UM NÚMERO, não justifica uma ausência: a tabela está lá nos três casos, e é nela
 * que se vê o rebanho partindo de zero ou indo a zero, categoria a categoria.
 */
const FRASE_FONTE: Record<'cadastro' | 'zero', (mes: string) => string> = {
  cadastro: m => `Sem fechamento em ${m}: a ponta é o rebanho cadastrado no primeiro mês, `
    + 'valorado ao preço do primeiro fechamento.',
  zero: m => `Sem gado em ${m}: a ponta vale zero.`,
};

type Aba = 'producao' | 'mercado' | 'resumo';

/**
 * AS COLUNAS DE CADA ABA, declaradas — e a diferença entre elas é DADO.
 *
 * ⚠ LARGURA FIXA E `table-layout: fixed` (A21): a coluna não pode mudar de tamanho conforme o
 * número que cai nela, senão a mesma tabela se lê diferente em dois períodos.
 * ⚠ `alinha` É SEMPRE À DIREITA NOS NÚMEROS, e o rótulo do cabeçalho acompanha: número à direita
 * com cabeçalho à esquerda faz o olho procurar a correspondência a cada coluna.
 */
interface Col {
  chave: string;
  rotulo: string;
  /** O rótulo por extenso, quando o da tela precisou encurtar. */
  title?: string;
  largura: number;
  valor: (c: CategoriaPatrimonio) => number | null;
  casas?: number;
  /** A célula ganha a cor do sinal — só as linhas de variação. */
  porSinal?: boolean;
}

const COL_CATEGORIA = 176;

/** ⚠ A PRODUÇÃO SE LÊ A PREÇO TRAVADO: o `pk0` aparece uma vez só, e as duas pontas de valor o usam. */
const COLS_PRODUCAO: readonly Col[] = [
  { chave: 'q0', rotulo: 'Cab. iní.', title: 'Cabeças no início do período', largura: 74, valor: c => c.q0, casas: 0 },
  { chave: 'q1', rotulo: 'Cab. fim', title: 'Cabeças no fim do período', largura: 74, valor: c => c.q1, casas: 0 },
  { chave: 'dq', rotulo: 'Δ cab.', title: 'Cabeças no fim menos cabeças no início', largura: 70, valor: c => c.q1 - c.q0, casas: 0, porSinal: true },
  { chave: 'pm0', rotulo: 'Peso iní.', title: 'Peso médio no início (kg)', largura: 80, valor: c => c.pm0 },
  { chave: 'pm1', rotulo: 'Peso fim', title: 'Peso médio no fim (kg)', largura: 80, valor: c => c.pm1 },
  { chave: 'pk0', rotulo: 'R$/kg iní.', title: 'Preço por quilo do início — travado nesta aba', largura: 84, valor: c => c.pk0, casas: 4 },
  { chave: 'v0', rotulo: 'Valor iní.', title: 'Cabeças × peso × preço, no início', largura: 118, valor: c => c.v0 },
  { chave: 'v1_p0', rotulo: 'Valor fim (R$/kg iní.)', title: 'Rebanho do FIM valorado ao preço do INÍCIO', largura: 118, valor: c => c.v1_p0 },
  { chave: 'vpb', rotulo: 'Variação', title: 'Valor fim a preço do início menos valor inicial', largura: 118, valor: c => c.vpb, porSinal: true },
];

/** ⚠ O MERCADO SE LÊ A REBANHO TRAVADO: as cabeças e o peso são os do FIM nas duas colunas de valor. */
const COLS_MERCADO: readonly Col[] = [
  { chave: 'q1', rotulo: 'Cab. fim', title: 'Cabeças no fim — travadas nesta aba', largura: 78, valor: c => c.q1, casas: 0 },
  { chave: 'pm1', rotulo: 'Peso fim', title: 'Peso médio no fim (kg)', largura: 84, valor: c => c.pm1 },
  { chave: 'pk0', rotulo: 'R$/kg iní.', title: 'Preço por quilo no início do período', largura: 90, valor: c => c.pk0, casas: 4 },
  { chave: 'pk1', rotulo: 'R$/kg fim', title: 'Preço por quilo no fim do período', largura: 90, valor: c => c.pk1, casas: 4 },
  { chave: 'v1_p0', rotulo: 'Valor fim (R$/kg iní.)', title: 'Rebanho do fim ao preço do início', largura: 128, valor: c => c.v1_p0 },
  { chave: 'v1_p1', rotulo: 'Valor fim (R$/kg fim)', title: 'Rebanho do fim ao preço do fim', largura: 128, valor: c => c.v1_p1 },
  { chave: 'efeito', rotulo: 'Efeito de mercado', title: 'Valor fim a preço do fim menos valor fim a preço do início', largura: 128, valor: c => c.efeito, porSinal: true },
];

const TH = 'sticky top-0 z-10 truncate bg-muted px-1.5 py-1 text-[10px] font-semibold text-muted-foreground';
const TD = 'truncate px-1.5 py-0.5 text-[11px] tabular-nums';

/** Um dos quatro números grandes do Resumo — régua A18: rótulo 10px muted, número 20px/500. */
function NumeroTopo({ rotulo, valor, cor, title }: {
  rotulo: string; valor: string; cor?: string; title?: string;
}) {
  return (
    <div className="min-w-0 rounded-md border bg-card px-3 py-2" title={title}>
      <div className="truncate text-[10px] font-normal leading-none text-muted-foreground">{rotulo}</div>
      <div className={cn('mt-1 truncate text-[20px] font-medium leading-none tabular-nums', cor)}>{valor}</div>
    </div>
  );
}

export function PecPatrimonioModal({
  aberto, fazendaNome, qual, patrimonio, carregando, periodo, onFechar,
}: {
  aberto: boolean;
  /** A coluna clicada. "Total" quando é a coluna de todas. */
  fazendaNome: string;
  /** Qual das duas linhas abriu — escolhe a aba inicial, não o conteúdo. */
  qual: 'vpb' | 'efeito';
  patrimonio: PatrimonioPec | null;
  carregando: boolean;
  /** O período DA COLUNA clicada — ver `onAbrirDidatico` em `PecDrePanel`. */
  periodo: { de: string; ate: string };
  onFechar: () => void;
}) {
  /* ⚠ A ABA INICIAL É A LINHA QUE ABRIU: quem clicou em "Efeito de mercado" quer a aba do mercado.
     Abrir sempre na primeira obrigaria um clique a mais para chegar onde já se pediu. */
  const [aba, setAba] = useState<Aba>(qual === 'efeito' ? 'mercado' : 'producao');
  /* ⚠ ORDENAÇÃO POR CABEÇALHO, com o espaço da seta RESERVADO (A21): sem a reserva, clicar num
     cabeçalho empurra os vizinhos e a tabela inteira se mexe. */
  const [ordem, setOrdem] = useState<{ chave: string; desc: boolean }>({ chave: 'v0', desc: true });

  const p0 = patrimonio?.p0 ?? '';
  const p1 = patrimonio?.p1 ?? '';
  const t = patrimonio?.total;
  const cols = aba === 'mercado' ? COLS_MERCADO : COLS_PRODUCAO;

  const linhas = useMemo(() => {
    const base = patrimonio?.categorias ?? [];
    const col = cols.find(c => c.chave === ordem.chave);
    if (!col) return base;
    /* ⚠ AUSENTE VAI PARA O FIM nos dois sentidos: ordenar tratando `null` como zero misturaria
       "não sei" com "nenhum" bem no meio da lista. */
    return [...base].sort((a, b) => {
      const va = col.valor(a); const vb = col.valor(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return ordem.desc ? vb - va : va - vb;
    });
  }, [patrimonio, cols, ordem]);

  const larguraTabela = COL_CATEGORIA + cols.reduce((a, c) => a + c.largura, 0);

  /** O total da aba, direto do payload — nunca uma soma da tela. */
  const totalDe = (chave: string): number | null => {
    if (!t) return null;
    switch (chave) {
      case 'q0': return t.q0;
      case 'q1': return t.q1;
      case 'dq': return t.q1 - t.q0;
      case 'v0': return t.v0;
      case 'v1_p0': return t.v1_p0;
      case 'v1_p1': return t.v1_p1;
      case 'vpb': return t.vpb;
      case 'efeito': return t.efeito;
      /* ⚠ PESO E PREÇO NÃO TÊM TOTAL, e somá-los seria pior que deixar em branco: a média de
         médias não é a média, e a coluna Total afirmaria um peso que nenhum animal tem. */
      default: return null;
    }
  };

  const fonteP0 = patrimonio?.p0_fonte ?? null;
  const fonteP1 = patrimonio?.p1_fonte ?? null;
  const selo = (f: string | null, mes: string) =>
    (f === 'cadastro' || f === 'zero' ? FRASE_FONTE[f](rotuloMes(mes)) : null);
  const frasesFonte = [selo(fonteP0, p0), selo(fonteP1, p1)].filter(Boolean) as string[];

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      {/* ⚠ A MESMA LARGURA DO DRILL DA LAVOURA (`max-w-5xl`): duas tabelas do mesmo DRE não podem
          abrir em caixas de tamanhos diferentes. */}
      <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        <div className="flex items-start justify-between gap-2 bg-primary px-4 py-2.5 text-primary-foreground">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold leading-tight">Variação do estoque</h2>
            <div className="mt-0.5 truncate text-[11px] text-primary-foreground/80">
              {[fazendaNome, p0 && p1 ? `${rotuloMes(p0)} → ${rotuloMes(p1)}`
                : `${periodo.de} → ${periodo.ate}`].filter(Boolean).join(' · ')}
            </div>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar"
            className="shrink-0 text-primary-foreground/80 hover:text-primary-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2 bg-muted/30 p-3">
          {/* ⚠ SEGMENTADO, NÃO `TabsList` — regra permanente do CLAUDE.md para qualquer aba nova. */}
          <Segmentado valor={aba} onEscolher={v => setAba(v as Aba)}
            opcoes={[
              { valor: 'producao', rotulo: 'Produção' },
              { valor: 'mercado', rotulo: 'Mercado' },
              { valor: 'resumo', rotulo: 'Resumo' },
            ]} />

          {frasesFonte.map(f => (
            <div key={f} className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-[10px] text-muted-foreground">
              {f}
            </div>
          ))}

          {carregando || !patrimonio || !t ? (
            <div className="rounded-md border bg-card px-3 py-6 text-center text-[11px] text-muted-foreground">
              <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin align-[-2px]" /> Carregando…
            </div>
          ) : aba === 'resumo' ? (
            <div className="space-y-2">
              {/* ⚠ QUATRO NÚMEROS E A CONTA INTEIRA: inicial + produção + mercado = final. Pôr só as
                  duas variações deixaria o operador somando de cabeça para achar o que o rebanho
                  vale hoje, que é a pergunta com que ele chegou. */}
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <NumeroTopo rotulo={`Valor inicial · ${rotuloMes(p0)}`} valor={num(t.v0)}
                  title="Rebanho do início, ao preço do início" />
                <NumeroTopo rotulo="Variação por produção" valor={num(t.vpb)} cor={corDoSinal(t.vpb)}
                  title="O que a produção fez, com o preço travado no início" />
                <NumeroTopo rotulo="Efeito de mercado" valor={num(t.efeito)} cor={corDoSinal(t.efeito)}
                  title="O que o preço fez, com o rebanho travado no fim" />
                <NumeroTopo rotulo={`Valor final · ${rotuloMes(p1)}`} valor={num(t.v1_p1)}
                  title="Rebanho do fim, ao preço do fim" />
              </div>
              {/* ⚠ A FRASE É A MESMA CONTA EM PORTUGUÊS, e ela existe para quem não lê tabela: o
                  verbo do mercado muda com o sinal, porque "o mercado somou −120 mil" obriga o
                  leitor a traduzir o sinal antes de entender. */}
              <div className="rounded-md border bg-card px-3 py-2.5 text-[11px] leading-relaxed">
                O rebanho valia <strong className="font-medium tabular-nums">R$ {num(t.v0)}</strong> em {mesLongo(p0)};
                a produção {t.vpb < 0 ? 'reduziu' : 'acrescentou'} <strong className="font-medium tabular-nums">R$ {num(Math.abs(t.vpb))}</strong>;
                o mercado {t.efeito < 0 ? 'tirou' : 'somou'} <strong className="font-medium tabular-nums">R$ {num(Math.abs(t.efeito))}</strong>;
                vale <strong className="font-medium tabular-nums">R$ {num(t.v1_p1)}</strong> em {mesLongo(p1)}.
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              {/* ⚠ UM SCROLLPORT SÓ, e o cabeçalho gruda nele (A21): `max-h` dentro de uma área que
                  já rola criaria duas barras, e rolar a de dentro não moveria o cabeçalho. */}
              <div className="max-h-[52vh] overflow-auto rounded-md border bg-card">
                <table className="border-collapse text-[11px] leading-none"
                  style={{ tableLayout: 'fixed', width: larguraTabela }}>
                  <colgroup>
                    <col style={{ width: COL_CATEGORIA }} />
                    {cols.map(c => <col key={c.chave} style={{ width: c.largura }} />)}
                  </colgroup>
                  <thead>
                    <tr style={{ height: 22 }}>
                      <th className={cn(TH, 'sticky left-0 z-20 text-left')}>Categoria</th>
                      {cols.map(c => (
                        <th key={c.chave} className={cn(TH, 'cursor-pointer select-none text-right hover:text-foreground')}
                          title={c.title ?? c.rotulo}
                          onClick={() => setOrdem(o => ({ chave: c.chave, desc: o.chave === c.chave ? !o.desc : true }))}>
                          <span className="inline-flex w-full items-center justify-end gap-0.5">
                            <span className="truncate">{c.rotulo}</span>
                            {/* ⚠ O ESPAÇO DA SETA É RESERVADO: sem isto, ordenar empurra o rótulo e
                                a largura da coluna parece mudar a cada clique. */}
                            <span className="inline-block w-3 shrink-0">
                              {ordem.chave === c.chave
                                ? (ordem.desc ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)
                                : null}
                            </span>
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.length === 0 ? (
                      <tr style={{ height: 20 }}>
                        <td colSpan={cols.length + 1} className="px-1.5 text-center text-[10px] text-muted-foreground">
                          —
                        </td>
                      </tr>
                    ) : linhas.map(c => (
                      <tr key={c.categoria} className="bg-card" style={{ height: 20 }}>
                        <td className={cn(TD, 'sticky left-0 z-10 bg-card text-left')} title={c.categoria}>
                          {c.categoria}
                        </td>
                        {cols.map(col => {
                          const v = col.valor(c);
                          return (
                            <td key={col.chave} className={cn(TD, 'text-right', col.porSinal && corDoSinal(v))}
                              style={{ borderLeft: '1px solid hsl(var(--border))' }}>
                              {num(v, col.casas)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ⚠ O TOTAL É O DO PAYLOAD, não a soma das linhas da tela: somar aqui criaria a
                  segunda dona do mesmo número, e as duas divergiriam no primeiro arredondamento. */}
              <div className="overflow-hidden rounded-md border bg-muted/40">
                <table className="border-collapse text-[11px] leading-none"
                  style={{ tableLayout: 'fixed', width: larguraTabela }}>
                  <colgroup>
                    <col style={{ width: COL_CATEGORIA }} />
                    {cols.map(c => <col key={c.chave} style={{ width: c.largura }} />)}
                  </colgroup>
                  <tbody>
                    <tr style={{ height: 22 }}>
                      <td className="truncate px-1.5 text-left text-[11px] font-medium">Total</td>
                      {cols.map(col => {
                        const v = totalDe(col.chave);
                        return (
                          <td key={col.chave}
                            className={cn(TD, 'text-right font-medium', col.porSinal && corDoSinal(v))}
                            style={{ borderLeft: '1px solid hsl(var(--border))' }}>
                            {num(v, col.casas)}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* ⚠ A NOTA DIZ O QUE ESTÁ TRAVADO E POR QUÊ — é ela que impede a leitura errada de
                  cada aba. Sem ela, "Valor fim (R$/kg iní.)" parece um erro de digitação. */}
              <div className="px-0.5 text-[9px] leading-relaxed text-muted-foreground">
                {aba === 'producao'
                  ? `Preço travado em ${rotuloMes(p0)}: as duas colunas de valor usam o R$/kg do início. `
                    + 'O que muda entre elas é só o rebanho — por isso a Variação é o que a produção fez, sem mercado.'
                  : `Rebanho travado em ${rotuloMes(p1)}: as duas colunas de valor usam as mesmas cabeças e o mesmo peso. `
                    + 'O que muda entre elas é só o preço — por isso o Efeito é o que o mercado fez, sem produção.'}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
