// 战斗画面：守夜时实时演出战斗，玩家点技能、修路障；战报里的战斗也可以用它回放。
// 有美术图（assets/resources/sprites/units/<appearance.sprite>.png）就画图；
// 没有图的角色是一个彩色圆（颜色来自 units.json 的 appearance.color），中间写名字的第一个字。
// 头顶是血条；路障没图时是一堵棕色的墙。伤害、治疗会飘字。

import { Color, Graphics, Label, Node } from 'cc';
import { Battle, BattleSetup } from '../core/battle/Battle';
import { BattleUnit } from '../core/battle/types';
import { battleRegistry } from '../core/combat';
import { LiveRaid } from '../core/liveRaid';
import { BattleReport, GameConfig } from '../core/types';
import { addLabel, COLORS, drawPanel, floatText, hexColor, makeNode, UIButton } from './widgets';
import { addSprite, fitSize, getSprite, preloadSprites, SPRITE_DIRS } from './sprites';

const WIDTH = 680;
/** 战场的 x 范围（战斗里的格子）映射到屏幕 */
const FIELD_MIN = -4;
const FIELD_MAX = 16;
const FIELD_Y = 190;
const FIELD_HEIGHT = 340;
const UNIT_RADIUS = 20;
/** 地面上沿（相对战场中心）；角色的脚站在地面上，按“车道”前后错开 */
const GROUND_TOP = -FIELD_HEIGHT / 2 + 70;
/** 有图时角色的高度（再乘 appearance.scale） */
const SPRITE_HEIGHT = 120;
const BARRICADE_SIZE = { width: 90, height: 230 };
/** 同时最多几个飘字，避免尸群一多卡顿 */
const MAX_FLOATS = 14;
const FIELD_BG = new Color(38, 44, 38);

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

export class BattleView {
    readonly root: Node;
    private readonly battle: Battle;
    private readonly field: Graphics;
    /** 血条画在角色图片上面 */
    private readonly bars: Graphics;
    private readonly unitLabels = new Map<number, Label>();
    private readonly unitSprites = new Map<number, Node>();
    private readonly unitsLayer: Node;
    private readonly fx: Node;
    private readonly status: Label;
    private readonly hint: Label;
    private readonly skillButtons = new Map<number, UIButton>();
    private readonly controls: Node;
    private repairButton: UIButton | null = null;
    private autoButton: UIButton | null = null;
    private readonly speedButton: UIButton;
    private readonly skipButton: UIButton;
    private speed = 1;
    private seenEvents = 0;
    private floats = 0;
    private finished = false;

    constructor(
        parent: Node,
        private readonly opts: BattleViewOptions,
    ) {
        this.battle = opts.live ? opts.live.battle : new Battle(battleRegistry(opts.replay!.config), opts.replay!.setup);
        this.root = makeNode('BattleView', parent, WIDTH, 1280);

        const bg = this.root.addComponent(Graphics);
        drawPanel(bg, 720, 1280, COLORS.bg, 0);

        const title = addLabel(this.root, opts.title, 34, COLORS.accent, { width: WIDTH });
        title.node.setPosition(0, 590);
        this.status = addLabel(this.root, '', 24, COLORS.text, { width: WIDTH });
        this.status.node.setPosition(0, 548);
        this.hint = addLabel(this.root, '', 20, COLORS.dim, { width: WIDTH });
        this.hint.node.setPosition(0, 515);

        const fieldNode = makeNode('Field', this.root, WIDTH, FIELD_HEIGHT);
        fieldNode.setPosition(0, FIELD_Y);
        this.field = fieldNode.addComponent(Graphics);
        this.unitsLayer = makeNode('Units', this.root, WIDTH, FIELD_HEIGHT);
        this.unitsLayer.setPosition(0, FIELD_Y);
        const barsNode = makeNode('Bars', this.root, WIDTH, FIELD_HEIGHT);
        barsNode.setPosition(0, FIELD_Y);
        this.bars = barsNode.addComponent(Graphics);
        this.fx = makeNode('Fx', this.root, WIDTH, FIELD_HEIGHT);
        this.fx.setPosition(0, FIELD_Y);

        this.controls = makeNode('Controls', this.root, WIDTH, 500);
        this.controls.setPosition(0, -250);

        const small = (WIDTH - 20) / 3;
        this.speedButton = new UIButton(this.controls, small, 56, () => {
            this.speed = this.speed === 1 ? 2 : 1;
        });
        this.speedButton.node.setPosition(-small - 10, -210);
        this.skipButton = new UIButton(this.controls, small, 56, () => this.skip());
        this.skipButton.node.setPosition(small + 10, -210);

        if (opts.live) {
            this.autoButton = new UIButton(this.controls, small, 56, () => {
                opts.live!.setAuto(!this.battle.autoCastActive);
            });
            this.autoButton.node.setPosition(0, -210);
            this.repairButton = new UIButton(this.controls, WIDTH, 64, () => {
                const error = opts.live!.repair();
                const wall = opts.live!.barricade;
                if (error) this.floatAt(error, 0, 40, COLORS.lose, 24);
                else if (wall) this.floatAt('🪵 路障加固了！', this.toScreenX(wall.x), this.topY(wall), COLORS.heal, 26);
            });
            this.repairButton.node.setPosition(0, -130);
        }
        preloadSprites([...this.battle.setup.allies, ...this.battle.setup.enemies].map((u) => this.spritePath(u.unit)));
        this.refreshControls();
    }

