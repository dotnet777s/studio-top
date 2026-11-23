"""Acesso ao Google Gemini (plano gratuito): texto/JSON, análise de vídeo e narração (TTS)."""
import base64
import json
import os
import time

from google import genai
from google.genai import errors, types

MODELOS = [
    m.strip()
    for m in os.environ.get(
        "GEMINI_MODELOS", "gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash-lite"
    ).split(",")
    if m.strip()
]
MODELOS_TTS = ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"]
TENTATIVAS_POR_MODELO = 3

_client = None
_client_tts = None


class ErroIA(Exception):
    def __init__(self, msg, status=502):
        super().__init__(msg)
        self.status = status


_trava_cliente = __import__("threading").Lock()


def client():
    """Cliente único e compartilhado (com trava: dois workers criando ao mesmo tempo fechavam um ao outro)."""
    global _client
    with _trava_cliente:
        if _client is None:
            # tempo máximo por chamada: sem isso, uma chamada presa travava o app para sempre
            _client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY") or None,
                                   http_options=types.HttpOptions(timeout=150_000))
    return _client


def client_tts():
    global _client_tts
    with _trava_cliente:
        if _client_tts is None:
            _client_tts = genai.Client(
                api_key=os.environ.get("GEMINI_API_KEY") or None,
                http_options={"api_version": "v1beta", "timeout": 150_000},
            )
    return _client_tts


def _com_tentativas(modelos, chamada):
    """Roda `chamada(modelo)` com novas tentativas e modelos reserva."""
    ultimo = "Erro desconhecido."
    for modelo in modelos:
        for n in range(TENTATIVAS_POR_MODELO):
            if n:
                time.sleep(3 * n)
            try:
                return modelo, chamada(modelo)
            except errors.APIError as e:
                print(f"[{modelo}] tentativa {n + 1}: erro {e.code} - {str(e.message)[:140]}")
                if e.code in (400, 401, 403) and "API key" in str(e.message):
                    raise ErroIA("Chave do Gemini inválida. Confira o GEMINI_API_KEY no .env.", 401)
                if e.code == 429:
                    ultimo = "Limite gratuito do Gemini atingido por agora. Espere 1 minuto e tente de novo."
                    break  # cota do modelo acabou: vai direto para o próximo
                if e.code in (404,):
                    ultimo = f"Modelo {modelo} indisponível."
                    break
                if e.code in (500, 503, 504):
                    ultimo = "Gemini sobrecarregado no momento. Tente de novo em instantes."
                    continue
                raise ErroIA(f"Erro do Gemini ({e.code}): {e.message}")
            except json.JSONDecodeError:
                ultimo = "A IA devolveu um formato inesperado."
                continue
            except ErroIA:
                raise
            except Exception as e:  # rede, timeout
                print(f"[{modelo}] falha: {e}")
                ultimo = "Sem conexão com o Gemini. Verifique a internet."
                continue
    raise ErroIA(ultimo, 503)


def gerar_json(sistema, conteudo, schema, temperatura=0.9):
    """Gera uma resposta JSON validada pelo schema. `conteudo` pode ser texto ou lista (vídeo + texto)."""
    config = types.GenerateContentConfig(
        system_instruction=sistema,
        response_mime_type="application/json",
        response_json_schema=schema,
        temperature=temperatura,
    )

    def chamada(modelo):
        r = client().models.generate_content(model=modelo, contents=conteudo, config=config)
        return json.loads(r.text or "")

    modelo, dados = _com_tentativas(MODELOS, chamada)
    print(f"[{modelo}] JSON gerado")
    dados["_modelo"] = modelo
    return dados


def enviar_video(caminho):
    """Sobe um vídeo para a Files API do Gemini e espera ficar pronto."""
    f = client().files.upload(file=caminho, config={"mime_type": "video/mp4"})
    for _ in range(90):
        estado = getattr(f.state, "name", str(f.state))
        if estado == "ACTIVE":
            return f
        if estado == "FAILED":
            raise ErroIA("O Gemini não conseguiu processar este vídeo.")
        time.sleep(2)
        f = client().files.get(name=f.name)
    raise ErroIA("O Gemini demorou demais para processar o vídeo.")


def parte_youtube(url):
    """Vídeo público do YouTube como entrada (o Gemini assiste direto, sem baixar)."""
    return types.Part(file_data=types.FileData(file_uri=url, mime_type="video/*"))


def apagar_arquivo(f):
    try:
        client().files.delete(name=f.name)
    except Exception:
        pass


def narrar(texto, voz="Puck", estilo=""):
    """Texto -> WAV (24 kHz, mono, 16 bits). Retorna os bytes do WAV."""
    conteudo = {"type": "text", "text": texto}
    if estilo:
        conteudo["annotations"] = [{"type": "speech_metadata", "style": estilo}]

    def chamada(modelo):
        it = client_tts().interactions.create(
            model=modelo,
            input=[{"type": "user_input", "content": [conteudo]}],
            response_format={"type": "audio"},
            generation_config={"speech_config": [{"voice": voz}]},
        )
        return base64.b64decode(it.output_audio.data)

    modelo, wav = _com_tentativas(MODELOS_TTS, chamada)
    print(f"[{modelo}] narração gerada ({len(wav)} bytes)")
    return wav
