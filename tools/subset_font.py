#!/usr/bin/env python3
"""
界面像素字体：把“缝合像素字体”（Fusion Pixel 12px Proportional 简体中文，TakWolf，SIL OFL-1.1）
裁成只包含游戏里用到的字，输出到 assets/resources/fonts/camp_pixel.ttf。

完整字体 1.4MB，小游戏包体放不下；游戏里的字都写在配置表和代码里，裁剪后只有几百 KB。
**加了新文字（配置表、界面文案）以后要重新跑一次**，否则新字会用系统字体显示：

    pip install fonttools          # 第一次需要
    python tools/subset_font.py

npm test 会检查字体里是不是缺字（tests/font.test.ts），缺了会提示重新运行这个脚本。

按 OFL 的要求：改过（裁剪过）的字体不能再叫保留名 “Fusion Pixel”，所以输出的字体改名为 “Camp Pixel”，
许可证原文放在 assets/resources/fonts/LICENSE-fusion-pixel.txt。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'tools' / 'fonts' / 'fusion-pixel-12px-proportional-sc.woff'
OUT = ROOT / 'assets' / 'resources' / 'fonts' / 'camp_pixel.ttf'
CHARS_OUT = ROOT / 'tools' / 'fonts' / 'camp_pixel.chars.txt'
# 原字体里本来就没有的字（交给系统字体），测试据此区分“没裁进去”和“原本就没有”
MISSING_OUT = ROOT / 'tools' / 'fonts' / 'camp_pixel.missing.txt'
FAMILY = 'Camp Pixel'

# 从这些地方收集用到的字
SCAN = [
    (ROOT / 'assets' / 'resources' / 'config', '*.json'),
    (ROOT / 'assets' / 'scripts', '*.ts'),
]
# 永远保留：可打印 ASCII 和常用中文标点
ALWAYS = ''.join(chr(c) for c in range(0x20, 0x7F)) + '，。！？、；：“”‘’（）《》【】…—～·'


def collect_chars() -> set[str]:
    chars = set(ALWAYS)
    for folder, pattern in SCAN:
        for path in folder.rglob(pattern):
            text = path.read_text(encoding='utf-8')
            chars.update(text)
    # 只要字体里会有的字（去掉换行、emoji 这些交给系统字体）
    return {c for c in chars if c.isprintable() and not ('\U0001F000' <= c <= '\U0010FFFF') and not ('☀' <= c <= '➿')}


def main() -> int:
    if not SOURCE.exists():
        print(f'找不到原字体 {SOURCE}')
        return 1
    font = TTFont(SOURCE)
    cmap = font.getBestCmap()
    wanted = collect_chars()
    have = sorted(c for c in wanted if ord(c) in cmap)
    missing = sorted(c for c in wanted if ord(c) not in cmap and not c.isspace())

    options = subset.Options()
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.notdef_outline = True
    options.flavor = None
    sub = subset.Subsetter(options)
    sub.populate(text=''.join(have))
    sub.subset(font)

    # OFL：改过的字体换个名字
    name = font['name']
    for rec in name.names:
        if rec.nameID in (1, 4, 16, 18):
            rec.string = FAMILY
        elif rec.nameID == 6:
            rec.string = FAMILY.replace(' ', '') + '-Regular'
        elif rec.nameID == 3:
            rec.string = f'{FAMILY} (subset of Fusion Pixel by TakWolf)'
    OUT.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = None
    font.save(OUT)
    CHARS_OUT.write_text(''.join(have), encoding='utf-8')
    MISSING_OUT.write_text(''.join(missing), encoding='utf-8')
    print(f'✅ {OUT.relative_to(ROOT)}：{len(have)} 个字，{OUT.stat().st_size // 1024} KB')
    if missing:
        print(f'⚠️ 原字体里没有这些字，会用系统字体显示：{"".join(missing[:80])}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
