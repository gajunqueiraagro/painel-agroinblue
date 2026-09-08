/**
 * O passo 3 do Enriquecer — gravar em lote, com progresso — [ENRIQUECER-GRAVAR-01] (133c).
 *
 * ⚠ UMA LINHA POR VEZ, E A REGRA MORA NO BANCO. `fn_classificacao_apply_row` é a mesma RPC
 * que a Mesa ampliada chama no Salvar: o lote não é um segundo gravador, é o mesmo gesto
 * repetido. Um writer próprio aqui divergiria dela na primeira regra nova — e a regra dela
 * inclui o conservador (não sobrescrever o que já está classificado), o guard de permissão
 * e a gravação do `estado_anterior` que torna o desfazer possível.
 *
 * ⚠ `fn_classificacao_apply(sessao)` NÃO É USADA, e o envelope diz por quê: sem limite, ela
 * estoura o `statement_timeout` de 8s numa sessão grande — o mesmo teto que já derrubou o
 * populate de 492 linhas (ver a nota em `useClassificacaoStaging`).
 *
 * ⚠ O PROGRESSO VIVE NO HOOK, não no diálogo — o idioma do 131. Gravar 337 linhas leva
 * ~30s; se o estado morasse no modal, fechá-lo perderia a contagem e o operador não teria
 * como voltar a ver onde está. Fechar não interrompe: quem interrompe é o "Parar".
 *
 * ⚠ NENHUM TOAST POR LINHA. Os 492 toasts empilhados foram o defeito que o 131 matou.
 */
import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';
import { useQueryClient } from '@tanstack/react-query';
import {
  PROGRESSO_ZERO,
  type ProgressoImportacao,
  type EventoProgresso,
  type ResultadoImportacao,
} from '@/v2/hooks/useImportLancamentosExcel';

/** O que o lote precisa saber de cada linha — já resolvido pela tela, não relido aqui. */
export interface LinhaParaGravar {
  stagingId: string;
  /** Número da linha na PLANILHA — é como o operador chama a linha. */
  linha: number;
  data: string;
  valor: number;
  titulo: string;
  /** Os campos que vão mudar, para o feed dizer o que aconteceu em vez de "ok". */
  camposQueMudam: string[];
  /**
   * `true` só quando o operador marcou "sobrescrever" NESTA linha.
   *
   * ⚠ DEFAULT `false`, E É O QUE PROTEGE O QUE JÁ ESTÁ CLASSIFICADO. Com `p_overwrite`
   * ligado por padrão, uma sessão antiga reaplicada passaria por cima de classificação que
   * alguém fez à mão depois — e a RPC devolve `pulado_subcentro_preenchido` justamente
   * para que isso seja uma decisão, não um efeito.
   */
  sobrescrever: boolean;
  /**
   * A conta do plano a gravar no `update_proposto` ANTES do apply — 133h-b item 8.
   *
   * ⚠ O LOTE ERA O BURACO DO ITEM 13. A tela alinhava o proposto ao Resultado no Salvar de
   * UMA linha; o lote chamava `apply_row` direto, e é ele que grava centenas — inclusive as
   * 16.236 linhas do Raul cujo Resultado é "mantém" e cujo proposto guarda um texto que não
   * existe no plano oficial. `null` = nada a alinhar, e aí nem se chama a RPC.
   */
  alinharSubcentro?: string | null;
}

/** As mensagens da RPC em português de operador. O identificador segue sendo o do banco. */
const MOTIVO: Record<string, string> = {
  pulado_subcentro_preenchido: 'já classificado no sistema — marque "sobrescrever" na linha para trocar',
  sem_lancamento_vinculado: 'sem lançamento vinculado',
  lancamento_inexistente_ou_cancelado: 'lançamento não encontrado ou cancelado',
  sem_permissao: 'sem permissão para este cliente',
  staging_nao_encontrada: 'linha não encontrada na sessão',
  nada_a_reverter: 'nada a reverter nesta linha',
};

const msgErro = (e: unknown): string => {
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
};

