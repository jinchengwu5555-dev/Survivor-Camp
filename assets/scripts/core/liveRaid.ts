// 亲手守夜：尸潮来了以后，界面用 LiveRaid 把战斗实时演出来，玩家可以
//   · 点角色的技能按钮放手动技能（也可以打开“自动释放”）
//   · 花木材修补营地的门（每场有次数限制）
//   · 把守夜的人调去守别的门
// 所有操作都记在 Battle.inputs 里，写进战报后可以完整重放。

import { Battle } from './battle/Battle';
import { BattleUnit } from './battle/types';
import { battleRegistry, CORE_UNIT, finishRaid, gateTag } from './combat';
import { addStat } from './state';
import { BattleReport, GameConfig, GameState, PendingRaid } from './types';

export interface SkillButton {
    uid: number;
    /** 角色名 */
    unitName: string;
    skillName: string;
    icon: string;
    /** 剩余冷却（秒），0 表示可以放 */
    cooldown: number;
    maxCooldown: number;
    /** 角色被控制（眩晕、沉默）时不能放 */
    blocked: boolean;
}

export class LiveRaid {
    readonly battle: Battle;
    report: BattleReport | null = null;

    constructor(readonly config: GameConfig, readonly state: GameState, readonly pending: PendingRaid) {
        // 亲手打的时候，手动技能默认由玩家来点
        this.battle = new Battle(battleRegistry(config), { ...pending.setup, autoCastActive: false, inputs: [] });
    }

    get done(): boolean {
        return this.battle.result !== 'ongoing';
    }

    /** 界面每帧调用 */
    advance(dt: number): void {
        this.battle.advance(dt);
    }

    /** 我方有主动技能、还活着的角色 */
    skillButtons(): SkillButton[] {
        return this.battle.side('ally').flatMap((u) => {
            const s = u.skills.find((x) => x.def.trigger.type === 'active');
            if (!s || !u.alive) return [];
            const blocked = u.statuses.some((st) => st.def.control?.stun || st.def.control?.silence);
            return [{ uid: u.uid, unitName: u.def.name, skillName: s.def.name, icon: s.def.icon ?? '✨', cooldown: s.cooldown, maxCooldown: s.def.cooldown, blocked }];
        });
    }

    cast(uid: number): string | null {
        return this.battle.useSkill(uid);
    }

    setAuto(on: boolean): void {
        this.battle.setAutoCast(on);
    }

    /** 营地的门（按门的下标排） */
    gates(): BattleUnit[] {
        return this.battle.units.filter((u) => u.gate !== undefined).sort((a, b) => a.gate! - b.gate!);
    }

    get core(): BattleUnit | undefined {
        return this.battle.units.find((u) => u.tag === CORE_UNIT);
    }

    /** 还立着、伤得最重的门（没指定门时修这个） */
    get barricade(): BattleUnit | undefined {
        const alive = this.gates().filter((g) => g.alive);
        return alive.sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp)[0];
    }

    /** 能调动的守夜的人 */
    defenders(): BattleUnit[] {
        return this.battle.side('ally').filter((u) => u.alive && u.def.faction !== 'structure');
    }

    /** 把 uid 调去守第 gate 个门；返回 null 表示成功 */
    assign(uid: number, gate: number): string | null {
        return this.battle.assignPost(uid, gate);
    }

    /** 修补一次能回多少血、花多少木材 */
    repairCost(gate = this.barricade?.gate): { hp: number; wood: number } {
        const r = this.config.balance.raidRepair;
        const unit = gate === undefined ? undefined : this.battle.gateUnit(gate);
        const hp = Math.ceil((unit?.stats.maxHp ?? 0) * r.hpRatio);
        return { hp, wood: Math.max(r.minWood, Math.ceil(hp * r.woodPerHp)) };
    }

    repairsLeft(): number {
        return Math.max(0, this.config.balance.raidRepair.maxUses - this.pending.repairs);
    }

    /** 花木材修补一个门（不指定就修伤得最重的）；返回 null 表示成功 */
    repair(gate = this.barricade?.gate): string | null {
        if (this.repairsLeft() <= 0) return '这一夜已经修不动了';
        if (gate === undefined) return '门都已经被打破了';
        const { hp, wood } = this.repairCost(gate);
        if (this.state.resources.wood < wood) return `木材不够（需要 ${wood}）`;
        const error = this.battle.healTagged(gateTag(gate), hp);
        if (error) return error;
        this.state.resources.wood -= wood;
        this.pending.repairs += 1;
        addStat(this.state, 'barricade_repairs');
        return null;
    }

    /** 直接打完（玩家点“跳过”）：剩下的部分手动技能自动释放 */
    skip(): void {
        this.battle.setAutoCast(true);
        this.battle.runToEnd();
    }

    /** 战斗结束后结算（只结算一次），返回战报 */
    finish(): BattleReport {
        if (!this.done) this.skip();
        if (!this.report) {
            this.report = finishRaid(this.config, this.state, this.pending, this.battle);
            this.state.pendingRaid = null;
        }
        return this.report;
    }
}
