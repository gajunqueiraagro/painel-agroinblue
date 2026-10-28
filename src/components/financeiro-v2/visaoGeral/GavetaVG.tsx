/**
 * FIN-VISAO-GERAL-01 PR 5 (SPEC §5, §7; mock v8 `drawer`) — a GAVETA DE LANÇAMENTOS, na lateral direita do modal de análise.
 *   ESTRUTURA FIXA (nada muda de altura ou posição ao trocar nó, mês, contas ou nível; a lista rola por dentro):
 *   caminho clicável + contexto + atalhos dos irmãos (2 linhas) → indicadores (lançamentos · total · valor médio) → resumo (4 linhas:
 *   por favorecido no subcentro, maiores filhos acima) → tabela (rola) → total (fixo) → rodapé: a linha do AVISO (o que a lista não
 *   reproduz; lugar reservado, vazia quando não há diferença) e "Ver na lista de Lançamentos ›".
 *   · Nível com filhos: lista os filhos (clique desce). Subcentro: os lançamentos (P148: a ordem da lista do Financeiro — competência ·
 *     vencimento · pagamento · descrição · favorecido · conta · valor · status; o status no chip da casa — o da lista de Lançamentos; "—" no pagamento do não pago) e, no
 *     topo, "Pagos" e "Em aberto" quando há não pagos (do banco: total = pago + aberto).
 *   · P103 — LARGURA: cobre o gráfico e metade da tabela da esquerda (≈ 77,5% do modal), nunca menos de 960px; abaixo disso, a janela
 *     inteira menos 16px (a largura do modal). A mesma em todo nível: nada muda de lugar ao descer.
 *   · Clique num lançamento: abre o modal padrão do financeiro SEMPRE pelo `lancamento_id` (a parte 2+ tem a chave "id#2").
 *   · A TELA NUNCA SOMA: tudo vem pronto da `fn_vg_gaveta`. Cores do Gabriel: o valor na cor do lado (saída vermelha, entrada azul),
 *     nada preto; datas dd/mm/aaaa em fonte menor; texto longo numa linha com "…" e o title (só em célula de tabela).
 */
import { useLayoutEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { COR, brl, pct1, rotuloMes, type LadoVG } from '@/lib/financeiro/visaoGeral';
import { chaveCaminho, mesmoCaminho, type CaminhoVG } from '@/lib/financeiro/visaoGeralAnalise';
import { COLUNAS_ORDEM_GAVETA, dataLonga, ehLancamento, statusDaLinha, type ColunaOrdemGavetaVG, type GavetaVG, type LancamentoGavetaVG,
  type OrdemGavetaVG } from '@/lib/financeiro/visaoGeralGaveta';
import { STATUS_FILTRO_COR, STATUS_FILTRO_LABEL, STATUS_FILTRO_PILULA, STATUS_PILULA_BASE } from '@/lib/financeiro/statusFinanceiro';

const corDoLado = (lado: LadoVG) => (lado === 'saida' ? COR.saida : COR.entrada);
const n = (v: number) => v.toLocaleString('pt-BR');
const parteDe = (l: LancamentoGavetaVG) => (l.partes_total > 1 ? `Parte ${l.parte_ordem} de ${l.partes_total} · de ${brl(l.valor_lancamento)}` : '');
const prefixoParte = (l: LancamentoGavetaVG) => (l.partes_total > 1 ? `parte ${l.parte_ordem}/${l.partes_total} · ` : '');
/* as colunas (px; favorecido e descrição levam o resto) — as mesmas no cabeçalho, nas linhas e no total: uma tabela só. P103: as três
   datas (dd/mm/aaaa a 8,5px), o status (o chip mais largo, "Programado"), a conta (a transferência "Origem → Destino" corta com "…") e o
   valor ("R$ 99.999.999,99") */
const COLS_FOLHA = [68, 68, 68, null, null, 128, 100, 84];
/* a 1ª coluna tem a mesma largura nas duas (o "Total" do rodapé não anda ao descer até o subcentro) */
const COLS_FILHOS = [68, null, 50, 100];
const CAB_FOLHA = ['COMP.', 'VENC.', 'PGTO.', 'DESCRIÇÃO', 'FAVORECIDO', 'CONTA', 'VALOR', 'STATUS'];
const CAB_FILHOS = ['LANÇ.', 'ITEM · clique para descer', '%', 'VALOR'];
const celData = 'whitespace-nowrap px-1 text-[8.5px] tabular-nums text-[#3a4655]';

export function GavetaVG({ g, caminho, carregando, erro, contexto, avisos = [], onIr, onFechar, onAbrirLancamento, onMais, onVerNaLista,
  ordem = null, onOrdenar }: {
  /** o que o banco devolveu (fica o anterior até o novo chegar: nada pisca nem encolhe) */
  g: GavetaVG | null; caminho: CaminhoVG; carregando: boolean; erro: string | null;
  /** mês ou período · contas · fazenda · atividade (os mesmos da tela) */
  contexto: string;
  /** o que a lista de Lançamentos não reproduz (`avisosDaLista`): a primeira frase ocupa a linha; todas no title */
  avisos?: string[];
  onIr: (c: CaminhoVG) => void; onFechar: () => void; onAbrirLancamento: (l: LancamentoGavetaVG) => void;
  onMais: () => void; onVerNaLista: () => void;
  /** P119 — a ordem das linhas (nula = a de sempre) e o clique no cabeçalho da lista de lançamentos; quem ordena é o banco */
  ordem?: OrdemGavetaVG | null; onOrdenar?: (c: ColunaOrdemGavetaVG) => void;
}) {
  const lado = g?.lado ?? 'saida';
  const cor = corDoLado(lado);
  const folha = caminho.length === 4;
  const resumo = [...(g?.resumo.linhas ?? [])];
  while (resumo.length < 4) resumo.push({ rotulo: '', qtd: 0, valor: 0, pct: null });
  const janela = g ? (g.criterio === 'mes' ? rotuloMes(g.mes) : `${rotuloMes(g.janela.de.slice(0, 7))} – ${rotuloMes(g.janela.ate.slice(0, 7))}`) : '';
  const cols = folha ? COLS_FOLHA : COLS_FILHOS;
  const faltam = g ? g.total_linhas - g.linhas.length : 0;
  const comAberto = folha && !!g && (g.aberto ?? 0) !== 0;
  /* o caminho longo rola de lado: fica no FIM (o nó atual sempre à vista) — por isso o miolo dele é livre no gate de deslocamento;
     a faixa (22px) e o × não andam */
  const caminhoRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { const el = caminhoRef.current; if (el) el.scrollLeft = el.scrollWidth; }, [g?.caminho]);

  return (
    /* por cima do modal, de propósito (como no mock): `data-painel-por-cima` declara isso ao gate de cortes. Presa à borda direita da
       JANELA (abaixo de 1000px o modal rola de lado, a gaveta não). P103: ≈ o gráfico + metade da tabela da esquerda, nunca menos de
       960px; numa janela menor que isso, o modal inteiro (a janela − 16px) */
    <aside className="absolute bottom-0 right-0 top-9 z-[5] flex w-[min(100%,max(960px,calc(77.5%_-_2.6px)))] flex-col border-l border-[#cfd6df] bg-white text-[10px] shadow-[-10px_0_30px_rgba(0,0,0,0.18)]"
      aria-label="Lançamentos" data-testid="gaveta" data-desloca="" data-painel-por-cima="" data-carregando={carregando ? '' : undefined}>
      {/* CABEÇALHO — 104px: caminho · contexto · atalhos dos irmãos (2 linhas, rola por dentro) */}
      <div className="flex h-[104px] shrink-0 flex-col gap-1 border-b border-[#e3e7ec] px-2.5 pt-[7px]">
        <div className="flex h-[22px] shrink-0 items-center gap-1.5">
          <div ref={caminhoRef} className="uma-linha-que-rola flex min-w-0 flex-1 items-center gap-1" data-testid="gaveta-caminho" data-desloca-livre="">
            {(g?.caminho ?? []).map((p, j, arr) => j < arr.length - 1 ? (
              <button key={chaveCaminho(p.caminho)} type="button" onClick={() => onIr(p.caminho)} data-testid={`gaveta-caminho-${j}`}
                className="shrink-0 whitespace-nowrap text-[10px] text-[#1f5fa8] hover:underline">{p.rotulo} ›</button>
            ) : (
              <b key={chaveCaminho(p.caminho)} className="shrink-0 whitespace-nowrap text-[11.5px]" data-testid="gaveta-caminho-atual">{p.rotulo}</b>
            ))}
          </div>
          <button type="button" aria-label="Fechar lançamentos" onClick={onFechar} data-testid="gaveta-fechar"
            className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded border border-[#cfd6df] text-[#1b2430] hover:bg-muted/40"><X className="h-3.5 w-3.5" /></button>
        </div>
        <span className="uma-linha-que-rola h-[13px] shrink-0 text-[9.5px] text-muted-foreground" data-testid="gaveta-contexto">
          {janela}{janela ? ' · ' : ''}{contexto}
        </span>
        <div className="flex h-[46px] shrink-0 flex-wrap content-start gap-1 overflow-y-auto" data-testid="gaveta-irmaos" data-desloca-livre="">
          {caminho.length === 0 ? <span className="text-[9.5px] text-muted-foreground">nível mais alto do plano de contas</span>
            : (g?.irmaos ?? []).map((x, i) => (
              <button key={chaveCaminho(x.caminho)} type="button" onClick={() => onIr(x.caminho)} data-testid={`gaveta-irmao-${i}`} aria-pressed={mesmoCaminho(x.caminho, caminho)}
                className={cn('uma-linha-que-rola h-[19px] max-w-full shrink-0 whitespace-nowrap rounded-[3px] border px-1.5 text-[9.5px]',
                  mesmoCaminho(x.caminho, caminho) ? 'border-[#1f3f66] bg-[#e8eef7] font-semibold text-[#1b2430]' : 'border-[#dfe4ea] bg-white text-[#3a4655] hover:border-[#1f5fa8]')}>
                {x.rotulo}
              </button>
            ))}
        </div>
      </div>

      {/* INDICADORES — 46px. P103: no subcentro com não pagos, "Pagos" e "Em aberto" (do banco); o lugar deles é sempre reservado */}
      <div className="grid h-[46px] shrink-0 grid-cols-[80px_repeat(4,minmax(0,1fr))] gap-2 border-b border-[#e3e7ec] px-2.5 py-1.5">
        <Kpi rotulo="LANÇAMENTOS" testid="gaveta-qtd" cor={COR.muted}>{g ? n(g.qtd) : '—'}</Kpi>
        <Kpi rotulo="TOTAL" testid="gaveta-total" cor={cor}>{g ? brl(g.total) : '—'}</Kpi>
        <Kpi rotulo="VALOR MÉDIO" testid="gaveta-medio" cor={cor}>{g ? brl(g.medio) : '—'}</Kpi>
        {comAberto ? <>
          <Kpi rotulo="PAGOS" testid="gaveta-pago" cor={cor}>{brl(g!.pago ?? 0)}</Kpi>
          <Kpi rotulo="EM ABERTO" testid="gaveta-aberto" cor={COR.previsto}>{brl(g!.aberto ?? 0)}</Kpi>
        </> : <><span /><span /></>}
      </div>

      {/* RESUMO — 96px: 4 linhas (por favorecido no subcentro; maiores itens acima) */}
      <div className="h-[96px] shrink-0 border-b border-[#e3e7ec] px-2.5 py-[5px]" data-testid="gaveta-resumo" data-desloca-livre="">
        <div className="h-[14px] text-[8.5px] font-semibold tracking-[0.04em] text-muted-foreground">{folha ? 'POR FAVORECIDO' : 'MAIORES ITENS'}</div>
        <table className="w-full table-fixed border-collapse">
          <colgroup><col /><col style={{ width: 50 }} /><col style={{ width: 104 }} /></colgroup>
          <tbody>
            {resumo.slice(0, 4).map((r, i) => (
              <tr key={i} className="h-[19px] text-[10px]">
                <td className="truncate" title={r.rotulo || undefined}>{r.rotulo}</td>
                <td className="whitespace-nowrap text-right tabular-nums text-muted-foreground">{!r.rotulo ? '' : folha ? `${r.qtd}×` : pct1(r.pct ?? null)}</td>
                <td className="whitespace-nowrap text-right tabular-nums" style={{ color: cor }}>{r.rotulo ? brl(r.valor) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* TABELA — cabeçalho preso, as linhas rolam por dentro */}
      <div className={cn('min-h-0 flex-1 overflow-y-auto', carregando && 'opacity-70')} data-testid="gaveta-lista">
        <table className="w-full table-fixed border-collapse">
          <colgroup>{cols.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}</colgroup>
          {/* as COLUNAS trocam de propósito entre a lista de filhos e a de lançamentos (SPEC §5): o cabeçalho é miolo livre; a caixa da
              tabela, o total e o rodapé não andam */}
          <thead className="sticky top-0 z-[1] bg-[#2f3d4f]" data-desloca-livre="">
            <tr className="h-[18px] bg-[#2f3d4f] text-[8.5px] font-semibold tracking-[0.03em] text-white">
              {folha ? CAB_FOLHA.map((r, i) => {
                /* P119 — toda coluna ordena (no BANCO, antes da página): clique = crescente, de novo = decrescente; a seta tem lugar
                   reservado (nada anda ao aparecer) e só aparece na coluna escolhida — na ordem de sempre, nenhuma */
                const col = COLUNAS_ORDEM_GAVETA[i];
                const sentido = ordem?.coluna === col ? ordem.sentido : null;
                return (
                  <th key={r} className="whitespace-nowrap px-1 font-semibold" aria-sort={sentido === 'asc' ? 'ascending' : sentido === 'desc' ? 'descending' : 'none'}>
                    <button type="button" onClick={() => onOrdenar?.(col)} data-testid={`gaveta-ordem-${col}`} title={`Ordenar por ${r.toLowerCase()}`}
                      className={cn('flex h-[18px] w-full items-center gap-[2px] font-semibold hover:underline', col === 'valor' ? 'justify-end' : 'justify-start')}>
                      <span>{r}</span>
                      <span className="inline-block h-[9px] w-[7px] shrink-0 text-center text-[7px] leading-[9px]" data-testid={`gaveta-seta-${col}`} aria-hidden>
                        {sentido === 'asc' ? '▲' : sentido === 'desc' ? '▼' : ''}
                      </span>
                    </button>
                  </th>
                );
              }) : CAB_FILHOS.map((r, i, a) => (
                <th key={r} className={cn('whitespace-nowrap px-1 font-semibold', i === a.length - 1 || i === 2 ? 'text-right' : 'text-left')}>{r}</th>
              ))}
            </tr>
          </thead>
          <tbody data-desloca-livre="">
            {erro ? <Vazio colunas={cols.length} testid="gaveta-erro" texto={`Não foi possível carregar: ${erro}`} cor={COR.neg} />
              : g && g.linhas.length === 0 ? <Vazio colunas={cols.length} testid="gaveta-vazio" texto={`Nenhum lançamento neste item em ${janela}.`} />
              : g?.linhas.map((l, i) => ehLancamento(l) ? (
                <tr key={l.chave} onClick={() => onAbrirLancamento(l)} data-testid={`gaveta-linha-${i}`} data-chave={l.chave}
                  className="h-[19px] cursor-pointer border-b border-[#eef1f5] text-[9.5px] hover:bg-[#e8eef7]">
                  <td className={celData} title="Competência">{dataLonga(l.competencia)}</td>
                  <td className={cn(celData, l.vencido && 'font-semibold')} style={l.vencido ? { color: COR.neg } : undefined}
                    title={l.vencido ? 'Vencido e não pago' : 'Vencimento'}>{dataLonga(l.vencimento)}</td>
                  <td className={celData} title={l.previsto ? 'Não pago' : 'Pagamento'} data-testid={`gaveta-pgto-${i}`}>{l.previsto ? '—' : dataLonga(l.pagamento)}</td>
                  {/* classificação dividida: a linha é só a PARTE deste nó — "parte 1/2" na descrição e "de R$ (o lançamento)" no title */}
                  <td className="truncate px-1 text-[#3a4655]" title={`${prefixoParte(l)}${l.descricao ?? ''}${l.partes_total > 1 ? ` (de ${brl(l.valor_lancamento)})` : ''}`}>
                    {l.partes_total > 1 && <span className="text-muted-foreground" data-testid={`gaveta-parte-${i}`}>{prefixoParte(l)}</span>}{l.descricao ?? ''}
                  </td>
                  <td className="truncate px-1 text-[#1b2430]" title={l.favorecido}>{l.favorecido}</td>
                  <td className="truncate px-1 text-muted-foreground" title={l.conta}>{l.conta}</td>
                  <td className="whitespace-nowrap px-1 text-right tabular-nums" style={{ color: cor }} title={parteDe(l) || undefined}>{brl(l.valor)}</td>
                  <td className="whitespace-nowrap px-1"><ChipStatus l={l} i={i} /></td>
                </tr>
              ) : (
                <tr key={chaveCaminho(l.caminho)} onClick={() => onIr(l.caminho)} data-testid={`gaveta-linha-${i}`}
                  className="h-[19px] cursor-pointer border-b border-[#eef1f5] text-[9.5px] hover:bg-[#e8eef7]">
                  <td className="whitespace-nowrap px-1 tabular-nums text-muted-foreground">{n(l.qtd)}</td>
                  <td className="truncate px-1 text-[#1b2430]" title={l.rotulo}>{l.rotulo} <span className="text-[#8d9cad]">›</span></td>
                  <td className="whitespace-nowrap px-1 text-right tabular-nums text-muted-foreground">{pct1(l.pct)}</td>
                  <td className="whitespace-nowrap px-1 text-right tabular-nums" style={{ color: cor }}>{brl(l.valor)}</td>
                </tr>
              ))}
            {faltam > 0 && !erro && (
              <tr><td colSpan={cols.length} className="px-1 py-1 text-center">
                <button type="button" onClick={onMais} disabled={carregando} data-testid="gaveta-mais"
                  className="h-[19px] rounded border border-[#cfd6df] bg-white px-2 text-[9.5px] text-[#1f5fa8] hover:border-[#1f5fa8] disabled:opacity-60">
                  Mais {n(Math.min(faltam, g!.por_pagina))} de {n(faltam)} ›
                </button>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* TOTAL — fixo embaixo (o do banco, o nó inteiro — todas as páginas) */}
      <table className="w-full shrink-0 table-fixed border-collapse border-t-2 border-[#1b2430]" data-testid="gaveta-total-fixo" data-desloca="">
        <colgroup>{cols.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}</colgroup>
        <tbody>
          <tr className="h-6 text-[10.5px] font-bold">
            <td className="whitespace-nowrap px-1 tabular-nums text-muted-foreground" data-testid="gaveta-rodape-qtd">{g ? (folha ? `${n(g.total_linhas)}` : n(g.qtd)) : ''}</td>
            <td className="px-1 text-[#1b2430]" colSpan={cols.length - (folha ? 4 : 3)}>Total</td>
            {/* o total termina na coluna VALOR e ocupa também a da esquerda (Conta, nos lançamentos): o do nó inteiro pode passar de
                R$ 99.999.999,99 (negrito, 10,5px). P148: nos lançamentos o Status vem depois do Valor — a última célula fica vazia */}
            <td className="whitespace-nowrap px-1 text-right tabular-nums" colSpan={2} style={{ color: cor }} data-testid="gaveta-rodape-total">{g ? brl(g.total) : ''}</td>
            {folha && <td />}
          </tr>
        </tbody>
      </table>

      {/* RODAPÉ — 14px do AVISO (sempre reservados: com ou sem frase, em qualquer nível, nada se desloca) + 28px: no subcentro, a lista
          de Lançamentos com os filtros equivalentes à vista. Total, aviso e rodapé são `data-desloca`: o gate de deslocamento os mede */}
      <div className="h-[14px] shrink-0 whitespace-nowrap border-t border-[#e3e7ec] px-2.5 pt-[2px] text-right text-[9px] leading-[11px] text-[#9a5b00]"
        data-testid="gaveta-aviso" data-desloca="" data-avisos={folha ? avisos.length : 0} title={folha && avisos.length ? avisos.join(' ') : undefined}>
        {folha ? avisos[0] ?? '' : ''}
      </div>
      <div className="flex h-7 shrink-0 items-center justify-end px-2.5" data-testid="gaveta-rodape" data-desloca="">
        {folha ? (
          <button type="button" onClick={onVerNaLista} data-testid="gaveta-ver-lista"
            title="Abre Lançamentos Financeiros com os filtros deste subcentro à vista na barra (subcentro, mês, contas, fazenda)"
            className="whitespace-nowrap text-[10px] font-semibold text-[#1f5fa8] hover:underline">Ver na lista de Lançamentos ›</button>
        ) : <span className="whitespace-nowrap text-[9.5px] text-muted-foreground">Clique num item para descer até os lançamentos</span>}
      </div>
    </aside>
  );
}

/** P103 — o status no chip da casa (as cores da lista de Lançamentos, `statusFinanceiro`): Realizado e Conciliado com caixa; Agendado,
    Programado e Previsto em texto colorido; Vencido em vermelho (o vermelho da data vencida da lista) */
function ChipStatus({ l, i }: { l: LancamentoGavetaVG; i: number }) {
  const k = statusDaLinha(l);
  const rotulo = k === 'vencido' ? 'Vencido' : STATUS_FILTRO_LABEL[k] ?? l.status;
  const cls = k === 'vencido' ? 'text-destructive border-transparent'
    : STATUS_FILTRO_PILULA[k] ?? `${STATUS_FILTRO_COR[k] ?? 'text-muted-foreground'} border-transparent`;
  return <span className={cn(STATUS_PILULA_BASE, cls)} data-testid={`gaveta-status-${i}`} data-status={k}>{rotulo}</span>;
}

function Kpi({ rotulo, testid, cor, children }: { rotulo: string; testid: string; cor: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col justify-center">
      <small className="whitespace-nowrap text-[8.5px] font-semibold tracking-[0.04em] text-muted-foreground">{rotulo}</small>
      <b className="whitespace-nowrap text-[13px] tabular-nums" style={{ color: cor }} data-testid={testid}>{children}</b>
    </div>
  );
}

function Vazio({ colunas, texto, testid, cor }: { colunas: number; texto: string; testid: string; cor?: string }) {
  return (
    <tr><td colSpan={colunas} className="h-[60px] px-2 text-center text-[10px] text-muted-foreground" style={cor ? { color: cor } : undefined} data-testid={testid}>{texto}</td></tr>
  );
}
