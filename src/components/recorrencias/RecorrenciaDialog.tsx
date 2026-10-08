import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useFinanceiroV2 } from '@/hooks/useFinanceiroV2';
import { FazendaSelect } from '@/components/shared/FazendaSelect';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { ClassificacaoLancamento, atividadeValida, type ClassificacaoValor } from '@/components/shared/ClassificacaoLancamento';
import { escopoDoSubcentro } from '@/lib/financeiro/escopoDoSubcentro';
import { DiaVencimentoGrade } from './DiaVencimentoGrade';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import {
  resumoVivo, primeiroVencimentoDe, mesDoFatoDe, propagarRecorrencia, mudouOQueSePropaga,
  type Recorrencia, type MesDoFato, type ResultadoPropagacao, type PayloadDaRegra,
} from '@/hooks/useRecorrencias';
import { Segmentado } from '@/components/ui/segmentado';
import { Checkbox } from '@/components/ui/checkbox';
import { EXPLICACAO_A_CONFIRMAR, ROTULO_TIPO } from '@/lib/financeiro/recorrenciasDoMes';
import { PropagarRecorrenciaDialog } from './PropagarRecorrenciaDialog';
import { cn } from '@/lib/utils';

/** As duas respostas. O rótulo diz o QUE, o exemplo diz QUANDO usar. */
const OPCOES_MES_DO_FATO: readonly { valor: MesDoFato; rotulo: string; exemplo: string }[] = [
  { valor: 'proprio',  rotulo: 'Do próprio mês', exemplo: 'assinaturas, mensalidades, honorários' },
  { valor: 'anterior', rotulo: 'Do mês anterior', exemplo: 'água, luz, telefone — consumo medido' },
];


/**
 * RecorrenciaDialog — o cadastro da REGRA, não do lançamento.
 * FIN-RECORRENCIA-01, Tempo 1.
 *
 * ⚠ OS SELETORES SÃO OS DA CASA, e é o mesmo motivo do criar-da-linha: a regra
 * herda fazenda, favorecido, classificação, conta e safra, e o operador já sabe
 * escolher cada um desses no modal de lançamento. Construir seletores próprios
 * daria dois jeitos de escolher a mesma coisa.
 *
 * ⚠ AS TRÊS DATAS SÃO A ÂNCORA, E NÃO HÁ CAMPO DE DESLOCAMENTO. "Competência do
 * 1º" e "Vencimento do 1º" declaram a relação; a distância entre elas é o que a
 * geração preserva mês a mês. Um campo "pagar N meses depois" seria uma terceira
 * cópia da mesma verdade, e o dia em que discordasse das datas ninguém saberia
 * qual das duas manda.
 *
 * ⚠ O RESUMO VIVO É A EXPLICAÇÃO QUE SUBSTITUI O CAMPO AUSENTE. Sem ele, a
 * relação entre as três datas fica implícita e o operador só descobre o
 * deslocamento depois de gerar. A frase o diz antes de gravar.
 */
interface Props {
  /** Ausente = criar. Presente = editar aquela regra. */
  recorrencia?: Recorrencia | null;
  clienteId: string | null;
  aoFechar: () => void;
  aoSalvar: () => void | Promise<void>;
}

const FORMAS = ['PIX', 'TED', 'Boleto', 'Cartão', 'Dinheiro', 'Débito', 'Outro'];

