import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import type { EventosApi, EventoOC } from '@/hooks/useOperacaoEventos';
import { frasearEvento, type Resolvedores } from '@/lib/oc/frasearEvento';
import { ESPECIE_LABEL } from './DocumentoFormOC';
import type { EspecieDoc } from '@/hooks/useOperacaoDocumentos';

/* Aba Auditoria da operacao (PR-OC-AUDITORIA-01). SO LEITURA.
   Variante de LINHA UNICA do padrao A18: tres colunas alinhadas na vertical, sem valor a
   direita e sem pilula de estado. A leitura e' de cima para baixo, como uma historia.
   ⚠ NENHUM CODIGO NA TELA. A traducao mora em `frasearEvento`; aqui so se decide o
   arranjo. Quem precisa do identificador clica na linha — e' o que separa auditoria de
   historia bonita. */

interface Props {
  api: EventosApi;
  operacaoPronta: boolean;
  fornecedores?: { id: string; nome: string; cpfCnpj?: string | null }[];
  lotes?: { loteId: string; ordem: number; categoria: string | null }[];
}

/* ⚠ PRIMEIRO NOME, decisao do Gabriel: a coluna e' estreita e "Gabriel" identifica tao
   bem quanto "Gabriel Junqueira" numa lista de cinco pessoas. Sem cor por pessoa — com
   cinco usuarios viraria arco-iris, e a coluna alinhada ja resolve a leitura. */
const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0];

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const chaveDia = (iso: string) => new Date(iso).toLocaleDateString('sv-SE');   // YYYY-MM-DD local

function rotuloDia(chave: string): string {
  const hoje = new Date().toLocaleDateString('sv-SE');
  if (chave === hoje) return 'Hoje';
  const ontem = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE');
  if (chave === ontem) return 'Ontem';
  const [a, m, d] = chave.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

const copiar = (texto: string, oque: string) => {
  void navigator.clipboard.writeText(texto)
    .then(() => toast.success(`${oque} copiado.`))
    .catch(() => toast.error('Não foi possível copiar.'));
};

/** Bloco tecnico do clique: rotulo + json, com o botao de copiar do lado. */
function BlocoTecnico({ rotulo, valor }: { rotulo: string; valor: unknown }) {
  if (valor == null || (typeof valor === 'object' && Object.keys(valor as object).length === 0)) return null;
  const json = JSON.stringify(valor, null, 2);
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{rotulo}</span>
        <Button type="button" variant="ghost" size="icon" className="h-4 w-4"
          title={`Copiar ${rotulo}`} aria-label={`Copiar ${rotulo}`}
          onClick={() => copiar(json, rotulo)}><Copy className="h-2.5 w-2.5" /></Button>
      </div>
      <pre className="mt-0.5 max-h-48 overflow-auto rounded border bg-background px-2 py-1 text-[10px] leading-tight">{json}</pre>
    </div>
  );
}

