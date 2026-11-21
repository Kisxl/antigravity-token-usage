(() => {
  const POLL_MS = 5000;
  const $ = (id) => document.getElementById(id);

  const I18N = {
    zh: {
      pageTitle: 'Token 用量',
      liveTitle: '自动同步本地日志',
      refreshTitle: '立即刷新',
      scopeAll: '总计',
      scopeToday: '今日新增',
      kpiTotalLbl: '累计 Token 数',
      kpiTodayLbl: '今日新增 Token',
      kpiCostLbl: (cny) => `估算费用 · ≈${cny}`,
      kpiTodayCostLbl: (cny) => `今日费用 · ≈${cny}`,
      costTitle: '按各模型官网 API 公开单价估算（含缓存折扣），仅供参考',
      kpiPeakLbl: 'Token 使用峰值',
      kpiTodayPeakLbl: '今日会话峰值',
      kpiLongestLbl: '最长任务用时',
      kpiTodayDurLbl: '今日活跃用时',
      kpiMaxStreakLbl: '最长连续天数',
      kpiCurStreakLbl: '当前连续天数',
      activityTitle: 'Token 活动',
      tabDaily: '每天',
      tabWeekly: '每周',
      tabCumulative: '累计总量',
      detailDay: '单日明细',
      detailTop: '历史会话排行',
      todayDetailTitle: (d) => `今日明细 (${d})`,
      dayDetailTitle: (d) => `单日明细 (${d})`,
      topDetailTitle: '历史会话排行',
      subagent: '子代理',
      noDayRecords: (d) => `${d} 暂无 Token 消耗记录`,
      noConvRecords: '暂无会话记录',
      daysUnit: (n) => `${n} 天`,
      daySummarySub: (n, tot) => `${n} 个会话 · 合计 ${tot}`,
      topSummarySub: (n, totalConvs) => `Top ${n} · 共 ${totalConvs} 个会话`,
      convDayRight: (s, dur, cost) => `${s} 步 · ${dur} · ${cost}`,
      convTopRight: (s, d, cost) => `${s} 步 · ${d || '—'} · ${cost}`,
      fmtDayDate: (dateKey) => {
        const [, m, d] = dateKey.split('-').map(Number);
        return `${m}月${d}日`;
      },
      fmtWeekTitle: (dateKey) => {
        const [y, m, d] = dateKey.split('-').map(Number);
        return `${y}年${m}月${d}日 起的一周`;
      },
      fmtCumTitle: (dateKey) => {
        const [y, m, d] = dateKey.split('-').map(Number);
        return `累计至 ${y}年${m}月${d}日 起的一周`;
      },
      fmtTokLine: (val, cost) =>
        cost === undefined ? `${fmtTokens(val)} 个 Token` : `${fmtTokens(val)} 个 Token · ${fmtCost(cost)}`,
      modelsTitle: '模型分布',
      mscopeAll: '累计',
      mscopeDay: '所选日期',
      modelsSubAll: (n, tot) => `${n} 个模型 · 累计 ${tot}`,
      modelsSubDay: (d, n, tot) => `${d} · ${n} 个模型 · 合计 ${tot}`,
      noModelRecords: '暂无模型用量记录',
      modelRight: (cost, pct, s) => `${cost} · ${pct} · ${s} 步`,
      months: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    },
    en: {
      pageTitle: 'Token Usage',
      liveTitle: 'Auto-syncing local logs',
      refreshTitle: 'Refresh now',
      scopeAll: 'All Time',
      scopeToday: 'Today',
      kpiTotalLbl: 'Total Tokens',
      kpiTodayLbl: 'Tokens Today',
      kpiCostLbl: () => 'Est. Cost',
      kpiTodayCostLbl: () => 'Cost Today',
      costTitle: 'Estimated from public API list prices (incl. cache discount); for reference only',
      kpiPeakLbl: 'Peak Daily Usage',
      kpiTodayPeakLbl: 'Top Session Today',
      kpiLongestLbl: 'Longest Task',
      kpiTodayDurLbl: 'Active Time Today',
      kpiMaxStreakLbl: 'Longest Streak',
      kpiCurStreakLbl: 'Current Streak',
      activityTitle: 'Token Activity',
      tabDaily: 'Daily',
      tabWeekly: 'Weekly',
      tabCumulative: 'Cumulative',
      detailDay: 'By Day',
      detailTop: 'Top Sessions',
      todayDetailTitle: (d) => `Today (${d})`,
      dayDetailTitle: (d) => `Daily Breakdown (${d})`,
      topDetailTitle: 'Top Sessions',
      subagent: 'Subagent',
      noDayRecords: (d) => `No token usage on ${d}`,
      noConvRecords: 'No sessions recorded',
      daysUnit: (n) => `${n}d`,
      daySummarySub: (n, tot) => `${n} sessions · Total ${tot}`,
      topSummarySub: (n, totalConvs) => `Top ${n} · ${totalConvs} sessions`,
      convDayRight: (s, dur, cost) => `${s} steps · ${dur} · ${cost}`,
      convTopRight: (s, d, cost) => `${s} steps · ${d || '—'} · ${cost}`,
      fmtDayDate: (dateKey) => {
        const [y, m, d] = dateKey.split('-').map(Number);
        return `${I18N.en.months[m - 1]} ${d}, ${y}`;
      },
      fmtWeekTitle: (dateKey) => {
        const [y, m, d] = dateKey.split('-').map(Number);
        return `Week of ${I18N.en.months[m - 1]} ${d}, ${y}`;
      },
      fmtCumTitle: (dateKey) => {
        const [y, m, d] = dateKey.split('-').map(Number);
        return `Cumulative through week of ${I18N.en.months[m - 1]} ${d}, ${y}`;
      },
      fmtTokLine: (val, cost) =>
        cost === undefined ? `${fmtTokens(val)} tokens` : `${fmtTokens(val)} tokens · ${fmtCost(cost)}`,
      modelsTitle: 'Models',
      mscopeAll: 'All Time',
      mscopeDay: 'Selected Day',
      modelsSubAll: (n, tot) => `${n} models · Total ${tot}`,
      modelsSubDay: (d, n, tot) => `${d} · ${n} models · Total ${tot}`,
      noModelRecords: 'No model usage recorded',
      modelRight: (cost, pct, s) => `${cost} · ${pct} · ${s} steps`,
      months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    },
  };

  function loadPref(key, allowed, fallback) {
    try {
      const v = localStorage.getItem(key);
      return allowed.includes(v) ? v : fallback;
    } catch {
      return fallback;
    }
  }

  function savePref(key, val) {
    try { localStorage.setItem(key, val); } catch { /* ignore */ }
  }

  const state = {
    snap: null,
    etag: '',
    lang: loadPref('tokenUsage.lang', ['zh', 'en'], 'zh'),
    scope: loadPref('tokenUsage.scope', ['all', 'today'], 'all'),
    view: 'daily',     // 'daily' | 'weekly' | 'cumulative'
    detail: 'day',     // 'day' | 'top'
    mscope: loadPref('tokenUsage.scope', ['all', 'today'], 'all') === 'today' ? 'day' : 'all',
    selectedDate: '',
    autoFollowToday: true,
    didScrollHeatmap: false,
    colMeta: [],       // tooltip metadata per column for weekly/cumulative modes
  };

  const t = () => I18N[state.lang] || I18N.zh;

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );

  function syncScheme() {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;color:var(--background, #141416)';
    document.documentElement.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    const nums = (c.match(/[\d.]+/g) || []).map(Number);
    if (nums.length < 3) return;
    const scale = c.startsWith('color(') ? 1 : 255;
    const [r, g, b] = nums.slice(0, 3).map((v) => v / scale);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    document.documentElement.dataset.theme = lum < 0.5 ? 'dark' : 'light';
  }
  syncScheme();
  new MutationObserver(syncScheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style'],
  });

  function fmtTokens(n) {
    const v = Number(n) || 0;
    if (state.lang === 'en') {
      if (v >= 1e9) return `${(v / 1e9).toFixed(2).replace(/\.?0+$/, '')}B`;
      if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
      if (v >= 1e3) return `${(v / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
      return v.toLocaleString('en-US');
    }
    if (v >= 1e8) {
      return `${(v / 1e8).toFixed(1).replace(/\.0$/, '')}亿`;
    }
    if (v >= 1e4) {
      return `${(v / 1e4).toFixed(1).replace(/\.0$/, '')}万`;
    }
    return v.toLocaleString('zh-CN');
  }

  function fmtCost(usd) {
    const v = Number(usd) || 0;
    if (v >= 1000) return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    if (v >= 100) return `$${v.toFixed(0)}`;
    return `$${v.toFixed(2)}`;
  }

  function fmtCny(usd) {
    const rate = state.snap?.pricing?.cnyRate || 7.2;
    return `¥${Math.round((Number(usd) || 0) * rate).toLocaleString('zh-CN')}`;
  }

  function fmtDuration(ms) {
    const totalSec = Math.max(0, Math.round((Number(ms) || 0) / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (state.lang === 'en') {
      if (h > 0) return `${h}h ${m}m`;
      if (m > 0) return `${m}m ${s}s`;
      return `${s}s`;
    }
    if (totalSec === 0) return '0 秒';
    if (h > 0) return `${h}小时 ${m}分`;
    if (m > 0) return `${m}分 ${s} 秒`;
    return `${s} 秒`;
  }

  function parseDateKey(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function toDateKey(dt) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function setKpi(attr, text) {
    const el = document.querySelector(`[data-kpi="${attr}"]`);
    if (el) el.textContent = text;
  }

  function applyStaticLabels() {
    const tr = t();
    document.documentElement.lang = state.lang === 'en' ? 'en' : 'zh-CN';
    document.title = tr.pageTitle;
    $('page-title').textContent = tr.pageTitle;
    $('live-dot').title = tr.liveTitle;
    $('refresh-btn').title = tr.refreshTitle;
    $('activity-title').textContent = tr.activityTitle;

    document.querySelector('.seg-btn[data-scope="all"]').textContent = tr.scopeAll;
    document.querySelector('.seg-btn[data-scope="today"]').textContent = tr.scopeToday;
    document.querySelector('.tab-btn[data-view="daily"]').textContent = tr.tabDaily;
    document.querySelector('.tab-btn[data-view="weekly"]').textContent = tr.tabWeekly;
    document.querySelector('.tab-btn[data-view="cumulative"]').textContent = tr.tabCumulative;
    document.querySelector('.tab-btn[data-detail="day"]').textContent = tr.detailDay;
    document.querySelector('.tab-btn[data-detail="top"]').textContent = tr.detailTop;
    $('models-title').textContent = tr.modelsTitle;
    document.querySelector('.tab-btn[data-mscope="all"]').textContent = tr.mscopeAll;
    document.querySelector('.tab-btn[data-mscope="day"]').textContent = tr.mscopeDay;
    document.querySelectorAll('.tab-btn[data-mscope]').forEach((b) => {
      const active = b.dataset.mscope === state.mscope;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });

    document.querySelectorAll('.seg-btn[data-lang]').forEach((b) => {
      b.classList.toggle('active', b.dataset.lang === state.lang);
    });
    document.querySelectorAll('.seg-btn[data-scope]').forEach((b) => {
      b.classList.toggle('active', b.dataset.scope === state.scope);
    });
    document.querySelectorAll('.tab-btn[data-view]').forEach((b) => {
      const active = b.dataset.view === state.view;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
  }

  const tooltip = $('tooltip');
  function showTooltip(clientX, clientY, html) {
    tooltip.innerHTML = html;
    tooltip.classList.remove('hidden');
    const pad = 12;
    const rect = tooltip.getBoundingClientRect();
    let x = clientX + 12;
    let y = clientY - rect.height - 10;
    if (x + rect.width + pad > window.innerWidth) x = Math.max(pad, clientX - rect.width - 12);
    if (y < pad) y = clientY + 14;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }
  function hideTooltip() {
    tooltip.classList.add('hidden');
  }

  function renderKpis(snap) {
    const tr = t();
    const st = snap.streaks.total;
    const todayConvs = snap.today.conversations || [];

    if (state.scope === 'today') {
      const todayCost = snap.today.cost || 0;
      setKpi('total-lbl', tr.kpiTodayLbl);
      setKpi('total-val', fmtTokens(snap.today.total || 0));
      $('kpi-total').title = `${snap.todayKey}`;

      setKpi('cost-val', fmtCost(todayCost));
      setKpi('cost-lbl', tr.kpiTodayCostLbl(fmtCny(todayCost)));

      const topToday = todayConvs[0];
      setKpi('peak-lbl', tr.kpiTodayPeakLbl);
      setKpi('peak-val', fmtTokens(topToday ? topToday.total : 0));
      $('kpi-peak').title = topToday ? topToday.title : '';

      const todayActiveMs = todayConvs.reduce((s, c) => s + (c.activeMs || 0), 0);
      setKpi('longest-lbl', tr.kpiTodayDurLbl);
      setKpi('longest-val', fmtDuration(todayActiveMs));
      $('kpi-longest').title = snap.todayKey;
    } else {
      const totalCost = snap.totals.cost || 0;
      setKpi('total-lbl', tr.kpiTotalLbl);
      setKpi('total-val', fmtTokens(snap.totals.total));
      $('kpi-total').title = '';

      setKpi('cost-val', fmtCost(totalCost));
      setKpi('cost-lbl', tr.kpiCostLbl(fmtCny(totalCost)));

      const peak = snap.peaks.dailyTotal;
      setKpi('peak-lbl', tr.kpiPeakLbl);
      setKpi('peak-val', fmtTokens(peak.value));
      $('kpi-peak').title = peak.date || '';

      setKpi('longest-lbl', tr.kpiLongestLbl);
      setKpi('longest-val', fmtDuration(snap.longestTask.durationMs));
      $('kpi-longest').title = snap.longestTask.title ? `${snap.longestTask.title} (${snap.longestTask.date})` : '';
    }

    $('kpi-cost').title = tr.costTitle;

    setKpi('max-streak-lbl', tr.kpiMaxStreakLbl);
    setKpi('max-streak-val', tr.daysUnit(st.longest));

    setKpi('cur-streak-lbl', tr.kpiCurStreakLbl);
    setKpi('cur-streak-val', tr.daysUnit(st.current));
  }

  /**
   * Renders all three Codex views (Daily, Weekly, Cumulative) onto the unified 53x7 matrix.
   */
  function renderMatrix(snap) {
    const tr = t();
    const dailyByDate = new Map(snap.daily.map((d) => [d.date, d]));
    const todayDt = parseDateKey(snap.todayKey);
    const todayMs = todayDt.getTime();

    const endDt = new Date(todayDt);
    endDt.setDate(endDt.getDate() + (6 - endDt.getDay()));
    const startDt = new Date(endDt);
    startDt.setDate(startDt.getDate() - (53 * 7 - 1));

    // Build 53 weeks x 7 days data structure
    const weeks = [];
    const cursor = new Date(startDt);
    let runningCum = 0;
    let runningCumCost = 0;

    // Account for any tokens earlier than the 53-week window in cumulative baseline
    const startKey = toDateKey(startDt);
    for (const d of snap.daily) {
      if (d.date < startKey) {
        runningCum += d.total || 0;
        runningCumCost += d.cost || 0;
      }
    }

    for (let w = 0; w < 53; w++) {
      const days = [];
      let weekTotal = 0;
      let weekCost = 0;
      let colMonth = -1;
      for (let dow = 0; dow < 7; dow++) {
        const dt = new Date(cursor);
        const key = toDateKey(dt);
        const isFuture = dt.getTime() > todayMs;
        if (colMonth === -1 && dt.getDate() === 1 && !isFuture) {
          colMonth = dt.getMonth();
        }
        const rec = dailyByDate.get(key);
        const val = !isFuture && rec ? rec.total || 0 : 0;
        const cost = !isFuture && rec ? rec.cost || 0 : 0;
        weekTotal += val;
        weekCost += cost;
        days.push({ key, val, cost, isFuture });
        cursor.setDate(cursor.getDate() + 1);
      }
      runningCum += weekTotal;
      runningCumCost += weekCost;
      weeks.push({
        weekIdx: w,
        startKey: days[0].key,
        days,
        weekTotal,
        weekCost,
        cumTotal: runningCum,
        cumCost: runningCumCost,
        colMonth,
      });
    }

    // Compute color / height scaling per view mode
    const dailyVals = snap.daily.map((d) => d.total || 0).filter((v) => v > 0).sort((a, b) => a - b);
    const q = (p) => (dailyVals.length ? dailyVals[Math.min(dailyVals.length - 1, Math.floor((dailyVals.length - 1) * p))] : 0);
    const [d1, d2, d3] = [q(0.25), q(0.5), q(0.8)];
    const dailyLevel = (v) => {
      if (v <= 0) return 0;
      if (v <= d1) return 1;
      if (v <= d2) return 2;
      if (v <= d3) return 3;
      return 4;
    };

    const maxWeek = Math.max(1, ...weeks.map((w) => w.weekTotal));
    const maxCum = Math.max(1, ...weeks.map((w) => w.cumTotal));

    const cells = [];
    const monthMarks = [];
    let lastMonth = -1;
    state.colMeta = [];

    for (const wk of weeks) {
      if (wk.colMonth !== -1 && wk.colMonth !== lastMonth) {
        monthMarks.push({ week: wk.weekIdx, label: tr.months[wk.colMonth] });
        lastMonth = wk.colMonth;
      }

      if (state.view === 'daily') {
        for (const day of wk.days) {
          const lv = day.isFuture ? 0 : dailyLevel(day.val);
          const sel = day.key === state.selectedDate ? ' selected' : '';
          const fut = day.isFuture ? ' future' : '';
          cells.push(
            `<button type="button" class="cell lv-${lv}${fut}${sel}" ` +
            `${day.isFuture ? 'disabled aria-hidden="true"' : `data-date="${day.key}" data-val="${day.val}" data-cost="${day.cost}"`}></button>`
          );
        }
      } else {
        const isWeekly = state.view === 'weekly';
        const metric = isWeekly ? wk.weekTotal : wk.cumTotal;
        const denom = isWeekly ? maxWeek : maxCum;
        // In cumulative mode, light up weeks that had activity or keep step continuity cleanly like Codex
        const hasActivity = isWeekly ? wk.weekTotal > 0 : wk.cumTotal > 0 && wk.weekTotal > 0;
        const litCount = hasActivity ? Math.max(1, Math.min(7, Math.ceil((metric / denom) * 7))) : 0;
        const tone = litCount >= 6 ? 4 : 3;

        state.colMeta[wk.weekIdx] = {
          startKey: wk.startKey,
          val: metric,
          cost: isWeekly ? wk.weekCost : wk.cumCost,
        };

        for (let dow = 0; dow < 7; dow++) {
          const isLit = dow >= 7 - litCount;
          const lv = isLit ? tone : 0;
          cells.push(
            `<button type="button" class="cell lv-${lv}" data-col="${wk.weekIdx}"></button>`
          );
        }
      }
    }

    $('heatmap-grid').innerHTML = cells.join('');
    $('heatmap-months').innerHTML = monthMarks
      .map((m) => `<span class="month-label" style="left:${m.week * 17}px">${esc(m.label)}</span>`)
      .join('');

    if (!state.didScrollHeatmap) {
      const scroller = $('heatmap-scroll');
      scroller.scrollLeft = scroller.scrollWidth;
      state.didScrollHeatmap = true;
    }
  }

  function renderDetails(snap) {
    const tr = t();
    const listEl = $('details-list');
    const canJump = Boolean(window.sidecar?.ui?.toggleConversation);

    if (state.detail === 'day') {
      const dateKey = state.selectedDate || snap.todayKey;
      const items = snap.byDayConversations[dateKey] || [];
      const dayTotal = items.reduce((s, x) => s + (x.total || 0), 0);
      $('details-title').textContent =
        dateKey === snap.todayKey ? tr.todayDetailTitle(dateKey) : tr.dayDetailTitle(dateKey);
      $('details-sub').textContent = tr.daySummarySub(items.length, fmtTokens(dayTotal));

      if (!items.length) {
        listEl.innerHTML = `<div class="empty-state">${esc(tr.noDayRecords(dateKey))}</div>`;
        return;
      }
      listEl.innerHTML = items
        .map((c) => renderConvRow(c, canJump, tr.convDayRight(c.steps, fmtDuration(c.activeMs), fmtCost(c.cost))))
        .join('');
    } else {
      const items = snap.topConversations || [];
      $('details-title').textContent = tr.topDetailTitle;
      $('details-sub').textContent = tr.topSummarySub(items.length, snap.totals.conversations);

      if (!items.length) {
        listEl.innerHTML = `<div class="empty-state">${esc(tr.noConvRecords)}</div>`;
        return;
      }
      listEl.innerHTML = items
        .map((c) => renderConvRow(c, canJump, tr.convTopRight(c.steps, c.lastDate, fmtCost(c.cost))))
        .join('');
    }
  }

  function renderConvRow(c, canJump, rightSub) {
    const tr = t();
    const titleClass = canJump ? 'detail-title clickable' : 'detail-title';
    const subBadge = c.isSubagent ? `<span class="badge">${esc(tr.subagent)}</span>` : '';
    return `
      <div class="detail-row">
        <div class="detail-main">
          <div class="detail-title-row">
            <span class="${titleClass}" data-conv="${esc(c.conversationId)}">${esc(c.title)}</span>
            ${subBadge}
          </div>
        </div>
        <div class="detail-metrics">
          <div class="detail-tok">${esc(fmtTokens(c.total || 0))}</div>
          <div class="detail-sub">${esc(rightSub)}</div>
        </div>
      </div>
    `;
  }

  function renderModels(snap) {
    const tr = t();
    const listEl = $('models-list');
    const models = snap.models || { total: [], byDay: {} };
    const dateKey = state.selectedDate || snap.todayKey;
    const items = state.mscope === 'day' ? models.byDay[dateKey] || [] : models.total || [];
    const sum = items.reduce((s, m) => s + (m.total || 0), 0);
    $('models-sub').textContent =
      state.mscope === 'day'
        ? tr.modelsSubDay(dateKey, items.length, fmtTokens(sum))
        : tr.modelsSubAll(items.length, fmtTokens(sum));

    if (!items.length) {
      listEl.innerHTML = `<div class="empty-state">${esc(tr.noModelRecords)}</div>`;
      return;
    }
    const max = items[0].total || 1;
    listEl.innerHTML = items
      .map((m) => {
        const pct = sum ? `${((m.total / sum) * 100).toFixed(1)}%` : '0%';
        const width = Math.max(1, (m.total / max) * 100).toFixed(1);
        return `
          <div class="detail-row model-row">
            <div class="model-head">
              <span class="detail-title">${esc(m.name)}</span>
              <span class="detail-metrics">
                <span class="detail-tok">${esc(fmtTokens(m.total))}</span>
                <span class="detail-sub"> · ${esc(tr.modelRight(fmtCost(m.cost), pct, m.steps))}</span>
              </span>
            </div>
            <div class="model-bar"><span style="width:${width}%"></span></div>
            <div class="model-split">In ${esc(fmtTokens(m.input))} · Cache ${esc(fmtTokens(m.cacheRead))} · Out ${esc(fmtTokens(m.output))}</div>
          </div>
        `;
      })
      .join('');
  }

  function renderAll() {
    applyStaticLabels();
    if (!state.snap) return;
    if (state.autoFollowToday || !state.selectedDate) {
      state.selectedDate = state.snap.todayKey;
    }
    renderKpis(state.snap);
    renderMatrix(state.snap);
    renderModels(state.snap);
    renderDetails(state.snap);
  }

  async function fetchStats(force = false) {
    const btn = $('refresh-btn');
    if (force) btn.classList.add('spinning');
    try {
      const fetcher = window.sidecar?.fetch ? window.sidecar.fetch.bind(window.sidecar) : fetch;
      const qs = !force && state.etag ? `?etag=${encodeURIComponent(state.etag)}` : '';
      const res = await fetcher(`/api/stats${qs}`, { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      $('live-dot').classList.remove('error');
      if (data.unchanged) return;
      state.etag = data.etag || '';
      state.snap = data;
      renderAll();
    } catch (err) {
      console.error('Failed to fetch token stats:', err);
      $('live-dot').classList.add('error');
    } finally {
      if (force) btn.classList.remove('spinning');
    }
  }

  document.querySelectorAll('.seg-btn[data-scope]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.scope = btn.dataset.scope;
      savePref('tokenUsage.scope', state.scope);
      state.mscope = state.scope === 'today' ? 'day' : 'all';
      if (state.scope === 'today' && state.snap) {
        state.selectedDate = state.snap.todayKey;
        state.autoFollowToday = true;
        state.detail = 'day';
        document.querySelectorAll('.tab-btn[data-detail]').forEach((b) => {
          const active = b.dataset.detail === 'day';
          b.classList.toggle('active', active);
          b.setAttribute('aria-selected', String(active));
        });
      }
      renderAll();
    });
  });

  document.querySelectorAll('.seg-btn[data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.lang = btn.dataset.lang;
      savePref('tokenUsage.lang', state.lang);
      renderAll();
    });
  });

  document.querySelectorAll('.tab-btn[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      renderAll();
    });
  });

  document.querySelectorAll('.tab-btn[data-detail]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.detail = btn.dataset.detail;
      document.querySelectorAll('.tab-btn[data-detail]').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', String(active));
      });
      if (state.snap) renderDetails(state.snap);
    });
  });

  $('refresh-btn').addEventListener('click', () => fetchStats(true));

  document.querySelectorAll('.tab-btn[data-mscope]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.mscope = btn.dataset.mscope;
      renderAll();
    });
  });

  function clearColHover() {
    document.querySelectorAll('.cell.col-hover').forEach((el) => el.classList.remove('col-hover'));
  }

  $('heatmap-grid').addEventListener('mouseover', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell || !state.snap) return;
    const tr = t();
    clearColHover();

    if (cell.dataset.date) {
      const val = Number(cell.dataset.val) || 0;
      const cost = Number(cell.dataset.cost) || 0;
      showTooltip(
        e.clientX,
        e.clientY,
        `<div class="tt-title">${esc(tr.fmtDayDate(cell.dataset.date))}</div>
         <div class="tt-val">${esc(tr.fmtTokLine(val, cost))}</div>`
      );
    } else if (cell.dataset.col !== undefined) {
      const col = Number(cell.dataset.col);
      document.querySelectorAll(`.cell[data-col="${col}"]`).forEach((el) => el.classList.add('col-hover'));
      const meta = state.colMeta[col];
      if (!meta) return;
      const heading = state.view === 'weekly' ? tr.fmtWeekTitle(meta.startKey) : tr.fmtCumTitle(meta.startKey);
      showTooltip(
        e.clientX,
        e.clientY,
        `<div class="tt-title">${esc(heading)}</div>
         <div class="tt-val">${esc(tr.fmtTokLine(meta.val, meta.cost || 0))}</div>`
      );
    }
  });

  $('heatmap-grid').addEventListener('mouseleave', () => {
    clearColHover();
    hideTooltip();
  });

  $('heatmap-grid').addEventListener('click', (e) => {
    const cell = e.target.closest('.cell[data-date]');
    if (!cell) return;
    state.selectedDate = cell.dataset.date;
    state.autoFollowToday = state.selectedDate === state.snap?.todayKey;
    state.detail = 'day';
    state.mscope = 'day';
    document.querySelectorAll('.tab-btn[data-detail]').forEach((b) => {
      const active = b.dataset.detail === 'day';
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
    renderAll();
  });

  $('details-list').addEventListener('click', (e) => {
    const titleEl = e.target.closest('.detail-title.clickable[data-conv]');
    if (!titleEl) return;
    window.sidecar?.ui?.toggleConversation?.(titleEl.dataset.conv);
  });

  applyStaticLabels();
  fetchStats(true);
  setInterval(() => {
    if (!document.hidden) fetchStats(false);
  }, POLL_MS);
})();
