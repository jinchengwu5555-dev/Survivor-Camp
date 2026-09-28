// 界面小工具：还没有美术资源，所有东西都用代码画（色块 + 文字 + emoji）。
// GameRoot（营地界面）和 BattleView（战斗画面）共用。

import { Color, Graphics, Label, Layers, Node, tween, UIOpacity, UITransform, Vec3 } from 'cc';

export const COLORS = {
    bg: new Color(28, 32, 30),
    panel: new Color(44, 50, 46),
    panelLight: new Color(60, 68, 62),
    text: new Color(235, 235, 225),
    dim: new Color(160, 165, 150),
    accent: new Color(255, 200, 90),
    button: new Color(70, 110, 80),
    disabled: new Color(80, 80, 80),
    highlight: new Color(214, 150, 40),
    danger: new Color(170, 60, 50),
    win: new Color(140, 220, 140),
    lose: new Color(240, 120, 110),
    heal: new Color(120, 230, 140),
    crit: new Color(255, 220, 80),
};

/** '#4a6fa5' → Color */
export function hexColor(hex: string, alpha = 255): Color {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return new Color((n >> 16) & 255, (n >> 8) & 255, n & 255, alpha);
}

export function makeNode(name: string, parent: Node, width = 0, height = 0): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(width, height);
    parent.addChild(node);
    return node;
}

export interface LabelOptions {
    width?: number;
    height?: number;
    align?: 'left' | 'center' | 'right';
    /** 自动换行并按内容撑高（默认不换行、放不下就缩小字号） */
    wrap?: boolean;
}

/** 在 parent 下放一个文字节点（锚点在中心） */
export function addLabel(parent: Node, text: string, size: number, color: Color, opts: LabelOptions = {}): Label {
    const node = makeNode('Label', parent, opts.width ?? 600, opts.height ?? size + 10);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = size;
    label.lineHeight = size + 8;
    label.color = color;
    label.horizontalAlign =
        opts.align === 'left' ? Label.HorizontalAlign.LEFT : opts.align === 'right' ? Label.HorizontalAlign.RIGHT : Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    if (opts.wrap) {
        label.overflow = Label.Overflow.RESIZE_HEIGHT;
        label.enableWrapText = true;
    } else {
        label.overflow = Label.Overflow.SHRINK;
        label.enableWrapText = false;
    }
    return label;
}

/** 画一个圆角矩形面板（以节点中心为原点） */
export function drawPanel(g: Graphics, width: number, height: number, fill: Color, radius = 10, border?: Color, borderWidth = 3): void {
    g.fillColor = fill;
    g.roundRect(-width / 2, -height / 2, width, height, radius);
    g.fill();
    if (border) {
        g.lineWidth = borderWidth;
        g.strokeColor = border;
        g.roundRect(-width / 2, -height / 2, width, height, radius);
        g.stroke();
    }
}

export type ButtonStyle = 'normal' | 'disabled' | 'highlight' | 'danger' | 'ready';

const STYLE_COLORS: Record<ButtonStyle, Color> = {
    normal: COLORS.button,
    disabled: COLORS.disabled,
    highlight: COLORS.highlight,
    danger: COLORS.danger,
    ready: new Color(60, 140, 200),
};

/** 可以反复改文字和样式的按钮（战斗画面每帧更新冷却时间用） */
export class UIButton {
    readonly node: Node;
    readonly label: Label;
    private readonly g: Graphics;
    private style: ButtonStyle | null = null;
    /** 冷却进度 0～1，画成按钮上的暗色遮罩 */
    private progress = 0;

    constructor(
        parent: Node,
        readonly width: number,
        readonly height: number,
        onClick: () => void,
        size = 22,
    ) {
        this.node = makeNode('Button', parent, width, height);
        this.g = this.node.addComponent(Graphics);
        this.label = addLabel(this.node, '', size, COLORS.text, { width: width - 12, height });
        this.node.on(Node.EventType.TOUCH_END, () => {
            if (this.style === 'disabled') return;
            punch(this.node);
            onClick();
        });
    }

    set(text: string, style: ButtonStyle = 'normal', progress = 0): void {
        if (this.label.string !== text) this.label.string = text;
        if (style === this.style && Math.abs(progress - this.progress) < 0.02) return;
        this.style = style;
        this.progress = progress;
        this.g.clear();
        drawPanel(this.g, this.width, this.height, STYLE_COLORS[style], 8, style === 'highlight' || style === 'ready' ? COLORS.accent : undefined);
        if (progress > 0) {
            this.g.fillColor = new Color(0, 0, 0, 110);
            this.g.rect(-this.width / 2, -this.height / 2, this.width * progress, this.height);
            this.g.fill();
        }
    }
}

/** 点击时轻轻弹一下 */
export function punch(node: Node): void {
    tween(node)
        .to(0.06, { scale: new Vec3(0.94, 0.94, 1) })
        .to(0.1, { scale: new Vec3(1, 1, 1) })
        .start();
}

/** 飘字：从 (x, y) 往上飘并淡出，然后自动销毁 */
export function floatText(parent: Node, text: string, x: number, y: number, color: Color, size = 26, rise = 70, duration = 1): void {
    const label = addLabel(parent, text, size, color, { width: 600 });
    const node = label.node;
    node.setPosition(x, y);
    const opacity = node.addComponent(UIOpacity);
    tween(node)
        .by(duration, { position: new Vec3(0, rise, 0) })
        .start();
    tween(opacity)
        .delay(duration * 0.5)
        .to(duration * 0.5, { opacity: 0 })
        .call(() => node.destroy())
        .start();
}

export function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const mmss = `${m.toString().padStart(h > 0 ? 2 : 1, '0')}:${s.toString().padStart(2, '0')}`;
    return h > 0 ? `${h}:${mmss}` : mmss;
}
