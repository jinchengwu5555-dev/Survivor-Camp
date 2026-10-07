"""合成游戏音效和背景音乐（8-bit 芯片音乐风格），输出到 assets/resources/audio/。

全部用代码合成，不需要任何外部素材，也就没有版权问题。
想换成正式音效时，同名 .wav / .mp3 放进 assets/resources/audio/ 覆盖即可（文件名见下面 SFX / MUSIC）。

用法：python tools/make_audio.py
"""

import wave
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'resources' / 'audio'
SFX_RATE = 22050
MUSIC_RATE = 11025
rng = np.random.default_rng(7)


# ---------- 基本波形 ----------

def t_of(sec, rate):
    return np.arange(int(sec * rate)) / rate


def freq_of(note):
    """'A4' / 'C#5' → 频率"""
    names = {'C': -9, 'D': -7, 'E': -5, 'F': -4, 'G': -2, 'A': 0, 'B': 2}
    n = names[note[0]]
    rest = note[1:]
    if rest.startswith('#'):
        n += 1
        rest = rest[1:]
    elif rest.startswith('b'):
        n -= 1
        rest = rest[1:]
    return 440.0 * 2 ** ((n + (int(rest) - 4) * 12) / 12)


def phase(freq, sec, rate):
    """频率可以是常数或逐点数组（滑音）"""
    f = np.broadcast_to(np.asarray(freq, dtype=float), (int(sec * rate),))
    return np.cumsum(f) / rate


def square(freq, sec, rate=SFX_RATE, duty=0.5):
    return np.where((phase(freq, sec, rate) % 1) < duty, 1.0, -1.0)


def triangle(freq, sec, rate=SFX_RATE):
    p = phase(freq, sec, rate) % 1
    return 4 * np.abs(p - 0.5) - 1


def sine(freq, sec, rate=SFX_RATE):
    return np.sin(2 * np.pi * phase(freq, sec, rate))


