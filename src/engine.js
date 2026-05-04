export const START_MONEY = 100
export const HUMAN = 'G'
export const BOT = 'B'
export const PLAYERS = ['G', 'B']

export const CELLS = [
  { id: 'A5', q: 0, r: -2 }, { id: 'B5', q: 1, r: -2 }, { id: 'C5', q: 2, r: -2 },
  { id: 'A4', q: -1, r: -1 }, { id: 'B4', q: 0, r: -1 }, { id: 'C4', q: 1, r: -1 }, { id: 'D4', q: 2, r: -1 },
  { id: 'A3', q: -2, r: 0 }, { id: 'B3', q: -1, r: 0 }, { id: 'C3', q: 0, r: 0 }, { id: 'D3', q: 1, r: 0 }, { id: 'E3', q: 2, r: 0 },
  { id: 'B2', q: -2, r: 1 }, { id: 'C2', q: -1, r: 1 }, { id: 'D2', q: 0, r: 1 }, { id: 'E2', q: 1, r: 1 },
  { id: 'C1', q: -2, r: 2 }, { id: 'D1', q: -1, r: 2 }, { id: 'E1', q: 0, r: 2 },
]

export function getCell(id) {
  return CELLS.find(c => c.id === id)
}

export function distance(a, b) {
  const dq = Math.abs(a.q - b.q)
  const dr = Math.abs(a.r - b.r)
  const ds = Math.abs((a.q + a.r) - (b.q + b.r))
  return (dq + dr + ds) / 2
}

export function neighbors(id) {
  const c = getCell(id)
  return CELLS.filter(n => n.id !== id && distance(c, n) === 1).map(n => n.id)
}

export function cloneBoard(board) {
  const out = {}
  for (const [id, v] of Object.entries(board)) out[id] = { ...v }
  return out
}

export function ownedCells(board, player) {
  return Object.entries(board).filter(([, v]) => v.owner === player).map(([id]) => id)
}

export function banks(board) {
  const result = { G: 0, B: 0 }
  for (const v of Object.values(board)) result[v.owner] += v.money
  return result
}

export function redistribute(board) {
  const result = cloneBoard(board)

  for (const player of PLAYERS) {
    const cells = ownedCells(result, player)
    if (!cells.length) continue

    const total = cells.reduce((sum, id) => sum + result[id].money, 0)
    const each = total / cells.length

    for (const id of cells) {
      result[id] = { owner: player, money: each }
    }
  }

  return result
}

export function canPlaceInitial(board, player, id) {
  if (!getCell(id)) return false
  if (board[id]) return false

  const enemyPlayers = PLAYERS.filter(p => p !== player)
  for (const enemy of enemyPlayers) {
    for (const enemyId of ownedCells(board, enemy)) {
      if (distance(getCell(id), getCell(enemyId)) === 1) return false
    }
  }

  return true
}

export function placeInitial(board, player, id) {
  if (!canPlaceInitial(board, player, id)) return null
  return redistribute({ ...board, [id]: { owner: player, money: START_MONEY } })
}

export function legalMoves(board, player) {
  const moves = []

  for (const from of ownedCells(board, player)) {
    for (const cell of CELLS) {
      if (board[cell.id]) continue

      const d = distance(getCell(from), cell)
      if (d === 1 || d === 2) {
        moves.push({
          from,
          to: cell.id,
          kind: d === 1 ? 'clone' : 'jump',
        })
      }
    }
  }

  return moves
}

export function applyMoveStep(board, player, move) {
  if (!move || !move.from || !move.to) {
    return { ok: false, movedBoard: board, finalBoard: board, captured: [] }
  }

  const fromCell = board[move.from]
  if (!fromCell || fromCell.owner !== player) {
    return { ok: false, movedBoard: board, finalBoard: board, captured: [] }
  }

  if (board[move.to]) {
    return { ok: false, movedBoard: board, finalBoard: board, captured: [] }
  }

  const from = getCell(move.from)
  const to = getCell(move.to)
  if (!from || !to) {
    return { ok: false, movedBoard: board, finalBoard: board, captured: [] }
  }

  const d = distance(from, to)
  if (d !== 1 && d !== 2) {
    return { ok: false, movedBoard: board, finalBoard: board, captured: [] }
  }

  let movedBoard = cloneBoard(board)

  if (d === 1) {
    movedBoard[move.to] = { owner: player, money: 0 }
  } else {
    movedBoard[move.to] = { ...movedBoard[move.from] }
    delete movedBoard[move.from]
  }

  movedBoard = redistribute(movedBoard)

  const captured = neighbors(move.to).filter(id => {
    return movedBoard[id] && movedBoard[id].owner !== player
  })

  let finalBoard = cloneBoard(movedBoard)

  if (captured.length) {
    for (const id of captured) {
      finalBoard[id] = { ...finalBoard[id], owner: player }
    }

    finalBoard = redistribute(finalBoard)
  }

  return {
    ok: true,
    movedBoard,
    finalBoard,
    captured,
    kind: d === 1 ? 'clone' : 'jump',
  }
}

export function applyMove(board, player, move) {
  return applyMoveStep(board, player, move).finalBoard
}

export function checkGameOver(board, nextPlayer) {
  const alive = PLAYERS.filter(player => ownedCells(board, player).length > 0)

  if (alive.length <= 1) {
    return {
      over: true,
      reason: 'elimination',
      winner: alive[0] || null,
    }
  }

  if (Object.keys(board).length === CELLS.length) {
    const bank = banks(board)
    return {
      over: true,
      reason: 'board_full',
      winner: bank.G === bank.B ? null : bank.G > bank.B ? 'G' : 'B',
    }
  }

  const nextMoves = legalMoves(board, nextPlayer)
  if (nextMoves.length > 0) {
    return { over: false, nextPlayer }
  }

  const other = nextPlayer === 'G' ? 'B' : 'G'
  const otherMoves = legalMoves(board, other)

  if (otherMoves.length > 0) {
    return {
      over: false,
      reason: 'skip',
      skipPlayer: nextPlayer,
      nextPlayer: other,
    }
  }

  const bank = banks(board)
  return {
    over: true,
    reason: 'no_moves',
    winner: bank.G === bank.B ? null : bank.G > bank.B ? 'G' : 'B',
  }
}

export function validateState(board) {
  const total = banks(board).G + banks(board).B
  const occupied = Object.keys(board)

  for (const id of occupied) {
    if (!getCell(id)) return { ok: false, error: `Unknown cell: ${id}` }
    if (!PLAYERS.includes(board[id].owner)) return { ok: false, error: `Bad owner: ${id}` }
    if (typeof board[id].money !== 'number') return { ok: false, error: `Bad money: ${id}` }
  }

  if (total < 0) return { ok: false, error: 'Negative total bank' }

  return { ok: true }
}