/**
 * FIN-FINANC-28 · PASSO 7 — O CADASTRO NOVO DO CONTRATO (mock `docs/mocks/mock-cadastro-contrato-v2.html`): modal 1150 × 600 de tamanho
 * fixo, a NATUREZA escolhida na criação (Financiamento · Compra parcelada · Consórcio), abas e o RESUMO FIXO à direita.
 *
 *  · Financiamento / empréstimo: Contrato · Liberações · Condições e cronograma · Destinação · Documentos. O cronograma é do BANCO
 *    (`fn_financiamento_cronograma`): a prévia embaixo dos campos e a gravação usam a MESMA função. Salvar = `fn_financiamento_criar`
 *    (contrato + parcelas + os lançamentos pelo motor de sempre, numa transação). Liberações, Destinação e Documentos gravam direto no
 *    contrato (os blocos do passo 4), por isso abrem depois do primeiro Salvar — o modal continua aberto com o contrato salvo.
 *  · Compra parcelada: o formulário que já está aprovado (o `ObrigacaoDialog`) — este modal só o abre.
 *  · Consórcio: natureza própria; parcela = fundo comum (no plano "Consórcio a contemplar", fora do DRE) + taxa adm., fundo de reserva
 *    e seguro (no plano escolhido); a contemplação fica registrada.
 * ⚠ SÓ DESENHA E JUNTA O PEDIDO: nenhuma soma de dinheiro aqui (o resumo lê o cronograma do banco). Recusa escrita no rodapé, nunca toast.
 */
import { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { CampoMoeda, CampoPercentual } from '@/components/ui/campo-moeda';
import { Segmentado } from '@/components/ui/segmentado';
import { SearchableSelect, type OpcaoSearchable } from '@/components/ui/searchable-select';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { FazendaSelect } from '@/components/shared/FazendaSelect';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import { PlanoSubcentroSelect } from '@/components/shared/PlanoSubcentroSelect';
import { NovoFornecedorDialog } from '@/components/financeiro-v2/NovoFornecedorDialog';
import { BlocoDestinacoes, BlocoDocumentos, BlocoLiberacoes } from '@/components/financiamentos/ContratoDeCredito';
import { BLOCO_FORMULARIO as BLOCO_DO_CONTRATO, GRADE_FORMULARIO, TituloDoBloco as Titulo, REGUA_CAMPO, REGUA_ROTULO } from '@/components/ui/bloco-formulario';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useFinanciamentoCadastro } from '@/hooks/useFinanciamentoCadastro';
import { useContratoDeCredito } from '@/hooks/useContratoDeCredito';
import { criarFornecedorDaCasa } from '@/lib/fornecedores/cadastroDaCasaBanco';
import { supabase } from '@/integrations/supabase/client';
import { useEdicaoDoContrato } from '@/hooks/useEdicaoDoContrato';
import { RegerarParcelas } from '@/components/financiamentos/EdicaoDoContrato';
import { dadosDoCabecalho, formDoContrato, tituloDaEdicao, type CampoNaoCadastrado } from '@/lib/financiamentos/edicaoDoContrato';
import {
  ROTULO_DA_MODALIDADE, ROTULO_DA_PERIODICIDADE, ROTULO_DO_SISTEMA, faltaNoResumo, formVazio, lerCronograma, oQueFalta, pedidoDeCriacao, pedidoDoCronograma,
  recusaAlemDaLista, textoDasParcelas,
  type Cronograma, type FormDoCadastro, type Modalidade, type NaturezaDoCadastro, type Periodicidade, type SistemaDoCadastro,
} from '@/lib/financiamentos/cadastroDoContrato';

export interface PrefillDoCadastro { natureza?: NaturezaDoCadastro; credorId?: string | null; valor?: number; data?: string | null; descricao?: string }

type Aba = 'contrato' | 'liberacoes' | 'condicoes' | 'destinacao' | 'documentos' | 'consorcio' | 'parcelas';
/* A RÉGUA DO CADASTRO (acabamento 17/10): rótulo 10px cinza em sentence case; campo e seletor de 28px com texto de 11px. */
const ROTULO = REGUA_ROTULO;
const CAMPO = REGUA_CAMPO;
/* O corpo do modal é cinza (bg-muted da casa) e os campos moram em blocos brancos — o bloco da tela do contrato, reusado. */
function Bloco({ nome, children, grade, testId, className = '' }: { nome: string; children: React.ReactNode; grade: string; testId: string; className?: string }) {
  return (
    <section className={`${BLOCO_DO_CONTRATO} ${className}`} data-testid={testId}>
      <Titulo nome={nome} />
      <div className={`${GRADE_FORMULARIO} ${grade}`}>{children}</div>
    </section>
  );
}
const num2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const br = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
export const MOTIVO_SALVE_ANTES = 'Salve o contrato primeiro: liberações, destinação e documentos gravam direto no contrato.';
const SUBCENTRO_CONSORCIO = 'Consórcio a contemplar';

function Campo({ rotulo, obrig, children, className = '' }: { rotulo: string; obrig?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className={ROTULO} title={rotulo}>{rotulo}{obrig ? ' *' : ''}</div>
      {children}
    </div>
  );
}

