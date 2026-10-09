// 战斗画面（俯视）：守夜时实时演出战斗，战报里的战斗也可以用它回放。
//
// 守夜（setup.camp）：中间是方形的营地围墙，四面各一个门，门里面是守门的人，中心是营地核心；
// 尸群从四面八方的墙外涌来。玩家可以
//   · 点一个人（场上的圆点，或者下面的名字），再点一个门 → 把他调去守那个门
//   · 没选人时直接点门 → 花木材修这个门（每晚有次数限制）
// 探索战斗没有营地，就是一片空地，左边是小队、右边是敌人。
// 每个角色是一个圆点：幸存者按人分颜色，普通丧尸是紫色小点，特殊的丧尸是粉色大点。
// 远程攻击画一条细线，受击闪红，倒下淡出；门和营地核心头上有血条。

import { Color, EventTouch, Graphics, Label, Node, UITransform, Vec3 } from 'cc';
import { Battle, BattleSetup, waveTimes } from '../core/battle/Battle';
import { campBounds, campCenter, gateNormal, gateOpen, Point } from '../core/battle/geometry';
import { BattleUnit } from '../core/battle/types';
import { battleRegistry, CORE_UNIT, GATE_NAMES } from '../core/combat';
import { parseFamiliarTag } from '../core/familiar';
import { LiveRaid } from '../core/liveRaid';
import { survivorName } from '../core/roster';
import { BattleReport, GameConfig } from '../core/types';
import { sfx } from '../platform/Audio';
import { addLabel, COLORS, drawPanel, floatText, hexColor, makeNode, setLabelText, UIButton } from './widgets';

const WIDTH = 680;
/** 战场：正方形，中心在屏幕上的位置 */
const FIELD_SIZE = 680;
const FIELD_Y = 150;
/** 守夜时视野的半径（格）：围墙半边 6 格，尸群从更远的地方走进画面 */
const CAMP_VIEW_MARGIN = 5;
/** 营地里的建筑在战斗画面上画成地图上大小的几成（太大会显得人和丧尸很小） */
const BUILDING_DRAW = 0.6;
/** 同时最多几个飘字，避免尸群一多卡顿 */
const MAX_FLOATS = 12;
const FIELD_BG = hexColor('#141a1c');
const GROUND = hexColor('#1b2326');
const WALL_COLOR = hexColor('#3a4a58');
const WALL_EDGE = hexColor('#6a7e8e');
const GATE_COLOR = hexColor('#7a5a34');
const GATE_EDGE = hexColor('#c09a5a');
const CORE_COLOR = hexColor('#8a6a3a');
const ZOMBIE_COLOR = hexColor('#9a5ad0');
const SPECIAL_COLOR = hexColor('#e04a9a');
const RAIDER_COLOR = hexColor('#d05a4a');
const BEAST_COLOR = hexColor('#9a7a5a');
const FLASH_COLOR = new Color(255, 160, 160);
const SELECT_COLOR = hexColor('#ffe08a');
/** 幸存者的颜色：一人一色，方便认出谁在哪个门 */
const PEOPLE_COLORS = ['#5ac46a', '#e09a3a', '#e0d04a', '#4ac0d0', '#d8d8d8', '#5a8ae0', '#c07ad8', '#a0d05a'].map(hexColor);

export interface BattleViewOptions {
    title: string;
    /** 回放用：只看不能操作 */
    /** report 为空表示演示战斗（不是真的打过的），结束后只显示胜负 */
    replay?: { config: GameConfig; setup: BattleSetup; report: BattleReport | null };
    /** 亲手守夜 */
    live?: LiveRaid;
    /** 守夜打完、结算后调用（拿到战报）；回放点关闭时也调用 */
    onClose: (report: BattleReport | null) => void;
}

/** 远程攻击的弹道线 */
interface Shot {
    from: Point;
    to: Point;
    ttl: number;
    ally: boolean;
}

export class BattleView {
    readonly root: Node;
    private readonly battle: Battle;
    private readonly config: GameConfig;
    private readonly fieldNode: Node;
    private readonly field: Graphics;
    private readonly fx: Node;
    private readonly status: Label;
    private readonly hint: Label;
    private readonly controls: Node;
    private readonly speedButton: UIButton;
    private readonly skipButton: UIButton;
    private readonly gateButtons: (UIButton | null)[] = [];
    private readonly peopleButtons = new Map<number, UIButton>();
    private readonly gateLabels: (Label | null)[] = [];
    private speed = 1;
    private seenEvents = 0;
    /** 视野：世界坐标的中心和缩放（像素 / 格） */
    private readonly center: Point;
    private readonly scale: number;
    /** 选中的人（再点一个门就调过去） */
    private selected: number | null = null;
    /** 每个幸存者的颜色（按出场顺序） */
    private readonly colors = new Map<number, Color>();
    /** R73：敌人分几波（出场时间），已经提示到第几波，最后一波的预警放过没有 */
    private readonly waves: number[];
    private wavesAnnounced = 0;
    private finalWarned = false;
    /** 打击感：受击闪一下（uid → 剩余秒数）、震屏、弹道线、倒下的残影 */
    private readonly flashes = new Map<number, number>();
    private readonly shots: Shot[] = [];
    private readonly corpses: { p: Point; color: Color; r: number; ttl: number }[] = [];
    private shakeTime = 0;
    private shakePower = 0;
    private floats = 0;
    private finished = false;

