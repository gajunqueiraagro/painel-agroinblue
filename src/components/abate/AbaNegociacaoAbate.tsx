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
import { paraCalculo, linhaVazia as vazia, type LoteAbate } from '@/components/abate/calculoDoLote';

/* Reexportado: o tipo nasceu aqui e ha' quem o importe deste caminho. */
export type { LoteAbate };

/** O lote como a negociação o conhece — só o que o cálculo precisa. */

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
/* Duas casas em TODA conversão: é o que faz a ida e volta cabeça↔total fechar. Sem
   isso, 4500 / 18 = 250,00000000000003 volta ao campo e o operador vê o número mudar. */
const round2 = (n: number) => Math.round(n * 100) / 100;

const H = 'h-8 text-xs';
const LBL = 'text-[10px] text-muted-foreground';


/**
 * Traduz a linha gravada para a entrada da lib.
 *
 * ⚠ A FONTE DECIDE EM QUAL CAMPO O VALOR ENTRA, e é só isso que ela faz. `'arroba'`
 * alimenta o campo por-arroba da lib; `'reais'`, o campo de total. Mandar o mesmo número
 * nos dois faria a lib somar duas vezes — ela usa o primeiro que for maior que zero.
 */

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

/**
 * O par CONVERTIDO — carcaça e preço.
 *
 * ⚠ IRMÃO DE `ParDeUnidade`, NÃO O MESMO, e a diferença é o que se grava. Nos bônus o
 * banco guarda o número digitado e a fonte diz em que unidade ele está. Aqui o banco
 * guarda SEMPRE o canônico — `peso_carcaca_kg` é o total do lote, `preco_arroba` é R$/@ —
 * e a fonte só lembra por onde o operador entrou. Por isso os dois lados são calculados
 * a partir do canônico, e digitar em qualquer um deles reescreve o canônico.
 *
 * ⚠ O DESENHO É O MESMO DE PROPÓSITO: mesma grade, mesmas larguras, mesma borda tracejada
 * no lado derivado. Dois padrões visuais para a mesma ideia ensinariam o operador a
 * desconfiar de qual deles vale.
 */
function ParConvertido({ rotulo, ladoA, ladoB, fonte, onDigitar, somenteLeitura }: {
  rotulo: string;
  ladoA: LadoConvertido;
  ladoB: LadoConvertido;
  fonte: string | null;
  onDigitar: (unidade: string, n: number | null) => void;
  somenteLeitura?: boolean;
}) {
  /* Sem fonte gravada, o lado A é o de entrada: linha antiga não sabe por onde foi
     digitada, e supor o outro lado trocaria o número na cara de quem abre a tela. */
  const ativo = fonte === ladoB.unidade ? ladoB.unidade : ladoA.unidade;
  const campo = (lado: LadoConvertido, largura: string) => {
    const ehAtivo = ativo === lado.unidade;
    return (
      <div className={largura}>
        <Label className={LBL}>{lado.rotulo}</Label>
        {!ehAtivo || lado.bloqueio ? (
          <div className={`${H} flex items-center justify-end rounded-md border border-dashed px-2 text-muted-foreground tabular-nums`}
               title={lado.bloqueio ?? 'Derivado do outro lado — não é digitável nem gravado.'}>
            {lado.bloqueio ? '—' : lado.moeda ? formatMoeda(lado.valor ?? 0) : kg2(lado.valor)}
          </div>
        ) : lado.moeda ? (
          <CampoMoeda valor={lado.valor} className={`${H} text-right`} disabled={somenteLeitura}
            onChange={n => onDigitar(lado.unidade, n)} />
        ) : (
          <Input type="number" step="0.01" inputMode="decimal" className={`${H} text-right`}
            disabled={somenteLeitura}
            value={lado.valor ?? ''}
            onChange={e => onDigitar(lado.unidade, e.target.value === '' ? null : Number(e.target.value))} />
        )}
      </div>
    );
  };
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
      <Label className={LBL}>{rotulo}</Label>
      {campo(ladoA, 'w-[120px]')}
      {campo(ladoB, 'w-[130px]')}
    </div>
  );
}

