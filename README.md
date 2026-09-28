# 末日营地

Q 版丧尸末日生存 · 营地经营 · 剧情抉择，微信小游戏（竖屏）。

- 游戏设计文档：[docs/GDD.md](docs/GDD.md)
- 引擎：Cocos Creator 3.8 + TypeScript
- 微信小游戏 AppID：`wx26c43b6b78c92ffe`

## 目录结构

```
assets/
  resources/config/     ← 配置表（数值、建筑、幸存者、事件、剧情），改这里不用写代码
    balance.json          全局数值：吃饭速度、离线收益、事件间隔……
    resources.json        资源种类
    buildings.json        建筑和每一级的花费 / 产量
    survivors.json        幸存者
    events.json           随机事件和剧情事件
    episodes.json         剧情“季 / 集”和每集目标
    units.json            战斗角色：属性、外观、成长、技能
    skills.json           技能：触发条件、冷却、目标、效果
    statuses.json         状态：眩晕、中毒、护盾、增益……
  scripts/
    core/               ← 游戏逻辑，不依赖 Cocos，有单元测试
      battle/           ← 战斗系统（见下方“战斗系统”）
    platform/           ← 微信平台适配：存档、激励视频广告
    ui/GameRoot.ts      ← 原型阶段的调试界面（纯文字 + 按钮）
tests/                  ← 单元测试
docs/GDD.md             ← 游戏设计文档
```

## 第一次打开项目

