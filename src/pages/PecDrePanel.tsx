/**
 * DRE DA PECUÁRIA — a grade por fazenda, num período de meses.
 *
 * ⚠⚠ NENHUM CÁLCULO AQUI. `fn_dre_pecuaria` devolve cada linha por fazenda e no total; a única
 * conta é `valor / cab_fim`, que é apresentação — a mesma licença que o `/ha` tem na lavoura.
 *
 * ⚠ ELE NÃO É A `Grade` DA LAVOURA, e a razão é estrutural, não preguiça. Aquela grade é feita de
 * grupos expansíveis, centros de custo, ponto de rateio, etiquetas e TRÊS sub-colunas por
 * cultura; esta tem dezoito linhas planas, nenhum grupo, nenhum rateio para abrir e DUAS
 * sub-colunas por fazenda. Encaixar as duas num componente só custaria uma dúzia de condicionais
 * numa peça que acabou de estabilizar depois de seis rodadas de homologação — e o primeiro
 * ajuste da pecuária mexeria na lavoura sem querer.
 * ⚠ O QUE SE REUSA É A RÉGUA, que é o que não pode divergir: larguras de coluna, altura de linha,
 * cores, `Celula`, `CelulaUnit` e as caixas da faixa vêm todas do módulo da lavoura. Duas telas
 * do mesmo DRE não podem ter dois cinzas de cabeçalho nem dois vermelhos de saída.
 * ⚠ E A RÉGUA JÁ MORA NUM MÓDULO PRÓPRIO (`components/agri/dreGrade`): ela saiu da página neste
 * mesmo PR, porque deixá-la lá fechava um ciclo de import entre as duas telas — o `madge` foi de
 * 23 para 24 e cobrou.
 */
