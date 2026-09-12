/**
 * RATEIO ADMINISTRATIVO POR ATIVIDADE — AGRI-RATEIO-TELA-01.
 *
 * ⚠ NÃO É O "RATEIO ADM" DO FINANCEIRO, e os dois vão conviver com nomes parecidos. Aquele
 * (Financeiro → Rateio ADM) distribui o administrativo entre FAZENDAS, proporcional ao
 * rebanho médio do mês — derivado, ninguém declara —, e é tela de conferência. Este declara
 * quanto do administrativo pertence a cada ATIVIDADE, por ano, e é cadastro: o produtor
 * decide e assume. Um não substitui o outro, e confundi-los produziria rateio em cima de
 * rateio.
 * ⚠ A SOMA TEM DE DAR 100 E O BOTÃO OBEDECE A ISSO. Não é preciosismo: 95% deixa cinco por
 * cento do custo fora de toda atividade — some do DRE sem ninguém apagar nada — e 105% cria
 * despesa que não existe. Os dois erros só aparecem meses depois, num resultado que não fecha.
 */
import { useEffect, useMemo, useState } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import { SeletorAnoCards } from '@/components/shared/SeletorAnoCards';
import { useRateioAdmin } from '@/hooks/useRateioAdmin';
import {
  ATIVIDADES_RATEIO, RATEIO_VAZIO, anosDoRateio, percentualDe, somaPercentuais, validarRateio,
  type AtividadeRateio, type RateioForm,
} from '@/lib/agri/rateioAdmin';

export function FinV2RateioAdminTab() {
  const { clienteAtual } = useCliente();
  const [ano, setAno] = useState(() => new Date().getFullYear());
  const { linhas, anosComChave, carregando, salvar } = useRateioAdmin(clienteAtual?.id ?? null, ano);
  const [form, setForm] = useState<RateioForm>(RATEIO_VAZIO);
  const [gravado, setGravado] = useState(JSON.stringify(RATEIO_VAZIO));
  const [salvando, setSalvando] = useState(false);

  const anos = useMemo(() => anosDoRateio(new Date().getFullYear(), anosComChave), [anosComChave]);

  /* O que está no banco vira o que está na tela — e o ano sem chave abre em branco, que é a
     verdade: ninguém declarou nada para ele ainda. */
  useEffect(() => {
    if (carregando) return;
    const novo: RateioForm = { ...RATEIO_VAZIO };
    linhas.forEach(l => {
      novo[l.atividade] = String(l.percentual).replace('.', ',');
    });
    setForm(novo);
    setGravado(JSON.stringify(novo));
  }, [linhas, carregando]);

  const soma = useMemo(() => somaPercentuais(form), [form]);
  const validacao = useMemo(() => validarRateio(form), [form]);
  const sujo = JSON.stringify(form) !== gravado;

  const editar = (a: AtividadeRateio, v: string) => setForm(prev => ({ ...prev, [a]: v }));

  const handleSalvar = async () => {
    if (!validacao.ok || !validacao.payload) { toast.error(validacao.erro ?? 'Ajuste os percentuais.'); return; }
    setSalvando(true);
    try {
      const r = await salvar(validacao.payload);
      if (!r.ok) { toast.error(r.erro ?? 'Não foi possível salvar.'); return; }
      toast.success(`Chave de ${ano} salva.`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="w-full space-y-4 p-4 pb-20 animate-fade-in">
      <div>
        <h2 className="text-lg font-bold text-foreground">Rateio administrativo</h2>
        {/* ⚠ O SUBTEXTO É PARTE DA TELA, não enfeite: sem ele, "72%" é um número sem
            pergunta. Ele diz O QUE se está dividindo e por quanto tempo vale. */}
        <p className="max-w-3xl text-xs text-muted-foreground">
          Quanto do administrativo (contador, escritório, software, energia) vai para cada atividade
          neste ano. Vale para todo o administrativo — custo fixo, investimento, juros. Uma chave por
          ano, editável.
        </p>
      </div>

      <SeletorAnoCards anos={anos} valor={ano} onChange={setAno} anosComDado={anosComChave} />

      <Card className="max-w-2xl rounded-none">
        <CardContent className="space-y-3 p-3">
          {ATIVIDADES_RATEIO.map(a => {
            const pct = percentualDe(form[a.valor]);
            return (
              <div key={a.valor} className="grid grid-cols-[minmax(0,110px)_minmax(0,90px)_minmax(0,1fr)] items-center gap-3">
                <Label className="text-[12px] font-medium">{a.rotulo}</Label>
                <div className="flex items-center gap-1">
                  <Input
                    value={form[a.valor]}
                    onChange={e => editar(a.valor, e.target.value)}
                    inputMode="decimal"
                    placeholder="0"
                    className="h-8 text-right font-mono text-[12px]"
                  />
                  <span className="text-[11px] text-muted-foreground">%</span>
                </div>
                {/* ⚠ A BARRA É A LEITURA DE RELANCE. Três números soltos não mostram
                    desproporção; três barras mostram — e é a desproporção que o produtor
                    confere, não o dígito. */}
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className={cn('h-full rounded-full transition-all', a.barra)}
                    style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                </div>
              </div>
            );
          })}

          <div className="flex items-center gap-3 border-t pt-2.5">
            {/* ⚠ O RODAPÉ DIZ O ESTADO E O BOTÃO OBEDECE — uma fonte só, como a regra da casa
                pede para botão desabilitado. */}
            <span className={cn('text-[12px] font-semibold tabular-nums',
              validacao.ok ? 'text-success' : 'text-destructive')}>
              Soma: {formatNum(soma, soma % 1 === 0 ? 0 : 2)}%
              {validacao.ok ? ' ✓' : ' — ajuste para 100%'}
            </span>
            <div className="flex-1" />
            {!sujo && validacao.ok && (
              <span className="text-[10px] text-muted-foreground">sem alterações</span>
            )}
            <Button size="sm" className="h-7 gap-1 text-[11px]"
              variant={sujo && validacao.ok ? 'default' : 'outline'}
              disabled={!validacao.ok || salvando || !sujo}
              onClick={handleSalvar}>
              <Save className="h-3 w-3" /> {salvando ? 'Salvando…' : 'Salvar chave'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
