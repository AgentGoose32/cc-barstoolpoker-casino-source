(function () {
  const totalEl = document.getElementById('todayTotal');
  const metaEl = document.getElementById('todayMeta');
  const listEl = document.getElementById('gameList');
  const deepDiveTitleEl = document.getElementById('deepDiveTitle');
  const deepDiveBodyEl = document.getElementById('deepDiveBody');
  const clearAllBtn = document.getElementById('clearAllBtn');

  let selectedGameId = null;
  let expandedEventIds = new Set();

  function fmt(value) {
    const num = Number(value || 0);
    const prefix = num > 0 ? '+' : '';
    return `${prefix}${Math.round(num).toLocaleString()}g`;
  }

  function metricClass(value) {
    if (value > 0) return 'metric-positive';
    if (value < 0) return 'metric-negative';
    return 'metric-neutral';
  }

  function houseValue(value) {
    return 0 - Number(value || 0);
  }

  function normalizeGame(game) {
    const events = (game.events || []).map((event) => ({
      ...event,
      houseDelta: houseValue(event.delta),
      houseNet: event.net == null ? null : houseValue(event.net),
      details: event.details || null
    }));

    return {
      ...game,
      houseNet: houseValue(game.totals.net || 0),
      lastHouseNet: game.totals.lastNet == null ? null : houseValue(game.totals.lastNet),
      events
    };
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderPlayerBreakdown(event) {
    const players = event.details && Array.isArray(event.details.players) ? event.details.players : [];
    if (!players.length) {
      return '<div class="event-detail-empty">No individual player breakdown stored for this event.</div>';
    }

    return `
      <div class="player-breakdown">
        <div class="player-breakdown-title">Players in this event</div>
        <div class="player-list">
          ${players.map((player) => {
            const amount = player.amountText || '—';
            const amountClass = amount.trim().startsWith('-') ? 'metric-negative' : 'metric-positive';
            return `
              <div class="player-card">
                <div class="player-card-top">
                  <strong>${escapeHtml(player.name || 'Unknown')}</strong>
                  <span class="${amountClass}">${escapeHtml(amount)}</span>
                </div>
                <div class="player-card-meta">
                  ${escapeHtml(player.detailText || '')}
                  ${player.multiplierText ? `, ${escapeHtml(player.multiplierText)}` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderDeepDive(game) {
    if (!game) {
      deepDiveTitleEl.textContent = 'Deep dive';
      deepDiveBodyEl.innerHTML = '<div class="empty-state">Click a game to inspect today’s tracked events.</div>';
      return;
    }

    const events = [...(game.events || [])].sort((a, b) => b.ts - a.ts);
    deepDiveTitleEl.textContent = `${game.label} deep dive`;

    const rows = events.length
      ? events.map((event) => {
          const time = new Date(event.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
          const deltaClass = metricClass(event.houseDelta || 0);
          const canExpand = !!(event.details && Array.isArray(event.details.players) && event.details.players.length);
          const isExpanded = expandedEventIds.has(event.id);
          const mainRowClass = canExpand ? 'expandable-row' : '';
          const detailRow = canExpand ? `
            <tr class="detail-row ${isExpanded ? 'open' : ''}">
              <td colspan="7">
                <div class="detail-panel ${isExpanded ? 'open' : ''}">
                  ${renderPlayerBreakdown(event)}
                </div>
              </td>
            </tr>
          ` : '';
          return `
            <tr class="${mainRowClass}" data-event-id="${event.id}">
              <td>${time}</td>
              <td>${event.type || 'event'}</td>
              <td class="${deltaClass}">${fmt(event.houseDelta || 0)}</td>
              <td>${event.balance == null ? '—' : fmt(event.balance)}</td>
              <td>${event.houseNet == null ? '—' : fmt(event.houseNet)}</td>
              <td>${event.round == null ? '—' : event.round}</td>
              <td>${event.note || '—'}${canExpand ? '<div class="expand-hint">Click to view players</div>' : ''}</td>
            </tr>
            ${detailRow}
          `;
        }).join('')
      : '<tr><td colspan="7" class="empty-state">No tracked events yet for this game today.</td></tr>';

    deepDiveBodyEl.innerHTML = `
      <div class="deep-dive-summary">
        <div>
          <div class="metric-total ${metricClass(game.houseNet || 0)}">${fmt(game.houseNet || 0)}</div>
          <div class="metric-sub">${game.totals.eventCount || 0} tracked events today</div>
        </div>
        <div class="event-meta">
          Last player balance: ${game.totals.lastBalance == null ? '—' : fmt(game.totals.lastBalance)}<br>
          Last house net: ${game.lastHouseNet == null ? '—' : fmt(game.lastHouseNet)}
        </div>
      </div>
      <table class="events-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Type</th>
            <th>House Delta</th>
            <th>Player Balance</th>
            <th>House Net</th>
            <th>Round</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    deepDiveBodyEl.querySelectorAll('tr.expandable-row').forEach((row) => {
      row.addEventListener('click', function () {
        const eventId = this.getAttribute('data-event-id');
        if (!eventId) return;
        if (expandedEventIds.has(eventId)) expandedEventIds.delete(eventId);
        else expandedEventIds.add(eventId);
        renderDeepDive(game);
      });
    });
  }

  function render() {
    const summary = window.CasinoStats.getTodaySummary();
    const games = (summary.games || []).map(normalizeGame).sort((a, b) => (b.houseNet || 0) - (a.houseNet || 0));
    const totalHouseNet = games.reduce((sum, game) => sum + (Number(game.houseNet) || 0), 0);

    totalEl.textContent = fmt(totalHouseNet || 0);
    totalEl.className = `metric-total ${metricClass(totalHouseNet || 0)}`;
    metaEl.textContent = `${summary.eventCount || 0} tracked events across ${summary.games.length || 0} games today (${summary.dayKey}).`;

    if (!games.length) {
      listEl.innerHTML = '<div class="empty-state">No game stats tracked yet today. Play a game, then refresh this page.</div>';
      renderDeepDive(null);
      return;
    }

    if (!selectedGameId || !games.some((game) => game.id === selectedGameId)) {
      selectedGameId = games[0].id;
    }

    listEl.innerHTML = games.map((game) => {
      const active = game.id === selectedGameId ? 'active' : '';
      return `
        <button class="game-card ${active}" type="button" data-game-id="${game.id}">
          <div class="game-card-top">
            <strong>${game.label}</strong>
            <span class="${metricClass(game.houseNet || 0)}">${fmt(game.houseNet || 0)}</span>
          </div>
          <small>${game.totals.eventCount || 0} events today</small>
        </button>
      `;
    }).join('');

    listEl.querySelectorAll('[data-game-id]').forEach((button) => {
      button.addEventListener('click', function () {
        selectedGameId = this.getAttribute('data-game-id');
        render();
      });
    });

    renderDeepDive(games.find((game) => game.id === selectedGameId) || null);
  }

  clearAllBtn.addEventListener('click', function () {
    const ok = window.confirm('Clear all tracked casino CMS stats from this browser?');
    if (!ok) return;
    window.CasinoStats.clearAll();
    selectedGameId = null;
    render();
  });

  render();
})();