import { Fragment, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { CINZA_CABECALHO } from '@/lib/idiomaVisual';
import { formatNum } from '@/lib/calculos/formatters';
import {
  W_RS, W_HA, W_RS_TOTAL, VERDE, VERMELHO, NAVY_TOTAL, BORDA_TOTAL, traco,
  corDoSinal, numeroDaCelula, Celula, CelulaUnit, Etiqueta, Caixas, REGUA_LINHA, tipoDaLinha,
  fundoDaLinha,
  type CaixaFaixa,
} from '@/components/agri/dreGrade';
import type { DrePecuaria, DrePecLinhas, ChaveLinhaPec } from '@/hooks/useDrePecuaria';

/** A coluna de rótulos: mais estreita que a da lavoura, que carrega caret e etiquetas. */
const W_FAZENDA = 190;
/** R$/cab — o mesmo lugar do R$/ha da lavoura. */
const W_CAB = 76;

/**
 * A CASCATA, declarada — dezoito linhas, e a diferença entre elas é DADO.
 *
 * ⚠ A ORDEM É O DRE, e ela mora AQUI: a RPC devolve um objeto de chaves sem ordem, porque JSON
 * não tem ordem. Quem sabe que a margem vem depois do custo variável é a apresentação.
 */
interface DefPec {
  chave: ChaveLinhaPec;
  rotulo: string;
  tom: 'receita' | 'custo' | 'neutro';
  destaque?: 'subtotal' | 'sub';
  /** A cor sai do próprio número, coluna a coluna. */
  corPorSinal?: boolean;
  etiqueta?: string;
}

const LINHAS_PEC: DefPec[] = [
  { chave: 'vendas', rotulo: 'Vendas', tom: 'receita' },
  { chave: 'outras_receitas', rotulo: 'Outras receitas', tom: 'receita' },
  { chave: 'receita_bruta', rotulo: '= Receita bruta', tom: 'receita', destaque: 'sub' },
  { chave: 'deducoes', rotulo: '(−) Deduções', tom: 'custo' },
  { chave: 'receita_liquida', rotulo: '= Receita líquida', tom: 'receita', destaque: 'subtotal' },
  /* ⚠ A VARIAÇÃO POR PRODUÇÃO É O REBANHO QUE MUDOU A PREÇO CONGELADO — pode ser negativa numa
     safra de venda, e negativa aqui não é prejuízo: é boi que saiu da fazenda. Cor pelo sinal. */
  { chave: 'vpb_operacional', rotulo: 'Variação por produção', tom: 'neutro', corPorSinal: true, etiqueta: 'estimado' },
  { chave: 'reposicao', rotulo: '(−) Reposição', tom: 'custo' },
  { chave: 'vbp', rotulo: '= VBP', tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'custo_variavel', rotulo: '(−) Custo variável', tom: 'custo' },
  { chave: 'margem', rotulo: '= Margem de contribuição', tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'custo_fixo', rotulo: '(−) Custo fixo', tom: 'custo' },
  { chave: 'rateio_adm', rotulo: '(−) Rateio administrativo', tom: 'custo', etiqueta: 'estimado' },
  { chave: 'resultado_operacional', rotulo: '= Resultado operacional', tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'juros', rotulo: '(−) Despesas financeiras (juros)', tom: 'custo' },
  { chave: 'resultado_periodo', rotulo: '= Resultado do período', tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'efeito_mercado', rotulo: 'Efeito de mercado', tom: 'neutro', corPorSinal: true, etiqueta: 'estimado' },
  { chave: 'resultado_com_mercado', rotulo: '= Resultado com mercado', tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'investimento', rotulo: 'Investimento no período', tom: 'custo' },
];

/** Onde entra a faixa "abaixo da linha de caixa". */
const APOS: ChaveLinhaPec = 'resultado_com_mercado';

const corDoTom = (t: DefPec['tom']) => (t === 'receita' ? VERDE : t === 'custo' ? VERMELHO : '');

/** ⚠ `null` É AUSÊNCIA, não zero: fazenda sem fechacomento numa das pontas não tem variação. */
const valorDe = (l: DrePecLinhas, c: ChaveLinhaPec): number | null => {
  const v = l[c];
  return typeof v === 'number' ? v : null;
};

/** ⚠ A ÚNICA DIVISÃO, e é de apresentação. Sem cabeça no fim, traço — nunca Infinity. */
const porCabeca = (v: number | null, cab: number) =>
  (v == null || !(cab > 0) ? traco : formatNum(v / cab, 2));

export function PecDrePanel({ dre, alturaCartao, cartaoRef }: {
  dre: DrePecuaria;
  alturaCartao: number | null;
  cartaoRef: React.RefObject<HTMLDivElement>;
}) {
  const fazendas = dre.fazendas;
  const larguras = useMemo(() => {
    const cols: number[] = [W_FAZENDA];
    fazendas.forEach(() => cols.push(W_RS, W_CAB));
    cols.push(W_RS_TOTAL, W_HA);
    return cols;
  }, [fazendas]);
  const larguraMin = larguras.reduce((a, b) => a + b, 0);

  return (
    <div ref={cartaoRef} className="overflow-auto rounded-lg border border-border/60 bg-card"
      style={alturaCartao ? { maxHeight: alturaCartao } : undefined}>
      {/* ⚠ A MESMA RÉGUA DA LAVOURA: `leading-none`, px fixos e largura igual à soma das colunas.
          Ver a nota no `AgriDreLavouraTab` — foi ela que fez as alturas declaradas valerem. */}
      <table className="border-collapse text-[11px] leading-none"
        style={{ tableLayout: 'fixed', width: larguraMin }}>
        <colgroup>{larguras.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>

        <thead>
          <tr style={{ height: 26 }}>
            <th rowSpan={2}
              className={cn(CINZA_CABECALHO, 'sticky left-0 top-0 z-30 px-[7px] text-left',
                'text-[10px] font-medium text-white')}>
              Fazenda
            </th>
            {fazendas.map(f => {
              /* ⚠ A COLUNA "Admin" APARECE, e é de propósito: ela é lançamento de pecuária sem
                 fazenda produtiva — lixo visível. Escondê-la faria o Total não fechar com a soma
                 das colunas, e ninguém saberia por quê. */
              const admin = /admin/i.test(f.nome);
              return (
                <th key={f.fazenda_id} colSpan={2}
                  title={admin ? 'lançamentos de pecuária sem fazenda produtiva' : undefined}
                  className={cn(CINZA_CABECALHO, 'sticky top-0 z-20 px-[7px] text-center',
                    'align-middle text-white')}
                  style={{ borderLeft: '1px solid rgba(255,255,255,.22)' }}>
                  <div className="truncate text-[10px] font-medium leading-[12px]">{f.nome}</div>
                  <div className="whitespace-nowrap text-[10px] font-normal leading-[12px] text-white">
                    {formatNum(f.linhas.patrimonio.cab_fim, 0)} cab
                  </div>
                </th>
              );
            })}
            <th colSpan={2} className="sticky top-0 z-20 px-[7px] text-center text-white"
              style={{ backgroundColor: NAVY_TOTAL, borderLeft: BORDA_TOTAL }}>
              <div className="text-[10px] font-medium leading-[12px]">Total</div>
              <div className="whitespace-nowrap text-[10px] font-normal leading-[12px] text-white">
                {formatNum(dre.total.patrimonio.cab_fim, 0)} cab
              </div>
            </th>
          </tr>
          <tr style={{ height: 14 }}>
            {fazendas.map(f => (
              <Fragment key={f.fazenda_id}>
                <th className={cn(CINZA_CABECALHO, 'sticky z-20 px-[7px] text-right text-[10px] font-normal text-white')}
                  style={{ top: 26, borderLeft: '1px solid rgba(255,255,255,.22)' }}>R$</th>
                <th className={cn(CINZA_CABECALHO, 'sticky z-20 px-[7px] text-right text-[10px] font-normal text-white')}
                  style={{ top: 26 }}>R$/cab</th>
              </Fragment>
            ))}
            <th className="sticky z-20 px-[7px] text-right text-[10px] font-normal text-white"
              style={{ top: 26, backgroundColor: NAVY_TOTAL, borderLeft: BORDA_TOTAL }}>R$</th>
            <th className="sticky z-20 px-[7px] text-right text-[10px] font-normal text-white"
              style={{ top: 26, backgroundColor: NAVY_TOTAL }}>R$/cab</th>
          </tr>
        </thead>

        <tbody>
          {LINHAS_PEC.map(def => (
            <Fragment key={def.chave}>
              {def.chave === 'investimento' && (
                <tr className="bg-card" style={{ height: 17 }}>
                  <td className="sticky left-0 z-10 truncate border-r border-t border-border/60 bg-card
                    px-[7px] text-[10px] text-muted-foreground"
                    title="Abaixo da linha de caixa — não entra no resultado do período">
                    Abaixo da linha de caixa
                  </td>
                  {Array.from({ length: larguras.length - 1 }).map((_, i) => (
                    <td key={i} className="border-t border-border/60 bg-card" />
                  ))}
                </tr>
              )}
              <LinhaPec def={def} dre={dre} />
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}



function LinhaPec({ def, dre }: { def: DefPec; dre: DrePecuaria }) {
  const fundo = fundoDaLinha(def.destaque);
  const corLinha = corDoTom(def.tom);
  const tot = valorDe(dre.total, def.chave);
  /* ⚠ A MESMA RÉGUA DA LAVOURA (PR-10): a pecuária não tem grupos nem filhas, então só dois dos
     quatro papéis aparecem aqui — subtotal e simples. O mapa é um só de propósito: o dia em que
     o subtotal mudar de tamanho, ele muda nas duas telas. */
  const regua = REGUA_LINHA[tipoDaLinha(def.destaque)];

  return (
    <tr className={cn(fundo, regua.peso)} style={{ height: regua.altura }}>
      <td className={cn('sticky left-0 z-10 truncate py-px', fundo,
        'border-r border-border/60', corLinha)} title={def.rotulo}
        style={{ fontSize: regua.fonte, paddingLeft: 7 + regua.recuo, paddingRight: 7 }}>
        {def.rotulo}
        {def.etiqueta && <Etiqueta texto={def.etiqueta} />}
      </td>

      {dre.fazendas.map(f => {
        const v = valorDe(f.linhas, def.chave);
        const cab = f.linhas.patrimonio.cab_fim;
        const cor = def.corPorSinal ? corDoSinal(v) : corLinha;
        /* ⚠ SEM FECHAMENTO A CÉLULA DIZ POR QUÊ: as duas linhas de variação vêm nulas, e o
           `title` é o que separa "não mudou" de "não sei". */
        const semFech = (def.chave === 'vpb_operacional' || def.chave === 'efeito_mercado')
          && (f.linhas.sem_p0 || f.linhas.sem_p1);
        return (
          <Fragment key={f.fazenda_id}>
            <Celula valor={v} cor={cor} destaque={def.destaque} fonte={regua.fonte}
              bordaEsquerda fundo={fundo}
              title={semFech ? 'sem fechamento' : undefined} />
            <CelulaUnit texto={porCabeca(v, cab)} cor={cor} destaque={def.destaque}
              fonte={regua.fonte} fundo={fundo} />
          </Fragment>
        );
      })}

      <Celula valor={tot} cor={def.corPorSinal ? corDoSinal(tot) : corLinha}
        destaque={def.destaque} fonte={regua.fonte} total fundo={fundo} />
      <CelulaUnit texto={porCabeca(tot, dre.total.patrimonio.cab_fim)}
        cor={def.corPorSinal ? corDoSinal(tot) : corLinha} destaque={def.destaque}
        fonte={regua.fonte} total fundo={fundo} />
    </tr>
  );
}

/** As seis caixas da pecuária — a mesma régua da lavoura, outro conteúdo. */
export function FaixaPecuaria({ dre }: { dre: DrePecuaria }) {
  const t = dre.total;
  const caixas: CaixaFaixa[] = [
    { rotulo: 'Cabeças', valor: formatNum(t.patrimonio.cab_fim, 0), unidade: 'cab' },
    { rotulo: 'Receita líquida', valor: numeroDaCelula(t.receita_liquida), unidade: 'R$', cor: VERDE },
    { rotulo: 'VBP', valor: numeroDaCelula(t.vbp), unidade: 'R$', cor: corDoSinal(t.vbp),
      titleRotulo: 'Valor bruto da produção' },
    { rotulo: 'Resultado do período', valor: numeroDaCelula(t.resultado_periodo), unidade: 'R$',
      cor: corDoSinal(t.resultado_periodo) },
    { rotulo: 'Efeito de mercado', valor: numeroDaCelula(t.efeito_mercado),
      unidade: t.efeito_mercado == null ? undefined : 'R$', cor: corDoSinal(t.efeito_mercado),
      title: 'O preço mudou, o rebanho ficou — não é resultado de operação.' },
    { rotulo: 'Patrimônio no fim', valor: numeroDaCelula(t.patrimonio.v_fim_p1), unidade: 'R$' },
  ];
  return <Caixas caixas={caixas} />;
}
