/**
 * AbaNegociacaoAbate — o detalhe do abate, POR LOTE.
 *
 * ⚠ NADA AQUI CALCULA. Todo número exibido sai de `buildAbateCalculation`
 * (`lib/calculos/abate.ts`), que é a fonte soberana e a mesma que alimenta o diálogo
 * legado e o PC-100. Recalcular — nem que fosse "só a arroba" — criaria a segunda conta
 * para a mesma pergunta, e o dia em que discordassem ninguém saberia qual manda.
 *
 * ⚠ SÓ UM LADO DE CADA PAR É GRAVADO. Bônus e descontos têm duas entradas (R$/@ e R$
 * total); o operador preenche UMA, e é ela que sobe com a `fonte`. O outro lado aparece
 * ao lado, em cinza, DERIVADO — nunca digitável e nunca persistido. Gravar os dois faria
 * duas verdades para o mesmo número.
 *
 * ⚠ A UNIDADE VEM DA ARITMÉTICA DA LIB, NUNCA DO NOME DO CAMPO. Esta regra custou uma
 * migration: `bonusPrecoce` parece percentual pelo nome e é `bonusPrecoce * totalArrobas`
 * — R$ por arroba. Só o Funrural é percentual (`valorBase * pct / 100`). Os rótulos aqui
 * dizem a unidade real, não o nome do campo.
 *
 * ⚠ FLUXO VERTICAL, SEM SPLIT DE DUAS COLUNAS DENTRO DA ABA — lição do revert b846fa8.
 * A cascata (Base → +Bônus → −Descontos → Bruto → −Funrural → Líquido) só se lê de cima
 * para baixo; quebrada em duas colunas, o operador perde a ordem das operações.
 */
import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CampoMoeda } from '@/components/ui/campo-moeda';
import { AlertTriangle } from 'lucide-react';
import { formatMoeda } from '@/lib/calculos/formatters';
import { buildAbateCalculation, type AbateCalculation } from '@/lib/calculos/abate';
import { subcentroAbatePorCategoria } from '@/hooks/useOperacaoLiquidacao';
import type { LinhaAbate, CenarioAbate } from '@/hooks/useOperacaoAbate';

/** O lote como a negociação o conhece — só o que o cálculo precisa. */
export interface LoteAbate {
  id: string;
  ordem: number;
  categoria: string | null;
  categoriaLabel: string;
  quantidade: number;
  pesoMedioKg: number;
}

interface Props {
  lotes: LoteAbate[];
  /**
   * As linhas do cenário — o que está no banco MESCLADO com o que o operador digitou e
   * ainda não salvou.
   *
   * ⚠ RECEBE JÁ MESCLADO, e não o `abateApi` cru: a edição em memória vive no pai (mesmo
   * desenho do `boitelDaVenda`), e uma aba que lesse o hook direto mostraria o banco por
   * cima do que a pessoa acabou de digitar.
   */
  linhas: Map<string, LinhaAbate>;
  /** Quais cenários já existem — é o que diz se há comparativo a mostrar. */
  cenariosExistentes: CenarioAbate[];
  cenario: CenarioAbate;
  onCenarioChange?: (c: CenarioAbate) => void;
  /** Edição em memória; quem persiste é o rodapé do shell. */
  onLinhaChange: (loteId: string, proxima: LinhaAbate) => void;
  somenteLeitura?: boolean;
}

/* ── Altura única dos campos — A16. Um formulário com alturas diferentes se lê como
      dois formulários, e o olho procura a divisão que não existe. ── */
const H = 'h-8 text-xs';
const LBL = 'text-[10px] text-muted-foreground';

const vazia = (loteId: string): LinhaAbate => ({
  operacaoLoteId: loteId,
  pesoCarcacaKg: null, rendimentoCarcacaPct: null, pesoTotalKgNf: null,
  precoArroba: null, valorBaseOverride: null, valorLiquido: null,
  bonusPrecoce: { valor: null, fonte: null },
  bonusQualidade: { valor: null, fonte: null },
  bonusListaTrace: { valor: null, fonte: null },
  descontoQualidade: { valor: null, fonte: null },
  outrosDescontos: { valor: null, fonte: null },
  funrural: { valor: null, fonte: null },
});

