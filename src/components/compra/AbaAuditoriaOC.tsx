import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { TrilhaAuditoria, primeiroNome, type EventoTrilha } from '@/components/ui/trilha-auditoria';
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

export function AbaAuditoriaOC({ api, operacaoPronta, fornecedores, lotes }: Props) {
  const { user } = useAuth();

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

  /* "46 registros · Gabriel" com um autor so; "· 3 pessoas" com mais de um. Dizer
     "1 pessoa" nao informa nada quando se pode dizer QUEM. */
  const autores = new Set(api.eventos.map(e => e.usuarioId).filter(Boolean));
  const soUmAutor = autores.size === 1 ? nomeDe([...autores][0] as string) : null;
  const resumo = api.eventos.length === 0 ? null
    : `${api.eventos.length} registro${api.eventos.length > 1 ? 's' : ''}`
      + (soUmAutor ? ` · ${soUmAutor}` : autores.size > 1 ? ` · ${autores.size} pessoas` : '');

  /* ⚠ A TRADUÇÃO CONTINUA AQUI, o desenho é que saiu. `frasearEvento` sabe o vocabulário da
     operação — lote, espécie, fornecedor —, e isso não pode descer para um componente de
     `ui/` sem levar a compra junto. */
  const linhas: EventoTrilha[] = api.eventos.map((e) => {
    const { frase, detalhe } = frasearEvento(e, resolvedores);
    return {
      id: e.id,
      quando: e.criadoEm,
      autor: nomeDe(e.usuarioId),
      autorId: e.usuarioId,
      frase,
      detalhe,
      chips: [
        { rotulo: 'ação', valor: e.acao, copiavel: true },
        { rotulo: 'origem', valor: e.origem ?? '—' },
        { rotulo: 'quando', valor: new Date(e.criadoEm).toLocaleString('pt-BR') },
        ...(e.usuarioId ? [{ rotulo: 'autor', valor: e.usuarioId, copiavel: true }] : []),
      ],
      blocos: [
        { rotulo: 'detalhes', valor: e.detalhes },
        { rotulo: 'antes', valor: e.dadosAnteriores },
        { rotulo: 'depois', valor: e.dadosNovos },
      ],
    };
  });

  return (
    <div className="rounded-md border bg-card p-2 shadow-sm space-y-2 min-w-0">
      {/* ── A21 — O CABECALHO NAO ROLA ────────────────────────────────────────────
          Aqui a regra pesa mais do que em qualquer outra tela: sao 361 eventos no proto,
          46 numa unica operacao. Rolar uma trilha longa e perder de vista de qual
          operacao ela e', e quantos registros existem, e ficar lendo linhas soltas.
          Fundo opaco (`bg-card`) e `-mt-2 pt-2` cobrindo o padding do cartao — ver o
          mesmo bloco em AbaDocumentosOC.
          ⚠ O `sticky` so funciona porque a ROLAGEM mora na coluna de conteudo do shell,
          e nao no corpo inteiro do modal. Enquanto rolava o corpo, este mesmo codigo
          fixava o titulo e deixava o Resumo da operacao subir junto. */}
      <div className="sticky top-0 z-10 -mt-2 flex items-center justify-between gap-2 border-b bg-card pt-2 pb-2">
        <span className="text-[12px] font-semibold text-foreground min-w-0 truncate">Histórico da operação</span>
        {resumo && <span className="text-[10px] text-muted-foreground shrink-0">{resumo}</span>}
      </div>

      <TrilhaAuditoria
        eventos={linhas}
        vazio={api.loading ? 'Carregando…' : 'Nenhum registro ainda. Cada ação nesta operação entra aqui.'}
      />

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