    constructor(
        parent: Node,
        private readonly opts: BattleViewOptions,
    ) {
        this.config = opts.live ? opts.live.config : opts.replay!.config;
        this.battle = opts.live ? opts.live.battle : new Battle(battleRegistry(this.config), opts.replay!.setup);
        this.waves = waveTimes(this.battle.setup);
        this.root = makeNode('BattleView', parent, WIDTH, 1280);
        drawPanel(this.root.addComponent(Graphics), 720, 1280, COLORS.bg, 0);

        const title = addLabel(this.root, opts.title, 32, COLORS.accent, { width: WIDTH });
        title.node.setPosition(0, 600);
        this.status = addLabel(this.root, '', 24, COLORS.text, { width: WIDTH });
        this.status.node.setPosition(0, 560);
        this.hint = addLabel(this.root, '', 19, COLORS.dim, { width: WIDTH });
        this.hint.node.setPosition(0, 528);

        // 视野：守夜固定看整个营地；探索按双方的站位自动框住
        const camp = this.battle.setup.camp;
        if (camp) {
            // 和营地地图一样大的围墙，四周再留出尸群走过来的空地
            const r = campBounds(camp);
            this.center = campCenter(camp);
            this.scale = FIELD_SIZE / 2 / (Math.max(r.x2 - r.x1, r.y2 - r.y1) / 2 + CAMP_VIEW_MARGIN);
        } else {
            const xs = [...this.battle.setup.allies, ...this.battle.setup.enemies].map((s, i) => s.x ?? (i < this.battle.setup.allies.length ? -i * 0.8 : 10 + i * 0.8));
            const min = Math.min(-2, ...xs);
            const max = Math.max(12, ...xs);
            this.center = { x: (min + max) / 2, y: 0 };
            this.scale = FIELD_SIZE / (max - min + 6);
        }

        this.fieldNode = makeNode('Field', this.root, FIELD_SIZE, FIELD_SIZE);
        this.fieldNode.setPosition(0, FIELD_Y);
        this.field = this.fieldNode.addComponent(Graphics);
        this.fieldNode.on(Node.EventType.TOUCH_END, (e: EventTouch) => this.onFieldTap(e));
        this.fx = makeNode('Fx', this.root, FIELD_SIZE, FIELD_SIZE);
        this.fx.setPosition(0, FIELD_Y);
        if (camp) {
            // 营地里的建筑：和营地地图上同样的位置，中间写图标和名字
            for (const b of camp.buildings ?? []) {
                const sp = this.toScreen(b);
                addLabel(this.fx, `${b.icon}`, Math.max(16, Math.min(30, b.h * this.scale * BUILDING_DRAW * 0.45)), new Color(200, 210, 215, 150), { width: 80, height: 34 }).node.setPosition(sp.x, sp.y + 6);
                addLabel(this.fx, b.name, 14, new Color(170, 180, 185, 140), { width: Math.max(60, b.w * this.scale * BUILDING_DRAW), height: 20 }).node.setPosition(sp.x, sp.y - 18);
            }
            camp.gates.forEach((g, i) => {
                if (!gateOpen(camp, i)) {
                    this.gateLabels.push(null);
                    return;
                }
                const n = gateNormal(camp, g);
                const label = addLabel(this.fx, GATE_NAMES[i] ?? `门${i + 1}`, 18, COLORS.text, { width: 120, height: 24 });
                const s = this.toScreen({ x: g.x + n.x * 1.1, y: g.y + n.y * 1.1 });
                label.node.setPosition(s.x + (n.x ? n.x * 26 : 0), s.y + (n.y ? n.y * 6 : 0));
                this.gateLabels.push(label);
            });
        }

        if (!camp) {
            // 地点的招牌：图标 + 名字（标题里“回放：xxx”的地点名）
            const b = this.sceneBuilding();
            const top = this.toScreen({ x: (b.x1 + b.x2) / 2, y: b.y2 });
            const name = opts.title.replace(/^[^：]*：/, '');
            const icon = this.battle.setup.scene?.icon ?? '🏚️';
            addLabel(this.fx, `${icon} ${name}`, 20, COLORS.accent, { width: 360, height: 28 }).node.setPosition(top.x, top.y + 22);
        }
        this.controls = makeNode('Controls', this.root, WIDTH, 440);
        this.controls.setPosition(0, -420);
        const small = (WIDTH - 20) / 3;
        this.speedButton = new UIButton(this.controls, small, 56, () => {
            this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 4 : 1;
        });
        this.speedButton.node.setPosition(-small - 10, -180);
        this.skipButton = new UIButton(this.controls, small * 2 + 10, 56, () => this.skip());
        this.skipButton.node.setPosition(small / 2 + 5, -180);

        const live = opts.live;
        if (live && camp) {
            // 每个门一个按钮（只有开了的门）：选了人 = 调过去；没选人 = 修门
            const open = camp.gates.map((_, i) => i).filter((i) => gateOpen(camp, i));
            const w = (WIDTH - 10 * (open.length - 1)) / open.length;
            camp.gates.forEach((_, i) => {
                const k = open.indexOf(i);
                if (k < 0) {
                    this.gateButtons.push(null);
                    return;
                }
                const btn = new UIButton(this.controls, w, 64, () => this.onGate(i), 20);
                btn.node.setPosition(-WIDTH / 2 + w / 2 + k * (w + 10), 170);
                this.gateButtons.push(btn);
            });
            // 有手动技能的话交给自动释放（现在幸存者都没有技能，物品是自动用的）
            if (live.skillButtons().length > 0) live.setAuto(true);
        }
        this.refreshControls();
    }

