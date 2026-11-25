/**
 * FOLHA-RESUMO-CONTADOR-01 — o GESTO do resumo do contador ("Extrato Mensal") aberto na Caixa: md5 do documento + a fazenda de cada CAEPF
 * → PRÉVIA (`fn_folha_resumo_fgts_aplicar` simular) → "Prever FGTS" (grava as previsões, uma por fazenda) → Desfazer (o mesmo
 * `fn_folha_recibos_desfazer` do recibo: a trilha é `folha-recibo:<md5>`).
 *
 * ⚠ NADA GRAVA SEM O GESTO. ⚠ Leitura/gravação que termina depois de a tela sair não escreve (`vivo`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ResumoLido } from '@/lib/folha/lerResumoDoContador';
import { linhasDoResumo, motivoDoPrever, pedidoDoResumo, type LinhaDoResumo, type RespostaDoResumo } from '@/lib/folha/resumoNaCaixa';
import { folhaCaixaApiDoBanco, resumoCaixaApiDoBanco, type Desfeito, type FolhaCaixaApi, type ResumoCaixaApi } from '@/lib/folha/folhaCaixaApi';
import { md5 } from '@/lib/arquivo/md5';

export type FaseDoResumo = 'preparando' | 'previa' | 'aplicando' | 'aplicado' | 'desfazendo' | 'erro';
export interface EntradaDoResumo { clienteId: string; bytes: ArrayBuffer; nomeDoArquivo: string; resumo: ResumoLido }

const SEM_RESPOSTA = 'Sem resposta do banco (a conexão caiu?). Nada foi gravado — tente de novo.';

export function useResumoDaCaixa(e: EntradaDoResumo, opcoes: { api?: ResumoCaixaApi; folha?: Pick<FolhaCaixaApi, 'desfazer'> } = {}) {
  const api = opcoes.api ?? resumoCaixaApiDoBanco;
  const folhaApi = opcoes.folha ?? folhaCaixaApiDoBanco;
  const { clienteId, bytes, nomeDoArquivo, resumo } = e;
  const [fase, setFase] = useState<FaseDoResumo>('preparando');
  const [frase, setFrase] = useState<string | null>(null);
  const [resposta, setResposta] = useState<RespostaDoResumo | null>(null);
  const [desfeito, setDesfeito] = useState<Desfeito | null>(null);
  const pedido = useRef<ReturnType<typeof pedidoDoResumo> | null>(null);
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  const chamar = useCallback(async (simular: boolean) => {
    const p = pedido.current;
    if (!p) return null;
    try { return await api.prever(clienteId, p.documento, p.itens, simular); } catch (err) {
      console.error('[resumo do contador] prever', err);
      return { ok: false as const, erro: SEM_RESPOSTA };
    }
  }, [api, clienteId]);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      const id = md5(bytes);
      let caepf: Awaited<ReturnType<ResumoCaixaApi['fazendasPorCaepf']>>;
      try { caepf = await api.fazendasPorCaepf(clienteId); } catch (err) { console.error('[resumo do contador] caepf', err); caepf = { ok: false, erro: SEM_RESPOSTA }; }
      if (cancelado || !vivo.current) return;
      /* sem a lista do CAEPF segue sem ela: o banco tenta pelo nome da empresa e devolve a pendência */
      pedido.current = pedidoDoResumo(resumo, nomeDoArquivo, id, caepf.ok === true ? caepf.dados : new Map());
      const r = await chamar(true);
      if (cancelado || !vivo.current || !r) return;
      if (r.ok === false) { setFrase(r.erro); setFase('erro'); return; }
      setResposta(r.dados); setFase('previa');
    })();
    return () => { cancelado = true; };
  }, [api, bytes, chamar, clienteId, nomeDoArquivo, resumo]);

  const linhas: LinhaDoResumo[] = useMemo(() => linhasDoResumo(resumo, resposta), [resumo, resposta]);
  const motivo = motivoDoPrever(linhas, resposta);

  const aprovar = useCallback(async (): Promise<boolean> => {
    if (fase !== 'previa' || motivo) return false;
    setFase('aplicando'); setFrase(null);
    const r = await chamar(false);
    if (!vivo.current || !r) return false;
    if (r.ok === false) { setFrase(r.erro); setFase('previa'); return false; }
    setResposta(r.dados); setFase('aplicado');
    return true;
  }, [chamar, fase, motivo]);

  const preverDesfazer = useCallback(async (motivoDoDesfazer: string) => {
    const p = pedido.current;
    if (!p) return;
    const r = await folhaApi.desfazer(clienteId, p.documento.md5, motivoDoDesfazer, true);
    if (!vivo.current) return;
    if (r.ok === false) { setFrase(r.erro); return; }
    setDesfeito(r.dados); setFrase(null);
  }, [clienteId, folhaApi]);

  const desfazer = useCallback(async (motivoDoDesfazer: string): Promise<boolean> => {
    const p = pedido.current;
    if (!p) return false;
    setFase('desfazendo');
    const r = await folhaApi.desfazer(clienteId, p.documento.md5, motivoDoDesfazer, false);
    if (!vivo.current) return false;
    if (r.ok === false) { setFrase(r.erro); setFase('previa'); return false; }
    setDesfeito(null);
    const de = await chamar(true);
    if (!vivo.current) return false;
    if (de && de.ok === true) setResposta(de.dados);
    setFrase(`Desfeito: ${r.dados.criados} ${r.dados.criados === 1 ? 'previsão cancelada' : 'previsões canceladas'} (nada se apaga).`);
    setFase('previa');
    return true;
  }, [chamar, clienteId, folhaApi]);

  return { fase, frase, resposta, linhas, motivo, desfeito, aprovar, preverDesfazer, desfazer };
}
