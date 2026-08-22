import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Globe, Loader2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { useFazendaCadastro } from '@/hooks/useFazendaCadastro';
import {
  useAreaPlanejamento,
  type UpsertLinhaArea,
} from '@/hooks/useAreaPlanejamento';

// API real dos contexts (auditada em C3 Passo 1):
//   useCliente()  → { clienteAtual, ... }   (NÃO `cliente`)
//   useFazenda()  → { fazendaAtual, isGlobal, ... }
//   fazendaAtual?.id pode ser '__global__' (sentinel) — usar `isGlobal` do contexto
//   como verdade. Em modo Global, passar fazendaId=null ao hook.
//
// V2Index passa ano como string (mesmo padrão de V2AuditoriaAnual). Convertemos
// internamente para number (que é o que useAreaPlanejamento espera).

interface Props {
  ano: string;
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

/* As SETE areas, na ordem da tabela. `campo` e a chave no estado local,
   `col` e a coluna do banco — assim a tabela, o payload e o dirty se
   derivam de UMA lista, e acrescentar area nao exige tocar em cinco lugares. */
/* O grupo vive no DADO, nao em indice de posicao: inserir area nova no meio
   nao pode quebrar a separacao visual. */
const AREAS = [
  { campo: 'pec',     col: 'area_pecuaria_ha',     label: 'Pecuária',     grupo: 'produtiva' },
  { campo: 'agric',   col: 'area_agricultura_ha',  label: 'Agricultura',  grupo: 'produtiva' },
  { campo: 'silvi',   col: 'area_silvicultura_ha', label: 'Silvicultura', grupo: 'produtiva' },
  { campo: 'reserva', col: 'area_reserva_ha',      label: 'Reserva',      grupo: 'patrimonial' },
  { campo: 'app',     col: 'area_app_ha',          label: 'APP',          grupo: 'patrimonial' },
  { campo: 'benf',    col: 'area_benfeitorias_ha', label: 'Benfeitorias', grupo: 'patrimonial' },
  { campo: 'outras',  col: 'area_outras_ha',       label: 'Outras',       grupo: 'patrimonial' },
] as const;

type CampoArea = typeof AREAS[number]['campo'];

interface LinhaLocal {
  mes: number;
  /* string para permitir input vazio — vazio e "nao planejado", nao zero */
  pec: string;
  agric: string;
  silvi: string;
  reserva: string;
  app: string;
  benf: string;
  outras: string;
}

/* Separador de trimestre: derivado do MES, nunca de posicao na lista de
   colunas — inserir ou remover coluna nao pode deslocar a divisao. Dez nao
   recebe: a coluna Media logo em seguida ja tem fundo proprio. */
/* Cores das sete faixas do grafico. As tres produtivas reusam os tokens do
   donut da Visao Geral — mesma familia, mesma cor, em qualquer tela. As
   quatro patrimoniais compartilham `--patrimonial` e se distinguem por
   OPACIDADE: sao a mesma natureza, terra que nao produz. */
const COR_AREA: Record<string, string> = {
  pec:     'hsl(var(--success))',
  agric:   'hsl(var(--cta))',
  silvi:   'hsl(var(--primary))',
  reserva: 'hsl(var(--patrimonial) / 0.85)',
  app:     'hsl(var(--patrimonial) / 0.65)',
  benf:    'hsl(var(--patrimonial) / 0.45)',
  outras:  'hsl(var(--patrimonial) / 0.28)',
};

const bordaTrimestre = (mes: number) => (mes % 3 === 0 && mes !== 12 ? ' border-r border-border/60' : '');

const linhaVazia = (mes: number): LinhaLocal =>
  ({ mes, pec: '', agric: '', silvi: '', reserva: '', app: '', benf: '', outras: '' });

/* Parser e formatador pt-BR — copia VERBATIM de V2Fazendas.tsx:59-69 e
   PastosTab.tsx:55. Terceiro consumidor: a extracao para src/lib/ e a
   decisao registrada do projeto e vira PR proprio; aqui manter identico,
   nunca divergir.
   `parseAreaBR` devolve NULL para vazio E para invalido — que e o contrato
   deste PR. O `parseNumOrZero` que estava aqui devolvia 0 nos dois casos, e
   nem removia separador de milhar: "3.403,20" virava NaN e gravava ZERO. */
function formatarAreaBR(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseAreaBR(texto: string): number | null {
  const limpo = texto.replace(/\./g, '').replace(',', '.').trim();
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  /* Padrao numerico do sistema: pt-BR, 2 casas fixas, separador de milhar.
     Vale para valor EXIBIDO; o valor editado no input segue o que o componente
     ja faz — nao alterar parsing. */
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function media(arr: (number | null)[]): number | null {
  const v = arr.filter((x): x is number => x != null && Number.isFinite(x));
  if (v.length === 0) return null;
  return v.reduce((s, n) => s + n, 0) / v.length;
}

export function V2AreasMeta({ ano: anoInicial }: Props) {
  // Contexts (API real — ver comentário acima)
  const { clienteAtual } = useCliente();
  const { fazendaAtual, isGlobal } = useFazenda();
  const clienteId = clienteAtual?.id ?? null;
  const fazendaId = isGlobal ? null : (fazendaAtual?.id ?? null);

  const { toast } = useToast();

  // Ano local da tela: prop é string (V2Index), hook espera number.
  const anoInicialNum = useMemo(() => {
    const n = Number(anoInicial);
    return Number.isFinite(n) && n > 0 ? n : new Date().getFullYear();
  }, [anoInicial]);
  /* Ano vem do cabecalho da pagina, fonte unica. Havia um seletor proprio no card
     com estado `anoLocal`: o useEffect so sincronizava local <- prop, entao trocar o
     de dentro deixava os dois mostrando anos diferentes — e quem governava a query
     era o de dentro. */

  const { loading, saving, error, data, upsertAno } = useAreaPlanejamento(
    clienteId, fazendaId, anoInicialNum, isGlobal
  );

  // Estado local editável (12 linhas)
  const [linhas, setLinhas] = useState<LinhaLocal[]>(() =>
    Array.from({ length: 12 }, (_, i) => linhaVazia(i + 1))
  );

  // Sincronizar linhas locais com data quando carrega ou troca contexto.
  // Comportamento V1: descarta alterações não-salvas silenciosamente, com aviso visual via dirty.
  const lastSyncKeyRef = useRef<string>('');
  useEffect(() => {
    const key = `${clienteId ?? ''}|${fazendaId ?? ''}|${anoInicialNum}|${isGlobal ? 'g' : 'i'}`;
    if (key === lastSyncKeyRef.current && data == null) return;
    lastSyncKeyRef.current = key;
    if (!data) {
      setLinhas(Array.from({ length: 12 }, (_, i) => linhaVazia(i + 1)));
      return;
    }
    /* Texto do state ja em pt-BR: e o formato que parseAreaBR espera de volta.
       String(3403.2) daria "3403.2", e o ponto seria lido como MILHAR. */
    setLinhas(data.porMes.map(m => {
      const l = linhaVazia(m.mes);
      for (const a of AREAS) {
        const v = m[a.col];
        l[a.campo] = v == null ? '' : formatarAreaBR(Number(v));
      }
      return l;
    }));
  }, [data, clienteId, fazendaId, anoInicialNum, isGlobal]);

  /* ── PR-META-AREA-ASSISTIDA-01 — referencia da matricula ──
     So no modo individual: matricula e por fazenda. */
  const { data: cadastro } = useFazendaCadastro(
    clienteId ?? undefined, fazendaId ?? undefined, !isGlobal,
  );

  /* Decomposicao de fazenda_cadastros e lixo conhecido (V2Fazendas:273:
     "conferidos contra os pastos e descartados"). So o TOTAL confere — no
     Retiro Agricultura, 69,76 bate com a soma dos pastos, enquanto a
     Reserva declarada diz 108,49. Referencia por familia exigiria ler os
     pastos: fonte diferente, PR proprio. */
  const matricula = cadastro?.area_total_ha ?? null;

  /* Barras do grafico: lem o MESMO state dos inputs, nao o banco — por isso
     o grafico muda enquanto se digita, sem salvar. */
  const barras = useMemo(
    () => linhas.map(l => ({
      mes: l.mes,
      partes: AREAS.map(a => ({ campo: a.campo, valor: parseAreaBR(l[a.campo]) ?? 0 })),
      total: AREAS.reduce((s2, a) => s2 + (parseAreaBR(l[a.campo]) ?? 0), 0),
    })),
    [linhas],
  );

  /* Escala considera o maior entre matricula e maior total: quando ha area
     arrendada de terceiro o planejado excede a matricula, e a barra nao pode
     sair do grafico. */
  const escalaMax = useMemo(() => {
    const maiorTotal = Math.max(0, ...barras.map(b => b.total));
    return Math.max(maiorTotal, matricula ?? 0) || 1;
  }, [barras, matricula]);

  /* MOSTRAR, NAO IMPEDIR. Divergencia pode ser legitima — area arrendada de
     terceiro faz o planejado exceder a matricula de proposito (caso
     3 Muchachas, 50 ha). O sistema explica, o operador decide.
     Tolerancia de 0,01 ha para arredondamento. */
  const mesesDivergentes = useMemo(() => {
    if (isGlobal || matricula == null) return [];
    return barras
      .filter(b => b.total > 0 && Math.abs(b.total - matricula) > 0.01)
      .map(b => MESES[b.mes - 1]);
  }, [barras, matricula, isGlobal]);

  // Detectar dirty (apenas modo individual)
  const dirty = useMemo(() => {
    if (isGlobal || !data) return false;
    return data.porMes.some((m, idx) => {
      const ll = linhas[idx];
      return AREAS.some(a => parseAreaBR(ll[a.campo]) !== m[a.col]);
    });
  }, [linhas, data, isGlobal]);

  // Total mensal:
  // - Global: usar data.porMes[idx].area_total_ha (banco — inclui ambiental + infra futuros)
  // - Individual: pec + agric do estado local (ambiental e infra ficam zero na V1)
  const totalsLocal = useMemo(() => linhas.map((l, idx) => {
    if (isGlobal) return data?.porMes[idx]?.area_total_ha ?? null;
    const vals = AREAS.map(a => parseAreaBR(l[a.campo]));
    /* Mes sem NENHUM campo preenchido devolve null — "—" na tela, nao zero. */
    if (vals.every(v => v === null)) return null;
    return vals.reduce<number>((s2, v) => s2 + (v ?? 0), 0);
  }), [linhas, data, isGlobal]);

  /* Media por AREA, na ordem de AREAS. No Global vem do proprio banco. */
  const mediasPorArea = useMemo(
    () => AREAS.map(a => (isGlobal
      ? media((data?.porMes ?? []).map(m => m[a.col]))
      : media(linhas.map(l => parseAreaBR(l[a.campo]))))),
    [linhas, data, isGlobal],
  );
  // Média Total:
  // - Global: usa data.mediaTotal (já calculada pelo hook)
  // - Individual: média de totalsLocal (que é pec+agric)
  const mediaTot = useMemo(() => {
    if (isGlobal) return data?.mediaTotal ?? null;
    return media(totalsLocal);
  }, [isGlobal, data, totalsLocal]);

  function onChangeCelula(idx: number, campo: CampoArea, valor: string) {
    setLinhas(prev => prev.map((l, i) => i === idx ? { ...l, [campo]: valor } : l));
  }

  async function handleSalvar() {
    if (isGlobal) return;
    if (!clienteId || !fazendaId) {
      toast({ title: 'Selecione cliente e fazenda', variant: 'destructive' });
      return;
    }
    // Construir payload — só os meses preenchidos com pec OU agric
    const payload: UpsertLinhaArea[] = [];
    for (const l of linhas) {
      const vals = AREAS.map(a => parseAreaBR(l[a.campo]));
      /* Mes sem NENHUM campo preenchido nao e enviado — preserva a ausencia
         no banco. Campo vazio dentro de um mes que TEM algo vai como null,
         nunca como 0: nao planejado e diferente de planejado como zero. */
      if (vals.every(v => v === null)) continue;
      const linha = { mes: l.mes } as UpsertLinhaArea;
      AREAS.forEach((a, i) => { linha[a.col] = vals[i]; });
      payload.push(linha);
    }
    try {
      await upsertAno(payload);
      toast({ title: 'Áreas META salvas', description: `${payload.length} mês(es) atualizado(s).` });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao salvar';
      toast({ title: 'Erro ao salvar', description: msg, variant: 'destructive' });
    }
  }

  // === RENDER ===

  if (!clienteId) {
    return <div className="p-6 text-sm text-muted-foreground">Selecione um cliente para continuar.</div>;
  }

  return (
    <div className="p-3 md:p-4 space-y-3">
      {/* Header */}
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex flex-wrap items-start gap-2 justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Áreas META — Planejamento
                {isGlobal && (
                  <Badge variant="secondary" className="gap-1 h-5 text-[10px] px-1.5 bg-orange-100 text-orange-800 border-orange-200">
                    <Globe className="h-3 w-3" /> Global • soma das fazendas
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {isGlobal
                  ? 'Leitura agregada de todas as fazendas do cliente. Para editar, selecione uma fazenda.'
                  : `Edite a área pecuária e agrícola META mês a mês para ${fazendaAtual?.nome ?? 'esta fazenda'}.`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {!isGlobal && (
                <Button
                  size="sm"
                  onClick={handleSalvar}
                  disabled={!dirty || saving || loading}
                  className="h-8"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                  Salvar
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Banner dirty (alterações não salvas) — só individual */}
        {dirty && (
          <CardContent className="pt-0 pb-3">
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>Há alterações não salvas. Trocar de fazenda ou ano sem salvar descarta as edições.</span>
            </div>
          </CardContent>
        )}

        {/* Banner status cadastro — só individual, sem dirty (não duplicar) */}
        {!isGlobal && !dirty && data && data.mesesCadastrados > 0 && data.mesesCadastrados < 12 && (
          <CardContent className="pt-0 pb-3">
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>Áreas META cadastradas em {data.mesesCadastrados}/12 meses.</span>
            </div>
          </CardContent>
        )}

        {error && (
          <CardContent className="pt-0 pb-3">
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-1.5">
              Erro ao carregar áreas: {error.message}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Grafico — SVG puro, idioma do donut da Visao Geral. Doze barras nao
          justificam recharts, e a tela nao usa a lib em mais nada. */}
      <Card>
        <CardContent className="p-3">
          {(() => {
            const H = 120, TOPO = 6, BASE = H - 14;
            const alt = BASE - TOPO;
            const larg = 100 / 12;
            const yDe = (v: number) => BASE - (v / escalaMax) * alt;
            return (
              <>
                <svg viewBox="0 0 100 120" preserveAspectRatio="none" className="w-full h-[120px]">
                  {barras.map((b, i) => {
                    let acc = 0;
                    return (
                      <g key={b.mes}>
                        {b.partes.map(pt => {
                          if (pt.valor <= 0) return null;
                          const y = yDe(acc + pt.valor);
                          const h = (pt.valor / escalaMax) * alt;
                          acc += pt.valor;
                          return (
                            <rect key={pt.campo}
                              x={i * larg + larg * 0.18} width={larg * 0.64}
                              y={y} height={h} fill={COR_AREA[pt.campo]} />
                          );
                        })}
                      </g>
                    );
                  })}
                  {/* Linha da matricula: so no individual — ela e por fazenda. */}
                  {!isGlobal && matricula != null && (
                    <line x1="0" x2="100" y1={yDe(matricula)} y2={yDe(matricula)}
                      stroke="hsl(var(--foreground))" strokeWidth="0.4"
                      strokeDasharray="1.5 1.5" vectorEffect="non-scaling-stroke" />
                  )}
                </svg>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] text-muted-foreground">
                    {AREAS.map(a => (
                      <span key={a.campo} className="flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-full shrink-0"
                          style={{ background: COR_AREA[a.campo] }} />
                        {a.label}
                      </span>
                    ))}
                  </div>
                  {!isGlobal && matricula != null && (
                    <span className="text-[9px] text-muted-foreground shrink-0 tabular-nums">
                      Matrícula {fmt(matricula)} ha
                    </span>
                  )}
                </div>
                <div className="flex text-[8px] text-muted-foreground">
                  {MESES.map(m => (
                    <span key={m} className="flex-1 text-center">{m}</span>
                  ))}
                </div>
              </>
            );
          })()}
        </CardContent>
      </Card>

      {/* Tabela — compacta, paleta META (laranja muito leve), sem scroll horizontal em notebook padrão */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-3 space-y-2">
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
            </div>
          ) : (
            <table className="w-full text-xs tabular-nums">
              <thead className="bg-orange-50 dark:bg-orange-950/20 border-b border-orange-200/60 dark:border-orange-900/40">
                <tr>
                  <th className="text-left px-2 py-1.5 font-semibold sticky left-0 bg-orange-50 dark:bg-orange-950/20 min-w-[100px] text-orange-900 dark:text-orange-200">Linha (ha)</th>
                  {/* Referencia da matricula — so no individual: ela e por fazenda. */}
                  {!isGlobal && (
                    <th className="px-1 py-1.5 font-semibold text-center min-w-[58px] border-r border-border text-orange-900 dark:text-orange-200">Matrícula</th>
                  )}
                  {MESES.map((m, i) => (
                    <th key={m} className={`px-1 py-1.5 font-semibold text-center min-w-[56px] text-orange-900 dark:text-orange-200${bordaTrimestre(i + 1)}`}>{m}</th>
                  ))}
                  <th className="px-2 py-1.5 font-semibold text-center bg-orange-100/60 dark:bg-orange-900/30 min-w-[68px] text-orange-900 dark:text-orange-200">Média</th>
                </tr>
              </thead>
              <tbody>
                {/* As SETE areas, geradas de AREAS — uma lista, uma anatomia. */}
                {AREAS.map((a, ai) => {
                  const patri = a.grupo === 'patrimonial';
                  /* Divisoria acima da PRIMEIRA patrimonial, derivada do grupo —
                     nao do indice, para sobreviver a insercao de area nova. */
                  const primeiraPatri = patri && AREAS[ai - 1]?.grupo !== 'patrimonial';
                  return (
                  <tr key={a.campo} className={`hover:bg-orange-50/40 dark:hover:bg-orange-950/10 transition-colors${
                    primeiraPatri ? ' border-t border-border' : ''
                  } ${patri ? 'odd:bg-muted/60 even:bg-muted/40' : 'odd:bg-muted/30 even:bg-card'}`}>
                    {/* A celula sticky precisa de fundo OPACO — senao o conteudo
                        rolado aparece por baixo. Por isso ela nao herda a zebra;
                        acompanha o GRUPO, que e a distincao que importa. */}
                    <td className={`px-2 py-1 font-medium sticky left-0 ${
                      patri ? 'bg-muted/50 text-muted-foreground' : 'bg-background'
                    }`}>{a.label}</td>
                    {/* Sem valor por familia: so o total da matricula confere. */}
                    {!isGlobal && (
                      <td className="px-1 py-1 border-r border-border" />
                    )}
                    {linhas.map((l, idx) => {
                      return (
                        <td key={l.mes} className={`px-0.5 py-0.5 text-center${bordaTrimestre(l.mes)}`}>
                          {isGlobal ? (
                            <span className="text-[9px] italic text-meta">
                              {fmt(data?.porMes[idx]?.[a.col] ?? null)}
                            </span>
                          ) : (
                            /* type="text" + inputMode: `type="number"` nao exibe
                               separador de milhar nem virgula decimal (veta do A6).
                               Foco mostra o valor CRU; blur reformata em pt-BR. */
                            <Input
                              type="text"
                              inputMode="decimal"
                              /* Sem moldura em repouso: a tabela do individual passa a ler
                                 igual a do Global. `border-0 bg-transparent` sobrescrevem a
                                 base do Input via twMerge, e o fundo transparente herda a
                                 zebra da linha — inclusive o tom mais escuro das
                                 patrimoniais. O contorno volta no FOCO, com o mesmo
                                 focus-visible:ring da base; so o offset cai para 0, que em
                                 celula de 6px de altura vazaria para as vizinhas. */
                              className="h-6 w-full text-right px-0.5 tabular-nums text-[9px] italic text-meta border-0 bg-transparent focus-visible:ring-offset-0"
                              value={l[a.campo]}
                              onChange={(e) => onChangeCelula(idx, a.campo, e.target.value)}
                              /* O state guarda o texto CRU enquanto se digita; o blur
                                 reformata. Nao precisa de estado de foco: "3.403,20"
                                 volta a ser parseavel se o operador reeditar. */
                              onBlur={() => onChangeCelula(idx, a.campo, formatarAreaBR(parseAreaBR(l[a.campo])))}
                              disabled={saving}
                              placeholder="—"
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="px-1 py-1 text-center font-medium bg-orange-50/60 dark:bg-orange-950/15 text-[9px] italic text-meta">{fmt(mediasPorArea[ai])}</td>
                  </tr>
                  );
                })}

                {/* Total — sempre read-only, paleta META destaque */}
                <tr className="bg-orange-100/50 dark:bg-orange-900/25 border-t-2 border-orange-200/70 dark:border-orange-900/50">
                  <td className="px-2 py-1.5 font-semibold sticky left-0 bg-orange-100/50 dark:bg-orange-900/25 text-orange-900 dark:text-orange-200">Total</td>
                  {!isGlobal && (
                    <td className="px-1 py-1.5 text-right text-[9px] tabular-nums font-semibold text-muted-foreground border-r border-border">
                      {fmt(matricula)}
                    </td>
                  )}
                  {linhas.map((_, idx) => (
                    <td key={idx} className={`px-0.5 py-1.5 text-center font-semibold text-[9px] italic text-meta${bordaTrimestre(idx + 1)}`}>
                      {fmt(totalsLocal[idx])}
                    </td>
                  ))}
                  <td className="px-1 py-1.5 text-center font-semibold bg-orange-200/40 dark:bg-orange-900/40 text-[9px] italic text-meta">{fmt(mediaTot)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Rodapé informativo */}
      <p className="text-[11px] text-muted-foreground">
        {isGlobal
          ? 'Global: Total = soma de todas as áreas cadastradas no banco. Em modo Global, mês é considerado cadastrado se ao menos uma fazenda tiver linha.'
          : 'Total = soma das sete áreas. Campo em branco significa não planejado, diferente de planejado como zero.'}
      </p>

      {/* MOSTRAR, NAO IMPEDIR. Divergencia pode ser legitima — area arrendada
          de terceiro faz o planejado exceder a matricula de proposito (caso
          3 Muchachas, 50 ha). O sistema explica, o operador decide. */}
      {mesesDivergentes.length > 0 && (
        <p className="text-[11px] text-warning">
          Planejado difere da matrícula em {mesesDivergentes.length} {mesesDivergentes.length === 1 ? 'mês' : 'meses'}: {mesesDivergentes.join(', ')}.
        </p>
      )}
    </div>
  );
}
