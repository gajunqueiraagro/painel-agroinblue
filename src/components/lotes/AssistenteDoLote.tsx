/**
 * LOTES-03 F1 — o assistente "+ Novo lote" (e "Editar identidade"), igual ao mock lotes-03-assistente.html (Gabriel 06/11 15:45):
 * Categoria → Raça → Atividade → Nº automático → Perfil e metas (opcional). Trilho à esquerda com o código CAT-RAÇA-ATIV-NN montando;
 * cartões do CADASTRO DO CLIENTE (nada de lista fixa) com busca, "Cadastrar nova…", ✎ editar (sigla travada se algum lote usa) e
 * Desfazer logo depois de cadastrar. Modal de ALTURA FIXA, fundo cinza com blocos brancos, botões sempre no mesmo lugar; Esc fecha,
 * Enter e duplo clique avançam.
 * Grava só pelo banco: `fn_lote_cadastro_salvar` (cadastros) e `fn_lote_salvar` (o lote). Cabeça, peso, GMD e pasto não se digitam aqui.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as KeyboardEventReact, type ReactNode } from 'react';
import { Pencil, Plus, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker, formatIsoToBr } from '@/components/ui/date-picker';
import { CampoNumeroComConta } from '@/components/ui/campo-numero-com-conta';
import { Ajuda } from '@/components/ui/ajuda';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { notificarLotesMudaram } from '@/hooks/useLotesDaFazenda';
import { useCadastrosDoLote, fraseDoErro, type CadastroParaSalvar } from '@/hooks/useCadastrosDoLote';
import type { CadastroDoLote, LoteDaLista, TipoDoCadastro } from '@/lib/lotes/tipos';
import {
  PASSOS, aceitaCarimbo, camposParaSalvar, codigoMontando, escolhidoNoPasso, filtrarCadastros, lotesDaCombinacao, lotesQueUsam,
  mesmaCombinacao, nomeDe, perfilInicial, podeAvancar, siglaDe, siglaDigitada, ultimoPassoAlcancavel, validarCadastro, validarPerfil,
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

export const FRASE_ERRO_NUMERO = 'Não consegui ler o próximo número. Feche e abra de novo.';
export const FRASE_ERRO_SALVAR = 'Não consegui gravar o lote. Tente de novo.';

type TipoDeCartao = 'categoria' | 'raca' | 'atividade';
const TIPO_DO_PASSO: Record<number, TipoDeCartao> = { 0: 'categoria', 1: 'raca', 2: 'atividade' };
const COISA: Record<TipoDoCadastro, string> = { categoria: 'categoria', raca: 'raça', atividade: 'atividade', sistema: 'sistema', programa: 'programa', destino: 'destino' };

/** O formulário do "Cadastrar nova…" / ✎ (no lugar dos cartões ou do passo 5). */
interface FormDoCadastro { tipo: TipoDoCadastro; id: string | null; sigla: string; nome: string; categorias: string[]; usos: number }
/** O aviso do topo (não empurra nada): o Desfazer depois de cadastrar, ou a recusa do banco. */
interface Aviso { texto: string; erro: boolean; desfazer?: () => void }

const escolhaVazia: Escolha = { categoriaId: null, racaId: null, atividadeId: null };

