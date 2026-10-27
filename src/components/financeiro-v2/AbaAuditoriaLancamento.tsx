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
 * ⚠ A CRIAÇÃO: desde o AUDIT-SEG-01 (20/10) o gatilho grava o "criou" no `audit_log`, e é ELE que a trilha mostra (P116 — a linha
 * montada do próprio registro duplicava: "06:12 criou" e "06:12 criou PRODUCE… 1/4"). Só o lançamento antigo, sem esse evento,
 * ganha a linha montada do registro (`created_by`/`created_at`).
 * ⚠ P116 — A COLUNA DO AUTOR APARECE SEMPRE (`autorSempre`), e a gravação sem mudança (só campo interno) não aparece nem conta.
 *
 * ⚠ O NOME DO AUTOR TEM UMA FONTE (ACESSOS-PERFIL-01): `fn_nomes_dos_autores(cliente, ids)` — perfil, login ou "usuário
 * removido". O "nome da sessão" saiu. AUTOR NULO NÃO É "sistema" POR CONTA DA TELA: "sistema · <via>" quando o evento diz
 * por onde entrou (a coluna `via` do `audit_log`, AUDIT-SEG-01), senão "autor não registrado". A coluna `via` pode ainda não
 * existir no banco: a leitura tenta com ela e, sem ela, lê de novo sem.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { TrilhaAuditoria, type EventoTrilha } from '@/components/ui/trilha-auditoria';
import { buscarNomesDosAutores } from '@/hooks/useNomesDosAutores';
import { autorNaTrilha, mapaDosNomes, type NomeDoAutor } from '@/lib/acessos/nomesDosAutores';
import {
  fraseDoEvento, camposMudados, camposTecnicosMudados,
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
  dados_anteriores: unknown; dados_novos: unknown; via?: string | null;
}
const COLUNAS_AUDIT = 'id, acao, usuario_id, created_at, dados_anteriores, dados_novos';
/* "coluna nao existe" (Postgres 42703 / PostgREST PGRST204): a `via` ainda nao chegou ao banco. */
const semColuna = (e: unknown) => e != null && typeof e === 'object'
  && ['42703', 'PGRST204'].includes(String(Reflect.get(e, 'code') ?? ''));
interface LinhaConcil {
  id: string; acao: string; actor_user_id: string | null; created_at: string;
  extrato_id: string | null; motivo: string | null;
  payload_antes: unknown; payload_depois: unknown; via?: string | null;
}
const COLUNAS_CONCIL = 'id, acao, actor_user_id, created_at, extrato_id, motivo, payload_antes, payload_depois';

