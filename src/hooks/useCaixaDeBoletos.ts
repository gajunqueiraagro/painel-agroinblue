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
 * ⚠ BOLETO-SEPARAR-01: o PDF com VÁRIOS boletos se DIVIDE antes de gravar — a parcela recebe só as páginas do SEU boleto
 *   (`paginasDosBoletos` + `dividirPdf`); não dividiu = nada grava (nunca sobe o inteiro no lugar). O original do e-mail fica no 1º
 *   lançamento como "PDF original (N boletos)". 2 boletos na mesma página: o mesmo arquivo às duas parcelas, com o aviso.
 * ⚠ SENHA: só na memória do gesto (a leitura de novo); nunca no estado, nunca no banco.
 * ⚠ LEITURA QUE TERMINA DEPOIS DE A TELA SAIR não escreve (OC-ABRIR-LENTO-01): `vivo` guarda.
 * ⚠ CAIXA-GUARDAR-01 (D1 a): DESFAZER O GUARDADO = o boleto vai para `descartado` (MOTIVO_DO_DESFEITO, `fn_boleto_marcar`, trilha) e o
 *   e-mail dele volta para A resolver (`fn_entrada_voltar`) — uma linha só depois; "Guardar" o boleto descartado REABRE o mesmo (`novo`).
 *   São 2 RPCs de hoje, nesta ordem: falhou a 2ª, a frase diz e o boleto já está fora da caixa (o e-mail segue em Resolvidos).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { caixaApiDoBanco, type CaixaApi, type DocumentoDaCaixa, type ListaDaCaixa, type RespostaDeEntrar } from '@/lib/financeiro/boleto/caixaApi';
import { parcelaApiDoBanco, type ParcelaApi } from '@/lib/financeiro/boleto/boletoDaParcela';
import { paraEntrada, sugestoesDeSenha, type ParteDoBoleto } from '@/lib/financeiro/boleto/lerBoleto';
import type { BoletoNormalizado } from '@/lib/financeiro/linhaDigitavel';
import { entradaEmailApiDoBanco, rotuloDoMotivo, type DetalheDoResolvido, type EntradaDoEmail, type EntradaEmailApi, type MotivoDeIgnorar } from '@/lib/financeiro/boleto/entradaEmailApi';
import { md5 } from '@/lib/arquivo/md5';
import {
  MOTIVO_DO_DESFEITO, boletoJaLigado, grupoDosGuardados, gruposDosEmails, linhasDasFontes, numeroDaNotaComPontos,
  type ConsultaDaNota, type ConsultaDoBoleto, type FonteParaMontar, type GrupoDaCaixa, type LinhaDaCaixa, type Lido,
} from '@/lib/financeiro/boleto/caixaPorEmail';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { importarDoApp } from '@/lib/app/falhaDeVersao';
import { lerDaCaixa, type LerArquivoDaCaixa, type LeituraDaCaixa } from '@/lib/financeiro/boleto/lerDaCaixa';
import { daGravada, paraGravar } from '@/lib/financeiro/boleto/leituraGravada';
/* ENTRADA-CENTRAL-01 F1: o leitor mudou para `lerDaCaixa.ts` (puro, o mesmo da Lambda); os chamadores de sempre seguem importando daqui */
export { FRASE_PDF_IMAGEM, lerDaCaixa, lerDaCaixaCom, notaPelaChave, pdfPareceFolha, type LeituraDaCaixa, type LerArquivoDaCaixa } from '@/lib/financeiro/boleto/lerDaCaixa';

/** O arquivo arrastado nesta sessão (não está no banco: ignorar = tirar da lista). */
interface Local { chave: string; arquivo: File }
/** O que a leitura guardou de cada fonte: os bytes (para ver, subir e lançar) e as partes do boleto (para a prévia do banco). */
interface DaFonte {
  /** ENTRADA-CENTRAL-01 F1: null = a leitura veio GUARDADA (não se baixou); quem precisa do arquivo baixa na hora (`bytesDe`) */
  bytes: ArrayBuffer | null; nome: string; tipo: 'xml' | 'pdf'; partes: { beneficiario: ParteDoBoleto; pagador: ParteDoBoleto } | null; boletos: BoletoNormalizado[];
  /** BOLETO-SEPARAR-01: a página de cada boleto (na ordem de `boletos`) e o total do PDF; null = não se sabe (não divide) */
  paginas: { deCada: number[]; total: number } | null;
}

