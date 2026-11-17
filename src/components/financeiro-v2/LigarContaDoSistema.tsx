/**
 * OPENFINANCE-P3b — "Lança na conta": em Escolher contas, cada conta PERMITIDA (conta corrente/poupança; cartão não) desta conexão diz em
 * que conta do SISTEMA o extrato cai. Sugestão pelo final de 4 dígitos (nº + dígito; só se UMA conta corrente bate). Gravar = prévia
 * ("Liga … em …") → "Gravar a ligação" → `openfinance-contas` 'ligar' (a interna da 118140 confere cliente, tipo e "uma conta do sistema
 * recebe de uma conta do banco"). Bloco de altura fixa: aparecer/trocar não desloca o diálogo.
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import { lerRespostaDaBorda } from '@/lib/openfinance/openfinanceTela';
import { contaSugerida, FRASE_LIGAR_FALHOU, type ContaDoSistema } from '@/lib/openfinance/extratoDoBanco';

interface Permitida { id: string; rotulo: string; final4: string | null; conta_bancaria_id: string | null }
interface ContaDaLista extends ContaDoSistema { nome_conta: string; nome_exibicao: string | null }

export function LigarContaDoSistema({ clienteId, itemId, versao }: { clienteId: string; itemId: string; versao: number }) {
  const [permitidas, setPermitidas] = useState<Permitida[] | null>(null);
  const [contas, setContas] = useState<ContaDaLista[]>([]);
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [previa, setPrevia] = useState<{ permitida: string; frase: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const ler = useCallback(async () => {
    const [p, c] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: a tabela nova ainda não está no types.ts
      (supabase as any).from('openfinance_contas_permitidas').select('id, rotulo, final4, conta_bancaria_id')
        .eq('cliente_id', clienteId).eq('item_id', itemId).eq('ativo', true).eq('tipo', 'BANK').order('criado_em'),
      supabase.from('financeiro_contas_bancarias').select('id, nome_conta, nome_exibicao, tipo_conta, numero_conta, conta_digito, ativa')
        .eq('cliente_id', clienteId).eq('tipo_conta', 'cc').eq('ativa', true).order('ordem_exibicao'),
    ]);
    if (p.error || c.error) { setPermitidas([]); return; }
    const lista: Permitida[] = (p.data ?? []).map((x: { id: string; rotulo: string; final4: string | null; conta_bancaria_id: string | null }) => x);
    const cs: ContaDaLista[] = (c.data ?? []).map((x) => ({ ...x }));
    setPermitidas(lista); setContas(cs);
    setEscolha(Object.fromEntries(lista.map((x) => [x.id, x.conta_bancaria_id ?? contaSugerida(x.final4, cs) ?? ''])));
  }, [clienteId, itemId]);

  useEffect(() => { setPrevia(null); void ler(); }, [ler, versao]);

  const nomeDa = (id: string) => { const c = contas.find((x) => x.id === id); return c ? (c.nome_exibicao || c.nome_conta) : '—'; };
  const ligar = async (p: Permitida, simular: boolean) => {
    const conta = escolha[p.id] || null;
    setOcupado(true);
    try {
      const r = await lerRespostaDaBorda(await supabase.functions.invoke('openfinance-contas', {
        body: { acao: 'ligar', cliente_id: clienteId, permitida_id: p.id, conta_bancaria_id: conta, simular },
      }), FRASE_LIGAR_FALHOU);
      if (r.ok === false) { toast.error(r.frase); return; }
      if (simular) {
        setPrevia({ permitida: p.id, frase: r.corpo.mudou === true
          ? (conta ? `Liga ${p.rotulo} em ${nomeDa(conta)}.` : `Desliga ${p.rotulo} (não lança em conta nenhuma).`)
          : 'Já está assim. Nada muda.' });
        return;
      }
      toast.success(conta ? `Ligada: ${p.rotulo} → ${nomeDa(conta)}.` : `Desligada: ${p.rotulo}.`);
      setPrevia(null); await ler();
    } catch { toast.error(FRASE_LIGAR_FALHOU); } finally { setOcupado(false); }
  };

  return (
    <div className="h-[88px] overflow-y-auto rounded-md border px-2 py-1 text-[11px]" data-testid="openfinance-lanca-na-conta">
      <div className="mb-1 font-medium">Lança na conta</div>
      {permitidas === null ? <div className="text-muted-foreground">Lendo…</div>
        : permitidas.length === 0 ? <div className="text-muted-foreground">Nenhuma conta corrente marcada nesta conexão.</div>
        : permitidas.map((p) => (
          /* OF-ESCOLHER-CONTAS-LAYOUT-01 (Gabriel 17/11 08:50): a frase da prévia saía CORTADA ("L.") à direita do botão → linha PRÓPRIA
             abaixo, inteira e sem quebrar (14px sempre reservados: aparecer não desloca); os dois botões na MESMA largura fixa */
          <div key={p.id} data-testid="openfinance-ligacao">
            <div className="flex h-7 items-center gap-2">
              <span className="w-[170px] shrink-0 truncate" title={p.rotulo}>{p.rotulo}</span>
              <div className="w-[170px] shrink-0">
                <ContaBancariaSelect value={escolha[p.id] || '__none__'} disabled={ocupado} className="h-6 text-[11px]" placeholder="Conta do sistema"
                  contas={contas.map((c) => ({ id: c.id, nome_conta: c.nome_conta, nome_exibicao: c.nome_exibicao, tipo_conta: c.tipo_conta }))}
                  onValueChange={(v) => { setPrevia(null); setEscolha((e) => ({ ...e, [p.id]: v === '__none__' ? '' : v })); }} />
              </div>
              {previa?.permitida === p.id
                ? <Button size="sm" className="h-6 w-[124px] shrink-0 px-1 text-[11px]" disabled={ocupado} onClick={() => void ligar(p, false)} data-testid="openfinance-gravar-ligacao">Gravar a ligação</Button>
                : <Button size="sm" variant="outline" className="h-6 w-[124px] shrink-0 px-1 text-[11px]" disabled={ocupado} onClick={() => void ligar(p, true)} data-testid="openfinance-ver-ligacao">Prévia da ligação</Button>}
            </div>
            <div className="h-[14px] whitespace-nowrap text-[10px] leading-[14px] text-muted-foreground" title={previa?.permitida === p.id ? previa.frase : undefined}
              data-testid="openfinance-previa-ligacao">
              {previa?.permitida === p.id ? previa.frase : ''}
            </div>
          </div>
        ))}
    </div>
  );
}
