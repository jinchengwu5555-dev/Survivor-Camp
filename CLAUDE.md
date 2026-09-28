# 末日营地 — 开发约定

- 微信小游戏，Cocos Creator 3.8 + TypeScript。设计文档见 docs/GDD.md，与用户沟通使用中文。
- `assets/scripts/core/` 是纯逻辑，**禁止 import 'cc'**，所有时间都通过参数 `now`（毫秒）传入，随机数用 `core/rng.ts`（状态存在 GameState 里）。
- 数值、内容一律放在 `assets/resources/config/*.json`；新增效果 / 条件类型时同步更新 `core/types.ts`、`core/validate.ts`、README 的事件写法说明。
- `platform/` 放微信 / Cocos 平台相关代码，`ui/` 放界面。
- 提交前运行 `npm test` 和 `npm run typecheck`。
- 不要提交 AppSecret 等密钥；`.meta` 文件和场景文件需要提交。
- 版权：不使用《行尸走肉》的角色名、地名、标志性造型和原剧情。