/**
 * Traduz a linha gravada para a entrada da lib.
 *
 * ⚠ A FONTE DECIDE EM QUAL CAMPO O VALOR ENTRA, e é só isso que ela faz. `'arroba'`
 * alimenta o campo por-arroba da lib; `'reais'`, o campo de total. Mandar o mesmo número
 * nos dois faria a lib somar duas vezes — ela usa o primeiro que for maior que zero.
 */
function paraCalculo(l: LinhaAbate, lote: LoteAbate) {
  const porFonte = (v: { valor: number | null; fonte: string | null }, unidade: string) =>
    v.valor != null && v.fonte === unidade ? v.valor : null;
  return {
    quantidade: lote.quantidade,
    pesoKg: lote.pesoMedioKg,
    pesoCarcacaKg: l.pesoCarcacaKg,
    rendCarcaca: l.rendimentoCarcacaPct,
    precoArroba: l.precoArroba,
    valorBaseOverride: l.valorBaseOverride ?? undefined,
    bonusPrecoce: porFonte(l.bonusPrecoce, 'arroba'),
    bonusPrecoceReais: porFonte(l.bonusPrecoce, 'reais'),
    bonusQualidade: porFonte(l.bonusQualidade, 'arroba'),
    bonusQualidadeReais: porFonte(l.bonusQualidade, 'reais'),
    bonusListaTrace: porFonte(l.bonusListaTrace, 'arroba'),
    bonusListaTraceReais: porFonte(l.bonusListaTrace, 'reais'),
    descontoQualidade: porFonte(l.descontoQualidade, 'arroba'),
    descontoQualidadeReais: porFonte(l.descontoQualidade, 'reais'),
    outrosDescontos: porFonte(l.outrosDescontos, 'reais'),
    outrosDescontosArroba: porFonte(l.outrosDescontos, 'arroba'),
    funruralPct: porFonte(l.funrural, 'pct'),
    funruralReais: porFonte(l.funrural, 'reais'),
  };
}

