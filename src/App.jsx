import React, { useMemo, useState } from "react";
import {
  START_MONEY,
  HUMAN,
  BOT,
  PLAYERS,
  CELLS,
  getCell,
  distance,
  ownedCells,
  banks,
  placeInitial,
  legalMoves,
  applyMove,
  applyMoveStep,
  checkGameOver,
} from "./engine";

const PLAYER_NAME = { G: "Игрок", B: "Бот" };
const COLOR = {
  G: "bg-emerald-500 border-emerald-300 text-white",
  B: "bg-blue-500 border-blue-300 text-white",
  empty: "bg-slate-800 border-slate-600 text-slate-400",
};

function money(v) {
  return Number(v || 0).toFixed(2);
}

function evalBoard(board) {
  const bank = banks(board);
  const botCells = ownedCells(board, BOT).length;
  const humanCells = ownedCells(board, HUMAN).length;
  const botMoves = legalMoves(board, BOT).length;
  const humanMoves = legalMoves(board, HUMAN).length;
  const centerBonus = ownedCells(board, BOT).reduce(
    (s, id) => s + (id === "C3" ? 2 : 0.1),
    0
  );
  return (
    bank.B - bank.G +
    1.5 * (botCells - humanCells) +
    0.2 * (botMoves - humanMoves) +
    centerBonus
  );
}

function chooseBotStart(board) {
  let best = null;
  let bestScore = -Infinity;

  for (const c of CELLS) {
    if (!placeInitial(board, BOT, c.id)) continue;

    const placed = placeInitial(board, BOT, c.id);
    const replies = legalMoves(placed, HUMAN);

    let worst = Infinity;

    if (!replies.length) worst = evalBoard(placed);

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
    let worst = Infinity;

    if (!replies.length) worst = evalBoard(afterBot);

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

export default function App() {
  const [board, setBoard] = useState({});
  const [phase, setPhase] = useState("idle");
  const [firstPlayer, setFirstPlayer] = useState(null);
  const [turn, setTurn] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [winner, setWinner] = useState(null);
  const [log, setLog] = useState([
    "Нажми «Новая партия». Монетка решит, кто первый.",
  ]);

  const bank = useMemo(() => banks(board), [board]);

  function addLog(line) {
    setLog((l) => [line, ...l].slice(0, 10));
  }

  function resetGame() {
    const first = Math.random() < 0.5 ? HUMAN : BOT;

    setBoard({});
    setPhase("setup");
    setFirstPlayer(first);
    setTurn(first);
    setSelected(null);
    setBusy(false);
    setWinner(null);

    addLog(`Монетка: первым ходит ${PLAYER_NAME[first]}`);

    if (first === BOT) {
      setBusy(true);

      setTimeout(() => {
        const start = "C3";
        const next = placeInitial({}, BOT, start);
        setBoard(next);
        setTurn(HUMAN);
        setBusy(false);
        addLog("Бот поставил стартовый гекс. Твой ход.");
      }, 500);
    }
  }

  function finish(status) {
    setPhase("over");
    setWinner(status.winner);

    if (!status.winner) addLog("Ничья");
    else addLog(`Победил ${PLAYER_NAME[status.winner]}`);
  }

  function continueAfter(boardState, nextPlayer) {
    const status = checkGameOver(boardState, nextPlayer);

    if (status.over) return finish(status);

    if (status.reason === "skip") {
      addLog(`${PLAYER_NAME[status.skipPlayer]} пропускает ход`);
      setTurn(status.nextPlayer);

      if (status.nextPlayer === BOT) {
        setTimeout(() => botTurn(boardState), 500);
      }
      return;
    }

    setTurn(nextPlayer);

    if (nextPlayer === BOT) {
      setTimeout(() => botTurn(boardState), 500);
    }
  }

  function animateMove(player, move, sourceBoard) {
    const step = applyMoveStep(sourceBoard, player, move);

    if (!step.ok) return;

    setBusy(true);
    setSelected(null);
    setBoard(step.movedBoard);

    addLog(`${PLAYER_NAME[player]}: ${move.from} → ${move.to}`);

    setTimeout(() => {
      setBoard(step.finalBoard);

      if (step.captured.length) {
        addLog(`Захвачено: ${step.captured.length}`);
      }

      setBusy(false);
      continueAfter(step.finalBoard, player === HUMAN ? BOT : HUMAN);
    }, step.captured.length ? 500 : 100);
  }

  function botTurn(boardState = board) {
    if (phase === "over") return;

    const move = chooseBotMove(boardState);

    if (!move) {
      continueAfter(boardState, HUMAN);
      return;
    }

    animateMove(BOT, move, boardState);
  }

  function handleSetup(id) {
    if (turn !== HUMAN || busy) return;

    const placed = placeInitial(board, HUMAN, id);

    if (!placed) {
      addLog("Нельзя поставить сюда");
      return;
    }

    setBoard(placed);
    addLog("Ты поставил стартовый гекс");

    if (firstPlayer === HUMAN) {
      setBusy(true);

      setTimeout(() => {
        const botStart = chooseBotStart(placed);
        const next = placeInitial(placed, BOT, botStart);

        setBoard(next);
        setPhase("play");
        setTurn(HUMAN);
        setBusy(false);

        addLog("Бот поставил гекс. Твой ход");
      }, 500);
    } else {
      setPhase("play");
      continueAfter(placed, BOT);
    }
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

    const d = distance(getCell(selected), getCell(id));

    if (d !== 1 && d !== 2) return;

    const move = { from: selected, to: id };

    animateMove(HUMAN, move, board);
  }

  function handleCell(id) {
    if (phase === "setup") handleSetup(id);
    if (phase === "play") handlePlay(id);
  }

  function cellClass(id) {
    const v = board[id];

    const base =
      "absolute w-20 h-20 flex flex-col items-center justify-center border-2";

    const clip = {
      clipPath:
        "polygon(25% 4%, 75% 4%, 100% 50%, 75% 96%, 25% 96%, 0% 50%)",
    };

    const color = v ? COLOR[v.owner] : COLOR.empty;

    return {
      className: `${base} ${color}`,
      style: clip,
    };
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <h1 className="text-3xl mb-4">Hexes MVP</h1>

      <button onClick={resetGame}>Новая партия</button>

      <div>Игрок: {money(bank.G)}</div>
      <div>Бот: {money(bank.B)}</div>

      <div style={{ position: "relative", width: 520, height: 520 }}>
        {CELLS.map((c) => {
          const left = 190 + c.q * 82;
          const top = 200 + c.r * 70;
          const v = board[c.id];

          const props = cellClass(c.id);

          return (
            <button
              key={c.id}
              onClick={() => handleCell(c.id)}
              className={props.className}
              style={{ ...props.style, left, top }}
            >
              {v ? `${v.owner} ${money(v.money)}` : "."}
            </button>
          );
        })}
      </div>
    </div>
  );
}
