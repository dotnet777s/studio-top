# TopCar · Setor de Conteúdo: instruções para o Claude Code

App Flask + estúdio de vídeo em canvas. Roda **nesta máquina** em http://localhost:5000. Todo o processamento de vídeo
(FFmpeg via imageio-ffmpeg, com vidstab) acontece aqui. Fale com o usuário em **português do Brasil**.

## Preparar esta máquina (primeira vez)
1. Python 3.12+ no PATH (`python --version`) e Git.
2. Ambiente: `python -m venv .venv` e depois `.venv\Scripts\python -m pip install -r requirements.txt`
   (o `iniciar.bat` faz o mesmo e grava `.venv\requirements.ok`).
3. `.env` (nunca commitar): copie de `.env.example`. Peça ao usuário:
   - `GEMINI_API_KEY`
   - `ESTOQUE_DATABASE_URL` (Neon, região sa-east-1)

   Nunca imprima nem registre os valores.
4. Dados (carros, takes, vídeos, aprendizado, agenda) **não estão no Git**. Eles vêm de um backup:
   `.venv\Scripts\python dados.py restaurar <arquivo.zip>`. O ZIP é gerado na máquina antiga com `backup.bat`.
   Sem o backup o app abre vazio. **Não ligue o `ESTOQUE_DATABASE_URL` antes de restaurar:** a nuvem já tem o estoque,
   e o app só apaga da nuvem com trava de segurança, mas o certo é restaurar primeiro.

## Rodar / atualizar
- Rodar: `.venv\Scripts\python app.py` (servidor waitress em 127.0.0.1:5000). Para o usuário, há o `iniciar.bat`.
- Atualizar: `git pull --ff-only`, reinstalar requirements se mudaram, reiniciar o app.
- Abrir com o Windows: `iniciar_com_windows.bat`.
- Backup semanal: `backup.bat` (gera `backups\TopCar_dados_*.zip`).

## Regras
- Só **uma** máquina com `ESTOQUE_DATABASE_URL` (esta). O app espelha o estoque e as fotos no banco a cada minuto (`nuvem.py`).
  Os outros apps só leem (ver `docs/BANCO_ESTOQUE.md`). O schema público do banco é deste app. O schema `neon_auth` é do Neon: não mexer.
- Dados da empresa nunca vão para o Git (`projetos/`, `renders/`, `referencias/`, `marca/`, `*.json` da raiz, `.env`).
- O usuário só corrige **falas e textos** dos vídeos. Efeitos, transições e tempo são decididos pela IA.
- Regras da loja (marca/marca.json):
  - nunca preço no gancho nem na 1ª cena;
  - CTA sempre para o WhatsApp 81 96000-2209;
  - nunca prometer aprovação de crédito.

## Verificar que está tudo certo
- `GET http://127.0.0.1:5000/api/nuvem?remoto=1`: deve ter `configurado: true` e `remoto.veiculos` > 0, sem `erro`.
- Aba **Estoque**: barra "Banco do estoque na nuvem" verde.
