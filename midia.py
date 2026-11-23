"""Processamento de mídia com FFmpeg (binário portátil do imageio-ffmpeg)."""
import array
import io
import re
import subprocess
import wave

import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SEM_JANELA = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def rodar(args, timeout=1800, cwd=None):
    r = subprocess.run(
        [FFMPEG, "-hide_banner", "-y", *args],
        capture_output=True, timeout=timeout, creationflags=SEM_JANELA, cwd=cwd,
    )
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode("utf-8", "ignore")[-800:])
    return r


def sondar(caminho):
    """Lê duração, resolução, fps e se tem áudio (via `ffmpeg -i`)."""
    r = subprocess.run([FFMPEG, "-hide_banner", "-i", str(caminho)],
                       capture_output=True, creationflags=SEM_JANELA)
    txt = r.stderr.decode("utf-8", "ignore")
    info = {"dur": 0.0, "w": 0, "h": 0, "fps": 30.0, "tem_audio": False, "rot": 0}
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", txt)
    if m:
        info["dur"] = int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])
    m = re.search(r"Video: .*?(\d{2,5})x(\d{2,5})", txt)
    if m:
        info["w"], info["h"] = int(m[1]), int(m[2])
    m = re.search(r"([\d.]+) fps", txt)
    if m:
        info["fps"] = float(m[1])
    m = re.search(r"rotate\s*:\s*(-?\d+)|rotation of (-?[\d.]+)", txt)
    if m:
        rot = abs(int(float(m[1] or m[2])))
        if rot in (90, 270):
            info["w"], info["h"] = info["h"], info["w"]
    info["tem_audio"] = bool(re.search(r"Stream #.*Audio:", txt))
    return info


def fps_saida(info):
    """Take gravado a 50/60 fps mantém 60 (câmera lenta suave); o resto fica em 30."""
    return 60 if (info.get("fps") or 30) >= 49 else 30


