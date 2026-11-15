/**
 * LOTE-PADRAO-V3 · L2 (mock lote-padrao-v3.html aprovado 12/11 13:31; ordem de parto Chat 14:10; NJ só a categoria fixa Chat 14:35) — o
 * assistente "+ Novo lote" v3: a MESMA ordem e as MESMAS listas para todos os clientes. Atividade (C/R/E) → Categoria (as 7 fixas do
 * rebanho, pela fase) → Raça e genética (+ composição, nascimento → idade) → Situação (fêmeas da cria: cria ao pé × prenhez; parida =
 * bezerros com carimbos e cabeças; prenha = de quê, raça, parto) → Ordem de parto → Programa (+ método, entrada) → Onde → Nome (apelido,
 * marcadores, anotação). Nada de sigla sozinha na tela: sempre a palavra inteira. A regra é a `assistenteV3.ts`; quem grava é a
 * `fn_lote_salvar` (a categoria vai como `categoria_rebanho` e o banco acha ou cria o cadastro). Moldura igual à do assistente de antes:
 * altura fixa, trilho à esquerda, botões sempre no mesmo lugar; Esc fecha, Enter avança. O lote de antes (categoria do cliente) segue
 * no `AssistenteDoLote` até a L6 (`AssistenteDoLotePadrao` escolhe).
 */
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent as KeyboardEventReact, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
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
import { useCadastrosDoLote, fraseDoErro } from '@/hooks/useCadastrosDoLote';
import { CARIMBO_VALIDO, SEMENS_DOS_MAMOTES, SEXOS_DOS_MAMOTES, type CadastroDoLote, type SemenDosMamotes, type SexoDosMamotes } from '@/lib/lotes/tipos';
import { faseDaAtividade, siglaDigitada, validarCadastro } from '@/lib/lotes/assistente';
import {
  CATEGORIAS_FIXAS, CRIA_AO_PE, ENTRADAS, METODOS, ORDENS_V3, PRENHA_DE, PRENHEZ, PROGRAMAS, SISTEMAS, categoriasDaFase, idadeMedia,
  type CategoriaFixa, type Lista,
} from '@/lib/lotes/padraoV3';
import {
  PASSOS_V3, alcanceV3, camposV3, carimbosV3, codigoV3, comCarimbo, erroDoCarimbo, erroDoNascimento, erroDoNome, escolhaV3Inicial, etiquetasV3,
  faltaNoPassoV3, faseV3, paridaV3, passoSeAplica, passoVizinho, perfilV3Inicial, prenhaV3, semCarimbo, valorDoPassoV3,
  type EscolhaV3, type PerfilV3,
} from '@/lib/lotes/assistenteV3';
import type { PropsDoAssistente } from '@/components/lotes/AssistenteDoLote';

export const FRASE_ERRO_SALVAR_V3 = 'Não consegui gravar o lote. Tente de novo.';

/** As listas do tipos.ts têm [valor, sigla, nome]; aqui vale só o nome por extenso. */
const porExtenso = <T extends string>(l: readonly (readonly [T, string, string])[]): Lista<T> => l.map(([v, , n]): readonly [T, string] => [v, n]);
const paraLista = (l: readonly CadastroDoLote[]): Lista<string> => l.map((c): readonly [string, string] => [c.id, c.nome]);
const SEXOS = porExtenso<SexoDosMamotes>(SEXOS_DOS_MAMOTES);
const SEMENS = porExtenso<SemenDosMamotes>(SEMENS_DOS_MAMOTES);

