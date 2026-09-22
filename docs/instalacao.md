# Instalação e execução

Desenvolvido por Victor Paschoal (alt: kodimier) kodimier@gmail.com

## Dependências

- Node.js >= 20
- pnpm 12
- Docker Engine / Docker Desktop

## Passos

1. Clone o repositório.
2. Copie `.env.example` para `.env`.
3. Instale as dependências: `pnpm install`
4. Suba PostgreSQL e Mailpit: `pnpm infra:up`
5. Inicie API e web: `pnpm dev`

A API responde em `http://localhost:3000/api/v1/health`.
A web responde em `http://localhost:5173`.
O Mailpit (caixa de e-mail local) responde em `http://localhost:8025`.

## Scripts

| Comando | Efeito |
| --- | --- |
| `pnpm dev` | API e web em modo desenvolvimento |
| `pnpm build` | Compila shared, API e web |
| `pnpm infra:up` | Sobe Postgres e Mailpit |
| `pnpm infra:down` | Derruba os containers |

## Produção

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Origens, SMTP e chaves de provedor ficam no `.env` local, sem commit. Sem `BREVO_API_KEY`, os e-mails caem no Mailpit.

## Internalização

O front é uma SPA estática. Em ambiente corporativo pode ser servido por Nginx (ou equivalente). A API é um processo Node independente. Banco, SMTP e autenticação devem ser trocados pelos adaptadores de infraestrutura, sem reescrever as regras de permissão, histórico e convite.
