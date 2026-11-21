/**
 * FIN-REGRA-VARIAVEL-FAZENDA-01 (Gabriel 19/11 09:52 + 09:55) — o que JÁ está fora da regra fazenda × conta (variável/fixo de atividade/receita/
 * bovinos no Administrativo, dividendos em fazenda produtiva, pecuária em fazenda sem pecuária).
 *  · o SELO: o aviso pequeno âmbar da faixa dos totais (a regra da casa, UI-MESES-PADRAO-01), só quando há — "N despesas no Administrativo";
 *  · o MODAL: a lista (régua da casa, larguras fixas), por linha a regra que fura, a sugestão (a fazenda do histórico do fornecedor, "k de N")
 *    ou — no custo fixo de atividade — a conta ADMINISTRATIVA equivalente; sem sugestão a linha nasce desmarcada ("você decide", ex. o Adubo).
 *    As parcelas do mesmo contrato andam juntas. "Corrigir N" grava pela `fn_lancamentos_trocar_fazenda` (um destino por chamada), com a
 *    PRÉVIA do banco antes (as recusas dele, linha a linha) e "Desfazer" depois. Valor, datas, conta bancária e conciliação não mudam.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Ajuda } from '@/components/ui/ajuda';
import { SearchableSelect, type OpcaoSearchable } from '@/components/ui/searchable-select';
import { QUADRO_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO, TH_REGUA } from '@/components/ui/regua-tabela';
import { fazendaAdministrativa } from '@/lib/financeiro/escopoDoSubcentro';
import {
  aceitaConta, carregarPendentesDaRegra, chaveDoContrato, chaveDoDestino, desfazerTrocaDeFazenda, destinoDaChave, destinoPadrao, gruposPorDestino,
  linhaParaDestacar, motivoSugerido, porQueCurto, rotuloDaOrigem, textoDoSelo, trocarFazenda, type DestinoDaCorrecao, type PendenteDaRegra,
} from '@/lib/financeiro/regraFazenda';
import { Camada, type RetornoDaCamada } from '@/components/ui/camadas';
import { cn } from '@/lib/utils';
import { useLarguraDaJanela } from '@/hooks/useLarguraDaJanela';

interface FazendaDaLista { id: string; nome: string }
/** (b) uma conta administrativa do plano do cliente (a saída "Conta" da linha) */
export interface ContaAdministrativa { id: string; subcentro: string }
/** (a) NAV-VOLTA-ORIGEM-01 — a camada do modal na tela hospedeira: a linha abre o "Editar lançamento" POR CIMA e volta aqui */
export interface CamadaDaRegra {
  coberta: boolean;
  retorno: RetornoDaCamada | null;
  aoAbrir: () => void;
  aoFechar: () => void;
  abrirLancamento: (id: string) => void;
}

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBr = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d);

/** O selo na faixa dos totais. Some quando não há nada fora da regra. */
export function SeloRegraFazenda({ clienteId, fazendas, contasAdm = [], camada, onCorrigido }: {
  clienteId: string | null | undefined;
  fazendas: readonly FazendaDaLista[];
  contasAdm?: readonly ContaAdministrativa[];
  camada?: CamadaDaRegra;
  onCorrigido?: () => void;
}) {
  const [pendentes, setPendentes] = useState<PendenteDaRegra[]>([]);
  const [aberto, setAberto] = useState(false);
  const contar = useCallback(async () => {
    if (!clienteId) { setPendentes([]); return; }
    const r = await carregarPendentesDaRegra(clienteId);
    if ('erro' in r) { console.error(r.erro); return; }
    setPendentes(r);
  }, [clienteId]);
  useEffect(() => { void contar(); }, [contar]);
  /* (a) voltou do lançamento aberto por cima: relê a lista (a linha resolvida sai) e a lista do Financeiro, se salvou */
  const voltaN = camada?.retorno?.n ?? 0;
  const voltaSalvou = camada?.retorno?.acao === 'salvou';
  useEffect(() => {
    if (!voltaN) return;
    void contar();
    if (voltaSalvou) onCorrigido?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só a cada volta (o `n` muda a cada uma)
  }, [voltaN]);

  if (!clienteId || (pendentes.length === 0 && !aberto)) return null;
  const rotulo = textoDoSelo(pendentes);
  return (
    <>
      <button type="button" onClick={() => { setAberto(true); camada?.aoAbrir(); }} data-testid="selo-regra-fazenda"
        title={`${rotulo}: a conta pede outra fazenda. Clique para ver e corrigir.`}
        className="inline-flex h-4 shrink-0 items-center gap-0.5 whitespace-nowrap rounded border border-amber-400 bg-amber-50 px-1 text-[9.5px] text-amber-900">
        <AlertTriangle className="h-2.5 w-2.5" /> {rotulo} · Ver
      </button>
      {aberto && (
        <Camada coberta={camada?.coberta ?? false}>
          <CorrecaoRegraFazendaDialog clienteId={clienteId} fazendas={fazendas} pendentes={pendentes} contasAdm={contasAdm}
            onAbrirLancamento={camada?.abrirLancamento}
            onClose={() => { setAberto(false); camada?.aoFechar(); void contar(); }}
            onCorrigido={() => { void contar(); onCorrigido?.(); }} />
        </Camada>
      )}
    </>
  );
}

