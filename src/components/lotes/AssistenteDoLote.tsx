/**
 * LOTE-ETAPAS-01 (Gabriel 11/11 08:45, D1–D4; mock ui-validar/lote-etapas.html; Chat 11/11 14:45) — o assistente "+ Novo lote" (e
 * "Editar identidade") por etapas: Atividade → Categoria e sexo (filtrada pela atividade) → Situação (cria) / Programa e sistema
 * (recria, engorda) → Raça e genética (os mamotes ao pé da parida, com o carimbo obrigatório) → Nome do lote (código fixo, apelido,
 * anotação, a ficha com "completar"). Obrigatório só atividade, categoria, raça e o carimbo da parida; o resto nunca trava. Lote NOVO
 * nasce no código ATIV-CAT-RAÇA[-carimbo] (o banco põe o -02 se repetir); lote de antes segue ATIV-CAT-RAÇA-NN. Plano = fatia 2.
 * Base de LOTES-03 F1: trilho à esquerda, cartões do CADASTRO DO CLIENTE com busca, "Cadastrar nova…", ✎ editar (LOTE-SIGLA-EDITAR-01)
 * e Desfazer; modal de ALTURA FIXA, botões sempre no mesmo lugar; Esc fecha, Enter e duplo clique avançam.
 * Grava só pelo banco: `fn_lote_cadastro_salvar` (cadastros) e `fn_lote_salvar` (o lote). Cabeça, peso, GMD e pasto não se digitam aqui.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as KeyboardEventReact, type ReactNode } from 'react';
import { Pencil, Plus, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker, formatIsoToBr } from '@/components/ui/date-picker';
import { Ajuda } from '@/components/ui/ajuda';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { notificarLotesMudaram } from '@/hooks/useLotesDaFazenda';
import { useCadastrosDoLote, fraseDoErro, type CadastroParaSalvar } from '@/hooks/useCadastrosDoLote';
import {
  CRUZAMENTOS_DOS_MAMOTES, ORDENS_DO_PARTO, SEMENS_DOS_MAMOTES, SEXOS_DOS_MAMOTES, SITUACOES_DA_CRIA, ehParida,
  type CadastroDoLote, type LoteDaLista, type TipoDoCadastro, type TrocaDeCodigo,
} from '@/lib/lotes/tipos';
import {
  PASSOS, aceitaCarimbo, camposParaSalvar, categoriasDaAtividade, codigoDoAssistente, escolhidoNoPasso, faseDaAtividade, faltaNoPasso,
  fichaDoAssistente, filtrarCadastros, fraseCurtaDaTroca, fraseDaTroca, legendaDoCodigo, lotesQueUsam, nomeDe, perfilInicial, resumoDoRebanho,
  siglaDe, siglaDigitada, ultimoPassoAlcancavel, validarCadastro, validarPerfil,
  type Escolha, type ErroNoCampo, type Perfil,
} from '@/lib/lotes/assistente';

export interface PropsDoAssistente {
  open: boolean;
  clienteId: string;
  fazendaId: string;
  fazendaRotulo: string;
  lotesDaFazenda: LoteDaLista[];
  editar?: LoteDaLista | null;
  onFechar(): void;
  onPronto(r: { id: string; codigo: string; codigoAntigo: string | null }): void;
}

export const FRASE_ERRO_SALVAR = 'Não consegui gravar o lote. Tente de novo.';
export const FRASE_FALTA_CARIMBO = 'Falta o carimbo dos mamotes';

type TipoDeCartao = 'categoria' | 'raca' | 'atividade';
/* os passos de cartões: atividade · categoria · raça (o 3, com os mamotes embaixo) */
const TIPO_DO_PASSO: Record<number, TipoDeCartao> = { 0: 'atividade', 1: 'categoria', 3: 'raca' };
const COISA: Record<TipoDoCadastro, string> = { categoria: 'categoria', raca: 'raça', atividade: 'atividade', sistema: 'sistema', programa: 'programa', destino: 'destino' };

/** O formulário do "Cadastrar nova…" / ✎ (no lugar dos cartões ou do passo da situação). */
interface FormDoCadastro { tipo: TipoDoCadastro; id: string | null; sigla: string; siglaDeHoje: string; nome: string; categorias: string[]; usos: number }
/** A prévia da troca de sigla em uso (do banco, `p_simular`): para qual sigla e os lotes que mudam de código. */
interface PreviaDaSigla { sigla: string; trocas: TrocaDeCodigo[] }
/** O aviso do topo (não empurra nada): o Desfazer depois de cadastrar, ou a recusa do banco. */
interface Aviso { texto: string; erro: boolean; desfazer?: () => void }

const escolhaVazia: Escolha = { categoriaId: null, racaId: null, atividadeId: null };

