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
import { useLarguraDaJanela } from '@/hooks/useLarguraDaJanela';
import { mostraResumo } from '@/lib/financiamentos/consorcio';
import { criarFornecedorDaCasa } from '@/lib/fornecedores/cadastroDaCasaBanco';
import { supabase } from '@/integrations/supabase/client';
import { useEdicaoDoContrato } from '@/hooks/useEdicaoDoContrato';
import { RegerarParcelas, TabelaDoCronograma } from '@/components/financiamentos/EdicaoDoContrato';
import { ConsorcioDialog } from '@/components/financiamentos/ConsorcioDialog';
import {
  contaDoCronograma, dadosDoCabecalho, faixaDoPrincipal, formDoContrato, motivoRegerarApagado, mudancasDasParcelas, semMudanca, tituloDaEdicao,
  FRASE_SALVE_PARCELAS_ANTES_DE_REGERAR, PLANO_JUROS_POR_ATIVIDADE, PLANO_PRINCIPAL_POR_ATIVIDADE, TEXTO_DA_ORIGEM,
  type CampoNaoCadastrado, type OrigemDaPeriodicidade, type ParcelaParaEditar,
} from '@/lib/financiamentos/edicaoDoContrato';
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
/* FIN-CONTRATO-CRONOGRAMA-01 — a régua da aba Condições: campos de 24px a 11px */
const CAMPO24 = 'h-6 text-[11px]';
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

