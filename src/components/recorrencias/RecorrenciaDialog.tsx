import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { resumoVivo, type Recorrencia } from '@/hooks/useRecorrencias';

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
  const [primeiroVenc, setPrimeiroVenc] = useState(ed?.primeiroVencimento?.slice(0, 10) ?? '');
  const [dataFim, setDataFim] = useState(ed?.dataFim?.slice(0, 10) ?? '');
  const [salvando, setSalvando] = useState(false);

  const valorNum = Number(valorTexto.replace(/\./g, '').replace(',', '.')) || 0;
  const resumo = resumoVivo(dataInicio, primeiroVenc, dataFim, Number(diaVencimento) || 1);

  /* ⚠ UMA FRASE, TRÊS USOS: `disabled`, `title` e a dica do rodapé. */
  const impedimento: string | null =
    !descricao.trim() ? 'A descrição identifica a regra na lista.'
    : !fazendaId ? 'Escolha a fazenda — o lançamento gerado pertence a uma.'
    : !contaId ? 'Escolha a conta bancária.'
    : !subcentro ? 'Escolha a classificação.'
    : valorNum <= 0 ? 'O valor precisa ser maior que zero — o sinal vem do tipo.'
    : !dataInicio || !primeiroVenc || !dataFim ? 'As três datas formam a âncora: sem elas não há o que repetir.'
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
        /* O sinal é do valor. `tipo_operacao` acompanha, para quem lê a regra
           sem recalcular. */
        valor_base: ehSaida ? -Math.abs(valorNum) : Math.abs(valorNum),
        tipo_operacao: ehSaida ? '2-Saídas' : '1-Entradas',
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
            A regra que se repete todo mês. Os lançamentos nascem dela e são normais em todo o resto.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-2.5 overflow-y-auto px-4 py-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Label className="text-[10px]">Descrição *</Label>
              <Input value={descricao} onChange={e => setDescricao(e.target.value)}
                className="h-8 text-xs" placeholder="Telefone, internet, mão de obra…" />
            </div>

            <FazendaSelect value={fazendaId} onChange={setFazendaId} fazendas={fazendas}
              forcaAdministrativo={false} label="Fazenda *" hideAviso />

            <div>
              <Label className="text-[10px]">Conta bancária *</Label>
              <ContaBancariaSelect value={contaId} onValueChange={setContaId}
                contas={contasBancarias} showBankDetails="agencia" placeholder="Selecionar conta" />
            </div>

            <div className="col-span-2">
              <FavorecidoSelect
                value={favorecidoId} onChange={setFavorecidoId}
                fornecedores={fornecedores} search={fornecedorSearch} onSearchChange={setFornecedorSearch}
                onCriarNovo={() => { /* cadastro inline: o "+" do próprio componente */ }}
                label="Favorecido"
              />
            </div>

            <div className="col-span-2">
              <PlanoSubcentroSelect
                value={subcentro} onChange={setSubcentro}
                classificacoes={classificacoes}
                tipoOperacao={ehSaida ? '2-Saídas' : '1-Entradas'}
                search={subcentroSearch} onSearchChange={setSubcentroSearch}
                label="Classificação *"
              />
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
              <Label className="text-[10px]">Valor *</Label>
              <Input value={valorTexto} onChange={e => setValorTexto(e.target.value)}
                className="h-8 text-xs tabular-nums" placeholder="350,00"
                title="Sempre positivo — o sinal vem do Tipo ao lado." />
            </div>

            <div>
              <Label className="text-[10px]">Safra</Label>
              <Select value={safraId || '__none__'} onValueChange={v => setSafraId(v === '__none__' ? '' : v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sem safra" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem safra</SelectItem>
                  {(safras ?? []).map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[10px]">Forma de pagamento</Label>
              <Select value={formaPgto || '__none__'} onValueChange={v => setFormaPgto(v === '__none__' ? '' : v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {FORMAS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── A ÂNCORA ────────────────────────────────────────────────────
              ⚠ AS TRÊS DATAS JUNTAS, e os rótulos dizem o que cada uma é. Elas
              não são "início, meio e fim": duas declaram a RELAÇÃO entre consumo
              e pagamento, e a terceira diz até quando repetir. */}
          <div className="rounded-md border bg-muted/30 px-3 py-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Quando acontece
            </p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <div>
                <Label className="text-[10px]">Competência do 1º *</Label>
                <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                  className="h-8 text-xs"
                  title="O mês do FATO do primeiro lançamento — o mês do consumo." />
              </div>
              <div>
                <Label className="text-[10px]">Vencimento do 1º *</Label>
                <Input type="date" value={primeiroVenc} onChange={e => setPrimeiroVenc(e.target.value)}
                  className="h-8 text-xs"
                  title="Quando esse primeiro é pago. A distância entre esta data e a competência é o que se repete todo mês — não há campo de deslocamento porque ele nasce daqui." />
              </div>
              <div>
                <Label className="text-[10px]">Dia do vencimento *</Label>
                <Input type="number" min={1} max={31} value={diaVencimento}
                  onChange={e => setDiaVencimento(e.target.value)} className="h-8 text-xs"
                  title="O dia pretendido. Em mês curto ele é aparado para o último dia, e o dia pretendido sobrevive para os meses seguintes." />
              </div>
              <div>
                <Label className="text-[10px]">Última competência *</Label>
                <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                  className="h-8 text-xs"
                  title="Limita a COMPETÊNCIA, não o vencimento: com deslocamento, o último pagamento cai depois desta data — e está certo." />
              </div>
            </div>
            {/* ⚠ O RESUMO VIVO — a frase que explica o deslocamento sem campo de
                deslocamento. Some quando falta data, em vez de narrar meia
                verdade. */}
            {resumo && (
              <p className="mt-2 rounded bg-primary/10 px-2 py-1 text-[11px] leading-snug text-primary">
                {resumo}
              </p>
            )}
          </div>

          <div>
            <Label className="text-[10px]">Observação</Label>
            <Textarea value={observacao} onChange={e => setObservacao(e.target.value)}
              rows={2} className="resize-none text-xs" />
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
