/**
 * REBANHO-ORGAO-01 (F3 v3, mock aprovado 27/11) — o estado da tela "Declaração ao órgão". Ordem de carga:
 *   fazendas (todas menos a administrativa, + UF) e o calendário → a ETAPA ESCOLHIDA (Ano + mês; padrão = a da vez da UF) → as declarações
 *   dela (os PDFs guardados como LINHAS, relidos pelo MESMO leitor) e a última declarada → "desde" → os fatos do banco até o fim do mês →
 *   por fazenda, os fatos NA DATA DO SALDO do órgão (`fatosNaData`: o sistema na mesma data) → a CONTA (`propostaDaDeclaracao`, F2).
 * ⚠ NADA SE ESTIMA: sem comprovante a coluna do órgão é "—"; sem "desde" a tela pede o extrato; a fazenda sem UF fica fora e a tela diz.
 * ⚠ SÓ LEITURA: etapa encerrada (prazo passou) ou fazenda declarada — os números são os CONGELADOS na declaração (`propostaCongelada`).
 * ⚠ NADA GRAVA SEM O GESTO: soltar o PDF, editar uma célula (ao sair), marcar como declarado (com o comprovante, se houver), desfazer
 *   (motivo) e gravar o nº das eGTAs (com a prévia). Estado de dado só depois que a gravação passa. Nada é declarado pelo sistema.
 * ⚠ LEITURA QUE TERMINA DEPOIS DE A TELA SAIR não escreve (`vivo`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { declaracaoApiDoBanco, type DeclaracaoApi, type DeclaracaoGravada, type FazendaDoCliente } from '@/lib/rebanho/orgao/declaracaoApi';
import { lerComprovanteIagro, bovinosDoComprovante, type ComprovanteLido } from '@/lib/rebanho/orgao/lerComprovanteIagro';
import { lerExtratoIagro, type ExtratoLido } from '@/lib/rebanho/orgao/lerExtratoIagro';
import { casarEgta, egtasDoExtrato, type ResultadoDoCasamento } from '@/lib/rebanho/orgao/casarEgta';
import { explicacoesDeGta, propostaDaDeclaracao, type Explicacao, type PropostaDaFazenda } from '@/lib/rebanho/orgao/propostaDaDeclaracao';
import {
  bruceloseDaFazenda, comEditado, desdeDaDeclaracao, editadosDoBanco, entradaDaProposta, etapaDaVez, etapasDoBanco, fatosDaRpc,
  linhasGuardadas, movimentosParaCasar, prazoDaEtapa, type Brucelose, type CelulaEditavel, type EditadosDaFazenda, type EtapaDoOrgao,
  type FatosDoBanco,
} from '@/lib/rebanho/orgao/montarDeclaracao';
import { depoisDaData, fatosNaData, fimDoMes, rebanhoNaData } from '@/lib/rebanho/orgao/sistemaNaData';
import {
  anoDaEtapa, anosDasEtapas, etapaDe, etapaEncerrada, etapasDeDeclaracao, mesDaEtapa, mesesDasEtapas, propostaCongelada, statusDaFazenda,
  type StatusDaFazenda,
} from '@/lib/rebanho/orgao/etapaDaTela';

/** Lê o PDF em linhas (o `extrairLinhasPdf`; injetável para a bancada e os testes). */
export type LerLinhasDoPdf = (arquivo: File) => Promise<string[]>;

export interface DaFazenda {
  fazenda: FazendaDoCliente;
  declaracao: DeclaracaoGravada | null;
  comprovante: ComprovanteLido | null;
  extrato: ExtratoLido | null;
  editados: EditadosDaFazenda;
  proposta: PropostaDaFazenda | null;
  casamento: ResultadoDoCasamento | null;
  explicacoes: Explicacao[];
  brucelose: Brucelose | null;
  /** F3 v3 */
  status: StatusDaFazenda;
  /** só leitura: a etapa encerrou ou a fazenda já foi declarada (os números são os congelados) */
  soLeitura: boolean;
  /** 'AAAA-MM-DD' — a data do saldo do órgão; o sistema é comparado NESTA data (sem comprovante: hoje, dentro da etapa) */
  dataDosNumeros: string;
  /** lançamentos da declaração DEPOIS da data do saldo (não estão no saldo do órgão: baixe o comprovante de hoje) */
  depois: { lancamentos: number; cab: number };
}

