// 游戏核心类型定义。
// core/ 目录下的代码不依赖 Cocos（不 import 'cc'），可以直接在 Node 里跑单元测试。

import type { BattleResult, SkillDef, StatusDef, UnitDef } from './battle/types';
import type { BattleSetup, UnitSetup } from './battle/Battle';

export type ResourceId = 'food' | 'wood' | 'parts' | 'medicine' | 'cans';
export const RESOURCE_IDS: ResourceId[] = ['food', 'wood', 'parts', 'medicine', 'cans'];

export type ResourceBag = Partial<Record<ResourceId, number>>;

export type Specialty = 'leader' | 'cook' | 'medic' | 'mechanic' | 'scavenger' | 'fighter' | 'farmer';

// ---------- 配置（来自 assets/resources/config/*.json） ----------

export interface BalanceDef {
    /** 每个幸存者每分钟吃掉的食物 */
    foodPerSurvivorPerMinute: number;
    /** 离线收益最多计算多少小时 */
    offlineCapHours: number;
    /** 专长对口时的产量倍率 */
    specialtyBonus: number;
    /** 吃饱时心情每分钟恢复多少（最高到 moodRecoveryMax） */
    moodRecoveryPerMinute: number;
    moodRecoveryMax: number;
    /** 挨饿时心情每分钟下降多少 */
    hungerMoodPenaltyPerMinute: number;
    /** 新加入幸存者的初始心情 */
    newSurvivorMood: number;
    /** 随机事件间隔（分钟） */
    eventIntervalMinutes: number;
    /** 游戏里的一天等于现实多少分钟 */
    dayLengthMinutes: number;
    /** 同时能进行几个建造 */
    buildQueueSize: number;
    startingResources: ResourceBag;
    startingSurvivors: string[];
    /** 资源基础上限；不写的资源没有上限 */
    baseStorage: ResourceBag;
    /** 探索小队最多几个人 */
    maxSquadSize: number;
    /** 受伤后自然恢复需要的分钟数 */
    injuryRecoveryMinutes: number;
    /** 在医务室立即治好一个伤员的花费 */
    healCost: ResourceBag;
    /** 尸潮夜袭的间隔（分钟） */
    raidIntervalMinutes: number;
    /** 守夜时最多几个人上阵 */
    maxDefenders: number;
    /** 路障在战斗中的生命 = 安全值 × 这个数 */
    barricadeHpPerSafety: number;
    /** 守夜失败时损失的资源比例 */
    raidLossRatio: number;
    /** 新鲜食物每分钟腐烂的比例（0.001 = 每分钟 0.1%）；罐头不会坏 */
    foodSpoilPerMinute: number;
    /** 冬天没柴取暖时，心情每分钟下降多少 */
    coldMoodPenaltyPerMinute: number;
    /** 每第几次尸潮是血月夜；0 = 关闭 */
    bloodMoonEvery: number;
    /** 血月夜击退后奖励的倍数 */
    bloodMoonRewardMultiplier: number;
    /** 最多同时接几个悬赏 */
    maxActiveBounties: number;
    /** 猎人等级：累计悬赏经验达到 xp 就升到这一级 */
    hunterRanks: { name: string; xp: number }[];
}

export interface ResourceDef {
    id: ResourceId;
    name: string;
    icon: string;
}

export interface BuildingLevelDef {
    /** 升到这一级的花费 */
    cost: ResourceBag;
    /** 升到这一级需要的秒数 */
    buildSeconds: number;
    /** 需要指挥部达到的等级 */
    requiresHq?: number;
    /** 每个工人每分钟的产量 */
    production?: ResourceBag;
    workerSlots?: number;
    /** 增加的资源上限 */
    storage?: ResourceBag;
    /** 提供的床位 */
    beds?: number;
    /** 提供的安全值 */
    safety?: number;
    /** 所有幸存者的战斗等级 +N */
    battleLevel?: number;
    /** 食物腐烂速度降低的比例（0.3 = 慢 30%），多个建筑相加，最多 90% */
    spoilReduction?: number;
    /** 工坊等级：决定能做哪些物品 */
    workshopLevel?: number;
}

