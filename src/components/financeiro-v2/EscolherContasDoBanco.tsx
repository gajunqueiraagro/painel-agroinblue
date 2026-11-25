/**
 * OPENFINANCE-P3a + OPENFINANCE-PRONTO-NJ-01 (1) (Gabriel 11:46) — "Escolher contas" de UMA conexão, NUM PASSO SÓ: lista o que a Pluggy tem
 * nesta conexão — tipo · final · titular e CPF mascarados, nunca saldo nem transação — e, em cada conta corrente, a conta do SISTEMA onde o
 * extrato cai, já SUGERIDA pela agência e pela conta do cadastro (`contaSugerida`; zero ou empate = sem sugestão). O operador confere,
 * marca e grava: Prévia (permitir simulado + "Lança: … → …") → Gravar (permitir; depois ligar cada conta corrente, pelas funções de sempre).
 * As não marcadas nunca são lidas nem gravadas. Logo depois do consentimento a Pluggy ainda está lendo o banco: a lista RELÊ sozinha
 * (e há "Ler de novo"), nunca diz "não há contas" cedo demais. O cartão não lança em conta corrente: a fatura entra pela regra da fonte da
 * fatura (Code 5, 118730). Quem usa: o admin AGROinBLUE ou o gestor do cliente (a borda confere).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TD_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO, TH_REGUA, TextoReservado } from '@/components/ui/regua-tabela';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import {
  bancoDaResposta, contasDaResposta, escolhaMudou, FRASE_AINDA_LENDO, FRASE_CONTAS_FALHOU, FRASE_PERMITIR_FALHOU, FRASE_REPETIDA,
  fraseDasLigacoes, frasePrevia, fraseDoPermitir, lendoDaResposta, lerRespostaDaBorda, marcadasDePartida, planoDaGravacao,
  type ContaDaConexao,
} from '@/lib/openfinance/openfinanceTela';
import { contaSugerida, FRASE_LIGAR_FALHOU, type ContaDoSistema } from '@/lib/openfinance/extratoDoBanco';

interface ContaDoCadastro extends ContaDoSistema { nome_conta: string; nome_exibicao: string | null }
interface PermitidaViva { id: string; item_id: string; account_id: string; conta_bancaria_id: string | null }

/** relê enquanto a Pluggy diz que está lendo e a lista veio vazia: 6 vezes, de 5 em 5 s (depois, o botão "Ler de novo") */
const RELEITURAS = 6;
const INTERVALO_MS = 5000;
const NENHUMA = '__none__';

