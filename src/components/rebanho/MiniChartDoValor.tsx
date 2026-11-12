/**
 * O MINI-GRÁFICO DO VALOR DO REBANHO — movido VERBATIM de `ValorRebanhoTab.tsx` (DRE-VARIACAO-EXPLICA-01 1b, OK do Chat 09/11: a aba
 * Gráfico do modal da variação usa os gráficos da tela do VR). Um componente para as duas telas; nada mudou de corpo.
 */
import { useId } from 'react';
import { ComposedChart, Line, Area, ReferenceLine, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { areasDaBase } from '@/lib/zootecnico/areasDaBase';
import { formatNum } from '@/lib/calculos/formatters';

/**
 * A cor da linha "sem efeito de mercado" — laranja, nunca o cinza de antes.
 * ⚠ ELA É UMA RESPOSTA, NÃO UM APOIO. Em cinza tracejado ela lia como grade de fundo; a pergunta
 * "quanto do meu valor é rebanho e quanto é preço?" merece uma cor que se vê.
 */
const COR_SEM_MERCADO = '#D97706';

/**
 * A BASE É O INÍCIO, e a área contra ela é a resposta — VALOR-REBANHO-GRAFICOS-BASE-01.
 *
 * ⚠ A LINHA SOZINHA MOSTRAVA A FORMA E ESCONDIA O SINAL: para saber se o rebanho está acima ou
 * abaixo de onde começou, o olho tinha de achar o primeiro ponto e segui-lo até o fim. Com a
 * horizontal do Início e a área pintada, isso é uma olhada.
 */
const COR_BASE = '#8A8880';
const COR_ACIMA = '#2A7FE0';
const COR_ABAIXO = '#E24B4A';
const OPACIDADE_AREA = 0.14;
/** A mesma opacidade em hex, para o miolo do quadradinho da legenda (0,14 x 255 = 36 = 0x24). */
const ALFA_HEX = Math.round(OPACIDADE_AREA * 255).toString(16).padStart(2, '0');

/**
 * O corte de cor sai de um gradiente VERTICAL com dois stops no mesmo offset — e não de dois
 * polígonos calculados à mão.
 *
 * ⚠ É O QUE FAZ A ÁREA GRUDAR NA LINHA. A borda da área é a MESMA curva `monotone` da série, e o
 * x em que a cor troca é o x em que essa curva corta a base — exato por construção, sem segundo
 * desenho que possa divergir do primeiro. Calcular os polígonos daria bordas RETAS sob uma linha
 * curva, e a lasca entre as duas apareceria na tela.
 */
function GradienteDaBase({ id, fracao }: { id: string; fracao: number }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset={0} stopColor={COR_ACIMA} stopOpacity={OPACIDADE_AREA} />
      <stop offset={fracao} stopColor={COR_ACIMA} stopOpacity={OPACIDADE_AREA} />
      <stop offset={fracao} stopColor={COR_ABAIXO} stopOpacity={OPACIDADE_AREA} />
      <stop offset={1} stopColor={COR_ABAIXO} stopOpacity={OPACIDADE_AREA} />
    </linearGradient>
  );
}

