// 游戏总入口：界面层只和这个类打交道。

import { AchievementDef, ActionResult, GameConfig, GameEventDef, GameState } from './types';
import { advanceEconomy } from './economy';
import { assignSurvivor, completeUpgrades, finishUpgradeNow, startUpgrade } from './buildings';
import { ChoiceResult, getEventDef, maybeTriggerRandomEvent, resolveChoice } from './events';
import { checkEpisode, startStory } from './story';
import { finishExpeditionNow, maybeRunRaid, recoverInjuries, resolveExpeditions, startExpedition, suggestSquad, treatSurvivor } from './combat';
import { craftItem } from './crafting';
import { abandonBounty, acceptBounty, claimBounty } from './bounties';
import { checkAchievements } from './achievements';
import { checkSeasonChange } from './seasons';
import { createNewState } from './state';

export class CampGame {
    /** 新解锁、还没在界面上提示过的成就；界面取走后自己清空 */
    readonly newAchievements: AchievementDef[] = [];

    constructor(readonly config: GameConfig, public state: GameState) {}

    static newGame(config: GameConfig, now: number, seed = Date.now()): CampGame {
        const game = new CampGame(config, createNewState(config, now, seed));
        startStory(config, game.state);
        return game;
    }

    /**
     * 推进时间到 now。离线回来时第一次调用会一次性结算离线收益（最多 offlineCapHours 小时）。
     * 生产按段结算：在每个升级完成的时间点切开，保证升级后的产量从完成那一刻开始计算。
     */
    tick(now: number): void {
        const s = this.state;
        if (now <= s.lastTickAt) return;
        const capMs = this.config.balance.offlineCapHours * 3_600_000;
        let t = Math.max(s.lastTickAt, now - capMs);

        const finishTimes = Object.values(s.buildings)
            .map((b) => b.upgradeEndsAt)
            .filter((at): at is number => at !== null && at > t && at <= now)
            .sort((a, b) => a - b);
        for (const at of [...finishTimes, now]) {
            advanceEconomy(this.config, s, (at - t) / 60_000, t);
            completeUpgrades(this.config, s, at);
            t = at;
        }

        s.lastTickAt = now;
        checkSeasonChange(this.config, s, now);
        recoverInjuries(this.config, s, now);
        resolveExpeditions(this.config, s, now);
        maybeRunRaid(this.config, s, now);
        maybeTriggerRandomEvent(this.config, s, now);
        this.settle(now);
    }

    /** 每个操作之后都检查一次剧情目标和成就 */
    private settle(now: number): void {
        checkEpisode(this.config, this.state, now);
        this.newAchievements.push(...checkAchievements(this.config, this.state, now));
    }

    private act<T>(now: number, action: () => T): T {
        this.tick(now);
        const result = action();
        this.settle(now);
        return result;
    }

    upgrade(buildingId: string, now: number): ActionResult {
        return this.act(now, () => startUpgrade(this.config, this.state, buildingId, now));
    }

    /** 看完激励视频后调用 */
    speedUpUpgrade(buildingId: string, now: number): ActionResult {
        return this.act(now, () => finishUpgradeNow(this.config, this.state, buildingId, now));
    }

    assign(survivorId: string, buildingId: string | null, now: number): ActionResult {
        return this.act(now, () => assignSurvivor(this.config, this.state, survivorId, buildingId));
    }

    /** 派小队去探索；不指定成员时自动挑战斗力最高的人 */
    explore(locationId: string, now: number, squad?: string[]): ActionResult {
        return this.act(now, () =>
            startExpedition(this.config, this.state, locationId, squad ?? suggestSquad(this.config, this.state), now),
        );
    }

    /** 看完激励视频后调用：小队立即返回 */
    speedUpExpedition(expeditionId: number, now: number): ActionResult {
        return this.act(now, () => finishExpeditionNow(this.config, this.state, expeditionId, now));
    }

    treat(survivorId: string, now: number): ActionResult {
        return this.act(now, () => treatSurvivor(this.config, this.state, survivorId, now));
    }

    craft(itemId: string, now: number): ActionResult {
        return this.act(now, () => craftItem(this.config, this.state, itemId, now));
    }

    acceptBounty(bountyId: string, now: number): ActionResult {
        return this.act(now, () => acceptBounty(this.config, this.state, bountyId, now));
    }

    abandonBounty(bountyId: string, now: number): ActionResult {
        return this.act(now, () => abandonBounty(this.state, bountyId));
    }

    claimBounty(bountyId: string, now: number): ActionResult {
        return this.act(now, () => claimBounty(this.config, this.state, bountyId, now));
    }

    get currentEvent(): GameEventDef | undefined {
        const id = this.state.eventQueue[0];
        return id ? getEventDef(this.config, id) : undefined;
    }

    choose(choiceIndex: number, now: number): ChoiceResult {
        return this.act(now, () => resolveChoice(this.config, this.state, choiceIndex, now));
    }
}