export interface BuildingDef {
    id: string;
    name: string;
    description: string;
    /** 对口专长，分配对口的幸存者产量更高 */
    specialty?: Specialty;
    /** 开局等级（0 = 未建造） */
    startLevel: number;
    /** levels[i] 表示第 i+1 级 */
    levels: BuildingLevelDef[];
}

export interface SurvivorDef {
    id: string;
    name: string;
    title: string;
    specialty: Specialty;
    traits: string[];
    /** 核心角色不会因为随机事件离开或死亡 */
    isHero: boolean;
    /** 战斗中使用的角色（units.json 的 id） */
    battleUnit?: string;
    bio: string;
}

export type SurvivorTarget = string | 'random' | 'all';

export type Effect =
    | { type: 'resource'; resource: ResourceId; amount: number }
    | { type: 'mood'; amount: number; target?: SurvivorTarget }
    | { type: 'addSurvivor'; survivor: string }
    | { type: 'removeSurvivor'; survivor: string | 'random' }
    | { type: 'injure'; survivor: string | 'random' }
    | { type: 'heal'; survivor: string | 'all' }
    | { type: 'flag'; flag: string }
    | { type: 'triggerEvent'; event: string }
    /** 累计统计数据（成就、悬赏会用到），amount 默认 1 */
    | { type: 'stat'; stat: string; amount?: number };

export interface Condition {
    minDay?: number;
    minSurvivors?: number;
    /** 这些 flag 都必须存在 */
    flags?: string[];
    /** 这些 flag 都不能存在 */
    notFlags?: string[];
    /** 这些幸存者必须在营地里 */
    hasSurvivors?: string[];
}

export interface EventOutcomeDef {
    weight: number;
    text: string;
    effects: Effect[];
}

export interface EventChoiceDef {
    text: string;
    /** 选这个选项要先付出的资源 */
    cost?: ResourceBag;
    outcomes: EventOutcomeDef[];
}

export interface GameEventDef {
    id: string;
    title: string;
    text: string;
    /** 随机抽取权重；0 = 只能由剧情或其他事件触发 */
    weight: number;
    /** 只会发生一次 */
    once?: boolean;
    conditions?: Condition;
    choices: EventChoiceDef[];
}

export type Objective =
    | { type: 'buildingLevel'; building: string; level: number; text: string }
    | { type: 'resource'; resource: ResourceId; amount: number; text: string }
    | { type: 'flag'; flag: string; text: string }
    | { type: 'survivors'; count: number; text: string }
    /** 统计数据达到 amount，比如击杀数、守夜胜利次数 */
    | { type: 'stat'; stat: string; amount: number; text: string }
    /** 营地存活到第 day 天 */
    | { type: 'day'; day: number; text: string };

export interface EpisodeDef {
    id: string;
    season: number;
    episode: number;
    title: string;
    /** 本集开始时触发的剧情事件 */
    startEvent?: string;
    objectives: Objective[];
    rewards?: ResourceBag;
    /** 本集完成时触发的剧情事件（悬念结尾） */
    endEvent?: string;
}

export interface LocationDef {
    id: string;
    name: string;
    description: string;
    /** 往返需要的分钟数 */
    durationMinutes: number;
    /** 满足条件才会出现在地图上 */
    conditions?: Condition;
    enemies: UnitSetup[];
    /** 战斗时间上限（秒） */
    timeLimit: number;
    /** 打赢后的战利品 */
    loot: ResourceBag;
    /** 第一次打赢时记下的剧情标记 */
    firstClearFlag?: string;
    /** 第一次打赢时触发的事件 */
    firstClearEvent?: string;
}

export interface RaidDef {
    id: string;
    name: string;
    /** 满足条件的尸潮里，取列表中最后一个（越往后越难） */
    conditions?: Condition;
    enemies: UnitSetup[];
    /** 撑过多少秒就算守住 */
    timeLimit: number;
    reward: ResourceBag;
}

