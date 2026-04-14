import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from '@/components/ui/table';
import { useFinanciamentoCadastro, FinanciamentoForm } from '@/hooks/useFinanciamentoCadastro';

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
  } = useFinanciamentoCadastro();

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
  }, [form.valor_total, form.valor_entrada, form.total_parcelas, form.taxa_juros_mensal, form.data_primeira_parcela]);

  const handleSalvar = async () => {
    const ok = await salvar();
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
              <Select value={form.credor_id} onValueChange={v => set('credor_id', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {fornecedores.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

          <div className="grid grid-cols-2 gap-3">
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
              <Label className="text-xs">Juros mensal (%)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={form.taxa_juros_mensal || ''}
                onChange={e => set('taxa_juros_mensal', Number(e.target.value))}
              />
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

      {/* Seção 4 – Preview de parcelas */}
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
