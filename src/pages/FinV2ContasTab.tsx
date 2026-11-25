/**
 * Financeiro › Contas bancárias — CAD-CONTAS-BANCARIAS-01 (mock aprovado 20/10 12h53, vista "Lista").
 *   · colunas: Cód. · Nome da conta · Tipo · Banco · Agência · Conta · Fazenda · Gerente · Telefone · Início · Status · ✎
 *   · faixas por tipo ("Conta corrente · 5"), rodapé preso com "N contas · N ativas"
 *   · LIMPEZA-TELAS-01 C1 (Gabriel 16/11): sem a coluna "Saldo inicial" nem o total dela (sem a data, não diz de quando é; o saldo
 *     inicial segue no modal da conta) e a tabela 1 ponto menor
 *   · vazio "não inf." em cinza; caixa físico "não se aplica"; sem saldo/início em âmbar
 *   · barra: busca (conta, banco ou gerente) · Todas/Conta corrente/Investimento/Cartão · fazenda · Mostrar inativas · + Nova conta
 *   · estreitando, somem Telefone e Início, depois Gerente e Agência, depois Fazenda (`colunasEscondidas`, pela largura da lista)
 *   · clique na linha abre o modal (`ContaBancariaModal`); salvou, a lista relê SÓ a conta salva
 *   · CONTAS-OF-LINHA-01 (mock aprovado 23/11 18:10; admin e, desde OPENFINANCE-PRONTO-NJ-01, o gestor do cliente): selo "Open Finance · N bancos conectados" no título (abre as conexões)
 *     e a coluna FIXA "Open Finance" (132px) antes do Status — Conectado · Conectar · Link enviado · ⚠ Reconectar · — (`estadoNaLinha`);
 *     saíram os 3 botões soltos da barra (Conectar banco · Bancos conectados · Registrar webhook)
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Segmentado } from '@/components/ui/segmentado';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { cn } from '@/lib/utils';
import { ContaBancariaModal } from '@/components/financeiro-v2/ContaBancariaModal';
import { OpenFinanceDoAdmin, SeloOpenFinance, usePodeOpenFinance, usePodeConectarOpenFinance, type PedidoOpenFinance } from '@/components/financeiro-v2/OpenFinanceDoAdmin';
import { MOTIVO_SO_PROPRIETARIO } from '@/lib/openfinance/openfinanceTela';
import { useOpenFinanceDasContas } from '@/hooks/useOpenFinanceDasContas';
import { conexoesDoCliente } from '@/lib/openfinance/openfinanceTela';
import { bancoDaConta, estadoNaLinha, finaisDaConta, textoDoEstado, type EstadoNaLinha } from '@/lib/openfinance/openfinanceNaLinha';
import {
  celulaAgencia, celulaBanco, celulaConta, celulaGerente, celulaInicio, celulaTelefone, colunasEscondidas,
  faixaDaConta, faixasDaLista, filtrarContas, nomeDaConta, rodapeDaLista, SELO_TIPO,
  type BancoReferencia, type Celula, type ColunaOpcional, type ContaBancariaCadastro, type SegmentoDaLista,
} from '@/lib/financeiro/contasBancarias';

/** Mantido para quem já o importava: "Nome (Ag Conta-Dv)" quando há dados bancários. */
export function contaDisplayLabel(c: { nome_exibicao?: string | null; nome_conta: string; agencia?: string | null; numero_conta?: string | null; conta_digito?: string | null }): string {
  const nome = c.nome_exibicao || c.nome_conta;
  const parts: string[] = [];
  if (c.agencia) parts.push(c.agencia);
  if (c.numero_conta) parts.push(c.conta_digito ? `${c.numero_conta}-${c.conta_digito}` : c.numero_conta);
  return parts.length > 0 ? `${nome} (${parts.join(' ')})` : nome;
}