function LinhaResumo({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className="flex h-4 items-center justify-between gap-2 text-[10px]">
      <span className="shrink-0 text-muted-foreground">{rotulo}</span>
      <span className={`min-w-0 truncate text-right tabular-nums ${forte ? 'text-[11px] font-bold' : 'font-medium'}`} title={valor}>{valor}</span>
    </div>
  );
}

/* EDITAR = CADASTRO NOVO v2 (Gabriel 18/10/2026): com `financiamentoId` o MESMO modal abre em modo editar — carrega o contrato, as
   mesmas abas e o mesmo resumo, título "Editar contrato · <nº> · <credor inteiro>", natureza travada; o que estava vazio fica
   "não cadastrado". O Salvar grava o CABEÇALHO (`fn_financiamento_salvar_cabecalho`, que também sincroniza a captação); se o banco diz
   que o cronograma mudou, a aba Condições acende "Regerar parcelas em aberto" (prévia antes × depois, confirmação, trilha). */
export function CadastroDeContratoDialog({ aberto, aoFechar, onAbrirCompraParcelada, onSalvo, prefill, financiamentoId, abaInicial }: {
  aberto: boolean; aoFechar: () => void; onAbrirCompraParcelada?: () => void; onSalvo?: (financiamentoId: string) => void; prefill?: PrefillDoCadastro;
  financiamentoId?: string | null; abaInicial?: Aba;
}) {
  const editando = !!financiamentoId;
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? '';
  const { fazendas } = useFazenda();
  const { contas, classificacoes } = useFinanciamentoCadastro();
  const [escolha, setEscolha] = useState<'financiamento' | 'parcelado' | 'consorcio'>(prefill?.natureza === 'consorcio' ? 'consorcio' : 'financiamento');
  const [form, setForm] = useState<FormDoCadastro>(() => ({
    ...formVazio(prefill?.natureza ?? 'financiamento'), credorId: prefill?.credorId ?? null, valorTotal: prefill?.valor ?? 0,
    dataContrato: prefill?.data ?? null, descricao: prefill?.descricao ?? '',
  }));
  const [aba, setAba] = useState<Aba>(prefill?.natureza === 'consorcio' ? 'consorcio' : 'contrato');
  const [cronograma, setCronograma] = useState<Cronograma | null>(null);
  const [recusa, setRecusa] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [salvoId, setSalvoId] = useState<string | null>(financiamentoId ?? null);
  const [original, setOriginal] = useState<FormDoCadastro | null>(null);
  const [naoCadastrado, setNaoCadastrado] = useState<CampoNaoCadastrado[]>([]);
  const [tituloEdicao, setTituloEdicao] = useState<string>('Editar contrato');
  const [regerarAceso, setRegerarAceso] = useState(false);
  const [salvoAgora, setSalvoAgora] = useState<string | null>(null);
  const edicao = useEdicaoDoContrato(financiamentoId ?? null, clienteAtual?.id ?? null);
  const [novoCredor, setNovoCredor] = useState(false);
  const [buscaP, setBuscaP] = useState(''); const [buscaJ, setBuscaJ] = useState('');
  const [linhas, setLinhas] = useState<OpcaoSearchable[]>([]);
  const credito = useContratoDeCredito(salvoId, clienteId);
  const set = <K extends keyof FormDoCadastro>(k: K, v: FormDoCadastro[K]) => { setForm((f) => ({ ...f, [k]: v })); setRecusa(null); setSalvoAgora(null); };
  const nc = (k: CampoNaoCadastrado) => naoCadastrado.includes(k);
  const cadastrar = (k: CampoNaoCadastrado) => setNaoCadastrado((xs) => xs.filter((x) => x !== k));
  const rotuloNc = (rotulo: string, k: CampoNaoCadastrado) => (nc(k) ? `${rotulo} · não cadastrado` : rotulo);

  /* modo editar: carrega o contrato gravado UMA vez por abertura */
  useEffect(() => {
    if (!aberto || !financiamentoId) return;
    let vivo = true;
    void (async () => {
      const { data } = await supabase.from('financiamentos').select('*, financeiro_fornecedores!financiamentos_credor_id_fkey(nome)').eq('id', financiamentoId).maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela fora do types.ts
      const { data: cons } = await (supabase as any).from('financiamento_consorcio').select('*').eq('financiamento_id', financiamentoId).maybeSingle();
      const c = formDoContrato(data, cons);
      if (!vivo || !c) return;
      setForm(c.form); setOriginal(c.form); setNaoCadastrado(c.naoCadastrado);
      setEscolha(c.form.natureza === 'consorcio' ? 'consorcio' : 'financiamento');
      setTituloEdicao(tituloDaEdicao(c.numero, c.credorNome));
      setAba(abaInicial ?? (c.form.natureza === 'consorcio' ? 'consorcio' : 'contrato'));
    })();
    return () => { vivo = false; };
  }, [aberto, financiamentoId]); // eslint-disable-line react-hooks/exhaustive-deps -- carrega uma vez por abertura
  const cons = form.natureza === 'consorcio';

  useEffect(() => {
    if (!clienteId) return;
    void supabase.from('financiamento_linhas_credito').select('id, programa, descricao').eq('cliente_id', clienteId).then(({ data }) =>
      setLinhas((data ?? []).map((l) => ({ value: l.id, label: [l.programa, l.descricao].filter(Boolean).join(' · ') || 'linha de crédito' }))));
  }, [clienteId]);

  /* os planos padrão pela atividade (os mesmos do motor); o do consórcio é o "Consórcio a contemplar" */
  const planoPorSub = useMemo(() => new Map(classificacoes.filter((c) => c.subcentro).map((c) => [c.subcentro ?? '', c])), [classificacoes]);
  useEffect(() => {
    const sub = cons ? SUBCENTRO_CONSORCIO : form.atividade === 'agricultura' ? 'Amortização Financiamento Agricultura' : 'Amortização Financiamento Pecuária';
    const p = planoPorSub.get(sub);
    if (p) setForm((f) => (f.planoPrincipalId ? f : { ...f, planoPrincipalId: p.id }));
  }, [cons, form.atividade, planoPorSub]);
  const subDe = (id: string | null) => classificacoes.find((c) => c.id === id)?.subcentro ?? '';

  /* a prévia do cronograma: a MESMA função da gravação, refeita (com espera) quando muda o que muda o cronograma */
  const chave = JSON.stringify(pedidoDoCronograma(form));
  useEffect(() => {
    if (escolha === 'parcelado') return;
    let vivo = true;
    const tm = setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      void (supabase as any).rpc('fn_financiamento_cronograma', { p: JSON.parse(chave) }).then(({ data }: { data: unknown }) => { if (vivo) setCronograma(lerCronograma(data)); });
    }, 300);
    return () => { vivo = false; clearTimeout(tm); };
  }, [chave, escolha]);

  const escolher = (v: 'financiamento' | 'parcelado' | 'consorcio') => {
    if (salvoId) return;
    setEscolha(v);
    if (v === 'consorcio') { setForm((f) => ({ ...f, natureza: 'consorcio', planoPrincipalId: null })); setAba('consorcio'); }
    if (v === 'financiamento') { setForm((f) => ({ ...f, natureza: f.natureza === 'consorcio' ? 'financiamento' : f.natureza, planoPrincipalId: null })); setAba('contrato'); }
  };
  const falta = oQueFalta(form);
  const salvarCabecalho = async () => {
    if (!original) return;
    const dados = dadosDoCabecalho(original, form, naoCadastrado);
    if (Object.keys(dados).length === 0) { setRecusa('Nenhuma mudança no cabeçalho.'); return; }
    setGravando(true);
    const r = await edicao.salvarCabecalho(dados, false);
    setGravando(false);
    if (r.recusa) { setRecusa(r.recusa); return; }
    setOriginal(form);
    if (financiamentoId) onSalvo?.(financiamentoId);
    if (r.corpo.cronograma_mudou === true) { setRegerarAceso(true); setAba('condicoes'); setSalvoAgora('Cabeçalho salvo · o cronograma mudou: regere as parcelas em aberto na aba Condições.'); }
    else setSalvoAgora('Cabeçalho salvo.');
  };
  const salvar = async () => {
    if (editando) { await salvarCabecalho(); return; }
    if (salvoId) { aoFechar(); return; }
    if (falta.length) { setRecusa(`Falta: ${falta.join(', ')}.`); return; }
    if (cronograma?.recusa) { setRecusa(cronograma.recusa); return; }
    setGravando(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_financiamento_criar', { p_dados: pedidoDeCriacao(form, clienteId), p_simular: false });
    setGravando(false);
    const id = typeof data === 'object' && data !== null && 'financiamento_id' in data && typeof data.financiamento_id === 'string' ? data.financiamento_id : null;
    if (error || !id) { setRecusa(error ? String(error.message ?? error).replace(/^(ERROR:\s*)?(P0001|42501):\s*/i, '') : 'Resposta do banco fora do formato.'); return; }
    setSalvoId(id);
    onSalvo?.(id);
    setAba(cons ? 'documentos' : 'liberacoes');
  };

  const abasFin: { valor: Aba; rotulo: string; antes?: boolean }[] = [
    { valor: 'contrato', rotulo: 'Contrato' }, { valor: 'liberacoes', rotulo: 'Liberações', antes: true }, { valor: 'condicoes', rotulo: 'Condições e cronograma' },
    { valor: 'destinacao', rotulo: 'Destinação', antes: true }, { valor: 'documentos', rotulo: 'Documentos', antes: true },
  ];
  const abasCons: { valor: Aba; rotulo: string; antes?: boolean }[] = [
    { valor: 'consorcio', rotulo: 'Consórcio' }, { valor: 'parcelas', rotulo: `Parcelas${cronograma?.linhas.length ? ` ${cronograma.linhas.length}` : ''}` },
    { valor: 'documentos', rotulo: 'Documentos', antes: true },
  ];
  const abas = cons ? abasCons : abasFin;
  /* depois do primeiro Salvar da criação os campos travam; no modo editar, nunca */
  const travado = !!salvoId && !editando;

  const tabela = (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card" data-testid="cronograma-previa">
      <table className="w-full table-fixed border-collapse">
        <colgroup><col style={{ width: 40 }} /><col style={{ width: 84 }} /><col /><col /><col /><col /></colgroup>
        <thead><tr className="sticky top-0 z-10 bg-primary text-primary-foreground">
          {['Nº', 'Venc.', cons ? 'Fundo comum' : 'Principal', cons ? 'Taxa + seguro' : 'Juros', 'Total', cons ? 'Falta na carta' : 'Saldo devedor'].map((h, i) => (
            <th key={h} className={`h-[22px] px-2 text-[9.5px] font-semibold ${i > 1 ? 'text-right' : 'text-left'}`}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {(cronograma?.linhas ?? []).map((l) => (
            <tr key={l.numero} className="border-b" data-testid="linha-do-cronograma">
              <td className="h-[22px] px-2 text-[10px] tabular-nums">{l.numero}</td>
              <td className="px-2 text-[10px] tabular-nums">{br(l.vencimento)}</td>
              <td className="px-2 text-right text-[10px] tabular-nums">{l.principal === 0 ? <span className="text-muted-foreground">carência</span> : num2(l.principal)}</td>
              <td className="px-2 text-right text-[10px] tabular-nums">{num2(l.juros)}</td>
              <td className="px-2 text-right text-[10px] font-semibold tabular-nums">{num2(l.total)}</td>
              <td className="px-2 text-right text-[10px] tabular-nums">{num2(l.saldoApos)}</td>
            </tr>
          ))}
          {!cronograma?.linhas.length && <tr><td colSpan={6} className="h-[22px] px-2 text-[10px] text-muted-foreground">{cronograma?.recusa ?? 'Preencha as condições para ver o cronograma.'}</td></tr>}
        </tbody>
      </table>
    </div>
  );

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[min(600px,calc(100vh-16px))] w-[min(1150px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0" data-testid="cadastro-de-contrato">
        <div className="flex h-[34px] shrink-0 items-center bg-primary px-3 text-primary-foreground">
          <DialogTitle className="min-w-0 truncate text-[11px] font-semibold" title={editando ? tituloEdicao : undefined} data-testid="titulo-do-cadastro">
            {editando ? tituloEdicao : `${travado ? 'Contrato salvo' : cons ? 'Novo consórcio' : 'Novo contrato'} · ${clienteAtual?.nome ?? ''}`}
          </DialogTitle>
          <DialogDescription className="sr-only">Cadastro de contrato</DialogDescription>
        </div>
        <div className="flex h-[34px] shrink-0 items-center gap-3 border-b px-3">
          <Segmentado altura={22} valor={escolha} onEscolher={escolher} opcoes={[
            { valor: 'financiamento', rotulo: 'Financiamento', desabilitada: travado || editando },
            { valor: 'parcelado', rotulo: 'Compra parcelada', desabilitada: travado || editando },
            { valor: 'consorcio', rotulo: 'Consórcio', desabilitada: travado || editando },
          ]} />
          <span className="text-[10px] text-muted-foreground">natureza escolhida na criação · no editar ela fica travada</span>
          {escolha === 'financiamento' && (
            <Segmentado altura={20} className="ml-auto" valor={form.natureza === 'emprestimo' ? 'emprestimo' : 'financiamento'} onEscolher={(v) => { if (!travado && !editando) set('natureza', v); }}
              opcoes={[{ valor: 'financiamento', rotulo: 'com bem vinculado', desabilitada: travado || editando }, { valor: 'emprestimo', rotulo: 'empréstimo', desabilitada: travado || editando }]} />
          )}
        </div>

        {escolha === 'parcelado' ? (
          <div className="flex min-h-0 flex-1 flex-col items-start gap-2 px-6 pt-6 text-[11px]" data-testid="compra-parcelada-no-cadastro">
            <p>A compra parcelada usa o formulário que já está aprovado (régua da tela de hoje): sem juros, sem amortização, sem liberação.</p>
            <Button size="sm" className="h-[26px] text-[11px]" onClick={() => { aoFechar(); onAbrirCompraParcelada?.(); }} disabled={!onAbrirCompraParcelada}>
              Abrir o formulário da compra parcelada
            </Button>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_240px]">
            <div className="flex min-h-0 min-w-0 flex-col bg-muted px-3 pt-2" data-testid="corpo-do-cadastro">
              <div className="mb-1.5 shrink-0">
                <Segmentado altura={22} valor={aba} onEscolher={setAba}
                  opcoes={abas.map((a) => ({ valor: a.valor, rotulo: a.rotulo, desabilitada: !!a.antes && !travado, title: a.antes && !travado ? MOTIVO_SALVE_ANTES : undefined }))} />
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid={`aba-${aba}`}>
                {(aba === 'contrato' || aba === 'consorcio') && (
                  <fieldset disabled={travado} className="flex min-h-0 flex-col gap-1.5">
                    <Bloco nome="Identificação" testId="bloco-identificacao"
                      grade={cons ? 'grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1.6fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]'}>
                      <Campo rotulo="Descrição" obrig>
                        <Input className={CAMPO} value={form.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder={cons ? 'Consórcio John Deere · trator' : 'Investimento pecuário · reforma de pastagem'} />
                      </Campo>
                      <Campo rotulo={cons ? 'Administradora' : 'Credor (banco)'} obrig>
                        <FavorecidoSelect value={form.credorId ?? ''} onChange={(id) => set('credorId', id || null)} clienteId={clienteId} onCriarNovo={() => setNovoCredor(true)}
                          triggerClassName={CAMPO} novoButtonClassName="h-7 w-7" />
                      </Campo>
                      {cons ? (
                        <Campo rotulo="Grupo / cota" obrig>
                          <div className="flex gap-1"><Input className={CAMPO} value={form.grupo} onChange={(e) => set('grupo', e.target.value)} placeholder="grupo" />
                            <Input className={CAMPO} value={form.cota} onChange={(e) => set('cota', e.target.value)} placeholder="cota" /></div>
                        </Campo>
                      ) : (
                        <Campo rotulo="Nº do contrato (cédula)" obrig><Input className={CAMPO} value={form.numeroContrato} onChange={(e) => set('numeroContrato', e.target.value)} /></Campo>
                      )}
                      {!cons && <Campo rotulo="Linha de crédito"><SearchableSelect value={form.linhaCreditoId ?? ''} onValueChange={(v) => set('linhaCreditoId', v || null)} options={linhas} placeholder="—" semTodos triggerClassName={CAMPO} /></Campo>}
                      <Campo rotulo="Atividade" obrig>
                        <Segmentado altura={26} valor={form.atividade} onEscolher={(v) => set('atividade', v)} opcoes={[{ valor: 'pecuaria', rotulo: 'Pecuária' }, { valor: 'agricultura', rotulo: 'Agricultura' }]} />
                      </Campo>
                      {!cons && (
                        <Campo rotulo="Modalidade" obrig className="col-span-3">
                          <Segmentado altura={26} valor={form.modalidade} onEscolher={(v: Modalidade) => set('modalidade', v)}
                            opcoes={(['custeio', 'investimento', 'comercializacao', 'outro'] satisfies Modalidade[]).map((m) => ({ valor: m, rotulo: ROTULO_DA_MODALIDADE[m] }))} />
                        </Campo>
                      )}
                    </Bloco>
                    {cons ? (
                      <fieldset disabled={editando} title={editando ? 'carta, prazo e custos do consórcio não mudam pelo cabeçalho: edite as parcelas' : undefined}>
                      <Bloco nome="Carta e prazo" testId="bloco-carta" grade="grid-cols-4">
                        <Campo rotulo="Valor da carta de crédito" obrig><CampoMoeda className={CAMPO} valor={form.valorTotal} onChange={(v) => set('valorTotal', v ?? 0)} /></Campo>
                        <Campo rotulo="Prazo (meses)" obrig><Input className={CAMPO} inputMode="numeric" value={form.prazo || ''} onChange={(e) => set('prazo', Number(e.target.value.replace(/\D/g, '').slice(0, 3)) || 0)} /></Campo>
                        <Campo rotulo="1ª parcela" obrig><DatePicker size="compact" className={CAMPO} value={form.primeiroVencimento ?? ''} onChange={(v) => set('primeiroVencimento', v || null)} /></Campo>
                        <Campo rotulo="Reajuste da carta"><Input className={CAMPO} value={form.reajuste} onChange={(e) => set('reajuste', e.target.value)} placeholder="preço do bem (anual)" /></Campo>
                      </Bloco>
                      </fieldset>
                    ) : (
                      <Bloco nome="Valores e datas" testId="bloco-valores" grade="grid-cols-4">
                        <Campo rotulo="Valor contratado" obrig><CampoMoeda className={CAMPO} valor={form.valorTotal} onChange={(v) => set('valorTotal', v ?? 0)} /></Campo>
                        <Campo rotulo="Data do contrato" obrig><DatePicker size="compact" className={CAMPO} value={form.dataContrato ?? ''} onChange={(v) => set('dataContrato', v || null)} /></Campo>
                        <Campo rotulo="1º vencimento" obrig><DatePicker size="compact" className={CAMPO} value={form.primeiroVencimento ?? ''} onChange={(v) => set('primeiroVencimento', v || null)} /></Campo>
                      </Bloco>
                    )}
                    {cons && (
                      <div className="grid grid-cols-2 gap-2">
                        <Bloco nome="Custos" testId="bloco-custos" grade="grid-cols-3">
                          <Campo rotulo="Taxa adm. (% total)" obrig><CampoPercentual className={CAMPO} valor={form.taxaAdmPct} onChange={(v) => set('taxaAdmPct', v ?? 0)} /></Campo>
                          <Campo rotulo="Fundo reserva (% total)"><CampoPercentual className={CAMPO} valor={form.fundoReservaPct} onChange={(v) => set('fundoReservaPct', v ?? 0)} /></Campo>
                          <Campo rotulo="Seguro (% a.m.)"><CampoPercentual className={CAMPO} valor={form.seguroPctMes} onChange={(v) => set('seguroPctMes', v ?? 0)} casas={3} /></Campo>
                        </Bloco>
                        <Bloco nome="Contemplação" testId="bloco-contemplacao" grade="grid-cols-1">
                          <div className="flex h-[41px] items-end gap-2" data-testid="contemplacao">
                            <Segmentado altura={26} valor={form.contemplado ? 's' : 'n'} onEscolher={(v) => set('contemplado', v === 's')} opcoes={[{ valor: 'n', rotulo: 'Não contemplado' }, { valor: 's', rotulo: 'Contemplado' }]} />
                            {form.contemplado && <div className="w-[110px]"><DatePicker size="compact" className={CAMPO} value={form.dataContemplacao ?? ''} onChange={(v) => set('dataContemplacao', v || null)} /></div>}
                            {form.contemplado && <Segmentado altura={26} valor={form.formaContemplacao ?? 'sorteio'} onEscolher={(v) => set('formaContemplacao', v)} opcoes={[{ valor: 'sorteio', rotulo: 'Sorteio' }, { valor: 'lance', rotulo: 'Lance' }]} />}
                            {form.contemplado && form.formaContemplacao === 'lance' && <div className="w-[110px]"><CampoMoeda className={CAMPO} valor={form.lanceValor} onChange={(v) => set('lanceValor', v ?? 0)} /></div>}
                          </div>
                        </Bloco>
                      </div>
                    )}
                    <Bloco nome="Pagamento e classificação" testId="bloco-pagamento" grade="grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,1.6fr)]">
                      <Campo rotulo="Fazenda" obrig><FazendaSelect value={form.fazendaId ?? ''} onChange={(id) => set('fazendaId', id || null)} fazendas={fazendas} forcaAdministrativo={false} triggerClassName={CAMPO} hideAviso comBusca /></Campo>
                      <Campo rotulo={cons ? 'Conta de pagamento' : 'Conta de captação'} obrig>
                        <ContaBancariaSelect value={form.contaId ?? ''} onValueChange={(v) => set('contaId', v || null)} contas={contas} placeholder="Selecione" showBankDetails="banco" className={CAMPO} comBusca />
                      </Campo>
                      <Campo rotulo={cons ? 'Plano das parcelas' : 'Plano · parcela de principal'} obrig>
                        {cons ? <span className="flex h-7 items-center truncate rounded-md bg-muted px-2 text-[11px] text-muted-foreground" data-testid="plano-do-consorcio"
                          title="a parcela NÃO é despesa: vira crédito acumulado na carta">{SUBCENTRO_CONSORCIO} · fora do DRE</span>
                          : <PlanoSubcentroSelect value={subDe(form.planoPrincipalId)} onChange={() => undefined} onSelected={(_s, c) => set('planoPrincipalId', c?.id ?? null)}
                              classificacoes={classificacoes} tipoOperacao="2-Saídas" search={buscaP} onSearchChange={setBuscaP} triggerClassName={CAMPO} />}
                      </Campo>
                      <Campo rotulo={cons ? 'Plano da taxa adm. e seguro' : 'Plano · juros e encargos'} obrig>
                        <PlanoSubcentroSelect value={subDe(form.planoJurosId)} onChange={() => undefined} onSelected={(_s, c) => set('planoJurosId', c?.id ?? null)}
                          classificacoes={classificacoes} tipoOperacao="2-Saídas" search={buscaJ} onSearchChange={setBuscaJ} triggerClassName={CAMPO} />
                      </Campo>
                    </Bloco>
                    {!cons && (
                      <Bloco nome="Garantias" testId="bloco-garantias" grade="grid-cols-2">
                        <Campo rotulo="Garantias"><Input className={CAMPO} value={form.garantias} onChange={(e) => set('garantias', e.target.value)} placeholder="Alienação fiduciária · hipoteca" /></Campo>
                        <Campo rotulo="Finalidade (texto livre)"><Input className={CAMPO} value={form.observacao} onChange={(e) => set('observacao', e.target.value)} /></Campo>
                      </Bloco>
                    )}
                  </fieldset>
                )}
                {aba === 'condicoes' && (
                  <fieldset disabled={travado} className="flex min-h-0 flex-1 flex-col gap-2">
                    <Bloco nome="Condições" testId="bloco-condicoes" grade="grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] shrink-0">
                      <Campo rotulo={rotuloNc('Sistema de amortização', 'sistema')} obrig>
                        <Segmentado<SistemaDoCadastro | ''> altura={26} valor={nc('sistema') ? '' : form.sistema} onEscolher={(v) => { if (v !== '') { cadastrar('sistema'); set('sistema', v); } }}
                          opcoes={(['sac', 'price', 'bullet', 'livre'] satisfies SistemaDoCadastro[]).map((s) => ({ valor: s, rotulo: ROTULO_DO_SISTEMA[s] }))} />
                      </Campo>
                      <Campo rotulo="Taxa de juros (% a.a.)" obrig><CampoPercentual className={CAMPO} valor={form.taxaAa} onChange={(v) => set('taxaAa', v ?? 0)} /></Campo>
                      <Campo rotulo={rotuloNc('Tipo de taxa', 'tipoTaxa')}><Segmentado<'pre' | 'pos' | ''> altura={26} valor={nc('tipoTaxa') ? '' : form.tipoTaxa}
                        onEscolher={(v) => { if (v !== '') { cadastrar('tipoTaxa'); set('tipoTaxa', v); } }} opcoes={[{ valor: 'pre', rotulo: 'Pré' }, { valor: 'pos', rotulo: 'Pós (CDI/TLP)' }]} /></Campo>
                      <Campo rotulo={rotuloNc('Carência de principal até', 'carenciaAte')}><DatePicker size="compact" className={CAMPO} value={form.carenciaAte ?? ''} onChange={(v) => { cadastrar('carenciaAte'); set('carenciaAte', v || null); }} /></Campo>
                      <Campo rotulo={rotuloNc('Periodicidade', 'periodicidade')} obrig>
                        <Segmentado<Periodicidade | ''> altura={26} valor={nc('periodicidade') ? '' : form.periodicidade} onEscolher={(v) => { if (v !== '') { cadastrar('periodicidade'); set('periodicidade', v); } }}
                          opcoes={(['mensal', 'trimestral', 'semestral', 'anual'] satisfies Periodicidade[]).map((p) => ({ valor: p, rotulo: ROTULO_DA_PERIODICIDADE[p] }))} />
                      </Campo>
                      <div />
                      {form.sistema !== 'bullet' && form.sistema !== 'livre'
                        ? <Campo rotulo="Nº parcelas de principal (prazo)" obrig><Input className={CAMPO} inputMode="numeric" value={form.n || ''} onChange={(e) => set('n', Number(e.target.value.replace(/\D/g, '').slice(0, 3)) || 0)} data-testid="n-parcelas" /></Campo>
                        : <div />}
                    </Bloco>
                    {form.sistema === 'livre' && (
                      <div className="flex shrink-0 items-center gap-2 text-[10px]" data-testid="parcelas-digitadas">
                        <span className="text-muted-foreground">{form.parcelas.length} parcela(s) digitada(s)</span>
                        <Button variant="outline" size="sm" className="h-[20px] gap-1 px-2 text-[10px]" onClick={() => set('parcelas', [...form.parcelas, { vencimento: null, principal: 0, juros: 0 }])}><Plus className="size-3" /> parcela</Button>
                      </div>
                    )}
                    {form.sistema === 'livre' && form.parcelas.length > 0 && (
                      <div className="max-h-[110px] shrink-0 space-y-1 overflow-y-auto">
                        {form.parcelas.map((p, i) => (
                          <div key={i} className="grid grid-cols-[30px_130px_140px_140px_20px] items-center gap-2 text-[10px]">
                            <span className="tabular-nums">{i + 1}</span>
                            <DatePicker size="compact" className={CAMPO} value={p.vencimento ?? ''} onChange={(v) => set('parcelas', form.parcelas.map((x, j) => (j === i ? { ...x, vencimento: v || null } : x)))} />
                            <CampoMoeda className={CAMPO} valor={p.principal} onChange={(v) => set('parcelas', form.parcelas.map((x, j) => (j === i ? { ...x, principal: v ?? 0 } : x)))} />
                            <CampoMoeda className={CAMPO} valor={p.juros} onChange={(v) => set('parcelas', form.parcelas.map((x, j) => (j === i ? { ...x, juros: v ?? 0 } : x)))} />
                            <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => set('parcelas', form.parcelas.filter((_x, j) => j !== i))}><X className="size-3" /></button>
                          </div>
                        ))}
                      </div>
                    )}
                    {editando ? (regerarAceso
                      ? <RegerarParcelas api={edicao} onFeito={() => { setRegerarAceso(false); setSalvoAgora('Parcelas em aberto regeradas · desfazer pela tela do contrato (Editar parcelas).'); }} />
                      : <div className="flex h-[26px] shrink-0 items-center gap-2 text-[10.5px] text-muted-foreground" data-testid="regerar-apagado">
                          <span className="min-w-0 flex-1 truncate">Mudou sistema, taxa, prazo, carência, valor, periodicidade ou 1º vencimento? Salve: o banco acende "Regerar parcelas em aberto".</span>
                          <Button variant="outline" size="sm" className="h-[22px] shrink-0 text-[10px]" onClick={() => setRegerarAceso(true)} data-testid="abrir-regerar">Regerar parcelas em aberto</Button>
                        </div>) : tabela}
                  </fieldset>
                )}
                {aba === 'parcelas' && tabela}
                {aba === 'liberacoes' && salvoId && <div className="min-h-0 flex-1 overflow-y-auto"><BlocoLiberacoes api={credito} contaDoContrato={null} onAbrirLancamento={() => undefined} clienteId={clienteId} /></div>}
                {aba === 'destinacao' && salvoId && <div className="min-h-0 flex-1 overflow-y-auto"><BlocoDestinacoes api={credito} /></div>}
                {aba === 'documentos' && salvoId && <div className="min-h-0 flex-1 overflow-y-auto"><BlocoDocumentos api={credito} /></div>}
              </div>
            </div>
            {/* o resumo fixo à direita (240px, a régua A18): os números do cronograma do BANCO */}
            <aside className="flex min-h-0 flex-col overflow-hidden border-l bg-muted/20 px-3 pt-2" data-testid="resumo-do-cadastro">
              <div className="mb-1 text-[11px] font-semibold">{cons ? 'Resumo do consórcio' : 'Resumo do contrato'}</div>
              {cons ? (<>
                <LinhaResumo rotulo="Carta de crédito" valor={`R$ ${num2(form.valorTotal)}`} />
                <LinhaResumo rotulo="Parcela (fundo comum)" valor={cronograma?.linhas[0] ? `R$ ${num2(cronograma.linhas[0].principal)}` : '—'} />
                <LinhaResumo rotulo="Taxa adm. + fundo + seguro" valor={cronograma?.linhas[0] ? `R$ ${num2(cronograma.linhas[0].juros)}` : '—'} />
                <LinhaResumo rotulo="Parcela total" valor={cronograma?.linhas[0] ? `R$ ${num2(cronograma.linhas[0].total)}` : '—'} forte />
                <LinhaResumo rotulo="Parcelas" valor={cronograma ? String(cronograma.parcelas) : '—'} />
                <LinhaResumo rotulo="Custo total previsto" valor={cronograma ? `R$ ${num2(cronograma.total)}` : '—'} />
                <LinhaResumo rotulo="Última parcela" valor={br(cronograma?.vencimentoFinal ?? null)} />
              </>) : (<>
                <LinhaResumo rotulo="Valor contratado" valor={`R$ ${num2(form.valorTotal)}`} />
                <LinhaResumo rotulo="Sistema" valor={`${ROTULO_DO_SISTEMA[form.sistema]} · ${ROTULO_DA_PERIODICIDADE[form.periodicidade].toLowerCase()}`} />
                <LinhaResumo rotulo="Taxa" valor={`${num2(form.taxaAa)}% a.a. ${form.tipoTaxa === 'pre' ? 'pré' : 'pós'}`} />
                <LinhaResumo rotulo="Carência" valor={form.carenciaAte ? `até ${br(form.carenciaAte)}` : '—'} />
                <LinhaResumo rotulo="Parcelas" valor={textoDasParcelas(cronograma)} />
                <LinhaResumo rotulo="Vencimento final" valor={br(cronograma?.vencimentoFinal ?? null)} />
                <LinhaResumo rotulo="Juros previstos" valor={cronograma ? `R$ ${num2(cronograma.jurosTotal)}` : '—'} />
                <LinhaResumo rotulo="Total a pagar" valor={cronograma ? `R$ ${num2(cronograma.total)}` : '—'} forte />
              </>)}
              <div className="mb-0.5 mt-2 border-t pt-1 text-[11px] font-semibold text-foreground">O que falta</div>
              <div className="min-h-0 flex-1 overflow-hidden text-[10px] leading-[15px]" data-testid="o-que-falta">
                {falta.length === 0 && !travado && <div className="text-[#15803d]">✓ pronto para salvar</div>}
                {faltaNoResumo(falta).visiveis.map((f) => <div key={f} className="truncate text-amber-700" title={f}>! {f}</div>)}
                {faltaNoResumo(falta).resto.length > 0 && <div className="text-muted-foreground" title={faltaNoResumo(falta).resto.join('\n')} data-testid="falta-mais">+{faltaNoResumo(falta).resto.length}</div>}
                {recusaAlemDaLista(cronograma?.recusa, falta) && <div className="line-clamp-2 text-destructive" title={cronograma?.recusa ?? undefined}>! {cronograma?.recusa}</div>}
                {travado && !(credito.documentos ?? []).some((d) => d.especie === 'cedula') && <div className="text-amber-700">! cédula não anexada</div>}
              </div>
            </aside>
          </div>
        )}
        <div className="flex h-[40px] shrink-0 items-center gap-2 border-t px-3">
          <span className={`min-w-0 flex-1 truncate text-[10px] ${recusa ? 'text-destructive' : 'text-muted-foreground'}`} title={recusa ?? undefined} data-testid="recado-do-cadastro">
            {recusa ?? salvoAgora ?? (editando ? 'o cabeçalho grava direto · o cronograma muda pelo "Regerar parcelas em aberto"' : travado ? 'Contrato salvo · liberações, destinação e documentos gravam direto no contrato' : 'campos com * são obrigatórios')}
          </span>
          <Button variant="outline" size="sm" className="h-[24px] text-[10px]" onClick={aoFechar}>{travado ? 'Fechar' : 'Cancelar'}</Button>
          {escolha !== 'parcelado' && (
            <Button size="sm" className="h-[24px] text-[10px]" disabled={gravando} onClick={() => void salvar()} data-testid="salvar-cadastro">
              {gravando ? 'Salvando…' : editando ? 'Salvar cabeçalho' : travado ? 'Concluir' : cons ? 'Salvar consórcio' : 'Salvar contrato'}
            </Button>
          )}
        </div>
        <NovoFornecedorDialog open={novoCredor} onClose={() => setNovoCredor(false)} clienteId={clienteId}
          onSelecionar={(f) => set('credorId', f.id)}
          onSave={async (nome, cpfCnpj) => { const novo = await criarFornecedorDaCasa(clienteId, { nome, cpfCnpj, fazendaId: form.fazendaId }); set('credorId', novo.id); setNovoCredor(false); }} />
      </DialogContent>
    </Dialog>
  );
}
