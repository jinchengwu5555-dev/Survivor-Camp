// 原型阶段的调试界面：全部用代码生成文字和按钮，先验证玩法，之后再换成正式美术界面。
// 用法：把这个组件挂到场景的 Canvas 节点上（见 README）。

import { _decorator, Color, Component, game, Game, Graphics, JsonAsset, Label, Layers, Node, resources, UITransform } from 'cc';
import { CampGame } from '../core/CampGame';
import { upgradeBlocker } from '../core/buildings';
import { bedCount, getBuildingDef, morale, productionPerMinute, foodConsumptionPerMinute, safety, storageCap } from '../core/economy';
import { loadGame, saveGame } from '../core/save';
import { currentDay } from '../core/state';
import { currentEpisode, objectiveDone } from '../core/story';
import { GameConfig, RESOURCE_IDS, ResourceBag } from '../core/types';
import { validateConfig } from '../core/validate';
import { createAdService } from '../platform/AdService';
import { CocosStorage } from '../platform/CocosStorage';

const { ccclass } = _decorator;

const WIDTH = 680;
const LEFT = -WIDTH / 2;
const TOP = 620;
const TEXT = new Color(235, 235, 225);
const DIM = new Color(160, 165, 150);
const ACCENT = new Color(255, 200, 90);
const BUTTON = new Color(70, 110, 80);
const BUTTON_DISABLED = new Color(80, 80, 80);

@ccclass('GameRoot')
export class GameRoot extends Component {
    private camp: CampGame | null = null;
    private readonly storage = new CocosStorage();
    private readonly ads = createAdService();
    private content: Node | null = null;
    private cursorY = TOP;
    private secondTimer = 0;
    private saveTimer = 0;
    private toast = '';
    private toastUntil = 0;

    onLoad(): void {
        this.drawBackground();
        this.content = this.makeNode('Content', this.node);
        game.on(Game.EVENT_HIDE, this.save, this);
        this.loadConfig();
    }

    onDestroy(): void {
        game.off(Game.EVENT_HIDE, this.save, this);
        this.save();
    }

    update(dt: number): void {
        if (!this.camp) return;
        this.secondTimer += dt;
        this.saveTimer += dt;
        if (this.secondTimer >= 1) {
            this.secondTimer = 0;
            this.camp.tick(Date.now());
            this.render();
        }
        if (this.saveTimer >= 10) {
            this.saveTimer = 0;
            this.save();
        }
    }

    private loadConfig(): void {
        resources.loadDir('config', JsonAsset, (err, assets) => {
            if (err) {
                this.showFatal(`配置加载失败：${err.message}`);
                return;
            }
            const byName: Record<string, unknown> = {};
            for (const a of assets) byName[a.name] = a.json;
            const config = byName as unknown as GameConfig;
            const errors = validateConfig(config);
            if (errors.length > 0) {
                this.showFatal(`配置表有错误：\n${errors.slice(0, 10).join('\n')}`);
                return;
            }
            const now = Date.now();
            const saved = loadGame(this.storage, config);
            this.camp = saved ? new CampGame(config, saved) : CampGame.newGame(config, now);
            this.camp.tick(now);
            this.render();
        });
    }

    private save(): void {
        if (this.camp) saveGame(this.storage, this.camp.state);
    }

    // ---------- 界面 ----------

    private render(): void {
        const camp = this.camp;
        if (!camp || !this.content) return;
        this.content.destroyAllChildren();
        this.cursorY = TOP;
        const now = Date.now();
        const { config, state } = camp;

        this.text(`《末日营地》 第 ${currentDay(config, state, now)} 天`, 34, ACCENT);
        this.text(
            `士气 ${Math.round(morale(state))}   安全 ${safety(config, state)}   人数 ${state.survivors.length}/${bedCount(config, state)}`,
            22,
            DIM,
        );
        this.text(this.resourceLine(config, camp), 22);
        this.gap(8);

        const ep = currentEpisode(config, state);
        if (ep) {
            this.text(`第 ${ep.season} 季 第 ${ep.episode} 集「${ep.title}」`, 24, ACCENT);
            for (const o of ep.objectives) this.text(`${objectiveDone(state, o) ? '✅' : '⬜'} ${o.text}`, 22);
        } else {
            this.text('第一季完（未完待续）', 24, ACCENT);
        }
        this.gap(12);

        if (camp.currentEvent) {
            this.renderEvent(camp);
        } else {
            this.renderBuildings(camp, now);
            this.renderSurvivors(camp);
            this.renderLog(camp);
        }

        if (this.toast && now < this.toastUntil) this.text(this.toast, 22, ACCENT);
    }

