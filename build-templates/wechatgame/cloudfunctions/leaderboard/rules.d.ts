// rules.js 的类型声明，给 tests/leaderboard.test.ts 用
export interface ScoreRecord {
    runId: number;
    runStartAt: number;
    runDays: number;
    bestDays: number;
}
export interface ScoreConfig {
    dayLengthMinutes: number;
    onlineTimeScale: number;
    tolerance: number;
    graceDays: number;
}
export function acceptScore(
    prev: ScoreRecord | null,
    claim: { runId: number; days: number },
    serverNow: number,
    cfg: ScoreConfig,
): ScoreRecord & { clamped: boolean };