export function AbaAuditoriaLancamento({ lancamentoId, criadoPor, criadoEm, descricao, catalogos }: Props) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? null;
  const [eventos, setEventos] = useState<EventoTrilha[] | null>(null);

  useEffect(() => {
    if (!lancamentoId) { setEventos([]); return; }
    let cancelado = false;
    setEventos(null);
    (async () => {
      const lerAudit = (colunas: string) => supabase.from('audit_log')
        .select(colunas)
        .eq('tabela_origem', 'financeiro_lancamentos_v2')
        .eq('registro_id', lancamentoId)
        .order('created_at', { ascending: false });
      /* P116 — a `via` da conciliação (20261028112390); sem ela no banco, lê de novo sem, como a do `audit_log` */
      const lerConcil = (colunas: string) => supabase.from('conciliacao_audit_log')
        .select(colunas)
        .eq('lancamento_id', lancamentoId)
        .order('created_at', { ascending: false });
      const [resAuditComVia, resConcilComVia] = await Promise.all([
        lerAudit(`${COLUNAS_AUDIT}, via`),
        lerConcil(`${COLUNAS_CONCIL}, via`),
      ]);

      const resAudit = semColuna(resAuditComVia.error) ? await lerAudit(COLUNAS_AUDIT) : resAuditComVia;
      const resConcil = semColuna(resConcilComVia.error) ? await lerConcil(COLUNAS_CONCIL) : resConcilComVia;

      const brutos: (EventoAuditoriaBruto & { via?: string | null; blocos: { rotulo: string; valor: unknown }[] })[] = [];

      const linhasAudit: unknown[] = Array.isArray(resAudit.data) ? resAudit.data : [];
      for (const r of linhasAudit.map(lerLinhaAudit).filter((x): x is LinhaAudit => x !== null)) {
        brutos.push({
          id: r.id, acao: r.acao, criadoEm: r.created_at, autorId: r.usuario_id, via: r.via ?? null,
          antes: r.dados_anteriores, depois: r.dados_novos,
          motivo: motivoDoCancelamento(r.dados_novos),
          blocos: [{ rotulo: 'antes', valor: r.dados_anteriores }, { rotulo: 'depois', valor: r.dados_novos }],
        });
      }
      const linhasConcil: unknown[] = Array.isArray(resConcil.data) ? resConcil.data : [];
      for (const r of linhasConcil.map(lerLinhaConcil).filter((x): x is LinhaConcil => x !== null)) {
        brutos.push({
          id: r.id, acao: r.acao, criadoEm: r.created_at, autorId: r.actor_user_id, via: r.via ?? null,
          antes: r.payload_antes, depois: r.payload_depois, motivo: r.motivo,
          dataExtrato: dataDoPayload(r.payload_depois) ?? dataDoPayload(r.payload_antes),
          blocos: [{ rotulo: 'antes', valor: r.payload_antes }, { rotulo: 'depois', valor: r.payload_depois }],
        });
      }

      /* Uma trilha só, do mais recente para o mais antigo. */
      brutos.sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : a.criadoEm > b.criadoEm ? -1 : 0));

      /* Os nomes: a fonte única, com a guarda do cliente (quem não aparece na trilha deste cliente não volta). */
      const ids = [...new Set([criadoPor, ...brutos.map((b) => b.autorId)].filter((x): x is string => !!x))];
      let lidos: NomeDoAutor[] = [];
      if (ids.length && clienteId) {
        try { lidos = await buscarNomesDosAutores(clienteId, ids); } catch { lidos = []; }
      }
      const nomes = mapaDosNomes(lidos);
      const autorDe = (id: string | null, via?: string | null) => autorNaTrilha(id, nomes, via);

      const linhas: EventoTrilha[] = brutos.flatMap((b) => {
        const { frase, detalhe, oculto } = fraseDoEvento(b, catalogos);
        if (oculto) return [];
        const mudou = [...camposMudados(b.antes, b.depois, catalogos), ...camposTecnicosMudados(b.antes, b.depois)];
        return [{
          id: b.id,
          quando: b.criadoEm,
          autor: autorDe(b.autorId, b.via),
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
        }];
      });

      /* A linha de criação montada do registro: só no lançamento antigo, sem o "criou" do gatilho. Fecha a trilha, por último. */
      if (criadoEm && !brutos.some((b) => b.acao === 'criou')) {
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
  }, [lancamentoId, criadoPor, criadoEm, descricao, catalogos, clienteId]);

  const lista = eventos ?? [];
  const pessoas = new Set(lista.map((e) => e.autorId).filter(Boolean)).size;
  const resumo = `${lista.length} evento${lista.length === 1 ? '' : 's'}`
    + (pessoas > 1 ? ` · ${pessoas} pessoas` : '');

  return (
    <div className="flex min-h-0 flex-col gap-2">
      {/* A21 — o cabeçalho da aba não rola; só a lista abaixo dele. P116: `-top-1.5` cobre os 6px do `pt-1.5` do corpo (como o `-top-2` da
          aba Documentos) — com a trilha mais longa a lista rolava e as linhas passavam visíveis nessa faixa acima do cabeçalho. */}
      <div className="sticky -top-1.5 z-10 flex items-center justify-between gap-2 border-b bg-background pb-1">
        <span className="text-[11px] font-semibold text-foreground">Histórico do lançamento</span>
        {eventos && <span className="text-[10px] text-muted-foreground shrink-0">{resumo}</span>}
      </div>
      {eventos === null ? (
        <div className="rounded-md border px-3.5 py-4 text-center text-[10px] text-muted-foreground">Carregando…</div>
      ) : (
        <TrilhaAuditoria eventos={lista} vazio="Sem histórico." autorSempre />
      )}
    </div>
  );
}

/** A linha do `audit_log` lida sem cast (a leitura tem a `via` ou não, conforme o banco). */
function lerLinhaAudit(r: unknown): LinhaAudit | null {
  if (r == null || typeof r !== 'object') return null;
  const txt = (k: string): string | null => { const v: unknown = Reflect.get(r, k); return typeof v === 'string' ? v : null; };
  const id = txt('id'); const acao = txt('acao'); const criado = txt('created_at');
  if (!id || !acao || !criado) return null;
  return { id, acao, usuario_id: txt('usuario_id'), created_at: criado,
    dados_anteriores: Reflect.get(r, 'dados_anteriores'), dados_novos: Reflect.get(r, 'dados_novos'), via: txt('via') };
}

/** A linha da trilha da conciliação lida sem cast (com ou sem a `via`, conforme o banco). */
function lerLinhaConcil(r: unknown): LinhaConcil | null {
  if (r == null || typeof r !== 'object') return null;
  const txt = (k: string): string | null => { const v: unknown = Reflect.get(r, k); return typeof v === 'string' ? v : null; };
  const id = txt('id'); const acao = txt('acao'); const criado = txt('created_at');
  if (!id || !acao || !criado) return null;
  return { id, acao, actor_user_id: txt('actor_user_id'), created_at: criado, extrato_id: txt('extrato_id'), motivo: txt('motivo'),
    payload_antes: Reflect.get(r, 'payload_antes'), payload_depois: Reflect.get(r, 'payload_depois'), via: txt('via') };
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