    /** GameRoot.update 每帧调用 */
    update(dt: number): void {
        for (const [uid, t] of this.flashes) {
            if (t - dt <= 0) this.flashes.delete(uid);
            else this.flashes.set(uid, t - dt);
        }
        for (const s of this.shots) s.ttl -= dt;
        for (const c of this.corpses) c.ttl -= dt;
        this.updateShake(dt);
        if (!this.finished) {
            this.battle.advance(dt * this.speed);
            if (this.battle.result !== 'ongoing') this.finish();
        }
        this.showNewEvents();
        this.drawField();
        this.announceWaves();
        this.refreshControls();
    }

    destroy(): void {
        this.root.destroy();
    }

    // ---------- 坐标 ----------

    /**
     * 角色画在哪：守夜就是战斗里的位置；探索战斗的逻辑还是一条线（数值按这个校准过），
     * 画的时候按 uid 上下错开几排，看起来是一群人对一群敌人。
     */
    private pos(u: BattleUnit): Point {
        if (this.battle.setup.camp) return { x: u.x, y: u.y };
        return { x: u.x, y: u.y + ((u.uid % 5) - 2) * 0.7 };
    }

    private toScreen(p: Point): Point {
        return { x: (p.x - this.center.x) * this.scale, y: (p.y - this.center.y) * this.scale };
    }

    private toWorld(x: number, y: number): Point {
        return { x: x / this.scale + this.center.x, y: y / this.scale + this.center.y };
    }

    private radiusOf(u: BattleUnit): number {
        // 人和丧尸画大一点（看得清），建筑画小一点（BUILDING_DRAW）
        const base = u.side === 'ally' ? 0.62 : this.isSpecial(u) ? 0.62 : 0.44;
        const min = u.side === 'ally' ? 12 : 8;
        return Math.max(min, base * this.scale * Math.min(1.6, u.def.appearance.scale));
    }

    /** 特殊的敌人（不是一群里的小丧尸）：画成粉色大点 */
    private isSpecial(u: BattleUnit): boolean {
        const swarm = this.config.balance.camp?.swarm?.units ?? [];
        return u.def.faction === 'zombie' && (!swarm.includes(u.def.id) || !!parseFamiliarTag(u.tag));
    }

    private colorOf(u: BattleUnit): Color {
        if (u.side === 'ally') {
            let c = this.colors.get(u.uid);
            if (!c) {
                c = PEOPLE_COLORS[this.colors.size % PEOPLE_COLORS.length];
                this.colors.set(u.uid, c);
            }
            return c;
        }
        if (u.def.faction === 'raider') return RAIDER_COLOR;
        if (u.def.faction === 'beast') return BEAST_COLOR;
        return this.isSpecial(u) ? SPECIAL_COLOR : ZOMBIE_COLOR;
    }

    private nameOf(u: BattleUnit): string {
        const live = this.opts.live;
        if (live && u.tag && live.state.survivors.some((s) => s.id === u.tag)) return survivorName(live.config, live.state, u.tag);
        return u.def.name;
    }

    // ---------- 画战场 ----------

    private drawField(): void {
        const g = this.field;
        g.clear();
        const half = FIELD_SIZE / 2;
        drawPanel(g, FIELD_SIZE, FIELD_SIZE, FIELD_BG, 10);
        const camp = this.battle.setup.camp;
        if (camp) this.drawCamp(g);
        else this.drawScene(g);
        this.drawWaveBar(g);

        // 倒下的残影
        for (const c of this.corpses) {
            if (c.ttl <= 0) continue;
            const s = this.toScreen(c.p);
            g.fillColor = new Color(c.color.r, c.color.g, c.color.b, Math.round(200 * Math.min(1, c.ttl / 0.6)));
            g.circle(s.x, s.y, c.r);
            g.fill();
        }
        // 弹道线
        for (const shot of this.shots) {
            if (shot.ttl <= 0) continue;
            const a = this.toScreen(shot.from);
            const b = this.toScreen(shot.to);
            g.strokeColor = shot.ally ? new Color(255, 240, 200, 220) : new Color(255, 120, 160, 200);
            g.lineWidth = 2;
            g.moveTo(a.x, a.y);
            g.lineTo(b.x, b.y);
            g.stroke();
        }
        // 角色：先画敌人，再画自己人（自己人在上面）
        const units = this.battle.units.filter((u) => u.alive && u.def.faction !== 'structure');
        units.sort((a, b) => Number(a.side === 'ally') - Number(b.side === 'ally'));
        for (const u of units) {
            const s = this.toScreen(this.pos(u));
            if (Math.abs(s.x) > half + 10 || Math.abs(s.y) > half + 10) continue;
            const r = this.radiusOf(u);
            g.fillColor = this.flashes.has(u.uid) ? FLASH_COLOR : this.colorOf(u);
            g.circle(s.x, s.y, r);
            g.fill();
            if (u.side === 'ally') {
                g.lineWidth = u.uid === this.selected ? 4 : 2;
                g.strokeColor = u.uid === this.selected ? SELECT_COLOR : new Color(20, 20, 20, 220);
                g.circle(s.x, s.y, r + (u.uid === this.selected ? 4 : 0));
                g.stroke();
            }
            if (u.statuses.some((st) => st.def.control?.stun || st.def.control?.root)) {
                g.strokeColor = COLORS.crit;
                g.lineWidth = 2;
                g.circle(s.x, s.y, r + 3);
                g.stroke();
            }
            if (u.hp < u.stats.maxHp && (u.side === 'ally' || this.isSpecial(u))) this.hpBar(g, s.x, s.y + r + 4, Math.max(18, r * 2.4), u);
        }
    }

