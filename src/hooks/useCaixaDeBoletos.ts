/**
 * BOLETO D3d — o estado da CAIXA POR E-MAIL v2 (mock aprovado 18/11 07:50): o que chegou (`entrada_arquivos`, todas), a LEITURA de cada
 * arquivo no navegador (nota ou boleto(s), D7), as CONSULTAS ao banco (a nota já está num lançamento? a prévia de cada boleto) e os
 * três verbos (Lançar · Vincular · Ignorar) + "Guardar". As linhas e os grupos saem da regra pura (`caixaPorEmail.ts`).
 *
 * ⚠ NADA GRAVA SEM O GESTO: ler e consultar só leem (a prévia do boleto é a `fn_boleto_entrar` com `p_simular`).
 * ⚠ "LANÇAR NOTA" NÃO GRAVA AQUI: a tela devolve o arquivo à tela de Lançamentos, que abre a MESMA prévia do "+ Da nota".
 * ⚠ VINCULAR O BOLETO: entra na caixa (se ainda não está) → sobe o PDF → liga aos lançamentos do candidato (`fn_boleto_ligar`) → a linha
 *   do e-mail vira 'boleto' (`fn_entrada_resolver`) quando TODOS os boletos do arquivo estão feitos. Falhou um passo = a frase diz qual,
 *   o que já gravou fica (nunca some calado).
 * ⚠ SENHA: só na memória do gesto (a leitura de novo); nunca no estado, nunca no banco.
 * ⚠ LEITURA QUE TERMINA DEPOIS DE A TELA SAIR não escreve (OC-ABRIR-LENTO-01): `vivo` guarda.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { caixaApiDoBanco, type CaixaApi, type ListaDaCaixa, type RespostaDeEntrar } from '@/lib/financeiro/boleto/caixaApi';
import { parcelaApiDoBanco, type ParcelaApi } from '@/lib/financeiro/boleto/boletoDaParcela';
import { lerBoletosDoArquivo, paraEntrada, sugestoesDeSenha, type ParteDoBoleto } from '@/lib/financeiro/boleto/lerBoleto';
import { lerNota } from '@/lib/financeiro/nfe/lerNota';
import type { BoletoNormalizado } from '@/lib/financeiro/linhaDigitavel';
import { entradaEmailApiDoBanco, rotuloDoMotivo, type EntradaDoEmail, type EntradaEmailApi, type MotivoDeIgnorar } from '@/lib/financeiro/boleto/entradaEmailApi';
import {
  FRASE_NEM_BOLETO_NEM_NOTA, boletoJaLigado, grupoDosGuardados, gruposDosEmails, linhasDasFontes,
  type ConsultaDaNota, type ConsultaDoBoleto, type FonteParaMontar, type GrupoDaCaixa, type LinhaDaCaixa, type Lido, type ResumoDaNota,
} from '@/lib/financeiro/boleto/caixaPorEmail';
import { hojeLocal } from '@/lib/datas/hojeLocal';

/** A leitura de UM arquivo pela caixa (injetável: a bancada e os testes passam a sua). */
export type LeituraDaCaixa =
  | { k: 'nota'; nota: ResumoDaNota }
  | { k: 'boletos'; boletos: BoletoNormalizado[]; beneficiario: ParteDoBoleto; pagador: ParteDoBoleto }
  | { k: 'nada'; frase: string }
  | { k: 'senha'; errada: boolean }
  | { k: 'erro'; frase: string };
export type LerArquivoDaCaixa = (bytes: ArrayBuffer, tipo: 'xml' | 'pdf', senha?: string) => Promise<LeituraDaCaixa>;

export const FRASE_PDF_IMAGEM = 'O PDF é uma imagem (escaneado): sem linha digitável nem chave legível.';