function Campo({ rotulo, obrig, children, className = '', destaque }: { rotulo: string; obrig?: boolean; children: React.ReactNode; className?: string;
  /** FIN-CONTRATO-NC-SALVAR-01 — o campo que o Regerar pediu (rótulo em vermelho) */ destaque?: boolean }) {
  return (
    <div className={`min-w-0 ${className}`} data-destaque={destaque ? 'sim' : undefined}>
      <div className={`${ROTULO} ${destaque ? '!text-[#b91c1c] font-semibold' : ''}`} title={rotulo}>{rotulo}{obrig ? ' *' : ''}</div>
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
  /* FIN-CONTRATO-NC-SALVAR-01 — os "não cadastrados" como o BANCO os tem (na leitura e depois de cada Salvar): quem saiu desta lista
     na tela foi ESCOLHIDO e vai no pedido mesmo igual ao que a tela mostrava */
  const [ncNoBanco, setNcNoBanco] = useState<CampoNaoCadastrado[]>([]);
  const [destaque, setDestaque] = useState<CampoNaoCadastrado | null>(null);
  const [tituloEdicao, setTituloEdicao] = useState<string>('Editar contrato');
  /* FIN-CONTRATO-CRONOGRAMA-01 — o Regerar acontece NO LUGAR da tabela (a faixa e o antes × depois) */
  const [regerando, setRegerando] = useState(false);
  /* as parcelas editadas na aba (editar): nulo = como o banco as tem (`edicao.parcelas`, a mesma fonte da tela do contrato) */
  const [linhasEditadas, setLinhasEditadas] = useState<ParcelaParaEditar[] | null>(null);
  const [salvoAgora, setSalvoAgora] = useState<string | null>(null);
  /* FIN-CONTRATO-SALVAR-01 — o que impede o Salvar fica ESCRITO: a leitura que falhou, e o "Falta:" com cada item levando à aba dele */
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [faltaNoSalvar, setFaltaNoSalvar] = useState<string[] | null>(null);
  const [origemDaPeriodicidade, setOrigemDaPeriodicidade] = useState<OrigemDaPeriodicidade>('gravada');
  const edicao = useEdicaoDoContrato(financiamentoId ?? null, clienteAtual?.id ?? null);
  const [novoCredor, setNovoCredor] = useState(false);
  const [buscaP, setBuscaP] = useState(''); const [buscaJ, setBuscaJ] = useState('');
  const [linhas, setLinhas] = useState<OpcaoSearchable[]>([]);
  const credito = useContratoDeCredito(salvoId, clienteId);
  /* FIN-CONTRATO-SALVAR-01 — abaixo de 900px de janela o resumo lateral some (a régua do consórcio): os 240px vão para os campos */
  const comResumo = mostraResumo(useLarguraDaJanela());
  const set = <K extends keyof FormDoCadastro>(k: K, v: FormDoCadastro[K]) => { setForm((f) => ({ ...f, [k]: v })); setRecusa(null); setFaltaNoSalvar(null); setSalvoAgora(null); };
  const nc = (k: CampoNaoCadastrado) => naoCadastrado.includes(k);
  const cadastrar = (k: CampoNaoCadastrado) => { setNaoCadastrado((xs) => xs.filter((x) => x !== k)); setDestaque((d) => (d === k ? null : d)); };
  const escolhidos = ncNoBanco.filter((k) => !naoCadastrado.includes(k));
  const rotuloNc = (rotulo: string, k: CampoNaoCadastrado) => (nc(k) ? `${rotulo} · não cadastrado` : rotulo);

  /* modo editar: carrega o contrato gravado UMA vez por abertura */
  useEffect(() => {
    if (!aberto || !financiamentoId) return;
    let vivo = true;
    setErroLeitura(null);
    void (async () => {
      /* FIN-CONTRATO-SALVAR-01 — a leitura que falha NÃO cala o Salvar: o motivo fica escrito e o botão apagado com ele */
      try {
        const { data, error } = await supabase.from('financiamentos').select('*, financeiro_fornecedores!financiamentos_credor_id_fkey(nome)').eq('id', financiamentoId).maybeSingle();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela fora do types.ts
        const { data: cons, error: e2 } = await (supabase as any).from('financiamento_consorcio').select('*').eq('financiamento_id', financiamentoId).maybeSingle();
        /* as datas das parcelas vivas: de onde se infere a periodicidade que o contrato antigo não gravou */
        const { data: parc, error: e3 } = await supabase.from('financiamento_parcelas').select('data_vencimento, status').eq('financiamento_id', financiamentoId);
        if (!vivo) return;
        const erro = error ?? e2 ?? e3;
        if (erro) { setErroLeitura(`Não consegui carregar o contrato: ${erro.message ?? 'erro do banco'}`); return; }
        const vencs = (parc ?? []).filter((p) => p.status !== 'cancelado').map((p) => p.data_vencimento);
        const c = formDoContrato(data, cons, vencs);
        if (!c) { setErroLeitura(data ? 'Não consegui carregar o contrato: resposta fora do formato.' : 'Não consegui carregar o contrato: não encontrado.'); return; }
        setOrigemDaPeriodicidade(c.origemDaPeriodicidade);
        setForm(c.form); setOriginal(c.form); setNaoCadastrado(c.naoCadastrado); setNcNoBanco(c.naoCadastrado);
        setEscolha(c.form.natureza === 'consorcio' ? 'consorcio' : 'financiamento');
        setTituloEdicao(tituloDaEdicao(c.numero, c.credorNome));
        setAba(abaInicial ?? (c.form.natureza === 'consorcio' ? 'consorcio' : 'contrato'));
      } catch (e) {
        if (vivo) setErroLeitura(`Não consegui carregar o contrato: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
      }
    })();
    return () => { vivo = false; };
  }, [aberto, financiamentoId]); // eslint-disable-line react-hooks/exhaustive-deps -- carrega uma vez por abertura
  const cons = form.natureza === 'consorcio';

  useEffect(() => {
    if (!clienteId) return;
    void supabase.from('financiamento_linhas_credito').select('id, programa, descricao').eq('cliente_id', clienteId).then(({ data }) =>
      setLinhas((data ?? []).map((l) => ({ value: l.id, label: [l.programa, l.descricao].filter(Boolean).join(' · ') || 'linha de crédito' }))));
  }, [clienteId]);

  /* os planos padrão pela atividade (os mesmos do motor); o do consórcio é o "Consórcio a contemplar". FIN-CONTRATO-SALVAR-01: o dos
     JUROS também (o contrato antigo veio sem ele), e no editar depois de carregar — só preenche o que está vazio */
  const planoPorSub = useMemo(() => new Map(classificacoes.filter((c) => c.subcentro).map((c) => [c.subcentro ?? '', c])), [classificacoes]);
  const carregado = !editando || original !== null;
  useEffect(() => {
    if (!carregado) return;
    const pp = planoPorSub.get(cons ? SUBCENTRO_CONSORCIO : PLANO_PRINCIPAL_POR_ATIVIDADE[form.atividade] ?? '')?.id ?? null;
    const pj = cons ? null : planoPorSub.get(PLANO_JUROS_POR_ATIVIDADE[form.atividade] ?? '')?.id ?? null;
    setForm((f) => ((f.planoPrincipalId || !pp) && (f.planoJurosId || !pj) ? f
      : { ...f, planoPrincipalId: f.planoPrincipalId ?? pp, planoJurosId: f.planoJurosId ?? pj }));
  }, [cons, form.atividade, planoPorSub, carregado]);
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
  /* FIN-CONTRATO-NC-SALVAR-01 — UMA FONTE para o cronograma: com o cabeçalho da tela diferente do banco, o Regerar (que lê o banco) fica apagado */
  const motivoDoRegerar = editando && original ? motivoRegerarApagado(dadosDoCabecalho(original, form, naoCadastrado, escolhidos), naoCadastrado) : null;
  /* FIN-CONTRATO-CRONOGRAMA-01 — as linhas da tabela da aba Condições:
     · editar: as parcelas do banco (`edicao.parcelas` — a situação + a ajustada + os vínculos, o montador da tela do contrato), com o
       que foi editado na linha; a paga e a vinculada ficam em leitura;
     · novo Personalizado: as parcelas digitadas (editáveis); novo SAC / Price / Parcela única: a prévia do banco (`fn_financiamento_cronograma`). */
  const parcelasDoBanco = edicao.parcelas ?? null;
  const linhasDaTab: ParcelaParaEditar[] = editando ? (linhasEditadas ?? parcelasDoBanco ?? [])
    : form.sistema === 'livre'
      ? form.parcelas.map((p, i) => ({ id: null, numero: i + 1, vencimento: p.vencimento, principal: p.principal, juros: p.juros, ajustada: false, trava: null, situacao: null, pagoEm: null }))
      : (cronograma?.linhas ?? []).map((l) => ({ id: `previa-${l.numero}`, numero: l.numero, vencimento: l.vencimento, principal: l.principal, juros: l.juros,
          ajustada: false, trava: null, situacao: 'pendente' as const, pagoEm: null }));
  const tabEditavel = editando || form.sistema === 'livre';
  const mudancasDaTab = editando && parcelasDoBanco ? mudancasDasParcelas(parcelasDoBanco, linhasDaTab) : { alterar: [], acrescentar: [], retirar: [] };
  const motivoDoRegerarNaTab = motivoDoRegerar ?? (semMudanca(mudancasDaTab) ? null : FRASE_SALVE_PARCELAS_ANTES_DE_REGERAR);
  const faixa = faixaDoPrincipal(contaDoCronograma(linhasDaTab, form.valorTotal || null));
  const pagasDaTab = linhasDaTab.filter((l) => !!l.trava).length;
  const resumoDoBanco = editando && parcelasDoBanco ? contaDoCronograma(linhasDaTab, form.valorTotal || null) : null;
  const vencimentoFinalDaTab = linhasDaTab.reduce<string | null>((m, l) => (l.vencimento && (!m || l.vencimento > m) ? l.vencimento : m), null);
  const NOME_DO_NC: Record<CampoNaoCadastrado, string> = { sistema: 'Sistema', periodicidade: 'Periodicidade', tipoTaxa: 'Tipo de taxa', carenciaAte: 'Carência' };
  const naoImpedem = editando ? naoCadastrado.filter((k) => k === 'tipoTaxa' || k === 'carenciaAte').map((k) => NOME_DO_NC[k]) : [];
  const dicaDasCondicoes = editando
    ? `lido do banco · ${pagasDaTab} ${pagasDaTab === 1 ? 'travada' : 'travadas'} (paga ou vinculada) · ${linhasDaTab.length - pagasDaTab} em aberto você edita na linha`
    : 'contrato novo: o banco gera pelo sistema, prazo e 1º vencimento; depois ajuste na linha';
  const editarLinhas = (f: (ls: ParcelaParaEditar[]) => ParcelaParaEditar[]) => { setLinhasEditadas((ls) => f(ls ?? parcelasDoBanco ?? [])); setRecusa(null); setSalvoAgora(null); };
  const mudarNaTab = (i: number, p: Partial<ParcelaParaEditar>) => {
    if (editando) { editarLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...p, ajustada: true } : l))); return; }
    set('parcelas', form.parcelas.map((x, j) => (j === i ? { vencimento: p.vencimento !== undefined ? p.vencimento : x.vencimento, principal: p.principal ?? x.principal, juros: p.juros ?? x.juros } : x)));
  };
  const retirarNaTab = (i: number) => {
    if (editando) { editarLinhas((ls) => ls.filter((_x, j) => j !== i)); return; }
    set('parcelas', form.parcelas.filter((_x, j) => j !== i));
  };
  const acrescentarNaTab = () => {
    if (editando) { editarLinhas((ls) => [...ls, { id: null, numero: null, vencimento: null, principal: 0, juros: 0, ajustada: true, trava: null, situacao: null, pagoEm: null }]); return; }
    set('parcelas', [...form.parcelas, { vencimento: null, principal: 0, juros: 0 }]);
  };
  /* "Gerar N parcelas" (novo): leva as linhas que o banco gerou para a tabela, editáveis na linha — o sistema passa a Personalizado */
  const gerarNaTabela = () => {
    if (!cronograma?.linhas.length) return;
    setForm((f) => ({ ...f, sistema: 'livre', parcelas: cronograma.linhas.map((l) => ({ vencimento: l.vencimento, principal: l.principal, juros: l.juros })) }));
  };
  /* o motivo do Salvar apagado no editar: a leitura falhou ou ainda não chegou — nunca um Salvar que some calado */
  const motivoSemSalvar = editando ? (erroLeitura ?? (original ? null : 'Carregando o contrato…')) : null;
  /* FIN-CONTRATO-CRONOGRAMA-01 — UM Salvar: o cabeçalho (só o que mudou) e, quando há linhas editadas na aba, as parcelas
     (`editarParcelas(mudanças, false)`, o mesmo do "Editar parcelas"), nesta ordem; a recusa de qualquer um fica escrita no rodapé */
  const salvarEdicao = async () => {
    if (!original) { setRecusa(erroLeitura ?? 'O contrato ainda não carregou.'); return; }
    const dados = dadosDoCabecalho(original, form, naoCadastrado, escolhidos);
    const comParcelas = !semMudanca(mudancasDaTab);
    if (Object.keys(dados).length === 0 && !comParcelas) { setRecusa('Nenhuma mudança no cabeçalho nem nas parcelas.'); return; }
    if (Object.keys(dados).length > 0 && !(await salvarCabecalho(dados))) return;
    if (!comParcelas) return;
    setGravando(true);
    const r = await edicao.editarParcelas(mudancasDaTab, false);
    setGravando(false);
    if (r.recusa) { setRecusa(r.recusa); return; }
    setLinhasEditadas(null);
    setSalvoAgora(Object.keys(dados).length > 0 ? 'Cabeçalho e parcelas salvos.' : 'Parcelas salvas · pagas e vinculadas não mudaram.');
  };
  const salvarCabecalho = async (dados: Record<string, unknown>): Promise<boolean> => {
    setGravando(true);
    const r = await edicao.salvarCabecalho(dados, false);
    setGravando(false);
    if (r.recusa) { setRecusa(r.recusa); return false; }
    setOriginal(form); setNcNoBanco(naoCadastrado);
    if (financiamentoId) onSalvo?.(financiamentoId);
    if (r.corpo.cronograma_mudou === true) { setRegerando(true); setAba('condicoes'); setSalvoAgora('Cabeçalho salvo · o cronograma mudou: regere as parcelas em aberto na aba Condições.'); }
    else setSalvoAgora('Cabeçalho salvo.');
    return true;
  };
  const salvar = async (abaDepois?: Aba) => {
    if (editando) { await salvarEdicao(); return; }
    if (salvoId) { aoFechar(); return; }
    if (falta.length) { setRecusa(null); setFaltaNoSalvar(falta); return; }
    if (cronograma?.recusa) { setRecusa(cronograma.recusa); return; }
    setGravando(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_financiamento_criar', { p_dados: pedidoDeCriacao(form, clienteId), p_simular: false });
    setGravando(false);
    const id = typeof data === 'object' && data !== null && 'financiamento_id' in data && typeof data.financiamento_id === 'string' ? data.financiamento_id : null;
    if (error || !id) { setRecusa(error ? String(error.message ?? error).replace(/^(ERROR:\s*)?(P0001|42501):\s*/i, '') : 'Resposta do banco fora do formato.'); return; }
    setSalvoId(id);
    onSalvo?.(id);
    setAba(abaDepois ?? (cons ? 'documentos' : 'liberacoes'));
  };
  /* "Falta: …" leva à aba de cada item (os de condições moram na aba Condições; o resto, na do contrato) */
  const abaDoItem = (item: string): Aba => (/parcelas|periodicidade|sistema|taxa|carência/.test(item) ? 'condicoes' : cons ? 'consorcio' : 'contrato');

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
  /* FIN-CONTRATO-SALVAR-01 — a aba "antes" (liberações, destinação, documentos) só espera quando o contrato AINDA NÃO EXISTE; no editar
     ela abre. Clicada antes de salvar, ela mostra o que falta e o "Salvar e continuar" (nunca só um tooltip) */
  const abaEsperaContrato = !!abas.find((a) => a.valor === aba)?.antes && !salvoId;
  const sugeridoPelaAtividade = editando && !!original && !original.planoJurosId && !!form.planoJurosId;

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

  /* o seletor de natureza continua oferecendo as três (o estreitamento do `if` abaixo tiraria a do consórcio) */
  const valorDaEscolha = escolha;
  /* FIN-CONSORCIO-02 — consórcio novo (ou editado por aqui) é o cadastro próprio dele. */
  if (escolha === 'consorcio') {
    return <ConsorcioDialog aberto={aberto} aoFechar={aoFechar} financiamentoId={financiamentoId ?? null} onSalvo={onSalvo}
      onOutraNatureza={editando ? undefined : () => escolher('financiamento')} />;
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[min(720px,calc(100vh-16px))] w-[min(1150px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0" data-testid="cadastro-de-contrato">
        <div className="flex h-[34px] shrink-0 items-center bg-primary px-3 text-primary-foreground">
          <DialogTitle className="min-w-0 truncate text-[11px] font-semibold" title={editando ? tituloEdicao : undefined} data-testid="titulo-do-cadastro">
            {editando ? tituloEdicao : `${travado ? 'Contrato salvo' : cons ? 'Novo consórcio' : 'Novo contrato'} · ${clienteAtual?.nome ?? ''}`}
          </DialogTitle>
          <DialogDescription className="sr-only">Cadastro de contrato</DialogDescription>
        </div>
        <div className="flex h-[34px] shrink-0 items-center gap-3 border-b px-3">
          <Segmentado altura={22} valor={valorDaEscolha} onEscolher={escolher} opcoes={[
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
          <div className={`grid min-h-0 flex-1 ${comResumo ? 'grid-cols-[minmax(0,1fr)_240px]' : 'grid-cols-1'}`}>
            <div className="campos-uma-linha flex min-h-0 min-w-0 flex-col bg-muted px-3 pt-2" data-testid="corpo-do-cadastro">
              <div className="mb-1.5 shrink-0">
                <Segmentado altura={22} valor={aba} onEscolher={setAba}
                  opcoes={abas.map((a) => ({ valor: a.valor, rotulo: a.rotulo, title: a.antes && !salvoId ? MOTIVO_SALVE_ANTES : undefined }))} />
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-testid={`aba-${aba}`}>
                {(aba === 'contrato' || aba === 'consorcio') && (
                  <fieldset disabled={travado} className="flex min-h-0 flex-col gap-1.5">
                    <Bloco nome="Identificação" testId="bloco-identificacao"
                      grade={cons ? 'grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1.5fr)_minmax(0,1.8fr)_minmax(0,1.3fr)_minmax(0,1fr)]'}>
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
                            {form.contemplado && form.formaContemplacao === 'lance' && <div className="w-[124px]"><CampoMoeda className={CAMPO} valor={form.lanceValor} onChange={(v) => set('lanceValor', v ?? 0)} /></div>}
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
                  /* ⚠ `min-w-0`: o fieldset nasce com largura mínima pelo conteúdo — sem ele a tabela (min-width) empurra a aba para fora
                     do modal em vez de rolar dentro do cartão (medido a 750px: a coluna Situação sumia, cortada) */
                  <fieldset disabled={travado} className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
                    {/* FIN-CONTRATO-CRONOGRAMA-01 — as condições em DUAS linhas de campos de 24px a 11px: Sistema · Taxa · Tipo · Carência /
                        Periodicidade · Nº parcelas · 1º vencimento · o botão (Gerar no novo, Regerar em aberto no editar). Nº e 1º
                        vencimento valem para todo sistema. */}
                    <section className={`${BLOCO_DO_CONTRATO} shrink-0`} data-testid="bloco-condicoes">
                      <Titulo nome="Condições" dica={dicaDasCondicoes} />
                      <div className="flex flex-col gap-1">
                        <div className="flex items-end gap-2.5" data-testid="condicoes-linha-1">
                          <Campo rotulo={rotuloNc('Sistema de amortização', 'sistema')} obrig destaque={destaque === 'sistema'}>
                            <Segmentado<SistemaDoCadastro | ''> altura={24} valor={nc('sistema') ? '' : form.sistema} onEscolher={(v) => { if (v !== '') { cadastrar('sistema'); set('sistema', v); } }}
                              opcoes={(['sac', 'price', 'bullet', 'livre'] satisfies SistemaDoCadastro[]).map((s) => ({ valor: s, rotulo: ROTULO_DO_SISTEMA[s] }))} />
                          </Campo>
                          <Campo rotulo="Taxa (% a.a.)" obrig className="w-[92px] shrink-0"><CampoPercentual className={CAMPO24} valor={form.taxaAa} onChange={(v) => set('taxaAa', v ?? 0)} /></Campo>
                          <Campo rotulo={rotuloNc('Tipo de taxa', 'tipoTaxa')}><Segmentado<'pre' | 'pos' | ''> altura={24} valor={nc('tipoTaxa') ? '' : form.tipoTaxa}
                            onEscolher={(v) => { if (v !== '') { cadastrar('tipoTaxa'); set('tipoTaxa', v); } }} opcoes={[{ valor: 'pre', rotulo: 'Pré' }, { valor: 'pos', rotulo: 'Pós (CDI/TLP)' }]} /></Campo>
                          <Campo rotulo={nc('carenciaAte') ? 'Carência · não cadastrada' : 'Carência até'} className="w-[132px] shrink-0">
                            <DatePicker size="compact" className={CAMPO24} value={form.carenciaAte ?? ''} onChange={(v) => { cadastrar('carenciaAte'); set('carenciaAte', v || null); }} /></Campo>
                        </div>
                        <div className="flex items-end gap-2.5" data-testid="condicoes-linha-2">
                          <Campo rotulo={nc('periodicidade') && origemDaPeriodicidade !== 'gravada' ? (origemDaPeriodicidade === 'parcelas' ? 'Periodicidade · inferida das parcelas · confirme' : `Periodicidade · ${TEXTO_DA_ORIGEM[origemDaPeriodicidade]}`) : rotuloNc('Periodicidade', 'periodicidade')} obrig>
                            <Segmentado<Periodicidade | ''> altura={24} sugestao={nc('periodicidade') && origemDaPeriodicidade !== 'gravada'} valor={nc('periodicidade') && origemDaPeriodicidade === 'gravada' ? '' : form.periodicidade} onEscolher={(v) => { if (v !== '') { cadastrar('periodicidade'); set('periodicidade', v); } }}
                              opcoes={(['mensal', 'trimestral', 'semestral', 'anual'] satisfies Periodicidade[]).map((p) => ({ valor: p, rotulo: ROTULO_DA_PERIODICIDADE[p],
                                title: nc('periodicidade') && origemDaPeriodicidade !== 'gravada' ? 'sugestão: clique para confirmar e salve o cabeçalho' : undefined }))} />
                          </Campo>
                          <Campo rotulo="Nº parcelas" obrig className="w-[78px] shrink-0">
                            <Input className={CAMPO24} inputMode="numeric" value={form.n || ''} onChange={(e) => set('n', Number(e.target.value.replace(/\D/g, '').slice(0, 3)) || 0)} data-testid="n-parcelas" />
                          </Campo>
                          <Campo rotulo="1º vencimento" obrig className="w-[132px] shrink-0">
                            <DatePicker size="compact" className={CAMPO24} value={form.primeiroVencimento ?? ''} onChange={(v) => set('primeiroVencimento', v || null)} /></Campo>
                          {editando
                            ? <Button variant="outline" size="sm" className="h-6 shrink-0 text-[11px]" disabled={!!motivoDoRegerarNaTab || regerando} title={motivoDoRegerarNaTab ?? undefined}
                                onClick={() => setRegerando(true)} data-testid="abrir-regerar">Regerar em aberto</Button>
                            : <Button variant="outline" size="sm" className="h-6 shrink-0 text-[11px]" disabled={form.sistema === 'livre' || !(cronograma?.linhas.length)}
                                title={form.sistema === 'livre' ? 'Personalizado: digite as parcelas na tabela' : 'leva as parcelas geradas pelo banco para a tabela, editáveis na linha (o sistema passa a Personalizado)'}
                                onClick={gerarNaTabela} data-testid="gerar-parcelas">{cronograma?.linhas.length ? `Gerar ${cronograma.linhas.length} parcelas` : 'Gerar parcelas'}</Button>}
                        </div>
                      </div>
                    </section>
                    {regerando && editando && !motivoDoRegerarNaTab
                      ? <RegerarParcelas api={edicao} onCampoFaltando={setDestaque} ajustadasEmAberto={linhasDaTab.filter((l) => l.ajustada && !l.trava).length}
                          onVoltar={() => setRegerando(false)}
                          onFeito={() => { setRegerando(false); setLinhasEditadas(null); setSalvoAgora('Parcelas em aberto regeradas · desfazer pela tela do contrato (Editar parcelas).'); }} />
                      : (<>
                        {/* a faixa de 24px: N parcelas · principal, a conferência com o contratado (nunca corrige), o motivo do Regerar apagado, "+ parcela" */}
                        <div className="flex h-[24px] shrink-0 items-center gap-2 text-[11px]" data-testid="faixa-do-cronograma">
                          <span className="shrink-0 tabular-nums" data-testid="principal-do-cronograma">{faixa.texto}</span>
                          {faixa.conferencia && <span className={`shrink-0 tabular-nums ${faixa.confere ? 'text-[#15803d]' : 'font-medium text-amber-700'}`} data-testid="conferencia-do-principal">{faixa.conferencia}</span>}
                          <span className="uma-linha-que-rola min-w-0 flex-1 font-medium text-amber-800" data-testid={motivoDoRegerarNaTab ? 'motivo-do-regerar' : undefined}
                            title={motivoDoRegerarNaTab ?? undefined}>{motivoDoRegerarNaTab ?? ''}</span>
                          <Button variant="outline" size="sm" className="h-[22px] shrink-0 gap-1 px-2 text-[11px]" disabled={!tabEditavel} data-testid="acrescentar-parcela"
                            title={tabEditavel ? undefined : 'Escolha Personalizado ou clique Gerar para ajustar na linha'} onClick={acrescentarNaTab}><Plus className="size-3" /> parcela</Button>
                        </div>
                        <TabelaDoCronograma modo="editar" linhas={linhasDaTab} contratado={form.valorTotal || null} editavel={tabEditavel}
                          onMudar={mudarNaTab} onRetirar={retirarNaTab} testId="tabela-da-aba-condicoes"
                          vazio={editando ? (edicao.parcelas === null || edicao.parcelas === undefined ? 'lendo as parcelas do banco' : 'Sem parcelas.') : (cronograma?.recusa ?? 'Preencha as condições para ver o cronograma.')} />
                      </>)}
                  </fieldset>
                )}
                {aba === 'parcelas' && tabela}
                {abaEsperaContrato && (
                  <PainelAntesDeSalvar aba={aba} falta={falta} gravando={gravando} onSalvar={() => void salvar(aba)}
                    onIrPara={(item) => setAba(abaDoItem(item))} />
                )}
                {aba === 'liberacoes' && salvoId && <div className="min-h-0 flex-1 overflow-y-auto"><BlocoLiberacoes api={credito} contaDoContrato={null} onAbrirLancamento={() => undefined} clienteId={clienteId} /></div>}
                {aba === 'destinacao' && salvoId && <div className="min-h-0 flex-1 overflow-y-auto"><BlocoDestinacoes api={credito} /></div>}
                {aba === 'documentos' && salvoId && <div className="min-h-0 flex-1 overflow-y-auto"><BlocoDocumentos api={credito} /></div>}
              </div>
            </div>
            {/* o resumo fixo à direita (240px, a régua A18): os números do cronograma do BANCO */}
            {comResumo && <aside className="flex min-h-0 flex-col overflow-hidden border-l bg-muted/20 px-3 pt-2" data-testid="resumo-do-cadastro">
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
                {editando && <div className={`mb-0.5 h-[14px] text-[10px] ${motivoDoRegerar ? 'text-amber-800' : 'text-muted-foreground'}`} data-testid="origem-do-resumo">
                  {motivoDoRegerar ? 'prévia da tela · não gravado' : 'como está gravado'}</div>}
                <LinhaResumo rotulo="Valor contratado" valor={`R$ ${num2(form.valorTotal)}`} />
                <LinhaResumo rotulo="Sistema" valor={`${nc('sistema') ? 'não cadastrado' : ROTULO_DO_SISTEMA[form.sistema]} · ${ROTULO_DA_PERIODICIDADE[form.periodicidade].toLowerCase()}${nc('periodicidade') && origemDaPeriodicidade === 'parcelas' ? ' (inferida)' : ''}`} />
                <LinhaResumo rotulo="Taxa" valor={`${num2(form.taxaAa)}% a.a. ${form.tipoTaxa === 'pre' ? 'pré' : 'pós'}`} />
                <LinhaResumo rotulo="Carência" valor={form.carenciaAte ? `até ${br(form.carenciaAte)}` : '—'} />
                {/* FIN-CONTRATO-CRONOGRAMA-01 — no editar (com o cabeçalho igual ao do banco) o resumo é o cronograma GRAVADO — as linhas da aba */}
                {resumoDoBanco ? (<>
                  <LinhaResumo rotulo="Parcelas" valor={`${resumoDoBanco.parcelas}${resumoDoBanco.pagas ? ` · ${resumoDoBanco.pagas} ${resumoDoBanco.pagas === 1 ? 'paga' : 'pagas'}` : ''}`} />
                  <LinhaResumo rotulo="1º vencimento" valor={br(linhasDaTab[0]?.vencimento ?? null)} />
                  <LinhaResumo rotulo="Vencimento final" valor={br(vencimentoFinalDaTab)} />
                  <LinhaResumo rotulo="Juros previstos" valor={`R$ ${num2(resumoDoBanco.juros)}`} />
                  <LinhaResumo rotulo="Total a pagar" valor={`R$ ${num2(resumoDoBanco.total)}`} forte />
                </>) : (<>
                <LinhaResumo rotulo="Parcelas" valor={textoDasParcelas(cronograma)} />
                <LinhaResumo rotulo="Vencimento final" valor={br(cronograma?.vencimentoFinal ?? null)} />
                <LinhaResumo rotulo="Juros previstos" valor={cronograma ? `R$ ${num2(cronograma.jurosTotal)}` : '—'} />
                <LinhaResumo rotulo="Total a pagar" valor={cronograma ? `R$ ${num2(cronograma.total)}` : '—'} forte />
                </>)}
              </>)}
              <div className="mb-0.5 mt-2 border-t pt-1 text-[11px] font-semibold text-foreground">O que falta</div>
              <div className="min-h-0 flex-1 overflow-hidden text-[10px] leading-[15px]" data-testid="o-que-falta">
                {falta.length === 0 && !travado && naoImpedem.length === 0 && <div className="text-[#15803d]">✓ pronto para salvar</div>}
                {/* FIN-CONTRATO-CRONOGRAMA-01 — o que não impede salvar fica em âmbar, dito como tal */}
                {naoImpedem.length > 0 && <div className="break-words text-amber-700" data-testid="falta-nao-impede">! {naoImpedem.join(' e ')}: não cadastrados (não impedem salvar)</div>}
                {faltaNoResumo(falta).visiveis.map((f) => <div key={f} className="truncate text-amber-700" title={f}>! {f}</div>)}
                {faltaNoResumo(falta).resto.length > 0 && <div className="text-muted-foreground" title={faltaNoResumo(falta).resto.join('\n')} data-testid="falta-mais">+{faltaNoResumo(falta).resto.length}</div>}
                {recusaAlemDaLista(cronograma?.recusa, falta) && <div className="line-clamp-2 text-destructive" title={cronograma?.recusa ?? undefined}>! {cronograma?.recusa}</div>}
                {travado && !(credito.documentos ?? []).some((d) => d.especie === 'cedula') && <div className="text-amber-700">! cédula não anexada</div>}
              </div>
            </aside>}
          </div>
        )}
        <div className="flex h-[44px] shrink-0 items-center gap-2 border-t px-3">
          {/* FIN-CONTRATO-SALVAR-01 — faixa de 11px que QUEBRA a linha (nunca reticências): o que impede o Salvar fica inteiro */}
          <div className={`max-h-[40px] min-w-0 flex-1 overflow-y-auto break-words text-[11px] leading-[13px] ${recusa || faltaNoSalvar || (editando && erroLeitura) ? 'text-destructive' : 'text-muted-foreground'}`}
            data-testid="recado-do-cadastro">
            {faltaNoSalvar ? (<>Falta: {faltaNoSalvar.map((item, i) => (
              <span key={item}>{i > 0 ? ', ' : ''}<button type="button" className="underline underline-offset-2" onClick={() => setAba(abaDoItem(item))} data-testid="falta-item">{item}</button></span>
            ))}.</>)
              : recusa ?? (editando && erroLeitura) ?? salvoAgora ?? (sugeridoPelaAtividade ? 'plano dos juros sugerido pela atividade · salve para gravar'
                : editando ? 'o cabeçalho grava direto · o cronograma muda pelo "Regerar parcelas em aberto"' : travado ? 'Contrato salvo · liberações, destinação e documentos gravam direto no contrato' : 'campos com * são obrigatórios')}
          </div>
          <Button variant="outline" size="sm" className="h-[24px] text-[10px]" onClick={aoFechar}>{travado ? 'Fechar' : 'Cancelar'}</Button>
          {escolha !== 'parcelado' && (
            <Button size="sm" className={`h-[24px] text-[10px] ${motivoDoRegerar ? 'ring-2 ring-amber-500 ring-offset-1' : ''}`} data-destaque={motivoDoRegerar ? 'sim' : undefined} disabled={gravando || !!motivoSemSalvar} title={motivoSemSalvar ?? undefined} onClick={() => void salvar()} data-testid="salvar-cadastro">
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

/** FIN-CONTRATO-SALVAR-01 — a aba que precisa do contrato gravado, clicada antes de salvar: diz por quê, o que falta (a MESMA lista do
 *  resumo e do Salvar) e oferece "Salvar e continuar", que grava e abre a aba. */
const NOME_DA_ABA: Partial<Record<Aba, string>> = { liberacoes: 'liberações', destinacao: 'a destinação', documentos: 'documentos' };
function PainelAntesDeSalvar({ aba, falta, gravando, onSalvar, onIrPara }: {
  aba: Aba; falta: string[]; gravando: boolean; onSalvar: () => void; onIrPara: (item: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-[11px]" data-testid="painel-antes-de-salvar">
      <div className="font-semibold">Para lançar {NOME_DA_ABA[aba] ?? 'aqui'}, o contrato precisa existir.</div>
      {falta.length > 0 ? (
        <div className="break-words text-amber-700" data-testid="painel-falta">Falta: {falta.map((item, i) => (
          <span key={item}>{i > 0 ? ', ' : ''}<button type="button" className="underline underline-offset-2" onClick={() => onIrPara(item)}>{item}</button></span>
        ))}.</div>
      ) : <div className="text-[#15803d]">✓ nada falta: dá para salvar agora.</div>}
      <div><Button size="sm" className="h-[24px] text-[10px]" disabled={gravando} onClick={onSalvar} data-testid="salvar-e-continuar">
        {gravando ? 'Salvando…' : 'Salvar e continuar'}</Button></div>
    </div>
  );
}
