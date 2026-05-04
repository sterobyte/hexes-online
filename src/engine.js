export const START_MONEY = 100;
export const HUMAN = "G";
export const BOT = "B";
export const PLAYERS = [HUMAN, BOT];

export const CELLS = [
  { id: "A5", x: 0, y: 0 }, { id: "B5", x: 1, y: 0 }, { id: "C5", x: 2, y: 0 },
  { id: "A4", x: -0.5, y: 1 }, { id: "B4", x: 0.5, y: 1 }, { id: "C4", x: 1.5, y: 1 }, { id: "D4", x: 2.5, y: 1 },
  { id: "A3", x: -1, y: 2 }, { id: "B3", x: 0, y: 2 }, { id: "C3", x: 1, y: 2 }, { id: "D3", x: 2, y: 2 }, { id: "E3", x: 3, y: 2 },
  { id: "B2", x: -0.5, y: 3 }, { id: "C2", x: 0.5, y: 3 }, { id: "D2", x: 1.5, y: 3 }, { id: "E2", x: 2.5, y: 3 },
  { id: "C1", x: 0, y: 4 }, { id: "D1", x: 1, y: 4 }, { id: "E1", x: 2, y: 4 },
];

export function getCell(id) {
  return CELLS.find((c) => c.id === id);
}

export function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d <= 1.13) return 1;
  if (d <= 2.25) return 2;
  return 99;
}

export function neighbors(id) {
  const c = getCell(id);
  return CELLS
    .filter((n) => n.id !== id && dist(c, n) === 1)
    .map((n) => n.id);
}

export function ownedCells(board, player) {
  return Object.entries(board)
    .filter(([, v]) => v.owner === player)
    .map(([id]) => id);
}

export function banks(board) {
  const out = { G: 0, B: 0 };
  for (const v of Object.values(board)) {
    out[v.owner] += v.money;
  }
  return out;
}

export function redistribute(board) {
  const next = { ...board };

  for (const player of PLAYERS) {
    const cells = ownedCells(next, player);
    if (!cells.length) continue;

    const total = cells.reduce((s, id) => s + next[id].money, 0);
    const each = total / cells.length;

    for (const id of cells) {
      next[id] = { owner: player, money: each };
    }
  }

  return next;
}

export function canPlaceInitial(board, player, id) {
  if (board[id]) return false;

  const enemy = player === HUMAN ? BOT : HUMAN;

  for (const eid of ownedCells(board, enemy)) {
    if (dist(getCell(id), getCell(eid)) === 1) return false;
  }

  return true;
}

export function legalMoves(board, player) {
  const moves = [];

  for (const from of ownedCells(board, player)) {
    for (const c of CELLS) {
      if (board[c.id]) continue;

      const d = dist(getCell(from), c);
      if (d === 1 || d === 2) {
        moves.push({ from, to: c.id, d });
      }
    }
  }

  return moves;
}

export function applyMoveStep(board, player, move) {
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

  const captured = neighbors(move.to).filter(
    (id) => movedBoard[id] && movedBoard[id].owner !== player
  );

  let finalBoard = { ...movedBoard };

  if (captured.length) {
    for (const id of captured) {
      finalBoard[id] = { ...finalBoard[id], owner: player };
    }
    finalBoard = redistribute(finalBoard);
  }

  return { ok: true, movedBoard, finalBoard, captured, d };
}

export function applyMove(board, player, move) {
  return applyMoveStep(board, player, move).finalBoard;
}

export function checkGameOver(board, nextPlayer) {
  const alive = PLAYERS.filter(
    (p) => ownedCells(board, p).length > 0
  );

  if (alive.length <= 1) {
    return { over: true, winner: alive[0] || null };
  }

  if (Object.keys(board).length === CELLS.length) {
    const b = banks(board);
    return {
      over: true,
      winner: b.G === b.B ? null : b.G > b.B ? HUMAN : BOT,
    };
  }

  const nextMoves = legalMoves(board, nextPlayer);
  if (nextMoves.length > 0) return { over: false, nextPlayer };

  const other = nextPlayer === HUMAN ? BOT : HUMAN;
  const otherMoves = legalMoves(board, other);

  if (otherMoves.length > 0) {
    return { over: false, skipPlayer: nextPlayer, nextPlayer: other };
  }

  const b = banks(board);
  return {
    over: true,
    winner: b.G === b.B ? null : b.G > b.B ? HUMAN : BOT,
  };
}

export function evalBoard(board) {
  const b = banks(board);

  const botCells = ownedCells(board, BOT).length;
  const humanCells = ownedCells(board, HUMAN).length;

  const botMoves = legalMoves(board, BOT).length;
  const humanMoves = legalMoves(board, HUMAN).length;

  return (
    b.B - b.G +
    1.5 * (botCells - humanCells) +
    0.2 * (botMoves - humanMoves)
  );
}

export function chooseBotStart(board) {
  let best = null;
  let bestScore = -Infinity;

  for (const c of CELLS) {
    if (!canPlaceInitial(board, BOT, c.id)) continue;

    const placed = redistribute({
      ...board,
      [c.id]: { owner: BOT, money: START_MONEY },
    });

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

export function chooseBotMove(board) {
  const moves = legalMoves(board, BOT);

  let best = null;
  let bestScore = -Infinity;

  for (const m of moves) {
    const afterBot = applyMove(board, BOT, m);

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