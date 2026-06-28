// ============================================================================
// WS1 — Estação de Conciliação (READ-ONLY / render-only).
// Modal quase-fullscreen que APENAS renderiza o payload de fn_ws_conciliacao.
//
// >>> NENHUMA escrita. A RPC roda UMA vez ao abrir (ou quando {tipo,id} mudam).
//     PROIBIDO recalcular confiança, reordenar candidatos, deduzir critérios ou
//     reconstruir informação. Toda decisão vem exclusivamente da RPC. <<<
//
// RPC não tipado nos types gerados -> (supabase as any).rpc (idioma do projeto).
// ============================================================================
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

// ── Contrato do payload (fn_ws_conciliacao, versao ws-01-readonly) ───────────
interface Contexto { cliente_id: string | null; conta_bancaria_id: string | null; ano_mes: string | null; }
interface Duplicidade {
  status_duplicidade: string | null; nivel_duplicidade: string | null; duplicado_de_id: string | null;
}
interface Relacionamentos {
  transferencia_grupo_id: string | null; contrato_id: string | null; financiamento_id: string | null;
  movimentacao_rebanho_id: string | null; boitel_id: string | null;
}
interface SistemaPayload {
  lancamento_id: string; data: string | null; valor: number | null; sinal: string | null;
  descricao: string | null; historico: string | null; status_transacao: string | null; origem_lancamento: string | null;
  favorecido_nome: string | null; centro_custo: string | null; subcentro: string | null;
  conta_bancaria_id: string | null; conta_bancaria_nome: string | null;
  documento: string | null; observacao: string | null;
  duplicidade: Duplicidade | null; relacionamentos: Relacionamentos | null;
}
interface OfxSuspeita {
  flag_suspeita_valor: boolean | null; flag_suspeita_fornecedor: boolean | null; flag_suspeita_motivo: string | null;
}
interface OfxPayload {
  extrato_id: string; data: string | null; valor: number | null; tipo_movimento: string | null;
  descricao: string | null; documento: string | null; saldo_apos: number | null;
  conta_bancaria_nome: string | null; arquivo_nome: string | null; hash_movimento: string | null;
  suspeita: OfxSuspeita | null;
}
interface Criterios {
  valor_igual: boolean | null; mesmo_sinal: boolean | null; data_igual: boolean | null;
  descricao_semelhante: boolean | null; mesmo_banco: boolean | null; existem_outros_candidatos: boolean | null;
}
interface Candidato {
  extrato_id: string | null; lancamento_id: string | null;
  data: string | null; valor: number | null; descricao: string | null; origem: string | null;
}
interface Sugestao { tipo: string | null; confianca: string | null; candidato: Candidato | null; criterios: Criterios | null; }
interface Lacuna { campo: string | null; motivo: string | null; }
interface WsPayload {
  versao: string | null; tipo: string | null; contexto: Contexto | null;
  sistema: SistemaPayload | null; ofx: OfxPayload | null;
  sugestoes: Sugestao[] | null; lacunas: Lacuna[] | null;
  acoes_disponiveis: Record<string, boolean> | null;
}

export interface EstacaoConciliacaoProps {
  tipo: 'sistema_sem_vinculo' | 'extrato_sem_vinculo';
  id: string;
  // Nome da conta já resolvido pelo pai (uuid->nome via contas carregadas).
  // A Estação apenas renderiza; não faz outra query.
  contaNome?: string;
  onClose: () => void;
}

const TIPO_LEGIVEL: Record<string, string> = {
  sistema_sem_vinculo: 'Lançamento do sistema sem vínculo no extrato',
  extrato_sem_vinculo: 'Movimento do extrato sem vínculo no sistema',
};

// Botões da barra inferior — todos desabilitados no WS1 (read-only).
const ACOES: Array<{ key: string; label: string }> = [
  { key: 'vincular', label: 'Vincular' },
  { key: 'editar', label: 'Editar' },
  { key: 'criar', label: 'Criar' },
  { key: 'ignorar', label: 'Ignorar' },
  { key: 'agrupar', label: 'Agrupar' },
];