/* CONTAS-OF-LINHA-01: `marcarFinais` = os finais da conta da LINHA de onde veio o "Conectar" — essa conta do banco já vem marcada */
export function EscolherContasDoBanco({ clienteId, itemId, onFechar, marcarFinais }: {
  clienteId: string; itemId: string | null; onFechar: () => void; marcarFinais?: readonly string[];
}) {
  const chaveDosFinais = (marcarFinais ?? []).join(',');
  const [contas, setContas] = useState<ContaDaConexao[] | null>(null);
  const [banco, setBanco] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [cadastro, setCadastro] = useState<ContaDoCadastro[]>([]);
  const [permitidas, setPermitidas] = useState<PermitidaViva[]>([]);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [previa, setPrevia] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [vez, setVez] = useState(0);
  const lerDeNovo = useCallback(() => setVez((n) => n + 1), []);

  /* o que cada conta do banco JÁ recebe nesta conexão */
  const ligadaHoje = useMemo(() => Object.fromEntries(permitidas.filter((p) => p.item_id === itemId).map((p) => [p.account_id, p.conta_bancaria_id])),
    [permitidas, itemId]);

  useEffect(() => {
    if (!itemId) return;
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setContas(null); setPrevia(null); setMarcadas(new Set()); setEscolha({}); setLendo(false);
    const ler = async (tentativa: number) => {
      try {
        const [r, cad, per] = await Promise.all([
          supabase.functions.invoke('openfinance-contas', { body: { acao: 'listar', cliente_id: clienteId, item_id: itemId } })
            .then((res) => lerRespostaDaBorda(res, FRASE_CONTAS_FALHOU)),
          supabase.from('financeiro_contas_bancarias').select('id, nome_conta, nome_exibicao, tipo_conta, agencia, numero_conta, conta_digito, ativa')
            .eq('cliente_id', clienteId).eq('tipo_conta', 'cc').eq('ativa', true).order('ordem_exibicao'),
          (supabase as any).from('openfinance_contas_permitidas').select('id, item_id, account_id, conta_bancaria_id')
            .eq('cliente_id', clienteId).eq('ativo', true),
        ]);
        if (!vivo) return;
        if (r.ok === false) { toast.error(r.frase); onFechar(); return; }
        const lista = contasDaResposta(r.corpo);
        const aindaLendo = lendoDaResposta(r.corpo) && lista.length === 0;
        const cs: ContaDoCadastro[] = cad.error ? [] : (cad.data ?? []).map((x) => ({ ...x }));
        const ps: PermitidaViva[] = per.error || !Array.isArray(per.data) ? [] : per.data;
        setBanco(bancoDaResposta(r.corpo)); setCadastro(cs); setPermitidas(ps); setLendo(aindaLendo);
        if (aindaLendo && tentativa < RELEITURAS) timer = setTimeout(() => void ler(tentativa + 1), INTERVALO_MS);
        /* a sugestão: a conta que já recebe; senão a do cadastro pela agência e conta (fora as presas a OUTRA conta do banco) */
        const hoje = Object.fromEntries(ps.filter((p) => p.item_id === itemId).map((p) => [p.account_id, p.conta_bancaria_id]));
        const presas = new Set(ps.filter((p) => p.item_id !== itemId && p.conta_bancaria_id).map((p) => p.conta_bancaria_id ?? ''));
        const finais = chaveDosFinais ? chaveDosFinais.split(',') : [];
        const daLinha = lista.filter((c) => c.final4 !== null && finais.includes(c.final4)).map((c) => c.accountId);
        setContas(lista); setMarcadas(new Set([...marcadasDePartida(lista), ...daLinha]));
        setEscolha(Object.fromEntries(lista.filter((c) => c.tipo === 'BANK').map((c) => [c.accountId,
          hoje[c.accountId] ?? contaSugerida(c.final4, cs, c.agencia, presas) ?? ''])));
      } catch { if (vivo) { toast.error(FRASE_CONTAS_FALHOU); onFechar(); } }
    };
    void ler(0);
    return () => { vivo = false; if (timer) clearTimeout(timer); };
  }, [clienteId, itemId, onFechar, chaveDosFinais, vez]);

  const plano = useMemo(() => planoDaGravacao(contas ?? [], marcadas, escolha, ligadaHoje), [contas, marcadas, escolha, ligadaHoje]);
  const mudou = contas !== null && (escolhaMudou(contas, marcadas) || plano.ligacoes.length > 0);

  const alternar = (id: string, v: boolean) => {
    setPrevia(null);
    setMarcadas((atual) => { const n = new Set(atual); if (v) n.add(id); else n.delete(id); return n; });
  };
  const trocarConta = (id: string, v: string) => { setPrevia(null); setEscolha((e) => ({ ...e, [id]: v === NENHUMA ? '' : v })); };

  const gravar = async (simular: boolean) => {
    if (!itemId || !contas) return;
    if (plano.repetida) { toast.error(FRASE_REPETIDA); return; }
    setOcupado(true);
    try {
      const r = await lerRespostaDaBorda(await supabase.functions.invoke('openfinance-contas',
        { body: { acao: 'permitir', cliente_id: clienteId, item_id: itemId, account_ids: plano.accountIds, simular } }), FRASE_PERMITIR_FALHOU);
      if (r.ok === false) { toast.error(r.frase); return; }
      if (simular) { setPrevia([frasePrevia(r.corpo), fraseDasLigacoes(plano)].filter(Boolean).join(' ')); return; }
      /* entrou: agora cada conta corrente marcada lança na conta escolhida (a permitida pode ter nascido agora: relê o id dela) */
      const { data: novas, error } = await (supabase as any).from('openfinance_contas_permitidas').select('id, item_id, account_id, conta_bancaria_id')
        .eq('cliente_id', clienteId).eq('item_id', itemId).eq('ativo', true);
      const vivas: PermitidaViva[] = error || !Array.isArray(novas) ? [] : novas;
      const porConta = new Map(vivas.map((p) => [p.account_id, p.id]));
      const falhas: string[] = [];
      let ligadas = 0;
      for (const l of plano.ligacoes) {
        const permitida = porConta.get(l.accountId);
        const c = contas.find((x) => x.accountId === l.accountId);
        const rotulo = `${c?.tipoLegivel ?? 'Conta'} ${c?.final4 ?? '—'}`;
        if (!permitida) { falhas.push(`${rotulo}: ${FRASE_LIGAR_FALHOU}`); continue; }
        const g = await lerRespostaDaBorda(await supabase.functions.invoke('openfinance-contas', {
          body: { acao: 'ligar', cliente_id: clienteId, permitida_id: permitida, conta_bancaria_id: l.contaId, simular: false },
        }), FRASE_LIGAR_FALHOU);
        if (g.ok === false) falhas.push(`${rotulo}: ${g.frase}`); else ligadas += 1;
      }
      toast.success(`${fraseDoPermitir(r.corpo)}${ligadas ? ` ${ligadas} ${ligadas === 1 ? 'ligada' : 'ligadas'} à conta do sistema.` : ''}`);
      if (falhas.length) toast.error(`A escolha entrou, mas não liguei: ${falhas.join(' · ')}`);
      setPrevia(null); lerDeNovo();
    } catch { toast.error(FRASE_PERMITIR_FALHOU); } finally { setOcupado(false); }
  };

  const opcoes = cadastro.map((c) => ({ id: c.id, nome_conta: c.nome_conta, nome_exibicao: c.nome_exibicao, tipo_conta: c.tipo_conta }));
  return (
    <Dialog open={itemId !== null} onOpenChange={(v) => { if (!v && !ocupado) onFechar(); }}>
      <DialogContent className="max-w-[680px] text-[11px]" data-testid="openfinance-escolher-dialogo">
        <DialogHeader>
          <DialogTitle className="text-[13px]">Escolher contas{banco ? ` · ${banco}` : ''}</DialogTitle>
          <DialogDescription className="text-[11px]">
            Marque só as contas deste cliente e confira onde cada uma lança. As não marcadas nunca são lidas nem gravadas no AGROinBLUE.
          </DialogDescription>
        </DialogHeader>
        <div className="h-[176px] overflow-auto rounded-md border">
          <table className="w-full table-fixed border-collapse">
            <colgroup><col style={{ width: 28 }} /><col style={{ width: 112 }} /><col style={{ width: 48 }} /><col /><col style={{ width: 112 }} /><col style={{ width: 196 }} /></colgroup>
            <thead className="sticky top-0 bg-primary">
              <tr><th className={TH_REGUA} /><th className={`${TH_REGUA} text-left`}>Tipo</th><th className={`${TH_REGUA} text-right`}>Final</th>
                <th className={`${TH_REGUA} text-left`}>Titular</th><th className={`${TH_REGUA} text-right`}>CPF/CNPJ</th><th className={`${TH_REGUA} text-left`}>Lança na conta</th></tr>
            </thead>
            <tbody>
              {contas === null ? <tr><td colSpan={6} className={`${TD_REGUA} text-muted-foreground`}>Lendo as contas na Pluggy…</td></tr>
                : contas.length === 0 ? <tr><td colSpan={6} className={`${TD_REGUA_TEXTO} text-muted-foreground`} data-testid="openfinance-sem-contas"
                    title={lendo ? FRASE_AINDA_LENDO : 'A Pluggy não devolveu contas nesta conexão.'}>
                    {lendo ? FRASE_AINDA_LENDO : 'A Pluggy não devolveu contas nesta conexão.'}</td></tr>
                : contas.map((c) => (
                  <tr key={c.accountId} className="border-b last:border-b-0" data-testid="openfinance-conta">
                    <td className={TD_REGUA}>
                      <Checkbox className="h-3.5 w-3.5" checked={marcadas.has(c.accountId)} disabled={ocupado}
                        onCheckedChange={(v) => alternar(c.accountId, v === true)} aria-label={`${c.tipoLegivel} final ${c.final4 ?? '—'}`} data-testid="openfinance-conta-marcar" />
                    </td>
                    <td className={TD_REGUA_TEXTO} title={c.tipoLegivel}>{c.tipoLegivel}</td>
                    <td className={TD_REGUA_NUM}>{c.final4 ?? '—'}</td>
                    <td className={TD_REGUA_TEXTO} title={c.titular ?? '—'}>{c.titular ?? '—'}</td>
                    <td className={TD_REGUA_NUM}>{c.documento ?? '—'}</td>
                    <td className={TD_REGUA} data-testid="openfinance-lanca-em" data-conta={escolha[c.accountId] ?? ''}>
                      {c.tipo === 'BANK'
                        ? <ContaBancariaSelect value={escolha[c.accountId] || NENHUMA} disabled={ocupado || !marcadas.has(c.accountId)}
                            className="h-[17px] text-[10px]" placeholder="Conta do sistema" contas={opcoes}
                            prependItems={[{ value: NENHUMA, label: 'Nenhuma (só entra)' }]}
                            onValueChange={(v) => trocarConta(c.accountId, v)} />
                        : <span className="block truncate text-[10px] text-muted-foreground"
                            title="O cartão não lança em conta corrente: a fatura entra pela regra da fonte da fatura (Open Finance preferido; o PDF só confere).">
                            fatura: pela fonte da fatura</span>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="flex h-[34px] items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 text-[11px] text-amber-900" data-testid="openfinance-previa">
          <span className="min-w-0 flex-1 leading-[14px]" data-testid="openfinance-previa-frase">
            {previa ?? (plano.repetida ? FRASE_REPETIDA : 'A conta do sistema já vem sugerida pela agência e conta; confira. Nada é gravado antes da prévia.')}
          </span>
          {lendo && <Button size="sm" variant="outline" className="h-6 w-[96px] flex-none text-[11px]" disabled={ocupado} onClick={lerDeNovo} data-testid="openfinance-ler-de-novo">Ler de novo</Button>}
        </div>
        <div className="flex items-center justify-end gap-2">
          <TextoReservado className="mr-auto text-[11px] text-muted-foreground" reserva="99 de 99 marcadas"
            texto={`${marcadas.size} de ${contas?.length ?? 0} marcadas`} testid="openfinance-contador" />
          <Button size="sm" variant="ghost" className="h-6 text-[11px]" disabled={ocupado} onClick={onFechar}>Fechar</Button>
          {previa === null
            ? <Button size="sm" className="h-6 w-[120px] text-[11px]" disabled={ocupado || !mudou || !!plano.repetida} onClick={() => void gravar(true)} data-testid="openfinance-ver-previa">Prévia</Button>
            : <Button size="sm" className="h-6 w-[120px] text-[11px]" disabled={ocupado} onClick={() => void gravar(false)} data-testid="openfinance-gravar-escolha">Gravar</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
