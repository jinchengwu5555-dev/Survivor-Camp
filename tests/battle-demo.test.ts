// 打印一场完整战斗的中文战报，调数值时用：
//   npm run battle
// 平时跑 npm test 时不输出。

import { expect, it } from 'vitest';
import { Battle } from '../assets/scripts/core/battle/Battle';
import { formatEvent } from '../assets/scripts/core/battle/format';
import { BattleRegistry } from '../assets/scripts/core/battle/registry';
import { loadConfig } from './helpers';

/** `npm run battle` 用 --mode battle 启动 */
const showLog = (import.meta as unknown as { env: { MODE: string } }).env.MODE === 'battle';

it('战报演示：五人小队 vs 尸群', () => {
    const battle = new Battle(new BattleRegistry(loadConfig()), {
        allies: [{ unit: 'martha' }, { unit: 'derek' }, { unit: 'ethan' }, { unit: 'toby' }, { unit: 'sophie' }],
        enemies: [
            { unit: 'walker' },
            { unit: 'runner' },
            { unit: 'fatty' },
            { unit: 'walker', spawnAt: 8 },
            { unit: 'armored', spawnAt: 8 },
            { unit: 'brute', spawnAt: 15 },
        ],
        timeLimit: 120,
        timeoutResult: 'lose',
        seed: 2026,
    });

    // 模拟玩家：技能一转好就点
    while (battle.result === 'ongoing') {
        for (const u of battle.side('ally')) if (u.alive) battle.useSkill(u.uid);
        battle.step();
    }

    if (showLog) {
        const lines = battle.events.filter((e) => e.type !== 'attack').map((e) => formatEvent(battle, e));
        const survivors = battle.side('ally').map((u) => `${u.def.name} ${u.hp}/${u.stats.maxHp}`);
        console.log([...lines, '', `我方剩余：${survivors.join('，')}`].join('\n'));
    }
    expect(battle.result).not.toBe('ongoing');
});
