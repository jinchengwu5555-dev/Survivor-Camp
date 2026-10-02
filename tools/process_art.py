#!/usr/bin/env python3
"""
美术图片批处理：把 AI 生成的原图变成游戏能直接用的透明 PNG。

用法：
    pip install pillow numpy          # 第一次需要
    python tools/process_art.py       # 处理 art-raw/ 下的所有图片

原图放在 art-raw/<分类>/<文件名>.<任意格式>，比如：
    art-raw/units/unit_sophie.jfif
    art-raw/portraits/portrait_ethan.webp
    art-raw/buildings/building_kitchen.png
处理后输出到 assets/resources/sprites/<分类>/<文件名>.png。

每张图会做这些事：
  1. 去背景：从图片四周开始，把连在一起的“白色 / 浅灰色”区域抠掉。
     AI 画进图里的假棋盘格（白 + 浅灰）也会一起去掉。角色有深色描边，里面的白色（眼白、白衣服）不会被误删。
     原图本来就是透明的，就保留原来的透明度。
  2. 去白边：紧挨着背景的浅色半透明像素变透明，消除抠图后的白色毛边。
  3. 给透明像素填上旁边的颜色：避免缩小显示时边缘出现白线。
  4. 裁掉多余的透明边，四周只留一点空白。
  5. 像素风（默认）：缩到这一类图的像素网格大小（比如角色 64×64），颜色压到几十种，
     半透明的边要么全透明要么不透明——AI 画的“假像素”会变成干净的真像素。
     游戏里按最近邻放大显示，像素边缘是锐利的。
     加 --smooth 就按以前的方式处理（最长边 512，平滑缩放），适合非像素风的图。

每一类图的像素网格（PIXEL_GRID）：
  units 64×64、portraits 64×64、buildings 96×96、icons 32×32、
  bg 按原图比例把宽度缩到 360、sites 宽 240、ui 不缩
"""

from __future__ import annotations

import argparse
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / 'art-raw'
OUT_DIR = ROOT / 'assets' / 'resources' / 'sprites'
EXTENSIONS = {'.png', '.jpg', '.jpeg', '.jfif', '.webp', '.bmp'}

# 背景判定：足够亮、颜色足够灰（饱和度低）
BG_MIN_BRIGHTNESS = 175
BG_MAX_SATURATION = 28
MAX_SIZE = 512
PADDING_RATIO = 0.04

# 像素风：每一类图缩到多大的像素网格（宽, 高），以及最多多少种颜色
PIXEL_GRID: dict[str, tuple[int, int]] = {
    'units': (64, 64),
    'portraits': (64, 64),
    'buildings': (96, 96),
    'icons': (32, 32),
}
PIXEL_BG_WIDTH = {'bg': 360, 'sites': 240}
PIXEL_COLORS = {'units': 32, 'portraits': 32, 'buildings': 40, 'icons': 24, 'bg': 48, 'sites': 48}


def is_background_like(rgb: np.ndarray) -> np.ndarray:
    brightness = rgb.mean(axis=2)
    saturation = rgb.max(axis=2) - rgb.min(axis=2)
    return (brightness >= BG_MIN_BRIGHTNESS) & (saturation <= BG_MAX_SATURATION)


def flood_from_edges(candidate: np.ndarray) -> np.ndarray:
    """从四条边出发，找出和边缘连通的背景像素"""
    h, w = candidate.shape
    background = np.zeros((h, w), dtype=bool)
    queue: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if candidate[y, x] and not background[y, x]:
                background[y, x] = True
                queue.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if candidate[y, x] and not background[y, x]:
                background[y, x] = True
                queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and candidate[ny, nx] and not background[ny, nx]:
                background[ny, nx] = True
                queue.append((ny, nx))
    return background


def dilate(mask: np.ndarray) -> np.ndarray:
    out = mask.copy()
    out[1:, :] |= mask[:-1, :]
    out[:-1, :] |= mask[1:, :]
    out[:, 1:] |= mask[:, :-1]
    out[:, :-1] |= mask[:, 1:]
    return out


def remove_background(img: Image.Image) -> Image.Image:
    rgba = np.array(img.convert('RGBA')).astype(np.int32)
    rgb = rgba[:, :, :3]
    alpha = rgba[:, :, 3]

    # 四周已经大部分透明：原图本来就抠好了，只做去白边
    border_alpha = np.concatenate([alpha[0, :], alpha[-1, :], alpha[:, 0], alpha[:, -1]])
    already_transparent = (border_alpha < 16).mean() > 0.6
    if already_transparent:
        background = alpha < 16
    else:
        background = flood_from_edges(is_background_like(rgb))

    # 去白边：紧挨背景的两圈里，偏亮偏灰的像素按亮度变成半透明
    ring = dilate(dilate(background)) & ~background
    bright = rgb.mean(axis=2)
    grey = (rgb.max(axis=2) - rgb.min(axis=2)) <= BG_MAX_SATURATION + 20
    fringe = ring & grey & (bright > 120)
    fade = np.clip((255 - bright) / (255 - 120), 0, 1)

    new_alpha = alpha.copy()
    new_alpha[background] = 0
    new_alpha[fringe] = (alpha[fringe] * fade[fringe]).astype(np.int32)
    rgba[:, :, 3] = new_alpha
    return Image.fromarray(rgba.astype(np.uint8), 'RGBA')


