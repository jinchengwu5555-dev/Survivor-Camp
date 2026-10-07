// 把战斗事件翻译成中文日志，调试和战报用。

import { Battle } from './Battle';
import { BattleEvent } from './types';

export function formatEvent(battle: Battle, e: BattleEvent): string {
    const name = (uid: number | null) => {
        const u = battle.getUnit(uid);
        return u ? `${u.def.name}#${u.uid}` : '环境';
    };
    const t = e.t.toFixed(1).padStart(5);
    switch (e.type) {
        case 'spawn':
            return `${t}s ${name(e.unit)} 出场`;
        case 'attack':
            return `${t}s ${name(e.source)} 攻击 ${name(e.target)}`;
        case 'skill':
            return `${t}s ${name(e.source)} 释放【${battle.registry.skill(e.skill).name}】→ ${e.targets.map(name).join('、')}`;
        case 'damage': {
            const from = e.skill ? `（${skillOrStatusName(battle, e.skill)}）` : '';
            const crit = e.crit ? ' 暴击！' : '';
            const shield = e.absorbed > 0 ? `，护盾吸收 ${e.absorbed}` : '';
            return `${t}s   ${name(e.target)} 受到 ${e.amount} 伤害${from}${crit}${shield}`;
        }
        case 'heal':
            return `${t}s   ${name(e.target)} 恢复 ${e.amount} 生命`;
        case 'statusOn':
            return `${t}s   ${name(e.target)} 获得【${battle.registry.status(e.status).name}】${e.stacks > 1 ? ` x${e.stacks}` : ''}`;
        case 'statusOff':
            return `${t}s   ${name(e.target)} 的【${battle.registry.status(e.status).name}】消失`;
        case 'death':
            return `${t}s ☠ ${name(e.unit)} 倒下了`;
        case 'leap':
            return `${t}s ${name(e.unit)} 撑杆跳过了 ${name(e.over)}`;
        case 'burrow':
            return `${t}s ${name(e.unit)} 从地下钻了出来`;
        case 'end':
            return `${t}s 战斗结束：${e.result === 'win' ? '胜利' : '失败'}`;
    }
}

/** 持续伤害的来源记录的是状态 id，技能伤害记录的是技能 id */
function skillOrStatusName(battle: Battle, id: string): string {
    return battle.registry.hasSkill(id) ? battle.registry.skill(id).name : battle.registry.status(id).name;
}