export function AssistenteDoLote({ open, clienteId, fazendaId, fazendaRotulo, lotesDaFazenda, editar, onFechar, onPronto }: PropsDoAssistente) {
  const hoje = hojeLocal();
  const { cadastros, categoriasDoRebanho, erro: erroDosCadastros, salvarCadastro } = useCadastrosDoLote(open ? clienteId : null);
  const [passo, setPasso] = useState(0);
  const [escolha, setEscolha] = useState<Escolha>(escolhaVazia);
  const [perfil, setPerfil] = useState<Perfil>(() => perfilInicial(hoje, editar));
  const [busca, setBusca] = useState('');
  const [form, setForm] = useState<FormDoCadastro | null>(null);
  const [erroDoForm, setErroDoForm] = useState<ErroNoCampo | null>(null);
  const [erroDoPerfil, setErroDoPerfil] = useState<{ campo: keyof Perfil; mensagem: string } | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [proximo, setProximo] = useState<number | null>(null);
  const [gravando, setGravando] = useState(false);
  const buscaRef = useRef<HTMLInputElement>(null);

  /* abrir = começar do zero (ou da identidade do lote, na edição) */
  useEffect(() => {
    if (!open) return;
    setPasso(0); setBusca(''); setForm(null); setAviso(null); setErroDoForm(null); setErroDoPerfil(null); setGravando(false);
    setEscolha(editar ? { categoriaId: editar.categoriaId, racaId: editar.racaId, atividadeId: editar.atividadeId } : escolhaVazia);
    setPerfil(perfilInicial(hoje, editar));
  }, [open, editar, hoje]);

  /* o número: na mesma combinação da edição, o dele; senão o próximo livre DA FAZENDA, lido do banco */
  const completa = !!(escolha.categoriaId && escolha.racaId && escolha.atividadeId);
  const mesma = mesmaCombinacao(editar, escolha);
  useEffect(() => {
    if (!open || !completa) { setProximo(null); return; }
    if (mesma && editar) { setProximo(editar.numero); return; }
    let vivo = true;
    setProximo(null);
    void (async () => {
      const { data, error } = await (supabase as any).rpc('fn_lote_proximo_numero', {
        p_fazenda: fazendaId, p_categoria: escolha.categoriaId, p_raca: escolha.racaId, p_atividade: escolha.atividadeId,
      });
      if (!vivo) return;
      if (error || typeof data !== 'number') {
        console.error('[fn_lote_proximo_numero]', error);
        setAviso({ texto: FRASE_ERRO_NUMERO, erro: true });
        return;
      }
      setProximo(data);
    })();
    return () => { vivo = false; };
  }, [open, completa, mesma, editar, fazendaId, escolha.categoriaId, escolha.racaId, escolha.atividadeId]);

  const alcancavel = ultimoPassoAlcancavel(escolha);
  const tipoDoPasso = TIPO_DO_PASSO[passo];
  const opcoes = useMemo(() => (tipoDoPasso ? filtrarCadastros(cadastros, tipoDoPasso, busca) : []), [cadastros, tipoDoPasso, busca]);
  const idsDosMamotes = useMemo(() => categoriasDoRebanho.filter(c => c.codigo.startsWith('mamotes')).map(c => c.id), [categoriasDoRebanho]);
  const comCarimbo = aceitaCarimbo(cadastros, escolha, idsDosMamotes);
  const ultimo = passo === PASSOS.length - 1;

  const irPara = (i: number) => {
    if (form || i > alcancavel || i < 0) return;
    setPasso(i); setBusca(''); setErroDoPerfil(null);
    if (i < 3) setTimeout(() => buscaRef.current?.focus(), 10);
  };

  const escolher = (tipo: TipoDeCartao, id: string) => {
    setEscolha(e => ({ ...e, ...(tipo === 'categoria' ? { categoriaId: id } : tipo === 'raca' ? { racaId: id } : { atividadeId: id }) }));
  };

  const gravarLote = useCallback(async () => {
    const erroP = validarPerfil(perfil, hoje);
    if (erroP) { setErroDoPerfil(erroP); return; }
    const campos = camposParaSalvar(escolha, perfil, editar);
    if (editar && Object.keys(campos).length === 0) { onPronto({ id: editar.id, codigo: editar.codigo, codigoAntigo: null }); return; }
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
  }, [perfil, hoje, escolha, editar, fazendaId, onPronto]);

  const avancar = () => {
    if (form || gravando) return;
    if (!podeAvancar(escolha, passo)) return;
    if (passo === 3 && proximo == null) return;
    if (!ultimo) { irPara(passo + 1); return; }
    void gravarLote();
  };

  /* ── cadastrar novo / editar cadastro ── */
  const abrirForm = (tipo: TipoDoCadastro, c: CadastroDoLote | null) => {
    setErroDoForm(null);
    const termo = busca.trim();
    setForm(c
      ? { tipo, id: c.id, sigla: c.sigla ?? '', nome: c.nome, categorias: [...c.categoriasRebanho], usos: lotesQueUsam(lotesDaFazenda, c, false) }
      : { tipo, id: null, sigla: termo.length <= 3 ? siglaDigitada(termo) : '', nome: termo.length > 3 ? termo : '', categorias: [], usos: 0 });
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
      setAviso({ texto: `${rotulo} salva`, erro: false, desfazer: async () => {
        const d = await salvarCadastro({ tipo: antes.tipo, id: antes.id, sigla: antes.sigla, nome: antes.nome, categorias: antes.categoriasRebanho, ativo: true });
        setAviso(d.ok ? null : { texto: d.mensagem, erro: true });
      } });
    }
    setForm(null); setBusca('');
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
    if (busca.trim() && opcoes.length === 1) { escolher(tipoDoPasso, opcoes[0].id); setBusca(''); setPasso(p => p + 1); return; }
    avancar();
  };

  const codigo = codigoMontando(cadastros, escolha, proximo);
  const passoAtual = PASSOS[passo];
  const dica = form ? '' : passo < 3 ? 'Clique para escolher · duplo clique ou Enter avança' : passo === 3 ? 'Confira o código antes de seguir'
    : editar ? 'Salvar grava a nova identidade; o código antigo fica no histórico' : 'Pode criar agora e preencher o resto na ficha';

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent data-testid="assistente-do-lote"
        onEscapeKeyDown={ev => { if (form) { ev.preventDefault(); setForm(null); } }}
        onKeyDown={aoTeclar}
        className="flex h-[min(548px,calc(100vh-16px))] w-[min(900px,calc(100vw-20px))] max-w-none flex-col gap-0 overflow-hidden bg-[#e4e8ee] p-0 [&>button:last-child]:text-white">
        {/* cabeçalho navy */}
        <div className="flex h-[42px] flex-none items-center gap-2.5 whitespace-nowrap bg-primary px-3.5 pr-12 text-primary-foreground">
          <DialogTitle className="text-[13.5px] font-semibold leading-none">{editar ? `Editar identidade · ${editar.codigo}` : 'Novo lote'}</DialogTitle>
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
              const feito = i !== passo && (i < 3 ? escolhidoNoPasso(escolha, s.chave) != null : i === 3 ? completa : !!(perfil.sistemaId || perfil.programaId || perfil.destinoId));
              const valor = valorDoPasso(i, cadastros, escolha, proximo, perfil, mesma);
              return (
                <button key={s.chave} type="button" disabled={i > alcancavel || !!form} onClick={() => irPara(i)} data-testid={`assistente-passo-${i}`}
                  className={cn('mb-0.5 grid grid-cols-[22px_minmax(0,1fr)] items-center gap-x-2 rounded-md px-1.5 py-1.5 text-left disabled:cursor-default',
                    i === passo ? 'bg-[#eef3fa]' : i <= alcancavel ? 'hover:bg-[#f3f6fa]' : '')}>
                  <span className={cn('row-span-2 flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] text-[10.5px] font-bold',
                    i === passo ? 'border-primary bg-primary text-white' : feito ? 'border-[#1f6b4a] bg-[#1f6b4a] text-white' : 'border-[#c2cad6] bg-white text-muted-foreground')}>
                    {feito ? '✓' : i + 1}
                  </span>
                  <span className={cn('whitespace-nowrap text-[11.5px] font-semibold', i === passo ? 'text-primary' : 'text-[#4b5563]')}>
                    {s.titulo}{s.opcional && <span className="font-normal text-muted-foreground"> · opcional</span>}
                  </span>
                  <span className={cn('h-[14px] truncate text-[10.5px]', feito ? 'text-foreground' : 'text-muted-foreground')} title={valor ?? undefined}>
                    {valor ?? (i === passo ? 'escolhendo…' : '—')}
                  </span>
                </button>
              );
            })}
            <div className="mt-auto border-t border-[#e3e7ee] pt-2.5">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">Código do lote
                <Ajuda titulo="Código do lote" oQueE="Gerado sozinho a cada escolha: categoria · raça · atividade · número."
                  porQue="É o que o campeiro escreve no caderno e o que aparece no Fechamento, no mapa e nos relatórios."
                  comoFazer="Escolha os três primeiros; o número sai no passo 4." />
              </div>
              <div className="my-0.5 whitespace-nowrap text-[21px] font-extrabold text-[#0b1f3a]" data-testid="assistente-codigo">
                {codigo.split('-').map((p, i) => <span key={i}>{i > 0 ? '-' : ''}<span className={p === '__' ? 'text-[#c2cad6]' : ''}>{p}</span></span>)}
              </div>
              <div className="whitespace-nowrap text-[9.5px] text-muted-foreground">categoria · raça · atividade · nº</div>
            </div>
          </div>

          {/* o passo */}
          <div className="flex min-h-0 flex-col rounded-lg border border-[#d3d9e2] bg-white px-3.5 pb-2.5 pt-3">
            <div className="flex h-[22px] items-center gap-2 whitespace-nowrap">
              <h2 className="m-0 w-[240px] flex-none text-[13.5px] font-semibold text-[#0b1f3a]">{passoAtual.pergunta}</h2>
              <Ajuda titulo={passoAtual.titulo} {...passoAtual.ajuda} />
              <span className="ml-auto text-[10.5px] text-muted-foreground">passo {passo + 1} de {PASSOS.length}</span>
            </div>
            <div className="mb-2 mt-0.5 h-4 truncate text-[11px] text-[#4b5563]" title={passoAtual.subtitulo}>{passoAtual.subtitulo}</div>
            {erroDosCadastros && <div className="mb-1 text-[11px] text-destructive">{erroDosCadastros}</div>}

            {form ? (
              <FormularioDoCadastro form={form} erro={erroDoForm} categoriasDoRebanho={categoriasDoRebanho}
                onMudar={f => { setForm(f); setErroDoForm(null); }} onCancelar={() => { setForm(null); setErroDoForm(null); }} onGravar={() => void gravarForm()} />
            ) : tipoDoPasso ? (
              <>
                <div className="mb-2 flex h-[26px] items-center gap-2">
                  <Input ref={buscaRef} value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={aoTeclarNaBusca} autoFocus
                    placeholder="Buscar sigla ou nome" className="h-[26px] w-[220px] text-[11px]" data-testid="assistente-busca" />
                  <span className="whitespace-nowrap text-[10.5px] text-muted-foreground">
                    {cadastros.filter(c => c.tipo === tipoDoPasso).length} no cadastro
                    {escolhidoNoPasso(escolha, tipoDoPasso) ? ` · escolhido: ${siglaDe(cadastros, escolhidoNoPasso(escolha, tipoDoPasso))}` : ''}
                  </span>
                </div>
                <div className="grid min-h-0 flex-1 auto-rows-[72px] content-start gap-2 overflow-y-auto pb-0.5 pl-0.5 pr-1.5 pt-0.5 [scrollbar-gutter:stable] [grid-template-columns:repeat(auto-fill,minmax(146px,1fr))]"
                  data-testid="assistente-cartoes">
                  {opcoes.map(c => {
                    const sel = escolhidoNoPasso(escolha, tipoDoPasso) === c.id;
                    const n = lotesQueUsam(lotesDaFazenda, c);
                    const detalhe = tipoDoPasso === 'categoria'
                      ? categoriasDoRebanho.filter(r => c.categoriasRebanho.includes(r.id)).map(r => r.nome.toLowerCase()).join(' + ')
                      : n ? `${n} lote${n > 1 ? 's' : ''} ativo${n > 1 ? 's' : ''}` : 'nenhum lote ativo';
                    return (
                      <div key={c.id} role="button" tabIndex={0} data-testid="assistente-cartao" title={c.nome}
                        onClick={() => escolher(tipoDoPasso, c.id)} onDoubleClick={() => { escolher(tipoDoPasso, c.id); setPasso(p => p + 1); setBusca(''); }}
                        onKeyDown={ev => { if (ev.key === ' ') { ev.preventDefault(); escolher(tipoDoPasso, c.id); } }}
                        className={cn('group relative flex min-w-0 cursor-pointer flex-col justify-center rounded-lg border-[1.5px] bg-white px-2.5 py-[7px] text-left',
                          sel ? 'border-primary bg-[#eef3fa] shadow-[0_0_0_2px_rgba(31,58,95,.15)]' : 'border-[#d3d9e2] hover:border-[#94a3b8] hover:bg-[#fafcff]')}>
                        <span className="text-[17px] font-extrabold leading-5 text-[#0b1f3a]">{c.sigla}</span>
                        <span className="truncate text-[11px] leading-[15px]">{c.nome}</span>
                        <span className="max-h-[26px] overflow-hidden text-[10px] leading-[13px] text-muted-foreground" title={detalhe}>{detalhe}</span>
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
              </>
            ) : passo === 3 ? (
              <PassoDoNumero escolha={escolha} cadastros={cadastros} lotesDaFazenda={lotesDaFazenda} proximo={proximo} mesma={mesma}
                fazendaRotulo={fazendaRotulo} perfil={perfil} erro={erroDoPerfil} onPerfil={p => { setPerfil(p); setErroDoPerfil(null); }} hoje={hoje} />
            ) : (
              <PassoDoPerfil cadastros={cadastros} perfil={perfil} comCarimbo={comCarimbo} erro={erroDoPerfil}
                onPerfil={p => { setPerfil(p); setErroDoPerfil(null); }} onCadastrar={t => abrirForm(t, null)} />
            )}
          </div>
        </div>

        {/* rodapé: os botões nunca mudam de lugar */}
        <div className="flex h-[50px] flex-none items-center gap-2 border-t border-[#dde2e9] bg-white px-3.5">
          <Button variant="ghost" size="sm" className="h-[30px] min-w-[92px] text-[11.5px]" onClick={onFechar} data-testid="assistente-cancelar">Cancelar</Button>
          <span className="truncate text-[10.5px] text-muted-foreground" data-testid="assistente-dica">{dica}</span>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" className="h-[30px] min-w-[92px] text-[11.5px]" disabled={passo === 0 || !!form} onClick={() => irPara(passo - 1)}
              data-testid="assistente-voltar">‹ Voltar</Button>
            <Button size="sm" className="h-[30px] min-w-[92px] text-[11.5px]" data-testid="assistente-avancar"
              disabled={!!form || gravando || !podeAvancar(escolha, passo) || (passo === 3 && proximo == null)} onClick={avancar}>
              {ultimo ? (editar ? 'Salvar' : 'Criar lote') : 'Avançar ›'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** O que o trilho escreve embaixo de cada passo. */
function valorDoPasso(i: number, cadastros: readonly CadastroDoLote[], e: Escolha, proximo: number | null, p: Perfil, mesma: boolean): string | null {
  const parte = (id: string | null) => (id ? `${siglaDe(cadastros, id) ?? ''} · ${nomeDe(cadastros, id) ?? ''}` : null);
  if (i === 0) return parte(e.categoriaId);
  if (i === 1) return parte(e.racaId);
  if (i === 2) return parte(e.atividadeId);
  if (i === 3) return e.categoriaId && e.racaId && e.atividadeId && proximo != null ? `nº ${String(proximo).padStart(2, '0')} · ${mesma ? 'o mesmo' : 'automático'}` : null;
  const partes = [nomeDe(cadastros, p.sistemaId), nomeDe(cadastros, p.programaId), nomeDe(cadastros, p.destinoId)].filter((x): x is string => !!x);
  return partes.length ? partes.join(' · ') : null;
}

function Rotulo({ children }: { children: string }) {
  return <label className="mb-0.5 block whitespace-nowrap text-[10px] text-[#4b5563]">{children}</label>;
}
/** O lugar fixo de 13px embaixo do campo: a dica ou o erro (vermelho). */
function Nota({ erro, children }: { erro?: string | null; children?: string }) {
  return <div className={cn('mt-0.5 h-[13px] truncate whitespace-nowrap text-[9.5px]', erro ? 'text-destructive' : 'text-muted-foreground')} title={erro ?? children}>{erro ?? children}</div>;
}

function FormularioDoCadastro({ form, erro, categoriasDoRebanho, onMudar, onCancelar, onGravar }: {
  form: FormDoCadastro; erro: ErroNoCampo | null; categoriasDoRebanho: { id: string; nome: string }[];
  onMudar(f: FormDoCadastro): void; onCancelar(): void; onGravar(): void;
}) {
  const comSigla = form.tipo === 'categoria' || form.tipo === 'raca' || form.tipo === 'atividade';
  const coisa = COISA[form.tipo];
  const travada = !!form.id && form.usos > 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border-[1.5px] border-dashed border-[#b8c3d3] bg-[#fbfcfe] px-3.5 py-3" data-testid="assistente-form">
      <h3 className="m-0 mb-0.5 text-[12.5px] font-semibold text-[#0b1f3a]">{form.id ? `Editar ${coisa} · ${form.sigla || form.nome}` : `Nova ${coisa}`}</h3>
      <div className="mb-2.5 text-[10.5px] text-muted-foreground">
        {form.id ? (travada ? `A sigla está travada: ${form.usos} lote${form.usos > 1 ? 's usam' : ' usa'} ${form.sigla} no código. O nome pode mudar.` : 'Nenhum lote usa este cadastro: dá para mudar a sigla e o nome.')
          : 'Entra no cadastro do cliente e já fica escolhida neste lote. Dá para desfazer logo depois.'}
      </div>
      <div className={cn('grid max-w-[520px] gap-x-3 gap-y-2.5', comSigla ? 'grid-cols-[100px_minmax(0,1fr)]' : 'grid-cols-[minmax(0,1fr)]')}>
        {comSigla && (
          <div>
            <Rotulo>Sigla</Rotulo>
            <Input value={form.sigla} maxLength={3} disabled={travada} autoFocus={!travada} data-testid="assistente-form-sigla"
              onChange={e => onMudar({ ...form, sigla: siglaDigitada(e.target.value) })}
              className={cn('h-[27px] text-[11.5px] font-bold', erro?.campo === 'sigla' && 'border-destructive')} />
            <Nota erro={erro?.campo === 'sigla' ? erro.mensagem : null}>2 ou 3 letras</Nota>
          </div>
        )}
        <div>
          <Rotulo>Nome</Rotulo>
          <Input value={form.nome} maxLength={32} autoFocus={travada || !comSigla} data-testid="assistente-form-nome"
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
      <div className="mt-auto flex justify-end gap-2">
        <Button variant="outline" size="sm" className="h-[27px] text-[11.5px]" onClick={onCancelar} data-testid="assistente-form-cancelar">Cancelar</Button>
        <Button size="sm" className="h-[27px] text-[11.5px]" onClick={onGravar} data-testid="assistente-form-ok">{form.id ? 'Salvar' : 'Cadastrar e usar'}</Button>
      </div>
    </div>
  );
}

function PassoDoNumero({ escolha, cadastros, lotesDaFazenda, proximo, mesma, fazendaRotulo, perfil, erro, onPerfil, hoje }: {
  escolha: Escolha; cadastros: readonly CadastroDoLote[]; lotesDaFazenda: readonly LoteDaLista[]; proximo: number | null; mesma: boolean;
  fazendaRotulo: string; perfil: Perfil; erro: { campo: keyof Perfil; mensagem: string } | null; onPerfil(p: Perfil): void; hoje: string;
}) {
  const nn = proximo == null ? '__' : String(proximo).padStart(2, '0');
  const combo = `${siglaDe(cadastros, escolha.categoriaId)}-${siglaDe(cadastros, escolha.racaId)}-${siglaDe(cadastros, escolha.atividadeId)}`;
  const existentes = lotesDaCombinacao(lotesDaFazenda, escolha);
  const parte = (id: string | null, auto = false) => (
    <div className={cn('min-w-[86px] rounded-lg border px-3 pb-[5px] pt-1.5 text-center', auto ? 'border-[#b9c9e0] bg-[#eef3fa]' : 'border-[#d3d9e2] bg-white')}>
      <b className={cn('block text-[24px] font-extrabold leading-7', auto ? 'text-[#24508f]' : 'text-[#0b1f3a]')}>{auto ? nn : siglaDe(cadastros, id)}</b>
      <span className="whitespace-nowrap text-[10px] text-muted-foreground">{auto ? (mesma ? 'o mesmo' : 'automático') : nomeDe(cadastros, id)}</span>
    </div>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="assistente-numero">
      <div className="mb-2.5 mt-0.5 flex items-stretch gap-1.5">
        {parte(escolha.categoriaId)}<span className="self-center text-[22px] text-[#c2cad6]">-</span>
        {parte(escolha.racaId)}<span className="self-center text-[22px] text-[#c2cad6]">-</span>
        {parte(escolha.atividadeId)}<span className="self-center text-[22px] text-[#c2cad6]">-</span>
        {parte(null, true)}
      </div>
      <div className="mb-2 flex h-4 items-center gap-1.5 whitespace-nowrap text-[11px] text-[#4b5563]" data-testid="assistente-numero-info">
        {mesma ? `Mesma combinação: o número ${nn} continua.`
          : existentes.length ? `Já existem ${existentes.length} lote${existentes.length > 1 ? 's' : ''} ${combo} na ${fazendaRotulo} · o próximo livre é ${nn}.`
            : `Primeiro lote ${combo} na ${fazendaRotulo} · começa em 01.`}
      </div>
      <div className="mb-2.5 overflow-hidden rounded-[7px] border border-[#e3e7ee]">
        <div className="whitespace-nowrap border-b border-[#e3e7ee] bg-[#f5f7fa] px-2 py-[5px] text-[10.5px] font-semibold text-[#0b1f3a]">Lotes {combo} na {fazendaRotulo}</div>
        <table className="w-full table-fixed border-collapse text-[10.5px]">
          <colgroup><col style={{ width: 104 }} /><col /><col style={{ width: 56 }} /><col style={{ width: 86 }} /><col style={{ width: 84 }} /></colgroup>
          <thead><tr className="text-left">
            {['Código', 'Nome do campeiro', 'Cab.', 'Pasto', 'Situação'].map((t, i) => (
              <th key={t} className={cn('border-b border-[#e3e7ee] bg-white px-2 py-[3px] text-[9.5px] font-semibold text-[#4b5563]', i === 2 && 'text-right')}>{t}</th>))}
          </tr></thead>
        </table>
        <div className="h-[118px] overflow-y-auto [scrollbar-gutter:stable]">
          <table className="w-full table-fixed border-collapse text-[10.5px]" data-testid="assistente-numero-lotes">
            <colgroup><col style={{ width: 104 }} /><col /><col style={{ width: 56 }} /><col style={{ width: 86 }} /><col style={{ width: 84 }} /></colgroup>
            <tbody>
              {existentes.map(l => (
                <tr key={l.id} className="h-[21px]">
                  <td className="px-2 font-bold text-[#0b1f3a]">{l.codigo}</td>
                  <td className="truncate px-2" title={l.nomeCampeiro ?? undefined}>{l.nomeCampeiro ?? '—'}</td>
                  <td className="px-2 text-right tabular-nums">{l.cabecas == null ? '—' : l.cabecas.toLocaleString('pt-BR')}</td>
                  <td className="truncate px-2" title={l.pastos.join(' · ') || undefined}>{l.pastos.length > 1 ? `${l.pastos.length} pastos` : l.pastos[0] ?? '—'}</td>
                  <td className="px-2"><span className={cn('rounded px-1.5 py-px text-[9.5px] font-semibold', l.situacao === 'ativo' ? 'bg-[#e8f5ec] text-[#22693f]' : 'bg-[#f3f4f6] text-[#4b5563]')}>
                    {l.situacao === 'ativo' ? 'Ativo' : 'Encerrado'}</span></td>
                </tr>
              ))}
              {!mesma && (
                <tr className="h-[21px]">
                  <td className="px-2 font-bold text-[#24508f]">{combo}-{nn}</td><td className="px-2 text-muted-foreground">este lote</td>
                  <td className="px-2 text-right text-muted-foreground">—</td><td className="px-2 text-muted-foreground">—</td>
                  <td className="px-2"><span className="rounded bg-[#e3edfb] px-1.5 py-px text-[9.5px] font-semibold text-[#24508f]">Novo</span></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-x-3 gap-y-2.5">
        <div>
          <Rotulo>Nome para o campeiro · opcional</Rotulo>
          <Input value={perfil.nomeCampeiro} maxLength={40} placeholder="ex.: L06 - DF Nel. SP" data-testid="assistente-nome-campeiro"
            onChange={e => onPerfil({ ...perfil, nomeCampeiro: e.target.value })}
            className={cn('h-[27px] text-[11.5px]', erro?.campo === 'nomeCampeiro' && 'border-destructive')} />
          <Nota erro={erro?.campo === 'nomeCampeiro' ? erro.mensagem : null}>o nome que já usam no caderno; fica como apelido e entra na busca</Nota>
        </div>
        <div>
          <Rotulo>Formado em</Rotulo>
          <DatePicker value={perfil.formadoEm} onChange={v => onPerfil({ ...perfil, formadoEm: v })} size="compact" data-testid="assistente-formado-em" />
          <Nota erro={erro?.campo === 'formadoEm' ? erro.mensagem : null}>{perfil.formadoEm === hoje ? 'hoje' : formatIsoToBr(perfil.formadoEm)}</Nota>
        </div>
      </div>
    </div>
  );
}

function PassoDoPerfil({ cadastros, perfil, comCarimbo, erro, onPerfil, onCadastrar }: {
  cadastros: readonly CadastroDoLote[]; perfil: Perfil; comCarimbo: boolean; erro: { campo: keyof Perfil; mensagem: string } | null;
  onPerfil(p: Perfil): void; onCadastrar(t: TipoDoCadastro): void;
}) {
  const opcoes = (tipo: 'sistema' | 'programa' | 'destino', campo: 'sistemaId' | 'programaId' | 'destinoId') => (
    <div className="grid auto-rows-[24px] grid-cols-2 gap-1" data-testid={`assistente-opcoes-${tipo}`}>
      {cadastros.filter(c => c.tipo === tipo).map(c => {
        const on = perfil[campo] === c.id;
        return (
          <button key={c.id} type="button" aria-pressed={on} title={c.nome} onClick={() => onPerfil({ ...perfil, [campo]: on ? null : c.id })}
            className={cn('min-w-0 whitespace-nowrap rounded-[5px] border px-1 text-[11px]', on ? 'border-primary bg-primary text-primary-foreground' : 'border-[#dde2e9] bg-white')}>
            {c.nome}
          </button>
        );
      })}
      <button type="button" onClick={() => onCadastrar(tipo)} title={`Cadastrar ${COISA[tipo]}`} data-testid={`assistente-cadastrar-${tipo}`}
        className="flex min-w-0 items-center justify-center gap-1 truncate rounded-[5px] border border-dashed border-[#b8c3d3] px-1 text-[11px] text-primary">
        <Plus className="h-3 w-3 flex-none" />novo
      </button>
    </div>
  );
  const bloco = (titulo: string, ajuda: string, filhos: ReactNode) => (
    <div className="rounded-[7px] border border-[#e3e7ee] px-2.5 pb-2 pt-[7px]">
      <h4 className="mb-1.5 mt-0 flex items-center gap-1.5 whitespace-nowrap text-[10.5px] font-semibold text-[#0b1f3a]">{titulo}
        <Ajuda titulo={titulo} oQueE={ajuda} porQue="Monta a estratégia do lote nas outras abas da ficha." comoFazer="Escolha o que já souber; dá para mudar depois na ficha." />
      </h4>
      {filhos}
    </div>
  );
  const nota = (c: keyof Perfil, dica?: string) => <Nota erro={erro?.campo === c ? erro.mensagem : null}>{dica}</Nota>;
  return (
    <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 content-start gap-x-3 gap-y-2" data-testid="assistente-perfil">
      {bloco('Manejo', 'Sistema e programa orientam o plano nutricional e as metas de GMD.', <>
        <Rotulo>Sistema</Rotulo>{opcoes('sistema', 'sistemaId')}
        <div className="mt-1.5"><Rotulo>Programa</Rotulo></div>{opcoes('programa', 'programaId')}
      </>)}
      {bloco('Destino', 'Para onde o lote vai: estação de monta, escala de abates, venda. A safra amarra o lote ao ano-safra do custo.', <>
        <Rotulo>Destino</Rotulo>{opcoes('destino', 'destinoId')}
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <div><Rotulo>Safra</Rotulo>
            <Input value={perfil.safra} maxLength={5} placeholder="26/27" onChange={e => onPerfil({ ...perfil, safra: e.target.value })} data-testid="assistente-safra"
              className={cn('h-[27px] text-[11.5px]', erro?.campo === 'safra' && 'border-destructive')} />{nota('safra')}</div>
          <div><Rotulo>Idade média · meses</Rotulo>
            <CampoNumeroComConta valor={perfil.idadeMediaMeses} casas={0} onChange={n => onPerfil({ ...perfil, idadeMediaMeses: n })} placeholder="ex.: 9"
              className="h-[27px] text-[11.5px]" invalido={erro?.campo === 'idadeMediaMeses'} />{nota('idadeMediaMeses')}</div>
        </div>
      </>)}
      {bloco('Carimbo', 'Lote de cria pelo carimbo do bezerro: mês.lote (nascidos em julho = 7.1; o 2º lote do mês = 7.2). Fica em campo próprio, fora do código.', <>
        <Rotulo>Carimbo · mês.lote</Rotulo>
        <Input value={perfil.carimbo} maxLength={5} disabled={!comCarimbo} placeholder={comCarimbo ? 'ex.: 7.1' : 'só lote de cria'} data-testid="assistente-carimbo"
          onChange={e => onPerfil({ ...perfil, carimbo: e.target.value })} className={cn('h-[27px] text-[11.5px]', erro?.campo === 'carimbo' && 'border-destructive')} />
        {nota('carimbo')}
      </>)}
      {bloco('Metas', 'A ficha compara o peso e o GMD do fechamento com estas metas e projeta quando o lote chega lá.', <>
        <div className="grid grid-cols-3 gap-2">
          <div><Rotulo>Peso meta · kg</Rotulo>
            <CampoNumeroComConta valor={perfil.metaPesoKg} casas={0} onChange={n => onPerfil({ ...perfil, metaPesoKg: n })} placeholder="ex.: 380"
              className="h-[27px] text-[11.5px]" invalido={erro?.campo === 'metaPesoKg'} />{nota('metaPesoKg')}</div>
          <div><Rotulo>GMD meta · kg/dia</Rotulo>
            <CampoNumeroComConta valor={perfil.metaGmdKg} casas={3} onChange={n => onPerfil({ ...perfil, metaGmdKg: n })} placeholder="ex.: 0,850"
              className="h-[27px] text-[11.5px]" invalido={erro?.campo === 'metaGmdKg'} />{nota('metaGmdKg')}</div>
          <div><Rotulo>Data alvo</Rotulo>
            <DatePicker value={perfil.metaData} onChange={v => onPerfil({ ...perfil, metaData: v })} size="compact" />{nota('metaData')}</div>
        </div>
      </>)}
      <div className="col-span-full flex items-center gap-1.5 whitespace-nowrap rounded-md bg-[#f5f7fa] px-2.5 py-1.5 text-[10.5px] text-[#4b5563]">
        <Ajuda titulo="Do sistema" oQueE="Cabeças, peso, GMD, pasto e custo do lote." porQue="Quem conta cabeça e peso é o fechamento do mês: a ficha nunca guarda uma segunda versão."
          comoFazer="Ao lançar o pasto no Fechamento, escolha o lote." />
        Do sistema, sem digitar: cabeças, peso, GMD, pasto e custo — vêm do fechamento.
      </div>
    </div>
  );
}