export function AssistenteDoLote({ open, clienteId, fazendaId, fazendaRotulo, lotesDaFazenda, editar, onFechar, onPronto }: PropsDoAssistente) {
  const hoje = hojeLocal();
  const { cadastros, categoriasDoRebanho, erro: erroDosCadastros, salvarCadastro, simularCadastro } = useCadastrosDoLote(open ? clienteId : null);
  const [passo, setPasso] = useState(0);
  const [escolha, setEscolha] = useState<Escolha>(escolhaVazia);
  const [perfil, setPerfil] = useState<Perfil>(() => perfilInicial(hoje, editar));
  const [busca, setBusca] = useState('');
  const [todasAsCategorias, setTodasAsCategorias] = useState(false);
  const [form, setForm] = useState<FormDoCadastro | null>(null);
  const [erroDoForm, setErroDoForm] = useState<ErroNoCampo | null>(null);
  const [erroDoPerfil, setErroDoPerfil] = useState<{ campo: keyof Perfil; mensagem: string } | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [gravando, setGravando] = useState(false);
  const [previa, setPrevia] = useState<PreviaDaSigla | null>(null);
  /* o código do lote em edição depois de uma troca de sigla (o `editar` que veio da lista é o de antes) */
  const [codigoDoEditado, setCodigoDoEditado] = useState<string | null>(null);
  const buscaRef = useRef<HTMLInputElement>(null);

  /* abrir = começar do zero (ou da identidade do lote, na edição) */
  useEffect(() => {
    if (!open) return;
    setPasso(0); setBusca(''); setForm(null); setAviso(null); setErroDoForm(null); setErroDoPerfil(null); setGravando(false); setPrevia(null);
    setCodigoDoEditado(null); setTodasAsCategorias(false);
    setEscolha(editar ? { categoriaId: editar.categoriaId, racaId: editar.racaId, atividadeId: editar.atividadeId } : escolhaVazia);
    setPerfil(perfilInicial(hoje, editar));
  }, [open, editar, hoje]);

  const alcancavel = ultimoPassoAlcancavel(escolha);
  const tipoDoPasso = TIPO_DO_PASSO[passo];
  const fase = faseDaAtividade(siglaDe(cadastros, escolha.atividadeId));
  const idsDosMamotes = useMemo(() => categoriasDoRebanho.filter(c => c.codigo.startsWith('mamotes')).map(c => c.id), [categoriasDoRebanho]);
  /* cria = a regra de sempre do carimbo (atividade CRI/CR ou categoria de mamotes): situação das matrizes e mamotes ao pé */
  const cria = aceitaCarimbo(cadastros, escolha, idsDosMamotes);
  const parida = cria && ehParida(perfil.situacaoCria);
  const opcoes = useMemo(() => {
    if (!tipoDoPasso) return [];
    const achados = filtrarCadastros(cadastros, tipoDoPasso, busca);
    return tipoDoPasso === 'categoria' && !todasAsCategorias ? categoriasDaAtividade(achados, fase, categoriasDoRebanho, escolha.categoriaId) : achados;
  }, [cadastros, tipoDoPasso, busca, todasAsCategorias, fase, categoriasDoRebanho, escolha.categoriaId]);
  const categoriasFora = tipoDoPasso === 'categoria' && !todasAsCategorias ? filtrarCadastros(cadastros, 'categoria', busca).length - opcoes.length : 0;
  const ultimo = passo === PASSOS.length - 1;
  const falta = faltaNoPasso(escolha, perfil, passo, cria);

  const irPara = (i: number) => {
    if (form || i > alcancavel || i < 0) return;
    setPasso(i); setBusca(''); setErroDoPerfil(null);
    if (TIPO_DO_PASSO[i]) setTimeout(() => buscaRef.current?.focus(), 10);
  };

  const escolher = (tipo: TipoDeCartao, id: string) => {
    setEscolha(e => ({ ...e, ...(tipo === 'categoria' ? { categoriaId: id } : tipo === 'raca' ? { racaId: id } : { atividadeId: id }) }));
  };

  const gravarLote = useCallback(async () => {
    const erroP = validarPerfil(perfil, hoje);
    if (erroP) { setErroDoPerfil(erroP); if (erroP.campo === 'carimbo') setPasso(3); return; }
    const criaAntes = editar ? aceitaCarimbo(cadastros, { categoriaId: editar.categoriaId, racaId: editar.racaId, atividadeId: editar.atividadeId }, idsDosMamotes) : cria;
    const campos = camposParaSalvar(escolha, perfil, cria, editar, criaAntes);
    if (editar && Object.keys(campos).length === 0) { onPronto({ id: editar.id, codigo: codigoDoEditado ?? editar.codigo, codigoAntigo: null }); return; }
    setGravando(true);
    const { data, error } = await (supabase as any).rpc('fn_lote_salvar', editar
      ? { p_id: editar.id, p_fazenda: null, p_campos: campos, p_versao: editar.versao, p_motivo: null, p_simular: false }
      : { p_id: null, p_fazenda: fazendaId, p_campos: campos, p_versao: null, p_motivo: null, p_simular: false });
    setGravando(false);
    if (error) {
      console.error('[fn_lote_salvar]', error);
      setAviso({ texto: error.code === '40001' && typeof error.message === 'string' ? error.message : fraseDoErro(error, FRASE_ERRO_SALVAR), erro: true });
      return;
    }
    const id = typeof data === 'object' && data !== null ? Reflect.get(data, 'id') : null;
    const codigo = typeof data === 'object' && data !== null ? Reflect.get(data, 'codigo') : null;
    const antigo = typeof data === 'object' && data !== null ? Reflect.get(data, 'codigo_antigo') : null;
    if (typeof id !== 'string' || typeof codigo !== 'string') { setAviso({ texto: FRASE_ERRO_SALVAR, erro: true }); return; }
    notificarLotesMudaram(fazendaId);
    onPronto({ id, codigo, codigoAntigo: typeof antigo === 'string' ? antigo : null });
  }, [perfil, hoje, escolha, editar, cria, cadastros, idsDosMamotes, codigoDoEditado, fazendaId, onPronto]);

  const avancar = () => {
    if (form || gravando || falta) return;
    if (!ultimo) { irPara(passo + 1); return; }
    void gravarLote();
  };

  /* ── cadastrar novo / editar cadastro ── */
  const abrirForm = (tipo: TipoDoCadastro, c: CadastroDoLote | null) => {
    setErroDoForm(null);
    const termo = busca.trim();
    setForm(c
      ? { tipo, id: c.id, sigla: c.sigla ?? '', siglaDeHoje: c.sigla ?? '', nome: c.nome, categorias: [...c.categoriasRebanho], usos: lotesQueUsam(lotesDaFazenda, c, false) }
      : { tipo, id: null, sigla: termo.length <= 3 ? siglaDigitada(termo) : '', siglaDeHoje: '', nome: termo.length > 3 ? termo : '', categorias: [], usos: 0 });
  };

  /* LOTE-SIGLA-EDITAR-01 — trocar a sigla de um cadastro que já existe: o banco diz (sem gravar) quais lotes mudam de código.
     Vai com o nome e as categorias de hoje: a prévia mede só a sigla (o erro do nome aparece ao salvar, no campo dele). */
  const siglaQueMuda = form && form.id && form.sigla !== form.siglaDeHoje && /^[A-Z0-9]{2,3}$/.test(form.sigla) ? form.sigla : null;
  const cadastroDoForm = form?.id ? cadastros.find(c => c.id === form.id) ?? null : null;
  useEffect(() => {
    if (!siglaQueMuda || !cadastroDoForm) { setPrevia(null); return; }
    let vivo = true;
    const t = setTimeout(() => {
      void simularCadastro({ tipo: cadastroDoForm.tipo, id: cadastroDoForm.id, sigla: siglaQueMuda, nome: cadastroDoForm.nome,
        categorias: cadastroDoForm.categoriasRebanho, ativo: true }).then(r => {
        if (!vivo) return;
        if (r.ok) setPrevia({ sigla: siglaQueMuda, trocas: r.trocas });
        else setErroDoForm({ campo: 'sigla', mensagem: r.mensagem });
      });
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [siglaQueMuda, cadastroDoForm, simularCadastro]);

  /* depois de gravar uma troca: a lista relê e o cabeçalho mostra o código novo do lote em edição */
  const aplicarTrocas = (trocas: readonly TrocaDeCodigo[]) => {
    if (trocas.length === 0) return;
    notificarLotesMudaram(fazendaId);
    const minha = editar ? trocas.find(t => t.id === editar.id) : undefined;
    if (minha) setCodigoDoEditado(minha.depois);
  };

  const gravarForm = async () => {
    if (!form) return;
    const comSigla = form.tipo === 'categoria' || form.tipo === 'raca' || form.tipo === 'atividade';
    const e = validarCadastro({ tipo: form.tipo, sigla: form.sigla, nome: form.nome, categorias: form.categorias, existentes: cadastros, idEditando: form.id });
    if (e) { setErroDoForm(e); return; }
    const antes = form.id ? cadastros.find(c => c.id === form.id) ?? null : null;
    const pedido: CadastroParaSalvar = { tipo: form.tipo, id: form.id, sigla: comSigla ? form.sigla.trim().toUpperCase() : null,
      nome: form.nome.trim(), categorias: form.tipo === 'categoria' ? form.categorias : [], ativo: true };
    const r = await salvarCadastro(pedido);
    if (!r.ok) { setErroDoForm({ campo: form.tipo === 'categoria' || comSigla ? 'sigla' : 'nome', mensagem: r.mensagem }); return; }
    const coisa = COISA[form.tipo];
    const rotulo = `${coisa[0].toUpperCase()}${coisa.slice(1)} ${pedido.sigla ?? pedido.nome}`;
    if (!antes) {
      escolherDoForm(form.tipo, r.id);
      setAviso({ texto: `${rotulo} cadastrada e escolhida`, erro: false, desfazer: async () => {
        const d = await salvarCadastro({ ...pedido, id: r.id, ativo: false });
        if (!d.ok) { setAviso({ texto: d.mensagem, erro: true }); return; }
        desescolher(form.tipo, r.id); setAviso(null);
      } });
    } else {
      aplicarTrocas(r.trocas);
      const n = r.trocas.length;
      setAviso({ texto: n ? `${rotulo} salva · ${n} lote${n > 1 ? 's mudaram' : ' mudou'} de código` : `${rotulo} salva`, erro: false, desfazer: async () => {
        const d = await salvarCadastro({ tipo: antes.tipo, id: antes.id, sigla: antes.sigla, nome: antes.nome, categorias: antes.categoriasRebanho, ativo: true });
        if (d.ok) aplicarTrocas(d.trocas);
        setAviso(d.ok ? null : { texto: d.mensagem, erro: true });
      } });
    }
    setForm(null); setBusca(''); setPrevia(null);
  };

  const escolherDoForm = (tipo: TipoDoCadastro, id: string) => {
    if (tipo === 'categoria' || tipo === 'raca' || tipo === 'atividade') escolher(tipo, id);
    else setPerfil(p => ({ ...p, ...(tipo === 'sistema' ? { sistemaId: id } : tipo === 'programa' ? { programaId: id } : { destinoId: id }) }));
  };
  const desescolher = (tipo: TipoDoCadastro, id: string) => {
    setEscolha(e => ({
      categoriaId: tipo === 'categoria' && e.categoriaId === id ? null : e.categoriaId,
      racaId: tipo === 'raca' && e.racaId === id ? null : e.racaId,
      atividadeId: tipo === 'atividade' && e.atividadeId === id ? null : e.atividadeId,
    }));
    setPerfil(p => ({ ...p, sistemaId: p.sistemaId === id ? null : p.sistemaId, programaId: p.programaId === id ? null : p.programaId,
      destinoId: p.destinoId === id ? null : p.destinoId }));
  };

  /* teclado: Enter avança (fora de campo e de botão); Esc fecha o formulário antes do modal */
  const aoTeclar = (ev: KeyboardEventReact<HTMLDivElement>) => {
    const alvo = ev.target;
    if (ev.key !== 'Enter' || form) return;
    if (alvo instanceof HTMLInputElement || alvo instanceof HTMLButtonElement || alvo instanceof HTMLTextAreaElement) return;
    ev.preventDefault(); avancar();
  };
  const aoTeclarNaBusca = (ev: KeyboardEventReact<HTMLInputElement>) => {
    if (ev.key !== 'Enter' || !tipoDoPasso) return;
    ev.preventDefault();
    if (busca.trim() && opcoes.length === 1) { escolher(tipoDoPasso, opcoes[0].id); setBusca(''); irPara(passo + 1); return; }
    avancar();
  };

  const codigo = codigoDoAssistente(cadastros, escolha, perfil.carimbo, lotesDaFazenda, editar);
  const passoAtual = PASSOS[passo];
  const mudarPerfil = (p: Perfil) => { setPerfil(p); setErroDoPerfil(null); };
  const pergunta = passo === 2 ? (cria ? 'Situação e programa' : 'Programa e sistema') : passoAtual.pergunta;
  const subtitulo = passo === 2 && !cria ? 'Como esse gado vai ser conduzido. Opcional.'
    : passo === 3 ? (cria ? 'Das matrizes e, se tiver cria ao pé, dos mamotes.' : passoAtual.subtitulo) : passoAtual.subtitulo;
  const dica = form ? '' : tipoDoPasso ? 'Clique para escolher · duplo clique ou Enter avança' : passo === 2 ? 'Opcional · Enter avança'
    : editar ? 'Salvar grava a nova identidade; o código antigo fica no histórico' : 'O que faltar fica como “completar” na ficha';

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent data-testid="assistente-do-lote"
        onEscapeKeyDown={ev => { if (form) { ev.preventDefault(); setForm(null); } }}
        onKeyDown={aoTeclar}
        className="flex h-[min(548px,calc(100vh-16px))] w-[min(900px,calc(100vw-20px))] max-w-none flex-col gap-0 overflow-hidden bg-[#e4e8ee] p-0 [&>button:last-child]:text-white">
        {/* cabeçalho navy */}
        <div className="flex h-[42px] flex-none items-center gap-2.5 whitespace-nowrap bg-primary px-3.5 pr-12 text-primary-foreground">
          <DialogTitle className="text-[13.5px] font-semibold leading-none">{editar ? `Editar identidade · ${codigoDoEditado ?? editar.codigo}` : 'Novo lote'}</DialogTitle>
          <DialogDescription className="text-[11px] text-primary-foreground/80" data-testid="assistente-fazenda">Fazenda {fazendaRotulo}</DialogDescription>
        </div>

        {/* o aviso do topo: Desfazer ou a recusa do banco (camada; não empurra) */}
        {aviso && (
          <div data-testid="assistente-aviso" className={cn('absolute left-1/2 top-[48px] z-10 flex -translate-x-1/2 items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-1.5 text-[11px] text-white shadow-lg',
            aviso.erro ? 'bg-[#7f1d1d]' : 'bg-[#0f1b2d]')}>
            <span>{aviso.texto}</span>
            {aviso.desfazer && <button type="button" className="font-semibold text-[#9cc3ff]" onClick={aviso.desfazer} data-testid="assistente-desfazer">Desfazer</button>}
            <button type="button" aria-label="Fechar o aviso" className="opacity-60 hover:opacity-100" onClick={() => setAviso(null)}><X className="h-3 w-3" /></button>
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-[214px_minmax(0,1fr)] gap-2.5 p-2.5">
          {/* trilho */}
          <div className="flex min-h-0 flex-col rounded-lg border border-[#d3d9e2] bg-white p-2.5" data-testid="assistente-trilho">
            {PASSOS.map((s, i) => {
              const valor = valorDoPasso(i, cadastros, escolha, perfil, cria);
              const feito = i !== passo && valor != null;
              return (
                <button key={s.chave} type="button" disabled={i > alcancavel || !!form} onClick={() => irPara(i)} data-testid={`assistente-passo-${i}`}
                  className={cn('mb-0.5 grid grid-cols-[22px_minmax(0,1fr)] items-start gap-x-2 rounded-md px-1.5 py-1 text-left disabled:cursor-default',
                    i === passo ? 'bg-[#eef3fa]' : i <= alcancavel ? 'hover:bg-[#f3f6fa]' : '')}>
                  <span className={cn('row-span-2 flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] text-[10.5px] font-bold',
                    i === passo ? 'border-primary bg-primary text-white' : feito ? 'border-[#1f6b4a] bg-[#1f6b4a] text-white' : 'border-[#c2cad6] bg-white text-muted-foreground')}>
                    {feito ? '✓' : i + 1}
                  </span>
                  <span className={cn('whitespace-nowrap text-[11.5px] font-semibold', i === passo ? 'text-primary' : 'text-[#4b5563]')}>
                    {i === 2 ? (cria ? 'Situação e programa' : 'Programa e sistema') : s.titulo}
                  </span>
                  <span className={cn('h-[26px] break-words text-[10px] leading-[13px]', feito ? 'text-foreground' : 'text-muted-foreground')} title={valor ?? undefined}
                    data-testid={`assistente-passo-valor-${i}`}>
                    {valor ?? (i === passo ? 'escolhendo…' : '—')}
                  </span>
                </button>
              );
            })}
            <div className="mt-auto border-t border-[#e3e7ee] pt-2.5">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">Código do lote
                <Ajuda titulo="Código do lote" oQueE="Montado sozinho a cada escolha: atividade · categoria · raça e, na parida, o carimbo."
                  porQue="É o que aparece no Fechamento, no mapa e nos relatórios. A situação das matrizes fica fora: o código não muda com o manejo."
                  comoFazer="Repetido na fazenda, o banco põe -02, -03 no fim. Os lotes de antes seguem com o nº (ATIV-CAT-RAÇA-NN)." />
              </div>
              <div className="my-0.5 whitespace-nowrap text-[19px] font-extrabold text-[#0b1f3a]" data-testid="assistente-codigo">
                {codigo.split('-').map((p, i) => <span key={i}>{i > 0 ? '-' : ''}<span className={p === '__' ? 'text-[#c2cad6]' : ''}>{p}</span></span>)}
              </div>
              <div className="whitespace-nowrap text-[9.5px] text-muted-foreground" data-testid="assistente-legenda">{legendaDoCodigo(editar)}</div>
            </div>
          </div>

          {/* o passo */}
          <div className="flex min-h-0 flex-col rounded-lg border border-[#d3d9e2] bg-white px-3.5 pb-2.5 pt-3">
            <div className="flex h-[22px] items-center gap-2 whitespace-nowrap">
              <h2 className="m-0 w-[240px] flex-none text-[13.5px] font-semibold text-[#0b1f3a]">{pergunta}</h2>
              <Ajuda titulo={passoAtual.titulo} {...passoAtual.ajuda} />
              <span className="ml-auto text-[10.5px] text-muted-foreground">passo {passo + 1} de {PASSOS.length}</span>
            </div>
            <div className="mb-2 mt-0.5 h-4 truncate text-[11px] text-[#4b5563]" title={subtitulo}>{subtitulo}</div>
            {erroDosCadastros && <div className="mb-1 text-[11px] text-destructive">{erroDosCadastros}</div>}

            {form ? (
              <FormularioDoCadastro form={form} erro={erroDoForm} categoriasDoRebanho={categoriasDoRebanho}
                previa={previa && previa.sigla === form.sigla ? previa.trocas : null}
                onMudar={f => { setForm(f); setErroDoForm(null); }} onCancelar={() => { setForm(null); setErroDoForm(null); setPrevia(null); }} onGravar={() => void gravarForm()} />
            ) : tipoDoPasso ? (
              <>
                <div className="mb-2 flex h-[26px] items-center gap-2">
                  <Input ref={buscaRef} value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={aoTeclarNaBusca} autoFocus
                    placeholder="Buscar sigla ou nome" className="h-[26px] w-[220px] text-[11px]" data-testid="assistente-busca" />
                  <span className="whitespace-nowrap text-[10.5px] text-muted-foreground">
                    {cadastros.filter(c => c.tipo === tipoDoPasso).length} no cadastro
                    {escolhidoNoPasso(escolha, tipoDoPasso) ? ` · escolhido: ${siglaDe(cadastros, escolhidoNoPasso(escolha, tipoDoPasso))}` : ''}
                  </span>
                  {tipoDoPasso === 'categoria' && fase && (categoriasFora > 0 || todasAsCategorias) && (
                    <button type="button" className="ml-auto whitespace-nowrap text-[10.5px] font-semibold text-primary hover:underline" data-testid="assistente-todas-categorias"
                      onClick={() => setTodasAsCategorias(t => !t)}>
                      {todasAsCategorias ? `Só as de ${fase}` : `Mostrar todas (+${categoriasFora})`}
                    </button>
                  )}
                </div>
                <div className={cn('grid min-h-0 flex-1 auto-rows-[72px] content-start gap-2 overflow-y-auto pb-0.5 pl-0.5 pr-1.5 pt-0.5 [scrollbar-gutter:stable] [grid-template-columns:repeat(auto-fill,minmax(146px,1fr))]',
                  tipoDoPasso === 'raca' && cria && 'auto-rows-[64px]')}
                  data-testid="assistente-cartoes">
                  {opcoes.map(c => {
                    const sel = escolhidoNoPasso(escolha, tipoDoPasso) === c.id;
                    const n = lotesQueUsam(lotesDaFazenda, c);
                    const doRebanho = tipoDoPasso === 'categoria' ? categoriasDoRebanho.filter(r => c.categoriasRebanho.includes(r.id)) : [];
                    const detalhe = tipoDoPasso === 'categoria' ? resumoDoRebanho(doRebanho)
                      : n ? `${n} lote${n > 1 ? 's' : ''} ativo${n > 1 ? 's' : ''}` : 'nenhum lote ativo';
                    const detalheInteiro = tipoDoPasso === 'categoria' ? doRebanho.map(r => r.nome.toLowerCase()).join(' + ') : detalhe;
                    return (
                      <div key={c.id} role="button" tabIndex={0} data-testid="assistente-cartao" title={c.nome}
                        onClick={() => escolher(tipoDoPasso, c.id)} onDoubleClick={() => { escolher(tipoDoPasso, c.id); setBusca(''); setPasso(p => p + 1); }}
                        onKeyDown={ev => { if (ev.key === ' ') { ev.preventDefault(); escolher(tipoDoPasso, c.id); } }}
                        className={cn('group relative flex min-w-0 cursor-pointer flex-col justify-center rounded-lg border-[1.5px] bg-white px-2.5 py-[7px] text-left',
                          sel ? 'border-primary bg-[#eef3fa] shadow-[0_0_0_2px_rgba(31,58,95,.15)]' : 'border-[#d3d9e2] hover:border-[#94a3b8] hover:bg-[#fafcff]')}>
                        <span className="text-[17px] font-extrabold leading-5 text-[#0b1f3a]">{c.sigla}</span>
                        <span className="truncate text-[11px] leading-[15px]">{c.nome}</span>
                        <span className="whitespace-nowrap text-[10px] leading-[13px] text-muted-foreground" title={detalheInteiro} data-testid="assistente-cartao-detalhe">{detalhe}</span>
                        {tipoDoPasso === 'categoria' && n > 0 && <span className="absolute right-[26px] top-[7px] text-[9.5px] text-muted-foreground">{n} lote{n > 1 ? 's' : ''}</span>}
                        <button type="button" aria-label={`Editar o cadastro ${c.sigla}`} title="Editar cadastro" data-testid="assistente-editar-cadastro"
                          onClick={ev => { ev.stopPropagation(); abrirForm(tipoDoPasso, c); }}
                          className="absolute right-1 top-1 hidden h-[19px] w-[19px] items-center justify-center rounded text-muted-foreground hover:bg-[#e9eef5] hover:text-[#0b1f3a] group-hover:flex">
                          <Pencil className="h-3 w-3" />
                        </button>
                        {sel && <span className="absolute bottom-1.5 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">✓</span>}
                      </div>
                    );
                  })}
                  {opcoes.length === 0 && busca.trim() && <div className="col-span-full px-1 py-4 text-[11px] text-muted-foreground">Nada com “{busca.trim()}”. Cadastre ao lado.</div>}
                  <button type="button" onClick={() => abrirForm(tipoDoPasso, null)} data-testid="assistente-cadastrar-nova"
                    className="flex min-w-0 flex-col items-center justify-center rounded-lg border-[1.5px] border-dashed border-[#d3d9e2] bg-[#fbfcfe] text-center text-primary hover:border-[#94a3b8]">
                    <Plus className="h-4 w-4" />
                    <span className="text-[11px] font-semibold">{passoAtual.cadastrarNova}</span>
                  </button>
                </div>
                {tipoDoPasso === 'raca' && cria && <MamotesAoPe perfil={perfil} parida={parida} erro={erroDoPerfil} onPerfil={mudarPerfil} />}
              </>
            ) : passo === 2 ? (
              <PassoDaSituacao cria={cria} cadastros={cadastros} perfil={perfil} onPerfil={mudarPerfil} onCadastrar={t => abrirForm(t, null)} />
            ) : (
              <PassoDoNome codigo={codigo} cadastros={cadastros} escolha={escolha} perfil={perfil} cria={cria} erro={erroDoPerfil} hoje={hoje} onPerfil={mudarPerfil} />
            )}
          </div>
        </div>

        {/* rodapé: os botões nunca mudam de lugar */}
        <div className="flex h-[50px] flex-none items-center gap-2 border-t border-[#dde2e9] bg-white px-3.5">
          <Button variant="ghost" size="sm" className="h-[30px] min-w-[92px] text-[11.5px]" onClick={onFechar} data-testid="assistente-cancelar">Cancelar</Button>
          <span className={cn('truncate text-[10.5px]', falta === FRASE_FALTA_CARIMBO ? 'font-semibold text-[#b45309]' : 'text-muted-foreground')} data-testid="assistente-dica">
            {form ? '' : falta === FRASE_FALTA_CARIMBO ? falta : dica}
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" className="h-[30px] min-w-[92px] text-[11.5px]" disabled={passo === 0 || !!form} onClick={() => irPara(passo - 1)}
              data-testid="assistente-voltar">‹ Voltar</Button>
            <Button size="sm" className="h-[30px] min-w-[92px] text-[11.5px]" data-testid="assistente-avancar" title={falta ?? undefined}
              disabled={!!form || gravando || !!falta} onClick={avancar}>
              {ultimo ? (editar ? 'Salvar' : 'Salvar lote') : 'Avançar ›'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** O que o trilho escreve embaixo de cada passo (null = ainda nada). */
function valorDoPasso(i: number, cadastros: readonly CadastroDoLote[], e: Escolha, p: Perfil, cria: boolean): string | null {
  const parte = (id: string | null) => (id ? `${siglaDe(cadastros, id) ?? ''} · ${nomeDe(cadastros, id) ?? ''}` : null);
  if (i === 0) return parte(e.atividadeId);
  if (i === 1) return parte(e.categoriaId);
  if (i === 2) {
    /* no trilho, curto (2 linhas reservadas, nunca "…"): a situação e o programa; o sistema fica na ficha do passo Nome */
    const partes = [cria ? p.situacaoCria : null, cria ? p.ordemParto : null, nomeDe(cadastros, p.programaId) ?? nomeDe(cadastros, p.sistemaId)]
      .filter((x): x is string => !!x);
    return partes.length ? partes.join(' · ') : null;
  }
  if (i === 3) return e.racaId ? `${parte(e.racaId)}${cria && ehParida(p.situacaoCria) ? ` · mamotes ${p.carimbo.trim() || '?'}` : ''}` : null;
  return p.nomeCampeiro.trim() || null;
}

/** Os botões de uma lista (sigla em negrito + nome); clicar no escolhido limpa (nada aqui é obrigatório). */
function Chips<T extends string>({ lista, valor, onEscolher, desligado, testid }: {
  lista: readonly (readonly [T, string, string])[]; valor: T | null; onEscolher(v: T | null): void; desligado?: boolean; testid: string;
}) {
  return (
    <div className="flex flex-wrap gap-1" data-testid={testid}>
      {lista.map(([v, sigla, nome]) => {
        const on = valor === v;
        return (
          <button key={v} type="button" aria-pressed={on} disabled={desligado} title={nome} onClick={() => onEscolher(on ? null : v)}
            className={cn('h-[23px] whitespace-nowrap rounded-[5px] border px-1.5 text-[10.5px] disabled:cursor-default disabled:opacity-45',
              on ? 'border-primary bg-primary text-primary-foreground' : 'border-[#dde2e9] bg-white')}>
            <b className="mr-1">{sigla}</b>{nome}
          </button>
        );
      })}
    </div>
  );
}

/** Uma linha rótulo | campo (o rótulo em 112px; o `*` = obrigatório). */
function Linha({ rotulo, obrigatorio, children }: { rotulo: string; obrigatorio?: boolean; children: ReactNode }) {
  return (
    <div className="grid min-h-[27px] grid-cols-[112px_minmax(0,1fr)] items-center gap-x-2 py-[2px]">
      <span className="whitespace-nowrap text-[10.5px] text-[#374151]">{rotulo}{obrigatorio && <em className="not-italic text-destructive"> *</em>}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Passo 3 — cria: a situação das matrizes e a ordem de parto (listas fixas, D2); TODAS as atividades: programa e sistema do cadastro do
 *  cliente (+ cadastrar), como nome curto (Chat 12/11 09:20: a novilha em reprodução também tem programa). Nada aqui é obrigatório. */
function PassoDaSituacao({ cria, cadastros, perfil, onPerfil, onCadastrar }: {
  cria: boolean; cadastros: readonly CadastroDoLote[]; perfil: Perfil; onPerfil(p: Perfil): void; onCadastrar(t: TipoDoCadastro): void;
}) {
  const doCadastro = (tipo: 'programa' | 'sistema', campo: 'programaId' | 'sistemaId') => (
    <div className="flex flex-wrap gap-1" data-testid={`assistente-opcoes-${tipo}`}>
      {cadastros.filter(c => c.tipo === tipo).map(c => {
        const on = perfil[campo] === c.id;
        return (
          <button key={c.id} type="button" aria-pressed={on} title={c.nome} onClick={() => onPerfil({ ...perfil, [campo]: on ? null : c.id })}
            className={cn('h-[23px] whitespace-nowrap rounded-[5px] border px-1.5 text-[10.5px]', on ? 'border-primary bg-primary text-primary-foreground' : 'border-[#dde2e9] bg-white')}>
            {c.nome}
          </button>
        );
      })}
      <button type="button" onClick={() => onCadastrar(tipo)} title={`Cadastrar ${COISA[tipo]}`} data-testid={`assistente-cadastrar-${tipo}`}
        className="flex h-[23px] items-center gap-1 whitespace-nowrap rounded-[5px] border border-dashed border-[#b8c3d3] px-1.5 text-[10.5px] text-primary">
        <Plus className="h-3 w-3 flex-none" />cadastrar
      </button>
    </div>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="assistente-situacao">
      {cria && (
        <>
          <Linha rotulo="Situação"><Chips testid="assistente-situacao-cria" lista={SITUACOES_DA_CRIA} valor={perfil.situacaoCria} onEscolher={v => onPerfil({ ...perfil, situacaoCria: v })} /></Linha>
          <Linha rotulo="Ordem de parto"><Chips testid="assistente-ordem-parto" lista={ORDENS_DO_PARTO} valor={perfil.ordemParto} onEscolher={v => onPerfil({ ...perfil, ordemParto: v })} /></Linha>
          <div className="my-1 border-t border-[#eef0f3]" />
        </>
      )}
      <Linha rotulo="Programa">{doCadastro('programa', 'programaId')}</Linha>
      <Linha rotulo="Onde (sistema)">{doCadastro('sistema', 'sistemaId')}</Linha>
      {cria && (
        <div className="mt-2 rounded-md bg-[#f5f7fa] px-2.5 py-1.5 text-[10.5px] leading-[15px] text-[#4b5563]">
          Parida (PA, PP ou VZ) pede o carimbo dos mamotes no passo seguinte. Prenha (mojada) nunca pede. Situação e programa ficam fora do código.
        </div>
      )}
    </div>
  );
}

/** Passo 4, embaixo das raças — os mamotes ao pé (cria). Parida: carimbo obrigatório e a genética; senão, só o carimbo (opcional). */
function MamotesAoPe({ perfil, parida, erro, onPerfil }: {
  perfil: Perfil; parida: boolean; erro: { campo: keyof Perfil; mensagem: string } | null; onPerfil(p: Perfil): void;
}) {
  const erroDoCarimbo = erro?.campo === 'carimbo' ? erro.mensagem : null;
  return (
    <div className="mt-2 flex-none border-t border-[#e3e7ee] pt-1.5" data-testid="assistente-mamotes">
      <div className="mb-0.5 whitespace-nowrap text-[10.5px] font-semibold text-[#374151]">
        Mamotes ao pé{!parida && <span className="font-normal text-muted-foreground"> · só na parida (PA, PP ou VZ)</span>}
      </div>
      <Linha rotulo={parida ? 'Carimbo' : 'Carimbo · opcional'} obrigatorio={parida}>
        <div className="flex items-center gap-2">
          <Input value={perfil.carimbo} placeholder="7.1" maxLength={6} aria-label="Carimbo do lote" data-testid="assistente-carimbo"
            onChange={e => onPerfil({ ...perfil, carimbo: e.target.value.toUpperCase().replace(/[^0-9R.]/g, '') })}
            className={cn('h-[24px] w-[72px] text-[11.5px] font-bold', erroDoCarimbo && 'border-destructive')} />
          <span className={cn('min-w-0 whitespace-nowrap text-[9.5px]', erroDoCarimbo ? 'text-destructive' : 'text-muted-foreground')} data-testid="assistente-carimbo-nota">
            {erroDoCarimbo ?? 'mês.lote: 7.1 ou 7R (ressinc.)'}
          </span>
        </div>
      </Linha>
      <Linha rotulo="Sexo"><Chips testid="assistente-mamotes-sexo" lista={SEXOS_DOS_MAMOTES} valor={perfil.mamotesSexo} desligado={!parida} onEscolher={v => onPerfil({ ...perfil, mamotesSexo: v })} /></Linha>
      <Linha rotulo="Cruzamento"><Chips testid="assistente-mamotes-cruzamento" lista={CRUZAMENTOS_DOS_MAMOTES} valor={perfil.mamotesCruzamento} desligado={!parida} onEscolher={v => onPerfil({ ...perfil, mamotesCruzamento: v })} /></Linha>
      <Linha rotulo="Sêmen / touro"><Chips testid="assistente-mamotes-semen" lista={SEMENS_DOS_MAMOTES} valor={perfil.mamotesSemen} desligado={!parida} onEscolher={v => onPerfil({ ...perfil, mamotesSemen: v })} /></Linha>
    </div>
  );
}

/** Passo 5 — o código (fixo), o apelido (= nome do campeiro, D4), a anotação, a data de formação e a ficha com "completar". */
function PassoDoNome({ codigo, cadastros, escolha, perfil, cria, erro, hoje, onPerfil }: {
  codigo: string; cadastros: readonly CadastroDoLote[]; escolha: Escolha; perfil: Perfil; cria: boolean;
  erro: { campo: keyof Perfil; mensagem: string } | null; hoje: string; onPerfil(p: Perfil): void;
}) {
  const ficha = fichaDoAssistente(cadastros, escolha, perfil, cria);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="assistente-nome">
      <Linha rotulo="Código"><b className="whitespace-nowrap text-[16px] text-[#0b1f3a]" data-testid="assistente-nome-codigo">{codigo}</b></Linha>
      <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-x-3">
        <div>
          <Rotulo>Apelido · opcional</Rotulo>
          <Input value={perfil.nomeCampeiro} maxLength={40} placeholder="ex.: Retiro, Vacas do 12" data-testid="assistente-nome-campeiro"
            onChange={e => onPerfil({ ...perfil, nomeCampeiro: e.target.value })}
            className={cn('h-[27px] text-[11.5px]', erro?.campo === 'nomeCampeiro' && 'border-destructive')} />
          <Nota erro={erro?.campo === 'nomeCampeiro' ? erro.mensagem : null}>como a fazenda chama o lote; entra na busca e no mapa</Nota>
        </div>
        <div>
          <Rotulo>Formado em</Rotulo>
          <DatePicker value={perfil.formadoEm} onChange={v => onPerfil({ ...perfil, formadoEm: v })} size="compact" data-testid="assistente-formado-em" />
          <Nota erro={erro?.campo === 'formadoEm' ? erro.mensagem : null}>{perfil.formadoEm === hoje ? 'hoje' : formatIsoToBr(perfil.formadoEm)}</Nota>
        </div>
      </div>
      <div className="mt-1">
        <Rotulo>Anotação · opcional</Rotulo>
        <Input value={perfil.anotacao} maxLength={120} placeholder="ex.: veio da 3M, brinco amarelo" data-testid="assistente-anotacao"
          onChange={e => onPerfil({ ...perfil, anotacao: e.target.value })}
          className={cn('h-[27px] text-[11.5px]', erro?.campo === 'anotacao' && 'border-destructive')} />
        <Nota erro={erro?.campo === 'anotacao' ? erro.mensagem : null}>até 120 letras; fica na ficha do lote</Nota>
      </div>
      <div className="mt-1.5 border-t border-[#e3e7ee] pt-1.5 text-[10.5px] font-semibold text-[#374151]">Ficha</div>
      <table className="w-full table-fixed border-collapse text-[10.5px]" data-testid="assistente-ficha">
        <colgroup><col style={{ width: 132 }} /><col /></colgroup>
        <tbody>
          {ficha.map(l => (
            <tr key={l.rotulo} className="h-[19px] border-t border-[#eef0f3]">
              <td className="truncate px-1 text-muted-foreground">{l.rotulo}</td>
              <td className="truncate px-1" title={l.valor ?? undefined}>
                {l.valor ?? <span className="font-semibold text-[#b45309]" data-testid="assistente-completar">completar</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Rotulo({ children }: { children: string }) {
  return <label className="mb-0.5 block whitespace-nowrap text-[10px] text-[#4b5563]">{children}</label>;
}
/** O lugar fixo de 13px embaixo do campo: a dica ou o erro (vermelho). */
function Nota({ erro, children }: { erro?: string | null; children?: string }) {
  return <div className={cn('mt-0.5 h-[13px] truncate whitespace-nowrap text-[9.5px]', erro ? 'text-destructive' : 'text-muted-foreground')} title={erro ?? children}>{erro ?? children}</div>;
}

function FormularioDoCadastro({ form, erro, categoriasDoRebanho, previa, onMudar, onCancelar, onGravar }: {
  form: FormDoCadastro; erro: ErroNoCampo | null; categoriasDoRebanho: { id: string; nome: string }[]; previa: TrocaDeCodigo[] | null;
  onMudar(f: FormDoCadastro): void; onCancelar(): void; onGravar(): void;
}) {
  const comSigla = form.tipo === 'categoria' || form.tipo === 'raca' || form.tipo === 'atividade';
  const coisa = COISA[form.tipo];
  const fraseDaPrevia = previa ? fraseCurtaDaTroca(previa) || 'Nenhum lote muda de código.' : '';
  const previaInteira = previa ? fraseDaTroca(previa) : '';
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border-[1.5px] border-dashed border-[#b8c3d3] bg-[#fbfcfe] px-3.5 py-3" data-testid="assistente-form">
      <h3 className="m-0 mb-0.5 text-[12.5px] font-semibold text-[#0b1f3a]">{form.id ? `Editar ${coisa} · ${form.sigla || form.nome}` : `Nova ${coisa}`}</h3>
      <div className="mb-2.5 text-[10.5px] text-muted-foreground">
        {form.id ? (comSigla ? 'Sigla e nome mudam. Os códigos dos lotes mudam junto.' : 'O nome muda em todos os lotes.')
          : 'Entra no cadastro do cliente e já fica escolhida neste lote. Dá para desfazer logo depois.'}
      </div>
      <div className={cn('grid max-w-[520px] gap-x-3 gap-y-2.5', comSigla ? 'grid-cols-[100px_minmax(0,1fr)]' : 'grid-cols-[minmax(0,1fr)]')}>
        {comSigla && (
          <div>
            <Rotulo>Sigla</Rotulo>
            <Input value={form.sigla} maxLength={3} autoFocus data-testid="assistente-form-sigla"
              onChange={e => onMudar({ ...form, sigla: siglaDigitada(e.target.value) })}
              className={cn('h-[27px] text-[11.5px] font-bold', erro?.campo === 'sigla' && 'border-destructive')} />
            <Nota erro={erro?.campo === 'sigla' ? erro.mensagem : null}>2 ou 3 letras</Nota>
          </div>
        )}
        <div>
          <Rotulo>Nome</Rotulo>
          <Input value={form.nome} maxLength={32} autoFocus={!comSigla} data-testid="assistente-form-nome"
            onChange={e => onMudar({ ...form, nome: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onGravar(); } }}
            className={cn('h-[27px] text-[11.5px]', erro?.campo === 'nome' && 'border-destructive')} />
          <Nota erro={erro?.campo === 'nome' ? erro.mensagem : null}>como aparece nas listas</Nota>
        </div>
        {form.tipo === 'categoria' && (
          <div className="col-span-full">
            <Rotulo>Categorias do rebanho que entram neste tipo de lote</Rotulo>
            <div className="mt-0.5 flex flex-wrap gap-1.5" data-testid="assistente-form-rebanho">
              {categoriasDoRebanho.map(r => {
                const on = form.categorias.includes(r.id);
                return (
                  <button key={r.id} type="button" aria-pressed={on}
                    onClick={() => onMudar({ ...form, categorias: on ? form.categorias.filter(x => x !== r.id) : [...form.categorias, r.id] })}
                    className={cn('h-[23px] whitespace-nowrap rounded-[5px] border px-2 text-[11px]', on ? 'border-primary bg-primary text-primary-foreground' : 'border-[#dde2e9] bg-white')}>
                    {r.nome}
                  </button>
                );
              })}
            </div>
            <Nota erro={erro?.campo === 'categorias' ? erro.mensagem : null}>só essas categorias podem ser lançadas no lote</Nota>
          </div>
        )}
      </div>
      <div className="mt-auto flex items-center justify-end gap-2">
        <span className="mr-auto min-w-0 whitespace-nowrap text-[11px] text-[#24508f]" data-testid="assistente-form-previa" title={previaInteira || undefined}>
          {fraseDaPrevia}
        </span>
        <Button variant="outline" size="sm" className="h-[27px] text-[11.5px]" onClick={onCancelar} data-testid="assistente-form-cancelar">Cancelar</Button>
        <Button size="sm" className="h-[27px] text-[11.5px]" onClick={onGravar} data-testid="assistente-form-ok">{form.id ? 'Salvar' : 'Cadastrar e usar'}</Button>
      </div>
    </div>
  );
}

