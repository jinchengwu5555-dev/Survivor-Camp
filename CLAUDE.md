# 末日营地 — 开发约定

- 微信小游戏，Cocos Creator 3.8 + TypeScript。设计文档见 docs/GDD.md，与用户沟通使用中文。
- `assets/scripts/core/` 是纯逻辑，**禁止 import 'cc'**，所有时间都通过参数 `now`（毫秒）传入，随机数用 `core/rng.ts`（状态存在 GameState / Battle 里）。
- 数值、内容一律放在 `assets/resources/config/*.json`；新增效果 / 条件类型时同步更新 `core/types.ts`、`core/validate.ts`、README 的事件写法说明。
- 战斗系统在 `core/battle/`，分 5 个模块：角色配置 `units.ts`、技能系统 `skills.ts`、技能编排登记表 `registry.ts`、伤害结算管线 `damage.ts`、控制和状态 `status.ts` + `Battle.ts`。战斗按固定步长 0.1 秒推进，随机数状态存在 Battle 里，同一种子可完整重放。新增技能效果 / 目标规则 / 触发方式时同步更新 `battle/types.ts`、`registry.ts` 的校验和说明文字、README 的技能写法。
- 营地和战斗的衔接在 `core/combat.ts`（探索远征、尸潮夜袭、伤员）。战斗参数统一由 `expeditionSetup` / `raidSetup` 生成，`npm run balance` 也用它们，改数值后跑一下看难度曲线。
- `platform/` 放微信 / Cocos 平台相关代码，`ui/` 放界面。
- 提交前运行 `npm test` 和 `npm run typecheck`。
- 不要提交 AppSecret 等密钥；`.meta` 文件和场景文件需要提交。
- 版权：不使用《行尸走肉》的角色名、地名、标志性造型和原剧情。