export function AbaAuditoriaOC({ api, operacaoPronta, fornecedores, lotes }: Props) {
  const { user } = useAuth();
  const [abertoId, setAbertoId] = useState<string | null>(null);

  if (!operacaoPronta) {
    return (
      <div className="rounded-md border border-dashed bg-muted/10 px-3 py-5 text-center text-[11px] text-muted-foreground">
        Salve a operação na aba Compra para que o histórico comece.
      </div>
    );
  }

  /* ⚠ NAO HA FONTE DE NOME PARA OUTRO USUARIO NO NAVEGADOR — medido, nao suposto:
     `profiles` esta VAZIA (0 linhas) e o nome so existe em `auth.users.raw_user_meta_data`,
     que o cliente le apenas para a PROPRIA sessao. Entao resolve-se quem esta logado e o
     resto fica "—", a sentinela de dado ausente. Hoje isso cobre 100% dos 357 eventos do
     proto, porque ha um unico autor; no dia em que houver o segundo, o nome dele depende
     de `profiles` passar a ser preenchida. Registrado no relatorio, nao escondido. */
  const meuNome = useMemo(() => {
    const meta = user?.user_metadata as { nome?: unknown; full_name?: unknown } | undefined;
    const bruto = typeof meta?.nome === 'string' ? meta.nome
      : typeof meta?.full_name === 'string' ? meta.full_name
      : user?.email ? user.email.split('@')[0] : null;
    return bruto ? primeiroNome(bruto) : null;
  }, [user]);

  const nomeDe = (usuarioId: string | null) =>
    (usuarioId && user?.id === usuarioId ? meuNome : null);

  const resolvedores: Resolvedores = useMemo(() => ({
    fornecedor: (id: string) => (fornecedores ?? []).find(f => f.id === id)?.nome ?? null,
    lote: (id: string) => {
      const l = (lotes ?? []).find(x => x.loteId === id);
      return l ? `Lote ${l.ordem}${l.categoria ? ` · ${l.categoria}` : ''}` : null;
    },
    especie: (e: string) => ESPECIE_LABEL[e as EspecieDoc] ?? 'um documento',
  }), [fornecedores, lotes]);

  /* Agrupa por DIA preservando a ordem que veio do banco (mais recente primeiro). */
  const dias = useMemo(() => {
    const mapa = new Map<string, EventoOC[]>();
    for (const e of api.eventos) {
      const k = chaveDia(e.criadoEm);
      const lista = mapa.get(k);
      if (lista) lista.push(e); else mapa.set(k, [e]);
    }
    return [...mapa.entries()];
  }, [api.eventos]);

  /* "46 registros · Gabriel" com um autor so; "· 3 pessoas" com mais de um. Dizer
     "1 pessoa" nao informa nada quando se pode dizer QUEM. */
  const autores = new Set(api.eventos.map(e => e.usuarioId).filter(Boolean));
  const soUmAutor = autores.size === 1 ? nomeDe([...autores][0] as string) : null;
  /* ⚠ COLUNA DO AUTOR SO EXISTE QUANDO DISTINGUE. Com um autor so, ela repetiria o
     mesmo nome em todas as linhas — o defeito exato do "Mesmo da operação" que a lista
     de documentos acabou de perder. O cabecalho ja diz quem e', uma vez. Dois ou mais
     autores e a coluna volta, porque ai ela separa uma linha da outra. */
  const mostrarAutor = autores.size > 1;
  const resumo = api.eventos.length === 0 ? null
    : `${api.eventos.length} registro${api.eventos.length > 1 ? 's' : ''}`
      + (soUmAutor ? ` · ${soUmAutor}` : autores.size > 1 ? ` · ${autores.size} pessoas` : '');

  return (
    <div className="rounded-md border bg-card p-2 shadow-sm space-y-2 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-foreground min-w-0 truncate">Histórico da operação</span>
        {resumo && <span className="text-[11px] text-muted-foreground shrink-0">{resumo}</span>}
      </div>

      <div className="rounded-md border overflow-hidden">
        {api.eventos.length === 0 && (
          <div className="px-3.5 py-4 text-center text-[11px] text-muted-foreground">
            {api.loading ? 'Carregando…' : 'Nenhum registro ainda. Cada ação nesta operação entra aqui.'}
          </div>
        )}
        {dias.map(([dia, doDia]) => (
          <div key={dia}>
            <div className="bg-muted/40 px-3.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {rotuloDia(dia)}
            </div>
            {doDia.map(e => {
              const { frase, detalhe } = frasearEvento(e, resolvedores);
              const nome = nomeDe(e.usuarioId);
              const aberto = abertoId === e.id;
              return (
                <div key={e.id} className="border-t first:border-t-0">
                  {/* ⚠ A LINHA INTEIRA E' O BOTAO. Alvo de 22px ja e' pequeno; exigir
                      mira num icone tornaria o detalhe tecnico inalcancavel na pratica. */}
                  <button type="button" onClick={() => setAbertoId(aberto ? null : e.id)}
                    className={`flex w-full items-baseline gap-2 px-3.5 py-1 text-left leading-[1.4] hover:bg-muted/30 ${aberto ? 'bg-muted/30' : ''}`}>
                    <span className="w-[34px] shrink-0 text-[11px] tabular-nums text-muted-foreground">{hora(e.criadoEm)}</span>
                    {mostrarAutor && (
                      <span className="w-[62px] shrink-0 truncate text-[12px] text-muted-foreground"
                        title={nome ?? 'Autor não identificado nesta sessão'}>{nome ?? '—'}</span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                      {frase}
                      {detalhe && <span className="ml-1.5 text-muted-foreground">{detalhe}</span>}
                    </span>
                    <ChevronDown className={`h-3 w-3 shrink-0 text-muted-foreground/50 transition-transform ${aberto ? 'rotate-180' : ''}`} />
                  </button>

                  {/* ⚠ AUDITORIA SEM RASTREABILIDADE E' HISTORIA BONITA, NAO PROVA. Havendo
                      divergencia, alguem precisa chegar ao registro — por isso o payload
                      inteiro, os identificadores e o id do evento, todos copiaveis. */}
                  {aberto && (
                    <div className="space-y-1.5 border-t bg-muted/10 px-3.5 py-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <span className="font-semibold uppercase tracking-wide">evento</span>
                          <code className="rounded bg-background px-1 py-0.5">{e.id}</code>
                          <Button type="button" variant="ghost" size="icon" className="h-4 w-4"
                            title="Copiar id do evento" aria-label="Copiar id do evento"
                            onClick={() => copiar(e.id, 'Id do evento')}><Copy className="h-2.5 w-2.5" /></Button>
                        </span>
                        <span><span className="font-semibold uppercase tracking-wide">ação</span> <code className="rounded bg-background px-1 py-0.5">{e.acao}</code></span>
                        <span><span className="font-semibold uppercase tracking-wide">origem</span> {e.origem ?? '—'}</span>
                        <span><span className="font-semibold uppercase tracking-wide">quando</span> {new Date(e.criadoEm).toLocaleString('pt-BR')}</span>
                        {e.usuarioId && (
                          <span className="flex items-center gap-1">
                            <span className="font-semibold uppercase tracking-wide">autor</span>
                            <code className="rounded bg-background px-1 py-0.5">{e.usuarioId}</code>
                            <Button type="button" variant="ghost" size="icon" className="h-4 w-4"
                              title="Copiar id do autor" aria-label="Copiar id do autor"
                              onClick={() => copiar(e.usuarioId!, 'Id do autor')}><Copy className="h-2.5 w-2.5" /></Button>
                          </span>
                        )}
                      </div>
                      <div className="grid gap-1.5 lg:grid-cols-3">
                        <BlocoTecnico rotulo="detalhes" valor={e.detalhes} />
                        <BlocoTecnico rotulo="antes" valor={e.dadosAnteriores} />
                        <BlocoTecnico rotulo="depois" valor={e.dadosNovos} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {api.temMais && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" size="sm" className="h-6 text-[10px]"
            disabled={api.loading} onClick={api.carregarMais}>
            {api.loading ? 'Carregando…' : 'Ver mais'}
          </Button>
        </div>
      )}
    </div>
  );
}
