/**
 * APROVAR-PAGAMENTOS-V3 (mock aprovado, Gabriel 24/11 11:41; D1 11:50) — a tela PRÓPRIA do aprovador (Proprietário/Gestor); a CPR continua
 * sendo a lista completa. Uma ida ao banco (`useAprovacaoV3` → `fn_aprovacao_lista_v3`):
 *   · ABAS Para aprovar (N + o total em vermelho) · Aprovados · Recusados · Pagos; o filtro Todos · Prontos · Faltando (o mesmo da coluna);
 *   · a tabela por DIA (a linha discreta do dia com o total): ☐ · Venc. · Fornecedor · Descrição (+ selo P/R/parcela) · Valor (negrito
 *     vermelho) · Forma (sigla + ponto) · NF (nº ou "—") · Pronto (UM texto: "pronto ✓" ou o que falta) · Conta;
 *   · a BARRA de baixo SEMPRE à vista, com "Aprovar N" e "Recusar…" (o `BarraDaAprovacao` de sempre: prévia + gravação);
 *   · clicar na linha abre o painel (o documento ao lado, `PainelDaAprovacaoV3`); no celular (< 900 px) a lista vira CARTÕES e o painel
 *     abre em tela cheia.
 * Aprovar mesmo faltando algo pode: o aviso fica na coluna Pronto. Quem lançou não aprova (a caixa não se marca; o banco confere de novo).
 * DÉBITO AUTOMÁTICO (Gabriel 24/11 17:40): vai para Aprovados como "aprovado · DA" (a sigla DA em destaque); variou > 20% do último
 * pagamento ao fornecedor = selo âmbar "+35%" com "mês passado R$ X" (só aviso).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import { Checkbox } from '@/components/ui/checkbox';
import { Segmentado } from '@/components/ui/segmentado';
import { TextoReservado, reservaDeNumero } from '@/components/ui/regua-tabela';
import { BarraDaAprovacao, LARGURA_DOS_CARTOES } from '@/components/financeiro-v2/ListaDaAprovacao';
import { PainelDaAprovacaoV3 } from '@/components/financeiro-v2/aprovar/PainelDaAprovacaoV3';
import { useAprovacaoV3 } from '@/hooks/useAprovacaoV3';
import { useAlturaAteOFim } from '@/hooks/useAlturaAteOFim';
import { useLarguraDaJanela } from '@/hooks/useLarguraDaJanela';
import { useParcelasDosLancamentos } from '@/hooks/useParcelasDosLancamentos';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import {
  ABAS_V3, ROTULO_DA_ABA_V3, contarAbas, contarFiltro, ddmm, estaPronto, filtrarV3, numeroDaNf, periodoDoMes, porDiaV3, saida, siglaDaForma,
  textoDoPronto, variacaoDoDa, type AbaV3, type FiltroV3, type LinhaV3, type VariacaoDoDa,
} from '@/lib/financeiro/aprovacaoV3';
import { nomeEParcela, type ParcelaDoContrato } from '@/lib/financiamentos/nomeDaParcela';
import { cn } from '@/lib/utils';

/** as larguras fixas (px) das colunas curtas; Fornecedor e Descrição dividem o resto (o mock: tudo cabe a partir de 1126) */
const COLUNAS_V3 = { sel: 28, venc: 46, valor: 96, forma: 58, nf: 74, pronto: 150, conta: 132 };
const SEM_PARCELAS: ReadonlyMap<string, ParcelaDoContrato> = new Map();

function Selos({ l, parcela, variacao }: { l: LinhaV3; parcela: ParcelaDoContrato | undefined; variacao: VariacaoDoDa | null }) {
  const selo = 'ml-1 inline-block shrink-0 rounded-[3px] border px-[3px] text-[8.5px] font-bold leading-[12px]';
  return (
    <>
      {l.financiamentoId && <span className={cn(selo, 'border-emerald-300 text-emerald-700')} title="Parcela de financiamento">P</span>}
      {l.recorrenciaId && <span className={cn(selo, 'border-violet-300 text-violet-700')} title="Recorrência">R</span>}
      {parcela && <span className={cn(selo, 'border-border text-muted-foreground')} title={`Parcela ${parcela.numero} de ${parcela.total}`}>{parcela.numero}/{parcela.total}</span>}
      {variacao && <span className={cn(selo, 'border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40')} title={variacao.titulo} data-testid="v3-variacao">{variacao.selo}</span>}
    </>
  );
}