    /** 探索地点的建筑（世界坐标）：敌人一开始都在里面，左边墙上开门，小队从左边的路上走过来 */
    private sceneBuilding(): { x1: number; x2: number; y1: number; y2: number } {
        const xs = this.battle.setup.enemies.map((s, i) => s.x ?? 10 + i * 0.8);
        const min = xs.length ? Math.min(...xs) : 10;
        const max = xs.length ? Math.max(...xs) : 14;
        return { x1: min - 1.4, x2: Math.max(min + 4, max + 1.4), y1: -2.6, y2: 2.6 };
    }

    /** 探索战斗：地面、通往建筑的路、地点的建筑（门口朝小队）、周围的废车和杂物 */
    private drawScene(g: Graphics): void {
        const half = FIELD_SIZE / 2;
        g.fillColor = hexColor('#1a2124');
        g.rect(-half + 8, -half + 8, FIELD_SIZE - 16, FIELD_SIZE - 16);
        g.fill();
        const b = this.sceneBuilding();
        // 路：从左边一直通到门口
        const roadTop = this.toScreen({ x: 0, y: 1.3 }).y;
        const roadBottom = this.toScreen({ x: 0, y: -1.3 }).y;
        const door = this.toScreen({ x: b.x1, y: 0 });
        g.fillColor = hexColor('#262c2e');
        g.rect(-half + 8, roadBottom, door.x + half - 8, roadTop - roadBottom);
        g.fill();
        g.fillColor = new Color(200, 190, 120, 90);
        for (let x = -half + 30; x < door.x - 20; x += 50) {
            g.rect(x, (roadTop + roadBottom) / 2 - 2, 24, 4);
            g.fill();
        }
        // 杂物：几辆废车、一些箱子（每次画都一样）
        for (let k = 0; k < 7; k++) {
            const p = this.toScreen({ x: -3 + ((k * 37) % 13) * 0.9, y: (k % 2 ? 1 : -1) * (2.2 + ((k * 11) % 5) * 0.5) });
            if (p.x > door.x - 30) continue;
            g.fillColor = k % 3 === 0 ? hexColor('#3a3430') : hexColor('#2e3a40');
            g.roundRect(p.x - 16, p.y - 8, k % 3 === 0 ? 24 : 34, k % 3 === 0 ? 18 : 16, 3);
            g.fill();
        }
        // 建筑：屋顶 + 外墙，左墙中间是门
        const lo = this.toScreen({ x: b.x1, y: b.y1 });
        const hi = this.toScreen({ x: b.x2, y: b.y2 });
        g.fillColor = hexColor('#232c30');
        g.rect(lo.x, lo.y, hi.x - lo.x, hi.y - lo.y);
        g.fill();
        // 屋里的地砖
        g.strokeColor = new Color(255, 255, 255, 12);
        g.lineWidth = 1;
        for (let x = lo.x + 30; x < hi.x; x += 30) {
            g.moveTo(x, lo.y);
            g.lineTo(x, hi.y);
        }
        g.stroke();
        const t = Math.max(6, this.scale * 0.3);
        const gap = this.scale * 1.3;
        g.fillColor = WALL_COLOR;
        g.rect(lo.x - t / 2, hi.y - t / 2, hi.x - lo.x + t, t);
        g.rect(lo.x - t / 2, lo.y - t / 2, hi.x - lo.x + t, t);
        g.rect(hi.x - t / 2, lo.y, t, hi.y - lo.y);
        g.rect(lo.x - t / 2, lo.y, t, door.y - gap - lo.y);
        g.rect(lo.x - t / 2, door.y + gap, t, hi.y - door.y - gap);
        g.fill();
        // 屋里的货架 / 隔断（挡不住人，只是看起来像个地方）
        g.fillColor = hexColor('#2f3b40');
        for (let k = 0; k < 4; k++) {
            const x = lo.x + (hi.x - lo.x) * (0.3 + k * 0.17);
            g.rect(x, lo.y + (k % 2 ? (hi.y - lo.y) * 0.62 : 12), 10, (hi.y - lo.y) * 0.26);
            g.fill();
        }
    }