1. **安装引擎**：到 Cocos 官网下载 **Cocos Dashboard**，在 Dashboard 的“安装”页里安装 **Cocos Creator 3.8.x**。
2. **下载代码**：推荐用 [GitHub Desktop](https://desktop.github.com/) 克隆本仓库，并切换到 `claude/game-dev-initial-planning-ghtbzn` 分支。
3. **导入项目**：Dashboard →“项目”→“添加”（或“导入”），选择仓库文件夹。如果提示引擎版本不同，选择“升级”并继续。
4. **设置分辨率**：菜单“项目”→“项目设置”→“项目数据”，把设计分辨率设为 **720 × 1280**，勾选“适配宽度”。
5. **创建主场景**（只需要做一次）：
   1. 在“资源管理器”的 `assets` 上右键 → 新建文件夹 `scenes`
   2. 在 `scenes` 上右键 → 新建 → Scene，命名为 `main`，双击打开
   3. 在“层级管理器”空白处右键 → 创建 → UI 组件 → **Canvas**
   4. 选中 Canvas，在“属性检查器”底部点“添加组件”，搜索 **GameRoot** 并添加
   5. `Ctrl + S` 保存场景
6. **预览**：点编辑器顶部的 ▶（选择“浏览器”预览）。能看到营地界面和开场事件“门外的呼救”就说明成功了。
7. 编辑器会生成很多 `.meta` 文件，**这些文件要一起提交到 Git**（它们记录了资源 ID，丢了场景就会坏）。

## 发布到微信

1. 安装 **微信开发者工具**，用你的微信登录。
2. Cocos 菜单“项目”→“构建发布”：
   - 发布平台：**微信小游戏**
   - AppID：`wx26c43b6b78c92ffe`
   - 初始场景：`main`，设备方向：**Portrait（竖屏）**
3. 点“构建”，完成后用微信开发者工具打开 `build/wechatgame` 目录，就可以真机预览了。

> ⚠️ **AppSecret 不要写进代码或提交到仓库。** 本项目是纯前端单机游戏，用不到它。

## 修改配置表

- 所有 JSON 配置表都可以直接用文本编辑器修改（推荐 VS Code）。
- 改完以后运行测试，就能检查有没有写错（比如引用了不存在的幸存者或事件）：

```bash
npm install   # 第一次需要
npm test
```

- 游戏启动时也会检查配置表，有错误会直接显示在屏幕上。

### 事件写法示例

```json
{
    "id": "my_event",
    "title": "事件标题",
    "text": "事件描述",
    "weight": 5,
    "once": true,
    "conditions": { "minDay": 2, "hasSurvivors": ["toby"] },
    "choices": [
        {
            "text": "选项文字",
            "cost": { "food": 10 },
            "outcomes": [
                { "weight": 3, "text": "好结果", "effects": [ { "type": "addSurvivor", "survivor": "hank" } ] },
                { "weight": 1, "text": "坏结果", "effects": [ { "type": "injure", "survivor": "random" } ] }
            ]
        }
    ]
}
```

- `weight`：随机抽取权重，`0` 表示只能由剧情触发；`outcomes` 里的 `weight` 决定各种结果的概率。
- 可用的效果（`effects`）：
  - `resource`：增减资源
  - `mood`：改心情（`target` 可以是某个幸存者 id、`random` 或 `all`）
  - `addSurvivor` / `removeSurvivor`：有人加入 / 离开
  - `injure` / `heal`：受伤 / 治疗
  - `flag`：记下一个剧情标记
  - `triggerEvent`：接着触发另一个事件
- 可用的条件（`conditions`）：`minDay`、`minSurvivors`、`flags`、`notFlags`、`hasSurvivors`。

## 战斗系统

战斗是自动进行的横版对战，玩家可以手动释放每个角色的 1 个主动技能。代码在 `assets/scripts/core/battle/`，分成 5 个模块：

| 模块 | 文件 | 配置表 | 负责什么 |
|---|---|---|---|
| 1. 角色配置 | `units.ts` | `units.json` | 基础属性、外观、等级成长，生成战斗角色 |
| 2. 技能系统 | `skills.ts` | `skills.json` | 触发条件、目标选择、冷却、效果执行 |
| 3. 技能编排登记表 | `registry.ts` | — | 统一登记角色 / 技能 / 状态，检查配置错误，生成技能说明，调试时临时改数值 |
| 4. 伤害结算管线 | `damage.ts` | — | 增伤 → 暴击 → 防御减免 → 易伤 → 取整 → 护盾 → 扣血 |
| 5. 控制和状态 | `status.ts` + `Battle.ts` | `statuses.json` | 眩晕 / 定身 / 沉默、增减益、持续伤害、护盾；移动、索敌、普攻、刷怪、胜负判定 |

### 查看一场战斗的战报

```bash
npm run battle
```

会打印一场“五人小队 vs 尸群”的完整中文战报，改完数值后用它看效果。

### 技能写法

```json
{
    "id": "molotov",
    "name": "燃烧瓶",
    "description": "德里克扔出燃烧瓶，点燃一片敌人。",
    "trigger": { "type": "active" },
    "cooldown": 15,
    "targeting": { "rule": "nearestEnemy", "radius": 2 },
    "effects": [
        { "type": "damage", "ratio": 1.2, "damageType": "fire" },
        { "type": "status", "status": "burn", "duration": 4, "power": 0.3 }
    ]
}
```

- **触发方式 `trigger.type`**：`active` 手动释放、`auto` 冷却好了自动释放、`onAttack` 普攻时按 `chance` 概率触发、`battleStart` 开战时触发、`hpBelow` 生命低于 `ratio` 时触发一次、`onDeath` 死亡时触发。每个角色最多 1 个 `active` 技能。
- **目标 `targeting.rule`**：`self`、`currentTarget`、`nearestEnemy`、`randomEnemy`、`lowestHpAlly`、`allAllies`、`allEnemies`；加上 `radius` 就变成范围技能（主目标周围 N 格内的同阵营单位都会被命中）。
- **效果 `effects`**：
  - `damage`：伤害 = `ratio` × 攻击力，`damageType` 可选 `physical` / `fire` / `poison` / `true`
  - `heal`：治疗 = `ratio` × 攻击力
  - `status`：施加状态，持续 `duration` 秒；持续伤害和护盾的强度 = `power` × 攻击力
- **伤害类型**：物理受全额防御减免，火焰受一半，毒素和真实伤害无视防御。防御公式：减伤 = 防御 / (防御 + 100)。
