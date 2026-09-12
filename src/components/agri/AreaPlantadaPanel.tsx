/**
 * O PAINEL DE LAVOURA DO PASTO — AGRI-AREA-PLANTADA-01.
 *
 * ⚠ ELE OCUPA O LUGAR DAS CATEGORIAS DE GADO, e é essa a razão de existir: um pasto de
 * `tipo_uso = agricultura` abria o modal do fechamento pedindo Machos, Fêmeas, Garrotes e
 * Vacas — perguntas que não têm resposta num talhão de amendoim. O operador fechava o pasto
 * deixando tudo em branco, e o "pasto sem rebanho" virava rotina.
 * ⚠ É UMA LISTA, NÃO UM FORMULÁRIO. A UNIQUE do banco é (safra, pasto, cultura): o mesmo pasto
 * tem amendoim e milho na mesma temporada — a safrinha — e um formulário único obrigaria a
 * escolher qual das duas o sistema enxerga.
 * ⚠ A SAFRA É DO PAINEL, NÃO DA LINHA: todas as culturas exibidas são da safra escolhida no
 * topo. Trocar a safra troca a lista inteira, que é como o operador pensa ("o que plantei
 * aqui em 25/26").
 */
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Save, Sprout } from 'lucide-react';
import { toast } from 'sonner';
import { formatNum } from '@/lib/calculos/formatters';
import {
  CULTURAS_AREA, validarAreaPlantada, culturaDuplicada, somaAreas, labelDaCultura,
  safrasQueCobremOMes, safraInicialDoMes,
  type AreaPlantadaForm,
} from '@/lib/agri/areaPlantada';
import { useAreaPlantada, useSafrasLavoura, useAreasPorPastoNaJanela } from '@/hooks/useAreaPlantada';
import { ColheitaPanel } from './ColheitaPanel';
import { useColheita } from '@/hooks/useColheita';

interface Props {
  clienteId: string | null | undefined;
  pastoId: string;
  pastoNome: string;
  areaProdutivaHa: number | null;
  /** A competência aberta, 'yyyy-MM' — só para achar a safra da janela. */
  anoMes: string;
  /** Mês fechado ou trava mestre: a lista vira leitura. */
  somenteLeitura: boolean;
}

const linhaVazia = (): AreaPlantadaForm => ({
  id: null, cultura: '', areaHa: '', dataPlantio: '', dataColheitaPrevista: '',
});