type Coluna = { chave: string; rotulo: string; largura: number | null; num?: boolean };
/* Abaixo de 1100px de janela (o modal a 97vw não cabe as 936px fixas) Fornecedor e Conta saem — vão para o title da Descrição —
   e Por quê/Corrigir para estreitam: as larguras seguem fixas (não dependem do dado), só o conjunto muda com a janela. */
const LARGURA_COMPACTA = 1100;
function colunasDe(compacto: boolean): Coluna[] {
  return [
    { chave: 'marca', rotulo: '', largura: 24 }, { chave: 'comp', rotulo: 'Comp.', largura: 70 }, { chave: 'desc', rotulo: 'Descrição', largura: null },
    ...(compacto ? [] : [{ chave: 'forn', rotulo: 'Fornecedor', largura: 130 }, { chave: 'conta', rotulo: 'Conta', largura: 150 }]),
    { chave: 'hoje', rotulo: 'Fazenda hoje', largura: 96 }, { chave: 'porque', rotulo: 'Por quê', largura: compacto ? 120 : 130 },
    /* FIN-REGRA-MODAL-02 (b) — as DUAS saídas da linha: outra fazenda | a conta administrativa (fica no ADM); escolher uma limpa a outra */
    { chave: 'faz', rotulo: '→ Fazenda', largura: compacto ? 110 : 120 }, { chave: 'cta', rotulo: '→ Conta (fica no ADM)', largura: compacto ? 120 : 150 },
    { chave: 'valor', rotulo: 'Valor', largura: 86, num: true },
  ];
}
const Colunas = ({ colunas }: { colunas: readonly Coluna[] }) => <colgroup>{colunas.map((c) => <col key={c.chave} style={c.largura ? { width: c.largura } : undefined} />)}</colgroup>;