export function useGravarLoteEnriquecimento(sessaoId: string | null, clienteId: string | null | undefined) {
  const qc = useQueryClient();
  const [progresso, setProgresso] = useState<ProgressoImportacao>(PROGRESSO_ZERO);
  const [gravando, setGravando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  /* Ref e não estado: o laço fecha sobre o valor do render em que começou, e um `useState`
     só chegaria nele no render seguinte — ou seja, nunca. Mesmo motivo do 131. */
  const pararRef = useRef(false);
  /**
   * As linhas que ESTE lote aplicou — o universo do "Desfazer o lote".
   *
   * ⚠ SÓ ATÉ SAIR DA TELA, e é honesto que seja assim: desfazer é o arrependimento de
   * quem acabou de gravar. Persistir a lista faria a tela prometer um desfazer que
   * atravessa sessões, e aí o certo é o histórico do lançamento, não um botão.
   */
  const aplicadasRef = useRef<LinhaParaGravar[]>([]);
  const [podeDesfazer, setPodeDesfazer] = useState(false);

  const empurrar = useCallback((evento: EventoProgresso, conta: Partial<ProgressoImportacao>) => {
    setProgresso((p) => ({
      ...p,
      ...conta,
      feitas: p.feitas + 1,
      atualizados: p.atualizados + (conta.atualizados ?? 0),
      semPar: p.semPar + (conta.semPar ?? 0),
      recusados: p.recusados + (conta.recusados ?? 0),
      agora: `${evento.titulo}`,
      feed: [...p.feed, evento],
    }));
  }, []);

  const parar = useCallback(() => { pararRef.current = true; }, []);

  /**
   * Roda o lote. Devolve o resultado — e NÃO lança: uma linha que falha não derruba as
   * outras, porque parar no meio deixaria o operador sem saber quais entraram.
   */
  const gravar = useCallback(async (linhas: readonly LinhaParaGravar[]): Promise<ResultadoImportacao> => {
    pararRef.current = false;
    aplicadasRef.current = [];
    setPodeDesfazer(false);
    setResultado(null);
    setGravando(true);
    setProgresso({ ...PROGRESSO_ZERO, total: linhas.length, iniciadoEm: Date.now() });

    let aplicados = 0; let pulados = 0; let recusados = 0;
    const erros: string[] = [];

    for (const l of linhas) {
      if (pararRef.current) {
        setProgresso((p) => ({ ...p, interrompido: true }));
        break;
      }
      const base = { linha: l.linha, data: l.data, valor: l.valor, titulo: l.titulo };
      try {
        /* ⚠ ALINHA ANTES DE APLICAR, e na MESMA ordem do Salvar de uma linha: o
           `apply_row` lê `update_proposto`, então editá-lo depois não teria efeito. */
        if (l.alinharSubcentro) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
          const { error: erroEdit } = await (supabase as any).rpc('fn_classificacao_editar_proposto', {
            p_staging_id: l.stagingId,
            p_patch: { subcentro: l.alinharSubcentro },
          });
          if (erroEdit) throw erroEdit;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
        const { data, error } = await (supabase as any).rpc('fn_classificacao_apply_row', {
          p_staging_id: l.stagingId,
          p_overwrite: l.sobrescrever,
        });
        if (error) throw error;
        const r = (data ?? {}) as { aplicado?: boolean; motivo?: string };
        if (r.aplicado) {
          aplicados++;
          aplicadasRef.current.push(l);
          empurrar({
            ...base, tipo: 'ok',
            contexto: l.camposQueMudam.length
              ? `atualizou ${l.camposQueMudam.join(' · ')}`
              : 'atualizou o lançamento',
          }, { atualizados: 1 });
        } else {
          pulados++;
          const motivo = MOTIVO[r.motivo ?? ''] ?? r.motivo ?? 'não aplicado';
          empurrar({ ...base, tipo: 'sem_par', contexto: `pulado: ${motivo}` }, { semPar: 1 });
        }
      } catch (e: unknown) {
        recusados++;
        const m = msgErro(e);
        erros.push(`Linha ${l.linha}: ${m}`);
        empurrar({ ...base, tipo: 'recusado', contexto: `recusado: ${m}` }, { recusados: 1 });
      }
    }

    setProgresso((p) => ({ ...p, agora: null, terminadoEm: Date.now() }));
    setGravando(false);
    setPodeDesfazer(aplicadasRef.current.length > 0);

    /* ⚠ UMA NOTIFICAÇÃO NO FIM, não uma por linha: cada `notificarLancamentosMudaram`
       redispara a releitura do mês na aba de Conciliação, e 337 releituras seguidas seriam
       337 idas ao banco para mostrar o mesmo número no fim. */
    if (aplicados > 0) {
      if (clienteId) notificarLancamentosMudaram(clienteId);
      qc.invalidateQueries({ queryKey: ['classificacao-staging', sessaoId] });
      qc.invalidateQueries({ queryKey: ['classificacao-sessoes', clienteId] });
    }

    const r: ResultadoImportacao = {
      criados: 0,
      atualizados: aplicados,
      falhas: recusados,
      ignorados: pulados,
      apelidos: { subcentro: 0, fornecedor: 0, conta: 0, fazenda: 0, safra: 0, erros: [], idsSubcentroPorTexto: {} },
      erros,
    };
    setResultado(r);
    return r;
  }, [clienteId, qc, sessaoId, empurrar]);

  /**
   * Desfazer o lote — `fn_classificacao_reverter_row` linha a linha, no mesmo modal.
   *
   * ⚠ NA ORDEM INVERSA DA GRAVAÇÃO. Não é preciosismo: uma linha que substituiu outra deve
   * ser desfeita antes daquela que veio antes dela, e a ordem inversa é a única que devolve
   * o estado exatamente como estava.
   */
  const desfazerLote = useCallback(async (): Promise<ResultadoImportacao> => {
    const alvo = [...aplicadasRef.current].reverse();
    pararRef.current = false;
    setResultado(null);
    setGravando(true);
    setProgresso({ ...PROGRESSO_ZERO, total: alvo.length, iniciadoEm: Date.now() });

    let ok = 0; let falhou = 0;
    const erros: string[] = [];
    for (const l of alvo) {
      if (pararRef.current) { setProgresso((p) => ({ ...p, interrompido: true })); break; }
      const base = { linha: l.linha, data: l.data, valor: l.valor, titulo: l.titulo };
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
        const { data, error } = await (supabase as any).rpc('fn_classificacao_reverter_row', {
          p_staging_id: l.stagingId,
        });
        if (error) throw error;
        const r = (data ?? {}) as { ok?: boolean; motivo?: string };
        if (r.ok) { ok++; empurrar({ ...base, tipo: 'ok', contexto: 'devolvido ao estado anterior' }, { atualizados: 1 }); }
        else {
          falhou++;
          const motivo = MOTIVO[r.motivo ?? ''] ?? r.motivo ?? 'não revertido';
          empurrar({ ...base, tipo: 'recusado', contexto: `não revertido: ${motivo}` }, { recusados: 1 });
        }
      } catch (e: unknown) {
        falhou++;
        const m = msgErro(e);
        erros.push(`Linha ${l.linha}: ${m}`);
        empurrar({ ...base, tipo: 'recusado', contexto: `não revertido: ${m}` }, { recusados: 1 });
      }
    }

    setProgresso((p) => ({ ...p, agora: null, terminadoEm: Date.now() }));
    setGravando(false);
    /* Desfeito é fim de linha: oferecer "desfazer o desfazer" seria um botão que refaz o
       lote sem o operador ter pedido o lote de novo. */
    aplicadasRef.current = [];
    setPodeDesfazer(false);
    if (ok > 0) {
      if (clienteId) notificarLancamentosMudaram(clienteId);
      qc.invalidateQueries({ queryKey: ['classificacao-staging', sessaoId] });
    }
    const r: ResultadoImportacao = {
      criados: 0, atualizados: ok, falhas: falhou, ignorados: 0,
      apelidos: { subcentro: 0, fornecedor: 0, conta: 0, fazenda: 0, safra: 0, erros: [], idsSubcentroPorTexto: {} },
      erros,
    };
    setResultado(r);
    return r;
  }, [clienteId, qc, sessaoId, empurrar]);

  return { progresso, gravando, resultado, gravar, parar, desfazerLote, podeDesfazer };
}