    /** GameRoot.update 每帧调用 */
    update(dt: number): void {
        if (!this.finished) {
            this.battle.advance(dt * this.speed);
            if (this.battle.result !== 'ongoing') this.finish();
        }
        this.drawField();
        this.showNewEvents();
        this.refreshControls();
    }

    destroy(): void {
        this.root.destroy();
    }

    // ---------- 战场 ----------

    private toScreenX(x: number): number {
        return ((x - FIELD_MIN) / (FIELD_MAX - FIELD_MIN) - 0.5) * WIDTH;
    }

    private spritePath(unitId: string): string {
        const def = this.battle.registry.unit(unitId);
        return SPRITE_DIRS.units + def.appearance.sprite;
    }

    /** 脚踩的位置：一维战场上的单位会叠在一起，按 uid 错开三条“车道”（越往上越靠后） */
    private feetY(u: BattleUnit): number {
        if (u.tag === 'barricade') return GROUND_TOP - 20;
        return GROUND_TOP - 34 + (u.uid % 3) * 22;
    }

    /** 这个单位的图片（没有图返回 null） */
    private frameOf(u: BattleUnit) {
        return getSprite(SPRITE_DIRS.units + u.def.appearance.sprite) ?? null;
    }

    /** 头顶的高度（血条、飘字的位置） */
    private topY(u: BattleUnit): number {
        const feet = this.feetY(u);
        if (u.tag === 'barricade') return feet + BARRICADE_SIZE.height;
        return feet + (this.frameOf(u) ? SPRITE_HEIGHT : UNIT_RADIUS * 2) * u.def.appearance.scale;
    }

    /** 身体中间（飘字从这里出来） */
    private laneY(u: BattleUnit): number {
        return (this.feetY(u) + this.topY(u)) / 2;
    }

    private drawField(): void {
        const g = this.field;
        const bars = this.bars;
        g.clear();
        bars.clear();
        drawPanel(g, WIDTH, FIELD_HEIGHT, FIELD_BG, 12);
        // 地面
        g.fillColor = hexColor('#3a3228');
        g.rect(-WIDTH / 2, -FIELD_HEIGHT / 2, WIDTH, GROUND_TOP + FIELD_HEIGHT / 2);
        g.fill();

        const alive = new Set<number>();
        const withSprite: BattleUnit[] = [];
        for (const u of this.battle.units) {
            if (!u.alive) continue;
            alive.add(u.uid);
            const x = this.toScreenX(u.x);
            const feet = this.feetY(u);
            const scale = u.def.appearance.scale;
            const frame = this.frameOf(u);
            if (frame) {
                withSprite.push(u);
                let node = this.unitSprites.get(u.uid);
                if (!node) {
                    const box = u.tag === 'barricade' ? BARRICADE_SIZE : { width: SPRITE_HEIGHT * scale, height: SPRITE_HEIGHT * scale };
                    const size = fitSize(frame, box.width, box.height);
                    node = addSprite(this.unitsLayer, frame, size.width, size.height);
                    this.unitSprites.set(u.uid, node);
                    this.unitLabels.get(u.uid)?.node.destroy();
                    this.unitLabels.delete(u.uid);
                }
                const h = u.tag === 'barricade' ? BARRICADE_SIZE.height : SPRITE_HEIGHT * scale;
                node.setPosition(x, feet + h / 2);
            } else if (u.tag === 'barricade') {
                g.fillColor = hexColor(u.def.appearance.color);
                g.roundRect(x - 14, feet, 28, BARRICADE_SIZE.height, 6);
                g.fill();
                this.unitLabel(u).node.setPosition(x, feet + BARRICADE_SIZE.height / 2);
            } else {
                const r = UNIT_RADIUS * scale;
                const cy = feet + r;
                g.fillColor = hexColor(u.def.appearance.color);
                g.circle(x, cy, r);
                g.fill();
                if (u.side === 'ally') {
                    g.lineWidth = 3;
                    g.strokeColor = COLORS.text;
                    g.circle(x, cy, r);
                    g.stroke();
                }
                this.unitLabel(u).node.setPosition(x, cy);
            }
            const top = this.topY(u);
            if (u.statuses.some((s) => s.def.control?.stun)) {
                bars.strokeColor = COLORS.crit;
                bars.lineWidth = 3;
                bars.circle(x, top + 22, 9);
                bars.stroke();
            }
            this.hpBar(bars, x, top + 6, u.tag === 'barricade' ? 90 : 44 * scale, u);
        }
        // 靠后车道的先画（被前面的挡住）
        withSprite
            .sort((a, b) => this.feetY(b) - this.feetY(a))
            .forEach((u, i) => this.unitSprites.get(u.uid)?.setSiblingIndex(i));
        // 倒下的角色收起来
        for (const [uid, label] of this.unitLabels) {
            if (!alive.has(uid)) {
                label.node.destroy();
                this.unitLabels.delete(uid);
            }
        }
        for (const [uid, node] of this.unitSprites) {
            if (!alive.has(uid)) {
                node.destroy();
                this.unitSprites.delete(uid);
            }
        }
    }

