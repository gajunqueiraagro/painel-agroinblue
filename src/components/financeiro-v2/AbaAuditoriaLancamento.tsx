/**
 * A ABA AUDITORIA DO LANÇAMENTO — PR-FIN-AUDIT-01.
 *
 * ⚠ LÊ AO ABRIR A ABA, NÃO AO ABRIR O MODAL. São 41.241 eventos de lançamento e 5.004 de
 * conciliação no proto — medido em 09/09/2026. Quem abre o modal para corrigir um valor não
 * deve pagar por uma trilha que não vai ler.
 *
 * ⚠ DUAS TRILHAS, UMA LISTA. `audit_log` guarda o que mudou no lançamento e
 * `conciliacao_audit_log` guarda o que aconteceu entre ele e o extrato. Separá-las em duas
 * listas obrigaria o operador a intercalar datas de cabeça para entender que o valor mudou
 * DEPOIS da conciliação — que é justamente a pergunta que ele veio fazer.
 *
 * ⚠ A CRIAÇÃO NÃO É EVENTO. O trigger é AFTER UPDATE: nenhum lançamento tem linha de "criou".
 * A última linha da trilha é montada do próprio registro (`created_by`/`created_at`), e por
 * isso ela existe mesmo quando não houve nenhuma edição.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { TrilhaAuditoria, primeiroNome, type EventoTrilha } from '@/components/ui/trilha-auditoria';
import {
  fraseDoEvento, camposMudados,
  type CatalogosAuditoria, type EventoAuditoriaBruto,
} from '@/v2/lib/auditoriaLancamento';

interface Props {
  lancamentoId: string | null;
  criadoPor: string | null;
  criadoEm: string | null;
  descricao: string | null;
  catalogos: CatalogosAuditoria;
}

interface LinhaAudit {
  id: string; acao: string; usuario_id: string | null; created_at: string;
  dados_anteriores: unknown; dados_novos: unknown;
}
interface LinhaConcil {
  id: string; acao: string; actor_user_id: string | null; created_at: string;
  extrato_id: string | null; motivo: string | null;
  payload_antes: unknown; payload_depois: unknown;
}

export function AbaAuditoriaLancamento({ lancamentoId, criadoPor, criadoEm, descricao, catalogos }: Props) {
  const { user } = useAuth();
  const [eventos, setEventos] = useState<EventoTrilha[] | null>(null);

  useEffect(() => {
    if (!lancamentoId) { setEventos([]); return; }
    let cancelado = false;
    setEventos(null);
    (async () => {
      const [resAudit, resConcil] = await Promise.all([
        supabase.from('audit_log')
          .select('id, acao, usuario_id, created_at, dados_anteriores, dados_novos')
          .eq('tabela_origem', 'financeiro_lancamentos_v2')
          .eq('registro_id', lancamentoId)
          .order('created_at', { ascending: false }),
        supabase.from('conciliacao_audit_log')
          .select('id, acao, actor_user_id, created_at, extrato_id, motivo, payload_antes, payload_depois')
          .eq('lancamento_id', lancamentoId)
          .order('created_at', { ascending: false }),
      ]);

      const brutos: (EventoAuditoriaBruto & { blocos: { rotulo: string; valor: unknown }[] })[] = [];

      for (const r of (resAudit.data ?? []) as LinhaAudit[]) {
        brutos.push({
          id: r.id, acao: r.acao, criadoEm: r.created_at, autorId: r.usuario_id,
          antes: r.dados_anteriores, depois: r.dados_novos,
          motivo: motivoDoCancelamento(r.dados_novos),
          blocos: [{ rotulo: 'antes', valor: r.dados_anteriores }, { rotulo: 'depois', valor: r.dados_novos }],
        });
      }
      for (const r of (resConcil.data ?? []) as LinhaConcil[]) {
        brutos.push({
          id: r.id, acao: r.acao, criadoEm: r.created_at, autorId: r.actor_user_id,
          antes: r.payload_antes, depois: r.payload_depois, motivo: r.motivo,
          dataExtrato: dataDoPayload(r.payload_depois) ?? dataDoPayload(r.payload_antes),
          blocos: [{ rotulo: 'antes', valor: r.payload_antes }, { rotulo: 'depois', valor: r.payload_depois }],
        });
      }

      /* Uma trilha só, do mais recente para o mais antigo. */
      brutos.sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : a.criadoEm > b.criadoEm ? -1 : 0));

      /* ⚠ `profiles` ESTÁ VAZIA (0 linhas, medido em 09/09/2026), então a consulta abaixo
         hoje volta sem nada e todo autor cairia em "—". O nome da sessão corrente é a única
         fonte que o navegador tem, e é o mesmo caminho já usado pela aba Auditoria da OC.
         No dia em que `profiles` for preenchida, ela passa a mandar sem tocar nesta tela. */
      const ids = [...new Set([criadoPor, ...brutos.map((b) => b.autorId)].filter((x): x is string => !!x))];
      const nomes = new Map<string, string>();
      if (ids.length) {
        const { data } = await supabase.from('profiles').select('user_id, nome').in('user_id', ids);
        for (const p of (data ?? []) as { user_id: string; nome: string | null }[]) {
          if (p.user_id && p.nome) nomes.set(p.user_id, primeiroNome(p.nome));
        }
      }
      const meta = user?.user_metadata as { nome?: unknown; full_name?: unknown } | undefined;
      const meuNomeBruto = typeof meta?.nome === 'string' ? meta.nome
        : typeof meta?.full_name === 'string' ? meta.full_name
        : user?.email ? user.email.split('@')[0] : null;
      if (user?.id && meuNomeBruto && !nomes.has(user.id)) nomes.set(user.id, primeiroNome(meuNomeBruto));

      /* Autor nulo é o sistema — trigger, importação, rotina. Não é "não sei quem foi". */
      const autorDe = (id: string | null) => (id === null ? 'sistema' : nomes.get(id) ?? null);

      const linhas: EventoTrilha[] = brutos.map((b) => {
        const { frase, detalhe } = fraseDoEvento(b, catalogos);
        const mudou = camposMudados(b.antes, b.depois, catalogos);
        return {
          id: b.id,
          quando: b.criadoEm,
          autor: autorDe(b.autorId),
          autorId: b.autorId,
          frase,
          detalhe,
          chips: [
            { rotulo: 'ação', valor: b.acao, copiavel: true },
            { rotulo: 'quando', valor: new Date(b.criadoEm).toLocaleString('pt-BR') },
            ...(mudou.length
              ? [{ rotulo: 'campos', valor: mudou.map((m) => `${m.rotulo}: ${m.de} → ${m.para}`).join(' · ') }]
              : []),
            ...(b.autorId ? [{ rotulo: 'autor', valor: b.autorId, copiavel: true }] : []),
          ],
          blocos: b.blocos,
        };
      });

      /* A linha de criação fecha a trilha, sempre por último — é o evento mais antigo. */
      if (criadoEm) {
        linhas.push({
          id: `criacao-${lancamentoId}`,
          quando: criadoEm,
          autor: autorDe(criadoPor),
          autorId: criadoPor,
          frase: 'criou',
          detalhe: descricao,
          chips: [{ rotulo: 'quando', valor: new Date(criadoEm).toLocaleString('pt-BR') }],
          blocos: [],
        });
      }

      if (!cancelado) setEventos(linhas);
    })();
    return () => { cancelado = true; };
  }, [lancamentoId, criadoPor, criadoEm, descricao, catalogos, user]);

  const lista = eventos ?? [];
  const pessoas = new Set(lista.map((e) => e.autorId).filter(Boolean)).size;
  const resumo = `${lista.length} evento${lista.length === 1 ? '' : 's'}`
    + (pessoas > 1 ? ` · ${pessoas} pessoas` : '');

  return (
    <div className="flex min-h-0 flex-col gap-2">
      {/* A21 — o cabeçalho da aba não rola; só a lista abaixo dele. */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background pb-1">
        <span className="text-[12px] font-semibold text-foreground">Histórico do lançamento</span>
        {eventos && <span className="text-[10px] text-muted-foreground shrink-0">{resumo}</span>}
      </div>
      {eventos === null ? (
        <div className="rounded-md border px-3.5 py-4 text-center text-[10px] text-muted-foreground">Carregando…</div>
      ) : (
        <TrilhaAuditoria eventos={lista} vazio="Sem histórico." />
      )}
    </div>
  );
}

/** O motivo do cancelamento mora no próprio registro novo, não numa coluna de evento. */
function motivoDoCancelamento(depois: unknown): string | null {
  if (!depois || typeof depois !== 'object') return null;
  const m = (depois as Record<string, unknown>).cancelado_motivo;
  return typeof m === 'string' && m ? m : null;
}

/** A data do movimento, quando o payload da conciliação a carrega. */
function dataDoPayload(p: unknown): string | null {
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  for (const k of ['data_movimento', 'extrato_data', 'snapshot_extrato_data']) {
    const v = o[k];
    if (typeof v === 'string' && v.length >= 10) return v;
  }
  return null;
}
