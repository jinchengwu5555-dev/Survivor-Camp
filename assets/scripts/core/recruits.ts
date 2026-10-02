// 招募：开局只有伊森一个人。第一次探索回来，会在路上遇到 1～3 个人（有名有姓的角色或者随机流浪者），
// 玩家看他们的介绍、专长、天赋和“印象”，决定留下谁。
// 每个人可能带着特质（recruits.json 的 quirks）：有好有坏；有的坏毛病藏着，过一阵才暴露。
//   onJoin   加入时：带来物资 / 装备，或者本来就是病号
//   nightly  每晚发作：多找点吃的、偷粮食、偷喝酒精、跟人吵架……
//   work / combat  干活、打仗的倍率（在 talents.ts 的总倍率里一起算）
//   raidChance     尸潮更容易找上门
// 之后探索时偶尔也会遇到人（地点的 recruitChance），同样由玩家决定。
// 界面模式下候选人放在 state.candidates 等玩家选；测试和模拟自动决定（床位够就留下没有明显坏毛病的人）。

import { addResource, bedCount, grantResources } from './economy';
import { changeMoodAll } from './mood';
import { addProp } from './props';
import { nextRandom, pickOne } from './rng';
import { generateWanderer, injureSurvivor, survivorName } from './roster';
import { addLog, addStat, hasFlag, newSurvivorState, setFlag } from './state';
import { ActionResult, CandidateState, GameConfig, GameState, QuirkDef, RESOURCE_IDS, SurvivorState } from './types';

export function quirkDef(config: GameConfig, id: string): QuirkDef | undefined {
    return config.recruits?.quirks.find((q) => q.id === id);
}

/** 这个人的特质（包括还没暴露的） */
export function quirksOf(config: GameConfig, s: SurvivorState | undefined): QuirkDef[] {
    return (s?.quirks ?? []).flatMap((id) => quirkDef(config, id) ?? []);
}

/** 玩家能看到的特质：藏着的坏毛病暴露以前看不到 */
export function visibleQuirks(config: GameConfig, s: SurvivorState | undefined): QuirkDef[] {
    return quirksOf(config, s).filter((q) => !q.hidden || (s?.revealed ?? []).includes(q.id));
}

/** 特质带来的干活 / 打仗倍率（talents.ts 的总倍率会乘上它） */
export function quirkWork(config: GameConfig, s: SurvivorState | undefined): number {
    return quirksOf(config, s).reduce((m, q) => m * (q.work?.mult ?? 1), 1);
}

export function quirkCombat(config: GameConfig, s: SurvivorState | undefined): { atk: number; hp: number } {
    return quirksOf(config, s).reduce((m, q) => ({ atk: m.atk * (q.combat?.atk ?? 1), hp: m.hp * (q.combat?.hp ?? 1) }), { atk: 1, hp: 1 });
}

/** 营地里的人的特质让尸潮更容易来 */
export function quirkRaidChance(config: GameConfig, state: GameState): number {
    return state.survivors.reduce((sum, s) => sum + quirksOf(config, s).reduce((n, q) => n + (q.raidChance ?? 0), 0), 0);
}

/** 可以作为候选人出现的有名有姓的角色：不在营地、没死、没被拒绝过、不在等待名单里 */
function namedPool(config: GameConfig, state: GameState): string[] {
    const waiting = new Set((state.candidates ?? []).map((c) => c.survivor.id));
    return Object.keys(config.recruits?.intros ?? {}).filter(
        (id) =>
            config.survivors.some((d) => d.id === id) &&
            !state.survivors.some((s) => s.id === id) &&
            !waiting.has(id) &&
            !hasFlag(state, `dead_${id}`) &&
            !hasFlag(state, `refused_${id}`),
    );
}

function rollQuirks(config: GameConfig, state: GameState): string[] {
    const cfg = config.recruits!;
    const out: string[] = [];
    if (nextRandom(state) < cfg.goodChance) {
        const q = pickOne(state, cfg.quirks.filter((x) => x.good));
        if (q) out.push(q.id);
    }
    if (nextRandom(state) < cfg.badChance) {
        const q = pickOne(state, cfg.quirks.filter((x) => !x.good));
        if (q) out.push(q.id);
    }
    return out;
}

/** 生成一个候选人（还没加入营地） */
export function makeCandidate(config: GameConfig, state: GameState, place: string, now: number): CandidateState | null {
    const cfg = config.recruits;
    if (!cfg) return null;
    const named = namedPool(config, state);
    let survivor: SurvivorState;
    let intro: string;
    if (named.length && nextRandom(state) < cfg.namedChance) {
        const id = pickOne(state, named)!;
        survivor = newSurvivorState(config, id);
        intro = (cfg.intros[id] ?? '').split('{place}').join(place);
    } else {
        survivor = generateWanderer(config, state);
        const text = pickOne(state, cfg.wandererIntros) ?? '{place}里遇到一个人。';
        intro = text.split('{place}').join(place).split('{title}').join(survivor.profile?.title ?? '流浪者');
    }
    survivor.quirks = rollQuirks(config, state);
    return { id: state.nextId++, survivor, intro, at: now };
}