function Forma({ forma, compacta }: { forma: string | null; compacta?: boolean }) {
  const f = siglaDaForma(forma);
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap', compacta ? 'text-[10px]' : 'text-[10.5px]')} title={f.nome}>
      {f.sigla !== '—' && <span className={cn('shrink-0 rounded-full', f.sigla === 'DA' ? 'h-2 w-2' : 'h-1.5 w-1.5')} style={{ background: f.cor }} />}
      <span className={cn(f.sigla === 'DA' && 'font-bold text-violet-700 dark:text-violet-300')}>{f.sigla}</span>
    </span>
  );
}

function Pronto({ codigo, da }: { codigo: string | null; da: boolean }) {
  if (da && estaPronto(codigo)) {
    return (
      <span className="inline-block whitespace-nowrap rounded-full bg-violet-50 px-1.5 text-[10px] leading-[15px] text-violet-700 dark:bg-violet-950/40"
        title="Débito automático: já autorizado no banco (aprovado pela regra)" data-testid="v3-pronto">aprovado · DA</span>
    );
  }
  const t = textoDoPronto(codigo);
  if (t === '—') return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn('inline-block whitespace-nowrap rounded-full px-1.5 text-[10px] leading-[15px]',
      estaPronto(codigo) ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40' : 'bg-red-50 text-red-700 dark:bg-red-950/40')}
      data-testid="v3-pronto">{t}</span>
  );
}

function DiaDaTabela({ rotulo, total, children }: { rotulo: string; total: number; children: ReactNode }) {
  return (
    <>
      <tr className="border-b border-border [&>td]:h-[20px] [&>td]:px-1.5 [&>td]:pt-1 [&>td]:text-[10px] [&>td]:font-medium" data-testid="v3-dia">
        <td />
        <td colSpan={3} className="whitespace-nowrap text-muted-foreground">{rotulo}</td>
        <td className="whitespace-nowrap text-right font-normal tabular-nums text-red-600">{saida(total)}</td>
        <td colSpan={4} />
      </tr>
      {children}
    </>
  );
}