/** O leitor de verdade: XML → a nota; PDF → os boletos (D7); sem boleto, a nota (o DANFE, pelo `lerNota` de sempre); senão, nada. */
export const lerDaCaixa: LerArquivoDaCaixa = async (bytes, tipo, senha) => {
  if (tipo === 'xml') {
    const n = await lerNota(bytes);
    if ('nota' in n && n.ok) return { k: 'nota', nota: resumoDaNota(n.nota) };
    return { k: 'nada', frase: 'frase' in n ? n.frase : 'Não consegui ler a nota.' };
  }
  const b = await lerBoletosDoArquivo(bytes.slice(0), { senha });
  if (b.ok === false) {
    if (b.motivo === 'senha' || b.motivo === 'senha_errada') return { k: 'senha', errada: b.motivo === 'senha_errada' };
    if (b.motivo === 'sem_texto') return { k: 'nada', frase: FRASE_PDF_IMAGEM };
    return { k: 'erro', frase: b.frase };
  }
  if (b.leitura.boletos.length) return { k: 'boletos', ...b.leitura };
  const n = await lerNota(bytes.slice(0));
  if (n.ok && n.nota.chave) return { k: 'nota', nota: resumoDaNota(n.nota) };
  return { k: 'nada', frase: FRASE_NEM_BOLETO_NEM_NOTA };
};
function resumoDaNota(n: { chave: string; numero: string; emitente: { nome: string }; totais: { notaCent: number }; duplicatas: { vencimento: string }[] }): ResumoDaNota {
  return { chave: n.chave, numero: n.numero, emitente: n.emitente.nome || null, valor: n.totais.notaCent / 100, vencimento: n.duplicatas[0]?.vencimento ?? null };
}

/** O arquivo arrastado nesta sessão (não está no banco: ignorar = tirar da lista). */
interface Local { chave: string; arquivo: File }
/** O que a leitura guardou de cada fonte: os bytes (para ver, subir e lançar) e as partes do boleto (para a prévia do banco). */
interface DaFonte { bytes: ArrayBuffer; nome: string; tipo: 'xml' | 'pdf'; partes: { beneficiario: ParteDoBoleto; pagador: ParteDoBoleto } | null; boletos: BoletoNormalizado[] }

let sequencia = 0;
const tipoDoNome = (nome: string): 'xml' | 'pdf' => (/\.xml$/i.test(nome) ? 'xml' : 'pdf');
const SEM_PARTE: ParteDoBoleto = { documento: null, nome: null, confira: false };

