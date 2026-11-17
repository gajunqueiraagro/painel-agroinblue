/**
 * BOLETO-DDA-API-01 · D1c (a) — o estado da CAIXA DE BOLETOS: a lista gravada (`fn_boletos_lista`) e os arquivos que CHEGAM nesta
 * sessão (lidos no navegador pelo leitor da D1b → prévia pela `fn_boleto_entrar` com `p_simular` → "Pôr na caixa" grava os marcados
 * e sobe o PDF).
 *
 * ⚠ NADA GRAVA SEM O GESTO: soltar o arquivo só lê e pede a PRÉVIA; o "Pôr na caixa" é o único que grava.
 * ⚠ SENHA: fica só na memória do gesto (a leitura de novo); nunca no estado, nunca no banco. As sugestões são os 5 primeiros dígitos
 *   dos titulares ativos do cliente (escolha do Gabriel 14/11).
 * ⚠ REPETIDO NA MESMA LEVA (dois PDFs do mesmo título): o 2º vem desmarcado com "repetido nesta leva" — o banco também barraria
 *   (abriria o primeiro), mas a tela não pede duas gravações do mesmo título.
 * ⚠ LEITURA QUE TERMINA DEPOIS DE A TELA SAIR não escreve (OC-ABRIR-LENTO-01): `vivo` guarda.
 * ⚠ BOLETO D3c — O QUE CHEGOU POR E-MAIL entra pelo MESMO caminho: "ler" baixa o PDF da área de espera e o põe em "Chegando" (origem
 *   'email', `origem_ref` = o Message-ID). Gravou na caixa → a linha do e-mail vira 'boleto' (`fn_entrada_marcar_lido`, o id do
 *   banco); sem linha digitável → 'não reconhecido'. Falhou a marcação = o boleto fica na caixa e a frase diz; nunca some calado.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { caixaApiDoBanco, type CaixaApi, type ListaDaCaixa, type RespostaDeEntrar } from '@/lib/financeiro/boleto/caixaApi';
import { lerBoletoDoArquivo, paraEntrada, sugestoesDeSenha, type LeituraDoArquivo } from '@/lib/financeiro/boleto/lerBoleto';
import type { VereditoDoArquivo } from '@/lib/arquivo/aceitarArquivo';
import { entradaEmailApiDoBanco, type EntradaDoEmail, type EntradaEmailApi } from '@/lib/financeiro/boleto/entradaEmailApi';

export type EstadoDoArquivo =
  | 'lendo' | 'recusado' | 'senha' | 'senha_errada' | 'sem_texto' | 'ilegivel' | 'sem_linha' | 'previa' | 'gravando' | 'entrou' | 'erro';

export interface ArquivoChegando {
  chave: string;
  arquivo: File;
  estado: EstadoDoArquivo;
  /** A frase do estado (recusa do arquivo, senha, sem texto, erro do banco). */
  frase: string | null;
  resposta: RespostaDeEntrar | null;
  marcado: boolean;
  repetidoNaLeva: boolean;
  /** Depois de gravar: o PDF subiu? (false = o boleto está na caixa sem o arquivo) */
  arquivoSubiu: boolean | null;
  /** A leitura mandada ao banco (a mesma da prévia; o "Pôr na caixa" a reenvia sem simular). */
  leituraParaOBanco: Record<string, unknown> | null;
  /** Veio da área de espera do e-mail (D3c): a linha a marcar depois de gravar. */
  entrada: { id: string; mensagemId: string } | null;
}

export const FRASE_SEM_LINHA = 'Não achei a linha digitável neste PDF (ou o dígito verificador não confere). Nada foi lido.';
export const FRASE_ARQUIVO_NAO_SUBIU = 'O boleto entrou na caixa, mas o arquivo não subiu.';
export const FRASE_EMAIL_NAO_MARCADO = 'O boleto entrou na caixa, mas a linha do e-mail não foi marcada como lida (ela segue em "Por e-mail").';

export type LerArquivoDeBoleto = (bytes: ArrayBuffer, senha?: string) => Promise<LeituraDoArquivo>;
const lerDoPdf: LerArquivoDeBoleto = (bytes, senha) => lerBoletoDoArquivo(bytes, { senha });

let sequencia = 0;

