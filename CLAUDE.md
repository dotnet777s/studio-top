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
4. Dados (carros, takes, aprendizado, agenda, marca) **não estão no Git**. Eles foram deixados no banco do estoque
   (tabela temporária `app_transferencia`). Com o `.env` preenchido e **antes de abrir o app**, rode:
   `.venv\Scripts\python dados.py baixar-nuvem`
   O comando baixa, confere, restaura nesta pasta e apaga a tabela do banco.
   Alternativa com ZIP: `.venv\Scripts\python dados.py restaurar <arquivo.zip>`.
   Se `baixar-nuvem` disser que não há pacote, os dados já foram restaurados: confira se a pasta `projetos/` existe.
   O pacote não traz os brutos dos takes (`*_original.*`), os vídeos exportados (`renders/`) nem os vídeos das referências.
   Esses ficaram arquivados na máquina antiga. As versões tratadas dos takes vêm no pacote, então editar funciona.
   Só "reprocessar estabilização" de takes antigos falha, por falta do bruto.

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
