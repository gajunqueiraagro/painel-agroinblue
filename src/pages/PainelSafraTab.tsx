/**
 * PAINEL DA SAFRA — Executivo › Painel da Safra (PR-PAINEL-SAFRA-A).
 *
 * ⚠ O RAIO-X DE UM CICLO, no formato do fechamento que o produtor já faz à mão: o que plantou, o
 * que colheu, o que gastou e o que sobrou — por hectare e por saca, que são as duas réguas com
 * que ele compara uma safra com a outra.
 * ⚠ IRMÃ DO "DRE POR CULTURA", NÃO CONCORRENTE. As duas leem `fn_dre_agricola_por_safra`; o DRE
 * mostra a linha contábil e esta mostra o ciclo. O dia em que os dois números discordarem, é
 * porque alguém recalculou em vez de ler — e não há recálculo aqui.
 *
 * ⚠ FATIA A de três. Investimento aparece como UMA linha fora do resultado; o detalhe por tipo,
 * o talhão/variedade e o comparativo entre safras são as fatias B e C.
 */
import { useState, useEffect, useMemo } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sprout, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { useSafrasLavoura, useTalhoesDaSafra } from '@/hooks/useAreaPlantada';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import {
  usePainelSafra, useComparativoSafras, custeioTotal, porHa, porSaca, colheu,
  type SafraComparada,
} from '@/hooks/usePainelSafra';
import { BarrasCompactas, type BarraCompacta } from '@/components/ui/barras-compactas';

/** Cabeçalho azul das três colunas, como o resto da família. */
const TH = 'bg-primary px-2 py-1 text-[9px] font-semibold uppercase tracking-wide'
  + ' text-primary-foreground';

function Cartao({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-card px-2.5 py-1.5">
      <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</div>
      <div className="mt-0.5 truncate text-[20px] font-medium leading-none tabular-nums">{valor}</div>
      {/* ⚠ ALTURA RESERVADA MESMO SEM NOTA: sem o `min-h`, um cartão com nota e outro sem
          teriam alturas diferentes na mesma linha, e a régua de cima dançaria ao trocar de
          safra. */}
      <div className="mt-0.5 min-h-[12px] text-[9px] text-muted-foreground">{nota ?? ''}</div>
    </div>
  );
}

/**
 * Uma linha do DRE.
 *
 * ⚠ A HIERARQUIA É TIPOGRÁFICA, NÃO DE FUNDO COLORIDO. Faturamento e Custeio em 14px negrito
 * coloridos; as naturezas recuadas em 11px cinza. Fundo colorido em linha de total competiria
 * com o cabeçalho azul e com o vermelho do saldo negativo — três sinais disputando a mesma
 * leitura.
 */
function Linha({
  rotulo, valor, area, sacas, nivel, cor, nota,
}: {
  rotulo: string;
  valor: number;
  area: number;
  sacas: number;
  /** 'destaque' = 14px negrito; 'item' = 11px recuado cinza; 'saldo' = 15px negrito. */
  nivel: 'destaque' | 'item' | 'saldo';
  cor?: string;
  nota?: string;
}) {
  const destaque = nivel === 'destaque';
  const saldo = nivel === 'saldo';
  const td = 'px-2 py-0.5 text-right tabular-nums';
  return (
    <tr className={cn('border-t border-slate-100', saldo && 'border-t-2 border-slate-300')}>
      <td className={cn('px-2 py-0.5',
        destaque && 'text-[14px] font-bold',
        saldo && 'text-[15px] font-bold',
        nivel === 'item' && 'pl-6 text-[11px] text-muted-foreground')}>
        {rotulo}
        {/* ⚠ "estimado" FICA COLADO NO RÓTULO, não numa coluna própria: é qualidade do número,
            e quem lê a linha tem de ver a ressalva sem procurar. */}
        {nota && <span className="ml-1 text-[9px] font-normal text-amber-600">{nota}</span>}
      </td>
      <td className={cn(td, destaque && 'text-[14px] font-bold', saldo && 'text-[15px] font-bold',
        nivel === 'item' && 'text-[11px] text-muted-foreground', cor)}>
        {formatMoeda(valor)}
      </td>
      <td className={cn(td, destaque && 'text-[14px] font-bold', saldo && 'text-[15px] font-bold',
        nivel === 'item' && 'text-[11px] text-muted-foreground', cor)}>
        {formatMoeda(porHa(valor, area))}
      </td>
      <td className={cn(td, destaque && 'text-[14px] font-bold', saldo && 'text-[15px] font-bold',
        nivel === 'item' && 'text-[11px] text-muted-foreground', cor)}>
        {formatMoeda(porSaca(valor, sacas))}
      </td>
    </tr>
  );
}

