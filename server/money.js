/* ============================================================
   kawaz1k.win — операции с балансом.

   Любое изменение баланса идёт через changeBalance(): оно
   одновременно меняет счёт пользователя и пишет запись в журнал
   операций (transactions) — сколько, за что и когда деньги
   пришли или ушли. Журнал нельзя «забыть» записать.
   ============================================================ */

const db = require('./db');

const MAX_TX = 500;

const pushTx = ({ nick, amount, balance, reason, ref, by }) => {
  const txs = db.read('transactions');
  txs.unshift({
    id: db.uid(),
    nick,
    amount,            // + приход, − расход (уже с учётом ограничения «не ниже нуля»)
    balance,           // остаток после операции
    reason,            // order | refund | admin | seed | ...
    ref: ref || '',    // id заказа и т.п.
    by: by || '',      // кто инициировал
    ts: Date.now()
  });
  if (txs.length > MAX_TX) txs.length = MAX_TX;
  db.write('transactions', txs);
};

/**
 * Меняет баланс пользователя и журналирует операцию.
 * @param {string} nick   кому менять
 * @param {number} amount + добавить, − списать
 * @param {{reason?:string, ref?:string, by?:string}} opts
 * @returns {{ok:boolean, error?:string, user?:object, balance?:number, applied?:number}}
 */
function changeBalance(nick, amount, opts = {}) {
  const { reason = 'manual', ref = '', by = '' } = opts;

  const users = db.read('users');
  const u = users.find(x => x.nick === nick);
  if (!u) return { ok: false, error: 'Пользователь не найден' };

  const delta = Math.trunc(Number(amount));
  if (!delta || Number.isNaN(delta)) return { ok: false, error: 'Неверная сумма' };

  const before = u.balance || 0;
  const after  = Math.max(0, before + delta);      // в минус уйти нельзя
  u.balance   = after;
  db.write('users', users);

  pushTx({ nick, amount: after - before, balance: after, reason, ref, by });
  return { ok: true, user: u, balance: after, applied: after - before };
}

/* журнал операций конкретного пользователя (новые сверху) */
function history(nick, limit = 50) {
  return db.read('transactions').filter(t => t.nick === nick).slice(0, limit);
}

module.exports = { changeBalance, history };
