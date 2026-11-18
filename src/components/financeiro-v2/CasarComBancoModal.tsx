/**
 * CASAR COM O BANCO — PR-ESPELHO-03b.
 *
 * ⚠ O RESUMO É DA RPC, NUNCA DO FRONT. Os três números (no extrato, soma, diferença) vêm do
 * retorno de `fn_espelho_casar` a cada mudança. Somar aqui daria uma segunda régua: o front
 * arredondaria de um jeito, o servidor de outro, e o operador veria "0,00" num botão que
 * depois recusa. Quem valida é quem grava.
 *
 * ⚠ `soma_nao_bate` NÃO É ERRO — é o estado normal enquanto a conta não fecha. A RPC devolve
 * `ok:false` com os três números, e é justamente esse payload que alimenta o resumo. Tratá-lo
 * como falha encheria a tela de vermelho durante o trabalho inteiro.
 *
 * ⚠ NUNCA RATEIO PROPORCIONAL (regra do Gabriel). A tela não distribui a diferença entre os
 * lançamentos: quem sabe quanto cada um vale é o operador. Ele ajusta um valor, remove um do
 * casamento, ou cria o que falta — gestos explícitos, nenhum palpite.
 * ⚠ E O BANCO PREVALECE (PR-CONC-CASAR-VALOR-BANCO-01): "Usar valor do banco" (um levado) e
 * "absorver a diferença" (vários, numa linha escolhida) põem o valor no CAMPO com um clique. É o
 * mesmo gesto de digitar, só que sem digitar — e a `fn_espelho_casar` grava esse valor no próprio
 * lançamento ao Conciliar (`UPDATE ... SET valor`, com a data do extrato e status realizado): o
 * previsto vira o real. Nada concilia sozinho; o operador ainda clica Conciliar.
 */
import { useConteudoEstavel } from '@/lib/react/conteudoEstavel';
import { TabelaDosLevados } from '@/components/conciliacao/TabelaDosLevados';
import { lerComplementoDasLinhas } from '@/lib/conciliacao/complementoDasLinhas';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fechaAoCentavo, podeCriarPelaDiferenca } from '@/lib/conciliacao/tolerancia';
import { EscolherContaDaTaxa } from '@/components/conciliacao/EscolherContaDaTaxa';
import { fraseDaEscolha, itensComDestino, perguntaNfDaResposta, ROTULO_DO_DESTINO, type EscolhaNf, type PerguntaNf } from '@/lib/conciliacao/destinoDaNf';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNFNumber } from '@/lib/financeiro/documentoHelper';
import { Segmentado } from '@/components/ui/segmentado';
import { CriarLancamentoDaLinha } from '@/components/conciliacao/CriarLancamentoDaLinha';
import type { ModeloDoHistorico } from '@/lib/conciliacao/procurarNoHistorico';
import { ConciliarDiferencaModal } from '@/components/conciliacao/ConciliarDiferencaModal';
import { MOTIVO_CASAR_LABEL } from '@/components/financeiro-v2/EspelhoConciliacaoTab';
import { STATUS_PALETA, STATUS_FILTRO_LABEL } from '@/lib/financeiro/statusFinanceiro';
import { FRASE_LEVE_O_PAR, fraseDoJuroReal, lerRespostaPosPagar, levadosSaoOPar, mapaDaParcelaPos, parcelaPosDosLevados,
  type RespostaPosPagar } from '@/lib/financiamentos/parcelaPosPagar';

const fmtBRL = (v: number | null | undefined) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const corVal = (v: number) => (v < 0 ? 'text-rose-600' : 'text-emerald-600');

export interface ExtratoAlvo {
  extrato_id: string; data: string | null; historico: string | null; valor: number;
}
export interface LevadoInicial {
  lancamento_id: string; descricao: string | null; fornecedor?: string | null; valor_assinado: number;
  /** PR-CONC-SUGESTOES-CASAR-01: a sugestão "nome · valor diferente" abre com o VALOR DO BANCO no campo, e a linha
   *  diz "era R$ X". É o mesmo gesto do "Usar valor do banco", feito pela sugestão; o Conciliar não muda. */
  usarValorDoBanco?: boolean;
  /** PR-CONC-SUGESTOES-CASAR-01: a linha de identificação mostra vencimento e status; ausentes, "—". */
  data_vencimento?: string | null;
  status_transacao?: string | null;
  /** P153b (D3, Gabriel 29/10) — o EM ABERTO de OUTRA conta, levado do "Procurar no histórico": o item vai com `trocar_conta` e a
   *  `fn_espelho_casar` troca a conta para a do extrato NA MESMA TRANSAÇÃO do casar (o casar falhou = nada trocado). `de`/`para` = os nomes. */
  trocarConta?: { de: string | null; para: string | null };
  /** CONC-CRIAR-COM-NOTA-01 (Gabriel 04/11 06:28) — a NF lida no Criar pelo extrato que JÁ ESTÁ lançada: o nº dela na linha do levado.
   *  Com algum levado com o nº, a linha de identificação ganha a coluna NF. */
  numero_documento?: string | null;
}

const PALETA_DO_STATUS: Record<string, { texto: string } | undefined> = {
  previsto: STATUS_PALETA.previsto, programado: STATUS_PALETA.programado, agendado: STATUS_PALETA.agendado,
  realizado: STATUS_PALETA.realizado, conciliado: STATUS_PALETA.conciliado,
};
const vencCurto = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '—');

interface Levado extends LevadoInicial { valorTexto: string; }

/**
 * O SENTIDO DA DIFERENÇA, dito como o operador lê — PR-CONC-CASAR-VALOR-BANCO-01.
 * ⚠ A FRASE ANTIGA ERA INVERTIDA. A RPC devolve `diferenca = soma − no_extrato`, os dois ASSINADOS. Numa
 * saída (extrato −506,51, lançamento −506,84) a diferença é −0,33 e a frase dizia "somam menos" — mas o
 * lançamento é MAIOR que o que o banco pagou. O sentido se mede contra o sinal do extrato: diferença do
 * MESMO sinal que ele = os lançamentos passam do banco ("a mais").
 */
export function sentidoDaDiferenca(diferenca: number, noExtrato: number): 'a_mais' | 'a_menos' | 'confere' {
  if (fechaAoCentavo(diferenca)) return 'confere';
  return diferenca * Math.sign(noExtrato || 1) > 0 ? 'a_mais' : 'a_menos';
}

/**
 * O VALOR DA LINHA QUE ABSORVE A DIFERENÇA INTEIRA — PR-CONC-CASAR-VALOR-BANCO-01. `valorAtual` é o do campo
 * (em módulo, como o campo trabalha) e `sinalDaLinha` o do lançamento (+1 entrada, −1 saída): a contribuição
 * da linha na soma é `sinal × valor`, e tirar dela a diferença deixa a soma igual ao extrato. Devolve `null`
 * quando a linha ficaria zerada ou negativa — aí a ação fica desabilitada com o motivo.
 */
export function valorAbsorvendo(valorAtual: number, sinalDaLinha: number, diferenca: number): number | null {
  const novo = Math.round((valorAtual - diferenca * Math.sign(sinalDaLinha || 1)) * 100) / 100;
  return novo > 0 ? novo : null;
}

/* CONC-CRIAR-COM-NOTA-02 (OK do Edson, ajuste 1): o campo com o milhar (5.250,00); o `valorDe` já tira os pontos */
const paraCampo = (v: number) => Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** O que a última simulação disse. `null` enquanto viaja. */
interface Simulacao { ok: boolean; noExtrato: number; soma: number; diferenca: number; erro: string | null; }

interface Props {
  open: boolean;
  onClose: () => void;
  extrato: ExtratoAlvo | null;
  iniciais: readonly LevadoInicial[];
  nomeConta?: string;
  contaBancariaId: string | null;
  onConciliado: () => void;
  /** FIN-POS-FIXADO-01b: com o cliente, o modal reconhece a parcela de contrato pós-fixado com juros estimado entre os levados e
   *  casa pelo dono (`fn_financiamento_parcela_pos_pagar`), que grava o juro real. Sem ele, o caminho de sempre. */
  clienteId?: string | null;
  /** P153 — o "Criar igual" do "Procurar no histórico": abre o Criar de hoje JÁ com o modelo (fornecedor, subcentro, fazenda,
   *  descrição) assim que a simulação do vazio chega — o lançamento novo entra nos levados e o Conciliar é o de sempre. */
  modelo?: ModeloDoHistorico | null;
}