export function PainelSafraTab() {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? null;
  const { safras } = useSafrasLavoura(clienteId);
  const [safraId, setSafraId] = useState('');
  const [cultura, setCultura] = useState('');

  /* A safra mais recente abre por padrão — a lista vem em ordem cronológica crescente. */
  useEffect(() => {
    if (!safraId && safras.length > 0) setSafraId(safras[safras.length - 1].id);
  }, [safras, safraId]);

  /**
   * ⚠ A CULTURA SAI DOS TALHÕES DAQUELA SAFRA, como na colheita e na venda do barter: só se
   * analisa o que se plantou. Uma lista fixa ofereceria milho numa safra que só teve amendoim, e
   * o painel abriria zerado sem dizer por quê.
   */
  const { talhoes } = useTalhoesDaSafra(clienteId, safraId || null);
  const culturasDaSafra = useMemo(
    () => Array.from(new Set(talhoes.map(t => t.cultura))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [talhoes]);
  useEffect(() => {
    if (culturasDaSafra.length === 0) { setCultura(''); return; }
    if (!culturasDaSafra.includes(cultura)) setCultura(culturasDaSafra[0]);
  }, [culturasDaSafra, cultura]);

  const talhoesDaCultura = useMemo(
    () => talhoes.filter(t => t.cultura === cultura), [talhoes, cultura]);

  const { painel, carregando, erro } = usePainelSafra(clienteId, safraId || null, cultura || null);
  const { safras: comparadas } = useComparativoSafras(clienteId, cultura || null);
  const safra = safras.find(s => s.id === safraId);

  const area = painel?.area_ha ?? 0;
  const sacas = painel?.total_sacas ?? 0;
  const custeio = painel ? custeioTotal(painel) : 0;

  /** Só as naturezas com valor — a tabela ajusta entre safras, como o briefing decidiu. */
  const naturezas = (painel?.natureza ?? []).filter(n => n.valor !== 0);

  return (
    <div className="w-full space-y-2 p-4 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Painel da Safra</h2>
          <p className="text-xs text-muted-foreground">
            O ciclo inteiro: o que plantou, colheu, gastou e sobrou — por hectare e por saca.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-[170px]">
            <Label className="text-[10px]">Safra</Label>
            <Select value={safraId} onValueChange={setSafraId}>
              <SelectTrigger className="mt-0.5 h-8 text-[12px]">
                <SelectValue placeholder="Escolha" />
              </SelectTrigger>
              <SelectContent>
                {safras.map(s => (
                  <SelectItem key={s.id} value={s.id} className="text-[12px]">{s.codigo || s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[150px]">
            <Label className="text-[10px]">Cultura</Label>
            <Select value={cultura} onValueChange={setCultura} disabled={culturasDaSafra.length === 0}>
              <SelectTrigger className="mt-0.5 h-8 text-[12px]">
                <SelectValue placeholder={culturasDaSafra.length === 0 ? 'Safra sem área' : 'Escolha'} />
              </SelectTrigger>
              <SelectContent>
                {culturasDaSafra.map(c => (
                  <SelectItem key={c} value={c} className="text-[12px]">{labelDaCultura(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ── O CABEÇALHO DO CICLO ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/40 px-2.5 py-1.5">
        <Sprout className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-[13px] font-bold">{cultura ? labelDaCultura(cultura) : '—'}</span>
        <span className="text-[11px] text-muted-foreground">{safra?.codigo || safra?.nome || '—'}</span>
        <span className="text-[11px] text-muted-foreground">{formatNum(area, 2)} ha</span>
        {/* ⚠ O NOME DO TALHÃO, NUNCA O ID — e todos, não "e mais N": são poucos por cultura
            (medido: de 1 a 3), e esconder o terceiro obrigaria a abrir outra tela para saber
            de onde veio o número. */}
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
          title={talhoesDaCultura.map(t => t.pastoNome).join(' · ')}>
          {talhoesDaCultura.length === 0 ? '—' : talhoesDaCultura.map(t => t.pastoNome).join(' · ')}
        </span>
      </div>

      {erro && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
          Não foi possível carregar o painel: {erro.message}
        </div>
      )}

      {/* ── PLANTIO E COLHEITA ──
          ⚠ OS DOIS BLOCOS FICAM SEMPRE, com os mesmos cartões, mesmo zerados. Safra sem colheita
          mostra zero — que é a verdade — em vez de sumir com metade da tela. */}
      <div className="grid gap-2 md:grid-cols-2">
        <div className="rounded-md border p-2">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Plantio</div>
          <div className="grid grid-cols-3 gap-1.5">
            <Cartao rotulo="Área" valor={`${formatNum(area, 2)} ha`} />
            <Cartao rotulo="Custeio total" valor={formatMoeda(custeio)} />
            <Cartao rotulo="Custeio / ha" valor={formatMoeda(porHa(custeio, area))} />
          </div>
        </div>
        <div className="rounded-md border p-2">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Colheita</div>
          <div className="grid grid-cols-5 gap-1.5">
            <Cartao rotulo="sc / ha" valor={formatNum(painel?.sacas_ha ?? 0, 2)} />
            <Cartao rotulo="R$ / sc" valor={formatMoeda(porSaca(painel?.faturamento ?? 0, sacas))} />
            <Cartao rotulo="Total sc" valor={formatNum(sacas, 2)} nota="boas + roça" />
            <Cartao rotulo="Faturamento" valor={formatMoeda(painel?.faturamento ?? 0)} />
            <Cartao rotulo="Fat. / ha" valor={formatMoeda(porHa(painel?.faturamento ?? 0, area))} />
          </div>
        </div>
      </div>

      {/* ── O DRE DO CICLO ── */}
      <div className="overflow-hidden rounded-md border">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            {['46%', '18%', '18%', '18%'].map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr>
              <th className={cn(TH, 'text-left')}>Linha</th>
              <th className={cn(TH, 'text-right')}>R$ total</th>
              <th className={cn(TH, 'text-right')}>R$ / ha</th>
              <th className={cn(TH, 'text-right')}>R$ / sc</th>
            </tr>
          </thead>
          <tbody>
            <Linha rotulo="Faturamento" valor={painel?.faturamento ?? 0}
              area={area} sacas={sacas} nivel="destaque" cor="text-success" />
            {(painel?.deducoes ?? 0) !== 0 && (
              <Linha rotulo="Deduções" valor={painel?.deducoes ?? 0}
                area={area} sacas={sacas} nivel="item" />
            )}

            <Linha rotulo="Custeio total" valor={custeio}
              area={area} sacas={sacas} nivel="destaque" cor="text-destructive" />
            {naturezas.map(n => (
              <Linha key={n.centro} rotulo={n.centro} valor={n.valor}
                area={area} sacas={sacas} nivel="item" />
            ))}
            {/* ⚠ LINHA PRÓPRIA, E MARCADA. O rateio administrativo não tem centro de custo: ele é
                repartido por janela de datas e peso da cultura. Somado às naturezas viraria um
                centro que não existe; fora da conta, o custeio não fecharia com o DRE. */}
            {(painel?.rateio_admin ?? 0) !== 0 && (
              <Linha rotulo="Rateio administrativo" valor={painel?.rateio_admin ?? 0}
                area={area} sacas={sacas} nivel="item" nota="estimado" />
            )}
            {(painel?.juros ?? 0) !== 0 && (
              <Linha rotulo="Juros" valor={painel?.juros ?? 0}
                area={area} sacas={sacas} nivel="item" />
            )}

            <Linha rotulo="Saldo" valor={painel?.saldo ?? 0} area={area} sacas={sacas}
              nivel="saldo" cor={(painel?.saldo ?? 0) < 0 ? 'text-destructive' : 'text-success'} />
          </tbody>
        </table>
      </div>

      {/* ── INVESTIMENTO NA ABERTURA ──
          ⚠ MESMAS COLUNAS DA TABELA DE CIMA, e por isso o mesmo `colgroup`: as duas tabelas ficam
          uma sob a outra, e larguras diferentes fariam o olho reancorar a cada bloco. Aqui só
          duas das três colunas têm sentido — R$/saca de um trator não diz nada —, e a terceira
          fica VAZIA em vez de sumir, para as bordas continuarem alinhadas. */}
      {(painel?.investimento_tipos.length ?? 0) > 0 && (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              {['46%', '18%', '18%', '18%'].map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead>
              <tr>
                <th className={cn(TH, 'text-left')}>Investimento na abertura</th>
                <th className={cn(TH, 'text-right')}>R$ total</th>
                <th className={cn(TH, 'text-right')}>R$ / ha</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {painel?.investimento_tipos.map(t => (
                <tr key={t.tipo} className="border-t border-slate-100">
                  <td className="px-2 py-0.5 pl-6 text-[11px] text-muted-foreground">{t.tipo}</td>
                  <td className="px-2 py-0.5 text-right text-[11px] tabular-nums text-muted-foreground">
                    {formatMoeda(t.valor)}
                  </td>
                  <td className="px-2 py-0.5 text-right text-[11px] tabular-nums text-muted-foreground">
                    {formatMoeda(t.valor_ha)}
                  </td>
                  <td />
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300">
                <td className="px-2 py-0.5 text-[14px] font-bold">Total investido</td>
                <td className="px-2 py-0.5 text-right text-[14px] font-bold tabular-nums">
                  {formatMoeda(painel?.investimento ?? 0)}
                </td>
                <td className="px-2 py-0.5 text-right text-[14px] font-bold tabular-nums">
                  {formatMoeda(porHa(painel?.investimento ?? 0, area))}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
          <p className="border-t bg-muted/40 px-2 py-1 text-[10px] leading-snug text-muted-foreground">
            Fora do resultado do ciclo: vira patrimônio e amortiza em anos. Está aqui para o
            produtor ver quanto a safra consumiu de caixa ao todo, não só de custeio.
          </p>
        </div>
      )}

      {/* ── POR TALHÃO / VARIEDADE ── */}
      {(painel?.talhoes.length ?? 0) > 0 && (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              {['24%', '22%', '13%', '15%', '14%', '12%'].map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead>
              <tr>
                <th className={cn(TH, 'text-left')}>Talhão</th>
                <th className={cn(TH, 'text-left')}>Variedade</th>
                <th className={cn(TH, 'text-right')}>Área ha</th>
                <th className={cn(TH, 'text-right')}>Sacas</th>
                <th className={cn(TH, 'text-right')}>sc / ha</th>
                <th className={cn(TH, 'text-right')}>Cargas</th>
              </tr>
            </thead>
            <tbody>
              {painel?.talhoes.map((t, i) => (
                <tr key={`${t.talhao}·${t.variedade ?? ''}`} className="border-t border-slate-100">
                  <td className="truncate px-2 py-0.5 text-[11px]" title={t.talhao}>{t.talhao}</td>
                  {/* ⚠ `—` PARA VARIEDADE NULA: a coluna existe sempre, porque some-la quando
                      nenhum talhão tem variedade faria a tabela mudar de forma entre safras. */}
                  <td className="truncate px-2 py-0.5 text-[11px] text-muted-foreground">
                    {t.variedade ?? '—'}
                  </td>
                  <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">{formatNum(t.area_ha, 2)}</td>
                  <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">{formatNum(t.sacas, 2)}</td>
                  {/* ⚠ O MELHOR EM NEGRITO SÓ QUANDO HÁ COM QUEM COMPARAR. Com um talhão só,
                      destacar a única linha sugeriria um ranking que não existe. */}
                  <td className={cn('px-2 py-0.5 text-right text-[11px] tabular-nums',
                    i === 0 && (painel?.talhoes.length ?? 0) > 1 && 'font-bold text-success')}>
                    {formatNum(t.sacas_ha, 2)}
                  </td>
                  <td className="px-2 py-0.5 text-right text-[11px] tabular-nums text-muted-foreground">
                    {t.cargas}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t bg-muted/40 px-2 py-1 text-[10px] leading-snug text-muted-foreground">
            Só a <strong>produtividade</strong> é real por talhão. O custo não aparece aqui porque
            o lançamento financeiro guarda safra e cultura, nunca o talhão — custo por talhão vem
            quando o lançamento marcar talhão.
          </p>
        </div>
      )}

      {/* ── COMPARATIVO ENTRE SAFRAS (fatia C) ── */}
      {comparadas.length > 0 && (
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0 overflow-hidden rounded-md border">
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                {['16%', '13%', '15%', '14%', '16%', '15%', '11%'].map((w, i) => <col key={i} style={{ width: w }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th className={cn(TH, 'text-left')}>Safra</th>
                  <th className={cn(TH, 'text-right')}>Área ha</th>
                  <th className={cn(TH, 'text-right')}>Sacas</th>
                  <th className={cn(TH, 'text-right')}>sc / ha</th>
                  <th className={cn(TH, 'text-right')}>Receita / ha</th>
                  <th className={cn(TH, 'text-right')}>Custeio direto</th>
                  <th className={cn(TH, 'text-right')}>% roça</th>
                </tr>
              </thead>
              <tbody>
                {comparadas.map(sf => {
                  const atual = sf.safra_id === safraId;
                  return (
                    <tr key={sf.safra_id}
                      className={cn('border-t border-slate-100', atual && 'bg-primary/[0.06]')}>
                      <td className="truncate px-2 py-0.5 text-[11px]">
                        {/* ⚠ A SAFRA ABERTA FICA MARCADA: sem isso o operador compara quatro linhas
                            sem saber qual delas é a que os cards acima estão descrevendo. */}
                        <span className={cn(atual && 'font-bold')}>{sf.codigo}</span>
                        {sf.receita_incompleta && (
                          /* ⚠ ÂMBAR, NUNCA VERMELHO. Vermelho aqui diria "prejuízo", e é venda que
                             falta lançar — o produtor não pode achar que perdeu dinheiro. */
                          <span className="ml-1 whitespace-nowrap text-[8px] text-amber-600">
                            venda parcial — falta lançar
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">{formatNum(sf.area_ha, 2)}</td>
                      {/* ⚠ SEM COLHEITA É "—", NÃO ZERO: a 26/27 tem 279 ha plantados e o grão no
                          chão; zero afirmaria fracasso sobre safra que nem terminou. */}
                      <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">
                        {colheu(sf) ? formatNum(sf.total_sacas, 2) : '—'}
                      </td>
                      <td className="px-2 py-0.5 text-right text-[11px] font-medium tabular-nums">
                        {colheu(sf) ? formatNum(sf.sacas_ha, 2) : '—'}
                      </td>
                      <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">
                        {sf.receita > 0 ? formatMoeda(sf.receita_ha) : '—'}
                      </td>
                      <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">
                        {sf.custeio_direto > 0 ? formatMoeda(sf.custeio_direto) : '—'}
                      </td>
                      <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">
                        {colheu(sf) ? `${formatNum(sf.pct_roca, 1)}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* ⚠ A RESSALVA DO CUSTEIO FICA ESCRITA: esta coluna é o DIRETO, sem o rateio
                administrativo. Quem subtrair receita menos custeio aqui acha um saldo diferente
                do que o DRE mostra, e tem de saber por quê antes de desconfiar de um dos dois. */}
            <p className="border-t bg-muted/40 px-2 py-1 text-[10px] leading-snug text-muted-foreground">
              <strong>Custeio direto</strong> é só o que está lançado na safra — sem o rateio
              administrativo, que entra no DRE por janela de datas. Não subtraia da receita aqui:
              o saldo do ciclo é o da tabela do topo.
            </p>
          </div>

          <BarrasCompactas
            titulo="Produtividade por safra"
            legenda="sacas por hectare, com grão de roça — quanto maior, melhor"
            barras={comparadas.map((sf): BarraCompacta => ({
              rotulo: sf.codigo.replace('-Lav', ''),
              valor: colheu(sf) ? sf.sacas_ha : null,
              texto: colheu(sf) ? formatNum(sf.sacas_ha, 0) : '—',
              nota: sf.receita_incompleta ? 'parcial' : undefined,
              cor: sf.safra_id === safraId ? 'bg-primary' : 'bg-primary/45',
            }))}
          />
        </div>
      )}

      {/* ── COMPOSIÇÃO POR QUALIDADE ──
          ⚠ A ROÇA É RECEITA *E* PERDA, e as duas coisas ao mesmo tempo (decisão do Gabriel). Ela
          é vendida a R$ 80 e entra no faturamento e na produtividade — escondê-la faria a conta
          não fechar. Mas é grão refugado, e o que se quer é reduzi-la safra a safra. Por isso
          aparece SEPARADA e nomeada "perda de qualidade", nunca fundida no total nem omitida. */}
      {(() => {
        const sel = comparadas.find(sf => sf.safra_id === safraId);
        if (!sel || !colheu(sel)) return null;
        const pctBom = sel.total_sacas > 0 ? 100 - sel.pct_roca : 0;
        const comColheita = comparadas.filter(colheu);
        return (
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0 overflow-hidden rounded-md border">
              <table className="w-full table-fixed border-collapse">
                <colgroup>
                  {['34%', '22%', '22%', '22%'].map((w, i) => <col key={i} style={{ width: w }} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th className={cn(TH, 'text-left')}>Composição da produção</th>
                    <th className={cn(TH, 'text-right')}>Sacas</th>
                    <th className={cn(TH, 'text-right')}>% do total</th>
                    <th className={cn(TH, 'text-right')}>sc / ha</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-slate-100">
                    <td className="px-2 py-0.5 text-[11px]">
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-success align-[-1px]" />
                      Grão bom
                    </td>
                    <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">{formatNum(sel.sacas_boas, 2)}</td>
                    <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">{formatNum(pctBom, 1)}%</td>
                    <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">
                      {formatNum(porHa(sel.sacas_boas, sel.area_ha), 2)}
                    </td>
                  </tr>
                  <tr className="border-t border-slate-100">
                    <td className="px-2 py-0.5 text-[11px]">
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#8b5e3c] align-[-1px]" />
                      Grão de roça <span className="text-[9px] text-muted-foreground">perda de qualidade</span>
                    </td>
                    <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">{formatNum(sel.sacas_roca, 2)}</td>
                    <td className="px-2 py-0.5 text-right text-[11px] font-medium tabular-nums">
                      {formatNum(sel.pct_roca, 1)}%
                    </td>
                    <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">
                      {formatNum(porHa(sel.sacas_roca, sel.area_ha), 2)}
                    </td>
                  </tr>
                  <tr className="border-t-2 border-slate-300">
                    <td className="px-2 py-0.5 text-[11px] font-bold">Total colhido</td>
                    <td className="px-2 py-0.5 text-right text-[11px] font-bold tabular-nums">
                      {formatNum(sel.total_sacas, 2)}
                    </td>
                    <td className="px-2 py-0.5 text-right text-[11px] font-bold tabular-nums">100,0%</td>
                    <td className="px-2 py-0.5 text-right text-[11px] font-bold tabular-nums">
                      {formatNum(sel.sacas_ha, 2)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="border-t bg-muted/40 px-2 py-1 text-[10px] leading-snug text-muted-foreground">
                O grão de roça <strong>é receita</strong> — a cooperativa o compra mais barato — e
                já está no faturamento e na produtividade acima. Aparece separado porque é
                <strong> perda de qualidade</strong>: o alvo é reduzi-lo safra a safra.
              </p>
            </div>

            <BarrasCompactas
              titulo="Roça por safra"
              legenda="% do total — quanto menor, melhor"
              barras={comColheita.map((sf): BarraCompacta => ({
                rotulo: sf.codigo.replace('-Lav', ''),
                valor: sf.pct_roca,
                texto: `${formatNum(sf.pct_roca, 1)}%`,
                cor: sf.safra_id === safraId ? 'bg-[#8b5e3c]' : 'bg-[#8b5e3c]/45',
              }))}
            />
          </div>
        );
      })()}

      {/* ── O QUE FICA FORA DO RESULTADO ──
          ⚠ ESTA LINHA EXISTE PARA NÃO MENTIR POR OMISSÃO. O operador que somar os lançamentos da
          safra à mão vai achar diferença; dizer antes o que ficou de fora, e por quê, é mais
          barato do que ele descobrir sozinho e desconfiar da tela inteira. */}
      <div className="space-y-1">
        {(painel?.fora_do_custeio ?? 0) !== 0 && (
          <p className="flex items-start gap-1.5 text-[10px] leading-snug text-muted-foreground">
            <Info className="mt-px h-3 w-3 shrink-0" />
            <span>
              <strong>{formatMoeda(painel?.fora_do_custeio ?? 0)}</strong> em lançamentos da safra
              que não compõem o DRE — não entram no custeio, e aparecem aqui para a soma manual
              fechar.
            </span>
          </p>
        )}
        {carregando && <p className="text-[10px] text-muted-foreground">Carregando…</p>}
      </div>
    </div>
  );
}
