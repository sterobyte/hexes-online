import React, { useMemo, useState } from "react";

const CELLS = [
  { id: "A5", x: 0, y: 0 }, { id: "B5", x: 1, y: 0 }, { id: "C5", x: 2, y: 0 },
  { id: "A4", x: -0.5, y: 1 }, { id: "B4", x: 0.5, y: 1 }, { id: "C4", x: 1.5, y: 1 }, { id: "D4", x: 2.5, y: 1 },
  { id: "A3", x: -1, y: 2 }, { id: "B3", x: 0, y: 2 }, { id: "C3", x: 1, y: 2 }, { id: "D3", x: 2, y: 2 }, { id: "E3", x: 3, y: 2 },
  { id: "B2", x: -0.5, y: 3 }, { id: "C2", x: 0.5, y: 3 }, { id: "D2", x: 1.5, y: 3 }, { id: "E2", x: 2.5, y: 3 },
  { id: "C1", x: 0, y: 4 }, { id: "D1", x: 1, y: 4 }, { id: "E1", x: 2, y: 4 },
];

const START_MONEY = 100;
const HUMAN = "G";
const BOT = "B";
const PLAYERS = [HUMAN, BOT];
const PLAYER_NAME = { G: "Зелёный", B: "Синий" };

const COLORS = {
  G: { bg: "#10b981", border: "#6ee7b7", text: "#ffffff" },
  B: { bg: "#3b82f6", border: "#93c5fd", text: "#ffffff" },
  empty: { bg: "#1e293b", border: "#475569", text: "#cbd5e1" },
};

function money(v) {
  return Number(v || 0).toFixed(2);
}

function getCell(id) {
  return CELLS.find((c) => c.id === id);
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d <= 1.13) return 1;
  if (d <= 2.25) return 2;
  return 99;
}

function neighbors(id) {
  const c = getCell(id);
  return CELLS.filter((n) => n.id !== id && dist(c, n) === 1).map((n) => n.id);
}

function ownedCells(board, player) {
  return Object.entries(board).filter(([, v]) => v.owner === player).map(([id]) => id);
}

function banks(board) {
  const out = { G: 0, B: 0 };
  for (const v of Object.values(board)) out[v.owner] += v.money;
  return out;
}

function redistribute(board) {
  const next = { ...board };

  for (const player of PLAYERS) {
    const cells = ownedCells(next, player);
    if (!cells.length) continue;

    const total = cells.reduce((s, id) => s + next[id].money, 0);
    const each = total / cells.length;

    for (const id of cells) next[id] = { owner: player, money: each };
  }

  return next;
}

function canPlaceInitial(board, player, id) {
  if (board[id]) return false;

  const enemy = player === HUMAN ? BOT : HUMAN;
  for (const eid of ownedCells(board, enemy)) {
    if (dist(getCell(id), getCell(eid)) === 1) return false;
  }

  return true;
}

function legalMoves(board, player) {
  const moves = [];

  for (const from of ownedCells(board, player)) {
    for (const c of CELLS) {
      if (board[c.id]) continue;

      const d = dist(getCell(from), c);
      if (d === 1 || d === 2) moves.push({ from, to: c.id, d });
    }
  }

  return moves;
}

function applyMove(board, player, move) {
  const step = applyMoveStep(board, player, move);
  return step.finalBoard;
}

function applyMoveStep(board, player, move) {
  const from = board[move.from];

  if (!from || from.owner !== player || board[move.to]) {
    return { ok: false, movedBoard: board, finalBoard: board, captured: [] };
  }

  const d = dist(getCell(move.from), getCell(move.to));
  if (d !== 1 && d !== 2) {
    return { ok: false, movedBoard: board, finalBoard: board, captured: [] };
  }

  let movedBoard = { ...board };

  if (d === 1) {
    movedBoard[move.to] = { owner: player, money: 0 };
  } else {
    movedBoard[move.to] = { ...movedBoard[move.from] };
    delete movedBoard[move.from];
  }

  movedBoard = redistribute(movedBoard);

  const captured = neighbors(move.to).filter((id) => movedBoard[id] && movedBoard[id].owner !== player);

  let finalBoard = { ...movedBoard };

  if (captured.length) {
    for (const id of captured) finalBoard[id] = { ...finalBoard[id], owner: player };
    finalBoard = redistribute(finalBoard);
  }

  return { ok: true, movedBoard, finalBoard, captured, d };
}

