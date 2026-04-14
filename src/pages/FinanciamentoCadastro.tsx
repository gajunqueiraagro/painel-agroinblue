import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, RefreshCw, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from '@/components/ui/table';
import { useFinanciamentoCadastro, FinanciamentoForm } from '@/hooks/useFinanciamentoCadastro';
import { DestinacoesForm, DestinacaoItem } from '@/components/financiamentos/DestinacoesForm';

export default function FinanciamentoCadastro() {
  const navigate = useNavigate();
  const {
    form, setForm,
    parcelas,
    gerarParcelas,
    updateParcela,
    totalParcelas,
    salvar, saving,
    fornecedores, contas,
    planosEntrada, planosSaida,
    clienteId,
  } = useFinanciamentoCadastro();

  const [credorOpen, setCredorOpen] = useState(false);
  const [destinacoes, setDestinacoes] = useState<DestinacaoItem[]>([]);

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

  const handleSalvar = async () => {
    const ok = await salvar(destinacoes);
    if (ok) navigate('/financiamentos');
  };

  const fmtMoney = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="min-h-screen bg-background p-4 max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate('/financiamentos')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-bold text-foreground">Novo Financiamento</h1>
      </div>

      {/* Seção 1 – Dados do contrato */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Dados do Contrato</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Descrição *</Label>
            <Input
              value={form.descricao}
              onChange={e => set('descricao', e.target.value)}
              placeholder="Ex: Custeio safra 2025"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tipo *</Label>
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
              <Popover open={credorOpen} onOpenChange={setCredorOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {form.credor_id
                      ? fornecedores.find(f => f.id === form.credor_id)?.nome
                      : 'Selecionar credor...'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput placeholder="Buscar credor..." />
                    <CommandEmpty>Nenhum credor encontrado.</CommandEmpty>
                    <CommandList>
                      <CommandGroup>
                        {fornecedores.map(f => (
                          <CommandItem
                            key={f.id}
                            value={f.nome}
                            onSelect={() => { set('credor_id', f.id); setCredorOpen(false); }}
                          >
                            {f.nome}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div>
            <Label className="text-xs">Conta bancária</Label>
            <Select value={form.conta_bancaria_id} onValueChange={v => set('conta_bancaria_id', v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {contas.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome_exibicao || c.nome_conta}{c.banco ? ` (${c.banco})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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

          <div className="grid grid-cols-3 gap-3">
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
          </div>

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
          </div>
          <div>
            <Label className="text-xs">Conta de amortização</Label>
            <Select value={form.plano_conta_parcela_id} onValueChange={v => set('plano_conta_parcela_id', v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {planosSaida.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.subcentro || p.centro_custo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Seção 3 – Captação */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Captação</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Checkbox
              id="captacao"
              checked={form.gerar_lancamento_captacao}
              onCheckedChange={v => set('gerar_lancamento_captacao', !!v)}
            />
            <Label htmlFor="captacao" className="text-xs cursor-pointer">
              Registrar entrada da captação no fluxo de caixa
            </Label>
          </div>
        </CardContent>
      </Card>

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
      <div className="flex justify-end pb-8">
        <Button onClick={handleSalvar} disabled={saving} className="gap-1">
          <Plus className="h-4 w-4" />
          {saving ? 'Salvando...' : 'Cadastrar Financiamento'}
        </Button>
      </div>
    </div>
  );
}