export function useCaixaDeBoletos(clienteId: string | null, opcoes: { api?: CaixaApi; ler?: LerArquivoDeBoleto; entrada?: EntradaEmailApi } = {}) {
  const api = opcoes.api ?? caixaApiDoBanco;
  const entradaApi = opcoes.entrada ?? entradaEmailApiDoBanco;
  const ler = opcoes.ler ?? lerDoPdf;
  const [lista, setLista] = useState<ListaDaCaixa | null>(null);
  const [erroDaLista, setErroDaLista] = useState<string | null>(null);
  const [chegando, setChegando] = useState<ArquivoChegando[]>([]);
  const [sugestoes, setSugestoes] = useState<string[]>([]);
  const [gravando, setGravando] = useState(false);
  const [pendentes, setPendentes] = useState<EntradaDoEmail[] | null>(null);
  const [erroDosPendentes, setErroDosPendentes] = useState<string | null>(null);
  const vivo = useRef(true);
  const titularesLidos = useRef(false);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  const recarregar = useCallback(async () => {
    if (!clienteId) return;
    const r = await api.lista(clienteId);
    if (!vivo.current) return;
    if (r.ok === false) { setErroDaLista(r.erro); return; }
    setErroDaLista(null);
    setLista(r.dados);
  }, [api, clienteId]);
  useEffect(() => { void recarregar(); }, [recarregar]);

  const recarregarPendentes = useCallback(async () => {
    if (!clienteId) return;
    let r: Awaited<ReturnType<EntradaEmailApi['pendentes']>>;
    try { r = await entradaApi.pendentes(clienteId); } catch (e) {
      console.error('[e-mail de boletos] pendentes', e);
      r = { ok: false, erro: 'Não consegui ler o que chegou por e-mail.' };
    }
    if (!vivo.current) return;
    if (r.ok === false) { setErroDosPendentes(r.erro); return; }
    setErroDosPendentes(null);
    setPendentes(r.dados);
  }, [entradaApi, clienteId]);
  useEffect(() => { void recarregarPendentes(); }, [recarregarPendentes]);

  const mudar = useCallback((chave: string, m: Partial<ArquivoChegando>) => {
    if (!vivo.current) return;
    setChegando((xs) => xs.map((x) => (x.chave === chave ? { ...x, ...m } : x)));
  }, []);

  const lerSugestoes = useCallback(async () => {
    if (titularesLidos.current || !clienteId) return;
    titularesLidos.current = true;
    const r = await api.documentosDosTitulares(clienteId);
    if (vivo.current && r.ok) setSugestoes(sugestoesDeSenha(r.dados));
  }, [api, clienteId]);

  /** Lê um arquivo (com a senha, se veio) e pede a prévia ao banco. */
  const lerEPrever = useCallback(async (item: Pick<ArquivoChegando, 'chave' | 'arquivo' | 'entrada'>, senha?: string) => {
    if (!clienteId) return;
    mudar(item.chave, { estado: 'lendo', frase: null });
    const lido = await ler(await item.arquivo.arrayBuffer(), senha);
    if (lido.ok === false) {
      if (lido.motivo === 'senha' || lido.motivo === 'senha_errada') void lerSugestoes();
      mudar(item.chave, { estado: lido.motivo, frase: lido.frase, marcado: false });
      return;
    }
    const boleto = lido.leitura.boleto;
    if (!boleto) {
      mudar(item.chave, { estado: 'sem_linha', frase: FRASE_SEM_LINHA, marcado: false });
      if (item.entrada) { await entradaApi.marcarLido(item.entrada.id, 'nao_reconhecido', null); void recarregarPendentes(); }
      return;
    }
    const leituraParaOBanco = item.entrada
      ? { ...paraEntrada({ ...lido.leitura, boleto }, 'email', item.arquivo.name), origem_ref: item.entrada.mensagemId }
      : paraEntrada({ ...lido.leitura, boleto }, 'pdf', item.arquivo.name);
    const r = await api.entrar(clienteId, leituraParaOBanco, true);
    if (r.ok === false) { mudar(item.chave, { estado: 'erro', frase: r.erro, marcado: false }); return; }
    const resposta = r.dados;
    if (!vivo.current) return;
    setChegando((xs) => {
      const codigo = resposta.ok ? resposta.boleto.codigoBarras : null;
      const repetido = !!codigo && xs.some((x) => x.chave !== item.chave && x.resposta?.ok === true && x.resposta.boleto.codigoBarras === codigo);
      const entra = resposta.ok === true && !resposta.jaExiste && !repetido;
      return xs.map((x) => (x.chave === item.chave
        ? { ...x, estado: 'previa', frase: null, resposta, leituraParaOBanco, repetidoNaLeva: repetido, marcado: entra }
        : x));
    });
  }, [api, clienteId, entradaApi, ler, lerSugestoes, mudar, recarregarPendentes]);

  /** Os arquivos soltos (modo "lote": cada um com o seu veredito). */
  const receber = useCallback((vereditos: readonly VereditoDoArquivo[]) => {
    const novos: ArquivoChegando[] = vereditos.map(({ arquivo, motivo }) => {
      sequencia += 1;
      return {
        chave: `b${sequencia}`, arquivo, estado: motivo ? 'recusado' : 'lendo', frase: motivo, resposta: null, marcado: false,
        repetidoNaLeva: false, arquivoSubiu: null, leituraParaOBanco: null, entrada: null,
      };
    });
    setChegando((xs) => [...xs, ...novos]);
    for (const n of novos) if (n.estado === 'lendo') void lerEPrever(n);
  }, [lerEPrever]);

  /** "ler" uma linha do e-mail: baixa o PDF e o põe em "Chegando", pelo mesmo leitor e a mesma prévia. Já em "Chegando" = nada. */
  const lerDoEmail = useCallback(async (e: EntradaDoEmail) => {
    if (!e.storagePath || chegando.some((x) => x.entrada?.id === e.id)) return;
    sequencia += 1;
    const chave = `e${sequencia}`;
    const nome = e.arquivoNome ?? 'boleto-do-email.pdf';
    const vazio = new File([], nome, { type: 'application/pdf' });
    const entrada = { id: e.id, mensagemId: e.mensagemId };
    setChegando((xs) => [...xs, {
      chave, arquivo: vazio, estado: 'lendo', frase: null, resposta: null, marcado: false, repetidoNaLeva: false, arquivoSubiu: null,
      leituraParaOBanco: null, entrada,
    }]);
    const b = await entradaApi.baixar(e.storagePath);
    if (b.ok === false) { mudar(chave, { estado: 'erro', frase: b.erro }); return; }
    const arquivo = new File([b.dados], nome, { type: 'application/pdf' });
    mudar(chave, { arquivo });
    await lerEPrever({ chave, arquivo, entrada });
  }, [chegando, entradaApi, lerEPrever, mudar]);

  const dispensar = useCallback(async (id: string): Promise<string | null> => {
    const r = await entradaApi.dispensar(id);
    if (r.ok === false) return r.erro;
    await recarregarPendentes();
    return null;
  }, [entradaApi, recarregarPendentes]);

  const tentarSenha = useCallback((chave: string, senha: string) => {
    const item = chegando.find((x) => x.chave === chave);
    if (item && senha.trim()) void lerEPrever(item, senha.trim());
  }, [chegando, lerEPrever]);

  const alternar = useCallback((chave: string) => {
    setChegando((xs) => xs.map((x) => (x.chave === chave && x.estado === 'previa' && x.resposta?.ok === true && !x.resposta.jaExiste
      ? { ...x, marcado: !x.marcado } : x)));
  }, []);

  const tirar = useCallback((chave: string) => setChegando((xs) => xs.filter((x) => x.chave !== chave)), []);

  /** "Pôr na caixa": grava os marcados (um a um, pela mesma RPC sem simular) e sobe o PDF de cada um. */
  const porNaCaixa = useCallback(async () => {
    if (!clienteId || gravando) return;
    const marcados = chegando.filter((x) => x.marcado && x.estado === 'previa' && x.leituraParaOBanco);
    if (!marcados.length) return;
    setGravando(true);
    for (const m of marcados) {
      mudar(m.chave, { estado: 'gravando' });
      const r = await api.entrar(clienteId, m.leituraParaOBanco ?? {}, false);
      if (r.ok === false) { mudar(m.chave, { estado: 'erro', frase: r.erro, marcado: false }); continue; }
      const resp = r.dados;
      if (resp.ok === false) { mudar(m.chave, { estado: 'erro', frase: resp.frase, marcado: false, resposta: resp }); continue; }
      let subiu: boolean | null = null;
      if (resp.storagePath) subiu = (await api.subirArquivo(resp.storagePath, m.arquivo)).ok;
      let marcou = true;
      if (m.entrada && resp.id) marcou = (await entradaApi.marcarLido(m.entrada.id, 'boleto', resp.id)).ok;
      const frase = subiu === false ? FRASE_ARQUIVO_NAO_SUBIU : !marcou ? FRASE_EMAIL_NAO_MARCADO : null;
      mudar(m.chave, { estado: 'entrou', resposta: resp, marcado: false, arquivoSubiu: subiu, frase });
    }
    if (vivo.current) setGravando(false);
    await recarregar();
    if (marcados.some((m) => m.entrada)) await recarregarPendentes();
  }, [api, chegando, clienteId, entradaApi, gravando, mudar, recarregar, recarregarPendentes]);

  return {
    lista, erroDaLista, chegando, sugestoes, gravando, receber, tentarSenha, alternar, tirar, porNaCaixa, recarregar,
    pendentes, erroDosPendentes, lerDoEmail, dispensar, recarregarPendentes,
  };
}