function checkGameOver(board, nextPlayer) {
  const alive = PLAYERS.filter((p) => ownedCells(board, p).length > 0);

  if (alive.length <= 1) return { over: true, winner: alive[0] || null };

  if (Object.keys(board).length === CELLS.length) {
    const b = banks(board);
    return { over: true, winner: b.G === b.B ? null : b.G > b.B ? HUMAN : BOT };
  }

  const nextMoves = legalMoves(board, nextPlayer);
  if (nextMoves.length > 0) return { over: false, nextPlayer };

  const other = nextPlayer === HUMAN ? BOT : HUMAN;
  const otherMoves = legalMoves(board, other);

  if (otherMoves.length > 0) return { over: false, skipPlayer: nextPlayer, nextPlayer: other };

  const b = banks(board);
  return { over: true, winner: b.G === b.B ? null : b.G > b.B ? HUMAN : BOT };
}

function evalBoard(board) {
  const b = banks(board);
  const botCells = ownedCells(board, BOT).length;
  const humanCells = ownedCells(board, HUMAN).length;
  const botMoves = legalMoves(board, BOT).length;
  const humanMoves = legalMoves(board, HUMAN).length;

  return b.B - b.G + 1.5 * (botCells - humanCells) + 0.2 * (botMoves - humanMoves);
}

function chooseBotStart(board) {
  let best = null;
  let bestScore = -Infinity;

  for (const c of CELLS) {
    if (!canPlaceInitial(board, BOT, c.id)) continue;

    const placed = redistribute({ ...board, [c.id]: { owner: BOT, money: START_MONEY } });
    const replies = legalMoves(placed, HUMAN);
    let worst = replies.length ? Infinity : evalBoard(placed);

    for (const r of replies) {
      const afterHuman = applyMove(placed, HUMAN, r);
      worst = Math.min(worst, evalBoard(afterHuman));
    }

    if (worst > bestScore) {
      bestScore = worst;
      best = c.id;
    }
  }

  return best;
}

function chooseBotMove(board) {
  const moves = legalMoves(board, BOT);
  let best = null;
  let bestScore = -Infinity;

  for (const m of moves) {
    const afterBot = applyMove(board, BOT, m);
    const status = checkGameOver(afterBot, HUMAN);

    if (status.over && status.winner === BOT) return m;

    const replies = legalMoves(afterBot, HUMAN);
    let worst = replies.length ? Infinity : evalBoard(afterBot);

    for (const r of replies) {
      const afterHuman = applyMove(afterBot, HUMAN, r);
      worst = Math.min(worst, evalBoard(afterHuman));
    }

    if (worst > bestScore) {
      bestScore = worst;
      best = m;
    }
  }

  return best;
}

function runSmokeTests() {
  const b0 = redistribute({ A5: { owner: HUMAN, money: 100 } });
  const b1 = redistribute({ ...b0, C5: { owner: BOT, money: 100 } });
  console.assert(banks(b1).G === 100, "G bank should be 100");
  console.assert(banks(b1).B === 100, "B bank should be 100");

  const clone = applyMove(b1, HUMAN, { from: "A5", to: "A4" });
  console.assert(ownedCells(clone, HUMAN).length === 2, "clone should add cell");
  console.assert(Math.abs(clone.A5.money - 50) < 0.001, "clone should split money");

  const captureBase = redistribute({
    A5: { owner: HUMAN, money: 100 },
    B4: { owner: BOT, money: 100 },
  });
  const captured = applyMove(captureBase, HUMAN, { from: "A5", to: "A4" });
  console.assert(captured.B4.owner === HUMAN, "adjacent enemy should be captured");
  console.assert(Math.abs(banks(captured).G - 200) < 0.001, "captured money should transfer");
}

runSmokeTests();