const ufMaisComum = (fs: readonly FazendaDoCliente[]): string | null => {
  const n = new Map<string, number>();
  for (const f of fs) if (f.uf) n.set(f.uf, (n.get(f.uf) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
};
const soma = (xs: readonly number[]) => xs.reduce((a, x) => a + x, 0);

export function useDeclaracaoOrgao(opcoes: { clienteId: string | null; hoje: string; api?: DeclaracaoApi; lerPdf: LerLinhasDoPdf }) {
  const { clienteId, hoje, lerPdf } = opcoes;
  const api = opcoes.api ?? declaracaoApiDoBanco;
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  const [fazendas, setFazendas] = useState<FazendaDoCliente[] | null>(null);
  const [etapas, setEtapas] = useState<EtapaDoOrgao[]>([]);
  const [escolha, setEscolha] = useState<{ ano: string; mes: string } | null>(null);
  const [declaracoes, setDeclaracoes] = useState<DeclaracaoGravada[]>([]);
  const [ultimaDeclarada, setUltimaDeclarada] = useState<string | null>(null);
  const [fatos, setFatos] = useState<FatosDoBanco | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const uf = useMemo(() => (fazendas ? ufMaisComum(fazendas) : null), [fazendas]);
  const daUfEtapas = useMemo(() => etapasDeDeclaracao(etapas, uf), [etapas, uf]);
  const daVez = useMemo(() => etapaDaVez(etapas, uf, 'declaracao', hoje), [etapas, uf, hoje]);
  /* a etapa da tela: a escolhida (Ano + mês) ou, até alguém escolher, a da vez */
  const ano = escolha?.ano ?? (daVez ? anoDaEtapa(daVez) : anosDasEtapas(daUfEtapas)[0] ?? null);
  const mes = escolha?.mes ?? (daVez ? mesDaEtapa(daVez) : mesesDasEtapas(daUfEtapas)[0] ?? null);
  const etapa = useMemo(() => (ano && mes ? etapaDe(daUfEtapas, ano, mes) : null), [daUfEtapas, ano, mes]);
  const encerrada = !!etapa && etapaEncerrada(etapa, hoje);
  const etapaBrucelose = useMemo(() => etapaDaVez(etapas, uf, 'brucelose', etapa && etapa.fim < hoje ? etapa.fim : hoje), [etapas, uf, etapa, hoje]);
  const daUf = useMemo(() => (fazendas ?? []).filter((f) => f.uf === uf), [fazendas, uf]);
  const foraDaUf = useMemo(() => (fazendas ?? []).filter((f) => f.uf !== uf), [fazendas, uf]);

  /* 1. as fazendas e o calendário */
  useEffect(() => {
    if (!clienteId) return;
    setFazendas(null); setFatos(null); setErro(null); setEscolha(null);
    void Promise.all([api.fazendas(clienteId), api.etapas()]).then(([f, e]) => {
      if (!vivo.current) return;
      if (f.ok === false) { setErro(f.erro); return; }
      if (e.ok === false) { setErro(e.erro); return; }
      setFazendas(f.dados); setEtapas(etapasDoBanco(e.dados));
    });
  }, [api, clienteId]);

  /* 2. as declarações da etapa */
  const recarregarDeclaracoes = useCallback(async () => {
    if (!clienteId || !etapa) { setDeclaracoes([]); return; }
    const r = await api.declaracoes(clienteId, etapa.id);
    if (!vivo.current) return;
    if (r.ok === false) { setErro(r.erro); return; }
    setDeclaracoes(r.dados.desta); setUltimaDeclarada(r.dados.ultimaDeclarada);
  }, [api, clienteId, etapa]);
  useEffect(() => { void recarregarDeclaracoes(); }, [recarregarDeclaracoes]);

  /* os PDFs guardados, relidos pelo mesmo leitor */
  const lidos = useMemo(() => Object.fromEntries(declaracoes.map((d) => {
    const ls = linhasGuardadas(d.saldo); const le = linhasGuardadas(d.extrato);
    const c = ls ? lerComprovanteIagro(ls) : null; const x = le ? lerExtratoIagro(le) : null;
    return [d.fazendaId, { comprovante: c && c.ok === true ? c.comprovante : null, extrato: x && x.ok === true ? x.extrato : null }];
  })), [declaracoes]);

  const desde = useMemo(() => desdeDaDeclaracao(ultimaDeclarada, Object.values(lidos).map((l) => l.extrato)), [ultimaDeclarada, lidos]);
  /* a data dos números sem comprovante: hoje, dentro da etapa */
  const dataPadrao = etapa ? (hoje < etapa.fim ? (hoje > etapa.inicio ? hoje : etapa.inicio) : etapa.fim) : hoje;

  /* 3. os fatos até o fim do mês da data mais tardia (o cache é por mês; `fatosNaData` volta até a data de cada fazenda) */
  const ateDosFatos = useMemo(() => {
    const datas = [dataPadrao, ...Object.values(lidos).flatMap((l) => (l.comprovante ? [l.comprovante.saldoEm.slice(0, 10)] : []))].sort();
    return fimDoMes(datas[datas.length - 1].slice(0, 7));
  }, [dataPadrao, lidos]);
  const recarregarFatos = useCallback(async () => {
    if (!clienteId || !etapa || encerrada || !desde.data || desde.data >= ateDosFatos) { setFatos(null); return; }
    const r = await api.fatos(clienteId, desde.data, ateDosFatos);
    if (!vivo.current) return;
    if (r.ok === false) { setErro(r.erro); return; }
    const f = fatosDaRpc(r.dados);
    if (!f) { setErro('O banco devolveu os fatos num formato que eu não conheço.'); return; }
    setFatos(f);
  }, [api, clienteId, etapa, encerrada, desde.data, ateDosFatos]);
  useEffect(() => { void recarregarFatos(); }, [recarregarFatos]);

  /* 4. a conta, por fazenda, na data do saldo dela (a da F2, uma só) */
  const porFazenda: DaFazenda[] = useMemo(() => daUf.map((fz): DaFazenda => {
    const d = declaracoes.find((x) => x.fazendaId === fz.id) ?? null;
    const l = lidos[fz.id] ?? { comprovante: null, extrato: null };
    const editados = editadosDoBanco(d?.editados);
    const declarada = d?.status === 'declarada';
    const dataDosNumeros = l.comprovante ? l.comprovante.saldoEm.slice(0, 10) : dataPadrao;
    const iagro = l.comprovante ? bovinosDoComprovante(l.comprovante) : null;
    const noComprovante = iagro ? soma([...iagro.F, ...iagro.M]) : null;
    const noSistema = fatos ? soma(rebanhoNaData(fatos, fz.id, dataDosNumeros).map((r) => r.cab)) : fz.temPecuaria ? 1 : 0;
    const base = {
      fazenda: fz, declaracao: d, comprovante: l.comprovante, extrato: l.extrato, editados,
      status: statusDaFazenda({ declarada, bovinosNoComprovante: noComprovante, bovinosNoSistema: noSistema }),
      soLeitura: encerrada || declarada, dataDosNumeros,
      depois: fatos && l.comprovante ? depoisDaData(fatos, fz.id, dataDosNumeros) : { lancamentos: 0, cab: 0 },
    };
    /* declarada: os números CONGELADOS (o que foi declarado), nunca a conta de hoje */
    if (declarada) {
      const c = propostaCongelada(d?.proposta);
      return { ...base, proposta: c ? { fazendaId: fz.id, linhas: c.linhas, sistema: c.sistema, recusas: [], avisos: [] } : null,
        casamento: null, explicacoes: [], brucelose: null };
    }
    if (encerrada || !fatos || !etapa || !desde.data) return { ...base, proposta: null, casamento: null, explicacoes: [], brucelose: null };
    const naData = fatosNaData(fatos, dataDosNumeros);
    const soEsta = { ...naData, fazendas: naData.fazendas.filter((f) => f.id === fz.id) };
    const conta = soEsta.fazendas.length
      ? propostaDaDeclaracao(entradaDaProposta(soEsta, { [fz.id]: { iagro, extrato: l.extrato } }, { [fz.id]: editados }, etapa.fim, desde.data))
      : null;
    const casamento = l.extrato ? casarEgta(egtasDoExtrato(l.extrato.operacoes), movimentosParaCasar(fatos, fz.id)) : null;
    return {
      ...base,
      proposta: conta?.fazendas.find((p) => p.fazendaId === fz.id) ?? null,
      casamento,
      explicacoes: [...(conta?.explicacoes ?? []).filter((x) => x.fazendaId === fz.id),
        ...(casamento ? explicacoesDeGta(fz.id, casamento.movimentoSemEgta, casamento.egtaSemMovimento) : [])],
      brucelose: etapaBrucelose ? bruceloseDaFazenda(fatos, fz.id, prazoDaEtapa(etapaBrucelose), l.extrato, l.comprovante?.vacinaBrucelose ?? null) : null,
    };
  }), [daUf, declaracoes, lidos, fatos, etapa, etapaBrucelose, desde.data, encerrada, dataPadrao]);

  /* ── os gestos ── */
  const fazer = useCallback(async (chave: string, f: () => Promise<string | null>): Promise<string | null> => {
    if (ocupado) return 'Espere o gesto anterior terminar.';
    setOcupado(chave);
    let frase: string | null;
    try { frase = await f(); } catch (e) { console.error('[declaração ao órgão] gesto', e); frase = 'Não consegui falar com o banco. Tente de novo.'; }
    if (vivo.current) setOcupado(null);
    return frase;
  }, [ocupado]);

  const escolherEtapa = useCallback((novoAno: string, novoMes: string) => { setEscolha({ ano: novoAno, mes: novoMes }); setFatos(null); }, []);

  /** Soltar o PDF do órgão numa fazenda: lê (comprovante OU extrato), sobe e grava as linhas. Não reconheceu = nada grava. */
  const soltarPdf = useCallback((fazendaId: string, arquivo: File) => fazer(`pdf:${fazendaId}`, async () => {
    if (!clienteId || !etapa) return 'Escolha o cliente e a etapa.';
    if (encerrada) return 'Etapa encerrada: só leitura.';
    const linhas = await lerPdf(arquivo);
    const c = lerComprovanteIagro(linhas); const x = c.ok === true ? null : lerExtratoIagro(linhas);
    const tipo = c.ok === true ? 'saldo' : x && x.ok === true ? 'extrato' : null;
    if (!tipo) {
      return c.ok === false && c.motivo === 'nao_fecha' ? c.frase : x && x.ok === false && x.motivo === 'nao_fecha' ? x.frase
        : 'Não é um Comprovante de Saldo nem um Extrato da IAGRO que eu conheça. Nada foi gravado.';
    }
    const caminho = `${clienteId}/orgao/${etapa.id}/${fazendaId}/${tipo}.pdf`;
    const s = await api.subirPdf(caminho, arquivo);
    if (s.ok === false) return s.erro;
    const d = declaracoes.find((y) => y.fazendaId === fazendaId);
    const g = await api.gravar(fazendaId, etapa.id, { [tipo]: { linhas, lido_em: new Date().toISOString() }, [`${tipo}_arquivo`]: caminho }, d?.versao ?? null);
    if (g.ok === false) return g.erro;
    await recarregarDeclaracoes();
    return null;
  }), [fazer, clienteId, etapa, encerrada, lerPdf, api, declaracoes, recarregarDeclaracoes]);

  /** Uma célula editada (null = volta ao sugerido, o ↺). */
  const editar = useCallback((fazendaId: string, celula: CelulaEditavel, valor: number | null) => fazer(`ed:${fazendaId}`, async () => {
    if (!etapa || encerrada) return null;
    const d = declaracoes.find((y) => y.fazendaId === fazendaId);
    const novo = comEditado(editadosDoBanco(d?.editados), celula, valor);
    const g = await api.gravar(fazendaId, etapa.id, { editados: novo }, d?.versao ?? null);
    if (g.ok === false) return g.erro;
    await recarregarDeclaracoes();
    return null;
  }), [fazer, etapa, encerrada, declaracoes, api, recarregarDeclaracoes]);

  /** Marcar como declarado (D4: discreto, depois do relatório): congela a conta e guarda o comprovante da declaração, se vier. */
  const declarar = useCallback((fazendaId: string, comprovante: File | null) => fazer(`decl:${fazendaId}`, async () => {
    const f = porFazenda.find((x) => x.fazenda.id === fazendaId);
    if (!clienteId || !f?.declaracao || !f.proposta || !f.comprovante || !etapa || !desde.data) return 'Leia o comprovante do órgão antes de marcar.';
    if (f.proposta.recusas.length) return 'Há faixa negativa: corrija antes de marcar.';
    let caminho: string | null = null;
    if (comprovante) {
      caminho = `${clienteId}/orgao/${etapa.id}/${fazendaId}/comprovante.pdf`;
      const s = await api.subirPdf(caminho, comprovante);
      if (s.ok === false) return s.erro;
    }
    const r = await api.declarar(f.declaracao.id, { referencia: f.dataDosNumeros, desde: desde.data, linhas: f.proposta.linhas, sistema: f.proposta.sistema },
      caminho, f.declaracao.versao);
    if (r.ok === false) return r.erro;
    await recarregarDeclaracoes();
    return null;
  }), [fazer, porFazenda, clienteId, etapa, desde.data, api, recarregarDeclaracoes]);

  const desfazer = useCallback((fazendaId: string, motivo: string) => fazer(`desf:${fazendaId}`, async () => {
    const d = declaracoes.find((y) => y.fazendaId === fazendaId);
    if (!d) return null;
    if (!motivo.trim()) return 'Escreva o motivo para desfazer.';
    const r = await api.desfazer(d.id, motivo.trim());
    if (r.ok === false) return r.erro;
    await recarregarDeclaracoes();
    return null;
  }), [fazer, declaracoes, api, recarregarDeclaracoes]);

  /** O nº das eGTAs casadas: `simular` = a prévia (nada grava). */
  const gravarEgtas = useCallback((fazendaId: string, simular: boolean) => fazer(`egta:${fazendaId}`, async () => {
    const f = porFazenda.find((x) => x.fazenda.id === fazendaId);
    if (!clienteId || !f?.casamento || !f.extrato) return 'Leia o extrato do órgão antes.';
    const egtas = egtasDoExtrato(f.extrato.operacoes);
    const itens = f.casamento.casados.flatMap((c) => c.documentos.flatMap((doc) => {
      const g = egtas.find((e) => e.documento === doc);
      return g ? [{ numero: doc, data: g.data, sentido: g.sentido, cab: g.cab, lancamento_id: c.movimentoId }] : [];
    }));
    if (!itens.length) return 'Nenhuma eGTA casada para gravar.';
    const r = await api.egtas(clienteId, itens, simular);
    if (r.ok === false) return r.erro;
    const t = `${r.dados.grava} nº(s) ${simular ? 'a gravar' : 'gravado(s)'} · ${r.dados.jaEstava} já estava(m)${r.dados.recusa.length ? ` · ${r.dados.recusa.length} recusado(s): ${r.dados.recusa[0]}` : ''}`;
    if (!simular) await recarregarFatos();
    return t;
  }), [fazer, porFazenda, clienteId, api, recarregarFatos]);

  /** Abre o comprovante guardado (o da declaração; sem ele, o saldo do órgão lido). */
  const abrirComprovante = useCallback(async (fazendaId: string): Promise<string | null> => {
    const d = declaracoes.find((y) => y.fazendaId === fazendaId);
    const caminho = d?.comprovanteArquivo ?? d?.saldoArquivo ?? null;
    if (!caminho) return 'Nenhum comprovante guardado nesta etapa.';
    const r = await api.urlDoArquivo(caminho);
    if (r.ok === false) return r.erro;
    window.open(r.dados, '_blank', 'noopener');
    return null;
  }, [declaracoes, api]);

  return {
    carregando: !fazendas, erro, uf, etapa, etapaBrucelose, encerrada, desde, porFazenda, foraDaUf, ocupado,
    anos: anosDasEtapas(daUfEtapas), meses: mesesDasEtapas(daUfEtapas), ano, mes, escolherEtapa,
    soltarPdf, editar, declarar, desfazer, gravarEgtas, abrirComprovante,
  };
}
