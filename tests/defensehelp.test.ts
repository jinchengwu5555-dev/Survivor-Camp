import { describe, expect, it } from "vitest";
import { Battle } from "../assets/scripts/core/battle/Battle";
import { battleRegistry, raidSetup } from "../assets/scripts/core/combat";
import { loadConfig } from "./helpers";
describe("守夜互相支援", () => {
  it("自己的门没有丧尸、别的门在挨打：守门的人去支援（分配的门不变）", () => {
    const config = loadConfig();
    const member = (id: string) => ({
      id,
      unit: config.survivors.find((d) => d.id === id)!.battleUnit!,
    });
    const defenders = ["derek", "ethan", "martha", "toby", "sophie"].map(
      member,
    );
    const raid = config.raids.find((r) => r.id === "horde")!;
    const setup = raidSetup(config, raid, defenders, 600, 4, 3);
    // 所有丧尸都从北门来，守夜的人都分在南门
    const north = setup.camp!.gates[0];
    for (const e of setup.enemies) {
      e.x = north.x + ((e.x ?? 0) % 2);
      e.y = north.y + 9;
    }
    for (const a of setup.allies)
      if (a.post !== undefined) {
        a.post = a.post === 0 ? 0 : 2;
      }
    const b = new Battle(battleRegistry(config), setup);
    for (let i = 0; i < 150; i++) b.step();
    const people = b.units.filter(
      (u) => u.side === "ally" && u.post !== undefined && u.alive,
    );
    expect(people.some((u) => u.post === 2 && b.dutyGate(u) === 0)).toBe(true);
    // 真的走过去了：离北门比离南门近
    for (const u of people.filter((p) => p.post === 2))
      expect(u.y).toBeGreaterThan(0);
  });
});
