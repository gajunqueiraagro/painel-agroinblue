import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from '@/components/ui/table';
import { useFinanciamentoCadastro, FinanciamentoForm, NaturezaContrato } from '@/hooks/useFinanciamentoCadastro';
import { DestinacoesForm, DestinacaoItem } from '@/components/financiamentos/DestinacoesForm';
import { CredorAutocomplete } from '@/components/financiamentos/CredorAutocomplete';

/* 2a — a frase de apoio de cada natureza. Ela é o que separa "Empréstimo" de
   "Financiamento" para quem não é do financeiro: a diferença é o bem vinculado,
   e sem dizê-la o operador escolhe pelo nome que soa melhor. */
const APOIO_NATUREZA: Record<NaturezaContrato, string> = {
  financiamento: 'Crédito com bem vinculado',
  parcelamento: 'Compra ou despesa dividida em N vezes, sem juros',
  emprestimo: 'Crédito sem bem vinculado',
};

interface FinanciamentoCadastroProps {
  onVoltar?: () => void;
  onSalvo?: () => void;
}

export default function FinanciamentoCadastro({ onVoltar, onSalvo }: FinanciamentoCadastroProps = {}) {
  const {
    form, setForm,
    parcelas,
    gerarParcelas,
    updateParcela,
    totalParcelas,
    salvar, saving,
    fornecedores, contas,
    planosEntrada, planosSaida, planosParcelamento,
    clienteId,
  } = useFinanciamentoCadastro();

  const [destinacoes, setDestinacoes] = useState<DestinacaoItem[]>([]);

  /* PR-PARC-02 — 2c/2d — a natureza decide o que a tela mostra. Um só booleano,
     lido em todos os pontos, para não haver duas leituras da mesma decisão. */
  const ehParcelamento = form.natureza === 'parcelamento';

  const set = useCallback(
    <K extends keyof FinanciamentoForm>(k: K, v: FinanciamentoForm[K]) =>
      setForm(prev => ({ ...prev, [k]: v })),
    [setForm],
  );

  // Auto-gerar parcelas quando campos relevantes mudarem
  useEffect(() => {
    if (form.valor_total > 0 && form.total_parcelas > 0 && form.data_primeira_parcela) {
      gerarParcelas();
    }
  }, [form.valor_total, form.valor_entrada, form.total_parcelas, form.taxa_juros_anual, form.data_primeira_parcela, form.frequencia_parcela]);

  /**
   * O QUE FALTA PARA CADASTRAR — a "pendência" da referência.
   *
   * ⚠ NENHUMA REGRA NOVA: são os mesmos campos que o gravador já exige, ditos
   * ANTES do clique em vez de depois da recusa. A ordem é a do formulário,
   * para o operador achar o campo pelo caminho que já está percorrendo.
   */
  const pendencia: string | null =
    !form.descricao?.trim() ? 'Informe a descrição do contrato.'
    : !Number(form.valor_total) ? 'Informe o valor total.'
    : !form.data_contrato ? 'Informe a data do contrato.'
    : !form.data_primeira_parcela ? 'Informe a data da 1ª parcela.'
    : !Number(form.total_parcelas) ? 'Informe o número de parcelas.'
    /* ⚠ ÚLTIMA DA CADEIA PORQUE É A ÚLTIMA DO FORMULÁRIO: a classificação da
       parcela mora na seção Plano de Contas, depois de todos os campos acima —
       e a ordem desta cadeia é a ordem em que o operador percorre a tela.
       Só vale para parcelamento: no financiamento a conta de amortização
       continua opcional, como sempre foi. O toast do `salvar()` permanece como
       segunda barreira — esta aqui evita a recusa, não a substitui. */
    : (ehParcelamento && !form.plano_conta_parcela_id) ? 'Escolha a classificação da parcela'
    : null;
  
  const handleSalvar = async () => {
    const ok = await salvar(destinacoes);
    if (ok) onSalvo?.();
  };

  const fmtMoney = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="min-h-screen bg-background p-4 max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onVoltar}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-none text-foreground">Novo Financiamento</h1>
          {/* ⚠ A FRASE DE DOUTRINA DA REFERÊNCIA, verbatim: ela ensina a cadeia
              inteira numa linha, e é o que separa "cadastrar uma dívida" de
              "contratar um compromisso que gera lançamentos por anos". Quem lê
              não estranha as parcelas aparecendo no caixa depois. */}
          <p className="mt-1 text-xs text-muted-foreground">
            Um compromisso contratado. Ele gera as parcelas, e as parcelas geram os lançamentos.
          </p>
        </div>
        <span className="text-[10px] text-muted-foreground ml-auto">Vinculado automaticamente à fazenda Administrativo</span>
      </div>

      {/* Seção 1 – Dados do contrato */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Dados do Contrato</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* ⚠ PRIMEIRO CAMPO DO FORMULÁRIO — PR-PARC-02 item 2a. Ele governa o
              resto da tela (esconde juros e captação, troca a lista da
              classificação da parcela), e um campo que muda os outros não pode
              vir depois deles: o operador preencheria para ver sumir. */}
          <div>
            <Label className="text-xs">Natureza *</Label>
            <Select value={form.natureza} onValueChange={v => set('natureza', v as NaturezaContrato)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="financiamento">Financiamento</SelectItem>
                <SelectItem value="parcelamento">Parcelamento</SelectItem>
                <SelectItem value="emprestimo">Empréstimo</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{APOIO_NATUREZA[form.natureza]}</p>
          </div>
          <div>
            <Label className="text-xs">Descrição *</Label>
            <Input
              value={form.descricao}
              onChange={e => set('descricao', e.target.value)}
              placeholder="Ex: Custeio safra 2025"
            />
          </div>
          <div>
            <Label className="text-xs">Número do contrato</Label>
            <Input
              value={form.numero_contrato}
              onChange={e => set('numero_contrato', e.target.value)}
              placeholder="Ex: 0123456-78/2024"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              {/* PR-PARC-02 — 2b — "Escopo", não "Tipo": desde que a natureza
                  existe, "tipo" ficou ambíguo. A coluna e os valores continuam
                  `tipo_financiamento` / pecuaria|agricultura — muda o rótulo. */}
              <Label className="text-xs">Escopo *</Label>
              <Select value={form.tipo_financiamento} onValueChange={v => set('tipo_financiamento', v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pecuaria">Pecuária</SelectItem>
                  <SelectItem value="agricultura">Agricultura</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Credor</Label>
              {clienteId && (
                <CredorAutocomplete
                  value={form.credor_id || ''}
                  onChange={(id) => set('credor_id', id)}
                  clienteId={clienteId}
                />
              )}
            </div>
          </div>

          <div>
            <Label className="text-xs">Conta bancária</Label>
            {/* PR-H2 — ContaBancariaSelect compartilhado (display nome + banco). */}
            <ContaBancariaSelect
              value={form.conta_bancaria_id}
              onValueChange={(v) => set('conta_bancaria_id', v)}
              contas={contas}
              placeholder="Selecione"
              showBankDetails="banco"
            />
          </div>

          {/* ⚠ CRONOGRAMA COMO BLOCO NOMEADO — a referência agrupa valor, parcelas e
              vencimento sob um título de 10px em versalete, e o motivo é que os três
              juntos SÃO uma decisão só: mudar um recalcula os outros. Soltos entre
              outros campos, pareciam independentes. */}
          <p className="mb-1.5 mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-primary">
            Cronograma
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Valor total *</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={form.valor_total || ''}
                onChange={e => set('valor_total', Number(e.target.value))}
              />
            </div>
            <div>
              <Label className="text-xs">Valor entrada</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={form.valor_entrada || ''}
                onChange={e => set('valor_entrada', Number(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Data do contrato *</Label>
              <Input
                type="date"
                value={form.data_contrato}
                onChange={e => set('data_contrato', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Data 1ª parcela *</Label>
              <Input
                type="date"
                value={form.data_primeira_parcela}
                onChange={e => set('data_primeira_parcela', e.target.value)}
              />
            </div>
          </div>

          {/* ⚠ A GRADE ENCOLHE DE 3 PARA 2 COLUNAS quando os juros somem — item 2c.
              Esconder a terceira célula mantendo `grid-cols-3` deixaria um terço
              da linha vazio à direita, e um buraco na grade lê-se como campo que
              faltou carregar. */}
          <div className={`grid gap-3 ${ehParcelamento ? 'grid-cols-2' : 'grid-cols-3'}`}>
            <div>
              <Label className="text-xs">Nº parcelas *</Label>
              <Input
                type="number"
                min={1}
                value={form.total_parcelas || ''}
                onChange={e => set('total_parcelas', Number(e.target.value))}
              />
            </div>
            <div>
              <Label className="text-xs">Frequência de vencimento</Label>
              <Select value={form.frequencia_parcela} onValueChange={v => set('frequencia_parcela', v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="bimestral">Bimestral</SelectItem>
                  <SelectItem value="trimestral">Trimestral</SelectItem>
                  <SelectItem value="semestral">Semestral</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!ehParcelamento && (
              <div>
                <Label className="text-xs">Juros anual (%)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.taxa_juros_anual || ''}
                  onChange={e => set('taxa_juros_anual', Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {form.taxa_juros_anual > 0
                    ? `≈ ${((Math.pow(1 + form.taxa_juros_anual / 100, 1 / 12) - 1) * 100).toFixed(4)}% a.m.`
                    : ''}
                </p>
              </div>
            )}
          </div>
            {/* ⚠ A FRASE DO ARREDONDAMENTO, verbatim da referência: sem ela o
                operador soma as parcelas na mão, acha centavos de diferença e
                duvida do sistema. Dizer QUEM calcula e ONDE a sobra cai encerra a
                dúvida antes dela nascer. */}
            {/* 2e — a MESMA linha de apoio do bloco de parcelas, com o texto da
                natureza: no parcelamento ela precisa dizer que não há juros, ou
                a prévia com a coluna Juros zerada parece cálculo pendente. */}
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              {ehParcelamento
                ? 'Sem juros. O valor de cada parcela é o total dividido por N; a última absorve o arredondamento.'
                : 'O valor de cada parcela é calculado pelo sistema e aparece na prévia abaixo. A última absorve o arredondamento.'}
            </p>

          <div>
            <Label className="text-xs">Observação</Label>
            <Textarea
              rows={2}
              value={form.observacao}
              onChange={e => set('observacao', e.target.value)}
              placeholder="Observações opcionais"
            />
          </div>
        </CardContent>
      </Card>

      {/* Seção 2 – Plano de contas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Plano de Contas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* 2c — SEM CAPTAÇÃO NO PARCELAMENTO: o dinheiro não entra, a despesa é
              que sai em N vezes. Escondido, não desabilitado — um campo cinza
              ainda faz o operador procurar como habilitá-lo. */}
          {!ehParcelamento && (
          <div>
            <Label className="text-xs">Conta de captação</Label>
            <Select value={form.plano_conta_captacao_id} onValueChange={v => set('plano_conta_captacao_id', v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {planosEntrada.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.subcentro || p.centro_custo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* ⚠ A LEGENDA DA CADEIA, como na referência: o gatilho mostra só a
                folha, e sem ela "Juros" não diz de qual ramo veio. Aqui o campo
                grava o ID do plano — por isso o seletor continua sendo o de IDs, e
                não o `PlanoSubcentroSelect`, que grava subcentro por TEXTO: trocá-lo
                mudaria o dado gravado, e este PR é roupa. */}
            <p className="mt-0.5 text-[10px] text-muted-foreground">Macro › Grupo › Centro</p>
          </div>
          )}
          {/* ⚠ 2d — O MESMO CAMPO, DOIS PAPÉIS. `plano_conta_parcela_id` não muda:
              no financiamento ele é a conta de amortização (Saída Financeira);
              no parcelamento é a classificação da DESPESA, e por isso a lista é
              outra — `planosParcelamento`, saídas operacionais. Rótulo e lista
              seguem a natureza; a coluna gravada é a mesma. */}
          <div>
            <Label className="text-xs">
              {ehParcelamento ? 'Classificação da parcela *' : 'Conta de amortização'}
            </Label>
            <Select value={form.plano_conta_parcela_id} onValueChange={v => set('plano_conta_parcela_id', v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {(ehParcelamento ? planosParcelamento : planosSaida).map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.subcentro || p.centro_custo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* ⚠ A LEGENDA DA CADEIA, como na referência: o gatilho mostra só a
                folha, e sem ela "Juros" não diz de qual ramo veio. Aqui o campo
                grava o ID do plano — por isso o seletor continua sendo o de IDs, e
                não o `PlanoSubcentroSelect`, que grava subcentro por TEXTO: trocá-lo
                mudaria o dado gravado, e este PR é roupa. */}
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {ehParcelamento
                ? 'Cada parcela vira um lançamento nesta classificação'
                : 'Macro › Grupo › Centro'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Seção 3 – Captação */}
      {/* 2c — O CARD INTEIRO SOME NO PARCELAMENTO, não só o checkbox: um card
          "Captação" vazio anuncia uma etapa que não existe neste contrato. */}
      {!ehParcelamento && (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Captação</CardTitle>
        </CardHeader>
        <CardContent>
          {/* ⚠ ESTE CHECKBOX DECIDE SE O DINHEIRO ENTRA NO CAIXA, e passar
              despercebido custa caro: o caso N33 desta semana nasceu dele desmarcado
              — o contrato existia, as parcelas existiam, e a entrada da captação
              nunca apareceu no fluxo. Era uma linha cinza entre outras; agora tem
              moldura, e a consequência de CADA estado está escrita ao lado. */}
          <div className={`rounded-md border px-2.5 py-2 transition-colors ${
            form.gerar_lancamento_captacao
              ? 'border-success/40 bg-success/5'
              : 'border-warning/40 bg-warning/10'}`}>
            <div className="flex items-center gap-2">
              <Checkbox
                id="captacao"
                checked={form.gerar_lancamento_captacao}
                onCheckedChange={v => set('gerar_lancamento_captacao', !!v)}
              />
              <Label htmlFor="captacao" className="cursor-pointer text-xs font-medium">
                Registrar entrada da captação no fluxo de caixa
              </Label>
            </div>
            <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
              {form.gerar_lancamento_captacao
                ? 'O valor contratado entra como recebimento na data do contrato — o caixa mostra o dinheiro que chegou.'
                : 'Sem marcar, o contrato e as parcelas nascem, mas a entrada NÃO aparece no caixa. Marque se o dinheiro caiu na conta.'}
            </p>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Seção 5 – Destinações do contrato */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <h3 className="font-semibold text-sm">Destinação do Contrato</h3>
        <p className="text-xs text-muted-foreground">
          Como o valor contratado será distribuído (opcional — pode ser preenchido depois)
        </p>
        <DestinacoesForm
          clienteId={clienteId}
          valorContrato={form.valor_total}
          destinacoes={destinacoes}
          onChange={setDestinacoes}
        />
      </div>

      {/* Seção 6 – Preview de parcelas */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Parcelas ({parcelas.length})</CardTitle>
          <Button variant="outline" size="sm" onClick={gerarParcelas} className="h-7 text-xs gap-1">
            <RefreshCw className="h-3 w-3" /> Recalcular
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {parcelas.length === 0 ? (
            <p className="text-xs text-muted-foreground p-4">
              Preencha valor total, nº de parcelas e data da 1ª parcela para gerar o preview.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Principal</TableHead>
                    <TableHead>Juros</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parcelas.map((p, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-[10px]">{p.numero}</TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          className="h-6 text-[10px] px-1"
                          value={p.data_vencimento}
                          onChange={e => updateParcela(idx, 'data_vencimento', e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          className="h-6 text-[10px] px-1 w-24"
                          value={p.valor_principal}
                          onChange={e => updateParcela(idx, 'valor_principal', Number(e.target.value))}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          className="h-6 text-[10px] px-1 w-24"
                          value={p.valor_juros}
                          onChange={e => updateParcela(idx, 'valor_juros', Number(e.target.value))}
                        />
                      </TableCell>
                      <TableCell className="text-right text-[10px] font-semibold">
                        {fmtMoney(p.valor_principal + p.valor_juros)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="text-right font-semibold text-xs">
                      Total
                    </TableCell>
                    <TableCell className="text-right font-bold text-xs">
                      {fmtMoney(totalParcelas)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Botão salvar */}
      {/* ⚠ A PENDÊNCIA VIVA ao lado do botão — a regra da referência, e o motivo
          é o mesmo desta casa: botão desabilitado sem motivo transfere ao
          operador o trabalho de adivinhar. Aqui ele nem desabilitava — salvava e
          o banco recusava depois. Uma frase, três usos: disabled, title e dica. */}
      <div className="flex items-center justify-end gap-3 pb-8">
        {pendencia && (
          <p className="text-[11px] text-muted-foreground">
            <span className="font-medium text-warning">Pendência:</span> {pendencia}
          </p>
        )}
        <Button onClick={handleSalvar} disabled={saving || pendencia !== null}
          title={pendencia ?? undefined} className="gap-1">
          <Plus className="h-4 w-4" />
          {saving ? 'Salvando...' : 'Cadastrar Financiamento'}
        </Button>
      </div>
    </div>
  );
}