def noise(sec, rate=SFX_RATE, hold=1):
    """hold > 1 让噪音变“粗”（像老游戏机的噪音通道）"""
    n = int(sec * rate)
    base = rng.uniform(-1, 1, n // hold + 1)
    return np.repeat(base, hold)[:n]


def env(n, attack=0.005, decay=None, rate=SFX_RATE, curve=3.0):
    """起音 + 指数衰减包络"""
    t = np.arange(n) / rate
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    total = n / rate
    d = np.exp(-curve * t / (decay or total))
    return a * d


def lowpass(x, alpha):
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += alpha * (v - acc)
        y[i] = acc
    return y


def seq(parts, rate=SFX_RATE):
    return np.concatenate([p for p in parts]) if parts else np.zeros(0)


def mix_at(buf, sound, start):
    end = min(len(buf), start + len(sound))
    buf[start:end] += sound[: end - start]


def note(n, sec, wave_fn=square, vol=1.0, rate=SFX_RATE, **kw):
    x = wave_fn(freq_of(n), sec, rate, **kw) if wave_fn is square else wave_fn(freq_of(n), sec, rate)
    return x * env(len(x), rate=rate) * vol


def save(name, x, rate=SFX_RATE, peak=0.8):
    OUT.mkdir(parents=True, exist_ok=True)
    x = np.asarray(x, dtype=float)
    m = np.max(np.abs(x)) or 1
    x = x / m * peak
    # 头尾 3 毫秒淡入淡出，避免爆音
    fade = int(0.003 * rate)
    if fade and len(x) > 2 * fade:
        x[:fade] *= np.linspace(0, 1, fade)
        x[-fade:] *= np.linspace(1, 0, fade)
    data = (x * 32767).astype('<i2').tobytes()
    with wave.open(str(OUT / f'{name}.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(data)
    print(f'{name}.wav  {len(x) / rate:.2f}s  {len(data) // 1024}KB')


# ---------- 音效 ----------

def sfx_click():
    x = square(1200, 0.035, duty=0.25)
    return x * env(len(x), decay=0.03)


def sfx_confirm():
    return seq([note('C6', 0.06, vol=0.7), note('G6', 0.12, vol=0.7)])


def sfx_coin():
    return seq([note('B5', 0.05, vol=0.7), note('E6', 0.22, vol=0.7)])


def sfx_error():
    f = np.linspace(220, 150, int(0.18 * SFX_RATE))
    x = square(f, 0.18, duty=0.5)
    return x * env(len(x), decay=0.25) * 0.6


def sfx_build():
    out = np.zeros(int(0.7 * SFX_RATE))
    for i in range(3):
        hit = lowpass(noise(0.06, hold=2), 0.5) * env(int(0.06 * SFX_RATE), decay=0.03)
        mix_at(out, hit, int(i * 0.12 * SFX_RATE))
    chime = seq([note('E6', 0.08, triangle), note('A6', 0.25, triangle)])
    mix_at(out, chime * 0.9, int(0.38 * SFX_RATE))
    return out


def sfx_hit():
    n = noise(0.07, hold=3)
    f = np.linspace(300, 80, len(n))
    body = square(f, 0.07, duty=0.5) * 0.5
    return (lowpass(n, 0.35) + body) * env(len(n), decay=0.05)


def sfx_crit():
    out = np.zeros(int(0.16 * SFX_RATE))
    mix_at(out, sfx_hit() * 1.2, 0)
    ping = sine(1760, 0.12) * env(int(0.12 * SFX_RATE), decay=0.08)
    mix_at(out, ping * 0.6, int(0.02 * SFX_RATE))
    return out


def sfx_zombie_die():
    sec = 0.4
    f = np.linspace(140, 55, int(sec * SFX_RATE))
    wob = 1 + 0.15 * np.sin(2 * np.pi * 18 * t_of(sec, SFX_RATE))
    x = square(f * wob, sec, duty=0.3) * 0.6 + lowpass(noise(sec, hold=4), 0.2) * 0.5
    return x * env(len(x), attack=0.02, decay=0.35)


def sfx_ally_down():
    return seq([note('E5', 0.14, triangle), note('C5', 0.14, triangle), note('A4', 0.4, triangle)])


def sfx_alarm():
    out = []
    for _ in range(2):
        out.append(square(freq_of('A5'), 0.18, duty=0.5) * 0.5)
        out.append(square(freq_of('E5'), 0.18, duty=0.5) * 0.5)
    x = seq(out)
    return x * env(len(x), decay=1.2, curve=1.0)


def sfx_win():
    notes = ['C5', 'E5', 'G5', 'C6']
    parts = [note(n, 0.1, duty=0.5, vol=0.6) for n in notes[:-1]]
    parts.append(note('C6', 0.5, duty=0.5, vol=0.6))
    lead = seq(parts)
    bass = triangle(freq_of('C4'), len(lead) / SFX_RATE) * env(len(lead), decay=0.8) * 0.5
    return lead + bass


def sfx_lose():
    parts = [note(n, 0.2, triangle) for n in ['G4', 'Eb4', 'C4']]
    parts.append(note('B3', 0.6, triangle))
    return seq(parts)


def sfx_heal():
    sec = 0.3
    f = np.linspace(600, 1400, int(sec * SFX_RATE))
    x = sine(f, sec) * (0.6 + 0.4 * np.sin(2 * np.pi * 30 * t_of(sec, SFX_RATE)))
    return x * env(len(x), attack=0.02, decay=0.3)


def sfx_skill():
    sec = 0.25
    n = noise(sec)
    alphas = np.linspace(0.05, 0.6, len(n))
    y = np.empty_like(n)
    acc = 0.0
    for i, v in enumerate(n):
        acc += alphas[i] * (v - acc)
        y[i] = acc
    return y * env(len(y), attack=0.06, decay=0.2)


def sfx_repair():
    out = np.zeros(int(0.35 * SFX_RATE))
    for i in range(2):
        hit = lowpass(noise(0.05, hold=2), 0.6) * env(int(0.05 * SFX_RATE), decay=0.025)
        mix_at(out, hit, int(i * 0.14 * SFX_RATE))
    return out


def sfx_page():
    sec = 0.08
    f = np.linspace(500, 900, int(sec * SFX_RATE))
    x = triangle(f, sec)
    return x * env(len(x), decay=0.06) * 0.6


SFX = {
    'sfx_click': sfx_click,
    'sfx_confirm': sfx_confirm,
    'sfx_coin': sfx_coin,
    'sfx_error': sfx_error,
    'sfx_build': sfx_build,
    'sfx_hit': sfx_hit,
    'sfx_crit': sfx_crit,
    'sfx_zombie_die': sfx_zombie_die,
    'sfx_ally_down': sfx_ally_down,
    'sfx_alarm': sfx_alarm,
    'sfx_win': sfx_win,
    'sfx_lose': sfx_lose,
    'sfx_heal': sfx_heal,
    'sfx_skill': sfx_skill,
    'sfx_repair': sfx_repair,
    'sfx_page': sfx_page,
}


# ---------- 背景音乐（无缝循环） ----------

def render_track(bpm, bars, melody, bass, chords, drums=None, rate=MUSIC_RATE, lead_vol=0.22, bass_vol=0.3, pad_vol=0.1):
    """melody / bass：[(音名或 None, 拍数), ...]；chords：每小节一个和弦（音名列表）；drums：每拍 'k' / 's' / 'h' / '.' 的字符串"""
    beat = 60 / bpm
    total = int(bars * 4 * beat * rate)
    out = np.zeros(total)

    def place(line, wave_fn, vol, decay_scale):
        pos = 0.0
        for n, beats in line:
            sec = beats * beat
            if n:
                x = wave_fn(freq_of(n), sec * 0.95, rate) if wave_fn is not square else square(freq_of(n), sec * 0.95, rate, duty=0.25)
                x = x * env(len(x), attack=0.01, decay=sec * decay_scale, rate=rate)
                mix_at(out, x * vol, int(pos * rate))
            pos += sec

    place(melody, square, lead_vol, 1.6)
    place(bass, triangle, bass_vol, 3.0)
    for i, chord in enumerate(chords):
        sec = 4 * beat
        pad = sum(sine(freq_of(n), sec, rate) for n in chord) / len(chord)
        pad = pad * np.clip(np.minimum(t_of(sec, rate) / 0.3, (sec - t_of(sec, rate)) / 0.3), 0, 1)
        mix_at(out, pad * pad_vol, int(i * sec * rate))
    if drums:
        step = beat / (len(drums) / (bars * 4)) if len(drums) > bars * 4 else beat
        for i, d in enumerate(drums):
            start = int(i * step * rate)
            if d == 'k':
                sec = 0.12
                f = np.linspace(150, 45, int(sec * rate))
                mix_at(out, sine(f, sec, rate) * env(int(sec * rate), decay=0.1, rate=rate) * 0.5, start)
            elif d == 's':
                sec = 0.1
                mix_at(out, noise(sec, rate, hold=2) * env(int(sec * rate), decay=0.07, rate=rate) * 0.18, start)
            elif d == 'h':
                sec = 0.03
                mix_at(out, noise(sec, rate) * env(int(sec * rate), decay=0.02, rate=rate) * 0.06, start)
    return out


def music_day():
    """白天的营地：慢、有点寂寞但温暖（A 小调五声音阶）"""
    melody = [
        ('A4', 1), ('C5', 1), ('E5', 2),
        ('D5', 1), ('C5', 1), ('A4', 2),
        ('G4', 1), ('A4', 1), ('C5', 1), ('D5', 1),
        ('E5', 3), (None, 1),
        ('G5', 1), ('E5', 1), ('D5', 2),
        ('C5', 1), ('D5', 1), ('E5', 2),
        ('D5', 1), ('C5', 1), ('G4', 1), ('C5', 1),
        ('A4', 3), (None, 1),
    ]
    bass = [(n, 2) for n in ['A2', 'E3', 'F2', 'C3', 'C3', 'G3', 'E2', 'B2', 'C3', 'G3', 'A2', 'E3', 'G2', 'D3', 'A2', 'E3']]
    chords = [['A3', 'C4', 'E4'], ['F3', 'A3', 'C4'], ['C4', 'E4', 'G4'], ['E3', 'G3', 'B3'],
              ['C4', 'E4', 'G4'], ['A3', 'C4', 'E4'], ['G3', 'B3', 'D4'], ['A3', 'C4', 'E4']]
    return render_track(84, 8, melody, bass, chords)


def music_night():
    """守夜：快、紧张（D 小调，鼓点 + 跑动的低音）"""
    bass_notes = ['D2', 'D2', 'D3', 'D2', 'F2', 'F2', 'F3', 'F2', 'C2', 'C2', 'C3', 'C2', 'A1', 'A1', 'A2', 'C#2'] * 2
    bass = [(n, 0.5) for n in bass_notes]
    melody = [
        ('D5', 1), ('F5', 0.5), ('E5', 0.5), ('D5', 1), ('A4', 1),
        ('C5', 1), ('D5', 0.5), ('C5', 0.5), ('A4', 2),
        ('D5', 1), ('F5', 0.5), ('G5', 0.5), ('A5', 1), ('G5', 1),
        ('F5', 0.5), ('E5', 0.5), ('C#5', 1), ('A4', 2),
    ]
    chords = [['D3', 'F3', 'A3'], ['F3', 'A3', 'C4'], ['C3', 'E3', 'G3'], ['A2', 'C#3', 'E3']]
    drums = 'khshkhsh' * 8  # 每拍两步：底鼓 / 军鼓 / 踩镲
    return render_track(132, 4, melody, bass, chords, drums=drums, lead_vol=0.18, bass_vol=0.35, pad_vol=0.06)


MUSIC = {
    'music_day': music_day,
    'music_night': music_night,
}


if __name__ == '__main__':
    for name, fn in SFX.items():
        save(name, fn(), SFX_RATE)
    for name, fn in MUSIC.items():
        save(name, fn(), MUSIC_RATE, peak=0.6)
