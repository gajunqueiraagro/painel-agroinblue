/**
 * OPENFINANCE-P3b — "Buscar do banco" e "Conferir com o banco" na linha do Importar banco (desenho aprovado 16/11; piloto: só o admin
 * AGROinBLUE, só a conta do sistema LIGADA a uma conta permitida do Open Finance).
 *  · Buscar do banco → `openfinance-extrato` 'buscar' (desde o corte) → `fonteDaBusca` → a MESMA prévia do OFX (quem monta é o
 *    `ImportarBancoInline`, por `aoFonte`) → "Importar N" pela porta de sempre. Nada grava antes do "Importar N"; nada concilia.
 *  · Conferir com o banco → 'conferir' (SÓ LEITURA, período já no extrato) → banco × sistema por dia + valor, num diálogo. Nada grava.
 * Sem ligação (ou fora do admin), nada aparece. Os rótulos não mudam durante o pedido (nada se desloca): o botão só desabilita.
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatMoeda } from '@/lib/calculos/formatters';
import type { FonteDoExtrato } from '@/lib/financeiro/parser/fonteDoExtrato';
import { lerRespostaDaBorda } from '@/lib/openfinance/openfinanceTela';
import {
  conferirComSistema, ddmmaaaa, fonteDaBusca, FRASE_ATUALIZAR_FALHOU, FRASE_BUSCA_FALHOU, fraseDaConferencia, fraseDoCorte, fraseSemMovimento,
  lerBuscaDoBanco, lerItemDoBanco, nomeDaBusca, textoDaSituacao, textoDoProximoSync, type CasouComOutraData, type ItemDoBanco, type ResultadoConferencia,
} from '@/lib/openfinance/extratoDoBanco';

/** A conferência começa no dia 1º do mês da última linha do extrato (o caso do piloto: 01–13/11). */
/** OF-ATUALIZAR-DO-BANCO-01: enquanto a Pluggy atualiza, a situação se relê a cada 10 s, até 3 min */
const RELER_A_CADA_MS = 10_000;
const RELER_NO_MAXIMO = 18;
const hojeEmBrasilia = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const inicioDoMes = (dia: string) => `${dia.slice(0, 7)}-01`;