export function CasarComBancoModal({ open, onClose, extrato: extratoDaProp, iniciais: iniciaisDaProp, nomeConta, contaBancariaId, onConciliado, clienteId,
  modelo: modeloDaProp }: Props) {
  /* CONC-CRIAR-PERDE-DADOS-01 item 2 (Gabriel 08/11) — o "Criar lançamento pela diferença" + salvar voltava com "levados (0)" e a diferença
     cheia: o efeito que monta os levados (`[open, iniciais, extrato]`) rodava de novo quando o dono se repintava com um objeto NOVO e IGUAL
     (a estação relê o mês depois que o lançamento grava e refaz o `extratoDoCasar`), e apagava o lançamento novo e a simulação. Daqui para
     baixo o corpo vê os três por CONTEÚDO: o modal aberto só recomeça quando o dado muda de verdade (outro extrato, outros levados). */
  const extrato = useConteudoEstavel(extratoDaProp);
  const iniciais = useConteudoEstavel(iniciaisDaProp);
  const modelo = useConteudoEstavel(modeloDaProp);
  const [levados, setLevados] = useState<Levado[]>([]);
  /* CONC-CRIAR-COM-NOTA-02 D1 (homologação 14:32: "NF —" nas 5 linhas) — o levado que chega SEM o nº (os marcados pelo "Casar selecionados" e
     os do Procurar no histórico) tem o nº lido pelos ids, a MESMA leitura das Sugestões (`lerComplementoDasLinhas`); o que veio com o nº manda */
  const [nfLida, setNfLida] = useState<ReadonlyMap<string, string>>(new Map());
  const idsSemNf = levados.filter((l) => !l.numero_documento).map((l) => l.lancamento_id).sort().join(',');
  useEffect(() => {
    let vivo = true;
    if (!open || !clienteId || !idsSemNf) { setNfLida(new Map()); return; }
    void lerComplementoDasLinhas(clienteId, idsSemNf.split(',')).then((m) => {
      if (!vivo || !m) return;
      const nf = new Map<string, string>();
      for (const [id, x] of m) if (x.numeroDocumento) nf.set(id, x.numeroDocumento);
      setNfLida(nf);
    });
    return () => { vivo = false; };
  }, [open, clienteId, idsSemNf]);
  const [sim, setSim] = useState<Simulacao | null>(null);
  const [erroRodape, setErroRodape] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [criando, setCriando] = useState(false);
  /* P153 — o modelo abre o Criar UMA vez por abertura, depois da 1ª simulação (o `aoCriado` precisa dela para o que falta) */
  const modeloAberto = useRef<ModeloDoHistorico | null>(null);
  useEffect(() => {
    if (!open) { modeloAberto.current = null; return; }
    if (modelo && sim && modeloAberto.current !== modelo) { modeloAberto.current = modelo; setCriando(true); }
  }, [open, modelo, sim]);
  /* CONC-SEM-TRAVA-01 (tela): diferenca de valor nao trava mais o Conciliar — abre o modal "Conciliar" com as tres saidas */
  const [comDiferenca, setComDiferenca] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* FIN-POS-FIXADO-01b — lancamento (principal ou juros) -> parcela pos com juros estimado, lido do banco ao abrir. */
  const [mapaPos, setMapaPos] = useState<Map<string, string> | null>(null);
  const [respPos, setRespPos] = useState<RespostaPosPagar | null>(null);

  useEffect(() => {
    if (!open || !clienteId) { setMapaPos(null); return; }
    let cancelado = false;
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data: est, error } = await (supabase as any).rpc('fn_juros_estimados_do_cliente', { p_cliente_id: clienteId });
      if (cancelado || error || !Array.isArray(est) || est.length === 0) { if (!cancelado) setMapaPos(null); return; }
      const ids = est.map((e: { parcela_id?: unknown }) => e.parcela_id).filter((x: unknown): x is string => typeof x === 'string');
      const { data: parcelas } = await supabase.from('financiamento_parcelas').select('id, lancamento_id').in('id', ids);
      if (!cancelado) setMapaPos(mapaDaParcelaPos(est, parcelas ?? []));
    })();
    return () => { cancelado = true; };
  }, [open, clienteId]);

  useEffect(() => {
    if (!open) return;
    setLevados(iniciais.map((l) => ({
      ...l, valorTexto: paraCampo(l.usarValorDoBanco && extrato ? extrato.valor : l.valor_assinado),
    })));
    setErroRodape(null);
    setSim(null);
  }, [open, iniciais, extrato]);

  const valorDe = (t: string) => Number(t.replace(/\./g, '').replace(',', '.')) || 0;
  /* CONC-VALOR-CERTO-ACEITA-01 — o lancamento de valor certo que sobe para o valor do extrato so' grava com a confirmacao: o banco
     devolve a PERGUNTA (na simulacao e ao gravar sem ela) e a tela a mostra antes; o "sim" marca o item com `aceitar_valor_extrato`.
     Mudou o que foi levado ou o valor, a confirmacao cai (vale para aquele valor, naquele lancamento). */
  const [pergunta, setPergunta] = useState<{ lancamento_id: string; frase: string } | null>(null);
  const [aceitos, setAceitos] = useState<string[]>([]);
  /* CONC-DESCONCILIAR-EDSON-01 (R2) — a NF nunca muda de valor: com diferença acima de R$ 1,00 o banco devolve a PERGUNTA da NF e o
     operador diz o que é a diferença (juros/multa · desconto com motivo · parcial); a escolha vai no item (`destino`). Mudou o que foi
     levado ou o valor, a escolha cai (vale para aquele valor, naquela NF). */
  const [perguntaNf, setPerguntaNf] = useState<PerguntaNf | null>(null);
  const [escolhas, setEscolhas] = useState<Record<string, EscolhaNf>>({});
  const [motivoAberto, setMotivoAberto] = useState<string | null>(null);
  const [motivoTexto, setMotivoTexto] = useState('');
  const [taxaAberta, setTaxaAberta] = useState<string | null>(null);
  const itensBase = useMemo(
    () => levados.map((l) => ({ lancamento_id: l.lancamento_id, valor: Math.abs(valorDe(l.valorTexto)), ...(l.trocarConta ? { trocar_conta: true } : {}) })),
    [levados],
  );
  useEffect(() => { setAceitos([]); setPergunta(null); setEscolhas({}); setPerguntaNf(null); setMotivoAberto(null); setMotivoTexto(''); setTaxaAberta(null); }, [itensBase]);
  const itens = useMemo(
    () => itensComDestino(itensBase.map((i) => (aceitos.includes(i.lancamento_id) ? { ...i, aceitar_valor_extrato: true } : i)), escolhas),
    [itensBase, aceitos, escolhas],
  );
  const idsLevados = useMemo(() => levados.map((l) => l.lancamento_id), [levados]);
  const parcelaPos = useMemo(() => parcelaPosDosLevados(idsLevados, mapaPos), [idsLevados, mapaPos]);

  const simular = useCallback(async () => {
    if (!extrato) return;
    /* ⚠ LISTA VAZIA NÃO CHAMA A RPC — PR-ESPELHO-05 parte B. Ela devolveria `sem_itens`, que
       é motivo de erro, e o modal ficaria vermelho no exato instante em que o operador ainda
       não fez nada. O resumo com zero levados é aritmética de uma linha: tudo o que o banco
       pagou está em falta, e é isso que habilita "criar pela diferença". */
    if (itens.length === 0) {
      const alvo = Math.abs(extrato.valor);
      setErroRodape(null);
      setSim({ ok: false, noExtrato: alvo, soma: 0, diferenca: -alvo, erro: null });
      return;
    }
    /* ⚠ PARCELA POS-FIXADA (FIN-POS-FIXADO-01b): quem diz o juro real e' o dono, em simulacao; a tela nao soma. O principal e os juros
       da parcela, e nada mais, ou a frase. */
    if (parcelaPos) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data, error } = await (supabase as any).rpc('fn_financiamento_parcela_pos_pagar', {
        p_extrato_id: extrato.extrato_id, p_parcela_id: parcelaPos, p_simular: true,
      });
      const r = error ? null : lerRespostaPosPagar(data);
      if (!r) { setSim(null); setRespPos(null); setErroRodape(error?.message ?? 'Não foi possível simular.'); return; }
      if (!r.ok) { setSim(null); setRespPos(null); setErroRodape(r.frase); return; }
      if (!levadosSaoOPar(idsLevados, r)) { setSim(null); setRespPos(null); setErroRodape(FRASE_LEVE_O_PAR); return; }
      setErroRodape(null); setRespPos(r);
      setSim({ ok: true, noExtrato: Number(r.noExtrato ?? extrato.valor), soma: Number(r.noExtrato ?? extrato.valor), diferenca: 0, erro: null });
      return;
    }
    setRespPos(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_espelho_casar', {
      p_extrato_id: extrato.extrato_id, p_itens: itens, p_simular: true, p_motivo: 'casado_no_espelho',
    });
    if (error) { setSim(null); setErroRodape(error.message); return; }
    const r = (data ?? {}) as { ok?: boolean; motivo?: string; frase?: string; no_extrato?: number; soma?: number; diferenca?: number;
      pergunta?: { lancamento_id: string; frase: string } };
    if (r.ok) {
      setErroRodape(null);
      setPergunta(r.pergunta ?? null);
      setPerguntaNf(perguntaNfDaResposta(data));
      setSim({ ok: true, noExtrato: Number(r.no_extrato ?? 0), soma: Number(r.soma ?? 0), diferenca: 0, erro: null });
      return;
    }
    setPerguntaNf(null);
    if (r.motivo === 'soma_nao_bate') {
      setErroRodape(null);
      setSim({ ok: false, noExtrato: Number(r.no_extrato ?? 0), soma: Number(r.soma ?? 0), diferenca: Number(r.diferenca ?? 0), erro: null });
      return;
    }
    setSim(null);
    setErroRodape(r.frase ?? MOTIVO_CASAR_LABEL[r.motivo ?? ''] ?? r.motivo ?? 'Não foi possível simular.');
  }, [extrato, itens, parcelaPos, idsLevados]);

  /* Debounce de 300ms: digitar um valor não dispara uma chamada por tecla. */
  useEffect(() => {
    if (!open) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void simular(); }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [open, simular]);

  const conciliar = async (lista: typeof itens = itens) => {
    if (!extrato) return;
    setGravando(true); setErroRodape(null);
    if (parcelaPos) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { error: erroPos } = await (supabase as any).rpc('fn_financiamento_parcela_pos_pagar', {
        p_extrato_id: extrato.extrato_id, p_parcela_id: parcelaPos, p_simular: false,
      });
      setGravando(false);
      if (erroPos) { setErroRodape(erroPos.message); return; }
      onClose();
      onConciliado();
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_espelho_casar', {
      p_extrato_id: extrato.extrato_id, p_itens: lista, p_simular: false, p_motivo: 'casado_no_espelho',
    });
    setGravando(false);
    if (error) { setErroRodape(error.message); return; }
    const r = (data ?? {}) as { ok?: boolean; motivo?: string; frase?: string; pergunta?: { lancamento_id: string; frase: string } };
    /* o banco ainda pede confirmacao (outro item maior): mostra a pergunta, nada foi gravado */
    if (r.ok === false && r.motivo === 'confirmar_valor_extrato' && r.pergunta) { setPergunta(r.pergunta); return; }
    /* R2: o banco ainda pede o destino da diferença de uma NF: mostra a pergunta, nada foi gravado */
    const pnf = r.ok === false && r.motivo === 'nf_diferenca' ? perguntaNfDaResposta(data) : null;
    if (pnf) { setPerguntaNf(pnf); return; }
    if (r.ok === false) { setErroRodape(r.frase ?? MOTIVO_CASAR_LABEL[r.motivo ?? ''] ?? r.motivo ?? 'Não foi possível conciliar.'); return; }
    onClose();
    onConciliado();
  };

  if (!extrato) return null;
  const dataCurta = extrato.data ? `${extrato.data.slice(8, 10)}/${extrato.data.slice(5, 7)}` : '—';
  const semItens = levados.length === 0;
  /* R2: com a pergunta da NF aberta, nada grava até o operador dizer o que é a diferença */
  const podeConciliar = !!sim?.ok && !gravando && !semItens && !perguntaNf;
  const escolher = (id: string, e: EscolhaNf) => { setEscolhas((v) => ({ ...v, [id]: e })); setMotivoAberto(null); setMotivoTexto(''); setTaxaAberta(null); };
  const escolhidas = levados.filter((l) => !!escolhas[l.lancamento_id]);
  const podeCriar = podeCriarPelaDiferenca(sim, semItens);
  const sentido = sim && !semItens ? sentidoDaDiferenca(sim.diferenca, sim.noExtrato) : null;
  const unico = levados.length === 1;
  /* E2 — 2+ lançamentos: a tabela (o modal alarga para caber Venc · Descrição · Fornecedor · NF · Status · Valor · Aplicado · Fica) */
  const multi = levados.length >= 2;
  /* no pós-fixado o campo dos juros mostra o juro real que o banco vai gravar (o mesmo do campo do 1:1) */
  const levadosDaTabela = levados.map((l) => ({ ...l, numero_documento: l.numero_documento || nfLida.get(l.lancamento_id) || null }))
    .map((l) => (parcelaPos && respPos?.ok && respPos.juroReal != null && l.lancamento_id === respPos.jurosId
      ? { ...l, valorTexto: paraCampo(respPos.juroReal) } : l));
  /* CONC-CRIAR-COM-NOTA-01 — a coluna NF so' quando algum levado traz o nº (os outros chamadores seguem como sempre) */
  const comNF = levados.some((l) => !!l.numero_documento);
  /* P153b (D3) — algum levado troca de conta ao casar: o botão diz isso (o texto é fixo enquanto o modal está aberto) */
  const trocaConta = levados.some((l) => !!l.trocarConta);
  const valorDoBanco = paraCampo(extrato.valor);
  const poeValor = (id: string, texto: string) =>
    setLevados((v) => v.map((x) => x.lancamento_id === id ? { ...x, valorTexto: texto } : x));
  /* Com a simulação viajando (sim nulo ou erro), "absorver" não tem diferença para absorver. */
  const difAtual = sim && !sim.ok ? sim.diferenca : null;
  /* O modal da diferenca trabalha com o valor GRAVADO de cada lancamento: com um campo editado, o caminho e' o Conciliar exato. */
  const editado = levados.some((l) => valorDe(l.valorTexto) !== Math.abs(l.valor_assinado));
  const podeComDiferenca = !!sim && !sim.ok && !semItens && !gravando && !parcelaPos && !editado;

  return (
    <>
      <Dialog open={open && !criando && !comDiferenca} onOpenChange={(v) => { if (!v) onClose(); }}>
        {/* ⚠ `grid-cols-[minmax(0,1fr)]` — PR-CONC-CASAR-VALOR-BANCO-01. O `DialogContent` da casa é `grid`, e a coluna
            implícita cresce até o conteúdo mínimo: com o botão "Usar valor do banco" a linha pedia 634px num modal de
            560, e o `overflow-hidden` cortava a conta, o resumo e o Conciliar (medido na tela).
            ⚠ E A DESCRIÇÃO NÃO TRUNCA MAIS — PR-CONC-SUGESTOES-CASAR-01 (Gabriel, print 13:42: "Servico Rastreabilidade
            ..." cortado com espaço sobrando). Cada levado ocupa DUAS linhas: a identificação inteira, uma informação por
            coluna (venc · descrição · fornecedor · status), e embaixo o campo e as ações. O que não couber quebra. */}
        <DialogContent className={cn(multi ? 'w-[1040px]' : 'w-[640px]', 'max-w-[95vw] max-h-[90vh] flex flex-col grid-cols-[minmax(0,1fr)] p-0 gap-0 overflow-hidden [&>button.absolute]:hidden text-[11px]')}>
          <div className="flex h-9 shrink-0 items-center justify-between gap-2 bg-primary px-3 text-primary-foreground">
            <span className="text-[12px] font-medium">Casar com o banco</span>
            <div className="flex items-center gap-3">
              {/* Sem `truncate`: cortava "Banco do Br…" num cabeçalho com espaço de sobra (regra da casa: texto não corta com reticência). */}
              <span className="text-[11px] opacity-90 whitespace-nowrap">{[nomeConta, dataCurta].filter(Boolean).join(' · ')}</span>
              <button type="button" onClick={onClose} aria-label="Fechar" className="rounded p-0.5 opacity-80 hover:opacity-100 hover:bg-primary-foreground/10">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2.5">
            {/* CONC-CRIAR-COM-NOTA-02 E2 (homologação 09:48, caso Edson: 5 NFs num PIX) — com 2+ lançamentos, UMA TABELA (uma linha por
                lançamento, o Aplicado na linha, o que Fica, o ✕; o extrato numa faixa em cima; o rodapé aplicado × extrato × diferença). O 1:1 segue
                no desenho do D-h (Extrato × Sistema). O estado, o Conciliar e a pergunta da NF são os mesmos. */}
            {multi ? (<>
              <TabelaDosLevados extrato={extrato} nomeConta={nomeConta} levados={levadosDaTabela}
                onValor={poeValor} onRemover={(id) => setLevados((v) => v.filter((x) => x.lancamento_id !== id))}
                somenteLeitura={() => !!parcelaPos} rotuloDoCampo={(l) => `Valor de ${l.descricao ?? 'lançamento'}`}
                acaoNoCampo={parcelaPos ? undefined : (l) => {
                  /* o "absorver a diferença" de sempre (a diferença inteira nesta linha; as outras não mudam), agora colado ao campo */
                  const novo = difAtual == null ? null : valorAbsorvendo(valorDe(l.valorTexto), l.valor_assinado, difAtual);
                  const motivo = difAtual == null ? 'Confere com o banco: não há diferença para absorver.'
                    : novo == null ? 'Esta linha ficaria zerada ou negativa: escolha outra, ou remova um lançamento.' : null;
                  return (
                    <button type="button" data-testid="absorver-diferenca" disabled={novo == null} aria-label="absorver a diferença"
                      title={motivo ?? `absorver a diferença: esta linha passa a ${paraCampo(novo ?? 0)}; as outras não mudam e a soma fica igual ao banco.`}
                      onClick={() => { if (novo != null) poeValor(l.lancamento_id, paraCampo(novo)); }}
                      className={cn('h-[17px] w-[16px] shrink-0 rounded border text-[9px] leading-none', novo == null ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted')}>⇆</button>
                  );
                }} />
              {levados.filter((l) => !!l.trocarConta).map((l) => (
                <div key={l.lancamento_id} className="rounded border border-amber-400 bg-amber-50 px-1.5 py-[2px] text-[10px] text-amber-800" data-testid="levado-troca-conta">
                  {l.descricao ?? 'Lançamento'} · Conta: <span className="font-semibold">{l.trocarConta?.de ?? 'sem conta'}</span> → <span className="font-semibold">{l.trocarConta?.para ?? 'a do extrato'}</span>
                  {' · '}ao conciliar, passa para a conta do extrato.
                </div>
              ))}
            </>) : (<>
            {/* CONC-CRIAR-COM-NOTA-02 D-h (Gabriel 18/11, caso Azulão) — EXTRATO × SISTEMA em duas colunas de UMA tabela (regra de corte: "…"
                com o inteiro no `title` só em tabela); as linhas casam lado a lado e o VALOR fica na mesma linha, à direita (valor sob valor) */}
            <table className="w-full table-fixed border-separate border-spacing-0 text-[10px]" data-testid="casar-colunas">
              <colgroup><col style={{ width: 62 }} /><col /><col style={{ width: 12 }} /><col style={{ width: 66 }} /><col /></colgroup>
              <thead>
                <tr className="h-[22px] bg-primary text-[10px] font-medium text-primary-foreground">
                  <th colSpan={2} className="px-1 text-left" data-testid="casar-coluna-extrato">Extrato</th>
                  <th />
                  <th colSpan={2} className="px-1 text-left" data-testid="casar-coluna-sistema">Sistema</th>
                </tr>
              </thead>
              <tbody>
                {/* CONC-CRIAR-COM-NOTA-02 (homologação 09:37, Gabriel): o histórico do banco é sempre longo — a largura TODA do modal (~95
                    caracteres a 10px); só passa disso com "…" e o inteiro no `title` */}
                <tr className="h-[20px] bg-muted/60">
                  <td className="truncate px-1 text-muted-foreground">Histórico</td>
                  <td colSpan={4} className="truncate px-1 font-medium" title={extrato.historico ?? undefined} data-testid="casar-historico">{extrato.historico ?? '—'}</td>
                </tr>
                {(semItens ? [null] : levados).flatMap((l, i) => {
                  const st = (l?.status_transacao ?? '').trim().toLowerCase();
                  const n = unico || !l ? '' : ` (${i + 1})`;
                  const primeiro = i === 0;
                  /* homologação 09:37: o histórico do banco tem a LINHA PRÓPRIA (largura toda, acima das colunas) — aqui só data e conta */
                  const ext: [string, ReactNode, string?][] = primeiro
                    ? [['Data', dataDdMmAaaa(extrato.data)], ['Conta', nomeConta ?? '—', nomeConta ?? undefined], ['', ''], ['', ''], ['', '']]
                    : [['', ''], ['', ''], ['', ''], ['', ''], ['', '']];
                  const sis: [string, ReactNode, string?, string?][] = [
                    [`Venc.${n}`, l ? dataDdMmAaaa(l.data_vencimento) : '—', undefined, 'casar-sis-venc'],
                    ['Descrição', l ? (l.descricao ?? '—') : 'nenhum lançamento levado', l?.descricao ?? undefined, 'casar-sis-descricao'],
                    ['Fornecedor', l ? (l.fornecedor || '—') : '—', l?.fornecedor ?? undefined, 'casar-sis-fornecedor'],
                    ['NF', (() => { const n = l ? (l.numero_documento || nfLida.get(l.lancamento_id)) : null; return n ? (formatNFNumber(n) || n) : '—'; })(), undefined, 'levado-nf'],
                    ['Status', st ? <span className={cn('font-medium', PALETA_DO_STATUS[st]?.texto ?? 'text-muted-foreground')}>{STATUS_FILTRO_LABEL[st] ?? l?.status_transacao}</span> : '—', undefined, 'casar-sis-status'],
                  ];
                  const rot = 'truncate px-1 text-muted-foreground';
                  const val = 'truncate px-1';
                  return [
                    ...sis.map((x, k) => (
                      <tr key={`${l?.lancamento_id ?? 'v'}-${k}`} className={cn('h-[18px]', k === 0 && !primeiro && 'border-t')} data-testid={k === 0 ? 'casar-sistema-lancamento' : undefined}>
                        <td className={rot}>{ext[k][0]}</td>
                        <td className={val} title={ext[k][2]}>{ext[k][1]}</td>
                        <td />
                        <td className={rot}>{x[0]}</td>
                        <td className={cn(val, k === 3 && 'tabular-nums')} title={x[2]} data-testid={x[3]}>{x[1]}</td>
                      </tr>
                    )),
                    <tr key={`${l?.lancamento_id ?? 'v'}-valor`} className="h-[24px]">
                      <td className={rot}>{primeiro ? 'Valor' : ''}</td>
                      <td className="px-1 text-right">
                        {primeiro && <span className={cn('whitespace-nowrap text-[15px] font-medium tabular-nums', corVal(extrato.valor))} data-testid="casar-valor-banco">{fmtBRL(extrato.valor)}</span>}
                      </td>
                      <td />
                      <td className={rot}>Valor</td>
                      <td className="px-1 text-right">
                        {l && <span className={cn('whitespace-nowrap text-[15px] font-medium tabular-nums', corVal(l.valor_assinado))} data-testid="casar-valor-sistema">{fmtBRL(l.valor_assinado)}</span>}
                      </td>
                    </tr>,
                  ];
                })}
              </tbody>
            </table>

            {/* D-h — o pagamento contra o vencimento, numa faixa de ALTURA FIXA (vazia = o mesmo lugar: nada se desloca) */}
            {(() => {
              const f = fraseDoPagamento(extrato.data, levados.map((l) => l.data_vencimento));
              return (
                <div className={cn('flex h-[22px] items-center rounded px-2 text-[10.5px] whitespace-nowrap', f?.classe ?? '')} data-testid="casar-faixa-pagamento">
                  {f?.texto ?? '\u00a0'}
                </div>
              );
            })()}

            <div>
              <div className="text-[10px] text-muted-foreground mb-1 whitespace-nowrap">
                lançamentos levados ({levados.length}) — ao conciliar, cada um fica com o valor do campo
              </div>
              {levados.map((l, i) => (
                <div key={l.lancamento_id} className="py-[4px] border-b last:border-b-0" data-testid="levado">
                {/* P153b (D3) — a confirmação curta: a conta ANTES × DEPOIS, e que valor e data viram os do extrato (o casar de hoje) */}
                {l.trocarConta && (
                  <div className="mt-[3px] rounded border border-amber-400 bg-amber-50 px-1.5 py-[2px] text-[10px] text-amber-800" data-testid="levado-troca-conta">
                    Conta: <span className="font-semibold">{l.trocarConta.de ?? 'sem conta'}</span> → <span className="font-semibold">{l.trocarConta.para ?? 'a do extrato'}</span>
                    {' · '}ao conciliar, o lançamento passa para a conta do extrato; valor e data viram os do extrato.
                  </div>
                )}
                <div className="mt-[3px] flex min-w-0 items-center gap-2">
                  {/* D-h — o campo diz o que é: o valor que este lançamento recebe deste movimento */}
                  <span className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground" data-testid="valor-aplicado-rotulo">valor aplicado{unico ? '' : ` (${i + 1})`}</span>
                  <input
                    /* FIN-POS-FIXADO-01b: no caso pós o campo dos juros mostra o juro real que o banco vai gravar (lido do dono) */
                    value={parcelaPos && respPos?.ok && respPos.juroReal != null && l.lancamento_id === respPos.jurosId
                      ? paraCampo(respPos.juroReal) : l.valorTexto}
                    readOnly={!!parcelaPos}
                    title={parcelaPos ? 'Parcela de contrato pós-fixado: o juro real vem do extrato; o principal não muda.' : undefined}
                    onChange={(e) => setLevados((v) => v.map((x) => x.lancamento_id === l.lancamento_id ? { ...x, valorTexto: e.target.value } : x))}
                    inputMode="decimal"
                    className={cn('w-24 rounded border px-1 py-0.5 text-right text-[11px] font-medium tabular-nums', corVal(l.valor_assinado))}
                    aria-label={`Valor de ${l.descricao ?? 'lançamento'}`}
                  />
                  {/* ⚠ "era R$ X" TOMA O LUGAR DO BOTÃO, não se soma a ele — PR-CONC-SUGESTOES-CASAR-01. Com os dois na linha
                      de 560px a descrição virava "Folha ..." (medido na tela, NJ · BB · set/26). Com o campo já no valor do
                      banco, o botão estaria desabilitado e não diria nada que o "era" não diga; se o operador mexer no
                      campo, o botão volta. */}
                  {l.usarValorDoBanco && l.valorTexto !== paraCampo(l.valor_assinado) && (
                    <span className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground tabular-nums" data-testid="era-valor"
                      title="O valor que o lançamento tinha. Ao conciliar, ele fica com o do campo.">
                      era R$ {fmtBRL(Math.abs(l.valor_assinado))}
                    </span>
                  )}
                  {/* ⚠ UM LEVADO: "Usar valor do banco" — o campo recebe o valor do extrato (em módulo, como o campo
                      trabalha) e a diferença vai a zero na próxima simulação. VÁRIOS: "absorver a diferença" põe a
                      diferença inteira NESTA linha; as outras não mudam. */}
                  {parcelaPos || (unico && l.usarValorDoBanco && l.valorTexto === valorDoBanco) ? null : unico ? (
                    /* ⚠ "CORRIGIR O VALOR DO LANÇAMENTO" — CONC-BLOCOS-TELA-01 (decisão do Gabriel): era "Usar valor do
                       banco". É um gesto SEPARADO, com nome próprio, porque muda o valor do lançamento; o comportamento é o
                       mesmo de antes. Na variante bloco ele não existe. */
                    <button type="button" data-testid="usar-valor-banco"
                      disabled={l.valorTexto === valorDoBanco}
                      title={l.valorTexto === valorDoBanco ? 'O campo já tem o valor do banco.' : `muda o valor do lançamento para o do banco (${valorDoBanco})`}
                      onClick={() => poeValor(l.lancamento_id, valorDoBanco)}
                      className={cn('h-[23px] shrink-0 whitespace-nowrap rounded border px-1.5 text-[10px]',
                        l.valorTexto === valorDoBanco ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted')}>
                      Corrigir o valor do lançamento
                    </button>
                  ) : (() => {
                    const novo = difAtual == null ? null : valorAbsorvendo(valorDe(l.valorTexto), l.valor_assinado, difAtual);
                    const motivo = difAtual == null ? 'Confere com o banco: não há diferença para absorver.'
                      : novo == null ? 'Esta linha ficaria zerada ou negativa: escolha outra, ou remova um lançamento.' : null;
                    return (
                      <button type="button" data-testid="absorver-diferenca" disabled={novo == null}
                        title={motivo ?? `Esta linha passa a ${paraCampo(novo ?? 0)}; as outras não mudam e a soma fica igual ao banco.`}
                        onClick={() => { if (novo != null) poeValor(l.lancamento_id, paraCampo(novo)); }}
                        className={cn('shrink-0 whitespace-nowrap text-[10px] underline underline-offset-2',
                          novo == null ? 'text-muted-foreground/50 cursor-not-allowed' : 'text-muted-foreground hover:text-foreground')}>
                        absorver a diferença
                      </button>
                    );
                  })()}
                  <button type="button" className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    title="Tira este lançamento do casamento. Nada é apagado: ele continua no sistema, sem vínculo com este movimento."
                    onClick={() => setLevados((v) => v.filter((x) => x.lancamento_id !== l.lancamento_id))}>
                    remover deste casamento
                  </button>
                </div>
                </div>
              ))}
            </div>
            </>)}

            <div className={cn('space-y-0.5', !sim && 'text-muted-foreground')}>
              {/* E2: com a tabela, os números moram no rodapé dela; aqui ficam só as frases */}
              {!multi && [['No extrato', sim?.noExtrato], ['Soma dos agrupados', sim?.soma]].map(([rot, val]) => (
                <div key={String(rot)} className="grid grid-cols-[1fr_120px] items-baseline">
                  <span className="text-[10px] text-muted-foreground">{rot}</span>
                  <span className="text-right text-[11px] tabular-nums">{val == null ? '—' : fmtBRL(Number(val))}</span>
                </div>
              ))}
              {!multi && <div className="grid grid-cols-[1fr_120px] items-baseline">
                <span className="text-[10px] text-muted-foreground">Diferença</span>
                <span className={cn('text-right text-[11px] font-semibold tabular-nums',
                  !sim ? '' : sim.ok ? 'text-emerald-600' : 'text-amber-600')}>
                  {sim == null ? '—' : fmtBRL(sim.diferenca)}
                </span>
              </div>}
              {/* ⚠ O SENTIDO E O VALOR, e a 10px (a frase estava a 9, abaixo do piso da casa). */}
              {sim && sentido === 'a_mais' && (
                <div className="text-[10px] text-muted-foreground" data-testid="frase-diferenca">
                  Os lançamentos somam R$ {fmtBRL(Math.abs(sim.diferenca))} a mais que o banco. Conciliar… mostra as saídas (acrescentar, lançar na OC, criar a diferença), ou corrija o valor do lançamento.
                </div>
              )}
              {sim && sentido === 'a_menos' && (
                <div className="text-[10px] text-muted-foreground" data-testid="frase-diferenca">
                  Os lançamentos somam R$ {fmtBRL(Math.abs(sim.diferenca))} a menos que o banco. Conciliar… mostra as saídas (juntar outro extrato, deixar em aberto, desconto na OC), ou corrija o valor do lançamento.
                </div>
              )}
              {sim?.ok && (
                <div className="text-[10px] text-emerald-600" data-testid="frase-diferenca">Confere com o banco ✓</div>
              )}
              {parcelaPos && respPos && fraseDoJuroReal(respPos) && (
                <div className="text-[10px] text-muted-foreground" data-testid="juro-real">{fraseDoJuroReal(respPos)}</div>
              )}
            </div>

            {erroRodape && <div className="text-[10px] text-destructive">{erroRodape}</div>}
            {!erroRodape && pergunta && !aceitos.includes(pergunta.lancamento_id) && (
              <div className="text-[10px] text-amber-700" data-testid="pergunta-valor-extrato">{pergunta.frase}</div>
            )}
            {/* CONC-DESCONCILIAR-EDSON-01 (R2) — a pergunta da NF (a frase é a do banco) e os gestos que ele aceita para esta diferença */}
            {!erroRodape && perguntaNf && (
              <div className="rounded border border-amber-400 bg-amber-50 px-2 py-1.5 space-y-1" data-testid="pergunta-nf">
                <div className="text-[10px] text-amber-800">{perguntaNf.frase}</div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {perguntaNf.opcoes.map((op) => (
                    <button key={op} type="button" data-testid={`destino-${op}`}
                      onClick={() => {
                        if (op === 'desconto') { setTaxaAberta(null); setMotivoAberto(perguntaNf.lancamentoId); return; }
                        if (op === 'taxa') { setMotivoAberto(null); setTaxaAberta(perguntaNf.lancamentoId); return; }
                        escolher(perguntaNf.lancamentoId, { destino: op });
                      }}
                      className="h-[22px] whitespace-nowrap rounded border border-amber-500 bg-white px-2 text-[10px] hover:bg-amber-100">
                      {ROTULO_DO_DESTINO[op]}
                    </button>
                  ))}
                </div>
                {taxaAberta === perguntaNf.lancamentoId && (
                  <EscolherContaDaTaxa onEscolher={(c) => escolher(perguntaNf.lancamentoId, { destino: 'taxa', planoContaId: c.id, planoNome: c.subcentro })} />
                )}
                {motivoAberto === perguntaNf.lancamentoId && (
                  <div className="flex items-center gap-1.5">
                    <input value={motivoTexto} onChange={(e) => setMotivoTexto(e.target.value)} data-testid="motivo-desconto"
                      placeholder="motivo do desconto (ex.: pagou à vista)" aria-label="Motivo do desconto"
                      className="h-[22px] min-w-0 flex-1 rounded border px-1.5 text-[10px]" />
                    <button type="button" data-testid="confirmar-desconto" disabled={!motivoTexto.trim()}
                      title={motivoTexto.trim() ? undefined : 'Escreva o motivo do desconto.'}
                      onClick={() => escolher(perguntaNf.lancamentoId, { destino: 'desconto', motivo: motivoTexto })}
                      className={cn('h-[22px] whitespace-nowrap rounded border px-2 text-[10px]',
                        motivoTexto.trim() ? 'border-amber-500 bg-white hover:bg-amber-100' : 'opacity-40 cursor-not-allowed')}>
                      Confirmar desconto
                    </button>
                  </div>
                )}
              </div>
            )}
            {!erroRodape && escolhidas.map((l) => {
              const e = escolhas[l.lancamento_id];
              const dif = Math.abs(valorDe(l.valorTexto)) - Math.abs(l.valor_assinado);
              return (
                <div key={l.lancamento_id} className="flex items-baseline gap-2 text-[10px] text-muted-foreground" data-testid="escolha-nf">
                  <span className="min-w-0 flex-1">{l.numero_documento ? `NF nº ${formatNFNumber(l.numero_documento) || l.numero_documento}: ` : ''}{fraseDaEscolha(e, dif, fmtBRL)}</span>
                  <button type="button" className="shrink-0 underline underline-offset-2 hover:text-foreground"
                    onClick={() => setEscolhas((v) => { const n = { ...v }; delete n[l.lancamento_id]; return n; })}>
                    trocar
                  </button>
                </div>
              );
            })}
            {!erroRodape && semItens && (
              /* Sem levados o caminho é criar, não corrigir: o texto convida em vez de acusar. */
              <div className="text-[10px] text-muted-foreground">
                Nenhum lançamento explica este movimento. Crie o que falta pelo botão abaixo.
              </div>
            )}
          </div>

          {/* a escala de modal (A18): rodapé de 32px, botões de 22px */}
          <div className="flex h-8 shrink-0 items-center justify-end gap-2 border-t px-3 whitespace-nowrap" data-testid="casar-rodape">
            <button type="button" onClick={onClose} className="text-[11px] text-muted-foreground underline underline-offset-2">Cancelar</button>
            <button type="button" disabled={!podeCriar} onClick={() => setCriando(true)} data-testid="criar-pela-diferenca"
              className={cn('h-[22px] rounded border px-2 text-[11px]',
                podeCriar ? 'hover:bg-muted' : 'opacity-40 cursor-not-allowed')}>
              Criar lançamento pela diferença
            </button>
            {pergunta && !aceitos.includes(pergunta.lancamento_id) ? (
              <button type="button" disabled={!podeConciliar} data-testid="aceitar-valor-extrato"
                onClick={() => {
                  /* o "sim" grava na hora, com o item confirmado (o estado novo so' chega no proximo render) */
                  const novos = [...aceitos, pergunta.lancamento_id];
                  setAceitos(novos);
                  void conciliar(itensComDestino(itensBase.map((i) => (novos.includes(i.lancamento_id) ? { ...i, aceitar_valor_extrato: true } : i)), escolhas));
                }}
                className={cn('h-[22px] rounded px-2.5 text-[11px] font-medium',
                  podeConciliar ? 'bg-[#E7C873] text-foreground hover:bg-[#D9B95F]' : 'bg-muted text-muted-foreground cursor-not-allowed')}>
                Ligar com o valor do extrato
              </button>
            ) : (
              <button type="button" disabled={!podeConciliar && !podeComDiferenca} data-testid="conciliar-casar"
                title={!podeConciliar && !podeComDiferenca && editado && sim && !sim.ok ? 'Com um valor editado, a soma precisa fechar com o banco.' : undefined}
                onClick={() => { if (podeConciliar) void conciliar(); else setComDiferenca(true); }}
                className={cn('h-[22px] min-w-[86px] rounded px-2.5 text-[11px] font-medium',
                  podeConciliar || podeComDiferenca ? 'bg-[#E7C873] text-foreground hover:bg-[#D9B95F]' : 'bg-muted text-muted-foreground cursor-not-allowed')}>
                {/* min-w: "Conciliar…" / "Conciliar" / "Conciliando…" trocam o texto, nunca a posicao dos botoes ao lado */}
                {gravando ? 'Conciliando…' : podeComDiferenca ? 'Conciliar…' : trocaConta ? 'Conciliar e trocar a conta' : 'Conciliar'}
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ⚠ REUSA O COMPONENTE QUE JÁ FAZ ISSO. `CriarLancamentoDaLinha` monta o Novo Lançamento
          de verdade, trava o que o extrato dita e, com `semVinculo`, CRIA sem vincular —
          exatamente o que o grupo precisa: o vínculo de todos nasce depois, numa gravação só.
          `aoCriado` devolve o id, que é o que o `onSave` do diálogo sozinho não devolve. */}
      {comDiferenca && (
        <ConciliarDiferencaModal open onClose={() => setComDiferenca(false)}
          extratos={[{ id: extrato.extrato_id, data: extrato.data, descricao: extrato.historico ?? '—', valor: Math.abs(extrato.valor) }]}
          lancamentos={levados.map((l) => ({ id: l.lancamento_id, data: l.data_vencimento ?? null, descricao: l.descricao ?? '—', valor: Math.abs(l.valor_assinado) }))}
          onConciliado={() => { setComDiferenca(false); onClose(); onConciliado(); }} />
      )}

      {criando && extrato && (
        <CriarLancamentoDaLinha
          movimento={{
            id: extrato.extrato_id,
            data_movimento: extrato.data ?? '',
            descricao: extrato.historico,
            documento: null,
            valor: extrato.valor,
            valorConciliado: 0,
            valorAberto: extrato.valor,
            situacao: 'nao_conciliado',
            lancamentoId: null,
            /* Movimento sintético para o diálogo de criação: ele nasce SEM vínculo por
               construção — os três campos do par existem para a linha do Palco e aqui são o
               estado vazio, não uma informação omitida. */
            vinculos: 0,
            lancamentoDescricao: null,
            lancamentoFavorecido: null,
          }}
          contaBancariaId={contaBancariaId}
          valorSugerido={sim ? Math.abs(sim.diferenca) : undefined}
          modelo={modelo ?? undefined}
          semVinculo
          aoFechar={() => setCriando(false)}
          aoCriado={async (idCriado) => {
            setCriando(false);
            if (!idCriado || !sim) return;
            const falta = Math.abs(sim.diferenca);
            setLevados((v) => [...v, {
              lancamento_id: idCriado,
              descricao: extrato.historico,
              fornecedor: null,
              valor_assinado: Math.sign(extrato.valor || 1) * falta,
              valorTexto: falta.toFixed(2).replace('.', ','),
            }]);
          }}
        />
      )}
    </>
  );
}

/**
 * O SENTIDO INVERSO — N extratos explicam 1 lançamento. PR-ESPELHO-05 parte A.
 *
 * ⚠ SEM EDIÇÃO DE VALOR, e é a diferença que justifica um modal próprio em vez do mesmo com
 * os papéis trocados. No 1:N o operador ajusta quanto de cada lançamento o banco pagou —
 * lançamento é declaração nossa. Aqui os valores são do EXTRATO, e extrato não se edita: se
 * a soma não bate, quem está errado é o lançamento, e o caminho é abri-lo e corrigir lá.
 *
 * ⚠ SEM "CRIAR PELA DIFERENÇA" pelo mesmo motivo: o que faltaria criar é um extrato, e
 * extrato não se cria — ele se importa do banco.
 */
export function CasarN1Modal({
  open, onClose, sis, extratos, nomeConta, onConciliado,
}: {
  open: boolean; onClose: () => void;
  sis: { lancamento_id: string; descricao: string | null; fornecedor?: string | null; valor_assinado: number } | null;
  extratos: readonly { extrato_id: string; data: string | null; historico: string | null; valor: number }[];
  nomeConta?: string;
  onConciliado: () => void;
}) {
  const [sim, setSim] = useState<{ ok: boolean; noLancamento: number; soma: number; diferenca: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [comDiferenca, setComDiferenca] = useState(false);
  const ids = useMemo(() => extratos.map((e) => e.extrato_id), [extratos]);

  useEffect(() => {
    if (!open || !sis) return;
    let cancelado = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data, error } = await (supabase as any).rpc('fn_espelho_casar_n1', {
        p_lancamento_id: sis.lancamento_id, p_extratos: ids, p_simular: true, p_motivo: 'casado_no_espelho_n1',
      });
      if (cancelado) return;
      if (error) { setSim(null); setErro(error.message); return; }
      const r = (data ?? {}) as { ok?: boolean; motivo?: string; frase?: string; no_lancamento?: number; soma_extratos?: number; diferenca?: number };
      if (r.ok) {
        setErro(null);
        setSim({ ok: true, noLancamento: Number(r.no_lancamento ?? 0), soma: Number(r.soma_extratos ?? 0), diferenca: 0 });
      } else if (r.motivo === 'soma_nao_bate') {
        setErro(null);
        setSim({ ok: false, noLancamento: Number(r.no_lancamento ?? 0), soma: Number(r.soma_extratos ?? 0), diferenca: Number(r.diferenca ?? 0) });
      } else {
        setSim(null);
        setErro(r.frase ?? MOTIVO_CASAR_LABEL[r.motivo ?? ''] ?? r.motivo ?? 'Não foi possível simular.');
      }
    })();
    return () => { cancelado = true; };
  }, [open, sis, ids]);

  const conciliar = async () => {
    if (!sis) return;
    setGravando(true); setErro(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_espelho_casar_n1', {
      p_lancamento_id: sis.lancamento_id, p_extratos: ids, p_simular: false, p_motivo: 'casado_no_espelho_n1',
    });
    setGravando(false);
    if (error) { setErro(error.message); return; }
    const r = (data ?? {}) as { ok?: boolean; motivo?: string; frase?: string };
    if (r.ok === false) { setErro(r.frase ?? MOTIVO_CASAR_LABEL[r.motivo ?? ''] ?? r.motivo ?? 'Não foi possível conciliar.'); return; }
    onClose();
    onConciliado();
  };

  if (!sis) return null;
  const podeComDiferenca = !!sim && !sim.ok && !gravando;

  return (
    <>
    {comDiferenca && (
      <ConciliarDiferencaModal open onClose={() => setComDiferenca(false)}
        extratos={extratos.map((e) => ({ id: e.extrato_id, data: e.data, descricao: e.historico ?? '—', valor: Math.abs(e.valor) }))}
        lancamentos={[{ id: sis.lancamento_id, data: null, descricao: sis.descricao ?? '—', valor: Math.abs(sis.valor_assinado) }]}
        onConciliado={() => { setComDiferenca(false); onClose(); onConciliado(); }} />
    )}
    <Dialog open={open && !comDiferenca} onOpenChange={(v) => { if (!v) onClose(); }}>
      {/* ⚠ `grid-cols-[minmax(0,1fr)]` — a MESMA regra da variante 1:N (PR-CONC-CASAR-VALOR-BANCO-01), CONC-CASAR-N1-LARGURA-01.
          O `DialogContent` da casa é `grid`, e a coluna implícita cresce até o conteúdo mínimo: o histórico longo do banco
          ("PAGAMENTO PIX-PIX_DEB 15412257000128 GOVERNO DO ESTADO DE MATO GROSSO DO SUL") alargava a coluna além dos 560px,
          e o `overflow-hidden` cortava os valores, a soma e o Conciliar (homologação do Gabriel, 01/10 08:31). Com a coluna
          presa à largura do modal, o histórico trunca com o texto inteiro no `title`. */}
      <DialogContent className="w-[560px] max-w-[95vw] max-h-[90vh] flex flex-col grid-cols-[minmax(0,1fr)] p-0 gap-0 overflow-hidden [&>button.absolute]:hidden text-[11px]">
        <div className="flex h-9 shrink-0 items-center justify-between gap-2 bg-primary px-3 text-primary-foreground">
          <span className="text-[12px] font-medium">Casar com o banco</span>
          <div className="flex items-center gap-3">
            <span className="text-[11px] opacity-90 truncate max-w-[50%]">{nomeConta} · {extratos.length} movimentos</span>
            <button type="button" onClick={onClose} aria-label="Fechar" className="rounded p-0.5 opacity-80 hover:opacity-100 hover:bg-primary-foreground/10">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2.5">
          <div className="rounded-xl bg-muted px-3 py-2 grid grid-cols-[70px_1fr] gap-x-2 gap-y-0.5 items-baseline">
            <span className="text-[10px] text-muted-foreground">no lançamento</span>
            <span className={cn('text-[11px] font-semibold tabular-nums', corVal(sis.valor_assinado))}>{fmtBRL(sis.valor_assinado)}</span>
            <span className="text-[10px] text-muted-foreground">descrição</span>
            <span className="text-[11px] truncate" title={sis.descricao ?? ''}>{sis.descricao ?? '—'}</span>
            <span className="text-[10px] text-muted-foreground">fornecedor</span>
            <span className="text-[10px] text-muted-foreground">{sis.fornecedor || '—'}</span>
          </div>

          <div>
            <div className="text-[10px] text-muted-foreground mb-1">extratos levados ({extratos.length})</div>
            {extratos.map((e) => (
              <div key={e.extrato_id} className="flex items-center gap-2 py-[3px] border-b last:border-b-0">
                <span className="w-10 shrink-0 text-[10px] text-muted-foreground tabular-nums">
                  {e.data ? `${e.data.slice(8, 10)}/${e.data.slice(5, 7)}` : '—'}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px]" title={e.historico ?? ''}>{e.historico ?? '—'}</span>
                <span className={cn('w-24 shrink-0 text-right text-[11px] font-medium tabular-nums', corVal(e.valor))}>{fmtBRL(e.valor)}</span>
              </div>
            ))}
          </div>

          <div className={cn('space-y-0.5', !sim && 'text-muted-foreground')}>
            {[['No lançamento', sim?.noLancamento], ['Soma dos extratos', sim?.soma]].map(([rot, val]) => (
              <div key={String(rot)} className="grid grid-cols-[1fr_120px] items-baseline">
                <span className="text-[10px] text-muted-foreground">{rot}</span>
                <span className="text-right text-[11px] tabular-nums">{val == null ? '—' : fmtBRL(Number(val))}</span>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_120px] items-baseline">
              <span className="text-[10px] text-muted-foreground">Diferença</span>
              <span className={cn('text-right text-[11px] font-semibold tabular-nums',
                !sim ? '' : sim.ok ? 'text-emerald-600' : 'text-amber-600')}>
                {sim == null ? '—' : fmtBRL(sim.diferenca)}
              </span>
            </div>
            {/* ⚠ A MESMA REGRA DO 1:N (`sentidoDaDiferenca`) — PR-CONC-CASAR-VALOR-BANCO-01. Aqui a
                `fn_espelho_casar_n1` trabalha EM MÓDULO (`diferenca = Σ|extratos| − |lançamento|`, conferido no
                `prosrc` em 30/09), e a referência é o lançamento, positivo: a frase antiga não estava invertida no
                N:1 — o que muda é dizer o VALOR, a 10px (estava a 9, abaixo do piso), e o "Confere" quando bate. */}
            {sim && !sim.ok && (() => {
              const sentidoN1 = sentidoDaDiferenca(sim.diferenca, sim.noLancamento);
              return sentidoN1 === 'confere' ? null : (
                <div className="text-[10px] text-muted-foreground" data-testid="frase-diferenca-n1">
                  Os extratos somam R$ {fmtBRL(Math.abs(sim.diferenca))} {sentidoN1 === 'a_mais' ? 'a mais' : 'a menos'} que o lançamento.
                  {' '}Conciliar… mostra as saídas; o valor do banco não se edita.
                </div>
              );
            })()}
            {sim?.ok && (
              <div className="text-[10px] text-emerald-600" data-testid="frase-diferenca-n1">Confere com o banco ✓</div>
            )}
          </div>

          {erro && <div className="text-[10px] text-destructive">{erro}</div>}
        </div>

        <div className="flex h-[34px] shrink-0 items-center justify-end gap-2 border-t px-3 whitespace-nowrap">
          <button type="button" onClick={onClose} className="text-[11px] text-muted-foreground underline underline-offset-2">Cancelar</button>
          <button type="button" disabled={!(sim?.ok && !gravando) && !podeComDiferenca} data-testid="conciliar-n1"
            onClick={() => { if (sim?.ok) void conciliar(); else setComDiferenca(true); }}
            className={cn('min-w-[86px] rounded px-2.5 py-0.5 text-[11px] font-medium',
              (sim?.ok && !gravando) || podeComDiferenca ? 'bg-[#E7C873] text-foreground hover:bg-[#D9B95F]' : 'bg-muted text-muted-foreground cursor-not-allowed')}>
            {gravando ? 'Conciliando…' : podeComDiferenca ? 'Conciliar…' : 'Conciliar'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
   VARIANTE BLOCO — CONC-BLOCOS-TELA-01 (mock aprovado: docs/mocks/mock-casar-bloco-v1.html).
   ───────────────────────────────────────────────────────────────────────────────────────────────────────────── */

export type RegraBloco = 'exato' | 'mais_antigo_primeiro';

export interface ExtratoDoBloco { extrato_id: string; data: string | null; historico: string | null; valor: number }
export interface LancamentoDoBloco {
  lancamento_id: string; data: string | null; descricao: string | null; fornecedor?: string | null; valor_assinado: number;
}

/** O que a `fn_conciliar_bloco` devolve — a matriz e o resumo. A tela só os MOSTRA. */
export interface RespostaBloco {
  matriz: Array<{ extrato_id: string; lancamento_id: string; valor_aplicado: number }>;
  resumo: {
    soma_extratos: number; soma_lancamentos: number; diferenca: number;
    /* CONC-BLOCO-SINAL-MISTO-01 — as somas COM SINAL (saída −, entrada +), do banco; `sinal_misto` = o bloco tem saída e entrada */
    soma_extratos_com_sinal?: number; soma_lancamentos_com_sinal?: number; diferenca_com_sinal?: number; sinal_misto?: boolean;
    quitados: Array<{ lancamento_id: string }>;
    parcial: { lancamento_id: string; descricao: string; aplicado: number; falta: number } | null;
  };
}

/**
 * A frase da recusa, sem o código: a RPC escreve "codigo: frase legível" (SQLSTATE CBLOC), e o operador lê a frase.
 * ⚠ SÓ O PREFIXO `snake_case:` SAI — a frase em si (com os números da RPC) vai inteira.
 */
export function fraseDaRecusa(msg: string | null | undefined): string {
  return (msg ?? '').replace(/^[a-z_]+:\s*/, '') || 'Não foi possível simular o bloco.';
}

/**
 * O que cada lançamento recebeu, lido da MATRIZ da RPC (soma das células dele) — é a matriz exibida, não um cálculo
 * da tela: quem decide quanto vai para quem é a alocação do banco.
 */
export function aplicadoPorLancamento(r: RespostaBloco): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of r.matriz) m.set(c.lancamento_id, Math.round(((m.get(c.lancamento_id) ?? 0) + Number(c.valor_aplicado)) * 100) / 100);
  return m;
}

/**
 * CONC-BLOCO-SINAL-MISTO-01 — as três somas COM SINAL do rodapé do bloco. Com a simulação do banco, os números DELE; sem ela (o banco
 * recusou, ou ainda não respondeu), a soma da SELEÇÃO — em centavos inteiros, só para mostrar: quem decide é o banco, e a recusa fica
 * escrita ao lado. Diferença = Pix − lançamentos.
 */
export function somasComSinal(resp: RespostaBloco | null, extratos: readonly ExtratoDoBloco[], lancamentos: readonly LancamentoDoBloco[]) {
  const r = resp?.resumo;
  if (r && r.soma_extratos_com_sinal != null && r.soma_lancamentos_com_sinal != null && r.diferenca_com_sinal != null) {
    return { pix: Number(r.soma_extratos_com_sinal), lancamentos: Number(r.soma_lancamentos_com_sinal), diferenca: Number(r.diferenca_com_sinal), doBanco: true };
  }
  const cent = (v: number) => Math.round(Number(v) * 100);
  const pix = extratos.reduce((s, e) => s + cent(e.valor), 0);
  const lan = lancamentos.reduce((s, l) => s + cent(l.valor_assinado), 0);
  return { pix: pix / 100, lancamentos: lan / 100, diferenca: (pix - lan) / 100, doBanco: false };
}

/** O nome do lugar onde o bloco se desfaz depois de conciliado: o menu da linha do bloco na Conferência (`EspelhoConciliacaoTab`). */
export const ONDE_DESFAZER_BLOCO = 'Para desfazer: menu "Ações" (⋯) da linha do bloco › Desfazer bloco.';

/* dd/mm/aaaa (UI-SEM-CORTE-01; era dd/mm/aa) */
const dataCurta = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');

/** CONC-CRIAR-COM-NOTA-02 D-h — data inteira (dd/mm/aaaa) nas colunas Extrato × Sistema */
export const dataDdMmAaaa = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');

/** D-h — a faixa do pagamento contra o vencimento: "Pago 28 dias ANTES do vencimento (venc. 10/11 · banco 13/10)". Vários levados com
 *  vencimentos diferentes = cada um no seu "Venc."; sem data = nada (a faixa fica vazia no mesmo lugar). */
export function fraseDoPagamento(banco: string | null | undefined, vencimentos: readonly (string | null | undefined)[]): { texto: string; classe: string } | null {
  const vs = [...new Set(vencimentos.filter((v): v is string => !!v).map((v) => v.slice(0, 10)))];
  if (!banco || vs.length === 0) return null;
  if (vs.length > 1) return { texto: 'Vencimentos diferentes: veja o "Venc." de cada lançamento.', classe: 'bg-muted text-muted-foreground' };
  const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const dias = Math.round((Date.parse(vs[0]) - Date.parse(banco.slice(0, 10))) / 86400000);
  const sufixo = `(venc. ${ddmm(vs[0])} · banco ${ddmm(banco)})`;
  if (dias === 0) return { texto: `Pago no vencimento ${sufixo}`, classe: 'bg-emerald-50 text-emerald-800' };
  const n = Math.abs(dias);
  return dias > 0
    ? { texto: `Pago ${n} dia${n === 1 ? '' : 's'} ANTES do vencimento ${sufixo}`, classe: 'bg-sky-50 text-sky-800' }
    : { texto: `Pago ${n} dia${n === 1 ? '' : 's'} DEPOIS do vencimento ${sufixo}`, classe: 'bg-amber-50 text-amber-800' };
}

/**
 * CASAR COM O BANCO · BLOCO — N extratos × M lançamentos, numa gravação só (`fn_conciliar_bloco`).
 *
 * ⚠ A MATRIZ E O RESUMO VÊM SÓ DA RPC: ao abrir e a cada troca de regra, `p_simular = true`; o Conciliar bloco é a
 *   MESMA chamada com `p_simular = false`. Nenhuma alocação aqui. A única soma da tela é a da SELEÇÃO quando o banco recusa
 *   (`somasComSinal`), só para mostrar o que foi escolhido.
 * ⚠ NÃO EXISTE "Corrigir o valor do lançamento" NESTA VARIANTE: o valor do lançamento nunca muda num bloco. Valor
 *   errado se corrige no próprio lançamento, ou no 1:N.
 * ⚠ A RECUSA (SQLSTATE CBLOC) FICA NO MODAL, acima do rodapé, em vermelho — nunca em toast (UX-TOAST-01) — e o botão
 *   desabilita dizendo por quê.
 */
export function CasarBlocoModal({
  open, onClose, extratos, lancamentos, nomeConta, regraInicial = 'exato', onConciliado,
}: {
  open: boolean; onClose: () => void;
  extratos: readonly ExtratoDoBloco[]; lancamentos: readonly LancamentoDoBloco[];
  nomeConta?: string; regraInicial?: RegraBloco; onConciliado: () => void;
}) {
  const [regra, setRegra] = useState<RegraBloco>(regraInicial);
  const [resp, setResp] = useState<RespostaBloco | null>(null);
  const [recusa, setRecusa] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [gravando, setGravando] = useState(false);
  /* ⚠ TRAVA DE DUPLO CLIQUE SÍNCRONA: o `gravando` do estado só chega no próximo render, e dois cliques no mesmo quadro
     passariam os dois. A ref fecha a porta no mesmo instante. */
  const gravandoRef = useRef(false);
  const [comDiferenca, setComDiferenca] = useState(false);
  const idsExt = useMemo(() => extratos.map((e) => e.extrato_id), [extratos]);
  const idsLan = useMemo(() => lancamentos.map((l) => l.lancamento_id), [lancamentos]);

  useEffect(() => { if (open) setRegra(regraInicial); }, [open, regraInicial]);

  useEffect(() => {
    if (!open || idsExt.length === 0 || idsLan.length === 0) return;
    let cancelado = false;
    setCarregando(true);
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data, error } = await (supabase as any).rpc('fn_conciliar_bloco', {
        p_extratos: idsExt, p_lancamentos: idsLan, p_regra: regra, p_simular: true,
      });
      if (cancelado) return;
      setCarregando(false);
      if (error) { setResp(null); setRecusa(fraseDaRecusa(error.message)); return; }
      setRecusa(null);
      setResp(data ?? null);
    })();
    return () => { cancelado = true; };
  }, [open, idsExt, idsLan, regra]);

  const conciliar = async () => {
    if (gravandoRef.current || !resp) return;
    gravandoRef.current = true;
    setGravando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { error } = await (supabase as any).rpc('fn_conciliar_bloco', {
        p_extratos: idsExt, p_lancamentos: idsLan, p_regra: regra, p_simular: false,
      });
      if (error) { setRecusa(fraseDaRecusa(error.message)); return; }
      onClose();
      onConciliado();
    } finally {
      gravandoRef.current = false;
      setGravando(false);
    }
  };

  /* A ordem das linhas é a da ALOCAÇÃO da RPC (a matriz); quem não está nela (recusa) fica na ordem da seleção. */
  const ordemDaMatriz = (ids: readonly string[], chave: 'extrato_id' | 'lancamento_id') => {
    if (!resp) return [...ids];
    const vistos: string[] = [];
    for (const c of resp.matriz) if (!vistos.includes(c[chave])) vistos.push(c[chave]);
    return [...vistos, ...ids.filter((i) => !vistos.includes(i))];
  };
  const extPorId = new Map(extratos.map((e) => [e.extrato_id, e]));
  const lanPorId = new Map(lancamentos.map((l) => [l.lancamento_id, l]));
  const aplicado = resp ? aplicadoPorLancamento(resp) : null;
  const quitados = new Set((resp?.resumo.quitados ?? []).map((q) => q.lancamento_id));
  const parcial = resp?.resumo.parcial ?? null;
  const dif = resp ? Number(resp.resumo.diferenca) : null;
  const somas = somasComSinal(resp, extratos, lancamentos);
  const tituloSomas = somas.doBanco ? undefined : 'soma da seleção · o banco não simulou este bloco';
  const confere = dif != null && Math.abs(dif) <= 0.005 && !parcial;
  const motivoDesabilitado = gravando ? 'Conciliando…'
    : carregando ? 'Simulando o bloco…'
    : recusa ? recusa
    : !resp ? 'Simulando o bloco…' : null;
  /* CONC-SEM-TRAVA-01 (tela): a soma da selecao nao fecha e o banco recusou o bloco -> o Conciliar abre o modal da diferenca
     (as tres saidas, com previa), em vez de ficar apagado com a recusa. */
  const podeComDiferenca = !gravando && !carregando && !!recusa && Math.abs(somas.diferenca) > 0.005;

  return (
    <>
    {comDiferenca && (
      <ConciliarDiferencaModal open onClose={() => setComDiferenca(false)}
        extratos={extratos.map((e) => ({ id: e.extrato_id, data: e.data, descricao: e.historico ?? '—', valor: Math.abs(e.valor) }))}
        lancamentos={lancamentos.map((l) => ({ id: l.lancamento_id, data: l.data, descricao: l.descricao ?? '—', valor: Math.abs(l.valor_assinado) }))}
        onConciliado={() => { setComDiferenca(false); onClose(); onConciliado(); }} />
    )}
    <Dialog open={open && !comDiferenca} onOpenChange={(v) => { if (!v) onClose(); }}>
      {/* ⚠ `grid-cols-[minmax(0,1fr)]` — a MESMA regra do fix N1 (CONC-CASAR-N1-LARGURA-01): o `DialogContent` é grid e a
          coluna implícita cresceria até o histórico mais longo do banco, cortando valores e botões. Largura FIXA de
          700px (o mock), para qualquer texto. */}
      <DialogContent data-testid="casar-bloco"
        className="w-[700px] max-w-[95vw] max-h-[90vh] flex flex-col grid-cols-[minmax(0,1fr)] p-0 gap-0 overflow-hidden [&>button.absolute]:hidden text-[10px]">
        <div className="flex h-[30px] shrink-0 items-center justify-between gap-2 bg-primary px-3 text-primary-foreground">
          <span className="text-[11px] font-semibold whitespace-nowrap">Casar com o banco · bloco</span>
          <div className="flex items-center gap-3">
            <span className="text-[10px] opacity-90 whitespace-nowrap">
              {[nomeConta, `${extratos.length} Pix × ${lancamentos.length} lançamento${lancamentos.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
            </span>
            <button type="button" onClick={onClose} aria-label="Fechar" className="rounded p-0.5 opacity-80 hover:opacity-100 hover:bg-primary-foreground/10">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto flex flex-col gap-2 px-3 py-2">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-muted-foreground">Regra</span>
            <Segmentado<RegraBloco> valor={regra} onEscolher={setRegra} altura={20}
              opcoes={[{ valor: 'exato', rotulo: 'Soma exata' }, { valor: 'mais_antigo_primeiro', rotulo: 'Mais antigo primeiro' }]} />
          </div>

          <div className="text-[9.5px] text-muted-foreground whitespace-nowrap">Pix levados ({extratos.length})</div>
          <table className="w-full table-fixed border-separate border-spacing-0 text-[10px]" data-testid="tabela-pix">
            <colgroup><col style={{ width: 66 }} /><col /><col style={{ width: 90 }} /></colgroup>
            <thead>
              <tr className="h-[18px] bg-primary text-primary-foreground text-[9.5px]">
                <th className="px-1.5 text-left font-semibold">Data</th>
                <th className="px-1.5 text-left font-semibold">Histórico do banco</th>
                <th className="px-1.5 text-right font-semibold">Valor</th>
              </tr>
            </thead>
            <tbody>
              {ordemDaMatriz(idsExt, 'extrato_id').map((id) => {
                const e = extPorId.get(id);
                if (!e) return null;
                return (
                  <tr key={id} className="h-[18px]" data-testid="pix-levado">
                    <td className="border-b px-1.5 tabular-nums whitespace-nowrap">{dataCurta(e.data)}</td>
                    {/* O HISTÓRICO DO BANCO ROLA DENTRO DA CÉLULA (UI-SEM-CORTE-01: sem "…"), inteiro também no `title`. */}
                    <td className="border-b px-1.5"><div className="truncate" data-testid="historico-bloco" title={e.historico ?? ''}>{e.historico ?? '—'}</div></td>
                    <td className={cn('border-b px-1.5 text-right tabular-nums whitespace-nowrap', corVal(e.valor))}>{fmtBRL(e.valor)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="text-[9.5px] text-muted-foreground whitespace-nowrap">
            Lançamentos levados ({lancamentos.length}) · valor do lançamento nunca muda
          </div>
          <table className="w-full table-fixed border-separate border-spacing-0 text-[10px]" data-testid="tabela-lancamentos">
            <colgroup>
              {/* As larguras do mock (58 · resto · 172 · 66 · 66 · 78): a Descrição fica com 236px e a NF cabe numa linha de
                  18px (com 72/72/90 ela tinha 212 e quebrava em 37px — medido na tela). */}
              <col style={{ width: 66 }} /><col /><col style={{ width: 172 }} />
              <col style={{ width: 66 }} /><col style={{ width: 66 }} /><col style={{ width: 78 }} />
            </colgroup>
            <thead>
              <tr className="h-[18px] bg-primary text-primary-foreground text-[9.5px]">
                <th className="px-1.5 text-left font-semibold">Data</th>
                <th className="px-1.5 text-left font-semibold">Descrição</th>
                <th className="px-1.5 text-left font-semibold">Fornecedor</th>
                <th className="px-1.5 text-right font-semibold">Valor</th>
                <th className="px-1.5 text-right font-semibold">Aplicado</th>
                <th className="px-1.5 text-left font-semibold">Situação</th>
              </tr>
            </thead>
            <tbody>
              {ordemDaMatriz(idsLan, 'lancamento_id').map((id) => {
                const l = lanPorId.get(id);
                if (!l) return null;
                const ap = aplicado?.get(id);
                const ehParcial = parcial?.lancamento_id === id;
                return (
                  <tr key={id} className="h-[18px]" data-testid="lancamento-levado">
                    <td className="border-b px-1.5 tabular-nums whitespace-nowrap">{dataCurta(l.data)}</td>
                    {/* ⚠ DESCRIÇÃO E FORNECEDOR INTEIROS, sem reticência (regra da casa): se não cabem, quebram. */}
                    <td className="border-b px-1.5 break-words" data-testid="descricao-levada">{l.descricao ?? '—'}</td>
                    <td className="border-b px-1.5 break-words">{l.fornecedor || '—'}</td>
                    <td className={cn('border-b px-1.5 text-right tabular-nums whitespace-nowrap', corVal(l.valor_assinado))}>{fmtBRL(l.valor_assinado)}</td>
                    <td className="border-b px-1.5 text-right tabular-nums whitespace-nowrap" data-testid="aplicado">{ap == null ? '—' : fmtBRL(ap)}</td>
                    <td className="border-b px-1.5 whitespace-nowrap" data-testid="situacao">
                      {quitados.has(id)
                        ? <span className="inline-block rounded-[3px] bg-emerald-100 px-1 text-[9.5px] leading-[13px] text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">Quitado</span>
                        : ehParcial && parcial
                          ? <span className="inline-block rounded-[3px] bg-amber-100 px-1 text-[9.5px] leading-[13px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Falta {fmtBRL(parcial.falta)}</span>
                          : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="grid grid-cols-[1fr_110px] gap-y-px border-t pt-1.5">
            {/* CONC-BLOCO-SINAL-MISTO-01 — COM SINAL sempre que há seleção: saída −, entrada + (o Pix de −2.893,37 e o reembolso de
                +89,71 somam −2.803,66). */}
            <span className="text-muted-foreground">Soma dos Pix</span>
            <span className={cn('text-right tabular-nums', corVal(somas.pix))} title={tituloSomas} data-testid="soma-pix-bloco">{fmtBRL(somas.pix)}</span>
            <span className="text-muted-foreground">Soma dos lançamentos</span>
            <span className={cn('text-right tabular-nums', corVal(somas.lancamentos))} title={tituloSomas} data-testid="soma-lancamentos-bloco">{fmtBRL(somas.lancamentos)}</span>
            <span className="text-muted-foreground">Diferença</span>
            <span className={cn('text-right font-semibold tabular-nums', Math.abs(somas.diferenca) <= 0.005 ? 'text-emerald-600' : 'text-rose-600')}
              title={tituloSomas} data-testid="diferenca-bloco">{fmtBRL(somas.diferenca)}</span>
          </div>
          {resp && (confere
            ? <div className="font-semibold text-emerald-600" data-testid="frase-bloco">
                Confere com o banco ✓ · {quitados.size === 1 ? 'o lançamento fica quitado' : `os ${quitados.size} lançamentos ficam quitados`}
              </div>
            : parcial
              ? <div className="font-semibold text-amber-600" data-testid="frase-bloco">
                  Parcial · falta R$ {fmtBRL(parcial.falta)} na {parcial.descricao} · segue em aberto para o próximo depósito
                </div>
              : null)}

          {/* ⚠ A RECUSA MORA AQUI, num slot acima do rodapé — nunca em toast (UX-TOAST-01). */}
          <div className="min-h-[15px] text-[11px] leading-[15px] text-destructive" data-testid="recusa-bloco">{recusa ?? ''}</div>
        </div>

        <div className="flex h-[34px] shrink-0 items-center justify-between gap-2 border-t px-3 whitespace-nowrap">
          <span className="text-muted-foreground" data-testid="onde-desfazer-bloco">{ONDE_DESFAZER_BLOCO}</span>
          <span className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded border px-2.5 py-0.5 text-[11px] hover:bg-muted">Cancelar</button>
            <button type="button" disabled={!!motivoDesabilitado && !podeComDiferenca}
              onClick={() => { if (podeComDiferenca) setComDiferenca(true); else void conciliar(); }}
              title={podeComDiferenca ? 'A soma não fecha: escolha o que fazer com a diferença.' : motivoDesabilitado ?? undefined} data-testid="conciliar-bloco"
              className={cn('min-w-[104px] rounded px-2.5 py-0.5 text-[11px] font-semibold',
                motivoDesabilitado && !podeComDiferenca ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-[#E7C873] text-foreground hover:bg-[#D9B95F]')}>
              {gravando ? 'Conciliando…' : podeComDiferenca ? 'Conciliar…' : 'Conciliar bloco'}
            </button>
          </span>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