    /** 营地：地面、围墙、四个门、中间的营地核心 */
    private drawCamp(g: Graphics): void {
        const camp = this.battle.setup.camp!;
        const r = campBounds(camp);
        const lo = this.toScreen({ x: r.x1, y: r.y1 });
        const hi = this.toScreen({ x: r.x2, y: r.y2 });
        const t = Math.max(8, this.scale * 0.45);
        g.fillColor = GROUND;
        g.rect(lo.x, lo.y, hi.x - lo.x, hi.y - lo.y);
        g.fill();
        // 营地里的建筑（只是画出来，不挡路）
        for (const b of camp.buildings ?? []) {
            const c = this.toScreen(b);
            const w = b.w * this.scale * BUILDING_DRAW;
            const h = b.h * this.scale * BUILDING_DRAW;
            g.fillColor = hexColor('#26323a');
            g.roundRect(c.x - w / 2, c.y - h / 2, w, h, 6);
            g.fill();
            g.strokeColor = hexColor('#4a5e6a');
            g.lineWidth = 2;
            g.roundRect(c.x - w / 2, c.y - h / 2, w, h, 6);
            g.stroke();
        }
        // 围墙：四条边，门的位置留出缺口
        const gap = 1.1 * this.scale;
        const segs: [number, number, number, number][] = [];
        for (const [gi, gate] of camp.gates.entries()) {
            const gs = this.toScreen(gate);
            // 没开门的那面是一整堵墙
            const g0 = gateOpen(camp, gi) ? gap : 0;
            const horizontal = gateNormal(camp, gate).y !== 0;
            const fixed = horizontal ? gs.y : gs.x;
            const along = horizontal ? gs.x : gs.y;
            const from = horizontal ? lo.x : lo.y;
            const to = horizontal ? hi.x : hi.y;
            for (const [a, b] of [[from - t / 2, along - g0], [along + g0, to + t / 2]] as [number, number][]) {
                if (horizontal) segs.push([a, fixed - t / 2, b - a, t]);
                else segs.push([fixed - t / 2, a, t, b - a]);
            }
        }
        for (const [x, y, w, hh] of segs) {
            g.fillColor = WALL_COLOR;
            g.rect(x, y, w, hh);
            g.fill();
            g.strokeColor = WALL_EDGE;
            g.lineWidth = 1;
            g.rect(x, y, w, hh);
            g.stroke();
        }
        // 门：木门，越破颜色越暗；被打破了画成一地碎木头
        camp.gates.forEach((gate, i) => {
            if (!gateOpen(camp, i)) return;
            const unit = this.battle.gateUnit(i);
            const s = this.toScreen(gate);
            const horizontal = gateNormal(camp, gate).y !== 0;
            const w = horizontal ? gap * 2 : t + 4;
            const hh = horizontal ? t + 4 : gap * 2;
            if (unit?.alive) {
                const ratio = unit.hp / unit.stats.maxHp;
                const flash = this.flashes.has(unit.uid);
                g.fillColor = flash ? FLASH_COLOR : new Color(Math.round(GATE_COLOR.r * (0.5 + ratio / 2)), Math.round(GATE_COLOR.g * (0.5 + ratio / 2)), Math.round(GATE_COLOR.b * (0.5 + ratio / 2)));
                g.rect(s.x - w / 2, s.y - hh / 2, w, hh);
                g.fill();
                g.strokeColor = this.selected !== null ? SELECT_COLOR : GATE_EDGE;
                g.lineWidth = this.selected !== null ? 3 : 2;
                g.rect(s.x - w / 2, s.y - hh / 2, w, hh);
                g.stroke();
                const n = gateNormal(camp, gate);
                this.hpBar(g, s.x - (horizontal ? 0 : n.x * (t + 12)), s.y + (horizontal ? -n.y * (t + 8) : 0), horizontal ? w : 36, unit);
            } else {
                g.fillColor = hexColor('#4a3a28');
                for (let k = 0; k < 5; k++) {
                    const ox = ((k * 37) % 9) - 4;
                    const oy = ((k * 23) % 7) - 3;
                    g.rect(s.x + ox * (w / 10) - 3, s.y + oy * (hh / 8) - 3, 7, 5);
                    g.fill();
                }
            }
        });
        // 营地核心
        const core = this.battle.units.find((u) => u.tag === CORE_UNIT);
        if (core) {
            const size = this.scale * 1.4;
            const c = this.toScreen(core);
            g.fillColor = core.alive ? (this.flashes.has(core.uid) ? FLASH_COLOR : CORE_COLOR) : hexColor('#3a2a1a');
            g.roundRect(c.x - size / 2, c.y - size / 2, size, size, 6);
            g.fill();
            g.strokeColor = GATE_EDGE;
            g.lineWidth = 2;
            g.roundRect(c.x - size / 2, c.y - size / 2, size, size, 6);
            g.stroke();
            if (core.alive) this.hpBar(g, c.x, c.y + size / 2 + 6, size * 1.4, core);
        }
    }