export function AprovarPagamentosV3() {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? null;
  const largura = useLarguraDaJanela();
  const celular = largura < LARGURA_DOS_CARTOES;
  const [mes, setMes] = useState(() => { const h = hojeLocal(); return { ano: Number(h.slice(0, 4)), mes0: Number(h.slice(5, 7)) - 1 }; });
  const periodo = periodoDoMes(mes.ano, mes.mes0);
  const v3 = useAprovacaoV3(clienteId, periodo.de, periodo.ate);
  const parcelas = useParcelasDosLancamentos(clienteId).data ?? SEM_PARCELAS;
  const [aba, setAba] = useState<AbaV3>('aprovar');
  const [filtro, setFiltro] = useState<FiltroV3>('todos');
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(new Set());
  const [aberta, setAberta] = useState<number | null>(null);
  const quadro = useAlturaAteOFim({ folga: celular ? 0 : 8, minimo: 260 });

  const todas = useMemo(() => v3.linhas ?? [], [v3.linhas]);
  const abas = useMemo(() => contarAbas(todas), [todas]);
  const daAba = useMemo(() => todas.filter((l) => l.aba === aba), [todas, aba]);
  const nFiltro = useMemo(() => contarFiltro(daAba), [daAba]);
  const visiveis = useMemo(() => filtrarV3(todas, aba, filtro), [todas, aba, filtro]);
  const dias = useMemo(() => porDiaV3(visiveis), [visiveis]);
  const indiceDe = useMemo(() => new Map(visiveis.map((l, i) => [l.id, i])), [visiveis]);
  const selecionadas = visiveis.filter((l) => marcadas.has(l.id) && l.possoDecidir);
  const marcaveis = aba === 'aprovar' ? visiveis.filter((l) => l.possoDecidir) : [];
  const todasMarcadas = marcaveis.length > 0 && marcaveis.every((l) => marcadas.has(l.id));

  const marcar = (id: string, v: boolean) => setMarcadas((m) => { const n = new Set(m); if (v) n.add(id); else n.delete(id); return n; });
  const trocarAba = (a: AbaV3) => { setAba(a); setMarcadas(new Set()); setAberta(null); };
  const andarMes = (d: number) => { setMes((m) => { const x = new Date(m.ano, m.mes0 + d, 1); return { ano: x.getFullYear(), mes0: x.getMonth() }; }); setMarcadas(new Set()); setAberta(null); };
  const feito = () => { setMarcadas(new Set()); void v3.recarregar(); };

  const navMes = (
    <div className="flex shrink-0 items-center gap-1" data-testid="v3-mes">
      <button type="button" className="h-6 w-6 rounded border bg-card text-[13px]" onClick={() => andarMes(-1)} aria-label="Mês anterior">‹</button>
      <span className="w-[112px] text-center text-[11.5px] font-medium">{periodo.rotulo}</span>
      <button type="button" className="h-6 w-6 rounded border bg-card text-[13px]" onClick={() => andarMes(1)} aria-label="Mês seguinte">›</button>
    </div>
  );

  if (!clienteId) return <div className="p-4 text-[12px] text-muted-foreground">Escolha um cliente.</div>;
  if (v3.ligado === false) {
    return (
      <div className="p-4 text-[12px]" data-testid="v3-desligado">
        <h1 className="text-[15px] font-semibold">Aprovar pagamentos</h1>
        <p className="mt-2 text-muted-foreground">A aprovação de pagamentos não está ligada para este cliente.</p>
      </div>
    );
  }

  const opcoesAba = ABAS_V3.map((a) => ({
    valor: a,
    rotulo: (
      <span className="whitespace-nowrap">
        {ROTULO_DA_ABA_V3[a]} <b className="tabular-nums">{abas[a].n}</b>
        {a === 'aprovar' && !celular && abas.aprovar.n > 0 && <span className={cn('ml-1 tabular-nums', aba === 'aprovar' ? 'text-red-200' : 'text-red-600')}>{saida(abas.aprovar.total)}</span>}
      </span>
    ),
  }));
  const opcoesFiltro: { valor: FiltroV3; rotulo: ReactNode }[] = [
    { valor: 'todos', rotulo: <span className="whitespace-nowrap">Todos <TextoReservado texto={String(nFiltro.todos)} reserva={reservaDeNumero(3)} alinhar="direita" className="font-bold" /></span> },
    { valor: 'prontos', rotulo: <span className="whitespace-nowrap">Prontos <TextoReservado texto={String(nFiltro.prontos)} reserva={reservaDeNumero(3)} alinhar="direita" className="font-bold" /></span> },
    { valor: 'faltando', rotulo: <span className="whitespace-nowrap">Faltando <TextoReservado texto={String(nFiltro.faltando)} reserva={reservaDeNumero(3)} alinhar="direita" className="font-bold" /></span> },
  ];
  const vazio = (
    <div className="p-4 text-[12px] text-muted-foreground" data-testid="v3-vazio">
      {v3.falhou ? 'Não consegui ler a lista agora. Tente de novo em instantes.'
        : v3.linhas === null ? 'Lendo…'
          : `${aba === 'aprovar' ? 'Nada para aprovar' : `Nada em "${ROTULO_DA_ABA_V3[aba]}"`} em ${periodo.rotulo}${filtro !== 'todos' ? ' com este filtro' : ''}.`}
    </div>
  );
  const legenda = celular ? undefined : (
    <span className="shrink-0 whitespace-nowrap text-[10.5px] text-muted-foreground" data-testid="v3-legenda">Bol boleto · Pix · TED · DA débito automático</span>
  );

  return (
    <div className="flex min-h-0 flex-col" data-testid="v3-tela">
      <div className={cn('flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1', celular ? 'px-2 pt-2' : 'px-1 pb-1')}>
        <h1 className="text-[15px] font-semibold">Aprovar pagamentos</h1>
        <span className="min-w-0 break-words text-[11px] text-muted-foreground">{clienteAtual?.nome ?? ''}</span>
        <span className="ml-auto" />
        {navMes}
      </div>
      <div className={cn('flex shrink-0 flex-wrap items-center gap-2 py-1.5', celular ? 'px-2' : 'px-1')}>
        <Segmentado valor={aba} onEscolher={trocarAba} opcoes={opcoesAba} fonte={celular ? 10.5 : 11} />
        <span className="ml-auto" />
        <Segmentado valor={filtro} onEscolher={(f) => { setFiltro(f); setMarcadas(new Set()); }} opcoes={opcoesFiltro} fonte={celular ? 10.5 : 11} />
      </div>
      {!celular && <p className="shrink-0 px-1 pb-1 text-[10.5px] text-muted-foreground">Marque e aprove em lote. Clique na linha para ver o documento ao lado.</p>}
      <div ref={quadro.ref} style={{ height: quadro.altura }} className={cn('flex min-h-0 flex-col overflow-hidden bg-card', celular ? 'border-t' : 'rounded-lg border')} data-testid="v3-quadro">
        {celular ? (
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2" data-testid="v3-cartoes">
            {visiveis.length === 0 ? vazio : dias.map((g) => (
              <div key={g.dia} className="space-y-1.5">
                <div className="flex items-baseline justify-between px-1 text-[10px] text-muted-foreground"><span>{g.rotulo}</span><span className="tabular-nums text-red-600">{saida(g.total)}</span></div>
                {g.linhas.map((l) => {
                  const parcela = parcelas.get(l.id);
                  const { nome } = nomeEParcela(l.descricao, parcela);
                  const variacao = variacaoDoDa(l, v3.ultimos.get(l.favorecidoId ?? ''));
                  return (
                    <div key={l.id} className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-2 rounded-lg border bg-card px-2.5 py-2" data-testid="v3-cartao">
                      {aba === 'aprovar'
                        ? <Checkbox checked={marcadas.has(l.id)} disabled={!l.possoDecidir} onCheckedChange={(v) => marcar(l.id, v === true)}
                            title={l.possoDecidir ? 'Selecionar' : 'Quem lançou não aprova'} aria-label={`Selecionar ${l.fornecedor}`} />
                        : <span />}
                      <button type="button" className="min-w-0 text-left" onClick={() => setAberta(indiceDe.get(l.id) ?? null)}>
                        <span className="block break-words text-[12.5px] font-semibold leading-[15px]">{l.fornecedor}</span>
                        <span className="block break-words text-[10.5px] leading-[14px] text-muted-foreground">
                          {nome || '—'}{parcela ? ` ${parcela.numero}/${parcela.total}` : ''} · {ddmm(l.vencimento)} · {siglaDaForma(l.forma).sigla}
                          {l.nf ? ` · NF ${numeroDaNf(l.nf)}` : ''}
                          {!estaPronto(l.pronto) && textoDoPronto(l.pronto) !== '—' && <b className="font-semibold text-red-700"> · {textoDoPronto(l.pronto)}</b>}
                          {l.daPelaRegra && estaPronto(l.pronto) && <b className="font-semibold text-violet-700"> · aprovado · DA</b>}
                          {variacao && <b className="font-semibold text-amber-700" title={variacao.titulo} data-testid="v3-variacao"> · {variacao.selo} · {variacao.texto}</b>}
                        </span>
                      </button>
                      <span className="text-right text-[12.5px] font-bold tabular-nums text-red-600">{saida(l.valor)}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto" data-testid="v3-rolagem">
            <table className="w-full table-fixed border-collapse" data-dia-mes="" data-testid="v3-tabela">
              <colgroup>
                <col style={{ width: COLUNAS_V3.sel }} /><col style={{ width: COLUNAS_V3.venc }} /><col /><col />
                <col style={{ width: COLUNAS_V3.valor }} /><col style={{ width: COLUNAS_V3.forma }} /><col style={{ width: COLUNAS_V3.nf }} />
                <col style={{ width: COLUNAS_V3.pronto }} /><col style={{ width: COLUNAS_V3.conta }} />
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr className="bg-primary text-left text-[10.5px] text-primary-foreground [&>th]:h-[26px] [&>th]:whitespace-nowrap [&>th]:px-1.5 [&>th]:font-medium">
                  <th>{aba === 'aprovar' && marcaveis.length > 0 && (
                    <Checkbox checked={todasMarcadas} onCheckedChange={(v) => setMarcadas(v === true ? new Set(marcaveis.map((l) => l.id)) : new Set())}
                      aria-label="Selecionar todos" className="border-primary-foreground" />)}</th>
                  <th>Venc.</th><th>Fornecedor</th><th>Descrição</th><th className="text-right">Valor</th><th>Forma</th><th>NF</th><th>Pronto</th><th>Conta</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.length === 0 && <tr><td colSpan={9}>{vazio}</td></tr>}
                {dias.map((g) => (
                  <DiaDaTabela key={g.dia} rotulo={g.rotulo} total={g.total}>
                    {g.linhas.map((l) => {
                      const parcela = parcelas.get(l.id);
                      const { nome } = nomeEParcela(l.descricao, parcela);
                      const sel = marcadas.has(l.id);
                      return (
                        <tr key={l.id} className={cn('cursor-pointer border-b border-border/60 hover:bg-muted/40 [&>td]:h-[24px] [&>td]:px-1.5 [&>td]:text-[11px]', sel && 'bg-sky-50 dark:bg-sky-950/30')}
                          onClick={() => setAberta(indiceDe.get(l.id) ?? null)} data-testid="v3-linha">
                          <td onClick={(e) => e.stopPropagation()}>
                            {aba === 'aprovar' && (
                              <Checkbox checked={sel} disabled={!l.possoDecidir} onCheckedChange={(v) => marcar(l.id, v === true)}
                                title={l.possoDecidir ? 'Selecionar' : 'Quem lançou não aprova'} aria-label={`Selecionar ${l.fornecedor}`} />)}
                          </td>
                          <td className="whitespace-nowrap !text-[10px] tabular-nums text-muted-foreground">{ddmm(l.vencimento)}</td>
                          <td className="truncate" title={l.fornecedor}>{l.fornecedor}</td>
                          <td title={l.descricao}><span className="flex min-w-0 items-center"><span className="min-w-0 truncate">{nome || '—'}</span><Selos l={l} parcela={parcela} variacao={variacaoDoDa(l, v3.ultimos.get(l.favorecidoId ?? ''))} /></span></td>
                          <td className="whitespace-nowrap text-right font-semibold tabular-nums text-red-600">{saida(l.valor)}</td>
                          <td><Forma forma={l.forma} /></td>
                          <td className="whitespace-nowrap tabular-nums">{numeroDaNf(l.nf)}</td>
                          <td><Pronto codigo={l.pronto} da={l.daPelaRegra} /></td>
                          <td className="truncate text-muted-foreground" title={l.conta ?? undefined}>{l.conta ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </DiaDaTabela>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <BarraDaAprovacao clienteId={clienteId} selecionadas={selecionadas} onFeito={feito} legenda={legenda}
          className={celular ? 'h-[52px]' : 'h-[40px]'} />
      </div>
      {aberta !== null && (
        <PainelDaAprovacaoV3 clienteId={clienteId} linhas={visiveis} indice={aberta} onIndice={setAberta} nomes={v3.nomes} parcelas={parcelas} ultimos={v3.ultimos}
          celular={celular} onFechar={() => setAberta(null)} onDecidido={() => void v3.recarregar()} />
      )}
    </div>
  );
}