type LadoConvertido = {
  unidade: string;
  rotulo: string;
  valor: number | null;
  moeda?: boolean;
  /** Motivo pelo qual este lado não pode receber número — vira `—` e vai no `title`. */
  bloqueio?: string | null;
};

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
          /* ⚠ ANCORA do "Negociar lote" da grade: o botao rola ate' aqui. Ele existe
             porque a alternativa era um botao desabilitado dizendo "no proximo passo" —
             promessa vazia ensina a desconfiar do botao. No 96c ele abre o modal. */
          <div key={lote.id} id={`abate-lote-${lote.id}`} className="rounded-lg border bg-card p-3 space-y-2.5">
            <div className="flex items-baseline justify-between">
              <div className="text-[13px] font-medium text-foreground">
                {lote.ordem}. {lote.categoriaLabel}
                <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                  {lote.quantidade} cab · {kg2(lote.pesoMedioKg)}/cab
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground">{subcentro ?? '—'}</span>
            </div>

            {/* ── Carcaça e preço: dois lados, um canônico ── */}
            <div className="space-y-1.5">
              <ParConvertido
                rotulo="Carcaça" fonte={linha.pesoCarcacaFonte}
                somenteLeitura={somenteLeitura}
                ladoA={{ unidade: 'cabeca', rotulo: 'kg/cab',
                  valor: linha.pesoCarcacaKg != null && lote.quantidade > 0
                    ? round2(linha.pesoCarcacaKg / lote.quantidade) : null }}
                ladoB={{ unidade: 'total', rotulo: 'kg do lote', valor: linha.pesoCarcacaKg }}
                onDigitar={(unidade, n) => trocar(n == null
                  ? { pesoCarcacaKg: null, pesoCarcacaFonte: null }
                  : {
                    /* Digitou por cabeça: o total é o que se grava. */
                    pesoCarcacaKg: unidade === 'cabeca' ? round2(n * lote.quantidade) : round2(n),
                    pesoCarcacaFonte: unidade === 'cabeca' ? 'cabeca' : 'total',
                  })}
              />
              <ParConvertido
                rotulo="Preço" fonte={linha.precoFonte}
                somenteLeitura={somenteLeitura}
                ladoA={{ unidade: 'arroba', rotulo: 'R$/@', valor: linha.precoArroba, moeda: true }}
                ladoB={{ unidade: 'total', rotulo: 'R$ do lote', moeda: true,
                  valor: linha.precoArroba != null ? round2(linha.precoArroba * c.totalArrobas) : null,
                  /* ⚠ SEM CARCAÇA NÃO HÁ ARROBAS, e sem arrobas o total não vira R$/@ — a
                     divisão seria por zero. O campo diz por que está travado em vez de
                     aceitar um número que viraria lixo. */
                  bloqueio: c.totalArrobas > 0 ? null : 'Informe a carcaça primeiro — sem ela não há arrobas para converter.' }}
                onDigitar={(unidade, n) => trocar(n == null
                  ? { precoArroba: null, precoFonte: null }
                  : {
                    precoArroba: unidade === 'total'
                      ? (c.totalArrobas > 0 ? round2(n / c.totalArrobas) : null)
                      : round2(n),
                    precoFonte: unidade === 'total' ? 'total' : 'arroba',
                  })}
              />
              <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
                <Label className={LBL}>Rendimento (%)</Label>
                {/* Travado no mesmo desenho dos derivados: borda tracejada e texto apagado
                    dizem, sem legenda, que aqui nao se digita. */}
                <div className={`${H} w-[120px] flex items-center justify-end rounded-md border border-dashed px-2 text-muted-foreground tabular-nums`}
                     title="Derivado da carcaça sobre o peso vivo — não é digitável.">
                  {c.rendCalc > 0 ? `${c.rendCalc.toFixed(2)}%` : '—'}
                </div>
                <div className="w-[130px]" />
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