// ── Helpers de apresentação (formatação, NUNCA recálculo) ───────────────────
const fmtBRL = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtData = (s: string | null | undefined): string => {
  if (!s) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
};

// TASK-004 — janela de conciliação normal. Candidato com |Δdata| > 7 dias NÃO é
// candidato automático (evita sugestão absurda, ex.: lançamento de 2020 p/ OFX de 2026).
// Filtro de APRESENTAÇÃO; não toca a RPC/score. Datas inparseáveis => mantém visível.
const JANELA_DIAS = 7;
function diffDias(a: string | null | undefined, b: string | null | undefined): number | null {
  const pa = a ? /^(\d{4})-(\d{2})-(\d{2})/.exec(a) : null;
  const pb = b ? /^(\d{4})-(\d{2})-(\d{2})/.exec(b) : null;
  if (!pa || !pb) return null;
  const da = Date.UTC(Number(pa[1]), Number(pa[2]) - 1, Number(pa[3]));
  const db = Date.UTC(Number(pb[1]), Number(pb[2]) - 1, Number(pb[3]));
  return Math.abs(Math.round((da - db) / 86400000));
}

// null / '' -> "—" itálico muted (fallback VISUAL; não altera payload). NUNCA esconde o campo.
function Valor({ v }: { v: string | number | null | undefined }) {
  if (v === null || v === undefined || v === '') {
    return <span className="italic text-muted-foreground/70">—</span>;
  }
  return <span className="text-foreground">{v}</span>;
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-px">
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground/80">{label}</span>
      <span className="text-xs leading-snug break-words">{children}</span>
    </div>
  );
}

function CardSecao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Card className="p-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-foreground/70 mb-1.5">{titulo}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">{children}</div>
    </Card>
  );
}

// Critério ✓/✗ (booleano) — apenas reflete o valor da RPC.
function CritBool({ label, v }: { label: string; v: boolean | null }) {
  const ok = v === true;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${ok ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
      {ok ? '✓' : '✗'} {label}
    </span>
  );
}
function CritInfo({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] bg-muted/60 text-muted-foreground/80">{children}</span>;
}

function badgeConfianca(c: string | null): 'default' | 'secondary' | 'outline' {
  if (c === 'alta') return 'default';
  if (c === 'media') return 'secondary';
  return 'outline';
}

// Humanização VISUAL do rótulo de lacuna a partir de lacunas[].campo (não toca payload).
const LACUNA_LABEL: Record<string, string> = {
  produto: 'Produto inexistente na origem',
  fitid: 'FITID inexistente na origem',
  anexo_nf: 'Anexo NF inexistente na origem',
};
function rotuloLacuna(campo: string | null): string {
  if (!campo) return '—';
  return LACUNA_LABEL[campo] ?? `${campo} inexistente na origem`;
}