export function AssistenteDoLoteV3({ open, clienteId, fazendaId, fazendaRotulo, lotesDaFazenda, editar, onFechar, onPronto }: PropsDoAssistente) {
  const hoje = hojeLocal();
  const { cadastros, categoriasDoRebanho, erro: erroDosCadastros, salvarCadastro } = useCadastrosDoLote(open ? clienteId : null);
  const [passo, setPasso] = useState(0);
  const [escolha, setEscolha] = useState<EscolhaV3>(() => escolhaV3Inicial(editar));
  const [perfil, setPerfil] = useState<PerfilV3>(() => perfilV3Inicial(hoje, editar));
  const [aviso, setAviso] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPasso(0); setAviso(null); setGravando(false);
    setEscolha(escolhaV3Inicial(editar)); setPerfil(perfilV3Inicial(hoje, editar));
  }, [open, editar, hoje]);

  const idsDoRebanho = useMemo(() => new Map(categoriasDoRebanho.map(r => [r.codigo, r.id])), [categoriasDoRebanho]);
  const atividades = useMemo(() => cadastros.filter(c => c.tipo === 'atividade' && (faseDaAtividade(c.sigla) !== null || c.id === escolha.atividadeId)),
    [cadastros, escolha.atividadeId]);
  const racas = useMemo(() => cadastros.filter(c => c.tipo === 'raca'), [cadastros]);
  const fase = faseV3(cadastros, escolha);
  const categorias = categoriasDaFase(fase, escolha.categoria);
  const chave = PASSOS_V3[passo].chave;
  const ultimo = passo === PASSOS_V3.length - 1;
  const falta = faltaNoPassoV3(escolha, perfil, passo, fase, hoje);
  /* o carimbo da parida trava o Nome de qualquer passo: o passo Situação fica marcado no trilho e o alcance para nele */
  const problemaDoCarimbo = escolha.racaId ? erroDoCarimbo(escolha, perfil, fase) : null;
  const iSituacao = PASSOS_V3.findIndex(p => p.chave === 'situacao');
  const alcance = problemaDoCarimbo ? Math.min(alcanceV3(escolha), iSituacao) : alcanceV3(escolha);
  const codigo = codigoV3(cadastros, idsDoRebanho, escolha, paridaV3(fase, escolha, perfil) ? carimbosV3(perfil) : [], lotesDaFazenda, editar);

  const irPara = (i: number) => {
    if (i < 0 || i > alcance || !passoSeAplica(PASSOS_V3[i].chave, fase, escolha.categoria)) return;
    setPasso(i);
  };
  const mudar = (p: Partial<PerfilV3>) => setPerfil(x => ({ ...x, ...p }));

  const gravar = useCallback(async () => {
    const faseAntes = editar ? faseDaAtividade(cadastros.find(c => c.id === editar.atividadeId)?.sigla ?? null) : fase;
    const campos = camposV3(escolha, perfil, fase, hoje, editar, faseAntes);
    if (editar && Object.keys(campos).length === 0) { onPronto({ id: editar.id, codigo: editar.codigo, codigoAntigo: null }); return; }
    setGravando(true);
    const { data, error } = await (supabase as any).rpc('fn_lote_salvar', editar
      ? { p_id: editar.id, p_fazenda: null, p_campos: campos, p_versao: editar.versao, p_motivo: null, p_simular: false }
      : { p_id: null, p_fazenda: fazendaId, p_campos: campos, p_versao: null, p_motivo: null, p_simular: false });
    setGravando(false);
    if (error) {
      console.error('[fn_lote_salvar]', error);
      setAviso(error.code === '40001' && typeof error.message === 'string' ? error.message : fraseDoErro(error, FRASE_ERRO_SALVAR_V3));
      return;
    }
    const ler = (k: string) => (typeof data === 'object' && data !== null ? Reflect.get(data, k) : null);
    const id = ler('id'); const cod = ler('codigo'); const antigo = ler('codigo_antigo');
    if (typeof id !== 'string' || typeof cod !== 'string') { setAviso(FRASE_ERRO_SALVAR_V3); return; }
    notificarLotesMudaram(fazendaId);
    onPronto({ id, codigo: cod, codigoAntigo: typeof antigo === 'string' ? antigo : null });
  }, [editar, cadastros, fase, escolha, perfil, hoje, fazendaId, onPronto]);

  const avancar = () => {
    if (gravando || falta) return;
    if (!ultimo) { setPasso(p => passoVizinho(p, 1, fase, escolha.categoria)); return; }
    void gravar();
  };
  const escolherEAvancar = (e: Partial<EscolhaV3>) => {
    setEscolha(x => ({ ...x, ...e }));
    setPasso(p => p + 1);
  };
  const aoTeclar = (ev: KeyboardEventReact<HTMLDivElement>) => {
    const alvo = ev.target;
    if (ev.key !== 'Enter') return;
    if (alvo instanceof HTMLInputElement || alvo instanceof HTMLButtonElement || alvo instanceof HTMLTextAreaElement) return;
    ev.preventDefault(); avancar();
  };

  const motivo = falta && !falta.startsWith('Escolha') ? falta : null;
  const dica = ultimo ? (editar ? 'Salvar grava; o código antigo fica no histórico' : 'O que faltar fica como “completar” na ficha')
    : passo <= 2 ? 'Clique para escolher · duplo clique ou Enter avança' : 'Opcional · Enter avança';
  const passoAtual = PASSOS_V3[passo];

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent data-testid="assistente-do-lote" data-versao="v3" onKeyDown={aoTeclar}
        className="flex h-[min(548px,calc(100vh-16px))] w-[min(900px,calc(100vw-20px))] max-w-none flex-col gap-0 overflow-hidden bg-[#e4e8ee] p-0 [&>button:last-child]:text-white">
        <div className="flex h-[42px] flex-none items-center gap-2.5 whitespace-nowrap bg-primary px-3.5 pr-12 text-primary-foreground">
          <DialogTitle className="text-[13.5px] font-semibold leading-none">{editar ? `Editar lote · ${editar.codigo}` : 'Novo lote'}</DialogTitle>
          <DialogDescription className="text-[11px] text-primary-foreground/80" data-testid="assistente-fazenda">Fazenda {fazendaRotulo}</DialogDescription>
        </div>

        {aviso && (
          <div data-testid="assistente-aviso" className="absolute left-1/2 top-[48px] z-10 flex -translate-x-1/2 items-center gap-2.5 whitespace-nowrap rounded-md bg-[#7f1d1d] px-3 py-1.5 text-[11px] text-white shadow-lg">
            <span>{aviso}</span>
            <button type="button" aria-label="Fechar o aviso" className="opacity-60 hover:opacity-100" onClick={() => setAviso(null)}><X className="h-3 w-3" /></button>
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-[214px_minmax(0,1fr)] gap-2.5 p-2.5">
          {/* trilho: os 8 passos sempre (o que não se aplica fica cinza) — nada se desloca ao trocar a categoria */}
          <div className="flex min-h-0 flex-col rounded-lg border border-[#d3d9e2] bg-white p-2" data-testid="assistente-trilho">
            {PASSOS_V3.map((s, i) => {
              const aplica = passoSeAplica(s.chave, fase, escolha.categoria);
              const valor = valorDoPassoV3(s.chave, cadastros, escolha, perfil, fase, hoje);
              const comProblema = s.chave === 'situacao' && !!problemaDoCarimbo;
              const feito = aplica && i !== passo && valor != null && !comProblema;
              return (
                <button key={s.chave} type="button" disabled={i > alcance || !aplica} onClick={() => irPara(i)} data-testid={`assistente-passo-${i}`}
                  className={cn('grid grid-cols-[20px_minmax(0,1fr)] items-start gap-x-1.5 rounded-md px-1.5 py-[3px] text-left disabled:cursor-default',
                    i === passo ? 'bg-[#eef3fa]' : i <= alcance && aplica ? 'hover:bg-[#f3f6fa]' : '')}>
                  <span className={cn('row-span-2 mt-[1px] flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] text-[10px] font-bold',
                    comProblema ? 'border-[#b45309] bg-[#b45309] text-white' : i === passo ? 'border-primary bg-primary text-white'
                      : feito ? 'border-[#1f6b4a] bg-[#1f6b4a] text-white' : 'border-[#c2cad6] bg-white text-muted-foreground')}
                    data-testid={comProblema ? 'assistente-passo-problema' : undefined}>
                    {comProblema ? '!' : feito ? '✓' : i + 1}
                  </span>
                  <span className={cn('whitespace-nowrap text-[11px] font-semibold leading-[14px]', !aplica ? 'text-[#b6bec9]' : i === passo ? 'text-primary' : 'text-[#4b5563]')}>{s.titulo}</span>
                  <span className={cn('h-[13px] truncate text-[10px] leading-[13px]', comProblema ? 'font-semibold text-[#b45309]' : !aplica ? 'text-[#b6bec9]' : feito ? 'text-foreground' : 'text-muted-foreground')}
                    title={comProblema ? problemaDoCarimbo ?? undefined : valor ?? undefined} data-testid={`assistente-passo-valor-${i}`}>
                    {comProblema ? 'carimbo · corrigir' : valor ?? (i === passo ? 'escolhendo…' : '—')}
                  </span>
                </button>
              );
            })}
            <div className="mt-auto border-t border-[#e3e7ee] pt-2">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">Código do lote
                <Ajuda titulo="Código do lote" oQueE="Montado sozinho: atividade · categoria · raça e, na parida, o carimbo dos bezerros."
                  porQue="É o que aparece no Fechamento, no mapa e nos relatórios. O resto fica nas etiquetas, por extenso."
                  comoFazer="Repetido na fazenda, o banco põe -02, -03 no fim." />
              </div>
              <div className="my-0.5 whitespace-nowrap text-[18px] font-extrabold text-[#0b1f3a]" data-testid="assistente-codigo">
                {codigo.split('-').map((p, i) => <span key={i}>{i > 0 ? '-' : ''}<span className={p === '__' ? 'text-[#c2cad6]' : ''}>{p}</span></span>)}
              </div>
              <div className="whitespace-nowrap text-[9.5px] text-muted-foreground" data-testid="assistente-legenda">atividade · categoria · raça · carimbo</div>
            </div>
          </div>

          {/* o passo */}
          <div className="flex min-h-0 flex-col rounded-lg border border-[#d3d9e2] bg-white px-3.5 pb-2.5 pt-3">
            <div className="flex h-[22px] flex-none items-center gap-2 whitespace-nowrap">
              {/* largura fixa: trocar de passo não move a ajuda (nada se desloca) */}
              <h2 className="m-0 w-[240px] flex-none text-[13.5px] font-semibold text-[#0b1f3a]">{passoAtual.titulo}</h2>
              <Ajuda titulo={passoAtual.titulo} {...passoAtual.ajuda} />
              <span className="ml-auto text-[10.5px] text-muted-foreground">passo {passo + 1} de {PASSOS_V3.length}</span>
            </div>
            <div className="mb-2 mt-0.5 h-4 flex-none truncate text-[11px] text-[#4b5563]" title={passoAtual.subtitulo}>{passoAtual.subtitulo}</div>
            {erroDosCadastros && <div className="mb-1 text-[11px] text-destructive">{erroDosCadastros}</div>}

            <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-gutter:stable]" data-testid={`assistente-corpo-${chave}`}>
              {chave === 'atividade' && (
                <Opcoes testid="assistente-atividades" grande lista={paraLista(atividades)} valor={escolha.atividadeId} obrigatorio
                  onEscolher={v => setEscolha(x => ({ ...x, atividadeId: v, categoria: x.categoria && categoriasDaFase(faseDaAtividade(cadastros.find(c => c.id === v)?.sigla ?? null), null).includes(x.categoria) ? x.categoria : null }))}
                  onDuplo={v => escolherEAvancar({ atividadeId: v })} />
              )}
              {chave === 'categoria' && (
                <>
                  <Opcoes testid="assistente-categorias" grande lista={categorias.map((k): readonly [CategoriaFixa, string] => [k, CATEGORIAS_FIXAS.find(c => c[0] === k)?.[1] ?? k])}
                    valor={escolha.categoria} obrigatorio onEscolher={v => setEscolha(x => ({ ...x, categoria: v }))} onDuplo={v => escolherEAvancar({ categoria: v })} />
                  <Quadro>A categoria é a do mapa do rebanho, igual para todos os clientes. Parida, prenha, primípara, descarte entram nas próximas etapas, por extenso.</Quadro>
                </>
              )}
              {chave === 'raca' && (
                <PassoDaRaca racas={racas} escolha={escolha} perfil={perfil} hoje={hoje} cadastros={cadastros}
                  onRaca={v => setEscolha(x => ({ ...x, racaId: v }))} onPerfil={mudar}
                  onCadastrar={async (sigla, nome) => {
                    const r = await salvarCadastro({ tipo: 'raca', id: null, sigla, nome, categorias: [], ativo: true });
                    if (r.ok) setEscolha(x => ({ ...x, racaId: r.id }));
                    return r.ok ? null : r.mensagem;
                  }} />
              )}
              {chave === 'situacao' && <PassoDaSituacao escolha={escolha} perfil={perfil} fase={fase} racas={racas} onPerfil={mudar} />}
              {chave === 'ordem' && <Opcoes testid="assistente-ordem-parto" lista={ORDENS_V3} valor={perfil.ordemParto} onEscolher={v => mudar({ ordemParto: v })} />}
              {chave === 'programa' && (
                <>
                  <Linha rotulo="Programa"><Opcoes testid="assistente-programa" lista={PROGRAMAS} valor={perfil.programa} onEscolher={v => mudar({ programa: v, metodo: v === 'reproducao' ? perfil.metodo : null })} /></Linha>
                  <Linha rotulo="Método" apagado={perfil.programa !== 'reproducao'}>
                    <Opcoes testid="assistente-metodo" lista={METODOS} valor={perfil.metodo} desligado={perfil.programa !== 'reproducao'} onEscolher={v => mudar({ metodo: v })} />
                  </Linha>
                  <Linha rotulo="Entrada" apagado={escolha.categoria !== 'novilhas'}>
                    <Opcoes testid="assistente-entrada" lista={ENTRADAS} valor={perfil.entrada} desligado={escolha.categoria !== 'novilhas'} onEscolher={v => mudar({ entrada: v })} />
                  </Linha>
                  <Quadro>Método só na reprodução; entrada (superprecoce, precoce, convencional) só nas novilhas.</Quadro>
                </>
              )}
              {chave === 'onde' && <Opcoes testid="assistente-sistema" lista={SISTEMAS} valor={perfil.sistema} onEscolher={v => mudar({ sistema: v })} />}
              {chave === 'nome' && <PassoDoNome codigo={codigo} cadastros={cadastros} escolha={escolha} perfil={perfil} fase={fase} hoje={hoje} onPerfil={mudar} />}
            </div>
          </div>
        </div>

        <div className="flex h-[50px] flex-none items-center gap-2 border-t border-[#dde2e9] bg-white px-3.5">
          <Button variant="ghost" size="sm" className="h-[30px] min-w-[92px] text-[11.5px]" onClick={onFechar} data-testid="assistente-cancelar">Cancelar</Button>
          <span className={cn('min-w-0 truncate whitespace-nowrap text-[10.5px]', motivo ? 'font-semibold text-[#b45309]' : 'text-muted-foreground')} data-testid="assistente-dica"
            title={motivo ?? dica}>
            {motivo ?? dica}
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" className="h-[30px] min-w-[92px] text-[11.5px]" disabled={passo === 0}
              onClick={() => setPasso(p => passoVizinho(p, -1, fase, escolha.categoria))} data-testid="assistente-voltar">‹ Voltar</Button>
            <Button size="sm" className="h-[30px] min-w-[92px] text-[11.5px]" data-testid="assistente-avancar" title={falta ?? undefined}
              disabled={gravando || !!falta} onClick={avancar}>
              {ultimo ? (editar ? 'Salvar' : 'Salvar lote') : 'Avançar ›'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Os botões de uma lista FIXA, por extenso. Opcional: clicar no escolhido limpa. Obrigatório: fica. */
function Opcoes<T extends string>({ lista, valor, onEscolher, onDuplo, desligado, obrigatorio, grande, testid }: {
  lista: Lista<T>; valor: T | null; onEscolher(v: T | null): void; onDuplo?(v: T): void; desligado?: boolean; obrigatorio?: boolean; grande?: boolean; testid: string;
}) {
  return (
    <div className="flex flex-wrap gap-1" data-testid={testid}>
      {lista.map(([v, nome]) => {
        const on = valor === v;
        return (
          <button key={v} type="button" aria-pressed={on} disabled={desligado} title={nome}
            onClick={() => onEscolher(on && !obrigatorio ? null : v)} onDoubleClick={() => onDuplo?.(v)}
            className={cn('whitespace-nowrap rounded-[5px] border disabled:cursor-default disabled:opacity-40',
              grande ? 'h-[34px] min-w-[112px] px-3 text-[12px] font-semibold' : 'h-[24px] px-2 text-[11px]',
              on ? 'border-primary bg-primary text-primary-foreground' : 'border-[#dde2e9] bg-white hover:border-[#94a3b8]')}>
            {nome}
          </button>
        );
      })}
    </div>
  );
}

function Linha({ rotulo, obrigatorio, apagado, children }: { rotulo: string; obrigatorio?: boolean; apagado?: boolean; children: ReactNode }) {
  return (
    <div className="grid min-h-[28px] grid-cols-[104px_minmax(0,1fr)] items-center gap-x-2 py-[2px]">
      <span className={cn('whitespace-nowrap text-[10.5px]', apagado ? 'text-[#b6bec9]' : 'text-[#374151]')}>{rotulo}{obrigatorio && <em className="not-italic text-destructive"> *</em>}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Quadro({ children }: { children: ReactNode }) {
  return <div className="mt-2 rounded-md bg-[#f5f7fa] px-2.5 py-1.5 text-[10.5px] leading-[15px] text-[#4b5563]">{children}</div>;
}

/** O lugar fixo de 13px embaixo do campo: a dica ou o erro (vermelho). */
function Nota({ erro, children }: { erro?: string | null; children?: ReactNode }) {
  return <div className={cn('mt-0.5 h-[13px] whitespace-nowrap text-[9.5px]', erro ? 'text-destructive' : 'text-muted-foreground')}>{erro ?? children}</div>;
}

/** Passo 3 — a raça do cadastro do cliente (+ cadastrar), a composição (cruzada) e o nascimento de/até (a idade aparece; nunca se digita). */
function PassoDaRaca({ racas, cadastros, escolha, perfil, hoje, onRaca, onPerfil, onCadastrar }: {
  racas: readonly CadastroDoLote[]; cadastros: readonly CadastroDoLote[]; escolha: EscolhaV3; perfil: PerfilV3; hoje: string;
  onRaca(id: string): void; onPerfil(p: Partial<PerfilV3>): void; onCadastrar(sigla: string, nome: string): Promise<string | null>;
}) {
  const [nova, setNova] = useState<{ sigla: string; nome: string; erro: string | null } | null>(null);
  const idade = idadeMedia(perfil.nascidoDe, perfil.nascidoAte, hoje);
  const erroNasc = erroDoNascimento(perfil, hoje);
  const gravarNova = async () => {
    if (!nova) return;
    const e = validarCadastro({ tipo: 'raca', sigla: nova.sigla, nome: nova.nome, categorias: [], existentes: cadastros, idEditando: null });
    if (e) { setNova({ ...nova, erro: e.mensagem }); return; }
    const erro = await onCadastrar(nova.sigla.trim().toUpperCase(), nova.nome.trim());
    if (erro) setNova({ ...nova, erro }); else setNova(null);
  };
  return (
    <div data-testid="assistente-raca">
      <Linha rotulo="Raça" obrigatorio>
        <div className="flex flex-wrap items-center gap-1">
          <Opcoes testid="assistente-racas" lista={paraLista(racas)} valor={escolha.racaId} obrigatorio onEscolher={v => { if (v) onRaca(v); }} />
          {!nova && (
            <button type="button" onClick={() => setNova({ sigla: '', nome: '', erro: null })} data-testid="assistente-cadastrar-raca"
              className="flex h-[24px] items-center gap-1 whitespace-nowrap rounded-[5px] border border-dashed border-[#b8c3d3] px-2 text-[11px] text-primary">
              <Plus className="h-3 w-3" />raça
            </button>
          )}
        </div>
      </Linha>
      {nova && (
        <Linha rotulo="Nova raça">
          <div className="flex items-center gap-1.5" data-testid="assistente-nova-raca">
            <Input value={nova.sigla} maxLength={3} placeholder="sigla" aria-label="Sigla da raça" autoFocus className="h-[24px] w-[56px] text-[11px] font-bold"
              onChange={e => setNova({ ...nova, sigla: siglaDigitada(e.target.value), erro: null })} />
            <Input value={nova.nome} maxLength={32} placeholder="nome (ex.: Brangus)" aria-label="Nome da raça" className="h-[24px] w-[160px] text-[11px]"
              onChange={e => setNova({ ...nova, nome: e.target.value, erro: null })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void gravarNova(); } }} />
            <Button size="sm" className="h-[24px] px-2 text-[11px]" onClick={() => void gravarNova()} data-testid="assistente-nova-raca-ok">Cadastrar e usar</Button>
            <Button variant="ghost" size="sm" className="h-[24px] px-2 text-[11px]" onClick={() => setNova(null)}>Cancelar</Button>
            <span className="min-w-0 truncate text-[9.5px] text-destructive" title={nova.erro ?? undefined}>{nova.erro}</span>
          </div>
        </Linha>
      )}
      <Linha rotulo="Composição">
        <div className="flex flex-wrap gap-1" data-testid="assistente-composicao">
          {racas.filter(r => r.id !== escolha.racaId).map(r => {
            const on = perfil.composicao.includes(r.id);
            return (
              <button key={r.id} type="button" aria-pressed={on} title={on ? `Tirar ${r.nome} da composição` : `Pôr ${r.nome} na composição`}
                onClick={() => onPerfil({ composicao: on ? perfil.composicao.filter(x => x !== r.id) : [...perfil.composicao, r.id] })}
                className={cn('h-[20px] whitespace-nowrap rounded-[4px] border px-1.5 text-[10px]', on ? 'border-[#24508f] bg-[#e7f0fb] text-[#24508f]' : 'border-transparent text-muted-foreground hover:border-[#dde2e9]')}>
                {on ? '✓ ' : '+ '}{r.nome}
              </button>
            );
          })}
        </div>
      </Linha>
      <div className="-mt-0.5 pl-[112px]"><Nota>se cruzada: as raças que entram, além da principal</Nota></div>
      <Linha rotulo="Nascimento">
        <div className="flex items-center gap-1.5">
          <span className="text-[10.5px] text-muted-foreground">de</span>
          <DatePicker value={perfil.nascidoDe} onChange={v => onPerfil({ nascidoDe: v })} size="compact" data-testid="assistente-nascido-de" />
          <span className="text-[10.5px] text-muted-foreground">até</span>
          <DatePicker value={perfil.nascidoAte} onChange={v => onPerfil({ nascidoAte: v })} size="compact" data-testid="assistente-nascido-ate" />
          <span className="min-w-[120px] whitespace-nowrap text-[11px] font-semibold text-[#0b1f3a] [font-variant-numeric:tabular-nums]" data-testid="assistente-idade">
            {idade == null ? '' : `idade média ~${idade} meses`}
          </span>
        </div>
      </Linha>
      <div className="pl-[112px]"><Nota erro={erroNasc}>a idade média sai do meio da faixa (nunca se digita)</Nota></div>
    </div>
  );
}

/** Passo 4 — só fêmeas da cria: cria ao pé × prenhez; parida = os bezerros (carimbos + cabeças, sexo, sêmen, raça do pai); prenha = de quê,
 *  raça e parto previsto. O que não vale fica apagado no lugar dele (nada se desloca). */
function PassoDaSituacao({ escolha, perfil, fase, racas, onPerfil }: {
  escolha: EscolhaV3; perfil: PerfilV3; fase: ReturnType<typeof faseV3>; racas: readonly CadastroDoLote[]; onPerfil(p: Partial<PerfilV3>): void;
}) {
  const parida = paridaV3(fase, escolha, perfil);
  const prenha = prenhaV3(fase, escolha, perfil);
  const erroCarimbo = perfil.carimbo.trim() && !CARIMBO_VALIDO.test(perfil.carimbo.trim().toUpperCase()) ? 'mês.lote: 7.1 ou 7R (ressinc.)' : null;
  const faltaCarimbo = parida && carimbosV3(perfil).length === 0;
  const listaRacas = paraLista(racas);
  return (
    <div data-testid="assistente-situacao">
      <Linha rotulo="Cria ao pé"><Opcoes testid="assistente-cria-ao-pe" lista={CRIA_AO_PE} valor={perfil.criaAoPe} onEscolher={v => onPerfil({ criaAoPe: v })} /></Linha>
      <Linha rotulo="Prenhez"><Opcoes testid="assistente-prenhez" lista={PRENHEZ} valor={perfil.prenhez} onEscolher={v => onPerfil({ prenhez: v })} /></Linha>

      <div className="mt-1 border-t border-[#e3e7ee] pt-1">
        <div className={cn('whitespace-nowrap text-[10.5px] font-semibold', parida ? 'text-[#374151]' : 'text-[#b6bec9]')}>Bezerros ao pé{!parida && <span className="font-normal"> · só na parida</span>}</div>
        <Linha rotulo="Carimbos" obrigatorio={parida} apagado={!parida}>
          <div className="flex flex-wrap items-center gap-1.5" data-testid="assistente-bezerros">
            {perfil.carimbos.map((c, i) => (
              <span key={c} className="flex h-[24px] flex-none items-center gap-1 rounded-[5px] border border-primary bg-[#eef3fa] pl-1.5 pr-0.5 text-[11px]" data-testid="assistente-carimbo-chip">
                <b className="text-[#0b1f3a]">{c}</b>
                <CampoNumeroComConta valor={perfil.carimbosCab[i] ?? null} casas={0} placeholder="cab" disabled={!parida} title={`Cabeças do carimbo ${c}`}
                  onChange={n => onPerfil({ carimbosCab: perfil.carimbos.map((_, j) => (j === i ? n : perfil.carimbosCab[j] ?? null)) })}
                  className="h-[20px] w-[48px] text-[10.5px]" />
                <button type="button" aria-label={`Tirar o carimbo ${c}`} disabled={!parida} className="opacity-60 hover:opacity-100"
                  onClick={() => onPerfil(semCarimbo(perfil, c))}><X className="h-3 w-3" /></button>
              </span>
            ))}
            <Input value={perfil.carimbo} disabled={!parida} placeholder={perfil.carimbos.length ? '+ carimbo' : '7.1'} maxLength={6} aria-label="Carimbo" data-testid="assistente-carimbo"
              onChange={e => {
                const v = e.target.value.toUpperCase();
                if (/[,; ]$/.test(v)) { onPerfil(comCarimbo({ ...perfil, carimbo: v.replace(/[,; ]+$/, '') }, v.replace(/[,; ]+$/, ''))); return; }
                onPerfil({ carimbo: v.replace(/[^0-9R.]/g, '') });
              }}
              onKeyDown={e => { if (e.key === 'Enter' && perfil.carimbo.trim()) { e.preventDefault(); e.stopPropagation(); onPerfil(comCarimbo(perfil, perfil.carimbo)); } }}
              className={cn('h-[24px] w-[70px] flex-none text-[11px] font-bold', (erroCarimbo || faltaCarimbo) && parida && 'border-destructive')} />
            <span className={cn('whitespace-nowrap text-[9.5px]', parida && (erroCarimbo || faltaCarimbo) ? 'text-destructive' : 'text-muted-foreground')} data-testid="assistente-carimbo-nota">
              {parida && faltaCarimbo && !erroCarimbo ? 'obrigatório na parida' : erroCarimbo ?? 'Enter põe na lista'}
            </span>
          </div>
        </Linha>
        <Linha rotulo="Sexo" apagado={!parida}><Opcoes testid="assistente-bezerros-sexo" lista={SEXOS} valor={perfil.mamotesSexo} desligado={!parida} onEscolher={v => onPerfil({ mamotesSexo: v })} /></Linha>
        <Linha rotulo="Sêmen" apagado={!parida}><Opcoes testid="assistente-bezerros-semen" lista={SEMENS} valor={perfil.mamotesSemen} desligado={!parida} onEscolher={v => onPerfil({ mamotesSemen: v })} /></Linha>
        <Linha rotulo="Raça do pai" apagado={!parida}><Opcoes testid="assistente-bezerros-pai" lista={listaRacas} valor={perfil.paiRacaId} desligado={!parida} onEscolher={v => onPerfil({ paiRacaId: v })} /></Linha>
      </div>

      <div className="mt-1 border-t border-[#e3e7ee] pt-1">
        <div className={cn('whitespace-nowrap text-[10.5px] font-semibold', prenha ? 'text-[#374151]' : 'text-[#b6bec9]')}>Prenhez{!prenha && <span className="font-normal"> · só na prenha</span>}</div>
        <Linha rotulo="Prenha de" apagado={!prenha}><Opcoes testid="assistente-prenha-de" lista={PRENHA_DE} valor={perfil.prenhaDe} desligado={!prenha} onEscolher={v => onPerfil({ prenhaDe: v })} /></Linha>
        <Linha rotulo="Raça" apagado={!prenha}><Opcoes testid="assistente-prenha-raca" lista={listaRacas} valor={perfil.prenhaRacaId} desligado={!prenha} onEscolher={v => onPerfil({ prenhaRacaId: v })} /></Linha>
        <Linha rotulo="Parto previsto" apagado={!prenha}>
          <div className="flex items-center gap-2">
            <DatePicker value={perfil.partoPrevisto} onChange={v => onPerfil({ partoPrevisto: v })} size="compact" disabled={!prenha} data-testid="assistente-parto-previsto" />
            <span className="text-[9.5px] text-muted-foreground">{perfil.partoPrevisto ? formatIsoToBr(perfil.partoPrevisto).slice(3) : 'mês do parto'}</span>
          </div>
        </Linha>
      </div>
    </div>
  );
}

/** As etiquetas que vão na linha inteira (as de texto longo); as outras, duas por linha, na ordem. */
const ETIQUETAS_LARGAS = new Set(['Raça e genética', 'Bezerros', 'Prenha de', 'Programa']);
function linhasDasEtiquetas<T extends { rotulo: string }>(lista: readonly T[]): T[][] {
  const curtas = lista.filter(l => !ETIQUETAS_LARGAS.has(l.rotulo));
  const pares = Array.from({ length: Math.ceil(curtas.length / 2) }, (_, i) => curtas.slice(i * 2, i * 2 + 2));
  return [...pares, ...lista.filter(l => ETIQUETAS_LARGAS.has(l.rotulo)).map(l => [l])];
}

/** Passo 8 — o código (fixo), o apelido, os marcadores, a anotação, a data de formação e as etiquetas por extenso ("completar" = falta). */
function PassoDoNome({ codigo, cadastros, escolha, perfil, fase, hoje, onPerfil }: {
  codigo: string; cadastros: readonly CadastroDoLote[]; escolha: EscolhaV3; perfil: PerfilV3; fase: ReturnType<typeof faseV3>; hoje: string;
  onPerfil(p: Partial<PerfilV3>): void;
}) {
  const erro = erroDoNome(perfil, hoje);
  const etiquetas = etiquetasV3(cadastros, escolha, perfil, fase, hoje);
  const porMarcador = () => {
    const m = perfil.marcador.trim();
    if (!m) return;
    onPerfil({ marcador: '', marcadores: perfil.marcadores.includes(m) ? perfil.marcadores : [...perfil.marcadores, m] });
  };
  return (
    <div data-testid="assistente-nome">
      <Linha rotulo="Código"><b className="whitespace-nowrap text-[16px] text-[#0b1f3a]" data-testid="assistente-nome-codigo">{codigo}</b></Linha>
      <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-x-3">
        <div>
          <label className="mb-0.5 block whitespace-nowrap text-[10px] text-[#4b5563]">Apelido · opcional</label>
          <Input value={perfil.nomeCampeiro} maxLength={40} placeholder="ex.: Sexada F, Retiro" data-testid="assistente-nome-campeiro"
            onChange={e => onPerfil({ nomeCampeiro: e.target.value })} className={cn('h-[26px] text-[11.5px]', erro?.campo === 'nomeCampeiro' && 'border-destructive')} />
          <Nota erro={erro?.campo === 'nomeCampeiro' ? erro.mensagem : null}>como a fazenda chama o lote</Nota>
        </div>
        <div>
          <label className="mb-0.5 block whitespace-nowrap text-[10px] text-[#4b5563]">Formado em</label>
          <DatePicker value={perfil.formadoEm} onChange={v => onPerfil({ formadoEm: v })} size="compact" data-testid="assistente-formado-em" />
          <Nota erro={erro?.campo === 'formadoEm' ? erro.mensagem : null}>{perfil.formadoEm === hoje ? 'hoje' : formatIsoToBr(perfil.formadoEm)}</Nota>
        </div>
      </div>
      <label className="mb-0.5 block whitespace-nowrap text-[10px] text-[#4b5563]">Marcadores · etiquetas livres do cliente</label>
      <div className="flex h-[26px] items-center gap-1.5 overflow-hidden" data-testid="assistente-marcadores">
        {perfil.marcadores.map(m => (
          <span key={m} className="flex h-[22px] flex-none items-center gap-1 rounded-[4px] bg-[#eef1f6] px-1.5 text-[11px]" data-testid="assistente-marcador-chip">
            {m}
            <button type="button" aria-label={`Tirar o marcador ${m}`} className="opacity-60 hover:opacity-100"
              onClick={() => onPerfil({ marcadores: perfil.marcadores.filter(x => x !== m) })}><X className="h-3 w-3" /></button>
          </span>
        ))}
        <Input value={perfil.marcador} maxLength={32} placeholder="+ marcador (Gêmeos, Leiteiras…)" aria-label="Marcador" data-testid="assistente-marcador"
          onChange={e => onPerfil({ marcador: e.target.value })}
          onKeyDown={e => { if (e.key === 'Enter' && perfil.marcador.trim()) { e.preventDefault(); e.stopPropagation(); porMarcador(); } }}
          className={cn('h-[24px] w-[200px] flex-none text-[11px]', erro?.campo === 'marcadores' && 'border-destructive')} />
      </div>
      <Nota erro={erro?.campo === 'marcadores' ? erro.mensagem : null}>servem para buscar e filtrar; nunca substituem as listas fixas</Nota>
      <label className="mb-0.5 mt-0.5 block whitespace-nowrap text-[10px] text-[#4b5563]">Anotação · opcional</label>
      <Input value={perfil.anotacao} maxLength={120} placeholder="ex.: veio da 3M, brinco amarelo" data-testid="assistente-anotacao"
        onChange={e => onPerfil({ anotacao: e.target.value })} className={cn('h-[26px] text-[11.5px]', erro?.campo === 'anotacao' && 'border-destructive')} />
      <Nota erro={erro?.campo === 'anotacao' ? erro.mensagem : null}>até 120 letras; fica na ficha do lote</Nota>
      {/* as etiquetas: as curtas duas por linha, as longas (raça, bezerros, prenha, programa) na linha inteira — cabe sem rolar a 1126×579
          mesmo na cria parida e prenha, e nenhum valor corta */}
      <table className="mt-1 w-full table-fixed border-collapse text-[10.5px]" data-testid="assistente-ficha">
        <colgroup><col style={{ width: 92 }} /><col /><col style={{ width: 92 }} /><col /></colgroup>
        <tbody>
          {linhasDasEtiquetas(etiquetas).map(par => (
            <tr key={par[0].rotulo} className="h-[19px] border-t border-[#eef0f3]">
              {par.map(l => [
                <td key={`${l.rotulo}-r`} className="truncate px-1 text-muted-foreground" title={l.rotulo}>{l.rotulo}</td>,
                <td key={`${l.rotulo}-v`} colSpan={par.length === 1 && ETIQUETAS_LARGAS.has(l.rotulo) ? 3 : 1} className="truncate px-1" title={l.valor ?? undefined}>
                  {l.valor ?? <span className="font-semibold text-[#b45309]" data-testid="assistente-completar">completar</span>}
                </td>,
              ])}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

