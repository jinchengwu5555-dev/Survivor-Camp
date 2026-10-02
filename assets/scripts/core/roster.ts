// 营地人员：幸存者资料（有名有姓的角色 + 随机流浪者）、流浪者加入、战死与营地覆灭。

import { dropGear, dropGearAt } from './gear';
import { changeMoodAll } from './mood';
import { bury } from './bonds';
import { bedCount } from './economy';
import { nextRandom, pickOne } from './rng';
import { siteDeathChance, siteInjuryRecovery } from './siteMods';
import { addLog, addStat, currentDay, newSurvivorState, setFlag } from './state';
import { recoveryMultiplier, wandererTalentPool } from './talents';
import { GameConfig, GameState, Specialty, SurvivorState } from './types';

/** Fisher-Yates 洗牌（用存档里的随机数，结果可复现） */
function shuffle<T>(state: GameState, items: T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(nextRandom(state) * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

export interface SurvivorInfo {
    id: string;
    name: string;
    title: string;
    specialty: Specialty;
    traits: string[];
    talents?: string[];
    battleUnit?: string;
    isHero: boolean;
    bio: string;
}

/** 幸存者资料：有名有姓的角色读 survivors.json，流浪者读存档里的 profile */
export function survivorInfo(config: GameConfig, state: GameState, id: string): SurvivorInfo | undefined {
    const s = state.survivors.find((x) => x.id === id);
    if (s?.profile) return { id, ...s.profile, isHero: false, bio: '末日里的流浪者。' };
    const def = config.survivors.find((d) => d.id === id);
    return def ? { ...def } : undefined;
}

export function survivorName(config: GameConfig, state: GameState, id: string): string {
    return survivorInfo(config, state, id)?.name ?? id;
}

/** 随机生成一个流浪者（名字不和营地里的人重复） */
export function generateWanderer(config: GameConfig, state: GameState, specialty?: Specialty): SurvivorState {
    const w = config.wanderers;
    const used = new Set(state.survivors.map((s) => survivorName(config, state, s.id)));
    const names = w.names.filter((n) => !used.has(n));
    const spec = specialty ?? pickOne(state, w.specialties)!;
    const traits = shuffle(state, w.traits).slice(0, 2);
    const talent = pickOne(state, wandererTalentPool(config));
    const survivor = newSurvivorState(config, `w${state.nextId++}`);
    survivor.profile = {
        name: pickOne(state, names.length ? names : w.names)!,
        title: pickOne(state, w.titles[spec] ?? ['流浪者'])!,
        specialty: spec,
        traits,
        talents: talent ? [talent.id] : [],
        battleUnit: w.battleUnit,
    };
    return survivor;
}

/** 流浪者加入营地；没有床位就只能离开。返回加入的人（没加入返回 null） */
export function addWanderer(config: GameConfig, state: GameState, now: number, specialty?: Specialty): SurvivorState | null {
    const w = generateWanderer(config, state, specialty);
    if (state.survivors.length >= bedCount(config, state)) {
        addLog(state, now, `一个叫${w.profile!.name}的流浪者来投奔，但营地没有空床位了。`);
        return null;
    }
    state.survivors.push(w);
    addStat(state, 'wanderers_joined');
    addStat(state, 'recruited');
    addLog(state, now, `流浪者${w.profile!.name}（${w.profile!.title}）加入了营地。`);
    return w;
}

// ---------- 伤亡 ----------

/** 战斗中倒下后死亡的概率：基础概率 × 营地地点倍率 × 医务室减免；新手保护期内为 0 */
export function deathChance(config: GameConfig, state: GameState, now: number): number {
    const b = config.balance;
    if (currentDay(config, state, now) <= b.deathGraceDays) return 0;
    const infirmary = state.buildings['infirmary']?.level ?? 0;
    const reduction = Math.min(0.7, infirmary * b.deathReductionPerInfirmaryLevel);
    return b.deathChanceOnFall * siteDeathChance(config, state) * (1 - reduction);
}

/** 受伤：离开岗位，一段时间后自然痊愈（营地地点会影响养伤时间） */
export function injureSurvivor(config: GameConfig, state: GameState, s: SurvivorState, now: number): void {
    s.injured = true;
    s.assignment = null;
    s.recoverAt = now + config.balance.injuryRecoveryMinutes * siteInjuryRecovery(config, state) * recoveryMultiplier(config, state, s.id) * 60_000;
}

/**
 * 有人死了：从营地、探索小队里移除，记下剧情标记 dead_<id>。
 * where = 死在哪个探索地点：身上的装备掉在那里，下次打下那里才能捡回来；不写就是死在营地附近，装备留在营地。
 */
export function killSurvivor(config: GameConfig, state: GameState, id: string, now: number, cause: string, where?: string): string | null {
    const s = state.survivors.find((x) => x.id === id);
    if (!s) return null;
    const name = survivorName(config, state, id);
    if (where) dropGearAt(state, s, where);
    else dropGear(state, s);
    bury(config, state, s, now, cause);
    state.survivors = state.survivors.filter((x) => x.id !== id);
    for (const ex of state.expeditions) ex.squad = ex.squad.filter((m) => m !== id);
    setFlag(state, `dead_${id}`);
    addStat(state, 'deaths');
    addStat(state, `death_${cause}`);
    addLog(state, now, `☠ ${name}${cause}。`);
    changeMoodAll(state, -8, `失去了${name}`, now);
    checkGameOver(config, state, now, `${name}${cause}`);
    return name;
}

/**
 * 战斗中倒下的人：按死亡概率决定是战死还是重伤。返回战死者的名字和受伤者的 id。
 * canDie = false 时只受伤（比如探索打赢了，队友会把倒下的人背回来）
 */
export function resolveFallen(
    config: GameConfig,
    state: GameState,
    fallen: string[],
    now: number,
    cause: string,
    canDie = true,
    where?: string,
    /** 队里有医生时牺牲概率减半（formation.ts） */
    deathScale = 1,
): { dead: string[]; injured: string[] } {
    const dead: string[] = [];
    const injured: string[] = [];
    const chance = canDie ? deathChance(config, state, now) * deathScale : 0;
    for (const id of fallen) {
        const s = state.survivors.find((x) => x.id === id);
        if (!s) continue;
        const phoenix = hasPhoenix(config, state, id);
        const roll = nextRandom(state);
        if (phoenix && roll < chance && phoenixReady(config, state, now)) {
            rebirth(config, state, s, now);
            injured.push(id);
        } else if (roll < (phoenix ? chance * 0.5 : chance)) {
            const name = killSurvivor(config, state, id, now, cause, where);
            if (name) dead.push(name);
        } else {
            injureSurvivor(config, state, s, now);
            injured.push(id);
        }
    }
    return { dead, injured };
}

/** 随机死一个人（饿死、冻死、尸群冲进营地）。优先不是主角的人；主角能浴火重生就不会死 */
export function killRandom(config: GameConfig, state: GameState, now: number, cause: string): string | null {
    if (currentDay(config, state, now) <= config.balance.deathGraceDays) return null;
    const isHero = (s: SurvivorState) => survivorInfo(config, state, s.id)?.isHero ?? false;
    const pool = state.survivors.filter((s) => !isHero(s));
    const victim = pickOne(state, pool.length ? pool : state.survivors);
    if (victim && hasPhoenix(config, state, victim.id) && phoenixReady(config, state, now)) {
        rebirth(config, state, victim, now);
        return null;
    }
    return victim ? killSurvivor(config, state, victim.id, now, cause) : null;
}

// ---------- 主角的天赋：浴火重生 ----------

export const PHOENIX = 'phoenix';
/** 涅槃之后多少天才能再来一次 */
const PHOENIX_COOLDOWN_DAYS = 3;

export function hasPhoenix(config: GameConfig, state: GameState, id: string): boolean {
    return (survivorInfo(config, state, id)?.talents ?? []).includes(PHOENIX);
}

export function phoenixReady(config: GameConfig, state: GameState, now: number): boolean {
    return now >= (state.phoenix?.readyAt ?? 0);
}

/** 本该牺牲，却浴火重生：重伤（养伤时间加倍），攻击永久 +5%，3 天内不能再来一次 */
export function rebirth(config: GameConfig, state: GameState, s: SurvivorState, now: number): void {
    const count = (state.phoenix?.rebirths ?? 0) + 1;
    state.phoenix = { rebirths: count, readyAt: now + PHOENIX_COOLDOWN_DAYS * config.balance.dayLengthMinutes * 60_000 };
    injureSurvivor(config, state, s, now);
    if (s.recoverAt !== null) s.recoverAt = now + (s.recoverAt - now) * 2;
    addStat(state, 'rebirths');
    const name = survivorName(config, state, s.id);
    addLog(state, now, `🔥 ${name}倒下了……又挣扎着站了起来。浴火重生（第 ${count} 次），他变得更强了。`);
    changeMoodAll(state, 5, `${name}浴火重生`, now);
}

/**
 * 连续挨饿 / 挨冻：累计时间达到上限就死一个人，然后重新计时。
 * hardshipMinutes 为 0 表示这段时间吃饱穿暖，计时清零。
 */
export function applyHardship(config: GameConfig, state: GameState, hardshipMinutes: number, now: number): void {
    if (hardshipMinutes <= 0) {
        state.hardshipMinutes = 0;
        return;
    }
    state.hardshipMinutes += hardshipMinutes;
    while (state.hardshipMinutes >= config.balance.hardshipDeathMinutes && state.survivors.length > 0 && !state.gameOver) {
        state.hardshipMinutes -= config.balance.hardshipDeathMinutes;
        if (!killRandom(config, state, now, '没能熬过饥寒')) break;
    }
}

export function checkGameOver(config: GameConfig, state: GameState, now: number, cause: string): void {
    if (state.gameOver || state.survivors.length > 0) return;
    state.gameOver = { at: now, day: currentDay(config, state, now), cause };
    addLog(state, now, `营地覆灭了。你们在末日里坚持了 ${state.gameOver.day} 天。`);
}