export interface SeasonDef {
    id: string;
    name: string;
    icon: string;
    /** 这个季节持续几天 */
    days: number;
    /** 食物产量倍率 */
    foodProduction: number;
    /** 每个幸存者每分钟烧掉多少木材取暖 */
    heatingWoodPerSurvivorPerMinute: number;
    /** 食物腐烂速度倍率（冬天冷，坏得慢） */
    spoilMultiplier: number;
    description: string;
    /** 进入这个季节时触发的事件 */
    startEvent?: string;
}

export interface ItemDef {
    id: string;
    name: string;
    icon: string;
    description: string;
    /** 需要的工坊等级 */
    workshopLevel: number;
    cost: ResourceBag;
    /** 战斗中携带者获得的技能（skills.json），用掉才消耗 */
    battleSkill: string;
}

export interface BountyDef {
    id: string;
    title: string;
    description: string;
    /** 需要的猎人等级（hunterRanks 的下标） */
    rank: number;
    conditions?: Condition;
    /** 接取之后，这个统计值再增加 amount 就算完成 */
    goal: { stat: string; amount: number };
    reward: ResourceBag;
    xp: number;
}

export interface AchievementDef {
    id: string;
    name: string;
    description: string;
    icon: string;
    /** 隐藏成就：解锁前只显示“？？？” */
    hidden?: boolean;
    goal: Objective;
    reward: ResourceBag;
}

export interface GameConfig {
    balance: BalanceDef;
    resources: ResourceDef[];
    buildings: BuildingDef[];
    survivors: SurvivorDef[];
    events: GameEventDef[];
    episodes: EpisodeDef[];
    locations: LocationDef[];
    raids: RaidDef[];
    seasons: SeasonDef[];
    items: ItemDef[];
    bounties: BountyDef[];
    achievements: AchievementDef[];
    units: UnitDef[];
    skills: SkillDef[];
    statuses: StatusDef[];
}

// ---------- 存档状态 ----------

export interface BuildingState {
    id: string;
    level: number;
    /** 正在升级时，完成的时间戳（毫秒）；否则为 null */
    upgradeEndsAt: number | null;
}

export interface SurvivorState {
    id: string;
    /** 0～100 */
    mood: number;
    injured: boolean;
    /** 受伤后自然痊愈的时间戳；没受伤为 null */
    recoverAt: number | null;
    /** 分配到的建筑 id；null = 空闲 */
    assignment: string | null;
}

export interface LogEntry {
    at: number;
    text: string;
}

export interface ExpeditionState {
    id: number;
    location: string;
    squad: string[];
    startedAt: number;
    returnsAt: number;
    seed: number;
}

/** 战报：保存了完整的战斗参数，界面可以用同一个种子重放整场战斗 */
export interface BattleReport {
    id: number;
    kind: 'expedition' | 'raid';
    title: string;
    at: number;
    result: BattleResult;
    setup: BattleSetup;
    loot: ResourceBag;
    lost: ResourceBag;
    injured: string[];
    summary: string;
}

export interface GameState {
    version: number;
    createdAt: number;
    lastTickAt: number;
    resources: Record<ResourceId, number>;
    buildings: Record<string, BuildingState>;
    survivors: SurvivorState[];
    flags: string[];
    seenEvents: string[];
    /** 等待玩家处理的事件队列（第一个是当前事件） */
    eventQueue: string[];
    nextRandomEventAt: number;
    /** 当前剧情集在 episodes 里的下标；等于 episodes.length 表示主线已全部完成 */
    episodeIndex: number;
    rngState: number;
    log: LogEntry[];
    expeditions: ExpeditionState[];
    nextRaidAt: number;
    reports: BattleReport[];
    /** 自增 id，给远征和战报用 */
    nextId: number;
    /** 累计统计：击杀数、胜利次数等，成就和悬赏都读这里 */
    stats: Record<string, number>;
    achievements: { id: string; at: number }[];
    /** 工坊做出来的物品库存 */
    items: Record<string, number>;
    bounties: { active: { id: string; baseline: number }[]; completed: string[] };
    hunterXp: number;
    /** 已经发生过几次尸潮（用来算血月夜） */
    raidCount: number;
    /** 上一次结算时的季节，用来发现换季 */
    seasonId: string;
}

export type ActionResult = { ok: true; message?: string } | { ok: false; reason: string };