def bleed_colors(img: Image.Image, passes: int = 8) -> Image.Image:
    """透明像素的颜色填成旁边不透明像素的颜色，缩小显示时边缘就不会发白"""
    rgba = np.array(img).astype(np.int32)
    solid = rgba[:, :, 3] > 0
    for _ in range(passes):
        grown = dilate(solid) & ~solid
        if not grown.any():
            break
        acc = np.zeros(rgba.shape[:2] + (3,), dtype=np.int64)
        cnt = np.zeros(rgba.shape[:2], dtype=np.int64)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            shifted_solid = np.roll(solid, (dy, dx), axis=(0, 1))
            shifted_rgb = np.roll(rgba[:, :, :3], (dy, dx), axis=(0, 1))
            use = grown & shifted_solid
            acc[use] += shifted_rgb[use]
            cnt[use] += 1
        fill = grown & (cnt > 0)
        rgba[fill, :3] = (acc[fill] // cnt[fill, None]).astype(np.int32)
        solid = solid | fill
    return Image.fromarray(rgba.astype(np.uint8), 'RGBA')


def trim_and_pad(img: Image.Image) -> Image.Image:
    alpha = np.array(img)[:, :, 3]
    ys, xs = np.nonzero(alpha > 10)
    if len(xs) == 0:
        return img
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    cropped = img.crop(box)
    pad = int(max(cropped.size) * PADDING_RATIO)
    canvas = Image.new('RGBA', (cropped.width + pad * 2, cropped.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(cropped, (pad, pad))
    return canvas


def fit_size(img: Image.Image) -> Image.Image:
    scale = MAX_SIZE / max(img.size)
    if scale >= 1:
        return img
    return img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)


def quantize(img: Image.Image, colors: int) -> Image.Image:
    """颜色压到 colors 种（只算不透明的像素），透明度二值化：像素画没有半透明的边"""
    rgba = np.array(img.convert('RGBA'))
    alpha = rgba[:, :, 3]
    solid = alpha >= 128
    rgb = Image.fromarray(rgba[:, :, :3], 'RGB')
    pal = rgb.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    out = np.dstack([np.array(pal), np.where(solid, 255, 0).astype(np.uint8)])
    return Image.fromarray(out, 'RGBA')


def pixelate(img: Image.Image, category: str) -> Image.Image:
    """把 AI 画的“假像素”缩成真正的像素网格：按块取平均（BOX），再压颜色"""
    if category in PIXEL_BG_WIDTH:
        w = PIXEL_BG_WIDTH[category]
        h = max(1, round(img.height * w / img.width))
        small = img.convert('RGBA').resize((w, h), Image.BOX)
    else:
        gw, gh = PIXEL_GRID.get(category, (64, 64))
        scale = min(gw / img.width, gh / img.height)
        size = (max(1, round(img.width * scale)), max(1, round(img.height * scale)))
        small = img.resize(size, Image.BOX)
        # 放到 gw×gh 的画布正中（角色脚底对齐画布底部，站在地上不会飘）
        canvas = Image.new('RGBA', (gw, gh), (0, 0, 0, 0))
        y = gh - small.height if category == 'units' else (gh - small.height) // 2
        canvas.paste(small, ((gw - small.width) // 2, y))
        small = canvas
    return quantize(small, PIXEL_COLORS.get(category, 32))


def process(src: Path, dst: Path, keep_background: bool, category: str, smooth: bool) -> None:
    img = Image.open(src)
    img.load()
    if smooth:
        if keep_background:
            out = fit_size(img.convert('RGBA'))
        else:
            out = fit_size(trim_and_pad(bleed_colors(remove_background(img))))
            out = bleed_colors(out, passes=2)
    elif category == 'ui':
        out = img.convert('RGBA')
    elif keep_background:
        out = pixelate(img.convert('RGBA'), category)
    else:
        out = pixelate(trim_and_pad(remove_background(img)), category)
    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst, 'PNG', optimize=True)
    print(f'✅ {src.relative_to(ROOT)} → {dst.relative_to(ROOT)}  ({out.width}×{out.height})')


def main() -> int:
    parser = argparse.ArgumentParser(description='把 art-raw/ 下的原图处理成游戏用的透明 PNG')
    parser.add_argument('files', nargs='*', help='只处理这些文件（默认处理 art-raw/ 下全部）')
    parser.add_argument('--smooth', action='store_true', help='不做像素化（非像素风的图用）')
    args = parser.parse_args()

    sources = [Path(f).resolve() for f in args.files] if args.files else sorted(p for p in RAW_DIR.rglob('*') if p.suffix.lower() in EXTENSIONS)
    if not sources:
        print(f'art-raw/ 下没有图片。把原图放进 art-raw/units/、art-raw/portraits/、art-raw/buildings/ 等文件夹再运行。')
        return 1
    for src in sources:
        rel = src.relative_to(RAW_DIR)
        category = rel.parts[0] if len(rel.parts) > 1 else 'units'
        # 背景图（bg）、营地地点图（sites）不需要抠图
        keep_background = category in ('bg', 'sites')
        process(src, OUT_DIR / category / (src.stem.lower() + '.png'), keep_background, category, args.smooth)
    return 0


if __name__ == '__main__':
    sys.exit(main())