    private hpBar(g: Graphics, x: number, y: number, width: number, u: BattleUnit): void {
        const ratio = Math.max(0, u.hp / u.stats.maxHp);
        g.fillColor = hexColor('#111111');
        g.rect(x - width / 2, y, width, 7);
        g.fill();
        g.fillColor = u.side === 'ally' ? (ratio > 0.3 ? COLORS.win : COLORS.lose) : hexColor('#c05050');
        g.rect(x - width / 2, y, width * ratio, 7);
        g.fill();
    }

    private unitLabel(u: BattleUnit): Label {
        let label = this.unitLabels.get(u.uid);
        if (!label) {
            const text = u.tag === 'barricade' ? '路\n障' : u.def.name.slice(0, 1);
            label = addLabel(this.fx, text, u.tag === 'barricade' ? 22 : 20, COLORS.text, { width: 40, height: u.tag === 'barricade' ? 60 : 30 });
            this.unitLabels.set(u.uid, label);
        }
        return label;
    }

    /** 把新的战斗事件变成飘字 */
    private showNewEvents(): void {
        const events = this.battle.events;
        for (; this.seenEvents < events.length; this.seenEvents++) {
            const e = events[this.seenEvents];
            if (e.type === 'damage') {
                const target = this.battle.getUnit(e.target);
                if (!target || e.amount < 1) continue;
                const color = target.side === 'ally' ? COLORS.lose : e.crit ? COLORS.crit : COLORS.text;
                this.floatAt(`${e.crit ? '暴击 ' : ''}${Math.round(e.amount)}`, this.toScreenX(target.x), this.laneY(target) + 20, color, e.crit ? 28 : 22);
            } else if (e.type === 'heal') {
                const target = this.battle.getUnit(e.target);
                if (target) this.floatAt(`+${Math.round(e.amount)}`, this.toScreenX(target.x), this.laneY(target) + 20, COLORS.heal, 22);
            } else if (e.type === 'skill') {
                const source = this.battle.getUnit(e.source);
                const def = this.battle.registry.skill(e.skill);
                if (source && source.side === 'ally') this.floatAt(`${def.icon ?? '✨'}${def.name}`, this.toScreenX(source.x), this.laneY(source) + 50, COLORS.accent, 24);
            } else if (e.type === 'death') {
                const unit = this.battle.getUnit(e.unit);
                if (unit?.side === 'ally' && unit.tag !== 'barricade') this.floatAt(`${unit.def.name}倒下了！`, this.toScreenX(unit.x), this.topY(unit), COLORS.lose, 26);
            }
        }
    }

    private floatAt(text: string, x: number, y: number, color: Color, size: number): void {
        if (this.floats >= MAX_FLOATS) return;
        this.floats++;
        floatText(this.fx, text, x, y, color, size, 60, 0.9);
        setTimeout(() => this.floats--, 900);
    }

    // ---------- 操作按钮 ----------