export function EstacaoConciliacao({ tipo, id, contaNome, onClose }: EstacaoConciliacaoProps) {
  const [estado, setEstado] = useState<'loading' | 'erro' | 'ok'>('loading');
  const [payload, setPayload] = useState<WsPayload | null>(null);
  const [msgErro, setMsgErro] = useState<string>('');
  // TASK-003/D1 — índice do candidato em vinculação (null = ocioso).
  const [vinculandoIdx, setVinculandoIdx] = useState<number | null>(null);
  const queryClient = useQueryClient();
  // TASK-005/D2 — mini-form de criação a partir do OFX (modo extrato).
  const [criando, setCriando] = useState(false);
  const [fazendaId, setFazendaId] = useState('');
  const [subcentro, setSubcentro] = useState('');
  const [favorecidoId, setFavorecidoId] = useState('');
  const [obs, setObs] = useState('');
  const [doc, setDoc] = useState('');
  const [salvando, setSalvando] = useState(false);

  // RPC executada UMA ÚNICA VEZ ao abrir / quando {tipo,id} mudarem. Deps SÓ [tipo,id].
  useEffect(() => {
    let vivo = true;
    setEstado('loading');
    setPayload(null);
    setMsgErro('');
    (async () => {
      try {
        const { data, error } = await (supabase as any).rpc('fn_ws_conciliacao', { p_tipo: tipo, p_id: id });
        if (!vivo) return;
        if (error) {
          setMsgErro(error.message ?? 'Falha ao consultar a Estação.');
          setEstado('erro');
          return;
        }
        if (!data) {
          setMsgErro('A consulta não retornou dados.');
          setEstado('erro');
          return;
        }
        setPayload(data);
        setEstado('ok');
      } catch (e) {
        if (!vivo) return;
        setMsgErro(e instanceof Error ? e.message : 'Erro inesperado na Estação.');
        setEstado('erro');
      }
    })();
    return () => {
      vivo = false;
    };
  }, [tipo, id]);

  const contexto = payload?.contexto ?? null;
  const nomeConta = contaNome ?? '';
  const sistema = payload?.sistema ?? null;
  const ofx = payload?.ofx ?? null;
  const sugestoes = payload?.sugestoes ?? [];
  const lacunas = payload?.lacunas ?? [];

  // TASK-004/A — âncora de data por modo (sistema=lançamento, extrato=OFX) e
  // ocultação dos candidatos fora da janela de ±7 dias.
  const ancoraData = tipo === 'sistema_sem_vinculo' ? (sistema?.data ?? null) : (ofx?.data ?? null);
  const sugestoesVisiveis = sugestoes.filter((s) => {
    const d = diffDias(s.candidato?.data ?? null, ancoraData);
    return d === null || d <= JANELA_DIAS;
  });
  const ocultadosPorData = sugestoes.length - sugestoesVisiveis.length;

  // TASK-003/D1 — Vincular avulso via fn_vincular_extrato_lancamento.
  // sistema_sem_vinculo: âncora=lançamento, candidato=OFX (extrato_id).
  // extrato_sem_vinculo: âncora=OFX, candidato=lançamento (lancamento_id).
  // Guards/duplicidade/mês fechado ficam na RPC (SECURITY DEFINER). Só leitura aqui não muda.
  async function vincular(s: Sugestao, i: number) {
    const extratoId = tipo === 'sistema_sem_vinculo' ? (s.candidato?.extrato_id ?? null) : (ofx?.extrato_id ?? null);
    const lancamentoId = tipo === 'sistema_sem_vinculo' ? (sistema?.lancamento_id ?? null) : (s.candidato?.lancamento_id ?? null);
    if (!extratoId || !lancamentoId) {
      toast.error('Candidato sem IDs suficientes para vincular.');
      return;
    }
    setVinculandoIdx(i);
    try {
      const { error } = await (supabase as any).rpc('fn_vincular_extrato_lancamento', {
        p_extrato_id: extratoId,
        p_lancamento_id: lancamentoId,
      });
      if (error) throw error;
      toast.success('Vínculo criado — pendência resolvida.');
      queryClient.invalidateQueries({ queryKey: ['auditoria-soberana'] });
      queryClient.invalidateQueries({ queryKey: ['auditoria-extrato-existe'] });
      onClose();
    } catch (e) {
      // Erro de RPC do Supabase é PostgrestError (objeto, não instância de Error)
      // -> lê .message direto para mostrar o motivo real (ex.: "lancamento cancelado...").
      const msg = (e as { message?: string } | null)?.message || 'Falha ao vincular.';
      toast.error(msg);
      setVinculandoIdx(null);
    }
  }

  // TASK-005/D2 — criação atômica de lançamento a partir do OFX (modo extrato).
  // Verdade bancária (data/valor/sinal/tipo/conta) é semeada pela RPC do extrato;
  // o operador só completa fazenda (obrigatória) + classificação opcional.
  const clienteId = payload?.contexto?.cliente_id ?? null;
  const modoExtrato = tipo === 'extrato_sem_vinculo';
  const tipoOp = (ofx?.valor ?? 0) < 0 ? '2-Saídas' : '1-Entradas';
  const habilitarQueries = criando && modoExtrato && !!clienteId;

  const fazendasQ = useQuery({
    queryKey: ['estacao-fazendas', clienteId],
    enabled: habilitarQueries,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fazendas').select('id,nome').eq('cliente_id', clienteId).order('nome');
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });
  const fornecedoresQ = useQuery({
    queryKey: ['estacao-fornecedores', clienteId],
    enabled: habilitarQueries,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('financeiro_fornecedores').select('id,nome').eq('cliente_id', clienteId).order('nome');
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });
  const subcentrosQ = useQuery({
    queryKey: ['estacao-subcentros', clienteId, tipoOp],
    enabled: habilitarQueries,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('financeiro_plano_contas').select('subcentro')
        .eq('ativo', true).eq('tipo_operacao', tipoOp)
        .or(`cliente_id.is.null,cliente_id.eq.${clienteId}`);
      if (error) throw error;
      const set = new Set<string>();
      for (const r of (data ?? []) as { subcentro: string | null }[]) if (r.subcentro) set.add(r.subcentro);
      return Array.from(set).sort();
    },
  });

  async function criarLancamento() {
    if (!ofx?.extrato_id || !fazendaId) { toast.error('Selecione a fazenda.'); return; }
    setSalvando(true);
    try {
      const { error } = await (supabase as any).rpc('fn_criar_lancamento_de_extrato', {
        p_extrato_id: ofx.extrato_id,
        p_fazenda_id: fazendaId,
        p_subcentro: subcentro || null,
        p_observacao: obs || null,
        p_favorecido_id: favorecidoId || null,
        p_numero_documento: doc || null,
      });
      if (error) throw error;
      toast.success('Lançamento criado e vinculado — pendência resolvida.');
      queryClient.invalidateQueries({ queryKey: ['auditoria-soberana'] });
      queryClient.invalidateQueries({ queryKey: ['auditoria-extrato-existe'] });
      onClose();
    } catch (e) {
      // PostgrestError (objeto, não Error) -> lê .message para mostrar o motivo real.
      const msg = (e as { message?: string } | null)?.message || 'Falha ao criar lançamento.';
      toast.error(msg);
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[90vw] w-[90vw] h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
        {/* 1. Cabeçalho enxuto */}
        <header className="shrink-0 border-b px-5 pr-12 py-2.5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">Estação de Conciliação</div>
            <DialogTitle className="text-sm font-semibold mt-0.5 truncate">{TIPO_LEGIVEL[tipo] ?? tipo}</DialogTitle>
            <DialogDescription className="text-[11px] mt-0.5">
              Conta: <span className="font-medium text-foreground">{nomeConta || '—'}</span>
              {' · '}Competência: <span className="font-medium text-foreground">{contexto?.ano_mes ?? '—'}</span>
            </DialogDescription>
          </div>
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500/70" />
            Somente leitura
          </span>
        </header>

        {/* Corpo: loading | erro | ok */}
        <div className="flex-1 min-h-0">
          {estado === 'loading' && (
            <div className="h-full flex">
              <div className="flex-[1.7] p-3 space-y-2 overflow-hidden">
                {[0, 1, 2, 3].map((i) => (
                  <Card key={i} className="p-2 space-y-1.5">
                    <Skeleton className="h-2.5 w-24" />
                    <div className="grid grid-cols-2 gap-2">
                      <Skeleton className="h-7 w-full" /><Skeleton className="h-7 w-full" />
                      <Skeleton className="h-7 w-full" /><Skeleton className="h-7 w-full" />
                    </div>
                  </Card>
                ))}
              </div>
              <div className="flex-1 p-3 space-y-2 border-l bg-muted/20 overflow-hidden">
                {[0, 1].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
              </div>
            </div>
          )}

          {estado === 'erro' && (
            <div className="h-full flex items-center justify-center p-8">
              <Card className="max-w-md p-5 text-center border-rose-500/30">
                <div className="text-sm font-semibold text-rose-600 dark:text-rose-400 mb-1">Não foi possível carregar a Estação</div>
                <div className="text-xs text-muted-foreground break-words">{msgErro}</div>
                <div className="mt-3">
                  <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
                </div>
              </Card>
            </div>
          )}

          {estado === 'ok' && payload && (
            <div className="h-full flex">
              {/* 2. Painel âncora (esq, flex 1.7) */}
              <section className="flex-[1.7] min-w-0 overflow-y-auto p-3 space-y-2">
                {tipo === 'sistema_sem_vinculo' ? (
                  <>
                    <CardSecao titulo="Identificação">
                      <Campo label="Data"><Valor v={fmtData(sistema?.data) || null} /></Campo>
                      <Campo label="Valor">
                        <span className="inline-flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">{sistema?.sinal === '-1' ? 'saída' : 'entrada'}</Badge>
                          <Valor v={fmtBRL(sistema?.valor)} />
                        </span>
                      </Campo>
                      <Campo label="Descrição"><Valor v={sistema?.descricao} /></Campo>
                      <Campo label="Histórico"><Valor v={sistema?.historico} /></Campo>
                    </CardSecao>

                    <CardSecao titulo="Classificação">
                      <Campo label="Favorecido"><Valor v={sistema?.favorecido_nome} /></Campo>
                      <Campo label="Centro de custo"><Valor v={sistema?.centro_custo} /></Campo>
                      <Campo label="Subcentro"><Valor v={sistema?.subcentro} /></Campo>
                      <Campo label="Conta bancária"><Valor v={sistema?.conta_bancaria_nome} /></Campo>
                    </CardSecao>

                    <CardSecao titulo="Integridade">
                      <Campo label="Duplicidade · status"><Valor v={sistema?.duplicidade?.status_duplicidade} /></Campo>
                      <Campo label="Duplicidade · nível"><Valor v={sistema?.duplicidade?.nivel_duplicidade} /></Campo>
                      <Campo label="Duplicado de"><Valor v={sistema?.duplicidade?.duplicado_de_id} /></Campo>
                      <Campo label="Documento"><Valor v={sistema?.documento} /></Campo>
                      <Campo label="Relacionamentos">
                        {(() => {
                          const r = sistema?.relacionamentos;
                          const itens = r
                            ? Object.entries(r).filter(([, val]) => val !== null && val !== '')
                            : [];
                          if (itens.length === 0) return <Valor v={null} />;
                          return (
                            <span className="flex flex-wrap gap-1">
                              {itens.map(([k, val]) => (
                                <Badge key={k} variant="secondary" className="text-[10px]">{k}: {String(val)}</Badge>
                              ))}
                            </span>
                          );
                        })()}
                      </Campo>
                      <Campo label="Observação"><Valor v={sistema?.observacao} /></Campo>
                    </CardSecao>

                    <CardSecao titulo="Lacunas">
                      {lacunas.length === 0 ? (
                        <Campo label="—"><Valor v={null} /></Campo>
                      ) : (
                        <div className="col-span-2 flex flex-col gap-0.5">
                          {lacunas.map((l, i) => (
                            <span key={i} className="text-xs text-foreground/90">{rotuloLacuna(l.campo)}</span>
                          ))}
                        </div>
                      )}
                    </CardSecao>
                  </>
                ) : (
                  <>
                    {/* MODO OFX — âncora = payload.ofx (nasce pronto; não acionado no WS1) */}
                    <CardSecao titulo="Identificação">
                      <Campo label="Data"><Valor v={fmtData(ofx?.data) || null} /></Campo>
                      <Campo label="Valor"><Valor v={fmtBRL(ofx?.valor)} /></Campo>
                      <Campo label="Tipo de movimento"><Valor v={ofx?.tipo_movimento} /></Campo>
                      <Campo label="Descrição"><Valor v={ofx?.descricao} /></Campo>
                    </CardSecao>

                    <CardSecao titulo="Classificação">
                      <Campo label="Conta bancária"><Valor v={ofx?.conta_bancaria_nome} /></Campo>
                      <Campo label="Documento"><Valor v={ofx?.documento} /></Campo>
                      <Campo label="Arquivo de origem"><Valor v={ofx?.arquivo_nome} /></Campo>
                      <Campo label="Saldo após"><Valor v={fmtBRL(ofx?.saldo_apos)} /></Campo>
                    </CardSecao>

                    <CardSecao titulo="Integridade">
                      <Campo label="Hash do movimento"><Valor v={ofx?.hash_movimento} /></Campo>
                      <Campo label="Suspeita · valor"><Valor v={ofx?.suspeita?.flag_suspeita_valor === null || ofx?.suspeita?.flag_suspeita_valor === undefined ? null : String(ofx?.suspeita?.flag_suspeita_valor)} /></Campo>
                      <Campo label="Suspeita · fornecedor"><Valor v={ofx?.suspeita?.flag_suspeita_fornecedor === null || ofx?.suspeita?.flag_suspeita_fornecedor === undefined ? null : String(ofx?.suspeita?.flag_suspeita_fornecedor)} /></Campo>
                      <Campo label="Suspeita · motivo"><Valor v={ofx?.suspeita?.flag_suspeita_motivo} /></Campo>
                    </CardSecao>

                    <CardSecao titulo="Lacunas">
                      {lacunas.length === 0 ? (
                        <Campo label="—"><Valor v={null} /></Campo>
                      ) : (
                        <div className="col-span-2 flex flex-col gap-0.5">
                          {lacunas.map((l, i) => (
                            <span key={i} className="text-xs text-foreground/90">{rotuloLacuna(l.campo)}</span>
                          ))}
                        </div>
                      )}
                    </CardSecao>
                  </>
                )}
              </section>

              {/* 3. Trilho de candidatos (dir, flex 1) */}
              <aside className="flex-1 min-w-0 overflow-y-auto p-3 space-y-2 border-l bg-muted/20">
                <div className="text-[10px] font-bold uppercase tracking-wider text-foreground/70">
                  Candidatos automáticos
                </div>
                {/* TASK-006B — lançamento com conta nula: será definida pelo OFX ao vincular */}
                {tipo === 'sistema_sem_vinculo' && !sistema?.conta_bancaria_id && sugestoesVisiveis.length > 0 && (
                  <div className="rounded border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-[10px] text-amber-700 dark:text-amber-400">
                    Conta bancária será definida pelo extrato ao vincular.
                  </div>
                )}
                {sugestoesVisiveis.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-6 text-center space-y-1">
                    <div className="italic">nenhum candidato automático</div>
                    {ocultadosPorData > 0 && (
                      <div className="text-[11px] text-foreground/70">
                        Sem candidato na mesma conta dentro de ±{JANELA_DIAS} dias.
                      </div>
                    )}
                    <div className="text-[11px]">
                      Pode ser transferência entre contas próprias ou exigir agrupamento.
                    </div>
                  </div>
                ) : (
                  <>
                    {ocultadosPorData > 0 && (
                      <div className="text-[10px] italic text-muted-foreground/80 pb-1">
                        {ocultadosPorData} candidato(s) ocultado(s) por data fora de ±{JANELA_DIAS} dias.
                      </div>
                    )}
                    {sugestoesVisiveis.map((s, i) => {
                    const c = s.criterios;
                    return (
                      <Card key={i} className="p-2 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.candidato?.origem ?? '—'}</span>
                          <Badge variant={badgeConfianca(s.confianca)} className="text-[9px] px-1.5 py-0 capitalize">{s.confianca ?? '—'}</Badge>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-base font-semibold tabular-nums leading-none">{fmtBRL(s.candidato?.valor)}</span>
                          <span className="text-[11px] text-muted-foreground">{fmtData(s.candidato?.data) || '—'}</span>
                        </div>
                        <div className="text-xs break-words"><Valor v={s.candidato?.descricao} /></div>
                        {/* Critérios = justificativa da sugestão (destacados) */}
                        <div className="rounded border border-border/60 bg-background/60 p-1.5 flex flex-wrap gap-1">
                          <CritBool label="valor" v={c?.valor_igual ?? null} />
                          <CritBool label="sinal" v={c?.mesmo_sinal ?? null} />
                          <CritBool label="data" v={c?.data_igual ?? null} />
                          {(c?.descricao_semelhante ?? null) === null && <CritInfo>descrição: não calculado</CritInfo>}
                          {(c?.mesmo_banco ?? null) === null && <CritInfo>banco: não calculado</CritInfo>}
                          {c?.existem_outros_candidatos === true && (
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400">⚠ outros</span>
                          )}
                        </div>
                        {(() => {
                          const podeVincular = tipo === 'sistema_sem_vinculo'
                            ? !!(s.candidato?.extrato_id && sistema?.lancamento_id)
                            : !!(s.candidato?.lancamento_id && ofx?.extrato_id);
                          return (
                            <Button
                              size="sm"
                              className="w-full h-7 text-[11px]"
                              disabled={!podeVincular || vinculandoIdx !== null}
                              onClick={() => vincular(s, i)}
                            >
                              {vinculandoIdx === i ? 'Vinculando…' : 'Vincular'}
                            </Button>
                          );
                        })()}
                      </Card>
                    );
                    })}
                  </>
                )}

                {/* TASK-005/D2 — criar lançamento a partir do OFX (só modo extrato) */}
                {modoExtrato && (
                  <Card className="p-2 space-y-2 border-primary/30">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-foreground/70">
                      Criar lançamento deste OFX
                    </div>
                    {!criando ? (
                      <Button size="sm" variant="outline" className="w-full h-7 text-[11px]"
                              onClick={() => setCriando(true)}>
                        Criar lançamento
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        {/* Verdade bancária — read-only */}
                        <div className="rounded border bg-muted/30 p-1.5 text-[10px] space-y-0.5">
                          <div>Data <b>{fmtData(ofx?.data) || '—'}</b> · {tipoOp === '2-Saídas' ? 'Saída' : 'Entrada'}</div>
                          <div>Valor <b>{fmtBRL(Math.abs(ofx?.valor ?? 0))}</b></div>
                          <div>Conta <b>{ofx?.conta_bancaria_nome ?? '—'}</b></div>
                          <div className="truncate">Descrição: {ofx?.descricao ?? '—'}</div>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[9px] uppercase text-muted-foreground">Fazenda *</span>
                          <Select value={fazendaId} onValueChange={setFazendaId}>
                            <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                            <SelectContent>
                              {(fazendasQ.data ?? []).map((f) => (
                                <SelectItem key={f.id} value={f.id} className="text-[11px]">{f.nome}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[9px] uppercase text-muted-foreground">Subcentro (opcional)</span>
                          <Select value={subcentro} onValueChange={setSubcentro}>
                            <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              {(subcentrosQ.data ?? []).map((s) => (
                                <SelectItem key={s} value={s} className="text-[11px]">{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[9px] uppercase text-muted-foreground">Favorecido (opcional)</span>
                          <Select value={favorecidoId} onValueChange={setFavorecidoId}>
                            <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              {(fornecedoresQ.data ?? []).map((f) => (
                                <SelectItem key={f.id} value={f.id} className="text-[11px]">{f.nome}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Input value={obs} onChange={(e) => setObs(e.target.value)}
                               placeholder="Observação (opcional)" className="h-7 text-[11px]" />
                        <Input value={doc} onChange={(e) => setDoc(e.target.value)}
                               placeholder="Documento (opcional)" className="h-7 text-[11px]" />
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="ghost" className="h-7 text-[11px] flex-1"
                                  disabled={salvando} onClick={() => setCriando(false)}>
                            Cancelar
                          </Button>
                          <Button size="sm" className="h-7 text-[11px] flex-1"
                                  disabled={!fazendaId || salvando} onClick={criarLancamento}>
                            {salvando ? 'Salvando…' : 'Salvar'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                )}
              </aside>
            </div>
          )}
        </div>

        {/* 4. Barra inferior fixa — slots visuais; todas as ações desabilitadas (read-only) */}
        <footer className="shrink-0 border-t px-5 py-2 flex items-center justify-between gap-3 bg-muted/30">
          <div className="flex flex-wrap gap-1.5">
            {ACOES.map((a) => (
              <Button
                key={a.key}
                size="sm"
                variant="outline"
                disabled={!(payload?.acoes_disponiveis?.[a.key] === true)}
                title="próximo PR"
                className="h-6 px-2 text-[11px] border-dashed text-muted-foreground/70 opacity-60"
              >
                {a.label}
              </Button>
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground/70">(somente leitura)</span>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
