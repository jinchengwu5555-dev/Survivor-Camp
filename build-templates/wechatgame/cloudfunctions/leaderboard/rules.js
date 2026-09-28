// 排行榜的分数校验（纯函数，tests/leaderboard.test.ts 会测）。
// 游戏时间只在在线时走，一天最快也要 dayLengthMinutes / onlineTimeScale 分钟的真实时间。
// 服务器记下第一次看到这一局的时间，之后上报的天数不能超过“这段真实时间最多能玩出来的天数”，
// 超过的部分直接截掉（不拒绝，避免网络抖动误伤正常玩家）。改本地存档刷天数就没用了。

/**
 * @param {null | {runId: number, runStartAt: number, runDays: number, bestDays: number}} prev 服务器上的旧记录
 * @param {{runId: number, days: number}} claim 客户端上报
 * @param {number} serverNow 服务器时间（毫秒）
 * @param {{dayLengthMinutes: number, onlineTimeScale: number, tolerance: number, graceDays: number}} cfg
 */
function acceptScore(prev, claim, serverNow, cfg) {
    const claimed = Math.max(1, Math.floor(Number(claim.days) || 1));
    const sameRun = !!prev && prev.runId === claim.runId;
    const runStartAt = sameRun ? prev.runStartAt : serverNow;
    const fastestDayMs = (cfg.dayLengthMinutes * 60000) / cfg.onlineTimeScale;
    const cap = Math.floor(((serverNow - runStartAt) / fastestDayMs) * cfg.tolerance) + cfg.graceDays;
    const runDays = Math.max(sameRun ? prev.runDays : 0, Math.min(claimed, cap));
    return {
        runId: claim.runId,
        runStartAt,
        runDays,
        bestDays: Math.max(prev ? prev.bestDays : 0, runDays),
        clamped: claimed > cap,
    };
}

module.exports = { acceptScore };