/** Peso sempre com duas casas — A15. */
const kg2 = (n: number | null | undefined) =>
  n == null ? '—' : `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;

/**
 * O par bidirecional: uma entrada por unidade, e só a preenchida é gravada.
 *
 * ⚠ O LADO NÃO PREENCHIDO MOSTRA O DERIVADO EM CINZA, e não um campo vazio. Campo vazio
 * ao lado de um preenchido convida a preencher os dois — e aí não há mais fonte única.
 */
function ParDeUnidade({
  rotulo, unidadeA, unidadeB, rotuloA, rotuloB, valor, derivadoA, derivadoB, onChange, somenteLeitura,
}: {
  rotulo: string;
  unidadeA: string; unidadeB: string;
  rotuloA: string; rotuloB: string;
  valor: { valor: number | null; fonte: string | null };
  derivadoA: number; derivadoB: number;
  onChange: (v: { valor: number | null; fonte: string | null }) => void;
  somenteLeitura?: boolean;
}) {
  const ehA = valor.fonte === unidadeA;
  const ehB = valor.fonte === unidadeB;
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
      <Label className={LBL}>{rotulo}</Label>
      <div className="w-[120px]">
        <Label className={LBL}>{rotuloA}</Label>
        {ehB ? (
          <div className={`${H} flex items-center justify-end rounded-md border border-dashed px-2 text-muted-foreground tabular-nums`}
               title="Derivado do outro lado — não é digitável nem gravado.">
            {formatMoeda(derivadoA)}
          </div>
        ) : (
          <CampoMoeda
            valor={ehA ? valor.valor : null}
            onChange={(n) => onChange(n == null ? { valor: null, fonte: null } : { valor: n, fonte: unidadeA })}
            className={`${H} text-right`}
            disabled={somenteLeitura}
          />
        )}
      </div>
      <div className="w-[130px]">
        <Label className={LBL}>{rotuloB}</Label>
        {ehA ? (
          <div className={`${H} flex items-center justify-end rounded-md border border-dashed px-2 text-muted-foreground tabular-nums`}
               title="Derivado do outro lado — não é digitável nem gravado.">
            {formatMoeda(derivadoB)}
          </div>
        ) : (
          <CampoMoeda
            valor={ehB ? valor.valor : null}
            onChange={(n) => onChange(n == null ? { valor: null, fonte: null } : { valor: n, fonte: unidadeB })}
            className={`${H} text-right`}
            disabled={somenteLeitura}
          />
        )}
      </div>
    </div>
  );
}

/** Uma linha da cascata. `forte` marca os três marcos: Base, Bruto e Líquido. */
function LinhaCascata({ rotulo, valor, sinal, forte }: {
  rotulo: string; valor: number; sinal?: '+' | '−'; forte?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between ${forte ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
      <span className="text-[11px]">{sinal ? `(${sinal}) ` : ''}{rotulo}</span>
      <span className="text-[12px] tabular-nums">{sinal === '−' ? '− ' : ''}{formatMoeda(valor)}</span>
    </div>
  );
}

export function AbaNegociacaoAbate({
  lotes, linhas, cenariosExistentes, cenario, onCenarioChange, onLinhaChange, somenteLeitura,
}: Props) {
  /* ⚠ UM `buildAbateCalculation` POR LOTE, e o total é a SOMA dos lotes — nunca um
     cálculo sobre o agregado. Um abate de machos e fêmeas tem carcaças e preços
     diferentes; calcular sobre a média das duas daria um número que não existe. */
  const calculos = useMemo(() => {
    const m = new Map<string, AbateCalculation>();
    lotes.forEach(lote => {
      const linha = linhas.get(lote.id) ?? vazia(lote.id);
      m.set(lote.id, buildAbateCalculation(paraCalculo(linha, lote)));
    });
    return m;
  }, [lotes, linhas]);

  const total = useMemo(() => {
    const soma = (f: (c: AbateCalculation) => number) =>
      lotes.reduce((s, l) => s + (calculos.get(l.id) ? f(calculos.get(l.id)!) : 0), 0);
    return {
      valorBase: soma(c => c.valorBase),
      totalBonus: soma(c => c.totalBonus),
      totalDescontos: soma(c => c.totalDescontos),
      valorBruto: soma(c => c.valorBruto),
      funruralTotal: soma(c => c.funruralTotal),
      valorLiquido: soma(c => c.valorLiquido),
      totalArrobas: soma(c => c.totalArrobas),
    };
  }, [lotes, calculos]);

  /* ⚠ CATEGORIA FORA DO MAPA RECUSA, e diz qual. Um subcentro vazio geraria lançamento
     sem classificação — o defeito que a Mesa de Revisão existe para consertar depois. */
  const semSubcentro = lotes.filter(l => !subcentroAbatePorCategoria(l.categoria ?? ''));

  if (lotes.length === 0) {
    return (
      <div className="rounded-md border bg-card p-4 text-center text-[12px] text-muted-foreground">
        Nenhum lote na negociação. Adicione os lotes abatidos para informar carcaça, preço e descontos.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {onCenarioChange && (
        <div className="flex items-center gap-2">
          <span className={LBL}>Cenário</span>
          {(['projetado', 'realizado'] as const).map(c => (
            <button
              key={c} type="button" onClick={() => onCenarioChange(c)}
              className={`h-6 rounded-md border px-2 text-[10px] ${
                cenario === c ? 'border-primary bg-primary/10 text-foreground' : 'bg-card text-muted-foreground'}`}
            >
              {c === 'projetado' ? 'Projetado' : 'Realizado'}
            </button>
          ))}
          {cenariosExistentes.length === 2 && (
            <span className="text-[10px] text-muted-foreground">os dois existem — dá para comparar</span>
          )}
        </div>
      )}

      {semSubcentro.length > 0 && (
        <div className="flex items-start gap-1.5 rounded border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-[10px] leading-snug text-destructive">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            {semSubcentro.length === 1 ? 'O lote' : 'Os lotes'}{' '}
            {semSubcentro.map(l => `${l.ordem}. ${l.categoriaLabel || 'sem categoria'}`).join(', ')}{' '}
            {semSubcentro.length === 1 ? 'não tem' : 'não têm'} categoria que o plano saiba classificar como
            macho ou fêmea. Corrija a categoria do lote — sem ela o financeiro não sabe em qual receita lançar.
          </span>
        </div>
      )}

      {lotes.map(lote => {
        const linha = linhas.get(lote.id) ?? vazia(lote.id);
        const c = calculos.get(lote.id)!;
        /* ⚠ O LÍQUIDO VIAJA JUNTO DE TODA MUDANÇA, e é sempre a lib quem o escreve. Ele é
           o único derivado que se persiste — o banco precisa dele para somar em
           `valor_acordado`, e a RPC não pode recalculá-lo sem reimplementar a lib em SQL.
           Recalcular aqui a cada `trocar` é barato e garante que o gravado nunca fica
           atrás do que a cascata mostra: um líquido velho no banco daria um cabeçalho
           certo no lote e errado na Central — o defeito que `oc_revalorar_lote` já tem. */
        const trocar = (patch: Partial<LinhaAbate>) => {
          const proxima = { ...linha, ...patch };
          const calc = buildAbateCalculation(paraCalculo(proxima, lote));
          onLinhaChange(lote.id, {
            ...proxima,
            /* ⚠ O RENDIMENTO E' DERIVADO E MESMO ASSIM PERSISTIDO — a mesma regra do
               `valorLiquido`, e pelo mesmo motivo: a RPC soma o rendimento ponderado no
               cabecalho da operacao e nao pode recalcula-lo sem reimplementar a lib em
               SQL. A conta e' `peso de carcaca / peso vivo`, e a lib ja a fazia (abate.ts
               linha 117): quando havia carcaca, o rendimento DIGITADO era ignorado no
               calculo e gravado assim mesmo — o banco guardava um numero que a tela nao
               usava. Agora so' existe um rendimento, o da lib.
               ⚠ `0` VIRA `null`, nao zero. Sem carcaca nao ha rendimento nenhum, e gravar
               zero satisfaria a guarda da RPC ("preco e carcaca OU rendimento") com um
               dado que ninguem informou. */
            rendimentoCarcacaPct: calc.rendCalc > 0 ? calc.rendCalc : null,
            valorLiquido: calc.valorLiquido,
          });
        };
        const subcentro = subcentroAbatePorCategoria(lote.categoria ?? '');

        return (
          <div key={lote.id} className="rounded-lg border bg-card p-3 space-y-2.5">
            <div className="flex items-baseline justify-between">
              <div className="text-[13px] font-medium text-foreground">
                {lote.ordem}. {lote.categoriaLabel}
                <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                  {lote.quantidade} cab · {kg2(lote.pesoMedioKg)}/cab
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground">{subcentro ?? '—'}</span>
            </div>

            {/* ── Carcaça e preço ── */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className={LBL}>Carcaça por cabeça</Label>
                <Input
                  type="number" step="0.01" inputMode="decimal" className={`${H} text-right`}
                  disabled={somenteLeitura}
                  value={linha.pesoCarcacaKg ?? ''}
                  onChange={e => trocar({ pesoCarcacaKg: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </div>
              <div>
                <Label className={LBL}>Rendimento (%)</Label>
                {/* Travado no mesmo desenho dos derivados do par valor+fonte: borda
                    tracejada e texto apagado dizem, sem legenda, que aqui nao se digita. */}
                <div className={`${H} flex items-center justify-end rounded-md border border-dashed px-2 text-muted-foreground tabular-nums`}
                     title="Derivado da carcaça sobre o peso vivo — não é digitável.">
                  {c.rendCalc > 0 ? `${c.rendCalc.toFixed(2)}%` : '—'}
                </div>
              </div>
              <div>
                <Label className={LBL}>Preço da @</Label>
                <CampoMoeda
                  valor={linha.precoArroba} className={`${H} text-right`} disabled={somenteLeitura}
                  onChange={n => trocar({ precoArroba: n })}
                />
              </div>
            </div>

            {/* ⚠ O RENDIMENTO SAIU DAQUI porque virou campo — mostrar o mesmo numero duas
                vezes na mesma altura da tela e' ruido, e o campo travado ja' o exibe. O que
                fica sao as tres grandezas que ninguem digita em lugar nenhum. */}
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-muted-foreground">
              <span>carcaça calculada: <b className="tabular-nums text-foreground">{kg2(c.carcacaCalc)}</b></span>
              <span>@ por cabeça: <b className="tabular-nums text-foreground">{c.pesoArrobaCab.toFixed(2)}</b></span>
              <span>@ do lote: <b className="tabular-nums text-foreground">{c.totalArrobas.toFixed(2)}</b></span>
            </div>

            {/* ── Bônus e descontos: pares bidirecionais ── */}
            <div className="space-y-1.5 border-t pt-2">
              <ParDeUnidade
                rotulo="Bônus precoce" unidadeA="arroba" unidadeB="reais"
                rotuloA="R$/@" rotuloB="R$ total"
                valor={linha.bonusPrecoce}
                derivadoA={c.totalArrobas > 0 ? c.bonusPrecoceTotal / c.totalArrobas : 0}
                derivadoB={c.bonusPrecoceTotal}
                onChange={v => trocar({ bonusPrecoce: { valor: v.valor, fonte: v.fonte === 'arroba' || v.fonte === 'reais' ? v.fonte : null } })}
                somenteLeitura={somenteLeitura}
              />
              <ParDeUnidade
                rotulo="Bônus qualidade" unidadeA="arroba" unidadeB="reais"
                rotuloA="R$/@" rotuloB="R$ total"
                valor={linha.bonusQualidade}
                derivadoA={c.totalArrobas > 0 ? c.bonusQualidadeTotal / c.totalArrobas : 0}
                derivadoB={c.bonusQualidadeTotal}
                onChange={v => trocar({ bonusQualidade: { valor: v.valor, fonte: v.fonte === 'arroba' || v.fonte === 'reais' ? v.fonte : null } })}
                somenteLeitura={somenteLeitura}
              />
              <ParDeUnidade
                rotulo="Bônus lista/trace" unidadeA="arroba" unidadeB="reais"
                rotuloA="R$/@" rotuloB="R$ total"
                valor={linha.bonusListaTrace}
                derivadoA={c.totalArrobas > 0 ? c.bonusListaTraceTotal / c.totalArrobas : 0}
                derivadoB={c.bonusListaTraceTotal}
                onChange={v => trocar({ bonusListaTrace: { valor: v.valor, fonte: v.fonte === 'arroba' || v.fonte === 'reais' ? v.fonte : null } })}
                somenteLeitura={somenteLeitura}
              />
              <ParDeUnidade
                rotulo="Desconto qualidade" unidadeA="arroba" unidadeB="reais"
                rotuloA="R$/@" rotuloB="R$ total"
                valor={linha.descontoQualidade}
                derivadoA={c.totalArrobas > 0 ? c.descQualidadeTotal / c.totalArrobas : 0}
                derivadoB={c.descQualidadeTotal}
                onChange={v => trocar({ descontoQualidade: { valor: v.valor, fonte: v.fonte === 'arroba' || v.fonte === 'reais' ? v.fonte : null } })}
                somenteLeitura={somenteLeitura}
              />
              {/* ⚠ INVERTIDO DE PROPÓSITO: neste par o primeiro lado é o TOTAL. É como a
                  lib o lê (`outrosDescontos` é total, `outrosDescontosArroba` é por @), e
                  o CHECK do banco diz o mesmo — `('reais','arroba')`. */}
              <ParDeUnidade
                rotulo="Outros descontos" unidadeA="reais" unidadeB="arroba"
                rotuloA="R$ total" rotuloB="R$/@"
                valor={linha.outrosDescontos}
                derivadoA={c.descOutrosTotal}
                derivadoB={c.totalArrobas > 0 ? c.descOutrosTotal / c.totalArrobas : 0}
                onChange={v => trocar({ outrosDescontos: { valor: v.valor, fonte: v.fonte === 'reais' || v.fonte === 'arroba' ? v.fonte : null } })}
                somenteLeitura={somenteLeitura}
              />
            </div>

            {/* ── Funrural: o único percentual ── */}
            <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2 border-t pt-2">
              <Label className={LBL}>Funrural e impostos na origem</Label>
              <div className="w-[120px]">
                <Label className={LBL}>%</Label>
                {linha.funrural.fonte === 'reais' ? (
                  <div className={`${H} flex items-center justify-end rounded-md border border-dashed px-2 text-muted-foreground tabular-nums`}
                       title="Derivado do total — não é digitável nem gravado.">
                    {(c.valorBase > 0 ? (c.funruralTotal / c.valorBase) * 100 : 0).toFixed(2)}%
                  </div>
                ) : (
                  <Input
                    type="number" step="0.01" inputMode="decimal" className={`${H} text-right`}
                    disabled={somenteLeitura}
                    value={linha.funrural.fonte === 'pct' ? (linha.funrural.valor ?? '') : ''}
                    onChange={e => trocar({ funrural: e.target.value === ''
                      ? { valor: null, fonte: null }
                      : { valor: Number(e.target.value), fonte: 'pct' } })}
                  />
                )}
              </div>
              <div className="w-[130px]">
                <Label className={LBL}>R$ total</Label>
                {linha.funrural.fonte === 'pct' ? (
                  <div className={`${H} flex items-center justify-end rounded-md border border-dashed px-2 text-muted-foreground tabular-nums`}
                       title="Derivado do percentual — não é digitável nem gravado.">
                    {formatMoeda(c.funruralTotal)}
                  </div>
                ) : (
                  <CampoMoeda
                    valor={linha.funrural.fonte === 'reais' ? linha.funrural.valor : null}
                    className={`${H} text-right`} disabled={somenteLeitura}
                    onChange={n => trocar({ funrural: n == null ? { valor: null, fonte: null } : { valor: n, fonte: 'reais' } })}
                  />
                )}
              </div>
            </div>

            {/* ── A cascata do lote ── */}
            <div className="space-y-0.5 rounded-md bg-muted/30 px-2.5 py-2">
              <LinhaCascata rotulo="Base (@ × preço)" valor={c.valorBase} forte />
              <LinhaCascata rotulo="Bônus" valor={c.totalBonus} sinal="+" />
              <LinhaCascata rotulo="Descontos" valor={c.totalDescontos} sinal="−" />
              <LinhaCascata rotulo="Bruto" valor={c.valorBruto} forte />
              <LinhaCascata rotulo="Funrural e impostos" valor={c.funruralTotal} sinal="−" />
              <LinhaCascata rotulo="Líquido do lote" valor={c.valorLiquido} forte />
            </div>
          </div>
        );
      })}

      {/* ── O total: a soma dos lotes, e não uma conta sobre o agregado ── */}
      {lotes.length > 1 && (
        <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[13px] font-semibold text-foreground">Total do abate</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {total.totalArrobas.toFixed(2)} @ · {lotes.length} lotes
            </span>
          </div>
          <div className="space-y-0.5">
            <LinhaCascata rotulo="Base (@ × preço)" valor={total.valorBase} forte />
            <LinhaCascata rotulo="Bônus" valor={total.totalBonus} sinal="+" />
            <LinhaCascata rotulo="Descontos" valor={total.totalDescontos} sinal="−" />
            <LinhaCascata rotulo="Bruto" valor={total.valorBruto} forte />
            <LinhaCascata rotulo="Funrural e impostos" valor={total.funruralTotal} sinal="−" />
            <LinhaCascata rotulo="Líquido a receber" valor={total.valorLiquido} forte />
          </div>
        </div>
      )}
    </div>
  );
}
