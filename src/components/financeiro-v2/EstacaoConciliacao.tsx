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
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

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
  favorecido_nome: string | null; centro_custo: string | null; subcentro: string | null; conta_bancaria_nome: string | null;
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
                {sugestoes.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic py-6 text-center">nenhum candidato automático</div>
                ) : (
                  sugestoes.map((s, i) => {
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
                        <div className="text-[9px] uppercase tracking-wide text-muted-foreground/70">somente leitura</div>
                      </Card>
                    );
                  })
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
