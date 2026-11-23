# TopCar · Setor de Conteúdo & Visual

App da TopCar Veículos. Ele cuida do **cadastro e da gestão do estoque** (que antes ficava no TopCRM), das **fotos dos carros**, da
**produção de vídeos** (Stories, Reels e anúncios: roteiro, takes, estabilização, edição e narração) e da **agenda de conteúdo**.

Roda no **computador da empresa** em `http://localhost:5000`. Todo o tratamento de vídeo (FFmpeg) é feito nessa máquina.
O estoque e as fotos são espelhados num **banco na nuvem** que os outros apps consultam ([docs/BANCO_ESTOQUE.md](docs/BANCO_ESTOQUE.md)).

## Instalar na máquina da empresa (primeira vez)

1. Instale o **Python 3.12 ou mais novo** em https://www.python.org/downloads/ e marque **"Add python.exe to PATH"**.
2. Instale o **Git** em https://git-scm.com/download/win.
3. Baixe o app:
   ```
   git clone https://github.com/<conta>/<repositorio>.git C:\TopCar\Conteudo
   ```
4. Traga os dados da máquina antiga. **Sem pendrive:** lá rode `python dados.py enviar-nuvem`, e na máquina nova, já com o `.env`
   preenchido, rode `.venv\Scripts\python dados.py baixar-nuvem`. A transferência passa pelo banco do estoque e o pacote é
   apagado no fim. **Com pendrive:** `backup.bat` lá e `restaurar.bat` aqui.
5. Abra o **`iniciar.bat`**. Na primeira vez ele prepara tudo (cerca de 2 minutos) e abre o `.env` no Bloco de Notas. Preencha:
   - `GEMINI_API_KEY`: a chave da IA;
   - `ESTOQUE_DATABASE_URL`: o banco do estoque na nuvem.
6. Para abrir sozinho quando o Windows ligar, rode o **`iniciar_com_windows.bat`** uma vez.

> **Só a máquina da empresa** deve ter o `ESTOQUE_DATABASE_URL`. Se duas máquinas mandarem dados para o mesmo banco, uma sobrescreve a outra.

## Dia a dia

| arquivo | para quê |
|---|---|
| `iniciar.bat` | abre o app (e o navegador) |
| `atualizar.bat` | baixa a versão nova do GitHub (`git pull`); depois feche e abra o app |
| `backup.bat` | ZIP com todos os dados em `backups\` (faça toda semana e guarde fora da máquina) |
| `restaurar.bat` | coloca um backup nesta máquina (os dados atuais são guardados antes) |

## O que vai para o GitHub e o que não vai

- **Vai:** o código (`*.py`, `static/`, `docs/`, os `.bat`).
- **Não vai** (está no `.gitignore`):
  - o `.env`, com as senhas;
  - os dados da empresa: `projetos/` (carros, takes, fotos, vídeos), `renders/`, `referencias/`, `marca/` e os `*.json` da raiz (agenda, aprendizado, portais…).

  Esses dados mudam de máquina pelo backup.

## Banco do estoque na nuvem

- **Criar:** um projeto no [Neon](https://neon.tech) (ou [Supabase](https://supabase.com)), região São Paulo. Cole a connection string em `ESTOQUE_DATABASE_URL`. As tabelas são criadas sozinhas.
- **Como sincroniza:** a cada minuto o app envia os carros que mudaram e as fotos novas, e apaga as fotos removidas. Na aba **Estoque** fica o status e o botão "☁️ Sincronizar agora".
- **Fotos:** por padrão ficam **dentro do banco**, então basta uma credencial. Se o volume crescer, configure `FOTOS_S3_*` (Supabase Storage ou Cloudflare R2): as fotos vão para o storage com link público.

## Arquivos do código

- `app.py`: servidor (estoque, fotos, portais, processos, conteúdo, fila de vídeo e IA, rotina diária)
- `nuvem.py`: banco do estoque na nuvem (tabelas, sincronização, fotos)
- `topcrm.py`: migração do TopCRM (export JSON ou banco antigo)
- `ia.py`: Gemini (JSON, análise de vídeo, narração), com timeout e modelos reserva
- `midia.py`: FFmpeg (cópias leves, estabilização, áudio, codificação)
- `studio_prompts.py` / `prompt.py`: estratégia de copy, roteiro, revisão e edição
- `ficha_versao.py`: pesquisa dos itens de série da versão
- `dados.py`: backup e restauração
- `static/studio/`: a interface e o motor de vídeo (canvas)
