// 游戏核心类型定义。
// core/ 目录下的代码不依赖 Cocos（不 import 'cc'），可以直接在 Node 里跑单元测试。

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
    | { type: 'triggerEvent'; event: string };

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
    | { type: 'survivors'; count: number; text: string };

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

export interface GameConfig {
    balance: BalanceDef;
    resources: ResourceDef[];
    buildings: BuildingDef[];
    survivors: SurvivorDef[];
    events: GameEventDef[];
    episodes: EpisodeDef[];
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
    /** 分配到的建筑 id；null = 空闲 */
    assignment: string | null;
}

export interface LogEntry {
    at: number;
    text: string;
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
}

export type ActionResult = { ok: true; message?: string } | { ok: false; reason: string };