export function MiniChart({ data, color, title, unit, serie2, rotulo1, rotulo2, altura = 140, ligarFalhas = false, semLegendaDaBase = false, chaveEixo = 'label', fonteEixo = 7, margemDireita = 4 }: {
  data: { label: string; fullLabel?: string; eixo?: string; value: number | null; value2?: number | null }[];
  color: string; title: string; unit?: 'currency' | 'arroba';
  /** A segunda linha — cinza tracejada. Só o 4º gráfico a usa. */
  serie2?: boolean; rotulo1?: string; rotulo2?: string;
  /** DRE-VARIACAO-SIMPLES-01 (P7): o gráfico grande do modal da variação; sem a prop, os 140px da tela do VR. */
  altura?: number;
  /* DRE-VARIACAO-SIMPLES-01 v4 (Chat 11/11 08:35) — o gráfico grande do modal da variação; sem as props, o da tela do VR:
     `ligarFalhas`: a linha passa por cima do mês sem fechamento (o cadastro) em vez de deixar pontos soltos;
     `semLegendaDaBase`: sem os três símbolos da base (tracejada + 2 quadradinhos); `chaveEixo`/`fonteEixo`: o rótulo e a fonte do eixo X. */
  ligarFalhas?: boolean;
  semLegendaDaBase?: boolean;
  chaveEixo?: 'label' | 'eixo';
  fonteEixo?: number;
  /** o espaço à direita do desenho: com a fonte 9 do eixo, o último mês ("set") cortava em "se" com os 4px de sempre */
  margemDireita?: number;
}) {
  // Strip leading null points so the chart renders from the first real value (e.g. Jan)
  const firstRealIdx = data.findIndex(d => d.value !== null);
  const visibleData = firstRealIdx > 0 ? data.slice(firstRealIdx) : data;

  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  /* ⚠ A BASE É O PONTO "I", NÃO O PRIMEIRO PONTO VISÍVEL. Sem Início não há base: nem a
     horizontal, nem as áreas. Ver `areasDaBase` — ausência não vira zero. */
  const base = data[0]?.label === 'I' && data[0].value != null && Number.isFinite(data[0].value)
    ? data[0].value : null;
  const r1 = base == null ? null : areasDaBase(visibleData.map(d => d.value), base);
  const r2 = base == null || !serie2 ? null : areasDaBase(visibleData.map(d => d.value2), base);

  return (
    /* ⚠ 140px E LINHA INTEIRA — COMPACTO-03. Eram 60px espremidos ao lado dos indicadores, e uma
       série de treze pontos em 60px não se lê. Descendo para uma faixa própria, os quatro cabem
       lado a lado com altura para o eixo aparecer.
       ⚠ E O EIXO Y GANHOU TRÊS RÓTULOS: sem eles o desenho mostrava a FORMA da curva e escondia a
       ordem de grandeza — duas telas iguais para 8 e para 15 milhões. */
    <div className="flex-1 min-w-0">
      {title && <p className="mb-0.5 truncate text-center font-medium" style={{ fontSize: 10, color: '#0C447C' }}>{title}</p>}
      <div className="w-full" style={{ height: altura }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={visibleData} margin={{ top: 4, right: margemDireita, bottom: 0, left: 4 }}>
            <defs>
              {r1?.fracaoDaBase != null && <GradienteDaBase id={`base1-${uid}`} fracao={r1.fracaoDaBase} />}
              {r2?.fracaoDaBase != null && <GradienteDaBase id={`base2-${uid}`} fracao={r2.fracaoDaBase} />}
            </defs>
            <XAxis dataKey={chaveEixo} tick={{ fontSize: fonteEixo }} interval={0} tickLine={false} axisLine={false} />
            <YAxis width={34} tick={{ fontSize: 8 }} tickLine={false} axisLine={false} tickCount={3}
              domain={['auto', 'auto']}
              tickFormatter={(v: number) => (Math.abs(v) >= 1_000_000
                ? `${formatNum(v / 1_000_000, 1)}mi`
                : Math.abs(v) >= 1000 ? `${formatNum(v / 1000, 0)}k` : formatNum(v, 0))} />
            <RechartsTooltip
              contentStyle={{ fontSize: 9, padding: '2px 6px' }}
              labelStyle={{ fontSize: 8 }}
              labelFormatter={(label: string, payload: any[]) => payload?.[0]?.payload?.fullLabel || label}
              formatter={(v: number) => {
                if (unit === 'currency') return ['R$ ' + formatNum(v, 0), ''];
                if (unit === 'arroba') return [formatNum(v, 1) + ' @', ''];
                return [formatNum(v, 1), ''];
              }}
            />
            {/* ⚠ AS ÁREAS VÊM ANTES DAS LINHAS: o recharts desenha na ordem dos filhos, e elas
                passam POR BAIXO. Cada série tem a sua; onde se sobrepõem, sobrepõem. */}
            {r1?.fracaoDaBase != null && base != null && (
              <Area type="monotone" dataKey="value" baseValue={base} stroke="none"
                fill={`url(#base1-${uid})`} connectNulls={ligarFalhas} isAnimationActive={false}
                activeDot={false} tooltipType="none" legendType="none" />
            )}
            {r2?.fracaoDaBase != null && base != null && (
              <Area type="monotone" dataKey="value2" baseValue={base} stroke="none"
                fill={`url(#base2-${uid})`} connectNulls={ligarFalhas} isAnimationActive={false}
                activeDot={false} tooltipType="none" legendType="none" />
            )}
            {base != null && (
              <ReferenceLine y={base} stroke={COR_BASE} strokeWidth={0.8} strokeDasharray="2 3" />
            )}
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={{ r: 2, fill: color, strokeWidth: 0 }} activeDot={{ r: 3.5 }} connectNulls={ligarFalhas} />
            {/* ⚠ A TRACEJADA É O MESMO REBANHO AO PREÇO DO INÍCIO: a distância até a cheia é o
                efeito de mercado acumulado, e ela sozinha é a produção. */}
            {serie2 && (
              <Line type="monotone" dataKey="value2" stroke={COR_SEM_MERCADO} strokeWidth={1.5}
                strokeDasharray="3 2" dot={{ r: 2, fill: COR_SEM_MERCADO, strokeWidth: 0 }}
                activeDot={{ r: 3.5 }} connectNulls={ligarFalhas} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {(serie2 || (base != null && !semLegendaDaBase)) && (
        <div className="flex flex-wrap items-center justify-center gap-x-2" style={{ fontSize: 8 }}>
          {serie2 && (
            <>
              <span className="flex items-center gap-1">
                <span className="inline-block" style={{ width: 10, height: 2, backgroundColor: color }} />{rotulo1}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block" style={{ width: 10, height: 0, borderTop: `2px dashed ${COR_SEM_MERCADO}` }} />{rotulo2}
              </span>
            </>
          )}
          {base != null && !semLegendaDaBase && (
            /* ⚠ SÓ O SÍMBOLO, E O NOME NO `title`. Medido: com os rótulos escritos, os cinco itens
               somavam 294,5px numa caixa de 220 — não cabiam em uma linha nem com espaçamento
               zero, e a faixa dos gráficos crescia 12px. O símbolo aqui NÃO é abreviação de um
               texto: a linha tracejada cinza e os dois quadradinhos são exatamente o que está
               desenhado logo acima, e quem precisar do nome tem o `title`. */
            /* Os três andam juntos e mais apertados que os itens de texto: são UM assunto. */
            <div className="flex items-center" style={{ columnGap: 3 }}>
              <span className="flex items-center gap-1" title="base: início">
                <span className="inline-block" style={{ width: 10, height: 0, borderTop: `1px dashed ${COR_BASE}` }} />
              </span>
              {/* ⚠ O QUADRADINHO LEVA A BORDA SÓLIDA E O MIOLO A 14 %: no preenchimento da área
                  essa opacidade é legível porque ela cobre altura; num quadrado de 8px ela
                  sumiria, e uma legenda sólida mentiria sobre a cor que está no gráfico. */}
              <span className="flex items-center gap-1" title="acima do início">
                <span className="inline-block h-2 w-2 rounded-[1px]"
                  style={{ backgroundColor: `${COR_ACIMA}${ALFA_HEX}`, outline: `1px solid ${COR_ACIMA}` }} />
              </span>
              <span className="flex items-center gap-1" title="abaixo do início">
                <span className="inline-block h-2 w-2 rounded-[1px]"
                  style={{ backgroundColor: `${COR_ABAIXO}${ALFA_HEX}`, outline: `1px solid ${COR_ABAIXO}` }} />
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
