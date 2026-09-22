import type { PeriodView } from "@adgenda/shared";

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export { WEEKDAYS };

export function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + offset);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function periodRange(view: PeriodView, cursor: Date) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  if (view === "semana") {
    const from = startOfWeek(cursor);
    const to = addDays(from, 6);
    return { from: toIsoDate(from), to: toIsoDate(to), title: `${formatHuman(from)} — ${formatHuman(to)}` };
  }
  if (view === "mes") {
    const from = new Date(year, month, 1);
    const to = new Date(year, month + 1, 0);
    return {
      from: toIsoDate(from),
      to: toIsoDate(to),
      title: from.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
    };
  }
  if (view === "trimestre") {
    const startMonth = Math.floor(month / 3) * 3;
    const from = new Date(year, startMonth, 1);
    const to = new Date(year, startMonth + 3, 0);
    return { from: toIsoDate(from), to: toIsoDate(to), title: `${monthName(from)} — ${monthName(to)} ${year}` };
  }
  if (view === "semestre") {
    const startMonth = month < 6 ? 0 : 6;
    const from = new Date(year, startMonth, 1);
    const to = new Date(year, startMonth + 6, 0);
    return { from: toIsoDate(from), to: toIsoDate(to), title: `${monthName(from)} — ${monthName(to)} ${year}` };
  }
  const from = new Date(year, 0, 1);
  const to = new Date(year, 11, 31);
  return { from: toIsoDate(from), to: toIsoDate(to), title: String(year) };
}

export function shiftPeriod(view: PeriodView, cursor: Date, direction: -1 | 1) {
  const next = new Date(cursor);
  if (view === "semana") next.setDate(next.getDate() + 7 * direction);
  else if (view === "mes") next.setMonth(next.getMonth() + direction);
  else if (view === "trimestre") next.setMonth(next.getMonth() + 3 * direction);
  else if (view === "semestre") next.setMonth(next.getMonth() + 6 * direction);
  else next.setFullYear(next.getFullYear() + direction);
  return next;
}

export function monthCells(cursor: Date) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(start, index);
    return {
      iso: toIsoDate(date),
      day: date.getDate(),
      inMonth: date.getMonth() === month,
    };
  });
}

export function weekCells(cursor: Date) {
  const start = startOfWeek(cursor);
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    return { iso: toIsoDate(date), day: date.getDate(), inMonth: true };
  });
}

export function monthsInRange(from: string, to: string) {
  const start = fromIsoDate(from);
  const end = fromIsoDate(to);
  const months: { label: string; year: number; month: number }[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    months.push({
      label: cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
      year: cursor.getFullYear(),
      month: cursor.getMonth(),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

function formatHuman(date: Date) {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function monthName(date: Date) {
  return date.toLocaleDateString("pt-BR", { month: "short" });
}
