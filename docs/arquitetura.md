# Arquitetura

Adgenda é uma aplicação web corporativa de agenda compartilhada de viagens. A lógica de negócio fica na API. Infraestrutura (banco, e-mail, autenticação) entra por adaptadores.

## Licença

GNU Affero General Public License v3.0 only (`AGPL-3.0-only`).

Desenvolvido por Victor Paschoal (alt: kodimier) kodimier@gmail.com

Quem disponibilizar uma versão modificada como serviço em rede precisa oferecer o código-fonte correspondente, nos termos da licença.

## Aplicações

```text
apps/api          NestJS — HTTP, domínio, aplicação, infraestrutura
apps/web          React + Vite — interface Grade
packages/shared   Contratos compartilhados (períodos, status, papéis)
```

Na API, as pastas já separam:

- `domain` — regras (permissão por agenda, histórico, convite)
- `application` — casos de uso
- `infrastructure` — PostgreSQL/Drizzle, SMTP, autenticação
- `interfaces/http` — controllers

## Interface

Direção escolhida: **Grade**.

- Barra lateral com agendas e integrantes
- Calendário no centro (semana, mês, trimestre, semestre, ano)
- Detalhe da viagem em drawer à direita
- Microinterações: hover nos chips, troca de período com fade, drawer deslizante, modal de criação, notificações, toast com desfazer

Ver `docs/interface.md`.

## Persistência e e-mail

PostgreSQL e Mailpit sobem com Docker Compose. O ORM e o envio de e-mail ainda não estão ligados; as portas de infraestrutura já existem para receber esses adaptadores sem alterar o domínio.
