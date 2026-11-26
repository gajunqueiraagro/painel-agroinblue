/**
 * Financeiro › Contas bancárias — CAD-CONTAS-BANCARIAS-01 + CONTAS-BANCARIAS-LISTA-01 (mock aprovado 26/11, md5 7c4a8e62…).
 *   · colunas: Cód. · Nome da conta · Banco · Agência · Conta · Fazenda · Open Finance · Situação · ✎ (larguras FIXAS, `LARGURAS_DA_LISTA`);
 *     saiu a coluna Tipo com os selos grandes — o tipo é o GRUPO ("Conta corrente · 12") e o filtro do topo
 *   · Banco = o código (9 px cinza, largura fixa) + o nome; Agência e Conta em colunas próprias, número tabular; sem dado = "—"
 *   · Open Finance: "Conectar" como link pequeno; conectado = ponto verde + a hora da última leitura; cartão "em breve" cinza; sem OF "—"
 *   · Situação: selo pequeno — "Ativa" · "Inativa desde dd/mm/aaaa" (CONTA-INATIVAR-DATA-01)
 *   · régua: linha 20 px a 10,5 px, cabeçalho 22 px a 10 px, sem caixa alta, nada cortado (o Nome corta com "…" e o nome inteiro no title)
 *   · barra: busca (conta, banco, agência ou conta) · Todas/Conta corrente/Investimento/Cartão · fazenda · Mostrar inativas · Exportar ▾
 *     (Excel · PDF) · "+ Nova conta" no navy do sistema
 *   · título "15 ativas · 4 inativas" (o cadastro inteiro, `resumoDoCadastro`); rodapé FIXO "19 contas · 12 conta corrente · 4 investimento ·
 *     3 cartão" (com filtro, "mostrando N de 19 · …", `rodapeDosTipos`)
 *   · estreitando, somem a Fazenda e depois a Agência (`colunasDaListaEscondidas`, pela largura da lista)
 *   · clique na linha abre o modal (`ContaBancariaModal`); salvou, a lista relê SÓ a conta salva
 *   · CONTAS-OF-LINHA-01: o selo "Open Finance · N bancos conectados" no título (abre as conexões); a coluna só para quem vê o OF
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
import { ContasExportMenu } from '@/components/financeiro-v2/ContasExportMenu';
import { OpenFinanceDoAdmin, SeloOpenFinance, usePodeOpenFinance, usePodeConectarOpenFinance, type PedidoOpenFinance } from '@/components/financeiro-v2/OpenFinanceDoAdmin';
import { MOTIVO_SO_PROPRIETARIO } from '@/lib/openfinance/openfinanceTela';
import { useOpenFinanceDasContas } from '@/hooks/useOpenFinanceDasContas';
import { conexoesDoCliente } from '@/lib/openfinance/openfinanceTela';
import { bancoDaConta, estadoNaLinha, finaisDaConta, textoDoEstado, type EstadoNaLinha } from '@/lib/openfinance/openfinanceNaLinha';
import {
  agenciaNaLista, bancoNaLista, colunasDaListaEscondidas, contaNaLista, faixasDaLista, filtrarContas, LARGURAS_DA_LISTA, nomeDaConta,
  resumoDoCadastro, rodapeDosTipos, situacaoNaLista,
  type BancoReferencia, type ContaBancariaCadastro, type SegmentoDaLista,
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
/* a régua do mock: cabeçalho 22 px a 10 px, linha 20 px a 10,5 px, sem caixa alta */
const TH = 'sticky top-0 z-[2] h-[22px] whitespace-nowrap bg-primary px-1.5 text-left text-[10px] font-semibold text-primary-foreground';
const TD = 'h-[20px] whitespace-nowrap border-b border-border/60 px-1.5 text-[10.5px]';
const TF = 'sticky bottom-0 z-[2] h-[23px] whitespace-nowrap border-t bg-muted px-1.5 text-[10.5px] font-semibold';
const CINZA = 'text-[#8b96aa]';

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
  const rodape = useMemo(() => rodapeDosTipos(filtradas, contas), [filtradas, contas]);
  const resumo = useMemo(() => resumoDoCadastro(contas), [contas]);
  const fazendaNome = useCallback((id: string | null) => fazendasReais.find(f => f.id === id)?.nome ?? '', [fazendasReais]);

  /* as colunas que somem conforme a LARGURA DA LISTA (o Nome nunca abaixo de 160 px) */
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
  const escondidas = colunasDaListaEscondidas(largura, podeOF);
  const mostraFazenda = !escondidas.has('fazenda');
  const mostraAgencia = !escondidas.has('agencia');
  /* no celular (~750) a coluna Open Finance sai (o selo do título segue abrindo as conexões) */
  const mostraOF = podeOF && !escondidas.has('openFinance');
  /* Cód. · Nome · Banco · Conta · Situação · ✎ sempre; Agência, Fazenda e Open Finance quando aparecem */
  const nColunas = 6 + (mostraAgencia ? 1 : 0) + (mostraFazenda ? 1 : 0) + (mostraOF ? 1 : 0);
  const L = LARGURAS_DA_LISTA;
  const estadoDa = (c: ContaBancariaCadastro): EstadoNaLinha | null => (of.dados
    ? estadoNaLinha(c, { bancos, ...of.dados, agoraIso: new Date().toISOString() }) : null);
  const pedirConectar = (c: ContaBancariaCadastro) => setPedidoOF({ tipo: 'conectar',
    banco: bancoDaConta(c, bancos)?.nome_curto ?? (c.banco ?? 'banco'), contaNome: nomeDaConta(c), finais: finaisDaConta(c) });

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-1.5 px-3 pb-2.5 pt-2" data-testid="tela-contas-bancarias">
      <div className="flex shrink-0 items-baseline gap-2">
        <h2 className="whitespace-nowrap text-[13px] font-semibold text-foreground">Contas bancárias</h2>
        <span className="uma-linha-que-rola min-w-0 text-[11px] text-muted-foreground">
          {clienteAtual?.nome ? `${clienteAtual.nome} · ` : ''}{resumo.texto}
        </span>
        <SeloOpenFinance n={nConectados} onAbrir={() => setPedidoOF({ tipo: 'lista' })} />
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar conta, banco, agência ou conta" className="h-6 w-[230px] text-[10.5px]" data-testid="busca-contas" />
        <Segmentado altura={24} valor={segmento} onEscolher={setSegmento} opcoes={SEGMENTOS} />
        <div className="w-[160px]">
          <SearchableSelect value={fazendaFiltro} onValueChange={setFazendaFiltro} allValue={TODAS_FAZENDAS} allLabel="Todas as fazendas"
            options={fazendasReais.map(f => ({ value: f.id, label: f.nome }))} placeholder="Todas as fazendas" dense triggerClassName="h-6 text-[10.5px]" />
        </div>
        <label className="flex items-center gap-1 whitespace-nowrap text-[10.5px] text-muted-foreground">
          <Checkbox checked={mostrarInativas} onCheckedChange={v => setMostrarInativas(v === true)} data-testid="mostrar-inativas" />Mostrar inativas
        </label>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <ContasExportMenu contas={filtradas} bancos={bancos} fazendaNome={fazendaNome} clienteNome={clienteAtual?.nome ?? ''} />
          {/* o navy do sistema (saiu o amarelo) */}
          <Button size="sm" className="h-6 bg-primary px-2.5 text-[10.5px] text-primary-foreground hover:bg-primary/90" onClick={() => setModal({ conta: null })}
            data-testid="nova-conta">+ Nova conta</Button>
        </div>
      </div>

      <div ref={caixaRef} className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card" data-testid="lista-contas">
        {/* `table-fixed` com larguras FIXAS: filtrar não mexe nas colunas; só o Nome fica com a sobra */}
        <table className="h-full w-full table-fixed border-separate border-spacing-0">
          <colgroup>
            <col style={{ width: L.codigo }} /><col /><col style={{ width: L.banco }} />
            {mostraAgencia && <col style={{ width: L.agencia }} />}<col style={{ width: L.conta }} />
            {mostraFazenda && <col style={{ width: L.fazenda }} />}
            {mostraOF && <col style={{ width: L.openFinance }} />}<col style={{ width: L.situacao }} /><col style={{ width: L.editar }} />
          </colgroup>
          <thead><tr>
            <th className={TH}>Cód.</th><th className={TH}>Nome da conta</th><th className={TH}>Banco</th>
            {mostraAgencia && <th className={TH}>Agência</th>}<th className={TH}>Conta</th>
            {mostraFazenda && <th className={TH}>Fazenda</th>}
            {mostraOF && <th className={TH}>Open Finance</th>}
            <th className={TH}>Situação</th><th className={TH} aria-label="Editar" />
          </tr></thead>
          <tbody>
            {carregando && contas.length === 0 && <tr><td colSpan={nColunas} className={cn(TD, 'text-muted-foreground')}>Carregando…</td></tr>}
            {!carregando && filtradas.length === 0 && <tr><td colSpan={nColunas} className={cn(TD, 'text-muted-foreground')}>Nenhuma conta.</td></tr>}
            {faixas.map(f => (
              <FaixaLinhas key={f.tipo} rotulo={f.rotulo} n={f.contas.length} colunas={nColunas}>
                {f.contas.map(c => {
                  const b = bancoNaLista(c, bancos);
                  const ag = agenciaNaLista(c); const ct = contaNaLista(c); const st = situacaoNaLista(c);
                  return (
                    <tr key={c.id} onClick={() => setModal({ conta: c })} data-testid="linha-conta"
                      className={cn('cursor-pointer hover:[&>td]:bg-muted/50', !c.ativa && '[&>td]:text-muted-foreground')}>
                      <td className={cn(TD, 'tabular-nums', CINZA)}>{c.codigo_conta ?? ''}</td>
                      <td className={cn(TD, 'max-w-0 truncate font-medium')} title={nomeDaConta(c)}>{nomeDaConta(c)}</td>
                      <td className={cn(TD, 'max-w-0 truncate')} title={b.codigo ? `${b.codigo} ${b.nome}` : b.nome} data-testid="celula-banco">
                        <span className={cn('inline-block w-[24px] text-[9px] tabular-nums', CINZA)}>{b.codigo}</span>
                        <span className={cn(b.cinza && CINZA)}>{b.nome}</span>
                      </td>
                      {mostraAgencia && <td className={cn(TD, 'tabular-nums', ag === '—' && CINZA)}>{ag}</td>}
                      <td className={cn(TD, 'tabular-nums', ct === '—' && CINZA)}>{ct}</td>
                      {mostraFazenda && <td className={cn(TD, 'max-w-0 truncate')} title={fazendaNome(c.fazenda_id)}>{fazendaNome(c.fazenda_id) || '—'}</td>}
                      {mostraOF && <CelulaOpenFinance estado={estadoDa(c)} erro={of.erro} conecta={conectaOF} onConectar={() => pedirConectar(c)}
                        onReconectar={(itemId) => setPedidoOF({ tipo: 'reconectar', itemId })} />}
                      <td className={TD} data-testid="celula-situacao">
                        <span className={cn('inline-block rounded px-1.5 text-[9.5px] font-semibold leading-[15px]',
                          st.ativa ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>
                          {st.texto}
                        </span>
                      </td>
                      <td className={cn(TD, 'text-center text-[11px]', CINZA)} aria-label="Editar">✎</td>
                    </tr>
                  );
                })}
              </FaixaLinhas>
            ))}
            {/* a sobra do quadro fica aqui: o rodapé desce ao pé da tela (preso quando a lista rola) */}
            <tr aria-hidden="true" className="h-full"><td colSpan={nColunas} className="p-0" /></tr>
          </tbody>
          <tfoot><tr data-testid="rodape-contas">
            <td colSpan={nColunas} className={TF}>{rodape}</td>
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

/* a célula da coluna Open Finance (o mock 26/11: sem botão grande): "Conectar" como link pequeno; conectado = ponto verde + a hora;
   cartão "em breve" cinza; sem OF "—". Os links param o clique (a linha abre o Editar conta). */
function CelulaOpenFinance({ estado, erro, conecta, onConectar, onReconectar }: {
  estado: EstadoNaLinha | null; erro: boolean; conecta: boolean; onConectar: () => void; onReconectar: (itemId: string) => void;
}) {
  if (erro) return <td className={cn(TD, CINZA)} title="Não consegui ler o Open Finance deste cliente agora" data-testid="of-linha">—</td>;
  if (!estado) return <td className={TD} data-testid="of-linha" />;
  const { texto, titulo } = textoDoEstado(estado);
  const parar = (e: { stopPropagation: () => void }) => e.stopPropagation();
  if (estado.tipo === 'conectar') return (
    <td className={TD} data-testid="of-linha" data-estado="conectar">
      <button type="button" title={conecta ? titulo : MOTIVO_SO_PROPRIETARIO} disabled={!conecta} onClick={(e) => { parar(e); onConectar(); }} data-testid="of-conectar"
        className="text-[10.5px] text-[#2d5fb8] hover:underline disabled:cursor-not-allowed disabled:opacity-50">{texto}</button>
    </td>);
  /* CONTAS-BANCARIAS-AJUSTES-01 (b): cartão = "em breve" (cinza, desabilitado), o motivo no `title` */
  if (estado.tipo === 'em_breve') return (
    <td className={TD} data-testid="of-linha" data-estado="em_breve">
      <button type="button" title={titulo} disabled onClick={parar} data-testid="of-em-breve" className={cn('cursor-not-allowed text-[10.5px]', CINZA)}>{texto}</button>
    </td>);
  if (estado.tipo === 'reconectar') return (
    <td className={TD} data-testid="of-linha" data-estado="reconectar">
      <button type="button" title={conecta ? titulo : MOTIVO_SO_PROPRIETARIO} disabled={!conecta} onClick={(e) => { parar(e); onReconectar(estado.itemId); }} data-testid="of-reconectar"
        className="text-[10.5px] font-semibold text-amber-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-400">{texto}</button>
    </td>);
  if (estado.tipo === 'conectado') return (
    <td title={titulo} data-testid="of-linha" data-estado="conectado" className={cn(TD, 'tabular-nums')}>
      <span className="mr-[5px] inline-block h-[6px] w-[6px] rounded-full bg-emerald-600 align-[1px]" aria-hidden />{texto.replace(/^● /, '')}
    </td>);
  return <td title={titulo} data-testid="of-linha" data-estado={estado.tipo} className={cn(TD, 'tabular-nums', CINZA)}>{texto}</td>;
}

/* o grupo do tipo: "Conta corrente · 12" (fundo cinza claro, 10 px, o número em cinza) */
function FaixaLinhas({ rotulo, n, colunas, children }: { rotulo: string; n: number; colunas: number; children: ReactNode }) {
  return (<>
    <tr data-testid="faixa-contas"><td colSpan={colunas} className={cn(TD, 'h-[19px] bg-[#f1f4f8] text-[10px] font-semibold text-foreground dark:bg-muted')}>
      {rotulo} <span className={cn('font-normal', CINZA)}>· {n}</span></td></tr>
    {children}
  </>);
}