    private hpBar(g: Graphics, x: number, y: number, width: number, u: BattleUnit): void {
        const ratio = Math.max(0, u.hp / u.stats.maxHp);
        g.fillColor = hexColor('#111111');
        g.rect(x - width / 2, y, width, 5);
        g.fill();
        g.fillColor = u.side === 'ally' ? (ratio > 0.3 ? COLORS.win : COLORS.lose) : hexColor('#c05050');
        g.rect(x - width / 2, y, width * ratio, 5);
        g.fill();
    }

    // ---------- R73 波次 ----------

    /** 现在是第几波（已经出场的波数） */
    private currentWave(): number {
        return this.waves.filter((t) => t <= this.battle.time + 1e-6).length;
    }

    private announceWaves(): void {
        if (this.finished || this.waves.length <= 1) return;
        const last = this.waves[this.waves.length - 1];
        if (!this.finalWarned && this.battle.time >= last - 2.5) {
            this.finalWarned = true;
            this.banner('⚠️ 一大波尸群正在接近！', COLORS.lose, 40);
            sfx('alarm');
            this.shake(0.5, 6);
        }
        const wave = this.currentWave();
        if (wave > this.wavesAnnounced) {
            if (wave > 1 && wave < this.waves.length) this.banner(`🧟 第 ${wave} 波！`, COLORS.accent, 32);
            else if (wave === this.waves.length) this.banner('🧟 最后一波！', COLORS.lose, 36);
            this.wavesAnnounced = wave;
        }
    }

    /** 战场中间一行大字（不受飘字数量限制） */
    private banner(text: string, color: Color, size: number): void {
        floatText(this.fx, text, 0, 40, color, size, 40, 1.8);
    }

    /** 波次进度条：画在战场顶上，刻度是每一波的出场时间，最后一波标红 */
    private drawWaveBar(g: Graphics): void {
        if (this.waves.length <= 1) return;
        const limit = this.battle.setup.timeLimit;
        const w = FIELD_SIZE - 60;
        const left = -w / 2;
        const y = FIELD_SIZE / 2 - 18;
        g.fillColor = new Color(0, 0, 0, 150);
        g.roundRect(left - 4, y - 4, w + 8, 14, 6);
        g.fill();
        g.fillColor = hexColor('#b04040');
        g.rect(left, y, w * Math.min(1, this.battle.time / limit), 6);
        g.fill();
        this.waves.forEach((t, i) => {
            const final = i === this.waves.length - 1;
            g.fillColor = final ? COLORS.lose : t <= this.battle.time ? COLORS.dim : COLORS.text;
            const x = left + w * Math.min(1, t / limit);
            g.rect(x - (final ? 3 : 2), y - 4, final ? 6 : 4, 14);
            g.fill();
        });
    }

    // ---------- 打击感 ----------

    private shake(time: number, power: number): void {
        this.shakeTime = Math.max(this.shakeTime, time);
        this.shakePower = Math.max(this.shakePower, power);
    }

    private updateShake(dt: number): void {
        if (this.shakeTime <= 0) return;
        this.shakeTime -= dt;
        if (this.shakeTime <= 0) {
            this.shakeTime = 0;
            this.shakePower = 0;
            this.root.setPosition(0, 0);
            return;
        }
        const p = this.shakePower;
        this.root.setPosition((Math.random() * 2 - 1) * p, (Math.random() * 2 - 1) * p);
    }

    // ---------- 事件 → 飘字、音效 ----------

