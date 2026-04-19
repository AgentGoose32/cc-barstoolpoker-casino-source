(function (window) {
  const STORAGE_KEY = 'hoh_casino_stats_v1';

  function roundNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return Math.round(num * 100) / 100;
  }

  function localDayKey(ts) {
    const d = new Date(ts || Date.now());
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function loadLedger() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { version: 1, days: {}, updatedAt: Date.now() };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') throw new Error('bad ledger');
      parsed.version = 1;
      parsed.days = parsed.days || {};
      return parsed;
    } catch (_err) {
      return { version: 1, days: {}, updatedAt: Date.now() };
    }
  }

  function saveLedger(ledger) {
    ledger.updatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ledger));
    return ledger;
  }

  function ensureGameBucket(ledger, dayKey, gameId, gameLabel) {
    ledger.days[dayKey] = ledger.days[dayKey] || { games: {} };
    const day = ledger.days[dayKey];
    day.games[gameId] = day.games[gameId] || {
      id: gameId,
      label: gameLabel || gameId,
      totals: { net: 0, eventCount: 0 },
      events: []
    };
    if (gameLabel) day.games[gameId].label = gameLabel;
    return day.games[gameId];
  }

  function appendEvent(gameId, gameLabel, event) {
    const ledger = loadLedger();
    const ts = event.ts || Date.now();
    const dayKey = localDayKey(ts);
    const bucket = ensureGameBucket(ledger, dayKey, gameId, gameLabel);
    const stored = {
      id: `${gameId}-${ts}-${Math.random().toString(36).slice(2, 8)}`,
      ts,
      type: event.type || 'event',
      delta: roundNumber(event.delta) || 0,
      balance: roundNumber(event.balance),
      net: roundNumber(event.net),
      round: Number.isFinite(Number(event.round)) ? Number(event.round) : null,
      note: event.note || '',
      details: event.details && typeof event.details === 'object' ? event.details : null
    };

    bucket.events.push(stored);
    bucket.totals.net = roundNumber((bucket.totals.net || 0) + stored.delta) || 0;
    bucket.totals.eventCount = bucket.events.length;
    if (stored.balance !== null) bucket.totals.lastBalance = stored.balance;
    if (stored.net !== null) bucket.totals.lastNet = stored.net;
    if (stored.round !== null) bucket.totals.lastRound = stored.round;
    bucket.updatedAt = ts;

    saveLedger(ledger);
    return stored;
  }

  function getDay(dayKey) {
    const ledger = loadLedger();
    const key = dayKey || localDayKey(Date.now());
    return ledger.days[key] || { games: {} };
  }

  function getTodaySummary() {
    const day = getDay();
    const games = Object.values(day.games || {}).sort((a, b) => (b.totals.net || 0) - (a.totals.net || 0));
    const totalNet = games.reduce((sum, game) => sum + (Number(game.totals.net) || 0), 0);
    const eventCount = games.reduce((sum, game) => sum + (Number(game.totals.eventCount) || 0), 0);
    return { dayKey: localDayKey(Date.now()), totalNet: roundNumber(totalNet) || 0, eventCount, games };
  }

  function clearAll() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function readNumberFromText(text) {
    if (!text) return null;
    const cleaned = String(text).replace(/[^0-9.+-]/g, '');
    if (!cleaned) return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }

  function makeGetter(fn, selector) {
    if (typeof fn === 'function') {
      return () => {
        try {
          const value = fn();
          return value === undefined ? null : value;
        } catch (_err) {
          return null;
        }
      };
    }

    if (selector) {
      return () => {
        const el = document.querySelector(selector);
        if (!el) return null;
        return readNumberFromText(el.textContent);
      };
    }

    return () => null;
  }

  function startTracker(config) {
    const gameId = config.gameId;
    const gameLabel = config.gameLabel || gameId;
    const getBalance = makeGetter(config.balanceGetter, config.balanceSelector);
    const getNet = makeGetter(config.netGetter, config.netSelector);
    const getRound = makeGetter(config.roundGetter, config.roundSelector);
    const getDetails = typeof config.detailGetter === 'function'
      ? () => {
          try {
            const details = config.detailGetter();
            return details && typeof details === 'object' ? details : null;
          } catch (_err) {
            return null;
          }
        }
      : () => null;
    const pollMs = Number(config.pollMs) || 800;
    const preferRoundEvents = config.preferRoundEvents !== false && (config.roundGetter || config.roundSelector);

    const state = {
      gameId,
      gameLabel,
      lastBalance: null,
      lastNet: null,
      lastRound: null,
      started: false
    };

    function sample() {
      const balance = roundNumber(getBalance());
      const net = roundNumber(getNet());
      const round = roundNumber(getRound());
      const details = getDetails();

      if (!state.started) {
        state.lastBalance = balance;
        state.lastNet = net;
        state.lastRound = round;
        state.started = true;
        return;
      }

      const roundChanged = round !== null && state.lastRound !== null && round > state.lastRound;
      const balanceChanged = balance !== null && state.lastBalance !== null && balance !== state.lastBalance;
      const netChanged = net !== null && state.lastNet !== null && net !== state.lastNet;

      if (preferRoundEvents && round !== null) {
        if (roundChanged) {
          const delta = netChanged ? net - state.lastNet : (balanceChanged ? balance - state.lastBalance : 0);
          appendEvent(gameId, gameLabel, {
            type: 'round',
            delta,
            balance,
            net,
            round,
            note: `${gameLabel} round ${round}`,
            details
          });
        }
      } else if (netChanged) {
        appendEvent(gameId, gameLabel, {
          type: 'net',
          delta: net - state.lastNet,
          balance,
          net,
          round,
          note: `${gameLabel} net changed`,
          details
        });
      } else if (balanceChanged) {
        appendEvent(gameId, gameLabel, {
          type: 'balance',
          delta: balance - state.lastBalance,
          balance,
          net,
          round,
          note: `${gameLabel} balance changed`,
          details
        });
      }

      state.lastBalance = balance;
      state.lastNet = net;
      state.lastRound = round;
    }

    sample();
    window.setInterval(sample, pollMs);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) sample();
    });
    window.addEventListener('beforeunload', sample);
  }

  window.CasinoStats = {
    STORAGE_KEY,
    loadLedger,
    saveLedger,
    getDay,
    getTodaySummary,
    clearAll,
    appendEvent,
    init: startTracker,
    localDayKey,
    readNumberFromText
  };
})(window);
