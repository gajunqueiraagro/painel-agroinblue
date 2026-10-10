import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Loader2, Play } from 'lucide-react';
import { formatMoeda } from '@/lib/calculos/formatters';
import { gerarRecorrencia, textoVagas, textoNaoGerados, textoDoGerado, type Recorrencia, type RespostaDoGerar } from '@/hooks/useRecorrencias';
import { hojeLocal } from '@/lib/datas/hojeLocal';

/**
 * GerarLancamentosDialog — a prévia e a execução, pela MESMA pergunta.
 * FIN-RECORRENCIA-01, Tempo 1.
 *
 * ⚠ PRÉVIA E EXECUÇÃO SÃO A MESMA CHAMADA, com `p_simular` alternando. Uma
 * prévia que responde por um caminho e grava por outro pode prometer N e
 * entregar M — e o operador só descobre depois. Aqui a diferença é só se o banco
 * confirma a transação.
 *
 * ⚠ O AVISO DOS TOTAIS É OBRIGATÓRIO, e não é cortesia: gerar doze meses aumenta
 * os totais do período na proporção do horizonte. Quem gerar até dezembro e
 * depois olhar o ano vai ver um número maior sem ter gasto mais nada. O filtro
 * de status separa previsto do realizado — a tela precisa dizer isso ANTES.
 *
 * ⚠ IDEMPOTENTE POR CONSTRUÇÃO: a segunda chamada devolve 0. O botão não
 * desabilita depois de gerar, porque o horizonte pode ser esticado — o que não
 * acontece é duplicar o que já existe.
 *
 * ⚠ RECORRENCIA-GERA-A-VIGENCIA-INTEIRA-01 (Gabriel, 10/10/2026): o Gerar cria TODA a vigência, meses passados inclusive, e
 * NUNCA OMITE EM SILÊNCIO. A prévia e o resultado moram num LUGAR RESERVADO (altura fixa, sempre presente): o que vai ser /
 * foi criado ("gerou 12: 07/26 a 06/27"), as competências preenchidas abaixo da marca e o que NÃO foi gerado, com o motivo
 * do banco ("mês fechado"). Recusa e resultado ficam ESCRITOS ali — nenhum toast — e o diálogo NÃO fecha sozinho depois de
 * gravar: o operador lê o que aconteceu e fecha.
 */
interface Props {
  recorrencia: Recorrencia;
  aoFechar: () => void;
  aoGerar: () => void | Promise<void>;
}