const SEGMENTOS: Array<{ valor: SegmentoDaLista; rotulo: string }> = [
  { valor: 'todas', rotulo: 'Todas' }, { valor: 'cc', rotulo: 'Conta corrente' }, { valor: 'inv', rotulo: 'Investimento' }, { valor: 'cartao', rotulo: 'Cartão' },
];
const TODAS_FAZENDAS = '__todas__';
const SELO_CLASSE: Record<'cc' | 'inv' | 'cartao', string> = {
  cc: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  inv: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200',
  cartao: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
};
const TH = 'sticky top-0 z-[2] h-[23px] whitespace-nowrap bg-primary px-1.5 text-left text-[9.5px] font-semibold text-primary-foreground';
const TD = 'h-[22px] whitespace-nowrap border-b border-border/60 px-1.5 text-[10px]';
const TF = 'sticky bottom-0 z-[2] h-[23px] whitespace-nowrap border-t bg-muted px-1.5 text-[10px] font-semibold';

function Cel({ c, className }: { c: Celula; className?: string }) {
  return <td title={c.texto} className={cn(TD, c.tom === 'vazio' && 'text-muted-foreground', c.tom === 'aviso' && 'font-semibold text-amber-700 dark:text-amber-400', className)}>{c.texto}</td>;
}

