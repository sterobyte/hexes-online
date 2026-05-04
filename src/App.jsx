import React, { useMemo, useState } from "react";

const START_MONEY = 100;
const PLAYERS = ["G", "B"];
const HUMAN = "G";
const BOT = "B";
const PLAYER_NAME = { G: "Игрок", B: "Бот" };
const COLOR = {
  G: "bg-emerald-500 border-emerald-300 text-white",
  B: "bg-blue-500 border-blue-300 text-white",
  empty: "bg-slate-800 border-slate-600 text-slate-400",
};

// Одно MVP-поле. Координаты визуальные, но дистанция считается строго по геометрии поля.
const CELLS = [
  { id: "A5", x: 0, y: 0 }, { id: "B5", x: 1, y: 0 }, { id: "C5", x: 2, y: 0 },
  { id: "A4", x: -0.5, y: 1 }, { id: "B4", x: 0.5, y: 1 }, { id: "C4", x: 1.5, y: 1 }, { id: "D4", x: 2.5, y: 1 },
  { id: "A3", x: -1, y: 2 }, { id: "B3", x: 0, y: 2 }, { id: "C3", x: 1, y: 2 }, { id: "D3", x: 2, y: 2 }, { id: "E3", x: 3, y: 2 },
  { id: "B2", x: -0.5, y: 3 }, { id: "C2", x: 0.5, y: 3 }, { id: "D2", x: 1.5, y: 3 }, { id: "E2", x: 2.5, y: 3 },
  { id: "C1", x: 0, y: 4 }, { id: "D1", x: 1, y: 4 }, { id: "E1", x: 2, y: 4 },
];

function getCell(id) {
  return CELLS.find((c) => c.id === id);
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= 1.13) return 1;
  if (dist <= 2.25) return 2;
  return 99;
}

function neighbors(id) {
  const c = getCell(id);
  return CELLS.filter((n) => n.id !== id && distance(c, n) === 1).map((n) => n.id);
}

function cloneBoard(board) {
  const out = {};
  for (const [id, v] of Object.entries(board)) out[id] = { ...v };
  return out;
}

function ownedCells(board, player) {
  return Object.entries(board).filter(([, v]) => v.owner === player).map(([id]) => id);
}

function banks(board) {
  const result = { G: 0, B: 0 };
  for (const v of Object.values(board)) result[v.owner] += v.money;
  return result;
}

function redistribute(board) {
  const result = cloneBoard(board);
  for (const p of PLAYERS) {
    const cells = ownedCells(result, p);
    if (!cells.length) continue;
    const total = cells.reduce((sum, id) => sum + result[id].money, 0);
    const each = total / cells.length;
    for (const id of cells) result[id] = { owner: p, money: each };
  }
  return result;
}

function canPlaceInitial(board, player, id) {
  if (board[id]) return false;
  const enemy = PLAYERS.find((p) => p !== player);
  const enemyCells = ownedCells(board, enemy);
  if (!enemyCells.length) return true;
  // Классическое MVP-правило: нельзя стартовать вплотную к чужому стартовому гексу.
  return enemyCells.every((eid) => distance(getCell(id), getCell(eid)) !== 1);
}

function placeInitial(board, player, id) {
  if (!canPlaceInitial(board, player, id)) return null;
  return redistribute({ ...board, [id]: { owner: player, money: START_MONEY } });
}

function legalMoves(board, player) {
  const moves = [];
  for (const from of ownedCells(board, player)) {
    for (const c of CELLS) {
      if (board[c.id]) continue;
      const d = distance(getCell(from), c);
      if (d === 1 || d === 2) moves.push({ from, to: c.id, kind: d === 1 ? "clone" : "jump" });
    }
  }
  return moves;
}

function applyMoveInstant(board, player, move) {
  const step = applyMoveStep(board, player, move);
  return step.finalBoard;
}

function applyMoveStep(board, player, move) {
  const fromCell = board[move.from];
  if (!fromCell || fromCell.owner !== player || board[move.to]) {
    return { ok: false, movedBoard: board, finalBoard: board, captured: [] };
  }

  const d = distance(getCell(move.from), getCell(move.to));
  if (d !== 1 && d !== 2) {
    return { ok: false, movedBoard: board, finalBoard: board, captured: [] };
  }

  let movedBoard = cloneBoard(board);
  if (d === 1) {
    movedBoard[move.to] = { owner: player, money: 0 };
  } else {
    movedBoard[move.to] = { ...movedBoard[move.from] };
    delete movedBoard[move.from];
  }
  movedBoard = redistribute(movedBoard);

  const captured = neighbors(move.to).filter((id) => movedBoard[id] && movedBoard[id].owner !== player);
  let finalBoard = cloneBoard(movedBoard);
  if (captured.length) {
    for (const id of captured) finalBoard[id] = { ...finalBoard[id], owner: player };
    finalBoard = redistribute(finalBoard);
  }

  return { ok: true, movedBoard, finalBoard, captured, kind: d === 1 ? "clone" : "jump" };
}

