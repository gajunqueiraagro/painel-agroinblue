import { format, subMonths } from 'date-fns';

export function getAnoMesOptions(count = 24): string[] {
  const opts: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = subMonths(now, i);
    opts.push(format(d, 'yyyy-MM'));
  }
  return opts;
}

export function formatAnoMes(anoMes: string): string {
  return anoMes.split('-').reverse().join('/');
}
