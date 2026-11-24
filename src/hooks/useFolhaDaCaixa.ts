/**
 * FOLHA-NA-CAIXA-01 — o GESTO do recibo do contador aberto na Caixa: prepara (md5 do documento + 1 PDF por funcionário pelo
 * `dividirPdf`) → PRÉVIA (`fn_folha_recibos_aplicar` simular) → Aprovar (aplicar → sobe a página de cada um no caminho devolvido) →
 * Desfazer (prévia com motivo → desfaz). Contrato do Code 6 (§A2).
 *
 * ⚠ NADA GRAVA SEM O APROVAR. A prévia é a própria RPC com `p_simular` (refeita a cada "Criar" marcado).
 * ⚠ SUBIR SÓ DEPOIS DO APLICAR: o bucket só aceita o caminho registrado. Falhou um upload = a linha diz e "Tentar de novo" sobe no MESMO
 *   caminho; o aplicar nunca se repete (o registro já existe).
 * ⚠ Leitura/gravação que termina depois de a tela sair não escreve (`vivo`, OC-ABRIR-LENTO-01).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FolhaLida } from '@/lib/folha/lerFolha';
import { linhasDaPrevia, motivoParaNaoAprovar, pedidoDaFolha, type LinhaDaPrevia, type RespostaDaFolha } from '@/lib/folha/folhaNaCaixa';
import { folhaCaixaApiDoBanco, type Desfeito, type FolhaCaixaApi } from '@/lib/folha/folhaCaixaApi';
import { dividirPdf as dividirDeVerdade, type Divisao } from '@/lib/pdf/dividirPdf';
import { md5 } from '@/lib/arquivo/md5';

export type FaseDaFolha = 'preparando' | 'previa' | 'aplicando' | 'aplicado' | 'desfazendo' | 'erro';
export type Subida = 'subindo' | 'ok' | 'falhou';
export interface EntradaDaFolha {
  clienteId: string;
  /** a linha do e-mail (o arrastado: null) */
  entradaId: string | null;
  bytes: ArrayBuffer; nomeDoArquivo: string; folha: FolhaLida;
}