    private showNewEvents(): void {
        const events = this.battle.events;
        for (; this.seenEvents < events.length; this.seenEvents++) {
            const e = events[this.seenEvents];
            if (e.type === 'attack') {
                const src = this.battle.getUnit(e.source);
                const tgt = this.battle.getUnit(e.target);
                if (src && tgt && src.stats.attackRange > 1.5 && this.shots.length < 40) this.shots.push({ from: this.pos(src), to: this.pos(tgt), ttl: 0.12, ally: src.side === 'ally' });
            } else if (e.type === 'damage') {
                const target = this.battle.getUnit(e.target);
                if (!target || e.amount < 1) continue;
                sfx(e.crit ? 'crit' : 'hit');
                this.flashes.set(target.uid, 0.12);
                if (target.gate !== undefined && e.amount >= target.stats.maxHp * 0.04) this.shake(0.12, 3);
                // 尸群一多飘字太乱：只飘自己人受的伤、暴击和建筑受的大伤害
                if (target.side === 'ally' && target.def.faction !== 'structure') this.floatAt(`-${Math.round(e.amount)}`, target, COLORS.lose, 18);
                else if (e.crit) this.floatAt(`暴击 ${Math.round(e.amount)}`, target, COLORS.crit, 20);
            } else if (e.type === 'heal') {
                const target = this.battle.getUnit(e.target);
                if (target) {
                    sfx(target.def.faction === 'structure' ? 'repair' : 'heal');
                    this.floatAt(`+${Math.round(e.amount)}`, target, COLORS.heal, 20);
                }
            } else if (e.type === 'skill') {
                const source = this.battle.getUnit(e.source);
                const def = this.battle.registry.skill(e.skill);
                if (!source) continue;
                if (source.side === 'ally') {
                    sfx('skill');
                    if (source.gate !== undefined) this.shake(0.3, 7);
                    this.floatAt(`${def.icon ?? '✨'}${def.name}`, source, COLORS.accent, 22);
                } else if (def.icon) this.floatAt(`${def.icon}${def.name}`, source, COLORS.lose, 20);
            } else if (e.type === 'death') {
                const unit = this.battle.getUnit(e.unit);
                if (!unit) continue;
                if (unit.gate !== undefined) {
                    this.banner(`💥 ${GATE_NAMES[unit.gate] ?? '门'}被打破了！`, COLORS.lose, 34);
                    sfx('alarm');
                    this.shake(0.4, 8);
                    continue;
                }
                if (unit.def.faction === 'structure') continue;
                sfx(unit.side === 'ally' ? 'ally_down' : 'zombie_die');
                this.corpses.push({ p: this.pos(unit), color: this.colorOf(unit), r: this.radiusOf(unit), ttl: 0.6 });
                if (this.corpses.length > 60) this.corpses.splice(0, this.corpses.length - 60);
                if (unit.side === 'ally') {
                    this.shake(0.3, 8);
                    this.floatAt(`${this.nameOf(unit)}倒下了！`, unit, COLORS.lose, 24);
                    if (this.selected === unit.uid) this.selected = null;
                }
            } else if (e.type === 'leap') {
                const unit = this.battle.getUnit(e.unit);
                if (unit) this.floatAt(`🤸 ${unit.def.name}跳过了围墙！`, unit, COLORS.lose, 22);
                sfx('alarm');
            } else if (e.type === 'burrow') {
                const unit = this.battle.getUnit(e.unit);
                if (unit) this.floatAt(`🕳️ ${unit.def.name}钻进了营地！`, unit, COLORS.lose, 22);
                this.shake(0.3, 6);
                sfx('alarm');
            } else if (e.type === 'spawn') {
                const unit = this.battle.getUnit(e.unit);
                const familiar = parseFamiliarTag(unit?.tag);
                if (unit && familiar) this.floatAt(`那是……${familiar.name}？`, unit, hexColor('#d090ff'), 24);
            }
        }
    }

    private floatAt(text: string, p: Point | BattleUnit, color: Color, size: number): void {
        if (this.floats >= MAX_FLOATS) return;
        this.floats++;
        const s = this.toScreen('uid' in p ? this.pos(p) : p);
        const half = FIELD_SIZE / 2 - 40;
        floatText(this.fx, text, Math.max(-half, Math.min(half, s.x)), Math.max(-half, Math.min(half, s.y + 16)), color, size, 50, 0.9);
        setTimeout(() => this.floats--, 900);
    }

    // ---------- 操作 ----------

    /** 点战场：点到人 = 选中；选了人再点门附近 = 调过去；没选人点门 = 修门 */
    private onFieldTap(e: EventTouch): void {
        const live = this.opts.live;
        const camp = this.battle.setup.camp;
        if (!live || !camp || this.finished) return;
        const ui = e.getUILocation();
        const local = this.fieldNode.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
        const p = this.toWorld(local.x, local.y);
        const person = live
            .defenders()
            .map((u) => ({ u, d: Math.hypot(u.x - p.x, u.y - p.y) }))
            .sort((a, b) => a.d - b.d)[0];
        if (person && person.d * this.scale <= 26) {
            this.selected = this.selected === person.u.uid ? null : person.u.uid;
            sfx('click');
            return;
        }
        const gate = camp.gates
            .map((g, i) => ({ i, d: gateOpen(camp, i) ? Math.hypot(g.x - p.x, g.y - p.y) : Infinity }))
            .sort((a, b) => a.d - b.d)[0];
        if (gate && gate.d <= 2.2) this.onGate(gate.i);
        else this.selected = null;
    }

    private onGate(gate: number): void {
        const live = this.opts.live;
        const camp = this.battle.setup.camp;
        if (!live || !camp || this.finished) return;
        const g = camp.gates[gate];
        if (this.selected !== null) {
            const who = this.battle.getUnit(this.selected);
            const error = live.assign(this.selected, gate);
            if (error) this.floatAt(error, g, COLORS.lose, 22);
            else if (who) this.floatAt(`${this.nameOf(who)} → ${GATE_NAMES[gate]}`, g, COLORS.accent, 22);
            this.selected = null;
            return;
        }
        const error = live.repair(gate);
        if (error) this.floatAt(error, g, COLORS.lose, 22);
        else this.floatAt('🪵 门加固了！', g, COLORS.heal, 24);
    }