export function FinV2ContasTab() {
  const { clienteAtual } = useCliente();
  /* OPENFINANCE-PRONTO-NJ-01 (8): o Open Finance aparece ao admin AGROinBLUE E ao gestor do cliente */
  const podeOF = usePodeOpenFinance();
  /* OPENFINANCE-PRONTO-NJ-01 (8): o gestor VÊ a coluna; conectar e reconectar só o admin e o proprietário */
  const conectaOF = usePodeConectarOpenFinance();
  const { fazendas } = useFazenda();
  const clienteId = clienteAtual?.id ?? null;
  const [pedidoOF, setPedidoOF] = useState<PedidoOpenFinance | null>(null);
  const fecharPedidoOF = useCallback(() => setPedidoOF(null), []);
  const of = useOpenFinanceDasContas(clienteId, podeOF);
  const nConectados = of.dados && clienteId ? conexoesDoCliente(of.dados.eventos, clienteId).length : null;
  const [contas, setContas] = useState<ContaBancariaCadastro[]>([]);
  const [bancos, setBancos] = useState<BancoReferencia[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState('');
  const [segmento, setSegmento] = useState<SegmentoDaLista>('todas');
  const [fazendaFiltro, setFazendaFiltro] = useState(TODAS_FAZENDAS);
  const [mostrarInativas, setMostrarInativas] = useState(false);
  const [modal, setModal] = useState<{ conta: ContaBancariaCadastro | null } | null>(null);

  useEffect(() => {
    void supabase.from('bancos_referencia').select('codigo_banco, nome_banco, nome_curto').eq('ativo', true).order('ordem_exibicao')
      .then(({ data }) => setBancos((data as BancoReferencia[]) ?? []));
  }, []);

  const carregar = useCallback(async () => {
    if (!clienteId) return;
    setCarregando(true);
    const { data } = await supabase.from('financeiro_contas_bancarias').select('*').eq('cliente_id', clienteId).order('ordem_exibicao');
    setContas((data as unknown as ContaBancariaCadastro[]) ?? []);
    setCarregando(false);
  }, [clienteId]);
  useEffect(() => { void carregar(); }, [carregar]);

  /* salvou: relê SÓ a conta salva (e a de investimento cujo vínculo o modal mudou, que mora nela) */
  const releConta = useCallback(async (ids: readonly string[]) => {
    if (!clienteId || ids.length === 0) return;
    const { data } = await supabase.from('financeiro_contas_bancarias').select('*').eq('cliente_id', clienteId).in('id', [...new Set(ids)]);
    const novas = (data as unknown as ContaBancariaCadastro[]) ?? [];
    setContas(atual => {
      const porId = new Map(atual.map(c => [c.id, c]));
      for (const n of novas) porId.set(n.id, n);
      return [...porId.values()];
    });
  }, [clienteId]);

  const fazendasReais = useMemo(() => fazendas.filter(f => f.id !== '__global__'), [fazendas]);
  const filtradas = useMemo(() => filtrarContas(contas, {
    busca, segmento, fazendaId: fazendaFiltro === TODAS_FAZENDAS ? null : fazendaFiltro, mostrarInativas,
  }, bancos), [contas, busca, segmento, fazendaFiltro, mostrarInativas, bancos]);
  const faixas = useMemo(() => faixasDaLista(filtradas), [filtradas]);
  const rodape = useMemo(() => rodapeDaLista(filtradas), [filtradas]);
  const fazendaNome = (id: string | null) => fazendasReais.find(f => f.id === id)?.nome ?? '';

  /* as colunas que somem conforme a LARGURA DA LISTA */
  const caixaRef = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(1400);
  useLayoutEffect(() => {
    const el = caixaRef.current;
    if (!el) return;
    setLargura(el.clientWidth);
    const ro = new ResizeObserver(() => setLargura(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  /* a coluna Open Finance (só o admin) tem largura FIXA: as opcionais somem antes, como se a lista fosse 132px mais estreita */
  const LARGURA_OF = 132;
  const escondidas = colunasEscondidas(largura - (podeOF ? LARGURA_OF : 0));
  const mostra = (c: ColunaOpcional) => !escondidas.has(c);
  const nColunas = 12 - escondidas.size + (podeOF ? 1 : 0);
  const estadoDa = (c: ContaBancariaCadastro): EstadoNaLinha | null => (of.dados
    ? estadoNaLinha(c, { bancos, ...of.dados, agoraIso: new Date().toISOString() }) : null);
  const pedirConectar = (c: ContaBancariaCadastro) => setPedidoOF({ tipo: 'conectar',
    banco: bancoDaConta(c, bancos)?.nome_curto ?? (c.banco ?? 'banco'), contaNome: nomeDaConta(c), finais: finaisDaConta(c) });

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-1.5 px-3 pb-2.5 pt-2" data-testid="tela-contas-bancarias">
      <div className="flex shrink-0 items-baseline gap-2">
        <h2 className="whitespace-nowrap text-[13px] font-semibold text-foreground">Contas bancárias</h2>
        <span className="uma-linha-que-rola min-w-0 text-[11px] text-muted-foreground">
          {clienteAtual?.nome ? `${clienteAtual.nome} · ` : ''}{contas.length} {contas.length === 1 ? 'conta' : 'contas'}
        </span>
        <SeloOpenFinance n={nConectados} onAbrir={() => setPedidoOF({ tipo: 'lista' })} />
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar conta, banco ou gerente" className="h-6 w-[200px] text-[11px]" data-testid="busca-contas" />
        <Segmentado altura={24} valor={segmento} onEscolher={setSegmento} opcoes={SEGMENTOS} />
        <div className="w-[170px]">
          <SearchableSelect value={fazendaFiltro} onValueChange={setFazendaFiltro} allValue={TODAS_FAZENDAS} allLabel="Todas as fazendas"
            options={fazendasReais.map(f => ({ value: f.id, label: f.nome }))} placeholder="Todas as fazendas" dense triggerClassName="h-6 text-[11px]" />
        </div>
        <label className="flex items-center gap-1 whitespace-nowrap text-[10px] text-muted-foreground">
          <Checkbox checked={mostrarInativas} onCheckedChange={v => setMostrarInativas(v === true)} data-testid="mostrar-inativas" />Mostrar inativas
        </label>
        <Button size="sm" className="ml-auto h-6 px-2.5 text-[11px]" onClick={() => setModal({ conta: null })} data-testid="nova-conta">+ Nova conta</Button>
      </div>

      <div ref={caixaRef} className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card" data-testid="lista-contas">
        {/* `table-fixed`: as larguras não seguem o conteúdo — filtrar (só Investimento, busca) não mexe nas colunas */}
        <table className="h-full w-full table-fixed border-separate border-spacing-0">
          <colgroup>
            {/* o Nome (e o Gerente, quando aparece) ficam com a sobra: cortam com "…" e o nome inteiro no `title`; número, data e valor nunca */}
            <col style={{ width: 38 }} /><col /><col style={{ width: 50 }} /><col style={{ width: 100 }} />
            {mostra('agencia') && <col style={{ width: 80 }} />}<col style={{ width: 92 }} />
            {mostra('fazenda') && <col style={{ width: 120 }} />}{mostra('gerente') && <col />}
            {mostra('telefone') && <col style={{ width: 112 }} />}{mostra('inicio') && <col style={{ width: 84 }} />}
            {podeOF && <col style={{ width: LARGURA_OF }} />}<col style={{ width: 54 }} /><col style={{ width: 24 }} />
          </colgroup>
          <thead><tr>
            <th className={TH}>Cód.</th><th className={TH}>Nome da conta</th><th className={TH}>Tipo</th><th className={TH}>Banco</th>
            {mostra('agencia') && <th className={TH}>Agência</th>}<th className={TH}>Conta</th>
            {mostra('fazenda') && <th className={TH}>Fazenda</th>}{mostra('gerente') && <th className={TH}>Gerente</th>}
            {mostra('telefone') && <th className={TH}>Telefone</th>}{mostra('inicio') && <th className={TH}>Início</th>}
            {podeOF && <th className={TH}>Open Finance</th>}
            <th className={cn(TH, 'text-center')}>Status</th><th className={TH} aria-label="Editar" />
          </tr></thead>
          <tbody>
            {carregando && contas.length === 0 && <tr><td colSpan={nColunas} className={cn(TD, 'text-muted-foreground')}>Carregando…</td></tr>}
            {!carregando && filtradas.length === 0 && <tr><td colSpan={nColunas} className={cn(TD, 'text-muted-foreground')}>Nenhuma conta.</td></tr>}
            {faixas.map(f => (
              <FaixaLinhas key={f.tipo} rotulo={`${f.rotulo} · ${f.contas.length}`} n={nColunas}>
                {f.contas.map(c => {
                  const t = faixaDaConta(c);
                  return (
                    <tr key={c.id} onClick={() => setModal({ conta: c })} data-testid="linha-conta"
                      className={cn('cursor-pointer hover:[&>td]:bg-muted/50', !c.ativa && '[&>td]:text-muted-foreground')}>
                      <td className={cn(TD, 'tabular-nums text-muted-foreground')}>{c.codigo_conta ?? ''}</td>
                      <td className={cn(TD, 'max-w-0 truncate font-semibold')} title={nomeDaConta(c)}>{nomeDaConta(c)}</td>
                      <td className={TD}><span className={cn('inline-block rounded px-1.5 text-[9.5px] font-bold leading-[15px]', SELO_CLASSE[t])}>{SELO_TIPO[t]}</span></td>
                      <Cel c={celulaBanco(c, bancos)} className="max-w-0 truncate" />
                      {mostra('agencia') && <Cel c={celulaAgencia(c)} className="tabular-nums" />}
                      <Cel c={celulaConta(c)} className="tabular-nums" />
                      {mostra('fazenda') && <td className={cn(TD, 'max-w-0 truncate')} title={fazendaNome(c.fazenda_id)}>{fazendaNome(c.fazenda_id)}</td>}
                      {mostra('gerente') && <Cel c={celulaGerente(c)} className="max-w-0 truncate" />}
                      {mostra('telefone') && <Cel c={celulaTelefone(c)} className="tabular-nums" />}
                      {mostra('inicio') && <Cel c={celulaInicio(c)} className="tabular-nums" />}
                      {podeOF && <CelulaOpenFinance estado={estadoDa(c)} erro={of.erro} conecta={conectaOF} onConectar={() => pedirConectar(c)}
                        onReconectar={(itemId) => setPedidoOF({ tipo: 'reconectar', itemId })} />}
                      <td className={cn(TD, 'text-center')}>
                        <span className={cn('inline-block rounded-full px-1.5 text-[9.5px] font-semibold leading-[15px]',
                          c.ativa ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>
                          {c.ativa ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>
                      <td className={cn(TD, 'text-[11px] text-muted-foreground')} aria-label="Editar">✎</td>
                    </tr>
                  );
                })}
              </FaixaLinhas>
            ))}
            {/* a sobra do quadro fica aqui: o total desce ao pé da tela (preso quando a lista rola) */}
            <tr aria-hidden="true" className="h-full"><td colSpan={nColunas} className="p-0" /></tr>
          </tbody>
          <tfoot><tr data-testid="rodape-contas">
            <td colSpan={nColunas} className={TF}>{rodape.texto}</td>
          </tr></tfoot>
        </table>
      </div>

      {modal && clienteId && (
        <ContaBancariaModal aberto onFechar={() => setModal(null)} clienteId={clienteId} clienteNome={clienteAtual?.nome}
          conta={modal.conta} contas={contas} bancos={bancos} fazendas={fazendasReais}
          onSalvo={(ids) => { void releConta(ids); }} />
      )}
      <OpenFinanceDoAdmin clienteId={clienteId} pedido={pedidoOF} onFechar={fecharPedidoOF} onMudou={of.recarregar} />
    </div>
  );
}

/* a célula da coluna Open Finance: os botões param o clique (a linha abre o Editar conta) */
function CelulaOpenFinance({ estado, erro, conecta, onConectar, onReconectar }: {
  estado: EstadoNaLinha | null; erro: boolean; conecta: boolean; onConectar: () => void; onReconectar: (itemId: string) => void;
}) {
  if (erro) return <td className={cn(TD, 'text-muted-foreground')} title="Não consegui ler o Open Finance deste cliente agora" data-testid="of-linha">—</td>;
  if (!estado) return <td className={TD} data-testid="of-linha" />;
  const { texto, titulo } = textoDoEstado(estado);
  const parar = (e: { stopPropagation: () => void }) => e.stopPropagation();
  if (estado.tipo === 'conectar') return (
    <td className={TD} data-testid="of-linha" data-estado="conectar">
      <button type="button" title={conecta ? titulo : MOTIVO_SO_PROPRIETARIO} disabled={!conecta} onClick={(e) => { parar(e); onConectar(); }} data-testid="of-conectar"
        className="h-[16px] rounded-full disabled:cursor-not-allowed disabled:opacity-50 border border-blue-200 bg-blue-50 px-2 text-[10px] leading-[14px] text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">{texto}</button>
    </td>);
  if (estado.tipo === 'reconectar') return (
    <td className={TD} data-testid="of-linha" data-estado="reconectar">
      <button type="button" title={conecta ? titulo : MOTIVO_SO_PROPRIETARIO} disabled={!conecta} onClick={(e) => { parar(e); onReconectar(estado.itemId); }} data-testid="of-reconectar"
        className="disabled:cursor-not-allowed disabled:opacity-50 text-[10px] font-semibold text-amber-700 hover:underline dark:text-amber-400">{texto}</button>
    </td>);
  return (
    <td title={titulo} data-testid="of-linha" data-estado={estado.tipo}
      className={cn(TD, 'tabular-nums', estado.tipo === 'conectado' ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}>{texto}</td>);
}

function FaixaLinhas({ rotulo, n, children }: { rotulo: string; n: number; children: ReactNode }) {
  return (<>
    <tr data-testid="faixa-contas"><td colSpan={n} className={cn(TD, 'bg-primary/10 font-semibold text-primary')}>{rotulo}</td></tr>
    {children}
  </>);
}
