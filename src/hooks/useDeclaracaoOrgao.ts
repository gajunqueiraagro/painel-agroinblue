/**
 * REBANHO-ORGAO-01 (F3) — o estado da tela "Declaração ao órgão" (mock aprovado 23/11 13:38). Ordem de carga:
 *   fazendas com gado (+ UF) e o calendário → a etapa da vez da UF → as declarações desta etapa (os PDFs guardados como LINHAS, relidos
 *   pelo MESMO leitor) e a última declarada → "desde" (`desdeDaDeclaracao`) → os fatos do banco → a CONTA (`propostaDaDeclaracao`, F2).
 * ⚠ NADA SE ESTIMA: sem comprovante a coluna IAGRO é "—"; sem "desde" a tela pede o extrato; a fazenda sem UF fica fora e a tela diz.
 * ⚠ NADA GRAVA SEM O GESTO: soltar o PDF (lido, guardado no bucket e na declaração), editar uma célula (ao sair do campo), marcar como
 *   declarado, desfazer (motivo) e gravar o nº das eGTAs (com a prévia). Estado de dado só depois que a gravação passa.
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
}

const ufMaisComum = (fs: readonly FazendaDoCliente[]): string | null => {
  const n = new Map<string, number>();
  for (const f of fs) if (f.uf) n.set(f.uf, (n.get(f.uf) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
};

export function useDeclaracaoOrgao(opcoes: { clienteId: string | null; hoje: string; api?: DeclaracaoApi; lerPdf: LerLinhasDoPdf }) {
  const { clienteId, hoje, lerPdf } = opcoes;
  const api = opcoes.api ?? declaracaoApiDoBanco;
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  const [fazendas, setFazendas] = useState<FazendaDoCliente[] | null>(null);
  const [etapas, setEtapas] = useState<EtapaDoOrgao[]>([]);
  const [declaracoes, setDeclaracoes] = useState<DeclaracaoGravada[]>([]);
  const [ultimaDeclarada, setUltimaDeclarada] = useState<string | null>(null);
  const [fatos, setFatos] = useState<FatosDoBanco | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const uf = useMemo(() => (fazendas ? ufMaisComum(fazendas) : null), [fazendas]);
  const etapa = useMemo(() => etapaDaVez(etapas, uf, 'declaracao', hoje), [etapas, uf, hoje]);
  const etapaBrucelose = useMemo(() => etapaDaVez(etapas, uf, 'brucelose', hoje), [etapas, uf, hoje]);
  const daUf = useMemo(() => (fazendas ?? []).filter((f) => f.uf === uf), [fazendas, uf]);
  const foraDaUf = useMemo(() => (fazendas ?? []).filter((f) => f.uf !== uf), [fazendas, uf]);

  /* 1. as fazendas e o calendário */
  useEffect(() => {
    if (!clienteId) return;
    setFazendas(null); setFatos(null); setErro(null);
    void Promise.all([api.fazendas(clienteId), api.etapas()]).then(([f, e]) => {
      if (!vivo.current) return;
      if (f.ok === false) { setErro(f.erro); return; }
      if (e.ok === false) { setErro(e.erro); return; }
      setFazendas(f.dados); setEtapas(etapasDoBanco(e.dados));
    });
  }, [api, clienteId]);

  /* 2. as declarações desta etapa */
  const recarregarDeclaracoes = useCallback(async () => {
    if (!clienteId || !etapa) return;
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

  /* 3. os fatos */
  const recarregarFatos = useCallback(async () => {
    if (!clienteId || !etapa || !desde.data) { setFatos(null); return; }
    const r = await api.fatos(clienteId, desde.data, etapa.fim);
    if (!vivo.current) return;
    if (r.ok === false) { setErro(r.erro); return; }
    const f = fatosDaRpc(r.dados);
    if (!f) { setErro('O banco devolveu os fatos num formato que eu não conheço.'); return; }
    setFatos(f);
  }, [api, clienteId, etapa, desde.data]);
  useEffect(() => { void recarregarFatos(); }, [recarregarFatos]);

  /* 4. a conta (a da F2, uma só) */
  const porFazenda: DaFazenda[] = useMemo(() => {
    const base = daUf.map((fz) => {
      const d = declaracoes.find((x) => x.fazendaId === fz.id) ?? null;
      const l = lidos[fz.id] ?? { comprovante: null, extrato: null };
      return { fazenda: fz, declaracao: d, comprovante: l.comprovante, extrato: l.extrato, editados: editadosDoBanco(d?.editados) };
    });
    if (!fatos || !etapa || !desde.data) {
      return base.map((b) => ({ ...b, proposta: null, casamento: null, explicacoes: [], brucelose: null }));
    }
    const doFatos = { ...fatos, fazendas: fatos.fazendas.filter((f) => daUf.some((d) => d.id === f.id)) };
    const pdfs = Object.fromEntries(base.map((b) => [b.fazenda.id, { iagro: b.comprovante ? bovinosDoComprovante(b.comprovante) : null, extrato: b.extrato }]));
    const editados = Object.fromEntries(base.map((b) => [b.fazenda.id, b.editados]));
    const conta = propostaDaDeclaracao(entradaDaProposta(doFatos, pdfs, editados, etapa.fim, desde.data));
    return base.map((b) => {
      const casamento = b.extrato ? casarEgta(egtasDoExtrato(b.extrato.operacoes), movimentosParaCasar(fatos, b.fazenda.id)) : null;
      return {
        ...b,
        proposta: conta.fazendas.find((p) => p.fazendaId === b.fazenda.id) ?? null,
        casamento,
        explicacoes: [...conta.explicacoes.filter((x) => x.fazendaId === b.fazenda.id),
          ...(casamento ? explicacoesDeGta(b.fazenda.id, casamento.movimentoSemEgta) : [])],
        brucelose: etapaBrucelose ? bruceloseDaFazenda(fatos, b.fazenda.id, prazoDaEtapa(etapaBrucelose), b.extrato, b.comprovante?.vacinaBrucelose ?? null) : null,
      };
    });
  }, [daUf, declaracoes, lidos, fatos, etapa, etapaBrucelose, desde.data]);

  /* ── os gestos ── */
  const fazer = useCallback(async (chave: string, f: () => Promise<string | null>): Promise<string | null> => {
    if (ocupado) return 'Espere o gesto anterior terminar.';
    setOcupado(chave);
    let frase: string | null;
    try { frase = await f(); } catch (e) { console.error('[declaração ao órgão] gesto', e); frase = 'Não consegui falar com o banco. Tente de novo.'; }
    if (vivo.current) setOcupado(null);
    return frase;
  }, [ocupado]);

  /** Soltar o PDF do órgão numa fazenda: lê (comprovante OU extrato), sobe e grava as linhas. Não reconheceu = nada grava. */
  const soltarPdf = useCallback((fazendaId: string, arquivo: File) => fazer(`pdf:${fazendaId}`, async () => {
    if (!clienteId || !etapa) return 'Escolha o cliente.';
    const linhas = await lerPdf(arquivo);
    const c = lerComprovanteIagro(linhas); const x = c.ok === true ? null : lerExtratoIagro(linhas);
    const tipo = c.ok === true ? 'saldo' : x && x.ok === true ? 'extrato' : null;
    if (!tipo) {
      const frase = c.ok === false && c.motivo === 'nao_fecha' ? c.frase : x && x.ok === false && x.motivo === 'nao_fecha' ? x.frase
        : 'Não é um Comprovante de Saldo nem um Extrato da IAGRO que eu conheça. Nada foi gravado.';
      return frase;
    }
    const caminho = `${clienteId}/orgao/${etapa.id}/${fazendaId}/${tipo}.pdf`;
    const s = await api.subirPdf(caminho, arquivo);
    if (s.ok === false) return s.erro;
    const d = declaracoes.find((y) => y.fazendaId === fazendaId);
    const g = await api.gravar(fazendaId, etapa.id, { [tipo]: { linhas, lido_em: new Date().toISOString() }, [`${tipo}_arquivo`]: caminho }, d?.versao ?? null);
    if (g.ok === false) return g.erro;
    await recarregarDeclaracoes();
    return null;
  }), [fazer, clienteId, etapa, lerPdf, api, declaracoes, recarregarDeclaracoes]);

  /** Uma célula editada (null = volta ao sugerido, o ↺). */
  const editar = useCallback((fazendaId: string, celula: CelulaEditavel, valor: number | null) => fazer(`ed:${fazendaId}`, async () => {
    if (!etapa) return null;
    const d = declaracoes.find((y) => y.fazendaId === fazendaId);
    const novo = comEditado(editadosDoBanco(d?.editados), celula, valor);
    const g = await api.gravar(fazendaId, etapa.id, { editados: novo }, d?.versao ?? null);
    if (g.ok === false) return g.erro;
    await recarregarDeclaracoes();
    return null;
  }), [fazer, etapa, declaracoes, api, recarregarDeclaracoes]);

  const declarar = useCallback((fazendaId: string) => fazer(`decl:${fazendaId}`, async () => {
    const f = porFazenda.find((x) => x.fazenda.id === fazendaId);
    if (!f?.declaracao || !f.proposta || !f.comprovante || !etapa || !desde.data) return 'Leia o comprovante do órgão antes de declarar.';
    if (f.proposta.recusas.length) return 'Há faixa negativa: corrija antes de declarar.';
    const r = await api.declarar(f.declaracao.id, { referencia: etapa.fim, desde: desde.data, linhas: f.proposta.linhas, sistema: f.proposta.sistema },
      null, f.declaracao.versao);
    if (r.ok === false) return r.erro;
    await recarregarDeclaracoes();
    return null;
  }), [fazer, porFazenda, etapa, desde.data, api, recarregarDeclaracoes]);

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

  return {
    carregando: !fazendas, erro, uf, etapa, etapaBrucelose, desde, porFazenda, foraDaUf, ocupado,
    soltarPdf, editar, declarar, desfazer, gravarEgtas,
  };
}