/** 探索回来遇到 count 个人，放进等待名单 */
export function offerCandidates(config: GameConfig, state: GameState, count: number, place: string, now: number): CandidateState[] {
    const made: CandidateState[] = [];
    for (let i = 0; i < count; i++) {
        const c = makeCandidate(config, state, place, now);
        if (c) made.push(c);
    }
    if (made.length) {
        state.candidates = [...(state.candidates ?? []), ...made];
        addLog(state, now, `🙋 在${place}遇到了 ${made.length} 个幸存者，回营地决定留不留他们。`);
    }
    return made;
}

/** 第一次探索：遇到 firstCount 个人 */
export function firstRecruits(config: GameConfig, state: GameState, place: string, now: number): void {
    if (!config.recruits || hasFlag(state, 'first_recruits')) return;
    setFlag(state, 'first_recruits');
    const [lo, hi] = config.recruits.firstCount;
    // 第一次遇到的这几个人，留下来就是“最初的伙伴”
    for (const c of offerCandidates(config, state, lo + Math.floor(nextRandom(state) * (hi - lo + 1)), place, now)) c.survivor.founder = true;
}

function candidateName(config: GameConfig, state: GameState, c: CandidateState): string {
    return c.survivor.profile?.name ?? config.survivors.find((d) => d.id === c.survivor.id)?.name ?? c.survivor.id;
}

/** 候选人的资料（还没加入营地，survivorInfo 查不到流浪者） */
export function candidateInfo(config: GameConfig, c: CandidateState): { name: string; title: string; specialty: string; talents: string[]; traits: string[] } {
    const p = c.survivor.profile;
    const def = config.survivors.find((d) => d.id === c.survivor.id);
    return {
        name: p?.name ?? def?.name ?? c.survivor.id,
        title: p?.title ?? def?.title ?? '',
        specialty: p?.specialty ?? def?.specialty ?? '',
        talents: p?.talents ?? def?.talents ?? [],
        traits: p?.traits ?? def?.traits ?? [],
    };
}

/** 留下 / 让他走 */
export function decideCandidate(config: GameConfig, state: GameState, candidateId: number, keep: boolean, now: number): ActionResult {
    const c = (state.candidates ?? []).find((x) => x.id === candidateId);
    if (!c) return { ok: false, reason: '这个人已经走了' };
    const name = candidateName(config, state, c);
    if (keep && state.survivors.length >= bedCount(config, state)) return { ok: false, reason: '没有空床位了，先升级宿舍' };
    state.candidates = (state.candidates ?? []).filter((x) => x !== c);
    if (!keep) {
        if (!c.survivor.profile) setFlag(state, `refused_${c.survivor.id}`);
        addStat(state, 'recruits_refused');
        addLog(state, now, `${name}背起包，一个人走远了。`);
        return { ok: true, message: `${name}走了` };
    }
    const s = c.survivor;
    s.joinedAt = now;
    s.revealed = [];
    state.survivors.push(s);
    addStat(state, 'recruited');
    if (s.profile) addStat(state, 'wanderers_joined');
    const extras: string[] = [];
    for (const q of quirksOf(config, s)) {
        if (!q.onJoin) continue;
        if (q.onJoin.resources) grantResources(config, state, q.onJoin.resources);
        for (const [id, n] of Object.entries(q.onJoin.props ?? {})) addProp(state, id, n);
        if (q.onJoin.injured) injureSurvivor(config, state, s, now);
        extras.push(q.description);
    }
    addLog(state, now, `🙋 ${name}留在了营地。${extras.join('')}`);
    return { ok: true, message: `${name}留下了` };
}

/** 没有界面时（测试、模拟）自动决定：床位够就留下，看得出有坏毛病的不要 */
export function autoDecideCandidates(config: GameConfig, state: GameState, now: number): void {
    for (const c of [...(state.candidates ?? [])]) {
        const bad = visibleQuirks(config, c.survivor).some((q) => !q.good);
        decideCandidate(config, state, c.id, !bad && state.survivors.length < bedCount(config, state), now);
    }
}

function reveal(config: GameConfig, state: GameState, s: SurvivorState, q: QuirkDef, now: number): void {
    if (!q.hidden || (s.revealed ?? []).includes(q.id)) return;
    s.revealed = [...(s.revealed ?? []), q.id];
    addStat(state, 'quirks_revealed');
    const text = (q.revealText ?? `原来{name}${q.name}。`).split('{name}').join(survivorName(config, state, s.id));
    addLog(state, now, `😠 ${text}`);
}

/** 每晚：特质发作（在 maybeRunRaid 过夜时调用） */
export function nightQuirks(config: GameConfig, state: GameState, at: number): void {
    const dayMs = config.balance.dayLengthMinutes * 60_000;
    for (const s of [...state.survivors]) {
        for (const q of quirksOf(config, s)) {
            if (q.revealDays && at - (s.joinedAt ?? at) >= q.revealDays * dayMs) reveal(config, state, s, q, at);
            const n = q.nightly;
            if (!n || (n.chance !== undefined && nextRandom(state) >= n.chance)) continue;
            // 加减资源（addResource 不会扣成负数）
            if (n.resources) for (const id of RESOURCE_IDS) if (n.resources[id]) addResource(config, state, id, n.resources[id]!);
            const name = survivorName(config, state, s.id);
            if (n.moodAll) changeMoodAll(state, n.moodAll, q.good ? `${name}逗大家开心` : `${name}${q.name}`, at, (x) => x !== s);
            addLog(state, at, `${q.icon} ${n.text.split('{name}').join(name)}`);
            reveal(config, state, s, q, at);
        }
    }
}
