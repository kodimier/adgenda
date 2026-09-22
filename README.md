# Adgenda

Agenda compartilhada de viagens corporativas.

Este software é livre: você pode redistribuí-lo e/ou modificá-lo sob os termos da **GNU Affero General Public License versão 3** (somente), conforme publicado pela Free Software Foundation. O texto integral está em [`LICENSE`](LICENSE).

Não há garantia. Veja a licença para detalhes.

**Desenvolvido por Victor Paschoal (alt: kodimier) kodimier@gmail.com**

## Stack

| Camada | Tecnologia |
| --- | --- |
| API | TypeScript, NestJS |
| Web | TypeScript, React, Vite, Tailwind CSS |
| Banco | PostgreSQL |
| ORM previsto | Drizzle (ainda não ligado) |
| Monorepo | pnpm workspaces |

A interface segue o modelo **Grade**: calendário clássico, detalhes em drawer lateral e microinterações discretas.

## Requisitos

- Node.js 20 ou superior
- pnpm 12
- Docker, para PostgreSQL e Mailpit

## Execução local

```bash
cp .env.example .env
pnpm install
pnpm infra:up
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:3000/api/v1/health
- Mailpit (e-mails de desenvolvimento): http://localhost:8025

Documentação de arquitetura e instalação: [`docs/`](docs/).
