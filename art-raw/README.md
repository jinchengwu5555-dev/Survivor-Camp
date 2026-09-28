# 美术原图

AI 生成的原图放这里，**什么格式都行**（png / jpg / jfif / webp），白底、假棋盘格背景都没关系。

```
art-raw/
  units/       战斗角色，比如 unit_sophie.jfif
  portraits/   事件头像，比如 portrait_ethan.webp
  buildings/   建筑，比如 building_kitchen.png
  icons/       图标
  bg/          背景图（不抠图，只转格式和缩放）
  sites/       营地地点图（不抠图）
```

文件名按 `docs/art-assets.md` 里的来（后缀不用管）。

放好后运行（或者提交上来让 Claude 跑）：

```bash
pip install pillow numpy     # 第一次需要
python tools/process_art.py
```

会自动去背景、去白边、裁掉多余空白、缩到 512 以内，输出到 `assets/resources/sprites/` 对应的文件夹。