export default function App() {
  const [board, setBoard] = useState({});
  const [phase, setPhase] = useState("setup");
  const [turn, setTurn] = useState(HUMAN);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [winner, setWinner] = useState(null);
  const [log, setLog] = useState(["Выбери стартовую клетку зелёного."]);

  const bank = useMemo(() => banks(board), [board]);

  function addLog(line) {
    setLog((l) => [line, ...l].slice(0, 8));
  }

  function reset() {
    setBoard({});
    setPhase("setup");
    setTurn(HUMAN);
    setSelected(null);
    setBusy(false);
    setWinner(null);
    setLog(["Выбери стартовую клетку зелёного."]);
  }

  function finish(status) {
    setPhase("over");
    setWinner(status.winner);
    if (!status.winner) addLog("Игра окончена. Ничья.");
    else addLog(`Игра окончена. Победил ${PLAYER_NAME[status.winner]}.`);
  }

  function continueAfter(nextBoard, nextPlayer) {
    const status = checkGameOver(nextBoard, nextPlayer);

    if (status.over) {
      finish(status);
      return;
    }

    if (status.skipPlayer) {
      addLog(`${PLAYER_NAME[status.skipPlayer]} пропускает ход.`);
      setTurn(status.nextPlayer);
      if (status.nextPlayer === BOT) setTimeout(() => botTurn(nextBoard), 500);
      return;
    }

    setTurn(nextPlayer);
    if (nextPlayer === BOT) setTimeout(() => botTurn(nextBoard), 500);
  }

  function animateMove(player, move, sourceBoard) {
    const step = applyMoveStep(sourceBoard, player, move);
    if (!step.ok) return;

    setBusy(true);
    setSelected(null);
    setBoard(step.movedBoard);

    addLog(`${PLAYER_NAME[player]}: ${move.from} ${step.d === 1 ? "→" : "⇒"} ${move.to}.`);

    setTimeout(() => {
      setBoard(step.finalBoard);
      if (step.captured.length) addLog(`Захват: ${step.captured.join(", ")}.`);
      setBusy(false);
      continueAfter(step.finalBoard, player === HUMAN ? BOT : HUMAN);
    }, step.captured.length ? 500 : 100);
  }

  function botTurn(sourceBoard = board) {
    if (phase === "over") return;

    const move = chooseBotMove(sourceBoard);
    if (!move) {
      continueAfter(sourceBoard, HUMAN);
      return;
    }

    animateMove(BOT, move, sourceBoard);
  }

  function handleSetup(id) {
    if (busy || board[id]) return;

    const next = redistribute({ ...board, [id]: { owner: HUMAN, money: START_MONEY } });
    setBoard(next);
    addLog("Зелёный поставил 100.");

    setBusy(true);
    setTimeout(() => {
      const botStart = chooseBotStart(next);

      if (!botStart) {
        finish({ winner: HUMAN });
        setBusy(false);
        return;
      }

      const afterBot = redistribute({
        ...next,
        [botStart]: { owner: BOT, money: START_MONEY },
      });

      setBoard(afterBot);
      setPhase("play");
      setTurn(HUMAN);
      setBusy(false);
      addLog(`Синий автоматически поставил 100 на ${botStart}. Ход зелёного.`);
    }, 500);
  }

  function handlePlay(id) {
    if (busy || turn !== HUMAN) return;

    const cell = board[id];

    if (!selected) {
      if (cell?.owner === HUMAN) setSelected(id);
      return;
    }

    if (selected === id) {
      setSelected(null);
      return;
    }

    if (cell?.owner === HUMAN) {
      setSelected(id);
      return;
    }

    if (board[id]) return;

    const d = dist(getCell(selected), getCell(id));
    if (d !== 1 && d !== 2) return;

    animateMove(HUMAN, { from: selected, to: id }, board);
  }

  function handleCell(id) {
    if (phase === "over") return;
    if (phase === "setup") handleSetup(id);
    if (phase === "play") handlePlay(id);
  }

  function hexStyle(id) {
    const v = board[id];
    const c = v ? COLORS[v.owner] : COLORS.empty;
    const p = getCell(id);

    return {
      position: "absolute",
      left: 190 + p.x * 82,
      top: 28 + p.y * 88,
      width: 80,
      height: 80,
      clipPath: "polygon(25% 4%, 75% 4%, 100% 50%, 75% 96%, 25% 96%, 0% 50%)",
      background: c.bg,
      color: c.text,
      border: `2px solid ${c.border}`,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      userSelect: "none",
      boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
      transform: selected === id ? "scale(1.06)" : "scale(1)",
      transition: "transform 120ms ease, background 120ms ease",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      boxSizing: "border-box",
      padding: 0,
    };
  }

  const statusText =
    phase === "setup"
      ? "Стартовая ставка зелёного"
      : phase === "play"
        ? `Ход: ${PLAYER_NAME[turn]}`
        : winner
          ? `Победил ${PLAYER_NAME[winner]}`
          : "Игра окончена";

  return (
    <div style={{
      minHeight: "100vh",
      background: "#020617",
      color: "#e5e7eb",
      padding: 22,
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      boxSizing: "border-box",
    }}>
      <div style={{
        maxWidth: 1260,
        margin: "0 auto",
        display: "grid",
        gridTemplateColumns: "1fr 320px",
        gap: 24,
      }}>
        <div style={{
          background: "#0f172a",
          border: "1px solid #1e293b",
          borderRadius: 22,
          padding: 34,
          boxShadow: "0 25px 60px rgba(0,0,0,0.45)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.1, color: "#f8fafc" }}>Hexes</h1>
              <div style={{ marginTop: 8, color: "#93c5fd", fontSize: 18 }}>{statusText}</div>
            </div>

            <button onClick={reset} style={{
              padding: "14px 24px",
              borderRadius: 14,
              background: "#1e293b",
              color: "#ffffff",
              border: "1px solid #334155",
              fontSize: 24,
              cursor: "pointer",
            }}>
              Сброс
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 52 }}>
            <div style={{
              borderRadius: 16,
              padding: "18px 24px",
              background: "rgba(16,185,129,0.18)",
              border: "1px solid rgba(16,185,129,0.65)",
            }}>
              <div style={{ fontSize: 16, color: "#a7f3d0" }}>Баланс зелёного</div>
              <div style={{ marginTop: 6, fontSize: 34, fontWeight: 800, color: "#ffffff" }}>{money(bank.G)}</div>
            </div>

            <div style={{
              borderRadius: 16,
              padding: "18px 24px",
              background: "rgba(59,130,246,0.20)",
              border: "1px solid rgba(59,130,246,0.65)",
            }}>
              <div style={{ fontSize: 16, color: "#bfdbfe" }}>Баланс синего</div>
              <div style={{ marginTop: 6, fontSize: 34, fontWeight: 800, color: "#ffffff" }}>{money(bank.B)}</div>
            </div>
          </div>

          <div style={{ position: "relative", width: 520, height: 520, margin: "0 auto" }}>
            {CELLS.map((c) => {
              const v = board[c.id];

              return (
                <button key={c.id} onClick={() => handleCell(c.id)} style={hexStyle(c.id)}>
                  <div style={{ fontSize: 26, fontWeight: 800 }}>{v ? v.owner : "·"}</div>
                  <div style={{ marginTop: 4, fontSize: 16 }}>{v ? money(v.money) : ""}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Panel title="Банк">
            <InfoRow label="Зелёный" value={money(bank.G)} />
            <InfoRow label="Синий" value={money(bank.B)} />
          </Panel>

          <Panel title="Правила управления">
            <p style={pStyle}>1. На старте кликни пустую клетку для зелёного.</p>
            <p style={pStyle}>2. Синий ставит стартовый гекс автоматически.</p>
            <p style={pStyle}>3. В игре: свой гекс → пустая клетка.</p>
            <p style={pStyle}>Соседняя клетка = клон. Через клетку = прыжок.</p>
          </Panel>

          <Panel title="Лог">
            {log.map((l, i) => (
              <div key={i} style={{
                borderBottom: i === log.length - 1 ? "none" : "1px solid #1e293b",
                padding: "8px 0",
                color: "#cbd5e1",
                fontSize: 14,
              }}>
                {l}
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div style={{
      background: "#0f172a",
      border: "1px solid #1e293b",
      borderRadius: 18,
      padding: 20,
      boxShadow: "0 18px 45px rgba(0,0,0,0.35)",
    }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 17, color: "#f8fafc" }}>{title}</h2>
      {children}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      padding: "10px 0",
      borderBottom: "1px solid #1e293b",
      color: "#cbd5e1",
    }}>
      <span>{label}</span>
      <b style={{ color: "#ffffff" }}>{value}</b>
    </div>
  );
}

const pStyle = {
  margin: "0 0 10px",
  color: "#cbd5e1",
  fontSize: 14,
  lineHeight: 1.4,
};