export function AreaPlantadaPanel({ clienteId, pastoId, pastoNome, areaProdutivaHa, anoMes, somenteLeitura }: Props) {
  const { safras, carregando: carregandoSafras } = useSafrasLavoura(clienteId);
  const [safraId, setSafraId] = useState<string>('');
  const { areas, carregando, salvar } = useAreaPlantada(safraId || null, pastoId);
  const [linhas, setLinhas] = useState<AreaPlantadaForm[]>([]);
  const [salvando, setSalvando] = useState(false);

  /**
   * A SAFRA QUE COBRE O MÊS ABERTO — AGRI-AREA-POR-SAFRA-01.
   *
   * ⚠ ERA "A PRIMEIRA DA LISTA", e estava errado. As sete safras de lavoura do NJ têm
   * `ordem_exibicao = 0`; o desempate por nome punha "Safra 23/24 Amendoim" na frente, e o
   * painel abria nela SEMPRE — em outubro de 2025 como em qualquer outro mês. A área gravada
   * em 25/26-Lav não reaparecia nem no mês em que tinha sido salva, e editar virava
   * recadastrar. O mês não era o culpado; a escolha inicial era.
   * ⚠ E A PREFERÊNCIA É PELA SAFRA QUE JÁ TEM ÁREA DESTE PASTO, porque três safras cobrem a
   * mesma janela (25/26-AMD, 25/26-Lav, 25/26-MAND são a mesma temporada com rótulos de
   * quando a cultura morava no código). Sem essa preferência, reabrir o pasto cairia numa
   * irmã vazia.
   * ⚠ SÓ ESCOLHE SOZINHO ENQUANTO NINGUÉM ESCOLHEU: trocar de safra à mão é decisão tomada, e
   * o efeito não pode desfazê-la no render seguinte.
   */
  const safrasDaJanela = useMemo(() => safrasQueCobremOMes(safras, anoMes), [safras, anoMes]);
  const idsDaJanela = useMemo(() => safrasDaJanela.map(s => s.id), [safrasDaJanela]);
  const comDados = useAreasPorPastoNaJanela(idsDaJanela);
  const safrasComDadosDoPasto = useMemo(
    () => new Set(comDados.get(pastoId)?.safraIds ?? []),
    [comDados, pastoId]);

  useEffect(() => {
    if (safraId) return;
    const inicial = safraInicialDoMes(safras, anoMes, safrasComDadosDoPasto);
    if (inicial) setSafraId(inicial.id);
  }, [safras, anoMes, safraId, safrasComDadosDoPasto]);

  /* O que está no banco vira o que está na tela — inclusive a lista vazia, que abre com UMA
     linha em branco para o operador não precisar clicar em "Adicionar" antes de digitar. */
  const [gravado, setGravado] = useState('');
  useEffect(() => {
    if (carregando) return;
    const doBanco = areas.length > 0
      ? areas.map(a => ({
          id: a.id,
          cultura: a.cultura,
          areaHa: String(a.area_plantada_ha).replace('.', ','),
          dataPlantio: a.data_plantio ?? '',
          dataColheitaPrevista: a.data_colheita_prevista ?? '',
        }))
      : [linhaVazia()];
    setLinhas(doBanco);
    /* ⚠ A FOTO DO QUE ESTÁ GRAVADO, para o botão saber se há o que salvar. Ela é tirada aqui
       e SÓ aqui: depois do salvar, o `carregar()` do hook devolve as linhas novas e passa por
       este mesmo efeito — a foto se atualiza sozinha e o botão volta a repousar. */
    setGravado(JSON.stringify(doBanco));
  }, [areas, carregando]);

  /* Quais talhões já têm romaneio — o que impede a remoção silenciosa em cascata. A mesma
     consulta que o bloco de colheita faz; o hook a devolve uma vez e os dois a usam. */
  const { linhas: colheitasDasAreas } = useColheita(useMemo(() => areas.map(a => a.id), [areas]));
  const areasComColheita = useMemo(
    () => new Set(colheitasDasAreas.map(c => c.safra_area_id)),
    [colheitasDasAreas]);

  const total = useMemo(() => somaAreas(linhas), [linhas]);
  const duplicada = useMemo(() => culturaDuplicada(linhas), [linhas]);
  /**
   * ⚠ O BOTÃO SÓ SE ACENDE QUANDO HÁ O QUE SALVAR — AGRI-AREA-POR-SAFRA-01 item 4. Ele ficava
   * em destaque para sempre depois de gravar, e um botão que parece pedir ação quando não há
   * ação pendente ensina a clicá-lo por via das dúvidas — que é como se grava duas vezes o
   * mesmo dado e se desconfia da tela.
   * ⚠ COMPARAÇÃO POR TEXTO, e serve porque a lista é curta e as chaves saem sempre na mesma
   * ordem (é o mesmo `map` que a montou). Não é igualdade profunda genérica; é a foto contra
   * o estado atual.
   */
  const sujo = JSON.stringify(linhas) !== gravado;

  const editar = (idx: number, campo: keyof AreaPlantadaForm, valor: string) => {
    setLinhas(prev => prev.map((l, i) => (i === idx ? { ...l, [campo]: valor } : l)));
  };

  /* ⚠ A ÁREA DO PASTO É A SUGESTÃO DA PRIMEIRA CULTURA, e só dela: quem acrescenta a segunda
     está dividindo o mesmo pasto, e repetir o total ali faria a soma dobrar em silêncio. */
  const adicionar = () => setLinhas(prev => [...prev, linhaVazia()]);
  /**
   * ⚠ REMOVER ÁREA COM COLHEITA APAGARIA OS ROMANEIOS — a FK de `agri_colheita` é
   * `ON DELETE CASCADE` (conferido no `pg_constraint`). Em silêncio, e sem desfazer: o
   * operador tiraria a cultura para corrigir um hectare e perderia as entregas do talhão.
   * ⚠ POR ISSO O CAMINHO É INVERTIDO: apaga-se a colheita primeiro, onde ela aparece. A tela
   * diz isso em vez de pedir confirmação — confirmação de perda irreversível é convite a
   * clicar "sim" por hábito.
   */
  const remover = (idx: number) => {
    const alvo = linhas[idx];
    if (alvo?.id && areasComColheita.has(alvo.id)) {
      toast.error('Este talhão tem romaneios lançados. Apague a colheita dele antes de remover a área.');
      return;
    }
    setLinhas(prev => (prev.length === 1 ? [linhaVazia()] : prev.filter((_, i) => i !== idx)));
  };

  const handleSalvar = async () => {
    if (!clienteId || !safraId) { toast.error('Escolha a safra.'); return; }
    if (duplicada) { toast.error(`${labelDaCultura(duplicada)} aparece duas vezes — uma cultura por safra.`); return; }
    /* Linha totalmente em branco não é erro: é a linha que o painel abre sozinho. Ela sai da
       gravação em silêncio; o que não se faz é gravar cultura sem área nem área sem cultura. */
    const preenchidas = linhas.filter(l => l.cultura.trim() || l.areaHa.trim());
    const payloads: Array<{ id: string | null; cultura: string; area_plantada_ha: number; data_plantio: string | null; data_colheita_prevista: string | null }> = [];
    for (const l of preenchidas) {
      const v = validarAreaPlantada(l, areaProdutivaHa);
      if (!v.ok || !v.payload) { toast.error(v.erro ?? 'Linha inválida.'); return; }
      payloads.push({ id: l.id, ...v.payload });
    }
    setSalvando(true);
    try {
      const r = await salvar(payloads, clienteId);
      if (!r.ok) { toast.error(r.erro ?? 'Não foi possível salvar.'); return; }
      toast.success(payloads.length === 0
        ? 'Áreas removidas.'
        : `${payloads.length} ${payloads.length === 1 ? 'área salva' : 'áreas salvas'} em ${pastoNome}.`);
    } finally {
      setSalvando(false);
    }
  };

  if (!carregandoSafras && safras.length > 0 && safrasDaJanela.length === 0) {
    /* ⚠ NÃO ABRE NUMA SAFRA DE OUTRO ANO. Sem safra cobrindo o mês, o certo é dizer isso: o
       contrário seria oferecer o seletor com 23/24 e convidar a gravar no lugar errado. */
    return (
      <div className="rounded-md border border-dashed p-4 text-center text-[12px] text-muted-foreground">
        Nenhuma safra de <b>Lavoura</b> cobre este mês.
        <div className="mt-1 text-[11px]">
          A janela sai de <b>Cadastros → Safras</b> (início e fim da safra). A virada é em julho.
        </div>
      </div>
    );
  }

  if (!carregandoSafras && safras.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-4 text-center text-[12px] text-muted-foreground">
        Nenhuma safra de <b>Lavoura</b> cadastrada para este cliente.
        <div className="mt-1 text-[11px]">Cadastre em <b>Cadastros → Safras</b>, com escopo Lavoura.</div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-end gap-2">
        <div className="w-[220px] shrink-0">
          <Label className="text-[10px]">Safra <span className="text-destructive">*</span></Label>
          <Select value={safraId} onValueChange={setSafraId} disabled={somenteLeitura}>
            <SelectTrigger className="mt-0.5 h-8 text-[12px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {/* ⚠ SÓ AS SAFRAS DA JANELA. Oferecer as sete faria o operador gravar amendoim de
                  25/26 numa safra de 2023 com dois cliques — e o dado não teria como avisar. */}
              {safrasDaJanela.map(s => (
                <SelectItem key={s.id} value={s.id} className="text-[12px]">{s.codigo || s.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* ⚠ O TOTAL AO LADO DA ÁREA DO PASTO, sempre visível: é a única forma de o operador
            ver que dividiu o pasto certo entre duas culturas antes de salvar. */}
        <div className="flex-1 text-[11px] text-muted-foreground">
          Plantado: <b className="text-foreground tabular-nums">{formatNum(total, 1)} ha</b>
          {areaProdutivaHa ? <> de <span className="tabular-nums">{formatNum(areaProdutivaHa, 1)} ha</span> do pasto</> : null}
        </div>
      </div>

      <div className="space-y-1.5">
        {linhas.map((l, idx) => (
          <div key={l.id ?? `nova-${idx}`}
            className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 rounded-md border bg-card px-2 py-1.5">
            <div>
              <Label className="text-[10px]">Cultura <span className="text-destructive">*</span></Label>
              <Select value={l.cultura} onValueChange={v => editar(idx, 'cultura', v)} disabled={somenteLeitura}>
                <SelectTrigger className="mt-0.5 h-8 text-[12px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {CULTURAS_AREA.map(c => (
                    <SelectItem key={c.valor} value={c.valor} className="text-[12px]">{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px]">Área (ha) <span className="text-destructive">*</span></Label>
              <Input value={l.areaHa} onChange={e => editar(idx, 'areaHa', e.target.value)}
                inputMode="decimal" placeholder={idx === 0 && areaProdutivaHa ? formatNum(areaProdutivaHa, 1) : '0,0'}
                disabled={somenteLeitura}
                className="mt-0.5 h-8 text-right font-mono text-[12px]" />
            </div>
            <div>
              <Label className="text-[10px]">Plantio</Label>
              <DatePicker value={l.dataPlantio} onChange={v => editar(idx, 'dataPlantio', v)}
                disabled={somenteLeitura} className="mt-0.5" />
            </div>
            <div>
              <Label className="text-[10px]">Colheita prevista</Label>
              <DatePicker value={l.dataColheitaPrevista} onChange={v => editar(idx, 'dataColheitaPrevista', v)}
                disabled={somenteLeitura} className="mt-0.5" />
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
              disabled={somenteLeitura} onClick={() => remover(idx)}
              title="Remover esta cultura">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      {duplicada && (
        <div className="rounded-md border border-amber-400 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <b>{labelDaCultura(duplicada)}</b> aparece duas vezes. O banco guarda uma linha por cultura em cada safra —
          some as duas áreas ou escolha outra cultura.
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]"
          disabled={somenteLeitura} onClick={adicionar}>
          <Plus className="h-3 w-3" /> Outra cultura
        </Button>
        <span className="text-[10px] text-muted-foreground">
          <Sprout className="mr-1 inline h-3 w-3" />
          Duas culturas na mesma safra é a safrinha — cada uma com a sua área.
        </span>
        <div className="flex-1" />
        {/* Botão desabilitado diz por quê, ao lado — a regra da casa. */}
        {!sujo && !somenteLeitura && safraId && (
          <span className="text-[10px] text-muted-foreground">sem alterações</span>
        )}
        <Button size="sm" variant={sujo ? 'default' : 'outline'} className="h-7 gap-1 text-[11px]"
          disabled={somenteLeitura || salvando || !safraId || !sujo} onClick={handleSalvar}>
          <Save className="h-3 w-3" /> {salvando ? 'Salvando…' : 'Salvar lavoura'}
        </Button>
      </div>

      {/* ⚠ A COLHEITA VÊM DAS ÁREAS GRAVADAS (`areas`), NUNCA DAS LINHAS EM EDIÇÃO: o romaneio
          aponta para `agri_safra_area.id`, e uma linha que o operador acabou de digitar ainda
          não tem id. Pendurar colheita em rascunho seria prometer um vínculo inexistente. */}
      <ColheitaPanel clienteId={clienteId} areas={areas} somenteLeitura={somenteLeitura} />
    </div>
  );
}