export const FRASE_NAO_SEPAROU = 'Não consegui separar este boleto do PDF. Nada foi gravado.';
export const FRASE_PAGINA_COM_2 = 'Esta página tem 2 boletos: o mesmo arquivo vai às duas parcelas.';
/** O nome do arquivo de um boleto separado: "boleto_Uniao (2 de 3).pdf". */
export const nomeDoSeparado = (nome: string, i: number, n: number) => `${nome.replace(/\.pdf$/i, '')} (${i + 1} de ${n}).pdf`;

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
  /** 118610: quem, quando e o que gerou cada resolvido */
  const [detalhes, setDetalhes] = useState<Record<string, DetalheDoResolvido>>({});
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
    /* 118610: o detalhe de Resolvidos (falhou = a coluna fica sem o detalhe; a lista de sempre continua) */
    const d = entradaApi.resolvidos ? await entradaApi.resolvidos(clienteId).catch(() => null) : null;
    if (vivo.current && d && d.ok) setDetalhes(d.dados);
  }, [api, clienteId, entradaApi]);
  useEffect(() => { void recarregar(); }, [recarregar]);
  useEffect(() => {
    if (!clienteId) return;
    void api.documentosDosTitulares(clienteId).then((r) => { if (vivo.current && r.ok) setSugestoes(sugestoesDeSenha(r.dados)); });
  }, [api, clienteId]);

  /* ── ler uma fonte (o e-mail baixa; o arrastado já tem o arquivo) ── */
  /** a leitura (feita agora ou guardada) vira a fonte e a linha */
  const aplicarLeitura = useCallback((chave: string, nome: string, tipo: 'xml' | 'pdf', bytes: ArrayBuffer | null, r: LeituraDaCaixa) => {
    fontes.current.set(chave, {
      bytes, nome, tipo, partes: r.k === 'boletos' ? { beneficiario: r.beneficiario, pagador: r.pagador } : null,
      boletos: r.k === 'boletos' ? r.boletos : [],
      paginas: r.k === 'boletos' && r.paginaDeCada && r.totalDePaginas && r.paginaDeCada.length === r.boletos.length
        ? { deCada: r.paginaDeCada, total: r.totalDePaginas } : null,
    });
    const lido: Lido = r.k === 'boletos'
      ? { k: 'boletos', boletos: r.boletos.map((b) => ({ codigoBarras: b.codigo_barras, linha: b.linha, vencimento: b.vencimento, valor: b.valor, beneficiario: r.beneficiario.nome })) }
      : r;
    setLidos((x) => ({ ...x, [chave]: lido }));
  }, []);
  /** `guardarEm`: a linha da entrada que ainda não tem a leitura desta versão — lida aqui (sem senha), a leitura fica nela e não se relê */
  const lerFonte = useCallback(async (chave: string, obter: () => Promise<{ bytes: ArrayBuffer; nome: string } | string>, tipo: 'xml' | 'pdf', senha?: string, guardarEm?: string) => {
    setLidos((x) => ({ ...x, [chave]: { k: 'lendo' } }));
    const o = await obter();
    if (!vivo.current) return;
    if (typeof o === 'string') { setLidos((x) => ({ ...x, [chave]: { k: 'erro', frase: o } })); return; }
    let r: LeituraDaCaixa;
    try { r = await ler(o.bytes.slice(0), tipo, senha, o.nome); } catch (e) { console.error('[caixa] leitura', e); r = { k: 'erro', frase: 'Não consegui ler este arquivo.' }; }
    if (!vivo.current) return;
    aplicarLeitura(chave, o.nome, tipo, o.bytes, r);
    const g = guardarEm && !senha ? paraGravar(r) : null;
    if (g && guardarEm && entradaApi.guardarLeitura) {
      void entradaApi.guardarLeitura(guardarEm, g).then((x) => { if (x.ok === false) console.error('[caixa] guardar a leitura', x.erro); });
    }
  }, [ler, aplicarLeitura, entradaApi]);

  const baixarDoEmail = useCallback((e: EntradaDoEmail) => async (): Promise<{ bytes: ArrayBuffer; nome: string } | string> => {
    if (!e.storagePath) return 'Esta linha não tem arquivo.';
    const b = await entradaApi.baixar(e.storagePath);
    if (b.ok === false) return b.erro;
    return { bytes: await b.dados.arrayBuffer(), nome: e.arquivoNome ?? 'arquivo' };
  }, [entradaApi]);

  /* as entradas abertas com arquivo: lê cada uma uma vez (3 por vez) */
  useEffect(() => {
    if (!entradas) return;
    const abertas = entradas.filter((e) => (e.estado === 'a_ler' || e.estado === 'nao_reconhecido') && e.storagePath && e.tipo && !pedidos.current.has(`ler:${e.id}`));
    abertas.forEach((e) => pedidos.current.add(`ler:${e.id}`));
    /* ENTRADA-CENTRAL-01 F1: a leitura guardada (desta versão do leitor) não se relê nem se baixa; o resto lê como sempre e guarda */
    const fila: EntradaDoEmail[] = [];
    for (const e of abertas) {
      const g = daGravada(e.leitura);
      if (g) aplicarLeitura(e.id, e.arquivoNome ?? 'arquivo', e.tipo ?? 'pdf', null, g);
      else fila.push(e);
    }
    let i = 0;
    const proximo = async (): Promise<void> => {
      const e = fila[i++];
      if (!e || !vivo.current) return;
      await lerFonte(e.id, baixarDoEmail(e), e.tipo ?? 'pdf', undefined, e.id);
      return proximo();
    };
    void Promise.all([proximo(), proximo(), proximo()]);
  }, [entradas, lerFonte, baixarDoEmail, aplicarLeitura]);

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
      chave: 'locais', tipo: 'local', titulo: 'Arrastados por você', assunto: 'guardando na Caixa… (o que não guardar fica só nesta tela)',
      linhas: linhasDasFontes(arrastados, notas, boletos, hoje, podeLancar, feitos), fontesAntigas: [],
    }] : [];
    const gGuardados = lista ? grupoDosGuardados(lista.itens, boletos, hoje, feitos) : null;
    /* CAIXA-GUARDAR-01: os guardados PRIMEIRO (no NJ ficavam depois de 15 e-mails, fora da janela) */
    return [...(gGuardados ? [gGuardados] : []), ...gLocal, ...doEmail];
  }, [entradas, lidos, notas, boletos, hoje, podeLancar, feitos, locais, lista]);

  const resolvidos = useMemo(() => (entradas ?? []).filter((e) => e.estado === 'boleto' || e.estado === 'nota' || e.estado === 'folha'), [entradas]);
  const ignorados = useMemo(() => (entradas ?? []).filter((e) => e.estado === 'dispensado'), [entradas]);
  const descartados = useMemo(() => (lista?.itens ?? []).filter((i) => i.boleto.situacao === 'descartado'), [lista]);

  /* ── arrastar ── */
  /** CAIXA-FOLHA-VERA (Gabriel 15:10: os 3 arquivos arrastados SUMIRAM ao fechar e reabrir) — o arquivo ARRASTADO é GUARDADO NA HORA, como o do
   *  e-mail: registra (`fn_entrada_registrar_arrastado`: o mesmo arquivo = a mesma linha), sobe para o storage do cliente e entra em
   *  "A resolver" (grupo "Arrastados para a Caixa"); o que espera o gesto é só lançar, vincular ou aplicar. A leitura sai do arquivo que já
   *  está na memória (não baixa de novo). Falhou = fica só nesta tela, como antes, e a frase diz por quê. Sem a API (bancada antiga): como antes. */
  const guardarArrastados = useCallback(async (novos: readonly Local[]) => {
    if (!clienteId || !entradaApi.registrarArrastado) return;
    const registrar = entradaApi.registrarArrastado;
    let algum = false;
    for (const n of novos) {
      const bytes = await n.arquivo.arrayBuffer();
      const tipo = tipoDoNome(n.arquivo.name);
      const reg = await registrar(clienteId, { nome: n.arquivo.name, tipo, tamanho: bytes.byteLength, md5: md5(bytes) });
      if (!vivo.current) return;
      if (reg.ok === false) { setErro(`"${n.arquivo.name}" não ficou guardado na Caixa (fica só nesta tela): ${reg.erro}`); continue; }
      if (!reg.dados.jaExistia) {
        const up = await api.subirArquivo(reg.dados.storagePath, n.arquivo);
        if (!vivo.current) return;
        if (up.ok === false) { setErro(`"${n.arquivo.name}" não subiu para a Caixa (fica só nesta tela): ${up.erro}`); continue; }
      }
      /* já resolvido ou ignorado antes: a linha de lá vale; aqui fica só a desta sessão */
      if (reg.dados.estado !== 'a_ler' && reg.dados.estado !== 'nao_reconhecido') continue;
      pedidos.current.add(`ler:${reg.dados.id}`);
      void lerFonte(reg.dados.id, async () => ({ bytes, nome: n.arquivo.name }), tipo, undefined, reg.dados.id);
      setLocais((xs) => xs.filter((x) => x.chave !== n.chave));
      algum = true;
    }
    if (algum) await recarregar();
  }, [api, clienteId, entradaApi, lerFonte, recarregar]);

  const receber = useCallback((arquivos: readonly File[]) => {
    const novos = arquivos.map((arquivo) => { sequencia += 1; return { chave: `local:${sequencia}`, arquivo }; });
    setLocais((xs) => [...xs, ...novos]);
    for (const n of novos) {
      void lerFonte(n.chave, async () => ({ bytes: await n.arquivo.arrayBuffer(), nome: n.arquivo.name }), tipoDoNome(n.arquivo.name));
    }
    void guardarArrastados(novos);
  }, [lerFonte, guardarArrastados]);

  /* ── o arquivo de uma fonte (ver, lançar) ── */
  const arquivoDe = useCallback(async (fonte: string): Promise<File | null> => {
    let f = fontes.current.get(fonte);
    if (!f && fonte.startsWith('guardado:')) {
      /* o boleto guardado na caixa (A resolver ou Ignorados): o PDF que subiu com ele, no mesmo bucket */
      const i = lista?.itens.find((x) => `guardado:${x.boleto.id}` === fonte);
      if (!i?.boleto.storagePath) return null;
      const b = await entradaApi.baixar(i.boleto.storagePath);
      if (b.ok === false) return null;
      f = { bytes: await b.dados.arrayBuffer(), nome: i.boleto.arquivoNome ?? 'boleto.pdf', tipo: 'pdf', partes: null, boletos: [], paginas: null };
      fontes.current.set(fonte, f);
    }
    if (!f || !f.bytes) {
      const e = entradas?.find((x) => x.id === fonte);
      if (!e) return null;
      const o = await baixarDoEmail(e)();
      if (typeof o === 'string') return null;
      f = f ? { ...f, bytes: o.bytes } : { bytes: o.bytes, nome: o.nome, tipo: e.tipo ?? 'pdf', partes: null, boletos: [], paginas: null };
      fontes.current.set(fonte, f);
    }
    if (!f.bytes) return null;
    return new File([f.bytes], f.nome, { type: f.tipo === 'xml' ? 'text/xml' : 'application/pdf' });
  }, [baixarDoEmail, entradas, entradaApi, lista]);

  /** BOLETO-SEPARAR-01 — o arquivo de UM boleto: o PDF de 1 boleto vai inteiro; o de vários, só as páginas dele (`paginasDosBoletos`:
   *  capa vai com o seguinte, ficha + recibo juntos, o resto com o último). Não dividiu = recusa (nunca o inteiro no lugar). */
  const arquivoDoBoleto = useCallback(async (fonte: string, codigoBarras: string): Promise<
    { ok: true; arquivo: File | null; separado: boolean; aviso: string | null } | { ok: false; frase: string }
  > => {
    const f = fontes.current.get(fonte);
    const i = f ? f.boletos.findIndex((b) => b.codigo_barras === codigoBarras) : -1;
    if (!f || f.tipo !== 'pdf' || f.boletos.length < 2 || i < 0) return { ok: true, arquivo: await arquivoDe(fonte), separado: false, aviso: null };
    if (!f.paginas) return { ok: false, frase: FRASE_NAO_SEPAROU };
    const { dividirPdf, paginasDosBoletos } = await importarDoApp(() => import('@/lib/pdf/dividirPdf'));
    const grupo = paginasDosBoletos(f.paginas.deCada, f.paginas.total)[i];
    const aviso = f.paginas.deCada.filter((p) => p === f.paginas?.deCada[i]).length > 1 ? FRASE_PAGINA_COM_2 : null;
    if (grupo.length >= f.paginas.total) return { ok: true, arquivo: await arquivoDe(fonte), separado: false, aviso };
    const todo = f.bytes ?? await (await arquivoDe(fonte))?.arrayBuffer() ?? null;
    if (!todo) return { ok: false, frase: FRASE_NAO_SEPAROU };
    const d = await dividirPdf(todo.slice(0), [grupo]);
    if (d.ok === false) return { ok: false, frase: FRASE_NAO_SEPAROU };
    const nome = nomeDoSeparado(f.nome, i, f.boletos.length);
    return { ok: true, arquivo: new File([d.arquivos[0].slice().buffer], nome, { type: 'application/pdf' }), separado: true, aviso };
  }, [arquivoDe]);

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
  /** FOLHA-NA-CAIXA-01b item 4 (118610): o ARRASTADO que foi resolvido vira registro da Caixa — registra (o mesmo arquivo = a mesma linha),
   *  sobe o arquivo (só se é novo) e marca como o do e-mail; depois sai dos "Arrastados por você" (está em Resolvidos). Sem a API nova
   *  (bancada antiga) nada muda: fica só na sessão, como antes. Falhou = a frase diz; o que já gravou fica. */
  const resolverArrastado = useCallback(async (fonte: string, estado: 'boleto' | 'nota' | 'folha', boletoId: string | null, lancamentoId: string | null): Promise<string | null> => {
    const local = locais.find((x) => x.chave === fonte);
    if (!local || !clienteId || !entradaApi.registrarArrastado) return null;
    const bytes = await local.arquivo.arrayBuffer();
    const reg = await entradaApi.registrarArrastado(clienteId, { nome: local.arquivo.name, tipo: tipoDoNome(local.arquivo.name), tamanho: bytes.byteLength, md5: md5(bytes) });
    if (reg.ok === false) return `Feito, mas o arquivo não ficou guardado na Caixa: ${reg.erro}`;
    if (!reg.dados.jaExistia) {
      const up = await api.subirArquivo(reg.dados.storagePath, local.arquivo);
      if (up.ok === false) return `Feito, mas o arquivo não subiu para a Caixa: ${up.erro}`;
    }
    if (reg.dados.estado === 'a_ler' || reg.dados.estado === 'nao_reconhecido') {
      const r = await entradaApi.resolver(reg.dados.id, estado, boletoId, lancamentoId);
      if (r.ok === false) return `Feito, mas o arquivo não foi para Resolvidos: ${r.erro}`;
    }
    setLocais((xs) => xs.filter((x) => x.chave !== fonte));
    return null;
  }, [api, clienteId, entradaApi, locais]);

  const resolverSeCompleto = useCallback(async (fonte: string, chaveFeita: string, boletoId: string): Promise<string | null> => {
    if (!ehDoEmail(fonte)) {
      const todosLocal = (fontes.current.get(fonte)?.boletos ?? []).map((b) => `${fonte}#${b.codigo_barras}`);
      const feitosLocal = new Set([...feitos, chaveFeita]);
      return todosLocal.every((c) => feitosLocal.has(c)) ? resolverArrastado(fonte, 'boleto', boletoId, null) : null;
    }
    const todos = (fontes.current.get(fonte)?.boletos ?? []).map((b) => `${fonte}#${b.codigo_barras}`);
    const feitosAgora = new Set([...feitos, chaveFeita]);
    if (!todos.every((c) => feitosAgora.has(c))) return null;
    const r = await entradaApi.resolver(fonte, 'boleto', boletoId, null);
    return r.ok ? null : `O boleto está na caixa, mas a linha do e-mail não foi marcada: ${r.erro}`;
  }, [ehDoEmail, entradaApi, feitos, resolverArrastado]);

  /** Garante o boleto na caixa (entra + sobe o PDF) e devolve o id. */
  const garantirNaCaixa = useCallback(async (l: LinhaDaCaixa): Promise<
    { ok: true; id: string; aviso: string | null; pdf: string | null; separado: boolean } | { ok: false; frase: string }
  > => {
    if (l.boletoGuardadoId) {
      const g = lista?.itens.find((x) => x.boleto.id === l.boletoGuardadoId);
      return { ok: true, id: l.boletoGuardadoId, aviso: null, pdf: g?.boleto.storagePath ?? null, separado: false };
    }
    if (!clienteId || !l.boleto) return { ok: false, frase: 'Escolha o cliente.' };
    const fonte = l.fontes[0];
    const b = fontes.current.get(fonte)?.boletos.find((x) => x.codigo_barras === l.boleto?.codigoBarras);
    if (!b) return { ok: false, frase: 'Leia o arquivo de novo.' };
    /* o arquivo deste boleto ANTES de gravar: não separou = nada entra */
    const doBoleto = await arquivoDoBoleto(fonte, b.codigo_barras);
    if (doBoleto.ok === false) return { ok: false, frase: doBoleto.frase };
    const r = await api.entrar(clienteId, leituraParaOBanco(fonte, b), false);
    if (r.ok === false) return { ok: false, frase: r.erro };
    const resp: RespostaDeEntrar = r.dados;
    if (resp.ok === false) return { ok: false, frase: resp.frase };
    if (!resp.id) return { ok: false, frase: 'O banco não devolveu o boleto. Nada foi ligado.' };
    let aviso: string | null = doBoleto.aviso;
    let pdf: string | null = null;
    if (resp.storagePath) {
      const arq = doBoleto.arquivo;
      const s = arq ? await api.subirArquivo(resp.storagePath, arq) : null;
      if (!s || s.ok === false) aviso = 'O boleto entrou na caixa, mas o arquivo não subiu.';
      else pdf = resp.storagePath;
    }
    return { ok: true, id: resp.id, aviso, pdf, separado: doBoleto.separado };
  }, [api, clienteId, leituraParaOBanco, arquivoDoBoleto, lista]);

  /** Gabriel 18/11 14:40: o PDF entra nos DOCUMENTOS de cada lançamento ligado (o clipe da lista e a aba Documentos o mostram).
   *  Falhou = a frase diz; nunca desfaz o vínculo (ele já é verdade). */
  const anexarAosLancamentos = useCallback(async (lancamentoIds: readonly string[], doc: DocumentoDaCaixa): Promise<string | null> => {
    if (!clienteId) return null;
    for (const id of lancamentoIds) {
      const r = await api.registrarDocumento(clienteId, id, doc);
      if (r.ok === false) return `Ligado, mas o PDF não entrou nos documentos do lançamento: ${r.erro}`;
    }
    return null;
  }, [api, clienteId]);

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
    const alvos = jaLigado && l.previa?.ok === true ? l.previa.situacao.lancamentos.map((x) => x.id) : lancamentos;
    const semDoc = g.pdf
      ? await anexarAosLancamentos(alvos, { especie: 'boleto', nome: l.arquivoTitulo || 'boleto', url: g.pdf, tamanhoBytes: null })
      : null;
    /* BOLETO-SEPARAR-01: separado o 1º boleto do arquivo, o original do e-mail fica no lançamento dele (depois do boleto: um PDF de
       boleto por lançamento, o original é 'outro') */
    const f = fontes.current.get(l.fontes[0]);
    const original = entradas?.find((e) => e.id === l.fontes[0])?.storagePath ?? null;
    const semOriginal = g.separado && original && f && f.boletos[0]?.codigo_barras === l.boleto?.codigoBarras && alvos[0]
      ? await anexarAosLancamentos([alvos[0]], { especie: 'outro', nome: `PDF original (${f.boletos.length} boletos)`, url: original, tamanhoBytes: null })
      : null;
    const m = await resolverSeCompleto(l.fontes[0], l.chave, g.id);
    await recarregar();
    return m ?? semDoc ?? semOriginal ?? g.aviso;
  }), [fazer, garantirNaCaixa, parcela, anexarAosLancamentos, entradas, resolverSeCompleto, recarregar]);

  const guardar = useCallback((l: LinhaDaCaixa) => fazer(l.chave, async () => {
    /* CAIXA-GUARDAR-01: o boleto tirado da caixa volta a ser o MESMO (`novo`) — o índice (cliente, código de barras) nunca duplica */
    if (l.boletoGuardadoId && l.previa?.ok === true && l.previa.jaExiste && l.previa.boleto.situacao === 'descartado') {
      const r = await api.marcar(l.boletoGuardadoId, 'novo', null);
      if (r.ok === false) return r.erro;
    }
    const g = await garantirNaCaixa(l);
    if (g.ok === false) return g.frase;
    marcarFeito(l.chave);
    const m = await resolverSeCompleto(l.fontes[0], l.chave, g.id);
    await recarregar();
    return m ?? g.aviso;
  }), [fazer, api, garantirNaCaixa, resolverSeCompleto, recarregar]);

  /** Vincular a nota que já está num lançamento: as entradas (XML e PDF) viram 'nota' com o lançamento. */
  const vincularNota = useCallback((l: LinhaDaCaixa) => fazer(l.chave, async () => {
    const lanc = l.notaNoSistema?.lancamentoId ?? null;
    for (const f of l.fontes.filter(ehDoEmail)) {
      const r = await entradaApi.resolver(f, 'nota', null, lanc);
      if (r.ok === false) return r.erro;
    }
    for (const f of l.fontes.filter((x) => !ehDoEmail(x))) {
      const m = await resolverArrastado(f, 'nota', null, lanc);
      if (m) return m;
    }
    marcarFeito(l.chave);
    /* os arquivos da nota do e-mail (o DANFE em PDF E o XML) entram nos documentos do lançamento achado pela chave; a mesma NF no
       mesmo tipo de arquivo, já na compra, o gravador recusa = "já estava" (P167) — nunca duplica */
    let semDoc: string | null = null;
    if (lanc && l.nota) {
      for (const e of (entradas ?? []).filter((x) => l.fontes.includes(x.id) && (x.tipo === 'pdf' || x.tipo === 'xml') && x.storagePath)) {
        semDoc = semDoc ?? await anexarAosLancamentos([lanc], {
          especie: 'nf', nome: e.arquivoNome ?? (e.tipo === 'xml' ? 'nota.xml' : 'nota.pdf'), url: e.storagePath ?? '', tamanhoBytes: e.tamanhoBytes,
          numero: numeroDaNotaComPontos(l.nota.numero), chaveAcesso: l.nota.chave, tipo: e.tipo === 'xml' ? 'application/xml' : 'application/pdf',
        });
      }
    }
    await recarregar();
    return semDoc;
  }), [fazer, ehDoEmail, entradaApi, entradas, anexarAosLancamentos, recarregar, resolverArrastado]);

  /** FOLHA-NA-CAIXA-01 — o recibo do contador APLICADO pela prévia: a linha fica feita; a do e-mail vira 'folha' (resolvida). */
  const folhaFeita = useCallback((l: LinhaDaCaixa) => fazer(l.chave, async () => {
    marcarFeito(l.chave);
    for (const f of l.fontes.filter(ehDoEmail)) {
      const r = await entradaApi.resolver(f, 'folha', null, null);
      if (r.ok === false) return `Aplicado, mas a linha do e-mail não foi marcada: ${r.erro}`;
    }
    for (const f of l.fontes.filter((x) => !ehDoEmail(x))) {
      const m = await resolverArrastado(f, 'folha', null, null);
      if (m) return m;
    }
    await recarregar();
    return null;
  }), [fazer, ehDoEmail, entradaApi, recarregar, resolverArrastado]);

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

  /** A entrada que volta para A resolver é lida e consultada DE NOVO (a prévia antiga diria o boleto de antes do gesto). */
  const esquecerEntrada = useCallback((entradaId: string) => {
    pedidos.current.delete(`ler:${entradaId}`);
    for (const p of [...pedidos.current]) if (p.startsWith(`bol:${entradaId}#`)) pedidos.current.delete(p);
    setBoletos((x) => Object.fromEntries(Object.entries(x).filter(([k]) => !k.startsWith(`${entradaId}#`))));
    setFeitos((x) => new Set([...x].filter((c) => !c.includes(entradaId))));
  }, []);

  /** Voltar para "A resolver": a entrada ignorada ou resolvida (o Desfazer), ou o boleto descartado (volta a "novo"). */
  const voltar = useCallback((alvo: { entradaId: string } | { boletoId: string }) => fazer('voltar', async () => {
    const r = 'entradaId' in alvo ? await entradaApi.voltar(alvo.entradaId) : await api.marcar(alvo.boletoId, 'novo', null);
    if (r.ok === false) return r.erro;
    if ('entradaId' in alvo) {
      esquecerEntrada(alvo.entradaId);
    } else {
      pedidos.current.delete(`bol:guardado:${alvo.boletoId}`);
      setFeitos((x) => new Set([...x].filter((c) => c !== `guardado:${alvo.boletoId}`)));
    }
    await recarregar();
    return null;
  }), [fazer, entradaApi, api, recarregar, esquecerEntrada]);

  /** CAIXA-GUARDAR-01 — Desfazer o GUARDADO (A resolver ou Resolvidos): o boleto sai da caixa com o motivo e o(s) e-mail(s) dele voltam. */
  const desfazerGuardado = useCallback((boletoId: string) => fazer('desfazer', async () => {
    const r = await api.marcar(boletoId, 'descartado', MOTIVO_DO_DESFEITO);
    if (r.ok === false) return r.erro;
    pedidos.current.delete(`bol:guardado:${boletoId}`);
    setFeitos((x) => new Set([...x].filter((c) => c !== `guardado:${boletoId}`)));
    for (const e of (entradas ?? []).filter((x) => x.boletoId === boletoId && x.estado === 'boleto')) {
      const v = await entradaApi.voltar(e.id);
      if (v.ok === false) { await recarregar(); return `O boleto saiu da caixa, mas o e-mail não voltou para A resolver: ${v.erro}`; }
      esquecerEntrada(e.id);
    }
    await recarregar();
    return null;
  }), [fazer, api, entradas, entradaApi, recarregar, esquecerEntrada]);

  return {
    lista, entradas, detalhes, erro, grupos, resolvidos, ignorados, descartados, sugestoes, ocupado,
    receber, arquivoDe, nomeDaFonte, tentarSenha, vincularBoleto, guardar, vincularNota, folhaFeita, ignorar, voltar, desfazerGuardado, recarregar,
  };
}