    private refreshControls(): void {
        const b = this.battle;
        const left = Math.max(0, Math.ceil(b.setup.timeLimit - b.time));
        const goal = b.setup.timeoutResult === 'win' ? `再坚持 ${left} 秒` : `剩余 ${left} 秒`;
        const wave = this.waves.length > 1 ? `第 ${Math.max(1, this.currentWave())}/${this.waves.length} 波   ` : '';
        const core = b.units.find((u) => u.tag === CORE_UNIT);
        const coreText = core ? `营地 ${Math.max(0, Math.round((core.hp / core.stats.maxHp) * 100))}%` : '';
        setLabelText(this.status, this.finished ? '' : `${wave}${goal}   ${coreText}`, WIDTH, 24);

        this.speedButton.set(`速度 ×${this.speed}`, this.finished ? 'disabled' : 'normal');
        this.skipButton.set(this.opts.live ? '跳过（自动打完）' : '跳到结尾', this.finished ? 'disabled' : 'normal');
        const live = this.opts.live;
        const camp = b.setup.camp;
        if (!live || !camp) {
            setLabelText(this.hint, this.finished ? '' : this.opts.replay?.report ? '战斗回放' : '演示战斗', WIDTH, 19);
            return;
        }
        const selected = this.selected !== null ? b.getUnit(this.selected) : undefined;
        const uses = live.repairsLeft();
        setLabelText(
            this.hint,
            this.finished
                ? ''
                : selected
                  ? `已选中 ${this.nameOf(selected)}：点一个门，把他调过去`
                  : `点一个人再点门 = 调人守门；直接点门 = 花木材修门（还能修 ${uses} 次）`,
            WIDTH,
            19,
        );

        // 门的按钮：血量、几个人在守
        const defenders = live.defenders();
        camp.gates.forEach((_, i) => {
            const btn = this.gateButtons[i];
            if (!btn) return;
            const unit = b.gateUnit(i);
            const guards = defenders.filter((d) => d.post === i).length;
            const hp = unit?.alive ? `${Math.round((unit.hp / unit.stats.maxHp) * 100)}%` : '破了';
            const { wood } = live.repairCost(i);
            const attacked = b.units.some((u) => u.alive && u.side === 'enemy' && Math.hypot(u.x - camp.gates[i].x, u.y - camp.gates[i].y) < 4);
            let text = `${GATE_NAMES[i]} ${hp} 👥${guards}`;
            if (!selected && unit?.alive && unit.hp < unit.stats.maxHp && uses > 0) text = `${GATE_NAMES[i]} ${hp} 🪵${wood}`;
            const style = this.finished ? 'disabled' : selected ? 'highlight' : !unit?.alive ? 'danger' : attacked ? 'ready' : 'normal';
            btn.set(text, style);
            const label = this.gateLabels[i];
            if (label) setLabelText(label, `${GATE_NAMES[i]}${guards ? ` 👥${guards}` : ''}`, 120, 18);
        });

        // 守夜的人：一人一个按钮（颜色和场上的点一样），点一下选中
        const keep = new Set(defenders.map((u) => u.uid));
        for (const [uid, btn] of this.peopleButtons) {
            if (!keep.has(uid)) {
                btn.node.destroy();
                this.peopleButtons.delete(uid);
            }
        }
        const per = 4;
        const w = (WIDTH - 10 * (per - 1)) / per;
        defenders.slice(0, 8).forEach((u, i) => {
            let btn = this.peopleButtons.get(u.uid);
            if (!btn) {
                btn = new UIButton(this.controls, w, 52, () => {
                    this.selected = this.selected === u.uid ? null : u.uid;
                }, 19);
                this.peopleButtons.set(u.uid, btn);
            }
            btn.node.setPosition(-WIDTH / 2 + w / 2 + (i % per) * (w + 10), 90 - Math.floor(i / per) * 62);
            const hp = Math.round((u.hp / u.stats.maxHp) * 100);
            const gate = u.post !== undefined ? GATE_NAMES[u.post] : '';
            btn.set(`● ${this.nameOf(u)} ${gate} ${hp}%`, this.finished ? 'disabled' : this.selected === u.uid ? 'highlight' : 'normal');
            btn.label.color = this.colorOf(u);
        });
    }

    private skip(): void {
        if (this.finished) return;
        if (this.opts.live) this.opts.live.skip();
        else this.battle.runToEnd();
        this.finish();
    }

    // ---------- 结束 ----------

    private finish(): void {
        if (this.finished) return;
        this.finished = true;
        this.selected = null;
        const report = this.opts.live ? this.opts.live.finish() : this.opts.replay!.report;
        this.showResult(report);
    }

    private showResult(report: BattleReport | null): void {
        const win = (report?.result ?? this.battle.result) === 'win';
        sfx(win ? 'win' : 'lose');
        const panel = makeNode('Result', this.root, WIDTH, 420);
        panel.setPosition(0, 150);
        drawPanel(panel.addComponent(Graphics), WIDTH, 420, COLORS.panel, 16, win ? COLORS.win : COLORS.lose, 4);
        const kind = report?.kind ?? 'raid';
        const head = kind === 'raid' ? (win ? '🛡️ 守住了！' : '💀 尸群冲进了营地……') : win ? '🎒 探索成功！' : '🏃 小队撤退了';
        addLabel(panel, head, 44, win ? COLORS.win : COLORS.lose, { width: WIDTH - 40 }).node.setPosition(0, 150);
        const text = report?.summary ?? '这是演示战斗，不影响营地。';
        const summary = addLabel(panel, text, 24, COLORS.text, { width: WIDTH - 60, wrap: true, align: 'left' });
        summary.node.setPosition(0, 30);
        const close = new UIButton(panel, WIDTH - 80, 64, () => this.opts.onClose(this.opts.live ? report : null), 26);
        close.node.setPosition(0, -160);
        close.set(this.opts.live ? '回到营地' : '关闭', 'highlight');
    }
}