    private refreshControls(): void {
        const b = this.battle;
        const left = Math.max(0, Math.ceil(b.setup.timeLimit - b.time));
        const wall = this.opts.live?.barricade ?? b.units.find((u) => u.tag === 'barricade');
        const wallText = wall ? `路障 ${Math.max(0, Math.round((wall.hp / wall.stats.maxHp) * 100))}%` : '';
        const goal = b.setup.timeoutResult === 'win' ? `再坚持 ${left} 秒` : `剩余 ${left} 秒`;
        this.status.string = this.finished ? '' : `${goal}   ${wallText}`;

        this.speedButton.set(`速度 ×${this.speed}`, this.finished ? 'disabled' : 'normal');
        this.skipButton.set(this.opts.live ? '跳过（自动打完）' : '跳到结尾', this.finished ? 'disabled' : 'normal');
        const live = this.opts.live;
        if (!live) {
            this.hint.string = this.finished ? '' : '战斗回放';
            return;
        }
        this.hint.string = this.finished ? '' : '技能好了就点！路障快撑不住时花木材修补';
        this.autoButton!.set(`自动技能：${b.autoCastActive ? '开' : '关'}`, this.finished ? 'disabled' : b.autoCastActive ? 'ready' : 'normal');

        const { hp, wood } = live.repairCost();
        const uses = live.repairsLeft();
        const needed = wall ? wall.hp < wall.stats.maxHp * 0.6 : false;
        const canRepair = !this.finished && uses > 0 && !!wall?.alive && live.state.resources.wood >= wood;
        this.repairButton!.set(`🪵 修补路障 +${hp}（木材 ${wood}，还能修 ${uses} 次）`, !canRepair ? 'disabled' : needed ? 'highlight' : 'normal');

        // 技能按钮：每个有主动技能、还活着的角色一个，两列排
        const buttons = live.skillButtons();
        const keep = new Set(buttons.map((x) => x.uid));
        for (const [uid, btn] of this.skillButtons) {
            if (!keep.has(uid)) {
                btn.node.destroy();
                this.skillButtons.delete(uid);
            }
        }
        const colWidth = (WIDTH - 10) / 2;
        buttons.forEach((sb, i) => {
            let btn = this.skillButtons.get(sb.uid);
            if (!btn) {
                btn = new UIButton(this.controls, colWidth, 72, () => {
                    const error = live.cast(sb.uid);
                    if (error) this.floatAt(error, 0, 40, COLORS.lose, 22);
                }, 22);
                this.skillButtons.set(sb.uid, btn);
            }
            btn.node.setPosition(i % 2 === 0 ? -colWidth / 2 - 5 : colWidth / 2 + 5, 180 - Math.floor(i / 2) * 82);
            const ready = sb.cooldown <= 0 && !sb.blocked && !this.finished;
            const text = `${sb.icon}${sb.unitName}·${sb.skillName}  ${ready ? '点我！' : sb.blocked ? '被控制' : `${Math.ceil(sb.cooldown)}秒`}`;
            btn.set(text, this.finished ? 'disabled' : ready ? 'ready' : 'disabled', ready || sb.maxCooldown <= 0 ? 0 : sb.cooldown / sb.maxCooldown);
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
        const report = this.opts.live ? this.opts.live.finish() : this.opts.replay!.report;
        this.showResult(report);
    }

    private showResult(report: BattleReport | null): void {
        const win = (report?.result ?? this.battle.result) === 'win';
        const panel = makeNode('Result', this.root, WIDTH, 420);
        panel.setPosition(0, 150);
        drawPanel(panel.addComponent(Graphics), WIDTH, 420, COLORS.panel, 16, win ? COLORS.win : COLORS.lose, 4);
        const kind = report?.kind ?? 'raid';
        const head = kind === 'raid' ? (win ? '🛡️ 守住了！' : '💀 路障被冲破了……') : win ? '🎒 探索成功！' : '🏃 小队撤退了';
        addLabel(panel, head, 44, win ? COLORS.win : COLORS.lose, { width: WIDTH - 40 }).node.setPosition(0, 150);
        const text = report?.summary ?? '这是演示战斗，不影响营地。';
        const summary = addLabel(panel, text, 24, COLORS.text, { width: WIDTH - 60, wrap: true, align: 'left' });
        summary.node.setPosition(0, 30);
        const close = new UIButton(panel, WIDTH - 80, 64, () => this.opts.onClose(this.opts.live ? report : null), 26);
        close.node.setPosition(0, -160);
        close.set(this.opts.live ? '回到营地' : '关闭', 'highlight');
    }
}