    private resourceLine(config: GameConfig, camp: CampGame): string {
        const { state } = camp;
        const rates = productionPerMinute(config, state);
        rates.food -= foodConsumptionPerMinute(config, state);
        return config.resources
            .map((r) => {
                const cap = storageCap(config, state, r.id);
                const amount = Math.floor(state.resources[r.id]);
                const rate = rates[r.id];
                const rateText = Math.abs(rate) >= 0.05 ? `(${rate > 0 ? '+' : ''}${rate.toFixed(1)})` : '';
                return `${r.icon}${amount}${cap === Infinity ? '' : '/' + cap}${rateText}`;
            })
            .join('  ');
    }

    private renderEvent(camp: CampGame): void {
        const event = camp.currentEvent!;
        this.text(`【${event.title}】`, 28, ACCENT);
        this.text(event.text, 24);
        this.gap(16);
        event.choices.forEach((choice, i) => {
            this.button(choice.text, WIDTH, () => {
                const res = camp.choose(i, Date.now());
                this.showToast(res.ok ? res.outcomeText ?? '' : res.reason ?? '');
                this.render();
            });
            this.gap(8);
        });
    }

    private renderBuildings(camp: CampGame, now: number): void {
        const { config, state } = camp;
        this.text('—— 营地建筑 ——', 22, DIM);
        for (const def of config.buildings) {
            const b = state.buildings[def.id];
            const rowY = this.cursorY;
            this.text(`${def.name} Lv${b.level}`, 24, b.level > 0 ? TEXT : DIM, 300);
            this.cursorY = rowY;
            if (b.upgradeEndsAt !== null) {
                const left = Math.max(0, Math.ceil((b.upgradeEndsAt - now) / 1000));
                this.button(`${formatTime(left)} 看广告加速`, 360, () => this.speedUp(def.id), LEFT + 320);
            } else {
                const next = def.levels[b.level];
                const blocker = upgradeBlocker(config, state, def.id);
                const label = next ? `${b.level === 0 ? '建造' : '升级'} ${formatCost(config, next.cost)}` : '已满级';
                this.button(blocker && next ? `${label}（${blocker}）` : label, 360, () => {
                    const res = camp.upgrade(def.id, Date.now());
                    this.showToast(res.ok ? `开始${b.level === 0 ? '建造' : '升级'}${def.name}` : res.reason);
                    this.render();
                }, LEFT + 320, blocker !== null);
            }
            this.gap(6);
        }
        this.gap(8);
    }

    private renderSurvivors(camp: CampGame): void {
        const { config, state } = camp;
        this.text('—— 幸存者（点击切换工作） ——', 22, DIM);
        const jobs: (string | null)[] = [null, ...config.buildings.filter((b) => b.levels.some((l) => l.workerSlots)).map((b) => b.id)];
        const colWidth = (WIDTH - 10) / 2;
        let rowTop = this.cursorY;
        state.survivors.forEach((s, i) => {
            const col = i % 2;
            if (col === 0) rowTop = this.cursorY;
            else this.cursorY = rowTop;
            const def = config.survivors.find((d) => d.id === s.id);
            const job = s.injured ? '受伤' : s.assignment ? getBuildingDef(config, s.assignment)?.name : '空闲';
            this.button(`${def?.name ?? s.id} 😊${Math.round(s.mood)} ${job}`, colWidth, () => {
                const start = jobs.indexOf(s.assignment);
                for (let step = 1; step <= jobs.length; step++) {
                    if (camp.assign(s.id, jobs[(start + step) % jobs.length], Date.now()).ok) break;
                }
                this.render();
            }, col === 0 ? LEFT : LEFT + colWidth + 10);
            if (col === 1 || i === state.survivors.length - 1) this.gap(6);
        });
        this.gap(6);
    }