function checkGameOver(board, nextPlayer) {
  const alive = PLAYERS.filter((p) => ownedCells(board, p).length > 0);
  if (alive.length <= 1) {
    return { over: true, reason: "elimination", winner: alive[0] || null };
  }

  const filled = Object.keys(board).length === CELLS.length;
  if (filled) {
    const bank = banks(board);
    const winner = bank.G === bank.B ? null : bank.G > bank.B ? "G" : "B";
    return { over: true, reason: "board_full", winner };
  }

  const nextMoves = legalMoves(board, nextPlayer);
  if (!nextMoves.length) {
    const other = nextPlayer === "G" ? "B" : "G";
    const otherMoves = legalMoves(board, other);
    if (!otherMoves.length) {
      const bank = banks(board);
      const winner = bank.G === bank.B ? null : bank.G > bank.B ? "G" : "B";
      return { over: true, reason: "no_moves", winner };
    }
    return { over: false, reason: "skip", skipPlayer: nextPlayer, nextPlayer: other };
  }

  return { over: false, nextPlayer };
}

function evalBoard(board) {
  const bank = banks(board);
  const botCells = ownedCells(board, BOT).length;
  const humanCells = ownedCells(board, HUMAN).length;
  const botMoves = legalMoves(board, BOT).length;
  const humanMoves = legalMoves(board, HUMAN).length;
  const centerBonus = ownedCells(board, BOT).reduce((s, id) => s + (id === "C3" ? 2 : neighbors(id).length / 10), 0);
  return (bank.B - bank.G) + 1.5 * (botCells - humanCells) + 0.2 * (botMoves - humanMoves) + centerBonus;
}