export function useCaixaDeBoletos(clienteId: string | null, opcoes: {
  api?: CaixaApi; parcela?: ParcelaApi; ler?: LerArquivoDaCaixa; entrada?: EntradaEmailApi; hoje?: string; podeLancar?: boolean;
} = {}) {
  const api = opcoes.api ?? caixaApiDoBanco;
  const parcela = opcoes.parcela ?? parcelaApiDoBanco;
  const entradaApi = opcoes.entrada ?? entradaEmailApiDoBanco;
  const ler = opcoes.ler ?? lerDaCaixa;
  const hoje = opcoes.hoje ?? hojeLocal();
  const podeLancar = opcoes.podeLancar ?? false;

  const [lista, setLista] = useState<ListaDaCaixa | null>(null);
  const [entradas, setEntradas] = useState<EntradaDoEmail[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lidos, setLidos] = useState<Record<string, Lido>>({});
  const [notas, setNotas] = useState<Record<string, ConsultaDaNota>>({});
  const [boletos, setBoletos] = useState<Record<string, ConsultaDoBoleto>>({});
  const [locais, setLocais] = useState<Local[]>([]);
  const [feitos, setFeitos] = useState<ReadonlySet<string>>(new Set());
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [sugestoes, setSugestoes] = useState<string[]>([]);
  const vivo = useRef(true);
  const fontes = useRef(new Map<string, DaFonte>());
  const pedidos = useRef(new Set<string>());
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  /* ── carregar ── */
  const recarregar = useCallback(async () => {
    if (!clienteId) return;
    const [l, e] = await Promise.all([
      api.lista(clienteId),
      entradaApi.todas(clienteId).catch((x: unknown) => { console.error('[caixa] entradas', x); return { ok: false as const, erro: 'Não consegui ler o que chegou por e-mail.' }; }),
    ]);
    if (!vivo.current) return;
    if (l.ok) setLista(l.dados);
    if (e.ok) setEntradas(e.dados);
    setErro(l.ok === false ? l.erro : e.ok === false ? e.erro : null);
  }, [api, clienteId, entradaApi]);
  useEffect(() => { void recarregar(); }, [recarregar]);
  useEffect(() => {
    if (!clienteId) return;
    void api.documentosDosTitulares(clienteId).then((r) => { if (vivo.current && r.ok) setSugestoes(sugestoesDeSenha(r.dados)); });
  }, [api, clienteId]);

  /* ── ler uma fonte (o e-mail baixa; o arrastado já tem o arquivo) ── */
  const lerFonte = useCallback(async (chave: string, obter: () => Promise<{ bytes: ArrayBuffer; nome: string } | string>, tipo: 'xml' | 'pdf', senha?: string) => {
    setLidos((x) => ({ ...x, [chave]: { k: 'lendo' } }));
    const o = await obter();
    if (!vivo.current) return;
    if (typeof o === 'string') { setLidos((x) => ({ ...x, [chave]: { k: 'erro', frase: o } })); return; }
    let r: LeituraDaCaixa;
    try { r = await ler(o.bytes.slice(0), tipo, senha); } catch (e) { console.error('[caixa] leitura', e); r = { k: 'erro', frase: 'Não consegui ler este arquivo.' }; }
    if (!vivo.current) return;
    fontes.current.set(chave, {
      bytes: o.bytes, nome: o.nome, tipo, partes: r.k === 'boletos' ? { beneficiario: r.beneficiario, pagador: r.pagador } : null,
      boletos: r.k === 'boletos' ? r.boletos : [],
    });
    const lido: Lido = r.k === 'boletos'
      ? { k: 'boletos', boletos: r.boletos.map((b) => ({ codigoBarras: b.codigo_barras, linha: b.linha, vencimento: b.vencimento, valor: b.valor, beneficiario: r.beneficiario.nome })) }
      : r;
    setLidos((x) => ({ ...x, [chave]: lido }));
  }, [ler]);

  const baixarDoEmail = useCallback((e: EntradaDoEmail) => async (): Promise<{ bytes: ArrayBuffer; nome: string } | string> => {
    if (!e.storagePath) return 'Esta linha não tem arquivo.';
    const b = await entradaApi.baixar(e.storagePath);
    if (b.ok === false) return b.erro;
    return { bytes: await b.dados.arrayBuffer(), nome: e.arquivoNome ?? 'arquivo' };
  }, [entradaApi]);

  /* as entradas abertas com arquivo: lê cada uma uma vez (3 por vez) */
  useEffect(() => {
    if (!entradas) return;
    const fila = entradas.filter((e) => (e.estado === 'a_ler' || e.estado === 'nao_reconhecido') && e.storagePath && e.tipo && !pedidos.current.has(`ler:${e.id}`));
    fila.forEach((e) => pedidos.current.add(`ler:${e.id}`));
    let i = 0;
    const proximo = async (): Promise<void> => {
      const e = fila[i++];
      if (!e || !vivo.current) return;
      await lerFonte(e.id, baixarDoEmail(e), e.tipo ?? 'pdf');
      return proximo();
    };
    void Promise.all([proximo(), proximo(), proximo()]);
  }, [entradas, lerFonte, baixarDoEmail]);

  /* ── as consultas ao banco ── */
  const origemDe = useCallback((fonte: string) => entradas?.find((e) => e.id === fonte)?.mensagemId ?? null, [entradas]);
  const leituraParaOBanco = useCallback((fonte: string, b: BoletoNormalizado): Record<string, unknown> => {
    const f = fontes.current.get(fonte);
    const partes = f?.partes ?? { beneficiario: SEM_PARTE, pagador: SEM_PARTE };
    const ref = origemDe(fonte);
    const l = paraEntrada({ boleto: b, ...partes }, ref ? 'email' : 'pdf', f?.nome ?? 'boleto.pdf');
    return ref ? { ...l, origem_ref: ref } : l;
  }, [origemDe]);

  useEffect(() => {
    if (!clienteId) return;
    /* as notas: as chaves ainda não perguntadas, numa ida só */
    const chaves = [...new Set(Object.values(lidos).flatMap((l) => (l.k === 'nota' ? [l.nota.chave] : [])))].filter((c) => !pedidos.current.has(`nota:${c}`));
    if (chaves.length) {
      chaves.forEach((c) => pedidos.current.add(`nota:${c}`));
      void entradaApi.notasNoSistema(clienteId, chaves).then((r) => {
        if (!vivo.current) return;
        setNotas((x) => ({ ...x, ...Object.fromEntries(chaves.map((c) => [c, r.ok ? (r.dados[c] ?? null) : 'erro'])) }));
      });
    }
    /* os boletos lidos: a prévia de cada um */
    for (const [fonte, l] of Object.entries(lidos)) {
      if (l.k !== 'boletos') continue;
      for (const b of fontes.current.get(fonte)?.boletos ?? []) {
        const chave = `${fonte}#${b.codigo_barras}`;
        if (pedidos.current.has(`bol:${chave}`)) continue;
        pedidos.current.add(`bol:${chave}`);
        void api.entrar(clienteId, leituraParaOBanco(fonte, b), true).then((r) => {
          if (vivo.current) setBoletos((x) => ({ ...x, [chave]: r.ok ? r.dados : { ok: 'erro', frase: r.erro } }));
        });
      }
    }
  }, [api, clienteId, entradaApi, lidos, leituraParaOBanco]);

  /* os guardados (novo / sem par): a prévia diz os candidatos de hoje */
  useEffect(() => {
    if (!clienteId || !lista) return;
    for (const i of lista.itens) {
      if ((i.boleto.situacao !== 'novo' && i.boleto.situacao !== 'sem_par') || !i.boleto.id) continue;
      const chave = `guardado:${i.boleto.id}`;
      if (pedidos.current.has(`bol:${chave}`)) continue;
      pedidos.current.add(`bol:${chave}`);
      void api.entrar(clienteId, { linha: i.boleto.linhaDigitavel, origem: 'pdf', arquivo_nome: i.boleto.arquivoNome ?? 'boleto.pdf' }, true).then((r) => {
        if (vivo.current) setBoletos((x) => ({ ...x, [chave]: r.ok ? r.dados : { ok: 'erro', frase: r.erro } }));
      });
    }
  }, [api, clienteId, lista]);

  /* ── os grupos ── */
  const grupos: GrupoDaCaixa[] = useMemo(() => {
    const doEmail = entradas ? gruposDosEmails(entradas, lidos, notas, boletos, hoje, podeLancar, feitos) : [];
    const arrastados: FonteParaMontar[] = locais.map((l) => ({ chave: l.chave, nome: l.arquivo.name, tipoDoArquivo: tipoDoNome(l.arquivo.name), lido: lidos[l.chave] ?? { k: 'lendo' } }));
    const gLocal: GrupoDaCaixa[] = arrastados.length ? [{
      chave: 'locais', tipo: 'local', titulo: 'Arrastados por você', assunto: 'os arquivos que você soltou aqui (nada gravado até o gesto)',
      linhas: linhasDasFontes(arrastados, notas, boletos, hoje, podeLancar, feitos), fontesAntigas: [],
    }] : [];
    const gGuardados = lista ? grupoDosGuardados(lista.itens, boletos, hoje, feitos) : null;
    return [...gLocal, ...doEmail, ...(gGuardados ? [gGuardados] : [])];
  }, [entradas, lidos, notas, boletos, hoje, podeLancar, feitos, locais, lista]);

  const resolvidos = useMemo(() => (entradas ?? []).filter((e) => e.estado === 'boleto' || e.estado === 'nota'), [entradas]);
  const ignorados = useMemo(() => (entradas ?? []).filter((e) => e.estado === 'dispensado'), [entradas]);
  const descartados = useMemo(() => (lista?.itens ?? []).filter((i) => i.boleto.situacao === 'descartado'), [lista]);

  /* ── arrastar ── */
  const receber = useCallback((arquivos: readonly File[]) => {
    const novos = arquivos.map((arquivo) => { sequencia += 1; return { chave: `local:${sequencia}`, arquivo }; });
    setLocais((xs) => [...xs, ...novos]);
    for (const n of novos) {
      void lerFonte(n.chave, async () => ({ bytes: await n.arquivo.arrayBuffer(), nome: n.arquivo.name }), tipoDoNome(n.arquivo.name));
    }
  }, [lerFonte]);

  /* ── o arquivo de uma fonte (ver, lançar) ── */
  const arquivoDe = useCallback(async (fonte: string): Promise<File | null> => {
    let f = fontes.current.get(fonte);
    if (!f && fonte.startsWith('guardado:')) {
      /* o boleto guardado na caixa (A resolver ou Ignorados): o PDF que subiu com ele, no mesmo bucket */
      const i = lista?.itens.find((x) => `guardado:${x.boleto.id}` === fonte);
      if (!i?.boleto.storagePath) return null;
      const b = await entradaApi.baixar(i.boleto.storagePath);
      if (b.ok === false) return null;
      f = { bytes: await b.dados.arrayBuffer(), nome: i.boleto.arquivoNome ?? 'boleto.pdf', tipo: 'pdf', partes: null, boletos: [] };
      fontes.current.set(fonte, f);
    }
    if (!f) {
      const e = entradas?.find((x) => x.id === fonte);
      if (!e) return null;
      const o = await baixarDoEmail(e)();
      if (typeof o === 'string') return null;
      f = { bytes: o.bytes, nome: o.nome, tipo: e.tipo ?? 'pdf', partes: null, boletos: [] };
      fontes.current.set(fonte, f);
    }
    return new File([f.bytes], f.nome, { type: f.tipo === 'xml' ? 'text/xml' : 'application/pdf' });
  }, [baixarDoEmail, entradas, entradaApi, lista]);

  /** O nome e o tipo de cada fonte, sem baixar (o "Ver" escolhe o PDF; o "Baixar" lista os arquivos). Sem arquivo = null. */
  const nomeDaFonte = useCallback((fonte: string): { nome: string; tipo: 'xml' | 'pdf' } | null => {
    const e = entradas?.find((x) => x.id === fonte);
    if (e) return e.storagePath ? { nome: e.arquivoNome ?? 'arquivo', tipo: e.tipo === 'xml' ? 'xml' : 'pdf' } : null;
    const l = locais.find((x) => x.chave === fonte);
    if (l) return { nome: l.arquivo.name, tipo: tipoDoNome(l.arquivo.name) };
    const i = fonte.startsWith('guardado:') ? lista?.itens.find((x) => `guardado:${x.boleto.id}` === fonte) : undefined;
    if (i) return i.boleto.storagePath ? { nome: i.boleto.arquivoNome ?? 'boleto.pdf', tipo: 'pdf' } : null;
    const f = fontes.current.get(fonte);
    return f ? { nome: f.nome, tipo: f.tipo } : null;
  }, [entradas, locais, lista]);

  const tentarSenha = useCallback((fonte: string, senha: string) => {
    if (!senha.trim()) return;
    const e = entradas?.find((x) => x.id === fonte);
    const l = locais.find((x) => x.chave === fonte);
    if (e) void lerFonte(fonte, baixarDoEmail(e), 'pdf', senha.trim());
    else if (l) void lerFonte(fonte, async () => ({ bytes: await l.arquivo.arrayBuffer(), nome: l.arquivo.name }), 'pdf', senha.trim());
  }, [entradas, locais, lerFonte, baixarDoEmail]);

  /* ── os gestos ── */
  const ehDoEmail = useCallback((fonte: string) => !!entradas?.some((e) => e.id === fonte), [entradas]);
  const marcarFeito = (chave: string) => setFeitos((x) => new Set([...x, chave]));

  /** Resolve a entrada do e-mail quando TODOS os boletos do arquivo estão feitos (D7). */
  const resolverSeCompleto = useCallback(async (fonte: string, chaveFeita: string, boletoId: string): Promise<string | null> => {
    if (!ehDoEmail(fonte)) return null;
    const todos = (fontes.current.get(fonte)?.boletos ?? []).map((b) => `${fonte}#${b.codigo_barras}`);
    const feitosAgora = new Set([...feitos, chaveFeita]);
    if (!todos.every((c) => feitosAgora.has(c))) return null;
    const r = await entradaApi.resolver(fonte, 'boleto', boletoId, null);
    return r.ok ? null : `O boleto está na caixa, mas a linha do e-mail não foi marcada: ${r.erro}`;
  }, [ehDoEmail, entradaApi, feitos]);

  /** Garante o boleto na caixa (entra + sobe o PDF) e devolve o id. */
  const garantirNaCaixa = useCallback(async (l: LinhaDaCaixa): Promise<{ ok: true; id: string; aviso: string | null } | { ok: false; frase: string }> => {
    if (l.boletoGuardadoId) return { ok: true, id: l.boletoGuardadoId, aviso: null };
    if (!clienteId || !l.boleto) return { ok: false, frase: 'Escolha o cliente.' };
    const fonte = l.fontes[0];
    const b = fontes.current.get(fonte)?.boletos.find((x) => x.codigo_barras === l.boleto?.codigoBarras);
    if (!b) return { ok: false, frase: 'Leia o arquivo de novo.' };
    const r = await api.entrar(clienteId, leituraParaOBanco(fonte, b), false);
    if (r.ok === false) return { ok: false, frase: r.erro };
    const resp: RespostaDeEntrar = r.dados;
    if (resp.ok === false) return { ok: false, frase: resp.frase };
    if (!resp.id) return { ok: false, frase: 'O banco não devolveu o boleto. Nada foi ligado.' };
    let aviso: string | null = null;
    if (resp.storagePath) {
      const arq = await arquivoDe(fonte);
      const s = arq ? await api.subirArquivo(resp.storagePath, arq) : null;
      if (!s || s.ok === false) aviso = 'O boleto entrou na caixa, mas o arquivo não subiu.';
    }
    return { ok: true, id: resp.id, aviso };
  }, [api, clienteId, leituraParaOBanco, arquivoDe]);

  const fazer = useCallback(async (chave: string, f: () => Promise<string | null>): Promise<string | null> => {
    if (ocupado) return 'Espere o gesto anterior terminar.';
    setOcupado(chave);
    let frase: string | null;
    try { frase = await f(); } catch (e) { console.error('[caixa] gesto', e); frase = 'Não consegui falar com o banco. Tente de novo.'; }
    if (vivo.current) setOcupado(null);
    return frase;
  }, [ocupado]);

  /** Vincular o boleto aos lançamentos do candidato escolhido (ou só resolver, se ele já está ligado). */
  const vincularBoleto = useCallback((l: LinhaDaCaixa, lancamentos: string[]) => fazer(l.chave, async () => {
    const jaLigado = boletoJaLigado(l.previa);
    if (!jaLigado && !lancamentos.length) return 'Escolha o lançamento.';
    const g = await garantirNaCaixa(l);
    if (g.ok === false) return g.frase;
    if (!jaLigado) {
      const r = await parcela.ligar(g.id, lancamentos, false);
      if (r.ok === false) return `O boleto está na caixa, mas não foi ligado: ${r.erro}`;
      if (r.dados.ok === false) return `O boleto está na caixa, mas não foi ligado: ${r.dados.frase}`;
    }
    marcarFeito(l.chave);
    const m = await resolverSeCompleto(l.fontes[0], l.chave, g.id);
    await recarregar();
    return m ?? g.aviso;
  }), [fazer, garantirNaCaixa, parcela, resolverSeCompleto, recarregar]);

  const guardar = useCallback((l: LinhaDaCaixa) => fazer(l.chave, async () => {
    const g = await garantirNaCaixa(l);
    if (g.ok === false) return g.frase;
    marcarFeito(l.chave);
    const m = await resolverSeCompleto(l.fontes[0], l.chave, g.id);
    await recarregar();
    return m ?? g.aviso;
  }), [fazer, garantirNaCaixa, resolverSeCompleto, recarregar]);

  /** Vincular a nota que já está num lançamento: as entradas (XML e PDF) viram 'nota' com o lançamento. */
  const vincularNota = useCallback((l: LinhaDaCaixa) => fazer(l.chave, async () => {
    const lanc = l.notaNoSistema?.lancamentoId ?? null;
    for (const f of l.fontes.filter(ehDoEmail)) {
      const r = await entradaApi.resolver(f, 'nota', null, lanc);
      if (r.ok === false) return r.erro;
    }
    marcarFeito(l.chave);
    await recarregar();
    return null;
  }), [fazer, ehDoEmail, entradaApi, recarregar]);

  /** Ignorar (D6): as entradas do e-mail com o motivo; o boleto guardado = descartado; o arrastado sai da lista. */
  const ignorar = useCallback((ls: readonly LinhaDaCaixa[], motivo: MotivoDeIgnorar, detalhe: string | null) => fazer('ignorar', async () => {
    const todas = [...new Set(ls.flatMap((l) => l.fontes))];
    const doEmail = todas.filter(ehDoEmail);
    if (doEmail.length) {
      const r = await entradaApi.ignorar(doEmail, motivo, detalhe);
      if (r.ok === false) return r.erro;
    }
    for (const l of ls.filter((x) => x.boletoGuardadoId && x.fontes[0].startsWith('guardado:'))) {
      const texto = [rotuloDoMotivo(motivo), detalhe].filter(Boolean).join(' · ');
      const r = await api.marcar(l.boletoGuardadoId ?? '', 'descartado', texto);
      if (r.ok === false) return r.erro;
    }
    const locaisFora = new Set(todas.filter((f) => f.startsWith('local:')));
    if (locaisFora.size) setLocais((xs) => xs.filter((x) => !locaisFora.has(x.chave)));
    await recarregar();
    return null;
  }), [fazer, ehDoEmail, entradaApi, api, recarregar]);

  /** Voltar para "A resolver": a entrada ignorada ou resolvida (o Desfazer), ou o boleto descartado (volta a "novo"). */
  const voltar = useCallback((alvo: { entradaId: string } | { boletoId: string }) => fazer('voltar', async () => {
    const r = 'entradaId' in alvo ? await entradaApi.voltar(alvo.entradaId) : await api.marcar(alvo.boletoId, 'novo', null);
    if (r.ok === false) return r.erro;
    if ('entradaId' in alvo) {
      pedidos.current.delete(`ler:${alvo.entradaId}`);
      setFeitos((x) => new Set([...x].filter((c) => !c.includes(alvo.entradaId))));
    } else {
      pedidos.current.delete(`bol:guardado:${alvo.boletoId}`);
      setFeitos((x) => new Set([...x].filter((c) => c !== `guardado:${alvo.boletoId}`)));
    }
    await recarregar();
    return null;
  }), [fazer, entradaApi, api, recarregar]);

  return {
    lista, entradas, erro, grupos, resolvidos, ignorados, descartados, sugestoes, ocupado,
    receber, arquivoDe, nomeDaFonte, tentarSenha, vincularBoleto, guardar, vincularNota, ignorar, voltar, recarregar,
  };
}
