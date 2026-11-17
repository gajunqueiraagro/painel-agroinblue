/**
 * OF-CONFERIR-CASAMENTO-01 (Gabriel 17/11) — DIAS ÚTEIS entre a data do BANCO (Open Finance = data da transação) e a do EXTRATO (OFX =
 * data contábil). Uma régua para a conferência (`conferirComSistema`) e para a importação (`outraDataDaImportacao`).
 */
const diaUtc = (dia: string) => new Date(`${dia.slice(0, 10)}T12:00:00Z`);

/** A JANELA: o extrato pode lançar até 3 dias ÚTEIS depois da data do banco. */
export const DIAS_UTEIS_DE_TOLERANCIA = 3;

/** Os feriados NACIONAIS de data fixa (mm-dd): o banco não lança neles. Os móveis (Carnaval, Paixão, Corpus Christi) não entram — o efeito
 *  é só a janela ficar 1 dia mais larga nessas semanas. */
const FERIADOS_FIXOS = new Set(['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']);
/** Dias úteis DEPOIS de `de` até `ate`, inclusive: dom 01/11/2026 → ter 03/11 = 1 (02/11 é Finados). `ate` antes de `de` = -1. */
export function diasUteisEntre(de: string, ate: string): number {
  const a = diaUtc(de); const b = diaUtc(ate);
  if (b.getTime() < a.getTime()) return -1;
  let n = 0;
  for (const d = new Date(a); d.getTime() < b.getTime();) {
    d.setUTCDate(d.getUTCDate() + 1);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6 && !FERIADOS_FIXOS.has(d.toISOString().slice(5, 10))) n += 1;
  }
  return n;
}


/** Dias corridos de `de` a `ate` (o "mais próximo"). */
export const diasCorridosEntre = (de: string, ate: string): number => Math.round((diaUtc(ate).getTime() - diaUtc(de).getTime()) / 86_400_000);