function chooseBotStart(board) {
  let best = null;
  let bestScore = -Infinity;
  for (const c of CELLS) {
    if (!canPlaceInitial(board, BOT, c.id)) continue;
    const placed = placeInitial(board, BOT, c.id);
    const replies = legalMoves(placed, HUMAN);
    let worst = Infinity;
    if (!replies.length) worst = evalBoard(placed);
    for (const r of replies) {
      const afterHuman = applyMoveInstant(placed, HUMAN, r);
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
    const afterBot = applyMoveInstant(board, BOT, m);
    const status = checkGameOver(afterBot, HUMAN);
    if (status.over && status.winner === BOT) return m;

    const replies = legalMoves(afterBot, HUMAN);
    let worst = Infinity;
    if (!replies.length) worst = evalBoard(afterBot);
    for (const r of replies) {
      const afterHuman = applyMoveInstant(afterBot, HUMAN, r);
      worst = Math.min(worst, evalBoard(afterHuman));
    }

    if (worst > bestScore) {
      bestScore = worst;
      best = m;
    }
  }

  return best;
}

function money(v) {
  return Number(v || 0).toFixed(2);
}

export default function HexesMvp() {
  const [board, setBoard] = useState({});
  const [phase, setPhase] = useState("idle");
  const [firstPlayer, setFirstPlayer] = useState(null);
  const [turn, setTurn] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [winner, setWinner] = useState(null);
  const [log, setLog] = useState(["Нажми «Новая партия». Монетка решит, кто ставит и ходит первым."]);

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
    setLog([`Монетка: первым ставит и ходит ${PLAYER_NAME[first]}.`]);

    if (first === BOT) {
      setBusy(true);
      setTimeout(() => {
        const start = "C3";
        const next = placeInitial({}, BOT, start);
        setBoard(next);
        setTurn(HUMAN);
        setBusy(false);
        addLog(`Бот поставил стартовый гекс. Теперь стартовая ставка игрока.`);
      }, 500);
    } else {
      addLog("Выбери стартовую клетку игрока.");
    }
  }

  function finish(status) {
    setPhase("over");
    setWinner(status.winner);
    if (!status.winner) addLog("Игра окончена: ничья.");
    else addLog(`Игра окончена. Победил ${PLAYER_NAME[status.winner]}.`);
  }

  function continueAfterBoard(nextBoard, nextPlayer) {
    const status = checkGameOver(nextBoard, nextPlayer);
    if (status.over) {
      finish(status);
      return;
    }
    if (status.reason === "skip") {
      addLog(`${PLAYER_NAME[status.skipPlayer]} пропускает ход: нет доступных ходов.`);
      setTurn(status.nextPlayer);
      if (status.nextPlayer === BOT) setTimeout(() => botTurn(nextBoard), 500);
      return;
    }
    setTurn(nextPlayer);
    if (nextPlayer === BOT) setTimeout(() => botTurn(nextBoard), 500);
  }

  function animateMove(player, move, sourceBoard, afterDone) {
    const step = applyMoveStep(sourceBoard, player, move);
    if (!step.ok) return;

    setBusy(true);
    setSelected(null);
    setBoard(step.movedBoard);
    addLog(`${PLAYER_NAME[player]}: ${move.from} ${step.kind === "clone" ? "→" : "⇒"} ${move.to}.`);

    setTimeout(() => {
      setBoard(step.finalBoard);
      if (step.captured.length) addLog(`Захват: ${step.captured.length} гекс.`);
      setBusy(false);
      afterDone(step.finalBoard);
    }, step.captured.length ? 500 : 120);
  }

  function botTurn(sourceBoard = board) {
    if (phase === "over") return;
    const move = chooseBotMove(sourceBoard);
    if (!move) {
      continueAfterBoard(sourceBoard, HUMAN);
      return;
    }
    animateMove(BOT, move, sourceBoard, (finalBoard) => continueAfterBoard(finalBoard, HUMAN));
  }

  function handleSetupClick(id) {
    if (turn !== HUMAN || busy) return;
    const placedHuman = placeInitial(board, HUMAN, id);
    if (!placedHuman) {
      addLog("Эту клетку нельзя выбрать для стартовой ставки.");
      return;
    }

    setBoard(placedHuman);
    addLog("Игрок поставил стартовый гекс.");

    if (firstPlayer === HUMAN) {
      setBusy(true);
      setTimeout(() => {
        const botStart = chooseBotStart(placedHuman);
        if (!botStart) {
          finish({ winner: HUMAN });
          return;
        }
        const placedBot = placeInitial(placedHuman, BOT, botStart);
        setBoard(placedBot);
        setPhase("play");
        setTurn(HUMAN);
        setBusy(false);
        addLog("Бот поставил стартовый гекс. Ход игрока.");
      }, 500);
    } else {
      setPhase("play");
      continueAfterBoard(placedHuman, BOT);
    }
  }

  function handlePlayClick(id) {
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

    const move = { from: selected, to: id, kind: d === 1 ? "clone" : "jump" };
    animateMove(HUMAN, move, board, (finalBoard) => continueAfterBoard(finalBoard, BOT));
  }

  function handleCell(id) {
    if (phase === "idle" || phase === "over") return;
    if (phase === "setup") handleSetupClick(id);
    if (phase === "play") handlePlayClick(id);
  }

  function cellClass(id) {
    const v = board[id];
    const base = "absolute w-20 h-20 flex flex-col items-center justify-center select-none transition-all border-2 shadow-lg";
    const clip = { clipPath: "polygon(25% 4%, 75% 4%, 100% 50%, 75% 96%, 25% 96%, 0% 50%)" };
    const color = v ? COLOR[v.owner] : COLOR.empty;
    const canClick = !busy && ((phase === "setup" && turn === HUMAN && !v) || (phase === "play" && turn === HUMAN));
    const ring = selected === id ? " ring-4 ring-yellow-300 scale-105" : canClick ? " hover:scale-105 cursor-pointer" : " cursor-default";
    return { className: `${base} ${color}${ring}`, style: clip };
  }

  const statusText = (() => {
    if (phase === "idle") return "Готово к новой партии";
    if (phase === "setup") return turn === HUMAN ? "Выбери стартовую клетку" : "Бот выбирает стартовую клетку";
    if (phase === "play") return turn === HUMAN ? "Твой ход" : "Ход бота";
    if (winner) return `Победил ${PLAYER_NAME[winner]}`;
    return "Ничья";
  })();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="bg-slate-900 rounded-2xl p-6 shadow-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold">Hexes.online MVP</h1>
              <p className="text-slate-400 text-sm">{statusText}</p>
            </div>
            <button onClick={resetGame} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700">
              Новая партия
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="rounded-xl bg-emerald-500/15 border border-emerald-400/40 px-4 py-3">
              <div className="text-xs text-emerald-200">Баланс игрока</div>
              <div className="text-2xl font-bold">{money(bank.G)}</div>
            </div>
            <div className="rounded-xl bg-blue-500/15 border border-blue-400/40 px-4 py-3">
              <div className="text-xs text-blue-200">Баланс бота</div>
              <div className="text-2xl font-bold">{money(bank.B)}</div>
            </div>
          </div>

          <div className="relative mx-auto" style={{ width: 520, height: 520 }}>
            {CELLS.map((c) => {
              const left = 190 + c.x * 82;
              const top = 28 + c.y * 88;
              const v = board[c.id];
              const props = cellClass(c.id);
              return (
                <button key={c.id} onClick={() => handleCell(c.id)} className={props.className} style={{ ...props.style, left, top }}>
                  <div className="font-bold text-lg">{v ? v.owner : "·"}</div>
                  <div className="text-xs">{v ? money(v.money) : ""}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-xl">
            <h2 className="font-bold mb-3">Режим</h2>
            <div className="text-sm text-slate-300 space-y-2">
              <p>Игрок против бота.</p>
              <p>Первый игрок выбирается монеткой.</p>
              <p>Стартовый стек: 100.</p>
            </div>
          </div>

          <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-xl">
            <h2 className="font-bold mb-3">Управление</h2>
            <p className="text-sm text-slate-300 mb-2">На старте кликни пустую клетку для ставки.</p>
            <p className="text-sm text-slate-300 mb-2">В игре: свой гекс → пустая клетка.</p>
            <p className="text-sm text-slate-300">Соседняя клетка = клон. Через клетку = прыжок.</p>
          </div>

          <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-xl">
            <h2 className="font-bold mb-3">Лог</h2>
            <div className="space-y-2 text-sm text-slate-300">
              {log.map((l, i) => <div key={i} className="border-b border-slate-800 pb-2 last:border-0">{l}</div>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