export function RecorrenciaDialog({ recorrencia, clienteId, aoFechar, aoSalvar }: Props) {
  const { fazendas } = useFazenda();
  const {
    classificacoes, contasBancarias, safras,
    loadClassificacoes, loadContas, loadSafras, criarFornecedor,
  } = useFinanceiroV2();

  useEffect(() => {
    /* FORN-SELETOR-PADRAO-01 fatia 2a — a lista de fornecedores é do leitor único (o seletor a lê); este diálogo não a carrega mais */
    void loadClassificacoes(); void loadContas(); void loadSafras();
  }, [loadClassificacoes, loadContas, loadSafras]);

  const ed = recorrencia ?? null;
  const [descricao, setDescricao] = useState(ed?.descricao ?? '');
  const [fazendaId, setFazendaId] = useState(ed?.fazendaId ?? '');
  const [favorecidoId, setFavorecidoId] = useState(ed?.favorecidoId ?? '');
  const [contaId, setContaId] = useState(ed?.contaBancariaId ?? '');
  /**
   * A CLASSIFICAÇÃO É A DO LANÇAMENTO — PR-FIN-RECORRENCIA-MODAL-01. O mesmo `ClassificacaoLancamento`:
   * atividade primeiro, subcentro filtrado por ela, safra sugerida pela data. Era um `PlanoSubcentroSelect` sozinho,
   * com a lista inteira misturada, e uma safra sem sugestão — a segunda forma de classificar.
   * ⚠ A REGRA GRAVA SÓ `subcentro` E `safra_id` (a `financeiro_recorrencias` não tem cultura, fase, escopo nem chave
   * do plano), e por isso Cultura e Fase ficam ocultas (`ocultarCulturaFase`). A atividade não se grava: na edição
   * ela sai do subcentro (`escopoDoSubcentro`), assim que as classificações carregam.
   * ⚠ O `onChange` RECEBE O UPDATER E O ENTREGA AO `useState` — nunca `fn(value)` aqui (lição do PAR-01a-ii-fix1).
   */
  const [classificacao, setClassificacao] = useState<ClassificacaoValor>({
    atividade: null, safra_id: ed?.safraId ?? '', cultura: '', fase: '', subcentro: ed?.subcentro ?? '',
    macro_custo: '', grupo_custo: '', centro_custo: '', escopo_negocio: '', plano_conta_id: null,
  });
  const subcentro = classificacao.subcentro;
  const safraId = classificacao.safra_id;
  /* Na edição, a atividade e o resumo Macro › Grupo › Centro vêm do plano, quando ele chega. Só preenche o que
     está vazio: depois que o operador mexe, a escolha é dele. */
  useEffect(() => {
    if (!classificacao.subcentro || classificacao.atividade || classificacoes.length === 0) return;
    const alvo = classificacao.subcentro.trim().toLowerCase();
    const cls = classificacoes.find((c) => (c.subcentro || '').trim().toLowerCase() === alvo);
    setClassificacao((c) => (c.atividade ? c : {
      ...c,
      atividade: atividadeValida(escopoDoSubcentro(classificacoes, c.subcentro)),
      macro_custo: cls?.macro_custo ?? c.macro_custo,
      grupo_custo: cls?.grupo_custo ?? c.grupo_custo,
      centro_custo: cls?.centro_custo ?? c.centro_custo,
      escopo_negocio: cls?.escopo_negocio ?? c.escopo_negocio,
      plano_conta_id: cls?.id ?? c.plano_conta_id,
    }));
  }, [classificacoes, classificacao.subcentro, classificacao.atividade]);
  const [fornecedorSearch, setFornecedorSearch] = useState('');
  const [formaPgto, setFormaPgto] = useState(ed?.formaPagamento ?? '');
  const [observacao, setObservacao] = useState(ed?.observacao ?? '');
  /* ⚠ O SINAL VIVE NO VALOR, e o tipo DERIVA dele — a mesma doutrina da tabela,
     onde `tipo_operacao` acompanha `valor_base`. Dois campos para o mesmo fato
     poderiam discordar; aqui o operador escolhe "Saída" e o valor recebe o
     sinal, ou digita negativo e o seletor acompanha. */
  const [ehSaida, setEhSaida] = useState((ed?.valorBase ?? -1) < 0);
  const [valorTexto, setValorTexto] = useState(ed ? String(Math.abs(ed.valorBase)).replace('.', ',') : '');
  /* REC-VALOR-CERTO-01 — dois atributos da REGRA: o valor é certo ou a confirmar (`tipo_valor`), e é folha de pagamento.
     Trocá-los não altera lançamento nenhum e não abre o Propagar (`mudouOQueSePropaga`). Novo nasce "Certo", sem folha. */
  const [valorAConfirmar, setValorAConfirmar] = useState(ed?.valorAConfirmar ?? false);
  const [folha, setFolha] = useState(ed?.folha ?? false);
  const [diaVencimento, setDiaVencimento] = useState(String(ed?.diaVencimento ?? 10));
  const [dataInicio, setDataInicio] = useState(ed?.dataInicio?.slice(0, 10) ?? '');
  /* ⚠ O VENCIMENTO DO 1º DEIXOU DE SER CAMPO. Ele é DERIVADO do cartão no
     submit — a âncora do banco continua sendo as duas datas, mas o operador
     responde de que mês é a conta, não digita a distância. Ao editar, o caminho
     de volta lê o cartão da regra já gravada. */
  const [mesDoFato, setMesDoFato] = useState<MesDoFato>(
    ed ? mesDoFatoDe(ed.dataInicio, ed.primeiroVencimento) : 'anterior',
  );
  const [dataFim, setDataFim] = useState(ed?.dataFim?.slice(0, 10) ?? '');
  const [salvando, setSalvando] = useState(false);
  /* A regra já gravada, esperando a decisão de até onde alcançar o que ela gerou. */
  const [propagar, setPropagar] = useState<{ previa: ResultadoPropagacao | null; recusa: string | null } | null>(null);

  /**
   * ADMINISTRATIVO NÃO TEM SAFRA — FIN-SAFRA-ADM-01, agora também na regra.
   *
   * ⚠ AQUI SÓ O PLANO DECIDE. O modal de lançamento tem o card de Atividade e por isso
   * pergunta aos dois; a recorrência não tem card, então a única fonte é o escopo da linha
   * do plano do subcentro escolhido.
   * ⚠ E QUEM GARANTE É O TRIGGER, não esta linha. Desde o FIN-SAFRA-ADM-03 o
   * `resolve_classificacao_from_plano` zera a safra de qualquer lançamento administrativo —
   * inclusive os que a propagação escrever. O front avisa para o operador não gravar uma
   * regra que promete uma safra que os lançamentos nunca terão.
   */
  const ehAdministrativo = escopoDoSubcentro(classificacoes, subcentro, classificacao.escopo_negocio) === 'administrativo'
    || classificacao.atividade === 'administrativo';

  const valorNum = Number(valorTexto.replace(/\./g, '').replace(',', '.')) || 0;
  /* Uma conta só, usada pela frase E pela gravação: se divergissem, a tela
     prometeria uma data e o banco guardaria outra. */
  const primeiroVenc = dataInicio
    ? primeiroVencimentoDe(dataInicio, Number(diaVencimento) || 1, mesDoFato)
    : '';
  const resumo = resumoVivo(dataInicio, primeiroVenc, dataFim);

  /* ⚠ UMA FRASE, TRÊS USOS: `disabled`, `title` e a dica do rodapé. */
  const impedimento: string | null =
    !descricao.trim() ? 'A descrição identifica a regra na lista.'
    : !fazendaId ? 'Escolha a fazenda — o lançamento gerado pertence a uma.'
    : !contaId ? 'Escolha a conta bancária.'
    : !subcentro ? 'Escolha a classificação.'
    : valorNum <= 0 ? 'O valor precisa ser maior que zero — o sinal vem do tipo.'
    : !dataInicio || !dataFim ? 'O início e o fim formam a âncora: sem eles não há o que repetir.'
    : dataFim.slice(0, 7) < dataInicio.slice(0, 7) ? 'A última competência não pode ser antes da primeira.'
    : null;

  const salvar = async () => {
    if (impedimento || !clienteId) return;
    /**
     * ⚠ SINAL TROCADO COM GERADOS EXISTENTES NÃO SALVA — FIN-RECORR-PROPAGA-01 (ajuste).
     *
     * A RPC já recusava a PROPAGAÇÃO, e isso não bastava: a regra salva de qualquer forma, e
     * o estrago não é a divergência, é a próxima geração. Uma regra que virou Entrada com
     * quatro lançamentos de Saída gerados cria os de Entrada ao lado dos antigos — o mês
     * aparece dobrado, com sinais opostos, e nada na tela diz que foram a mesma conta.
     * ⚠ COM ZERO GERADOS O SINAL MUDA À VONTADE: não há com o que divergir, e uma regra
     * recém-criada que nasceu no tipo errado tem de poder ser corrigida.
     * ⚠ A RECUSA DA RPC CONTINUA, como segunda barreira: esta checagem lê `ed.gerados`, que é
     * a contagem da última carga da lista; a da RPC é feita na transação, com `FOR UPDATE`.
     */
    if (ed && (ed.valorBase < 0) !== ehSaida && ed.gerados > 0) {
      toast.error(
        'Trocar entrada por saída exige nova recorrência. Cancele esta regra e crie outra; '
        + `os ${ed.gerados} lançamentos gerados ficam como estão.`,
      );
      return;
    }
    setSalvando(true);
    try {
      const payload: PayloadDaRegra = {
        cliente_id: clienteId,
        fazenda_id: fazendaId,
        descricao: descricao.trim(),
        favorecido_id: favorecidoId || null,
        conta_bancaria_id: contaId,
        subcentro,
        /* O trigger zeraria de qualquer forma; mandar já nulo evita gravar na REGRA uma
           safra que nenhum lançamento dela vai ter. */
        safra_id: ehAdministrativo ? null : (safraId || null),
        forma_pagamento: formaPgto || null,
        observacao: observacao.trim() || null,
        /* ⚠ O SINAL É O ÚNICO CANAL, e `tipo_operacao` NÃO entra no payload: a
           coluna é GENERATED ALWAYS no banco
           (`CASE WHEN valor_base > 0 THEN '1-Entradas' ELSE '2-Saídas' END`), e
           mandá-la — ainda que com o valor certo — faz o Postgres recusar o
           insert inteiro: "cannot insert a non-DEFAULT value into column
           tipo_operacao". O tooltip do campo já prometia que o sinal vem do
           Tipo ao lado; era a gravação que não cumpria. */
        valor_base: ehSaida ? -Math.abs(valorNum) : Math.abs(valorNum),
        dia_vencimento: Number(diaVencimento) || 1,
        data_inicio: dataInicio,
        primeiro_vencimento: primeiroVenc,
        data_fim: dataFim,
        tipo_valor: valorAConfirmar ? 'estimado' : 'exato',
        folha,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
      const q = (supabase as any).from('financeiro_recorrencias');
      const { error } = ed ? await q.update(payload).eq('id', ed.id) : await q.insert(payload);
      /* A mensagem do Postgres nomeia o invariante violado — as CHECKs da tabela
         cuidam de dia válido, período coerente e periodicidade. */
      if (error) { toast.error(error.message ?? 'O banco recusou a regra.'); return; }
      toast.success(ed ? 'Recorrência atualizada.' : 'Recorrência criada.');
      /* ⚠ SÓ A EDIÇÃO PROPAGA. Uma regra recém-criada não gerou nada — perguntar "até onde
         propagar?" sobre zero lançamentos seria um passo a mais para dizer "nenhum".
         ⚠ E A SIMULAÇÃO USA `'futuros'`, não `'nenhum'`: é o escopo que faz a RPC recusar
         sinal trocado ANTES de escrever. A recusa chega aqui como erro e vira a mensagem do
         diálogo — a regra já está salva, e não se chama de novo. */
      /* ⚠ REC-VALOR-CERTO-01 — TROCAR SÓ O TIPO DO VALOR OU A FOLHA NÃO PROPAGA: são atributos da regra, nenhum lançamento os
         tem. A pergunta "até onde propagar?" só aparece quando mudou algo que o Propagar leva aos lançamentos. */
      if (ed && mudouOQueSePropaga(ed, payload)) {
        const sim = await propagarRecorrencia(ed.id, 'futuros', true);
        if (!sim.ok) { setPropagar({ previa: null, recusa: sim.erro ?? 'O banco recusou a propagação.' }); return; }
        if (sim.dados && sim.dados.futuros + sim.dados.passados > 0) {
          setPropagar({ previa: sim.dados, recusa: null });
          return;
        }
      }
      await aoSalvar();
      aoFechar();
    } finally {
      setSalvando(false);
    }
  };

  /* ⚠ O DIÁLOGO DA PROPAGAÇÃO SUBSTITUI ESTE, não o cobre: a regra já foi gravada, e deixar
     o formulário visível atrás convidaria a editá-lo de novo sobre um estado já salvo. */
  if (propagar) {
    return (
      <PropagarRecorrenciaDialog
        recorrenciaId={ed?.id ?? ''}
        descricao={descricao.trim()}
        previa={propagar.previa}
        recusa={propagar.recusa}
        aoFechar={() => { setPropagar(null); void (async () => { await aoSalvar(); aoFechar(); })(); }}
      />
    );
  }

  return (
    <Dialog open onOpenChange={o => !o && aoFechar()}>
      <DialogContent className="w-[94vw] max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b bg-primary/10 px-4 py-2.5 pr-12 text-left">
          <DialogTitle className="flex items-center gap-1.5 text-[14px] font-medium leading-none text-primary">
            <Repeat className="h-4 w-4" />
            {ed ? 'Editar recorrência' : 'Nova recorrência'}
          </DialogTitle>
          <DialogDescription className="mt-1 text-[11px] leading-snug">
            A recorrência é uma regra: ela não é um lançamento, gera lançamentos previstos.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-2.5 overflow-y-auto px-4 py-3">
          {/* LINHA 1 — Descrição | Tipo | Valor base | O valor é.
              ⚠ LARGURAS EM px, MEDIDAS NA TELA (REC-VALOR-CERTO-01, janela de 1.126): Descrição 268 · Tipo 92 · Valor base 112
              ("99.999.999,99" pede 87 dos 90 úteis — 3px de folga) · "O valor é" 142 (os dois segmentos pedem 117). Nenhum
              número corta. O modal tem 514px em "Certo", em "A confirmar" e com a folha marcada. */}
          <div className="grid grid-cols-[minmax(0,1fr)_92px_112px_142px] gap-2">
            <div className="min-w-0">
              <Label className="text-[10px]">Descrição *</Label>
              <Input value={descricao} onChange={e => setDescricao(e.target.value)}
                className="h-8 text-xs" placeholder="Telefone, internet, mão de obra…" />
            </div>

            <div>
              <Label className="text-[10px]">Tipo *</Label>
              <Select value={ehSaida ? 'saida' : 'entrada'} onValueChange={v => setEhSaida(v === 'saida')}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="saida">Saída</SelectItem>
                  <SelectItem value="entrada">Entrada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[10px]">Valor base *</Label>
              <Input value={valorTexto} onChange={e => setValorTexto(e.target.value)}
                className="h-8 text-xs tabular-nums" placeholder="350,00"
                title="Sempre positivo — o sinal vem do Tipo ao lado." />
            </div>

            <div>
              <Label className="text-[10px]">O valor é *</Label>
              <div className="flex h-8 items-center" data-testid="rec-tipo-do-valor">
                <Segmentado altura={26} valor={valorAConfirmar ? 'a_confirmar' : 'certo'}
                  onEscolher={v => setValorAConfirmar(v === 'a_confirmar')}
                  opcoes={[
                    { valor: 'certo', rotulo: ROTULO_TIPO.certo, title: 'Valor certo: a conta de cada mês nasce com este valor' },
                    { valor: 'a_confirmar', rotulo: ROTULO_TIPO.a_confirmar, title: EXPLICACAO_A_CONFIRMAR },
                  ]} />
              </div>
            </div>
          </div>

          {/* ⚠ SLOT DE ALTURA FIXA, SEMPRE PRESENTE (nada se move): a explicação do "A confirmar" à esquerda — vazia em "Certo"
              — e a caixa da folha à direita. O modal não muda de altura entre os dois estados. */}
          <div className="flex h-[28px] items-start gap-3" data-testid="rec-slot-do-valor">
            <p className="min-w-0 flex-1 text-[10px] leading-[14px] text-muted-foreground" data-testid="rec-explicacao-a-confirmar">
              {valorAConfirmar ? EXPLICACAO_A_CONFIRMAR : ''}
            </p>
            <label className="flex h-[14px] shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-[10px]">
              <Checkbox checked={folha} onCheckedChange={v => setFolha(v === true)} className="h-3.5 w-3.5"
                data-testid="rec-folha" />
              Folha de pagamento
            </label>
          </div>

          {/* LINHA 2 — Conta | Favorecido | Fazenda.
              ⚠ A FAZENDA É NOSSA E NÃO EXISTE NO ORIGINAL: ela entra aqui, na
              linha dos cadastros, porque é da mesma natureza dos dois vizinhos —
              a quem o lançamento pertence. A linha passou de dois para três
              campos; a estrutura das outras não mudou.
              ⚠ LARGURAS MEDIDAS NA TELA (PR-FIN-RECORRENCIA-MODAL-01, janela de 1.130): Conta 207 ("Banco do Brasil
              (8974-3)" pede ~147 + a seta) e Fazenda 150 (as fazendas têm nome curto); o Favorecido fica com o resto —
              era 171 e cortava "Porto Seguro Com…". Nome maior trunca com `title`. */}
          <div className="grid grid-cols-[207px_minmax(0,1fr)_150px] gap-2">
            <div className="min-w-0">
              <Label className="text-[10px]">Conta *</Label>
              <ContaBancariaSelect value={contaId} onValueChange={setContaId}
                contas={contasBancarias} showBankDetails="agencia" placeholder="Selecionar conta" />
            </div>

            <div className="min-w-0">
              <FavorecidoSelect
                value={favorecidoId} onChange={setFavorecidoId}
                /* FORN-SELETOR-PADRAO-01 fatia 2a — a lista é a do leitor único (ativos com documento) */
                clienteId={clienteId} search={fornecedorSearch} onSearchChange={setFornecedorSearch}
                onCriarNovo={() => { /* cadastro inline: o "+" do próprio componente */ }}
                label="Favorecido"
              />
            </div>

            <div className="min-w-0">
              <FazendaSelect value={fazendaId} onChange={setFazendaId} fazendas={fazendas}
                forcaAdministrativo={false} label="Fazenda *" hideAviso />
            </div>
          </div>

          {/* LINHA 3 — A CLASSIFICAÇÃO DO LANÇAMENTO (atividade · subcentro · safra), o mesmo componente.
              ⚠ MONTADO FORA DE GRADE: ele devolve as duas grades dele (ver o aviso no próprio componente).
              ⚠ A SAFRA SE SUGERE PELO PRIMEIRO VENCIMENTO (Início + Dia venc. + de que mês é a conta); sem ele, pelo
              Início. A escolha à mão cala a sugestão; empate sem sigla não escolhe. */}
          <ClassificacaoLancamento
            value={classificacao}
            onChange={setClassificacao}
            classificacoes={classificacoes}
            safras={safras}
            dataCompetencia={primeiroVenc || dataInicio}
            tipoOperacao={ehSaida ? '2-Saídas' : '1-Entradas'}
            ocultarCulturaFase
          />

          {/* LINHA 4 — Periodicidade | Dia venc. | Início | Fim.
              ⚠ A SAFRA SAIU DAQUI (PR-FIN-RECORRENCIA-MODAL-01): mora na grade da classificação, com a sugestão.
              ⚠ LARGURAS MEDIDAS NA TELA: "30/09/2026" pede ~71px a 12px, + o ícone e o padding = 118 cada (eram 154);
              o dia é um número de dois dígitos numa grade, 64 (era 100). */}
          <div className="grid grid-cols-[90px_64px_118px_118px] gap-2">
            <div>
              <Label className="text-[10px]">Periodicidade</Label>
              {/* Só mensal existe — e o campo aparece porque o dia em que uma
                  segunda periodicidade chegar, ela chega neste lugar. */}
              <Select value="mensal" disabled>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="mensal">Mensal</SelectItem></SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[10px]">Dia venc. *</Label>
              <DiaVencimentoGrade value={Number(diaVencimento) || 1} onChange={(d) => setDiaVencimento(String(d))} />
            </div>

            <div>
              <Label className="text-[10px]">Início *</Label>
              <div title="A COMPETÊNCIA do primeiro lançamento — o mês do fato.">
                <DatePicker value={dataInicio} onChange={setDataInicio} className="text-[10px]" />
              </div>
            </div>

            <div>
              <Label className="text-[10px]">Fim *</Label>
              <div title="Limita a COMPETÊNCIA, não o vencimento: com deslocamento, o último pagamento cai depois desta data — e está certo.">
                <DatePicker value={dataFim} onChange={setDataFim} className="text-[10px]" />
              </div>
            </div>

          </div>

          {/* ── DE QUE MÊS É O QUE SE PAGA ──────────────────────────────────
              ⚠ A PERGUNTA EXISTE porque a água consumida em agosto vence em
              setembro, e o fato econômico é agosto. SÃO DUAS OPÇÕES, NÃO UM
              NÚMERO: a mecânica — âncora, deslocamento, primeiro vencimento —
              não aparece, porque o operador sabe de quem é a conta e não precisa
              saber o resto. */}
          <div className="rounded-md border bg-muted/30 p-2">
            <Label className="text-[10px]">O que se paga aqui é de qual mês?</Label>
            <div className="mt-1 grid gap-1 sm:grid-cols-2">
              {OPCOES_MES_DO_FATO.map(o => {
                const sel = mesDoFato === o.valor;
                return (
                  <button key={o.valor} type="button" aria-pressed={sel}
                    onClick={() => setMesDoFato(o.valor)}
                    className={cn('rounded border px-2 py-1.5 text-left transition-colors',
                      sel ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-muted/60')}>
                    <span className="block text-[11px] font-semibold">{o.rotulo}</span>
                    <span className="block text-[9px] leading-tight text-muted-foreground">{o.exemplo}</span>
                  </button>
                );
              })}
            </div>
            {/* ⚠ A CONSEQUÊNCIA, com os valores que ele acabou de escolher — e
                some quando falta data, em vez de narrar meia verdade. */}
            {resumo && (
              <p className="mt-1.5 rounded bg-primary/10 px-2 py-1 text-[11px] leading-snug text-primary">
                {resumo}
              </p>
            )}
            {/* Dia 29-31 tem consequência visível; dizê-la aqui evita a surpresa
                de ver 28/02 numa regra cadastrada como 31. */}
            {Number(diaVencimento) > 28 && (
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                Em meses mais curtos o vencimento cai no último dia — dia {diaVencimento} vira 28/02
                e 30/04. O dia escolhido não muda.
              </p>
            )}
          </div>

          {/* LINHA FINAL — os dois campos nossos que o original não tem. Ficam
              no fim de propósito: são opcionais e não participam da âncora, e
              pô-los antes empurraria a pergunta do mês para baixo da dobra. */}
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-4">
              <Label className="text-[10px]">Forma de pagamento</Label>
              <Select value={formaPgto || '__none__'} onValueChange={v => setFormaPgto(v === '__none__' ? '' : v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {FORMAS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-8">
              <Label className="text-[10px]">Observação</Label>
              <Textarea value={observacao} onChange={e => setObservacao(e.target.value)}
                rows={2} className="resize-none text-xs" />
            </div>
          </div>
        </div>

        <DialogFooter className="items-center gap-2 border-t bg-accent px-4 py-2.5 sm:justify-between">
          <span className="text-[10px] leading-snug text-muted-foreground">{impedimento ?? ''}</span>
          <span className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={aoFechar}>Cancelar</Button>
            <Button type="button" size="sm" className="gap-1.5"
              disabled={impedimento !== null || salvando}
              title={impedimento ?? undefined}
              onClick={() => { void salvar(); }}>
              {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {ed ? 'Salvar' : 'Criar recorrência'}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
