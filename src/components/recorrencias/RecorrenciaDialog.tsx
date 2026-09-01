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
import { PlanoSubcentroSelect } from '@/components/shared/PlanoSubcentroSelect';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import {
  resumoVivo, primeiroVencimentoDe, mesDoFatoDe,
  type Recorrencia, type MesDoFato,
} from '@/hooks/useRecorrencias';
import { cn } from '@/lib/utils';

/** As duas respostas. O rótulo diz o QUE, o exemplo diz QUANDO usar. */
const OPCOES_MES_DO_FATO: readonly { valor: MesDoFato; rotulo: string; exemplo: string }[] = [
  { valor: 'proprio',  rotulo: 'Do próprio mês', exemplo: 'assinaturas, mensalidades, honorários' },
  { valor: 'anterior', rotulo: 'Do mês anterior', exemplo: 'água, luz, telefone — consumo medido' },
];

/** Dias oferecidos: 1 a 31. O aparo de mês curto é do calendário, não da lista. */
const DIAS_VENCIMENTO = Array.from({ length: 31 }, (_, i) => i + 1);

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
    classificacoes, fornecedores, contasBancarias, safras,
    loadClassificacoes, loadFornecedores, loadContas, loadSafras, criarFornecedor,
  } = useFinanceiroV2();

  useEffect(() => {
    void loadClassificacoes(); void loadFornecedores(); void loadContas(); void loadSafras();
  }, [loadClassificacoes, loadFornecedores, loadContas, loadSafras]);

  const ed = recorrencia ?? null;
  const [descricao, setDescricao] = useState(ed?.descricao ?? '');
  const [fazendaId, setFazendaId] = useState(ed?.fazendaId ?? '');
  const [favorecidoId, setFavorecidoId] = useState(ed?.favorecidoId ?? '');
  const [contaId, setContaId] = useState(ed?.contaBancariaId ?? '');
  const [subcentro, setSubcentro] = useState(ed?.subcentro ?? '');
  const [subcentroSearch, setSubcentroSearch] = useState('');
  const [fornecedorSearch, setFornecedorSearch] = useState('');
  const [safraId, setSafraId] = useState(ed?.safraId ?? '');
  const [formaPgto, setFormaPgto] = useState(ed?.formaPagamento ?? '');
  const [observacao, setObservacao] = useState(ed?.observacao ?? '');
  /* ⚠ O SINAL VIVE NO VALOR, e o tipo DERIVA dele — a mesma doutrina da tabela,
     onde `tipo_operacao` acompanha `valor_base`. Dois campos para o mesmo fato
     poderiam discordar; aqui o operador escolhe "Saída" e o valor recebe o
     sinal, ou digita negativo e o seletor acompanha. */
  const [ehSaida, setEhSaida] = useState((ed?.valorBase ?? -1) < 0);
  const [valorTexto, setValorTexto] = useState(ed ? String(Math.abs(ed.valorBase)).replace('.', ',') : '');
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
    setSalvando(true);
    try {
      const payload = {
        cliente_id: clienteId,
        fazenda_id: fazendaId,
        descricao: descricao.trim(),
        favorecido_id: favorecidoId || null,
        conta_bancaria_id: contaId,
        subcentro,
        safra_id: safraId || null,
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
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
      const q = (supabase as any).from('financeiro_recorrencias');
      const { error } = ed ? await q.update(payload).eq('id', ed.id) : await q.insert(payload);
      /* A mensagem do Postgres nomeia o invariante violado — as CHECKs da tabela
         cuidam de dia válido, período coerente e periodicidade. */
      if (error) { toast.error(error.message ?? 'O banco recusou a regra.'); return; }
      toast.success(ed ? 'Recorrência atualizada.' : 'Recorrência criada.');
      await aoSalvar();
      aoFechar();
    } finally {
      setSalvando(false);
    }
  };

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
          {/* LINHA 1 — Descrição | Tipo | Valor base */}
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-6">
              <Label className="text-[10px]">Descrição *</Label>
              <Input value={descricao} onChange={e => setDescricao(e.target.value)}
                className="h-8 text-xs" placeholder="Telefone, internet, mão de obra…" />
            </div>

            <div className="col-span-3">
              <Label className="text-[10px]">Tipo *</Label>
              <Select value={ehSaida ? 'saida' : 'entrada'} onValueChange={v => setEhSaida(v === 'saida')}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="saida">Saída</SelectItem>
                  <SelectItem value="entrada">Entrada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-3">
              <Label className="text-[10px]">Valor base *</Label>
              <Input value={valorTexto} onChange={e => setValorTexto(e.target.value)}
                className="h-8 text-xs tabular-nums" placeholder="350,00"
                title="Sempre positivo — o sinal vem do Tipo ao lado." />
            </div>
          </div>

          {/* LINHA 2 — Conta | Favorecido | Fazenda.
              ⚠ A FAZENDA É NOSSA E NÃO EXISTE NO ORIGINAL: ela entra aqui, na
              linha dos cadastros, porque é da mesma natureza dos dois vizinhos —
              a quem o lançamento pertence. A linha passou de dois para três
              campos; a estrutura das outras não mudou. */}
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-4">
              <Label className="text-[10px]">Conta *</Label>
              <ContaBancariaSelect value={contaId} onValueChange={setContaId}
                contas={contasBancarias} showBankDetails="agencia" placeholder="Selecionar conta" />
            </div>

            <div className="col-span-4">
              <FavorecidoSelect
                value={favorecidoId} onChange={setFavorecidoId}
                fornecedores={fornecedores} search={fornecedorSearch} onSearchChange={setFornecedorSearch}
                onCriarNovo={() => { /* cadastro inline: o "+" do próprio componente */ }}
                label="Favorecido"
              />
            </div>

            <div className="col-span-4">
              <FazendaSelect value={fazendaId} onChange={setFazendaId} fazendas={fazendas}
                forcaAdministrativo={false} label="Fazenda *" hideAviso />
            </div>
          </div>

          {/* LINHA 3 — Classificação em largura cheia, com a cadeia como apoio.
              O gatilho mostra a folha; sem a legenda, "Energia" não diz de qual
              ramo veio. */}
          <div>
            <PlanoSubcentroSelect
              value={subcentro} onChange={setSubcentro}
              classificacoes={classificacoes}
              tipoOperacao={ehSaida ? '2-Saídas' : '1-Entradas'}
              search={subcentroSearch} onSearchChange={setSubcentroSearch}
              label="Classificação *"
            />
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={subcentro || undefined}>
              {subcentro || 'Macro › Grupo › Centro'}
            </p>
          </div>

          {/* LINHA 4 — Periodicidade | Dia venc. | Início | Fim | Safra.
              ⚠ A SAFRA OCUPA AS DUAS COLUNAS QUE ERAM DO "Valor fixo/variável"
              do original: aqui não há `tipo_valor` no banco, e o campo não teria
              onde gravar. A largura da linha e a das demais não mudaram. */}
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-2">
              <Label className="text-[10px]">Periodicidade</Label>
              {/* Só mensal existe — e o campo aparece porque o dia em que uma
                  segunda periodicidade chegar, ela chega neste lugar. */}
              <Select value="mensal" disabled>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="mensal">Mensal</SelectItem></SelectContent>
              </Select>
            </div>

            <div className="col-span-2">
              <Label className="text-[10px]">Dia venc. *</Label>
              <Select value={String(Number(diaVencimento) || 1)}
                onValueChange={v => setDiaVencimento(v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DIAS_VENCIMENTO.map(d => (
                    <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Início e Fim em 3 colunas: dd/mm/aaaa mais o ícone de calendário
                não cabem em 2, e a data sairia cortada em "31/12/202". */}
            <div className="col-span-3">
              <Label className="text-[10px]">Início *</Label>
              <div title="A COMPETÊNCIA do primeiro lançamento — o mês do fato.">
                <DatePicker value={dataInicio} onChange={setDataInicio} className="text-[10px]" />
              </div>
            </div>

            <div className="col-span-3">
              <Label className="text-[10px]">Fim *</Label>
              <div title="Limita a COMPETÊNCIA, não o vencimento: com deslocamento, o último pagamento cai depois desta data — e está certo.">
                <DatePicker value={dataFim} onChange={setDataFim} className="text-[10px]" />
              </div>
            </div>

            <div className="col-span-2">
              <Label className="text-[10px]">Safra</Label>
              <Select value={safraId || '__none__'} onValueChange={v => setSafraId(v === '__none__' ? '' : v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem safra</SelectItem>
                  {(safras ?? []).map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
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