export function GerarLancamentosDialog({ recorrencia, aoFechar, aoGerar }: Props) {
  /* O horizonte nasce no fim da regra: o caso comum é gerar tudo o que falta.
     Encurtar é decisão de quem não quer inflar o ano ainda. */
  const [ate, setAte] = useState(recorrencia.dataFim.slice(0, 10));
  /* O que o banco respondeu por último: a prévia (simulação) ou o resultado (gravação). Mudar o horizonte apaga. */
  const [resposta, setResposta] = useState<{ gravado: boolean; r: RespostaDoGerar } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const chamar = async (simular: boolean) => {
    setOcupado(true);
    setErro(null);
    try {
      const r = await gerarRecorrencia(recorrencia.id, ate || null, simular);
      if (!r.ok || r.erro) { setResposta(null); setErro(`Não foi possível gerar. (${r.erro ?? 'o banco recusou a geração'})`); return; }
      setResposta({ gravado: !simular, r });
      if (!simular) await aoGerar();
    } finally {
      setOcupado(false);
    }
  };

  const r = resposta?.r ?? null;
  const mesDeHoje = hojeLocal().slice(0, 7);
  /* A janela de avanço só se mostra quando há avanço: com a marca no fim, "de" passa de "até". */
  const janela = r && r.de && r.ate && r.de <= r.ate ? { de: r.de, ate: r.ate } : null;
  const linhaPrincipal = !r ? '' : resposta?.gravado
    ? textoDoGerado(r)
    : r.gerados === 0 ? textoDoGerado(r)
      : `${r.gerados} lançamento${r.gerados === 1 ? '' : 's'}${janela ? ` · de ${mesBr(janela.de)} a ${mesBr(janela.ate)}` : ''}${r.geradoDe && r.geradoDe < mesDeHoje ? ' · inclui meses passados' : ''}`;
  const linhaVagas = r && r.vagas.length > 0 ? textoVagas(r.vagas) : '';
  const linhaNaoGerados = r && r.naoGerados.length > 0 ? textoNaoGerados(r.naoGerados) : '';

  return (
    <Dialog open onOpenChange={o => !o && aoFechar()}>
      <DialogContent className="w-[94vw] max-w-md gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b bg-primary/10 px-4 py-2.5 pr-12 text-left">
          <DialogTitle className="text-[14px] font-medium leading-none text-primary">Gerar lançamentos</DialogTitle>
          <DialogDescription className="mt-1 text-[11px] leading-snug">
            {recorrencia.descricao} · {formatMoeda(recorrencia.valorBase)} · dia {recorrencia.diaVencimento}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5 px-4 py-3">
          <div>
            <Label className="text-[10px]">Gerar até (competência)</Label>
            {/* ⚠ O `title` MUDOU DE ELEMENTO, NAO SUMIU. O `DatePicker` usa o proprio `title`
                para dizer "Data invalida" quando o campo esta em erro; passar outro por cima
                apagaria esse aviso. A frase — que e' a unica explicacao de que o campo so'
                ENCURTA — foi para o wrapper, e o hover continua a mostrando. */}
            <span title="Só ENCURTA: o teto é sempre a última competência da regra." className="block">
              <DatePicker value={ate} onChange={v => { setAte(v); setResposta(null); setErro(null); }}
                className="h-8 text-xs" />
            </span>
          </div>

          {/* ⚠ O AVISO VEM ANTES DO BOTÃO, não depois do estrago. */}
          <div className="flex gap-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[10px] leading-snug text-amber-900">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              Os lançamentos nascem <b>previstos</b> e entram nos totais do período: gerar vários meses
              aumenta o total do ano na proporção do horizonte. O filtro de status separa previsto de
              realizado.
            </span>
          </div>

          {/* ⚠ LUGAR RESERVADO, SEMPRE PRESENTE (três linhas de 15px): a prévia, o resultado e a recusa moram aqui — o diálogo
              não muda de altura. Cada linha corta com o texto inteiro no `title`. */}
          <div data-testid="gerar-lugar" className="h-[57px] rounded border bg-muted/40 px-2 py-1.5 text-[11px] leading-[15px]">
            {erro ? (
              <div data-testid="gerar-erro" title={erro} className="line-clamp-3 text-destructive">{erro}</div>
            ) : !r ? (
              <div className="text-muted-foreground">Peça a prévia para ver o que será criado — meses passados inclusive.</div>
            ) : (<>
              <div data-testid={resposta?.gravado ? 'gerar-resultado' : 'gerar-previa'} title={linhaPrincipal}
                className={`truncate ${resposta?.gravado && r.gerados > 0 ? 'font-medium text-emerald-700' : r.gerados === 0 ? 'text-muted-foreground' : ''}`}>
                {linhaPrincipal}
              </div>
              {/* ⚠ AS VAGAS ABAIXO DA MARCA — competência da regra sem lançamento, PASSADAS inclusive (cancelado conta como
                  ocupado): o Gerar as preenche. */}
              <div data-testid={linhaVagas ? 'gerar-vagas' : undefined} title={linhaVagas || undefined} className="truncate text-[10px] text-muted-foreground">{linhaVagas}</div>
              {/* ⚠ O QUE NÃO PODE SER GERADO APARECE ESCRITO, COM O MOTIVO DO BANCO. */}
              <div data-testid={linhaNaoGerados ? 'gerar-nao-gerados' : undefined} title={linhaNaoGerados || undefined} className="truncate text-[10px] text-amber-700">{linhaNaoGerados}</div>
            </>)}
          </div>
        </div>

        <DialogFooter className="items-center gap-2 border-t bg-accent px-4 py-2.5 sm:justify-between">
          <Button variant="outline" size="sm" disabled={ocupado} onClick={() => { void chamar(true); }}>
            {ocupado && !resposta ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Prévia
          </Button>
          <span className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={aoFechar}>Fechar</Button>
            <Button type="button" size="sm" className="gap-1.5"
              disabled={ocupado || !ate}
              title={!ate ? 'Escolha até quando gerar.' : undefined}
              onClick={() => { void chamar(false); }}>
              {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Confirmar
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesBr = (iso: string): string => {
  const [a, m] = iso.slice(0, 7).split('-').map(Number);
  return `${MES_CURTO[m - 1]}/${String(a).slice(2)}`;
};