export function useFolhaDaCaixa(e: EntradaDaFolha, opcoes: { api?: FolhaCaixaApi; dividir?: (b: Uint8Array, g: number[][]) => Promise<Divisao> } = {}) {
  const api = opcoes.api ?? folhaCaixaApiDoBanco;
  const dividir = opcoes.dividir ?? dividirDeVerdade;
  const { clienteId, entradaId, bytes, nomeDoArquivo, folha } = e;
  const [fase, setFase] = useState<FaseDaFolha>('preparando');
  const [frase, setFrase] = useState<string | null>(null);
  const [resposta, setResposta] = useState<RespostaDaFolha | null>(null);
  const [criar, setCriar] = useState<ReadonlySet<number>>(new Set());
  const [subidas, setSubidas] = useState<Record<string, Subida>>({});
  const [desfeito, setDesfeito] = useState<Desfeito | null>(null);
  const preparo = useRef<{ md5: string; pedacos: Uint8Array[]; chaves: { tamanho: number; md5: string }[] } | null>(null);
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  const pedido = useCallback((marcados: ReadonlySet<number>) => {
    const p = preparo.current;
    if (!p) return null;
    return pedidoDaFolha(folha, nomeDoArquivo, p.md5, p.chaves, marcados);
  }, [folha, nomeDoArquivo]);

  const previa = useCallback(async (marcados: ReadonlySet<number>) => {
    const p = pedido(marcados);
    if (!p) return;
    let r: Awaited<ReturnType<FolhaCaixaApi['aplicar']>>;
    try { r = await api.aplicar(clienteId, entradaId, p.documento, p.itens, true); } catch (e) {
      /* sem resposta (rede, a API fora do ar): a frase diz, nunca fica "preparando" calado */
      console.error('[folha na caixa] prévia', e);
      r = { ok: false, erro: 'Sem resposta do banco (a conexão caiu?). Nada foi gravado — tente de novo.' };
    }
    if (!vivo.current) return;
    if (r.ok === false) { setFrase(r.erro); setResposta(null); setFase('erro'); return; }
    setResposta(r.dados); setFrase(null); setFase('previa');
  }, [api, clienteId, entradaId, pedido]);

  /* preparar: o md5 do documento inteiro e um PDF por funcionário (as páginas de cada um), uma vez */
  useEffect(() => {
    let cancelado = false;
    void (async () => {
      /* Uint8Array: o pdf-lib confere o tipo do que recebe (o ArrayBuffer de outro contexto ele recusa) */
      const d = await dividir(new Uint8Array(bytes.slice(0)), folha.pessoas.map((p) => p.paginas));
      if (cancelado || !vivo.current) return;
      if (d.ok === false) { setFrase(d.frase); setFase('erro'); return; }
      preparo.current = { md5: md5(bytes), pedacos: d.arquivos, chaves: d.arquivos.map((x) => ({ tamanho: x.byteLength, md5: md5(x) })) };
      await previa(new Set());
    })();
    return () => { cancelado = true; };
  }, [bytes, dividir, folha, previa]);

  const linhas: LinhaDaPrevia[] = useMemo(() => (resposta ? linhasDaPrevia(folha, resposta, criar) : []), [folha, resposta, criar]);
  const motivo = useMemo(() => (fase === 'previa' ? motivoParaNaoAprovar(folha, resposta, linhas) : null), [fase, folha, resposta, linhas]);

  const alternarCriar = useCallback((k: number) => {
    if (fase !== 'previa') return;
    const novo = new Set(criar);
    if (novo.has(k)) novo.delete(k); else novo.add(k);
    setCriar(novo);
    void previa(novo);
  }, [criar, fase, previa]);

  const subir = useCallback(async (path: string, k: number) => {
    const pedaco = preparo.current?.pedacos[k];
    if (!pedaco) { setSubidas((x) => ({ ...x, [path]: 'falhou' })); return; }
    setSubidas((x) => ({ ...x, [path]: 'subindo' }));
    const r = await api.subir(path, pedaco);
    if (vivo.current) setSubidas((x) => ({ ...x, [path]: r.ok ? 'ok' : 'falhou' }));
  }, [api]);

  /** O índice da pessoa de um documento gravado (pelas páginas, únicas no documento). */
  const pessoaDoDocumento = useCallback((paginas: readonly number[]) =>
    folha.pessoas.findIndex((p) => p.paginas.length === paginas.length && p.paginas.every((x, i) => x === paginas[i])), [folha]);

  /** Aprovar: grava (o banco confere tudo de novo) e sobe a página de cada um. Devolve true se gravou. */
  const aprovar = useCallback(async (): Promise<boolean> => {
    if (fase !== 'previa' || motivo) return false;
    const p = pedido(criar);
    if (!p) return false;
    setFase('aplicando'); setFrase(null);
    const r = await api.aplicar(clienteId, entradaId, p.documento, p.itens, false);
    if (!vivo.current) return false;
    if (r.ok === false) { setFrase(r.erro); setFase('previa'); return false; }
    setResposta(r.dados);
    setFase('aplicado');
    await Promise.all(r.dados.documentos.map((d) => subir(d.storagePath, pessoaDoDocumento(d.paginas))));
    return true;
  }, [api, clienteId, criar, entradaId, fase, motivo, pedido, pessoaDoDocumento, subir]);

  const tentarDeNovo = useCallback((path: string) => {
    const d = resposta?.documentos.find((x) => x.storagePath === path);
    if (d) void subir(path, pessoaDoDocumento(d.paginas));
  }, [resposta, subir, pessoaDoDocumento]);

  /** Desfazer: 1º a prévia (o que volta), depois de verdade. O motivo é obrigatório (o banco também recusa sem). */
  const preverDesfazer = useCallback(async (motivoDoDesfazer: string) => {
    const m = preparo.current?.md5;
    if (!m || !motivoDoDesfazer.trim()) return;
    const r = await api.desfazer(clienteId, m, motivoDoDesfazer.trim(), true);
    if (!vivo.current) return;
    if (r.ok === false) { setFrase(r.erro); return; }
    setDesfeito(r.dados); setFrase(null);
  }, [api, clienteId]);
  const desfazer = useCallback(async (motivoDoDesfazer: string): Promise<boolean> => {
    const m = preparo.current?.md5;
    if (!m || !motivoDoDesfazer.trim()) return false;
    setFase('desfazendo');
    const r = await api.desfazer(clienteId, m, motivoDoDesfazer.trim(), false);
    if (!vivo.current) return false;
    if (r.ok === false) { setFrase(r.erro); setFase(resposta?.jaAplicado ? 'previa' : 'aplicado'); return false; }
    setDesfeito(null); setSubidas({}); setCriar(new Set());
    await previa(new Set());
    if (vivo.current) setFrase('Desfeito: os valores voltaram e os criados foram cancelados (nada apagado).');
    return true;
  }, [api, clienteId, previa, resposta]);

  return { fase, frase, resposta, linhas, criar, motivo, subidas, desfeito, alternarCriar, aprovar, tentarDeNovo, preverDesfazer, desfazer };
}