export function BuscarDoBanco({ contaId, desabilitado, aoFonte, aoFrase }: {
  contaId: string;
  desabilitado: boolean;
  /** a fonte pronta para a prévia de sempre, o nome do lote e a frase do corte */
  aoFonte: (fonte: FonteDoExtrato, nome: string, corte: string) => Promise<void>;
  /** o resultado (ok/erro) escrito na linha, como o da importação (UX-TOAST-01) */
  aoFrase: (r: { tipo: 'ok' | 'erro'; texto: string }) => void;
}) {
  const { isAdmin, clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? null;
  const [ligada, setLigada] = useState(false);
  const [ocupado, setOcupado] = useState<'buscar' | 'conferir' | null>(null);
  const [conferencia, setConferencia] = useState<{ r: ResultadoConferencia; de: string; ate: string } | null>(null);
  const [situacao, setSituacao] = useState<ItemDoBanco | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const vivoRef = useRef(true);
  useEffect(() => { vivoRef.current = true; return () => { vivoRef.current = false; }; }, []);
  useEffect(() => { setSituacao(null); }, [contaId]);

  /* a conta do sistema tem conta do banco ligada? (RLS tenant_ok; só o admin chega a perguntar) */
  useEffect(() => {
    let vivo = true;
    setLigada(false);
    if (!isAdmin || !clienteId || !contaId) return () => { vivo = false; };
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: a tabela nova ainda não está no types.ts
      const { data, error } = await (supabase as any).from('openfinance_contas_permitidas').select('id')
        .eq('cliente_id', clienteId).eq('conta_bancaria_id', contaId).eq('ativo', true).eq('tipo', 'BANK').limit(1);
      if (vivo) setLigada(!error && (data ?? []).length === 1);
    })();
    return () => { vivo = false; };
  }, [isAdmin, clienteId, contaId]);

  if (!isAdmin || !ligada || !clienteId) return null;

  const pedir = async (acao: 'buscar' | 'conferir' | 'atualizar' | 'situacao', periodo?: { de: string; ate: string }) =>
    lerRespostaDaBorda(await supabase.functions.invoke('openfinance-extrato', {
      body: { acao, cliente_id: clienteId, conta_bancaria_id: contaId, ...(periodo ?? {}) },
    }), acao === 'atualizar' || acao === 'situacao' ? FRASE_ATUALIZAR_FALHOU : FRASE_BUSCA_FALHOU);

  /* OF-ATUALIZAR-DO-BANCO-01 — "Atualizar do banco": a borda pede à Pluggy (PATCH /items, 1 por hora) e a tela relê a situação até o
     banco terminar ("atualizando…" → "banco atualizado às hh:mm"); o banco pedindo o titular = a frase do Reconectar. Não lê transação. */
  const atualizar = async () => {
    setAtualizando(true);
    try {
      const r = await pedir('atualizar');
      if (r.ok === false) { aoFrase({ tipo: 'erro', texto: r.frase }); return; }
      let item = lerItemDoBanco(r.corpo.item);
      setSituacao(item);
      for (let n = 0; n < RELER_NO_MAXIMO && item?.status === 'UPDATING'; n++) {
        await new Promise((ok) => setTimeout(ok, RELER_A_CADA_MS));
        if (!vivoRef.current) return;
        const s2 = await pedir('situacao');
        if (s2.ok === false) break;
        item = lerItemDoBanco(s2.corpo.item);
        setSituacao(item);
      }
      if (item?.status === 'UPDATING') aoFrase({ tipo: 'ok', texto: 'O banco ainda está atualizando; o aviso chega pela Pluggy. Busque de novo daqui a pouco.' });
      else if (item) aoFrase({ tipo: 'ok', texto: 'Banco atualizado. Agora o "Buscar do banco" traz o que entrou.' });
    } catch { aoFrase({ tipo: 'erro', texto: FRASE_ATUALIZAR_FALHOU }); } finally { if (vivoRef.current) setAtualizando(false); }
  };

  const buscar = async () => {
    setOcupado('buscar');
    try {
      const r = await pedir('buscar');
      if (r.ok === false) { aoFrase({ tipo: 'erro', texto: r.frase }); return; }
      const b = lerBuscaDoBanco(r.corpo);
      if (!b) { aoFrase({ tipo: 'erro', texto: FRASE_BUSCA_FALHOU }); return; }
      setSituacao(b.item);
      const f = fonteDaBusca(b);
      if (f.ok === false) { aoFrase({ tipo: 'erro', texto: f.frase }); return; }
      if (f.fonte.movimentos.length === 0) { aoFrase({ tipo: 'ok', texto: fraseSemMovimento(b) }); return; }
      await aoFonte(f.fonte, nomeDaBusca(b.hoje), fraseDoCorte(b));
    } catch { aoFrase({ tipo: 'erro', texto: FRASE_BUSCA_FALHOU }); } finally { setOcupado(null); }
  };

  const conferir = async () => {
    setOcupado('conferir');
    try {
      /* o período: do 1º do mês da última linha até ela (o que o extrato já cobre) */
      const { data: ult, error: eUlt } = await supabase.from('extrato_bancario_v2').select('data_movimento')
        .eq('conta_bancaria_id', contaId).is('cancelado_em', null).order('data_movimento', { ascending: false }).limit(1);
      const ultimo = !eUlt && ult && ult.length > 0 ? String(ult[0].data_movimento).slice(0, 10) : null;
      if (!ultimo) { aoFrase({ tipo: 'erro', texto: 'Esta conta ainda não tem extrato no sistema para conferir.' }); return; }
      const de = inicioDoMes(ultimo); const ate = ultimo;
      const r = await pedir('conferir', { de, ate });
      if (r.ok === false) { aoFrase({ tipo: 'erro', texto: r.frase }); return; }
      const b = lerBuscaDoBanco(r.corpo);
      if (b) setSituacao(b.item);
      const f = b ? fonteDaBusca(b) : null;
      if (!b || !f || f.ok === false) { aoFrase({ tipo: 'erro', texto: f && f.ok === false ? f.frase : FRASE_BUSCA_FALHOU }); return; }
      const { data: linhas, error } = await supabase.from('extrato_bancario_v2').select('data_movimento, valor, descricao')
        .eq('conta_bancaria_id', contaId).is('cancelado_em', null).is('ignorado_em', null)
        .gte('data_movimento', de).lte('data_movimento', ate).limit(5000);
      if (error) { aoFrase({ tipo: 'erro', texto: 'Não consegui ler o extrato do sistema para comparar. Nada foi gravado.' }); return; }
      const sistema = (linhas ?? []).map((l) => ({ data: String(l.data_movimento).slice(0, 10), valor: Number(l.valor), descricao: l.descricao ?? null }));
      setConferencia({ r: conferirComSistema(f.fonte.movimentos, sistema), de, ate });
    } catch { aoFrase({ tipo: 'erro', texto: FRASE_BUSCA_FALHOU }); } finally { setOcupado(null); }
  };

  const texto = atualizando && !situacao ? 'atualizando…' : textoDaSituacao(situacao, hojeEmBrasilia());
  return (
    <>
      {/* lugar FIXO (nada se desloca quando a situação aparece ou muda) */}
      <span className="w-[178px] shrink-0 truncate text-right text-[10px] tabular-nums text-muted-foreground" data-testid="openfinance-banco-atualizado"
        title={textoDoProximoSync(situacao) ?? undefined}>
        {texto}
      </span>
      <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-[11px]" data-testid="openfinance-atualizar-do-banco"
        disabled={desabilitado || ocupado !== null || atualizando}
        title="Pede ao banco (Open Finance) os movimentos mais novos desta conexão — no máximo 1 vez por hora. Não importa nada; depois, Buscar do banco."
        onClick={() => { void atualizar(); }}>
        Atualizar do banco
      </Button>
      <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 px-2 text-[11px]" data-testid="openfinance-buscar-do-banco"
        disabled={desabilitado || ocupado !== null || atualizando} title="Lê no banco (Open Finance) só esta conta, desde o dia seguinte ao último extrato; mostra a prévia antes de gravar."
        onClick={() => { void buscar(); }}>
        Buscar do banco
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-[11px]" data-testid="openfinance-conferir-com-banco"
        disabled={desabilitado || ocupado !== null || atualizando} title="Só leitura: compara o que o banco diz com o extrato já no sistema, do 1º do mês até a última linha. Nada grava."
        onClick={() => { void conferir(); }}>
        Conferir com o banco
      </Button>
      {/* OF-CONFERIR-CASAMENTO-01 (Gabriel 17/11 09:04): o diálogo era pequeno (tabelas de 120px rolando à toa). Agora usa a altura da tela
          (até 90vh), UMA rolagem só (o corpo) e os cabeçalhos presos; "Casam com outra data" em cima, inteira; "Só no banco" e "Só no
          sistema" lado a lado de 1280px para cima, uma embaixo da outra abaixo disso. */}
      <Dialog open={conferencia !== null} onOpenChange={(v) => { if (!v) setConferencia(null); }}>
        <DialogContent className="flex h-[90vh] max-h-[90vh] max-w-[min(1200px,95vw)] flex-col gap-2 overflow-hidden" data-testid="openfinance-conferencia">
          <DialogHeader className="shrink-0">
            <DialogTitle>Conferir com o banco</DialogTitle>
            <DialogDescription>Só leitura: o que o Open Finance diz × o extrato já no sistema, pelo valor e pela data (até 3 dias úteis depois). Nada foi gravado.</DialogDescription>
          </DialogHeader>
          {conferencia && (
            <>
              <p className="shrink-0 text-[11px]" data-testid="openfinance-conferencia-frase">{fraseDaConferencia(conferencia.r, conferencia.de, conferencia.ate)}</p>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 text-[10px]" data-testid="openfinance-conferencia-corpo">
                <TabelaOutraData linhas={conferencia.r.outraData} />
                <div className="grid grid-cols-1 gap-3 min-[1280px]:grid-cols-2">
                  <TabelaSobra titulo="Só no banco" testId="openfinance-so-no-banco"
                    linhas={conferencia.r.soNoBanco.map((m) => ({ data: m.data, valor: m.valor, texto: m.descricao }))} />
                  <TabelaSobra titulo="Só no sistema" testId="openfinance-so-no-sistema"
                    linhas={conferencia.r.soNoSistema.map((l) => ({ data: l.data, valor: l.valor, texto: l.descricao ?? '' }))} />
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

const CABECALHO = 'sticky top-0 z-10 bg-primary text-primary-foreground';
const valorCls = (v: number) => `px-1 text-right tabular-nums whitespace-nowrap ${v < 0 ? 'text-destructive' : 'text-success'}`;

/** As sobras da conferência na régua da casa: Data (dd/mm/aaaa) · Nome do extrato · Valor; vazia = "nenhuma". Sem altura própria: rola
 *  o corpo do diálogo (um só), o cabeçalho fica preso. */
function TabelaSobra({ titulo, linhas, testId }: { titulo: string; linhas: { data: string; valor: number; texto: string }[]; testId: string }) {
  return (
    <div data-testid={testId}>
      <div className="mb-0.5 font-medium">{titulo} ({linhas.length})</div>
      <table className="w-full border-separate border-spacing-0 rounded border" style={{ tableLayout: 'fixed', fontSize: '10px' }}>
        <colgroup><col style={{ width: '76px' }} /><col /><col style={{ width: '108px' }} /></colgroup>
        <thead className={CABECALHO}>
          <tr className="h-[22px]"><th className="px-1 text-left font-medium">Data</th><th className="px-1 text-left font-medium">Nome do extrato</th><th className="px-1 text-right font-medium">Valor</th></tr>
        </thead>
        <tbody>
          {linhas.length === 0
            ? <tr className="h-[19px]"><td colSpan={3} className="px-1 text-muted-foreground">nenhuma</td></tr>
            : linhas.map((l, i) => (
              <tr key={`${l.data}-${i}`} className="h-[19px]">
                <td className="border-b border-border/60 px-1 tabular-nums whitespace-nowrap">{ddmmaaaa(l.data)}</td>
                <td className="truncate border-b border-border/60 px-1" title={l.texto}>{l.texto}</td>
                <td className={`border-b border-border/60 ${valorCls(l.valor)}`}>{formatMoeda(l.valor)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Casam com outra data": a data do BANCO (Open Finance, a da transação) × a do EXTRATO (OFX, a contábil), cada uma na sua coluna. */
function TabelaOutraData({ linhas }: { linhas: CasouComOutraData[] }) {
  return (
    <div data-testid="openfinance-outra-data">
      <div className="mb-0.5 font-medium">Casam com outra data ({linhas.length})</div>
      <table className="w-full border-separate border-spacing-0 rounded border" style={{ tableLayout: 'fixed', fontSize: '10px' }}>
        <colgroup><col style={{ width: '92px' }} /><col style={{ width: '96px' }} /><col /><col style={{ width: '108px' }} /></colgroup>
        <thead className={CABECALHO}>
          <tr className="h-[22px]"><th className="px-1 text-left font-medium">Data do banco</th><th className="px-1 text-left font-medium">Data do extrato</th>
            <th className="px-1 text-left font-medium">Nome do extrato</th><th className="px-1 text-right font-medium">Valor</th></tr>
        </thead>
        <tbody>
          {linhas.length === 0
            ? <tr className="h-[19px]"><td colSpan={4} className="px-1 text-muted-foreground">nenhuma</td></tr>
            : linhas.map((p, i) => (
              <tr key={`${p.banco.data}-${i}`} className="h-[19px]">
                <td className="border-b border-border/60 px-1 tabular-nums whitespace-nowrap">{ddmmaaaa(p.banco.data)}</td>
                <td className="border-b border-border/60 px-1 tabular-nums whitespace-nowrap">{ddmmaaaa(p.sistema.data)}</td>
                <td className="truncate border-b border-border/60 px-1" title={p.sistema.descricao ?? p.banco.descricao}>{p.sistema.descricao ?? p.banco.descricao}</td>
                <td className={`border-b border-border/60 ${valorCls(p.banco.valor)}`}>{formatMoeda(p.banco.valor)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
