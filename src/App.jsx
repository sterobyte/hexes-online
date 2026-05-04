import React, { useMemo, useState } from "react";
import {
  START_MONEY,
  HUMAN,
  BOT,
  CELLS,
  money,
  getCell,
  dist,
  banks,
  redistribute,
  checkGameOver,
  applyMoveStep,
  chooseBotStart,
  chooseBotMove,
  runSmokeTests,
} from "./engine";

const PLAYER_NAME = { G: "Зелёный", B: "Синий" };

const COLORS = {
  G: { bg: "#10b981", border: "#6ee7b7", text: "#ffffff" },
  B: { bg: "#3b82f6", border: "#93c5fd", text: "#ffffff" },
  empty: { bg: "#1e293b", border: "#475569", text: "#cbd5e1" },
};

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
    <div style={styles.page}>
      <div style={styles.layout}>
        <div style={styles.mainCard}>
          <div style={styles.header}>
            <div>
              <h1 style={styles.title}>Hexes</h1>
              <div style={styles.subtitle}>{statusText}</div>
            </div>

            <button onClick={reset} style={styles.resetButton}>Сброс</button>
          </div>

          <div style={styles.balanceGrid}>
            <div style={styles.greenBalance}>
              <div style={styles.greenLabel}>Баланс зелёного</div>
              <div style={styles.balanceValue}>{money(bank.G)}</div>
            </div>

            <div style={styles.blueBalance}>
              <div style={styles.blueLabel}>Баланс синего</div>
              <div style={styles.balanceValue}>{money(bank.B)}</div>
            </div>
          </div>

          <div style={styles.boardWrap}>
            {CELLS.map((c) => {
              const v = board[c.id];

              return (
                <button key={c.id} onClick={() => handleCell(c.id)} style={hexStyle(c.id)}>
                  <div style={styles.hexOwner}>{v ? v.owner : "·"}</div>
                  <div style={styles.hexMoney}>{v ? money(v.money) : ""}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={styles.sidebar}>
          <Panel title="Банк">
            <InfoRow label="Зелёный" value={money(bank.G)} />
            <InfoRow label="Синий" value={money(bank.B)} />
          </Panel>

          <Panel title="Правила управления">
            <p style={styles.p}>1. На старте кликни пустую клетку для зелёного.</p>
            <p style={styles.p}>2. Синий ставит стартовый гекс автоматически.</p>
            <p style={styles.p}>3. В игре: свой гекс → пустая клетка.</p>
            <p style={styles.p}>Соседняя клетка = клон. Через клетку = прыжок.</p>
          </Panel>

          <Panel title="Лог">
            {log.map((l, i) => (
              <div key={i} style={styles.logRow}>{l}</div>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div style={styles.panel}>
      <h2 style={styles.panelTitle}>{title}</h2>
      {children}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={styles.infoRow}>
      <span>{label}</span>
      <b style={{ color: "#ffffff" }}>{value}</b>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#020617",
    color: "#e5e7eb",
    padding: 22,
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    boxSizing: "border-box",
  },
  layout: {
    maxWidth: 1260,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "1fr 320px",
    gap: 24,
  },
  mainCard: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 22,
    padding: 34,
    boxShadow: "0 25px 60px rgba(0,0,0,0.45)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 28,
  },
  title: {
    margin: 0,
    fontSize: 34,
    lineHeight: 1.1,
    color: "#f8fafc",
  },
  subtitle: {
    marginTop: 8,
    color: "#93c5fd",
    fontSize: 18,
  },
  resetButton: {
    padding: "14px 24px",
    borderRadius: 14,
    background: "#1e293b",
    color: "#ffffff",
    border: "1px solid #334155",
    fontSize: 24,
    cursor: "pointer",
  },
  balanceGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    marginBottom: 52,
  },
  greenBalance: {
    borderRadius: 16,
    padding: "18px 24px",
    background: "rgba(16,185,129,0.18)",
    border: "1px solid rgba(16,185,129,0.65)",
  },
  blueBalance: {
    borderRadius: 16,
    padding: "18px 24px",
    background: "rgba(59,130,246,0.20)",
    border: "1px solid rgba(59,130,246,0.65)",
  },
  greenLabel: {
    fontSize: 16,
    color: "#a7f3d0",
  },
  blueLabel: {
    fontSize: 16,
    color: "#bfdbfe",
  },
  balanceValue: {
    marginTop: 6,
    fontSize: 34,
    fontWeight: 800,
    color: "#ffffff",
  },
  boardWrap: {
    position: "relative",
    width: 520,
    height: 520,
    margin: "0 auto",
  },
  hexOwner: {
    fontSize: 26,
    fontWeight: 800,
  },
  hexMoney: {
    marginTop: 4,
    fontSize: 16,
  },
  sidebar: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  panel: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 18,
    padding: 20,
    boxShadow: "0 18px 45px rgba(0,0,0,0.35)",
  },
  panelTitle: {
    margin: "0 0 12px",
    fontSize: 17,
    color: "#f8fafc",
  },
  infoRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "10px 0",
    borderBottom: "1px solid #1e293b",
    color: "#cbd5e1",
  },
  p: {
    margin: "0 0 10px",
    color: "#cbd5e1",
    fontSize: 14,
    lineHeight: 1.4,
  },
  logRow: {
    borderBottom: "1px solid #1e293b",
    padding: "8px 0",
    color: "#cbd5e1",
    fontSize: 14,
  },
};