def criar_proxy(origem, destino, info):
    """Cópia leve para edição: H.264 com keyframes curtos (busca rápida quadro a quadro)."""
    limite = 1920 if info["h"] >= info["w"] else 1440
    alt = min(info["h"] or limite, limite)
    alt -= alt % 2
    args = ["-i", str(origem), "-vf", f"scale=-2:{alt}", "-r", str(fps_saida(info)),
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-g", "6", "-keyint_min", "6", "-tune", "fastdecode",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
    args += ["-c:a", "aac", "-b:a", "128k"] if info["tem_audio"] else ["-an"]
    rodar([*args, str(destino)])


def criar_proxy_ia(origem, destino, tem_audio):
    """Versão minúscula para a IA assistir (sobe rápido e gasta menos cota)."""
    args = ["-i", str(origem), "-vf", "scale=-2:360", "-r", "5",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "32", "-pix_fmt", "yuv420p"]
    args += ["-c:a", "aac", "-ac", "1", "-b:a", "32k"] if tem_audio else ["-an"]
    rodar([*args, str(destino)])


def criar_miniatura(origem, destino, momento):
    rodar(["-ss", f"{momento:.2f}", "-i", str(origem), "-frames:v", "1",
           "-vf", "scale=-2:240", "-q:v", "4", str(destino)])


def extrair_audio(origem, destino):
    """Áudio do take com limpeza de voz: corta grave de ambiente, reduz ruído e normaliza o volume (-16 LUFS)."""
    rodar(["-i", str(origem), "-vn", "-ac", "1", "-ar", "48000",
           "-af", "highpass=f=80,afftdn=nf=-25,loudnorm=I=-16:TP=-1.5:LRA=11",
           "-c:a", "pcm_s16le", str(destino)])


def segmentos_fala(caminho_wav, silencio_min=0.28, folga=0.08):
    """Trechos [inicio, fim] em que há fala (para cortar pausas e sincronizar legendas)."""
    with wave.open(str(caminho_wav)) as w:
        sr, ch = w.getframerate(), w.getnchannels()
        amostras = array.array("h", w.readframes(w.getnframes()))
    if ch > 1:
        amostras = amostras[::ch]
    janela = int(sr * 0.02)
    energia = []
    for i in range(0, len(amostras) - janela, janela):
        bloco = amostras[i:i + janela]
        energia.append(sum(abs(x) for x in bloco[::4]) / max(1, len(bloco[::4])))
    if not energia:
        return []
    ordenada = sorted(energia)
    ruido = ordenada[int(len(ordenada) * 0.15)]
    pico = ordenada[int(len(ordenada) * 0.95)]
    if pico < 300:  # take sem fala
        return []
    limiar = ruido + (pico - ruido) * 0.18
    falando = [e > limiar for e in energia]
    trechos, ini, sil = [], None, 0
    for i, f in enumerate(falando + [False] * int(silencio_min / 0.02 + 1)):
        if f:
            ini = i if ini is None else ini
            sil = 0
        elif ini is not None:
            sil += 1
            if sil * 0.02 >= silencio_min:
                fim = i - sil + 1
                if (fim - ini) * 0.02 >= 0.25:
                    trechos.append([round(max(0, ini * 0.02 - folga), 2), round(min(len(energia) * 0.02, fim * 0.02 + folga), 2)])
                ini, sil = None, 0
    return trechos


def converter_audio(origem, destino):
    """Qualquer áudio (mp3, m4a...) -> WAV estéreo 48 kHz para o editor."""
    rodar(["-i", str(origem), "-vn", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", str(destino)])


# ---------- Narração: dividir um WAV único em frases pelos silêncios ----------

def dividir_por_silencio(wav_bytes, pesos):
    """Divide a narração em len(pesos) trechos. `pesos` = tamanho de cada frase (nº de letras).
    Escolhe as pausas que melhor batem com onde cada frase deveria terminar.
    Retorna lista de bytes WAV, ou None se não der para dividir com confiança."""
    partes = len(pesos)
    with wave.open(io.BytesIO(wav_bytes)) as w:
        sr, ch, sw = w.getframerate(), w.getnchannels(), w.getsampwidth()
        dados = w.readframes(w.getnframes())
    if sw != 2:
        return None
    amostras = array.array("h", dados)
    if ch > 1:
        amostras = amostras[::ch]
    janela = int(sr * 0.02)  # 20 ms
    energia = []
    for i in range(0, len(amostras) - janela, janela):
        bloco = amostras[i:i + janela]
        energia.append(max(abs(min(bloco)), abs(max(bloco))))
    if not energia:
        return None
    limiar = max(400, max(energia) * 0.04)
    silencios = []  # (inicio_idx, fim_idx)
    ini = None
    for i, e in enumerate(energia):
        if e < limiar:
            ini = i if ini is None else ini
        else:
            if ini is not None and (i - ini) * 0.02 >= 0.18:
                silencios.append((ini, i))
            ini = None
    # ignora silêncios na borda
    silencios = [s for s in silencios if s[0] > 5 and s[1] < len(energia) - 5]
    if len(silencios) < partes - 1:
        return None
    # onde a fala começa e termina (sem as bordas mudas)
    falando = [i for i, e in enumerate(energia) if e >= limiar]
    ini_fala, fim_fala = falando[0] * 0.02, falando[-1] * 0.02
    dur_fala = max(0.5, fim_fala - ini_fala)
    total_pesos = float(sum(pesos))
    esperados, acc = [], 0
    for p in pesos[:-1]:
        acc += p
        esperados.append(ini_fala + dur_fala * acc / total_pesos)
    meios = [(a + b) / 2 * 0.02 for a, b in silencios]
    tam = [(b - a) * 0.02 for a, b in silencios]

    # programação dinâmica: escolhe K pausas em ordem minimizando a distância ao esperado
    K, N = len(esperados), len(silencios)
    inf = float("inf")
    custo = [[inf] * N for _ in range(K)]
    volta = [[-1] * N for _ in range(K)]
    def c(k, j):
        return abs(meios[j] - esperados[k]) / dur_fala - 0.08 * min(tam[j], 0.8)
    for j in range(N):
        custo[0][j] = c(0, j)
    for k in range(1, K):
        melhor, idx = inf, -1
        for j in range(N):
            if j - 1 >= 0 and custo[k - 1][j - 1] < melhor:
                melhor, idx = custo[k - 1][j - 1], j - 1
            if idx >= 0:
                custo[k][j] = melhor + c(k, j)
                volta[k][j] = idx
    j = min(range(N), key=lambda x: custo[K - 1][x])
    if custo[K - 1][j] == inf:
        return None
    escolhidos = []
    for k in range(K - 1, -1, -1):
        escolhidos.append(j)
        j = volta[k][j]
    escolhidos.reverse()
    cortes_s = [meios[j] for j in escolhidos]
    # confere: cada trecho deve ter duração razoável perto do esperado
    limites = [ini_fala] + cortes_s + [fim_fala]
    for i, p in enumerate(pesos):
        real = limites[i + 1] - limites[i]
        alvo = dur_fala * p / total_pesos
        if real < alvo * 0.45 or real > alvo * 2.0:
            return None
    cortes = [0] + [int(s / 0.02) * janela for s in cortes_s] + [len(amostras)]
    saida = []
    for a, b in zip(cortes, cortes[1:]):
        trecho = aparar_silencio(amostras[a:b], limiar, sr)
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
            w.writeframes(trecho.tobytes())
        saida.append(buf.getvalue())
    return saida


def aparar_silencio(amostras, limiar, sr):
    margem = int(sr * 0.06)
    i, j = 0, len(amostras)
    while i < j and abs(amostras[i]) < limiar:
        i += 1
    while j > i and abs(amostras[j - 1]) < limiar:
        j -= 1
    return amostras[max(0, i - margem):min(len(amostras), j + margem)]


def duracao_wav(wav_bytes):
    with wave.open(io.BytesIO(wav_bytes)) as w:
        return w.getnframes() / float(w.getframerate())


# ---------- Render final ----------

class Render:
    """Recebe quadros JPEG do navegador e codifica em H.264 (alta qualidade)."""

    def __init__(self, pasta, fps, w, h):
        self.pasta = pasta
        self.video = pasta / "video.mp4"
        self.final = pasta / "final.mp4"
        self.quadros = 0
        self.proc = subprocess.Popen(
            [FFMPEG, "-hide_banner", "-y", "-f", "image2pipe", "-framerate", str(fps),
             "-c:v", "mjpeg", "-i", "-",
             "-vf", f"scale={w}:{h}:in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p",
             "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
             "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
             "-profile:v", "high", "-movflags", "+faststart", str(self.video)],
            stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
            creationflags=SEM_JANELA,
        )

    def quadro(self, jpeg):
        self.proc.stdin.write(jpeg)
        self.quadros += 1

    def finalizar(self, wav_path=None):
        self.proc.stdin.close()
        err = self.proc.stderr.read()
        self.proc.wait()
        if self.proc.returncode != 0:
            raise RuntimeError(err.decode("utf-8", "ignore")[-800:])
        if wav_path:
            rodar(["-i", str(self.video), "-i", str(wav_path), "-c:v", "copy",
                   "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest",
                   "-movflags", "+faststart", str(self.final)])
        else:
            self.video.replace(self.final)
        return self.final

    def cancelar(self):
        try:
            self.proc.kill()
        except Exception:
            pass


# ---------------------------------------------------------------- tratamento de takes (estabilização + cor)

def _quadros(caminho, w, h, largura, fps, max_seg, cinza=True, inicio=0.0):
    """Decodifica quadros pequenos direto para a memória (numpy)."""
    import numpy as np
    alt = max(2, int(round(largura * h / max(w, 1) / 2)) * 2)
    fmt, canais = ("gray", 1) if cinza else ("rgb24", 3)
    r = subprocess.run([FFMPEG, "-hide_banner", "-ss", f"{inicio:.2f}", "-t", str(max_seg), "-i", str(caminho),
                        "-vf", f"scale={largura}:{alt},format={fmt}", "-r", str(fps), "-f", "rawvideo", "-"],
                       capture_output=True, creationflags=SEM_JANELA)
    buf = np.frombuffer(r.stdout, dtype=np.uint8)
    n = buf.size // (largura * alt * canais)
    return buf[: n * largura * alt * canais].reshape(n, alt, largura, canais).astype(np.float32)


def medir_tremor(caminho, w, h, fps=30):
    """Quanto o take treme (em % da largura): separa o tremor de mão do movimento intencional da câmera.
    Mede só o centro do quadro (bordas pretas/logos não enganam) com precisão sub-pixel."""
    import numpy as np
    q = _quadros(caminho, w, h, 320, fps, 15)[..., 0]
    if len(q) < 10:
        return {"tremor": 0.0, "movimento": 0.0}
    H0, W0 = q.shape[1:]
    q = q[:, int(H0 * 0.2):int(H0 * 0.8), int(W0 * 0.2):int(W0 * 0.8)]
    hh, ww = q.shape[1:]
    jan = np.outer(np.hanning(hh), np.hanning(ww)).astype(np.float32)
    F = np.fft.fft2((q - q.mean(axis=(1, 2), keepdims=True)) * jan)

    desl = []
    for i in range(1, len(F)):
        R = F[i - 1] * np.conj(F[i])
        R /= np.abs(R) + 1e-6
        c = np.fft.ifft2(R).real
        y, x = np.unravel_index(np.argmax(c), c.shape)
        def ref(v0, v1, v2):
            d = v0 - 2 * v1 + v2
            return 0.5 * (v0 - v2) / d if abs(d) > 1e-9 else 0.0
        fx = x + ref(c[y, (x - 1) % ww], c[y, x], c[y, (x + 1) % ww])
        fy = y + ref(c[(y - 1) % hh, x], c[y, x], c[(y + 1) % hh, x])
        desl.append((fx - ww if fx > ww / 2 else fx, fy - hh if fy > hh / 2 else fy))
    d = np.array(desl, dtype=np.float32)
    caminho_cam = np.cumsum(d, axis=0)
    k = 15  # janela de 0,5 s: o que sobra fora dela é tremor
    nucleo = np.ones(k) / k
    suave = np.stack([np.convolve(np.pad(caminho_cam[:, j], (k // 2, k // 2), mode="edge"), nucleo, mode="valid")[: len(caminho_cam)]
                      for j in range(2)], axis=1)
    tremor = float(np.sqrt(((caminho_cam - suave) ** 2).sum(axis=1).mean())) / W0 * 100
    movimento = float(np.abs(suave[-1] - suave[0]).sum()) / W0 * 100
    return {"tremor": round(tremor, 3), "movimento": round(movimento, 1)}


def medir_cor(caminho, w, h, dur):
    """Estatísticas de exposição e cor (amostra quadros ao longo do take)."""
    import numpy as np
    q = _quadros(caminho, w, h, 96, max(0.5, 8 / max(dur, 1)), max(dur, 1), cinza=False)
    if not len(q):
        return None
    px = q.reshape(-1, 3) / 255.0
    luma = px @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    meio = (luma > 0.15) & (luma < 0.85)
    medias = px[meio].mean(axis=0) if meio.sum() > 100 else px.mean(axis=0)
    return {"p1": float(np.percentile(luma, 1)), "p99": float(np.percentile(luma, 99)), "media": float(luma.mean()),
            "rgb": [float(x) for x in medias], "sat": float((px.max(axis=1) - px.min(axis=1)).mean())}


def filtro_cor(st):
    """Correção automática suave: níveis, exposição, balanço de branco, saturação, redução de ruído e nitidez."""
    if not st:
        return "hqdn3d=1.2:1.2:4:4,cas=0.35"
    lo, hi, med = st["p1"], st["p99"], st["media"]
    partes = []
    # níveis: puxa o preto e o branco para perto do limite, só pela metade (não estoura)
    lo2, hi2 = lo * 0.45, hi + (1 - hi) * 0.6
    if hi - lo > 0.2 and (lo > 0.03 or hi < 0.95):
        partes.append(f"curves=master='0/0 {lo:.3f}/{lo2:.3f} {hi:.3f}/{hi2:.3f} 1/1'")
    # exposição: take escuro ganha luz, estourado perde (gamma suave)
    alvo = 0.42 if med < 0.36 else 0.6  # só corrige take escuro demais ou estourado
    if 0.05 < med < 0.36 or med > 0.7:
        import math
        g = math.log(med) / math.log(alvo)
        g = max(0.8, min(1.35, 1 + (g - 1) * 0.55))
        partes.append(f"eq=gamma={g:.3f}")  # gamma > 1 clareia
    # balanço de branco (mundo cinza, 55% de força, limitado)
    r, gv, b = st["rgb"]
    cinza = (r + gv + b) / 3
    ganhos = [max(0.88, min(1.12, 1 + (cinza / max(c, 1e-3) - 1) * 0.55)) for c in (r, gv, b)]
    if max(abs(x - 1) for x in ganhos) > 0.015:
        partes.append(f"colorchannelmixer=rr={ganhos[0]:.3f}:gg={ganhos[1]:.3f}:bb={ganhos[2]:.3f}")
    sat = 1.12 if st["sat"] < 0.18 else 1.05
    partes.append(f"eq=saturation={sat:.2f}:contrast=1.04")
    partes.append("hqdn3d=1.2:1.2:4:4,cas=0.4")
    return ",".join(partes)


def tratar_take(origem, proxy, destino, info, estabilizar="auto", tremor=0.0, cor=None, pasta_trab=None):
    """Gera a versão tratada do take: estabilizada (vidstab, 2 passadas) + cor corrigida + nitidez.
    estabilizar: 'auto' (só se tremer), 'forte' (sempre, mais suave) ou 'off'."""
    from pathlib import Path
    limite = 1920 if info["h"] >= info["w"] else 1440
    alt = min(info["h"] or limite, limite)
    alt -= alt % 2
    usar_estab = estabilizar == "forte" or (estabilizar == "auto" and tremor >= LIMIAR_TREMOR)
    fps = fps_saida(info)
    filtros = [f"fps={fps}", f"scale=-2:{alt}"]  # mesmos quadros do proxy (a passada 1 mediu o proxy a 30 fps)
    trab = Path(pasta_trab or Path(destino).parent)
    trf = f"estab_{Path(destino).stem}.trf"
    if usar_estab:
        # passada 1: mede o movimento no proxy (mesma geometria e mesmos quadros da passada 2)
        # (mesma entrada e mesma cadeia da passada 2: quadros idênticos, senão a correção sai desalinhada)
        rodar(["-i", str(Path(origem).resolve()), "-vf", ",".join(filtros) + f",vidstabdetect=shakiness=8:accuracy=15:stepsize=6:result={trf}",
               "-an", "-f", "null", "-"], cwd=str(trab))
        # zoom fixo pequeno + correção limitada ao que o zoom esconde: as bordas nunca aparecem e o movimento
        # intencional (slider, travelling) continua; o optzoom automático "congelava" a câmera.
        forte = estabilizar == "forte" or tremor >= 0.6
        suav, zoom = (40, 13) if tremor >= 1.5 else (30, 8) if forte else (24, 6)  # muito tremido: mais margem de correção
        larg = alt * info["w"] / max(info["h"], 1)
        maxshift = int(larg * zoom / 100 / 2)
        filtros.append(f"vidstabtransform=input={trf}:smoothing={suav}:optzoom=0:zoom={zoom}:maxshift={maxshift}"
                       f":maxangle=0.04:interpol=bicubic:crop=keep")
    filtros.append(filtro_cor(cor) if cor is not False else "cas=0.3")
    args = ["-i", str(Path(origem).resolve()), "-vf", ",".join(filtros), "-r", str(fps),
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-g", "6", "-keyint_min", "6", "-tune", "fastdecode",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
    args += ["-c:a", "aac", "-b:a", "128k"] if info["tem_audio"] else ["-an"]
    try:
        rodar([*args, str(Path(destino).resolve())], cwd=str(trab))
    finally:
        (trab / trf).unlink(missing_ok=True)
    return usar_estab


LIMIAR_TREMOR = 0.15  # acima disso o take é candidato a estabilização (e só fica estabilizado se medir melhor)


def medir_tranco(caminho, w, h, fps=30, max_seg=8):
    """Tranco médio quadro a quadro (px numa imagem de 320 de largura): variação brusca do movimento = o que o olho vê como tremor.
    Câmera em gimbal/slider fica perto de 0,05; mão tremendo passa de 0,3."""
    import numpy as np
    q = _quadros(caminho, w, h, 320, fps, max_seg)[..., 0]
    if len(q) < 6:
        return 0.0
    H0, W0 = q.shape[1:]
    q = q[:, int(H0 * 0.2):int(H0 * 0.8), int(W0 * 0.2):int(W0 * 0.8)]
    hh, ww = q.shape[1:]
    jan = np.outer(np.hanning(hh), np.hanning(ww)).astype(np.float32)
    F = np.fft.fft2((q - q.mean(axis=(1, 2), keepdims=True)) * jan)
    d = []
    for i in range(1, len(F)):
        R = F[i - 1] * np.conj(F[i]); R /= np.abs(R) + 1e-6
        c = np.fft.ifft2(R).real
        y, x = np.unravel_index(np.argmax(c), c.shape)

        def ref(a, b, e):
            den = a - 2 * b + e
            return 0.5 * (a - e) / den if abs(den) > 1e-9 else 0.0
        fx = x + ref(c[y, (x - 1) % ww], c[y, x], c[y, (x + 1) % ww]); fy = y + ref(c[(y - 1) % hh, x], c[y, x], c[(y + 1) % hh, x])
        d.append((fx - ww if fx > ww / 2 else fx, fy - hh if fy > hh / 2 else fy))
    a = np.diff(np.array(d, dtype=np.float32), axis=0)
    return round(float(np.sqrt((a ** 2).sum(axis=1)).mean()), 3)
