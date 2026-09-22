export interface Agenda {
  id: string;
  name: string;
  role: "administrador" | "integrante";
}

export interface Member {
  id: string;
  name: string;
  initials: string;
}

export interface Trip {
  id: string;
  owner: string;
  role: string;
  client: string;
  destination: string;
  objective: string;
  startDay: number;
  endDay: number;
  time: string;
  returnDate: string;
}

export const AGENDAS: Agenda[] = [
  { id: "comercial", name: "Agenda Comercial", role: "administrador" },
  { id: "equatorial", name: "Projeto Equatorial", role: "integrante" },
  { id: "diretoria", name: "Agenda Diretoria", role: "integrante" },
];

export const MEMBERS: Member[] = [
  { id: "vp", name: "Victor Paschoal", initials: "VP" },
  { id: "am", name: "Ana Martins", initials: "AM" },
  { id: "rs", name: "Rafael Souza", initials: "RS" },
];

export const TRIPS: Trip[] = [
  {
    id: "t1",
    owner: "Ana Martins",
    role: "Analista Comercial",
    client: "Cliente X",
    destination: "São Paulo",
    objective: "Reunião de alinhamento",
    startDay: 12,
    endDay: 12,
    time: "10:00",
    returnDate: "12/06/2026",
  },
  {
    id: "t2",
    owner: "Victor Paschoal",
    role: "Gerente de Contas",
    client: "Equatorial",
    destination: "Belém",
    objective: "Apresentação de Portfolio",
    startDay: 20,
    endDay: 22,
    time: "09:00",
    returnDate: "22/06/2026",
  },
  {
    id: "t3",
    owner: "Rafael Souza",
    role: "Engenheiro",
    client: "Operações Norte",
    destination: "Manaus",
    objective: "Visita técnica",
    startDay: 28,
    endDay: 28,
    time: "07:30",
    returnDate: "28/06/2026",
  },
];

export const NOTIFICATIONS = [
  {
    id: "n1",
    title: "Victor Paschoal adicionou uma nova viagem",
    summary: "Equatorial — Apresentação de Portfolio",
    when: "20/06/2026",
    unread: true,
  },
  {
    id: "n2",
    title: "Victor Paschoal alterou uma viagem",
    summary: "Alteração de horário",
    when: "21/06/2026 — 15:42",
    unread: true,
  },
  {
    id: "n3",
    title: "Ana Martins removeu uma viagem",
    summary: "Cliente X — Alinhamento",
    when: "12/06/2026 — 16:30",
    unread: false,
  },
];