export function CorrecaoRegraFazendaDialog({ clienteId, fazendas, pendentes, contasAdm = [], onAbrirLancamento, onClose, onCorrigido }: {
  clienteId: string;
  fazendas: readonly FazendaDaLista[];
  pendentes: readonly PendenteDaRegra[];
  contasAdm?: readonly ContaAdministrativa[];
  /** (a) a linha abre o "Editar lançamento" por cima (sem ele, a linha não é clicável) */
  onAbrirLancamento?: (id: string) => void;
  onClose: () => void;
  onCorrigido?: () => void;
}) {
  const adm = useMemo(() => fazendaAdministrativa(fazendas), [fazendas]);
  const nomeDaFazenda = useMemo(() => new Map(fazendas.map((f) => [f.id, f.nome])), [fazendas]);
  const produtivas = useMemo(() => fazendas.filter((f) => f.id !== '__global__' && f.id !== adm?.id), [fazendas, adm]);
  const contratoDe = useMemo(() => new Map(pendentes.map((p) => [p.id, chaveDoContrato(p)])), [pendentes]);

  const [escolha, setEscolha] = useState<Record<string, string>>(() =>
    Object.fromEntries(pendentes.map((p) => { const d = destinoPadrao(p); return [p.id, d ? chaveDoDestino(d) : '']; })));
  const [marcado, setMarcado] = useState<Set<string>>(() => new Set(pendentes.filter((p) => !p.mesFechado && destinoPadrao(p)).map((p) => p.id)));
  /* (e) o motivo nasce com a regra das linhas marcadas; depois de editado, é o do operador */
  const [motivoEditado, setMotivoEditado] = useState<string | null>(null);
  /* (a) a linha aberta por cima e a ordem de então: na volta, a mesma (se ainda fora da regra) ou a próxima fica destacada */
  const [aberta, setAberta] = useState<{ id: string; ordem: string[] } | null>(null);
  const destaque = useMemo(() => linhaParaDestacar(aberta?.id ?? null, aberta?.ordem ?? [], pendentes.map((p) => p.id)), [aberta, pendentes]);
  useEffect(() => {
    if (!destaque) return;
    document.querySelector(`[data-testid="correcao-linha"][data-id="${destaque}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [destaque]);
  const abrirLinha = (id: string) => {
    if (!onAbrirLancamento) return;
    setAberta({ id, ordem: pendentes.map((p) => p.id) });
    onAbrirLancamento(id);
  };
  const [previa, setPrevia] = useState<{ prontos: number; soma: number; recusas: string[] } | null>(null);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /* as parcelas do mesmo contrato andam juntas: escolher ou marcar uma vale para as irmãs */
  const irmas = useCallback((id: string) => pendentes.filter((p) => contratoDe.get(p.id) === contratoDe.get(id)).map((p) => p.id), [pendentes, contratoDe]);
  const escolher = (id: string, k: string) => {
    const ids = irmas(id);
    setEscolha((e) => ({ ...e, ...Object.fromEntries(ids.map((x) => [x, k])) }));
    setMarcado((m) => { const n = new Set(m); for (const x of ids) if (k && !pendentes.find((p) => p.id === x)?.mesFechado) n.add(x); else n.delete(x); return n; });
  };
  const alternar = (id: string, ligar: boolean) => {
    const ids = irmas(id);
    setMarcado((m) => { const n = new Set(m); for (const x of ids) if (ligar && escolha[x]) n.add(x); else n.delete(x); return n; });
  };

  const selecionados = useMemo(() => pendentes.flatMap((p) => {
    const d = marcado.has(p.id) ? destinoDaChave(escolha[p.id] ?? '') : null;
    return d ? [{ id: p.id, destino: d, valor: p.valor }] : [];
  }), [pendentes, marcado, escolha]);
  const grupos = useMemo(() => gruposPorDestino(selecionados), [selecionados]);
  const motivoDaRegra = useMemo(() => { const ids = new Set(selecionados.map((s) => s.id)); return motivoSugerido(pendentes.filter((p) => ids.has(p.id))); },
    [pendentes, selecionados]);
  const motivo = motivoEditado ?? motivoDaRegra;

  /* a PRÉVIA do banco (simular): as mesmas guardas do gravar, linha a linha */
  useEffect(() => {
    let vivo = true;
    setPrevia(null);
    if (!grupos.length) return;
    void Promise.all(grupos.map((g) => trocarFazenda(clienteId, g.ids, g.destino, 'prévia', true))).then((rs) => {
      if (!vivo) return;
      const recusas = rs.flatMap((r) => r.recusas);
      setPrevia({ prontos: recusas.length ? 0 : selecionados.length, soma: selecionados.reduce((s, x) => s + x.valor, 0), recusas });
    });
    return () => { vivo = false; };
  }, [clienteId, grupos, selecionados]);

  const n = selecionados.length;
  const pode = n > 0 && !!previa && previa.recusas.length === 0 && motivo.trim().length > 0 && !gravando;

  const corrigir = async () => {
    if (!pode) return;
    setGravando(true); setErro(null);
    const feitas: string[] = [];
    try {
      for (const g of grupos) {
        const r = await trocarFazenda(clienteId, g.ids, g.destino, motivo.trim(), false);
        if (!r.ok) { setErro(r.recusas.join(' · ') || 'A troca não foi feita.'); break; }
        if (r.trocaId) feitas.push(r.trocaId);
      }
      if (feitas.length) {
        toast.success(`Corrigido${n === 1 ? '' : 's'}: ${n} lançamento${n === 1 ? '' : 's'}`, {
          action: { label: 'Desfazer', onClick: () => { void Promise.all(feitas.map((t) => desfazerTrocaDeFazenda(clienteId, t))).then((es) => {
            const e = es.find((x) => x); if (e) toast.error(e); else { toast.success('Desfeito'); onCorrigido?.(); } }); } },
        });
        onCorrigido?.();
      }
      if (feitas.length === grupos.length) onClose();
    } finally { setGravando(false); }
  };

  /* (b) as duas saídas: a FAZENDA (as produtivas; a sugerida primeiro, com a origem) e a CONTA administrativa (a equivalente primeiro) */
  const opcoesDeFazenda = (p: PendenteDaRegra): OpcaoSearchable[] => {
    const sug = p.sugestao?.fazendaId;
    const faz = produtivas.map((f) => ({ value: chaveDoDestino({ tipo: 'fazenda', fazendaId: f.id }), label: f.nome,
      hint: f.id === sug && p.sugestao ? `sugerida · ${rotuloDaOrigem(p.sugestao)}` : undefined }));
    return [...faz.filter((o) => o.hint), ...faz.filter((o) => !o.hint)];
  };
  const nomeDaConta = useMemo(() => new Map(contasAdm.map((c) => [c.id, c.subcentro])), [contasAdm]);
  const opcoesDeConta = (p: PendenteDaRegra): OpcaoSearchable[] => {
    const eq = p.contaAdm?.planoContaId;
    const lista = contasAdm.some((c) => c.id === eq) || !p.contaAdm ? contasAdm : [{ id: p.contaAdm.planoContaId, subcentro: p.contaAdm.subcentro }, ...contasAdm];
    const ops = lista.map((c) => ({ value: chaveDoDestino({ tipo: 'conta', planoContaId: c.id }), label: c.subcentro,
      hint: c.id === eq ? 'a equivalente administrativa' : undefined }));
    return [...ops.filter((o) => o.hint), ...ops.filter((o) => !o.hint)];
  };
  const rotuloDoDestino = (p: PendenteDaRegra, d: DestinoDaCorrecao | null) => !d ? '' : d.tipo === 'fazenda' ? nomeDaFazenda.get(d.fazendaId) ?? '—'
    : `Conta: ${nomeDaConta.get(d.planoContaId) ?? (p.contaAdm?.planoContaId === d.planoContaId ? p.contaAdm.subcentro : '—')} (fica no Administrativo)`;

  const todosMarcaveis = pendentes.filter((p) => !p.mesFechado && escolha[p.id]);
  const tudo = todosMarcaveis.length > 0 && todosMarcaveis.every((p) => marcado.has(p.id));

  const compacto = useLarguraDaJanela() < LARGURA_COMPACTA;
  const colunas = colunasDe(compacto);

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !gravando) onClose(); }}>
      <DialogContent className="flex h-[min(600px,95vh)] w-[min(1180px,97vw)] max-w-none flex-col gap-0 overflow-hidden p-0" data-testid="correcao-regra-fazenda">
        <div className="flex h-9 shrink-0 items-center gap-1.5 bg-primary px-3.5 pr-10">
          <DialogTitle className="text-[13px] font-semibold leading-none text-primary-foreground">Fazenda fora da regra da conta</DialogTitle>
          <Ajuda titulo="Fazenda × conta" className="text-primary-foreground"
            oQueE="Lançamentos cuja conta pede outra fazenda: custo variável, custo fixo da atividade, receita e compra de bovinos nunca vão para o Administrativo; dividendos sempre vão."
            porQue="O DRE de cada fazenda só fecha com o custo da atividade nela. No Administrativo ele vira rateio e some da fazenda que gastou."
            comoFazer="Cada linha tem duas saídas: outra FAZENDA (a sugerida vem primeiro: a citada na descrição ou no fornecedor, a regra do ITR ou o histórico do fornecedor) ou, no custo fixo, a CONTA administrativa (fica no Administrativo). Marque e confira o motivo, que já vem com a regra. Clique na linha para abrir o lançamento e corrigir lá (fazenda, conta ou dividir). Valor, datas e conciliação não mudam; dá para desfazer." />
          <DialogDescription className="sr-only">Corrige a fazenda (ou a conta) dos lançamentos fora da regra, com prévia e desfazer.</DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 bg-muted p-2 text-[10.5px]">
          <div className="flex h-6 shrink-0 items-center gap-3 rounded-md border bg-card px-2.5 tabular-nums" data-testid="correcao-resumo">
            <b>{pendentes.length} lançamento{pendentes.length === 1 ? '' : 's'}</b>
            <span>R$ {brl(pendentes.reduce((s, p) => s + p.valor, 0))}</span>
            <span className="text-muted-foreground">{pendentes.filter((p) => !destinoPadrao(p)).length} sem sugestão (você decide)</span>
            <span className="text-muted-foreground">{pendentes.filter((p) => p.conciliado).length} conciliado(s): a conciliação não muda</span>
          </div>
          <div className={cn(QUADRO_REGUA, 'min-h-0 flex-1')}>
            <table className="w-full shrink-0 table-fixed border-collapse bg-primary">
              <Colunas colunas={colunas} />
              <thead><tr>{colunas.map((c, i) => (
                <th key={c.chave} className={cn(TH_REGUA, c.num ? 'text-right' : 'text-left')}>
                  {i === 0 ? <Checkbox checked={tudo} aria-label="Marcar todas" className="h-3 w-3 border-primary-foreground"
                    onCheckedChange={(v) => setMarcado(v === true ? new Set(todosMarcaveis.map((p) => p.id)) : new Set())} /> : c.rotulo}
                </th>))}</tr></thead>
            </table>
            <div className="min-h-0 flex-1 overflow-y-auto" data-testid="correcao-rolagem">
              <table className="w-full table-fixed border-collapse">
                <Colunas colunas={colunas} />
                <tbody>
                  {pendentes.map((p) => {
                    const d = destinoDaChave(escolha[p.id] ?? '');
                    const hoje = p.fazendaId ? nomeDaFazenda.get(p.fazendaId) ?? '—' : 'sem fazenda';
                    return (
                      <tr key={p.id} data-id={p.id} data-destaque={destaque === p.id ? '' : undefined}
                        className={cn('border-b border-border/50', onAbrirLancamento && 'cursor-pointer hover:bg-muted/50', marcado.has(p.id) && 'bg-blue-50/60',
                          destaque === p.id && 'bg-amber-50 outline outline-1 -outline-offset-1 outline-amber-400')}
                        title={onAbrirLancamento ? 'Clique para abrir o lançamento (fazenda, conta ou dividir) e voltar aqui' : undefined}
                        onClick={() => abrirLinha(p.id)} data-testid="correcao-linha">
                        <td className="h-[19px] px-1" onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={marcado.has(p.id)} disabled={p.mesFechado || !d} aria-label={`Marcar ${p.descricao}`} className="h-3 w-3"
                            title={p.mesFechado ? 'Mês fechado: reabra o mês para corrigir' : !d ? 'Escolha para onde vai' : undefined}
                            onCheckedChange={(v) => alternar(p.id, v === true)} data-testid="correcao-marcar" />
                        </td>
                        <td className={TD_REGUA_NUM}>{dataBr(p.competencia)}</td>
                        <td className={TD_REGUA_TEXTO} data-reticencias-com-title=""
                          title={compacto ? `${p.descricao}\n${p.fornecedor ?? '—'} · ${p.grupoCusto} › ${p.subcentro}` : p.descricao}>{p.descricao}</td>
                        {!compacto && <td className={TD_REGUA_TEXTO} title={p.fornecedor ?? undefined} data-reticencias-com-title="">{p.fornecedor ?? '—'}</td>}
                        {!compacto && <td className={TD_REGUA_TEXTO} title={`${p.grupoCusto} › ${p.subcentro}`} data-reticencias-com-title="">{p.subcentro}</td>}
                        <td className={cn(TD_REGUA_TEXTO, p.mesFechado && 'text-muted-foreground')} title={p.mesFechado ? `${hoje} · mês fechado` : hoje} data-reticencias-com-title="">
                          {p.mesFechado ? '🔒 ' : ''}{hoje}</td>
                        <td className={cn(TD_REGUA_TEXTO, 'text-amber-800')} title={p.regra} data-reticencias-com-title="" data-testid="correcao-regra">{porQueCurto(p)}</td>
                        <td className="h-[19px] px-1" onClick={(e) => e.stopPropagation()} data-testid="correcao-para-fazenda"
                          title={d?.tipo === 'fazenda' ? rotuloDoDestino(p, d) : p.sugestao ? `Sugerida: ${nomeDaFazenda.get(p.sugestao.fazendaId) ?? '—'} (${rotuloDaOrigem(p.sugestao)})` : 'Sem sugestão: você decide'}>
                          <SearchableSelect value={d?.tipo === 'fazenda' ? escolha[p.id] ?? '' : ''} onValueChange={(k) => escolher(p.id, k)} options={opcoesDeFazenda(p)}
                            semTodos allValue="" allLabel="Escolha" placeholder="Buscar fazenda..." dense disabled={p.mesFechado}
                            triggerClassName={cn('h-[17px] px-1 text-[10px]', !d && 'border-amber-400')} />
                        </td>
                        <td className="h-[19px] px-1" onClick={(e) => e.stopPropagation()} data-testid="correcao-para-conta"
                          title={!aceitaConta(p) ? 'Esta conta não fica no Administrativo: só outra fazenda resolve' : d?.tipo === 'conta' ? rotuloDoDestino(p, d)
                            : p.contaAdm ? `Equivalente: ${p.contaAdm.subcentro}` : 'Escolha a conta administrativa'}>
                          {aceitaConta(p) ? (
                            <SearchableSelect value={d?.tipo === 'conta' ? escolha[p.id] ?? '' : ''} onValueChange={(k) => escolher(p.id, k)} options={opcoesDeConta(p)}
                              semTodos allValue="" allLabel="—" placeholder="Buscar conta..." dense disabled={p.mesFechado}
                              triggerClassName="h-[17px] px-1 text-[10px]" />
                          ) : <span className="px-1 text-muted-foreground">—</span>}
                        </td>
                        <td className={TD_REGUA_NUM}>{brl(p.valor)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {/* altura FIXA de duas linhas (nada se desloca); o texto quebra e, com muitas recusas, rola aqui dentro — nunca "…" fora de tabela */}
          <div className={cn('h-[36px] shrink-0 overflow-y-auto rounded-md px-2 py-[3px] leading-[14px]', previa?.recusas.length ? 'bg-destructive/10 text-destructive' : 'bg-card text-muted-foreground')}
            data-testid="correcao-previa">
            <span>
              {!n ? 'Marque as linhas a corrigir.'
                : !previa ? 'Conferindo no banco…'
                : previa.recusas.length ? `⚠ ${previa.recusas.length} recusa${previa.recusas.length === 1 ? '' : 's'}: ${previa.recusas.join(' · ')}`
                : `Prévia: ${previa.prontos} lançamento${previa.prontos === 1 ? '' : 's'} · R$ ${brl(previa.soma)} mudam de fazenda (ou de conta). Valor, datas e conciliação ficam.`}
            </span>
          </div>
          <Input value={motivo} onChange={(e) => setMotivoEditado(e.target.value)} placeholder="Motivo (obrigatório)" className="h-[24px] shrink-0 text-[10.5px]" data-testid="correcao-motivo" />
        </div>
        <div className="flex h-9 shrink-0 items-center gap-2 border-t bg-card px-3 text-[10.5px]">
          <span className="min-w-0 truncate text-destructive" data-testid="correcao-erro" title={erro ?? undefined} data-reticencias-com-title="">{erro ? `⚠ ${erro}` : ''}</span>
          <span className="ml-auto" />
          <Button type="button" size="sm" variant="outline" className="h-[24px] shrink-0 px-2.5 text-[10.5px]" disabled={gravando} onClick={onClose}>Fechar</Button>
          <Button type="button" size="sm" className="h-[24px] w-[170px] shrink-0 px-2.5 text-[10.5px]" disabled={!pode} onClick={() => { void corrigir(); }} data-testid="correcao-confirmar">
            {gravando ? 'Corrigindo…' : `Corrigir ${n || ''} lançamento${n === 1 ? '' : 's'}`.replace('  ', ' ')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