    private renderLog(camp: CampGame): void {
        this.text('—— 营地日志 ——', 22, DIM);
        for (const entry of camp.state.log.slice(-4).reverse()) this.text(entry.text, 20, DIM);
    }

    private speedUp(buildingId: string): void {
        this.ads.showRewarded().then((watched) => {
            if (!this.camp) return;
            this.showToast(watched ? '加速完成！' : '需要看完广告才能加速');
            if (watched) this.camp.speedUpUpgrade(buildingId, Date.now());
            this.render();
        });
    }

    private showToast(message: string): void {
        this.toast = message;
        this.toastUntil = Date.now() + 3000;
    }

    private showFatal(message: string): void {
        if (!this.content) return;
        this.content.destroyAllChildren();
        this.cursorY = TOP;
        this.text(message, 24, ACCENT);
    }

    // ---------- 节点工具 ----------

    private makeNode(name: string, parent: Node): Node {
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform);
        parent.addChild(node);
        return node;
    }

    private drawBackground(): void {
        const bg = this.makeNode('Background', this.node);
        bg.getComponent(UITransform)!.setContentSize(2000, 3000);
        const g = bg.addComponent(Graphics);
        g.fillColor = new Color(28, 32, 30);
        g.rect(-1000, -1500, 2000, 3000);
        g.fill();
    }

    /** 从当前光标位置往下写一段自动换行的文字，返回后光标移到文字下方 */
    private text(str: string, size: number, color: Color = TEXT, width = WIDTH, x = LEFT): void {
        const node = this.makeNode('Text', this.content!);
        const tf = node.getComponent(UITransform)!;
        tf.setAnchorPoint(0, 1);
        tf.width = width;
        node.setPosition(x, this.cursorY);
        const label = node.addComponent(Label);
        label.string = str;
        label.fontSize = size;
        label.lineHeight = size + 8;
        label.color = color;
        label.horizontalAlign = Label.HorizontalAlign.LEFT;
        label.overflow = Label.Overflow.RESIZE_HEIGHT;
        label.enableWrapText = true;
        label.updateRenderData(true);
        this.cursorY -= tf.height + 4;
    }

    private button(str: string, width: number, onClick: () => void, x = LEFT, disabled = false, size = 22): void {
        const height = 44;
        const node = this.makeNode('Button', this.content!);
        node.getComponent(UITransform)!.setContentSize(width, height);
        node.setPosition(x + width / 2, this.cursorY - height / 2);
        const g = node.addComponent(Graphics);
        g.fillColor = disabled ? BUTTON_DISABLED : BUTTON;
        g.roundRect(-width / 2, -height / 2, width, height, 8);
        g.fill();

        const labelNode = this.makeNode('Label', node);
        labelNode.getComponent(UITransform)!.setContentSize(width - 12, height);
        const label = labelNode.addComponent(Label);
        label.string = str;
        label.fontSize = size;
        label.lineHeight = height;
        label.color = TEXT;
        label.overflow = Label.Overflow.SHRINK;

        node.on(Node.EventType.TOUCH_END, onClick);
        this.cursorY -= height;
    }

    private gap(px: number): void {
        this.cursorY -= px;
    }
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatCost(config: GameConfig, cost: ResourceBag): string {
    const parts = RESOURCE_IDS.filter((id) => cost[id]).map((id) => {
        const icon = config.resources.find((r) => r.id === id)?.icon ?? id;
        return `${icon}${cost[id]}`;
    });
    return parts.length > 0 ? parts.join(' ') : '免费';
}
