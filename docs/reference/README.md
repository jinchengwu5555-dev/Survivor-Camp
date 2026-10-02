# 备用资料库

从末日题材的小说、游戏、漫画里提炼出来的可借鉴内容。**除了点子池里标为“已采用”的，这里的东西都还没有进入游戏**，等你挑选后再采用。

## 目录

| 文件 | 内容 |
|---|---|
| [ideas.md](ideas.md) | **点子池**：85 条点子。第一批 R01～R40 按营地、幸存者、探索、战斗、剧情、传播分类；第二批 R41～R85 按新加的作品分组。标注来源、工作量、推荐度和状态。**从这里开始看** |
| [candidate-events.json](candidate-events.json) | **候选事件**：按 `events.json` 格式写好、等待采用的事件。目前为空（之前的 10 个都已采用进游戏），以后新写的候选事件放这里 |
| [sources/global-evolution.md](sources/global-evolution.md) | 《全球进化》：生态失控、食物链洗牌、浓雾、人类变异 |
| [sources/cuotuo.md](sources/cuotuo.md) | 《蹉跎》：边境小镇、势力林立、非人伙伴、末日民俗 |
| [sources/hunting-demons.md](sources/hunting-demons.md) | 《狩魔手记》：辐射废土、进化点与能力域、猎人职业、聚居地秩序 |
| [sources/the-last-of-us.md](sources/the-last-of-us.md) | 《最后生还者 1》：感染阶段、资源稀缺、潜行、宁静时刻、灰色结局 |
| [sources/berserk.md](sources/berserk.md) | 《剑风传奇》：挣扎者精神、夜晚恐惧、佣兵团群像、背叛、狂战士 |
| [sources/city-of-doom.md](sources/city-of-doom.md) | 《末日之城》：困在写字楼、救援期限、聚集地内奸、路线式求生、移动营地 |
| [sources/dark-blood-age.md](sources/dark-blood-age.md) | 《黑暗血时代》：永夜严寒、军方配给、虫群、难民大迁徙、限电城市 |
| [sources/demon-farm.md](sources/demon-farm.md) | 《神魔养殖场》：整座学校被困、粮食倒计时、食物失窃、驯化役畜、驱逐 |
| [sources/spore-doom.md](sources/spore-doom.md) | 《末日孢子》：日记体、感染过程、限时疫苗、汽笛求救、变成怪物的朋友 |
| [sources/games-and-shows.md](sources/games-and-shows.md) | 三角洲行动、骑马与砍杀 2、燕云十六声、杀戮尖塔、植物大战僵尸、潜水员戴夫、行尸走肉（只借机制） |

## 怎么采用

1. 在 [ideas.md](ideas.md) 里挑点子，告诉我编号，比如“采用 R18、R19、R26”。
2. 只需要写事件的点子：从 `candidate-events.json` 里把对应事件复制到 `assets/resources/config/events.json`（`_idea` 字段可以留着，游戏会忽略它）。
3. 需要改代码的点子：我来实现，完成后把点子池里的状态改成“已采用”，并注明落地到了哪个文件。
4. 决定不做的点子：状态改成“已放弃”，写一句原因，免得以后重复讨论。

`npm test` 会自动检查候选事件和当前配置是否兼容，比如引用的幸存者、资源是否存在，保证它们随时可以直接用。

## 使用规则（重要）

- **只借鉴机制、类型和情绪，不照搬内容**。所有角色名、地名、组织名、专有名词、原剧情桥段和标志性造型都不能用，包括每份分析末尾“不建议采用”里列出的名词。
- **尊重休闲玩家和平台审核**：参考作品里的性暴力、奴隶交易、极端血腥、食人等内容一律不采用。我们的调性是“Q 版、紧张但不恶心、残酷但有温度”。
- 分析小说时，我读的是目录，再在全书均匀抽样精读，没有逐字读完 1400 多万字。《最后生还者》和《剑风传奇》没有原文，根据对作品的公开了解整理。
- 这个目录里只存分析和点子，不存原文摘录。
