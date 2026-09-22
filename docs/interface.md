# Interface — Grade

Desenvolvido por Victor Paschoal (alt: kodimier) kodimier@gmail.com

Direção fechada para o produto: calendário clássico com detalhes em drawer.

## Layout

1. **Esquerda** — agendas das quais o usuário participa, papel em cada uma, integrantes, conta atual.
2. **Topo** — agenda ativa, período, modos (semana, mês, trimestre, semestre, ano), notificações, nova viagem.
3. **Centro** — grade temporal das viagens.
4. **Direita** — drawer de detalhe (nome, cargo, cliente, destino, objetivo, ida, volta, ações).

A visualização mostra todas as viagens da agenda. Alterar ou cancelar só aparece para quem tem permissão; isso será reforçado na API, não só na tela.

## Microinterações

Todas discretas (cerca de 180–220ms), sem comprometer produtividade.

| Ação | Comportamento |
| --- | --- |
| Troca de período | A grade troca com fade curto, sem recarregar a página |
| Hover na viagem | Chip sobe 2px e mostra tooltip (responsável, cargo, horário) |
| Clique na viagem | Drawer desliza da direita; overlay suave; Esc fecha |
| Nova viagem | Modal surge no centro a partir do botão |
| Notificações | Lista desce no sino; item lido some o contador |
| Cancelar | Chip some; toast com **Desfazer** por alguns segundos |

## Administração

Contas marcadas como administradoras veem **Administração** no menu lateral. O painel lista as contas com busca por nome, e-mail ou cargo e filtros (ativos, bloqueados, administradores, removidos), e mostra cargo, número de agendas e último acesso.

Ao abrir uma conta, o administrador pode:

- corrigir nome, e-mail e cargo;
- confirmar o e-mail de quem não recebeu a mensagem;
- enviar o link de redefinição de senha;
- dar ou tirar acesso de administrador;
- bloquear e desbloquear (bloquear encerra as sessões abertas);
- remover a conta de um colaborador desligado.

Remover anonimiza a conta: nome, e-mail e senha são apagados, as viagens continuam no histórico como "Conta removida" e o e-mail fica livre para um novo cadastro. Agendas em que a pessoa era a única administradora passam para o integrante mais antigo ou, sem integrantes, são arquivadas. A remoção pede que o e-mail da conta seja digitado.

Ninguém bloqueia, remove ou muda o próprio acesso pelo painel. Toda ação fica na aba **Registro**, com quem fez, em quem e quando.

## Login e cadastro

A aplicação abre na tela de autenticação.

- **Entrar:** e-mail e senha da conta já criada.
- **Criar conta:** nome, cargo, e-mail, senha e confirmação. O funcionário passa a acessar a agenda.

No casco atual a conta fica no navegador (localStorage). A API com sessão em cookie e Argon2 entra no passo de persistência.

O casco em `apps/web` demonstra esse comportamento com dados estáticos. Persistência, permissões reais e o restante dos fluxos entram nos próximos passos.
