const API_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=200";
const REFRESH_INTERVAL = 60_000;
const INITIAL_DATE_GROUPS = 7;
const TAIWAN_TIME_ZONE = "Asia/Taipei";
const KNOCKOUT_STAGES = [
  { slug: "round-of-32", label: "32 強" },
  { slug: "round-of-16", label: "16 強" },
  { slug: "quarterfinals", label: "8 強" },
  { slug: "semifinals", label: "4 強" },
  { slug: "third-place", label: "季軍賽" },
  { slug: "final", label: "冠軍賽" }
];

// Elo ratings calculated from 49,000+ international results through 2026-06-10.
const BASE_ELO = {
  Algeria: 1823, Argentina: 1909, Australia: 1799, Austria: 1710,
  Belgium: 1794, "Bosnia and Herzegovina": 1487, Brazil: 1830, Canada: 1751,
  "Cape Verde Islands": 1593, Colombia: 1800, Croatia: 1776, "Curaçao": 1603,
  Czechia: 1632, "DR Congo": 1689, Ecuador: 1765, Egypt: 1733,
  England: 1878, France: 1900, Germany: 1804, Ghana: 1581, Haiti: 1668,
  Iran: 1819, Iraq: 1690, "Ivory Coast": 1744, Japan: 1875, Jordan: 1704,
  Mexico: 1788, Morocco: 1885, Netherlands: 1814, "New Zealand": 1643,
  Norway: 1757, Panama: 1718, Paraguay: 1645, Portugal: 1837, Qatar: 1555,
  "Saudi Arabia": 1650, Scotland: 1659, Senegal: 1813, "South Africa": 1632,
  "South Korea": 1793, Spain: 1946, Sweden: 1595, Switzerland: 1748,
  Tunisia: 1698, Turkey: 1741, Türkiye: 1741, "United States": 1707,
  Uruguay: 1735, Uzbekistan: 1747
};

const teamNames = {
  Algeria: "阿爾及利亞",
  Argentina: "阿根廷",
  Australia: "澳洲",
  Austria: "奧地利",
  Belgium: "比利時",
  "Bosnia and Herzegovina": "波士尼亞",
  Brazil: "巴西",
  Canada: "加拿大",
  "Cape Verde Islands": "維德角",
  Colombia: "哥倫比亞",
  Croatia: "克羅埃西亞",
  Curaçao: "古拉索",
  Czechia: "捷克",
  "Czech Republic": "捷克",
  "DR Congo": "剛果民主共和國",
  Ecuador: "厄瓜多",
  Egypt: "埃及",
  England: "英格蘭",
  France: "法國",
  Germany: "德國",
  Ghana: "迦納",
  Haiti: "海地",
  Iran: "伊朗",
  Iraq: "伊拉克",
  "Ivory Coast": "象牙海岸",
  Japan: "日本",
  Jordan: "約旦",
  Mexico: "墨西哥",
  Morocco: "摩洛哥",
  Netherlands: "荷蘭",
  "New Zealand": "紐西蘭",
  Norway: "挪威",
  Panama: "巴拿馬",
  Paraguay: "巴拉圭",
  Portugal: "葡萄牙",
  Qatar: "卡達",
  "Saudi Arabia": "沙烏地阿拉伯",
  Scotland: "蘇格蘭",
  Senegal: "塞內加爾",
  "South Africa": "南非",
  "South Korea": "韓國",
  Spain: "西班牙",
  Sweden: "瑞典",
  Switzerland: "瑞士",
  Tunisia: "突尼西亞",
  Turkey: "土耳其",
  Türkiye: "土耳其",
  "United States": "美國",
  Uruguay: "烏拉圭",
  Uzbekistan: "烏茲別克"
};

const stageNames = {
  "group-stage": "分組賽",
  "round-of-32": "32 強",
  "round-of-16": "16 強",
  quarterfinals: "八強",
  semifinals: "四強",
  "third-place": "季軍賽",
  final: "冠軍賽"
};

const sourceTeamAliases = {
  "Bosnia-Herzegovina": "Bosnia and Herzegovina",
  "Congo DR": "DR Congo",
  "Czech Republic": "Czechia",
  "Cape Verde": "Cape Verde Islands"
};

const state = {
  events: [],
  ratings: { ...BASE_ELO },
  baseH2H: {},
  h2h: {},
  tournamentStats: {},
  filter: "all",
  visibleGroups: INITIAL_DATE_GROUPS,
  isLoading: false
};

const elements = {
  schedule: document.querySelector("#schedule"),
  knockoutBracket: document.querySelector("#knockoutBracket"),
  template: document.querySelector("#matchTemplate"),
  refreshButton: document.querySelector("#refreshButton"),
  connectionStatus: document.querySelector("#connectionStatus"),
  lastUpdated: document.querySelector("#lastUpdated"),
  errorMessage: document.querySelector("#errorMessage"),
  datePicker: document.querySelector("#datePicker"),
  loadMoreButton: document.querySelector("#loadMoreButton"),
  completedCount: document.querySelector("#completedCount"),
  liveCount: document.querySelector("#liveCount"),
  totalCount: document.querySelector("#totalCount"),
  nextMatchTime: document.querySelector("#nextMatchTime"),
  nextMatchTeams: document.querySelector("#nextMatchTeams")
};

const dateFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: TAIWAN_TIME_ZONE,
  month: "numeric",
  day: "numeric",
  weekday: "short"
});

const timeFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: TAIWAN_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

const fullDateTimeFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: TAIWAN_TIME_ZONE,
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

function localTeamName(name) {
  return teamNames[name] || name;
}

function canonicalTeamName(name) {
  return sourceTeamAliases[name] || name;
}

function taiwanDateKey(dateValue) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TAIWAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(dateValue));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeEvent(event) {
  const competition = event.competitions?.[0] || {};
  const competitors = competition.competitors || [];
  const home = competitors.find((item) => item.homeAway === "home") || competitors[0];
  const away = competitors.find((item) => item.homeAway === "away") || competitors[1];
  const status = event.status?.type || competition.status?.type || {};
  const homeSourceName = canonicalTeamName(home?.team?.displayName || "TBD");
  const awaySourceName = canonicalTeamName(away?.team?.displayName || "TBD");
  const goals = (competition.details || [])
    .filter((detail) => detail.scoringPlay)
    .map((detail) => {
      const athlete = detail.athletesInvolved?.[0] || {};
      return {
        minute: detail.clock?.displayValue || "--",
        clockValue: Number(detail.clock?.value || 0),
        teamId: String(detail.team?.id || ""),
        scorer: athlete.displayName || "球員資料未提供",
        jersey: athlete.jersey || "",
        position: athlete.position || "",
        type: detail.type?.text || "Goal",
        penaltyKick: Boolean(detail.penaltyKick),
        ownGoal: Boolean(detail.ownGoal),
        shootout: Boolean(detail.shootout)
      };
    })
    .sort((a, b) => a.clockValue - b.clockValue);

  return {
    id: event.id,
    date: new Date(event.date),
    dateKey: taiwanDateKey(event.date),
    stageSlug: event.season?.slug || "",
    stage: stageNames[event.season?.slug] || event.season?.slug || "世界盃",
    statusState: status.state || "pre",
    statusDetail: status.shortDetail || status.detail || "",
    completed: Boolean(status.completed),
    home: {
      id: String(home?.team?.id || ""),
      sourceName: homeSourceName,
      name: localTeamName(homeSourceName === "TBD" ? "待定" : homeSourceName),
      score: home?.score ?? "-",
      logo: home?.team?.logo || ""
    },
    away: {
      id: String(away?.team?.id || ""),
      sourceName: awaySourceName,
      name: localTeamName(awaySourceName === "TBD" ? "待定" : awaySourceName),
      score: away?.score ?? "-",
      logo: away?.team?.logo || ""
    },
    venue: competition.venue?.fullName || "場地待定",
    goals
  };
}

function positionName(position) {
  const code = String(position || "").toUpperCase();
  const exact = {
    GK: "守門員", CB: "中後衛", LB: "左後衛", RB: "右後衛",
    DM: "防守中場", CM: "中場", AM: "攻擊中場", LM: "左中場",
    RM: "右中場", LW: "左翼", RW: "右翼", ST: "前鋒",
    CF: "前鋒", F: "前鋒", SUB: "替補"
  };
  if (exact[code]) return exact[code];
  if (code.startsWith("CD")) return "中後衛";
  if (code.startsWith("CM")) return "中場";
  if (code.startsWith("AM")) return "攻擊中場";
  if (code.startsWith("DM")) return "防守中場";
  if (code.startsWith("F")) return "前鋒";
  if (code.startsWith("W")) return "邊鋒";
  return position || "";
}

function goalTypeName(goal) {
  if (goal.shootout) return "PK 大戰";
  if (goal.ownGoal) return "烏龍球";
  if (goal.penaltyKick) return "點球";
  if (goal.type.toLowerCase().includes("header")) return "頭球";
  return "進球";
}

function renderGoals(card, match) {
  if (match.statusState === "pre") return;
  const panel = card.querySelector(".goal-events");
  const list = panel.querySelector(".goal-list");
  panel.hidden = false;
  panel.querySelector(".goal-count").textContent = match.goals.length
    ? `${match.goals.length} 球`
    : match.completed ? "本場無進球" : "目前無進球";

  if (!match.goals.length) {
    panel.classList.add("no-goals");
    return;
  }

  match.goals.forEach((goal) => {
    const team = goal.teamId === match.home.id ? match.home : match.away;
    const details = [goal.jersey ? `#${goal.jersey}` : "", positionName(goal.position), goalTypeName(goal)]
      .filter(Boolean)
      .join(" · ");
    const row = document.createElement("div");
    row.className = "goal-event";
    row.innerHTML =
      `<time>${goal.minute}</time>` +
      `<span class="goal-team">${team.name}</span>` +
      `<strong>${goal.scorer}</strong>` +
      `<small>${details}</small>`;
    list.append(row);
  });
}

function updateElo(ratings, match) {
  const homeName = match.home.sourceName;
  const awayName = match.away.sourceName;
  const homeScore = Number(match.home.score);
  const awayScore = Number(match.away.score);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return;

  const homeRating = ratings[homeName] || 1500;
  const awayRating = ratings[awayName] || 1500;
  const expectedHome = 1 / (1 + 10 ** ((awayRating - homeRating) / 400));
  const actualHome = homeScore > awayScore ? 1 : homeScore === awayScore ? 0.5 : 0;
  const goalDiff = Math.abs(homeScore - awayScore);
  const margin = goalDiff <= 1 ? 1 : goalDiff === 2 ? 1.5 : 1.75 + (goalDiff - 3) / 8;
  const change = 40 * margin * (actualHome - expectedHome);
  ratings[homeName] = homeRating + change;
  ratings[awayName] = awayRating - change;
}

function rebuildRatings() {
  const ratings = { ...BASE_ELO };
  state.events
    .filter((match) => match.completed)
    .sort((a, b) => a.date - b.date)
    .forEach((match) => updateElo(ratings, match));
  state.ratings = ratings;
}

function emptyTournamentStats() {
  return { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, recent: [] };
}

function rebuildTournamentStats() {
  const stats = {};
  state.events
    .filter((match) => match.completed)
    .sort((a, b) => a.date - b.date)
    .forEach((match) => {
      const homeScore = Number(match.home.score);
      const awayScore = Number(match.away.score);
      if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return;
      const home = stats[match.home.sourceName] ||= emptyTournamentStats();
      const away = stats[match.away.sourceName] ||= emptyTournamentStats();
      home.played += 1;
      away.played += 1;
      home.goalsFor += homeScore;
      home.goalsAgainst += awayScore;
      away.goalsFor += awayScore;
      away.goalsAgainst += homeScore;

      const homeResult = homeScore > awayScore ? "W" : homeScore < awayScore ? "L" : "D";
      const awayResult = homeScore > awayScore ? "L" : homeScore < awayScore ? "W" : "D";
      if (homeResult === "W") { home.wins += 1; away.losses += 1; }
      else if (homeResult === "L") { home.losses += 1; away.wins += 1; }
      else { home.draws += 1; away.draws += 1; }

      home.recent.push({ result: homeResult, score: `${homeScore}:${awayScore}`, opponent: match.away.name });
      away.recent.push({ result: awayResult, score: `${awayScore}:${homeScore}`, opponent: match.home.name });
    });
  state.tournamentStats = stats;
}

function renderTournamentStats(card, match) {
  if (match.home.sourceName === "TBD" || match.away.sourceName === "TBD") return;
  const panel = card.querySelector(".tournament-form");
  const list = panel.querySelector(".tournament-form-list");
  panel.hidden = false;

  [match.home, match.away].forEach((team) => {
    const stats = state.tournamentStats[team.sourceName] || emptyTournamentStats();
    const row = document.createElement("div");
    row.className = "tournament-team-row";
    const recent = stats.recent.length
      ? stats.recent.map((game) =>
          `<span class="tournament-game">` +
            `<i class="form-result ${game.result.toLowerCase()}">${game.result}</i>` +
            `<em>對 ${game.opponent}</em>` +
            `<b>${game.score}</b>` +
          `</span>`
        ).join("")
      : '<span class="form-empty">尚未出賽</span>';
    row.innerHTML =
      `<div class="tournament-team"><img src="${team.logo}" alt=""><strong>${team.name}</strong></div>` +
      `<div class="tournament-record"><b>${stats.wins}</b>勝 <b>${stats.draws}</b>和 <b>${stats.losses}</b>負</div>` +
      `<div class="tournament-goals">進 ${stats.goalsFor}・失 ${stats.goalsAgainst}</div>` +
      `<div class="tournament-recent">${recent}</div>`;
    list.append(row);
  });
}

function predictMatch(match) {
  const homeRating = state.ratings[match.home.sourceName] || 1500;
  const awayRating = state.ratings[match.away.sourceName] || 1500;
  const difference = Math.abs(homeRating - awayRating);
  const expectedHome = 1 / (1 + 10 ** ((awayRating - homeRating) / 400));
  const draw = 0.08 + 0.22 * Math.exp(-difference / 500);
  const home = (1 - draw) * expectedHome;
  const homePct = Math.round(home * 100);
  const drawPct = Math.round(draw * 100);
  return { home: homePct, draw: drawPct, away: 100 - homePct - drawPct };
}

function pairKey(teamA, teamB) {
  return teamA < teamB ? `${teamA}|${teamB}` : `${teamB}|${teamA}`;
}

function addMatchToH2H(collection, match) {
  const home = match.home.sourceName;
  const away = match.away.sourceName;
  const homeScore = Number(match.home.score);
  const awayScore = Number(match.away.score);
  if (home === "TBD" || away === "TBD" || !Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return;

  const key = pairKey(home, away);
  const [first] = key.split("|");
  const item = collection[key] || {
    total: 0,
    firstWins: 0,
    draws: 0,
    secondWins: 0,
    recent: []
  };
  item.total += 1;
  if (homeScore === awayScore) item.draws += 1;
  else {
    const winner = homeScore > awayScore ? home : away;
    if (winner === first) item.firstWins += 1;
    else item.secondWins += 1;
  }
  item.recent.push({
    date: match.date.toISOString().slice(0, 10),
    home,
    away,
    homeScore,
    awayScore,
    tournament: "FIFA World Cup"
  });
  item.recent.sort((a, b) => b.date.localeCompare(a.date));
  item.recent = item.recent.slice(0, 5);
  collection[key] = item;
}

function rebuildH2H() {
  const collection = Object.fromEntries(
    Object.entries(state.baseH2H).map(([key, item]) => [
      key,
      { ...item, recent: item.recent.map((game) => ({ ...game })) }
    ])
  );
  state.events
    .filter((match) => match.completed)
    .sort((a, b) => a.date - b.date)
    .forEach((match) => addMatchToH2H(collection, match));
  state.h2h = collection;
}

function renderH2H(card, match) {
  const panel = card.querySelector(".h2h");
  const item = state.h2h[pairKey(match.home.sourceName, match.away.sourceName)];
  panel.hidden = false;

  if (!item) {
    panel.classList.add("no-history");
    panel.querySelector(".h2h-summary").textContent = "尚無直接交手紀錄";
    return;
  }

  const [first] = pairKey(match.home.sourceName, match.away.sourceName).split("|");
  const homeWins = match.home.sourceName === first ? item.firstWins : item.secondWins;
  const awayWins = match.away.sourceName === first ? item.firstWins : item.secondWins;
  panel.querySelector(".h2h-summary").textContent =
    `共 ${item.total} 場｜${match.home.name} ${homeWins} 勝・和 ${item.draws}・${match.away.name} ${awayWins} 勝`;

  const list = panel.querySelector(".h2h-list");
  item.recent.forEach((game) => {
    const row = document.createElement("div");
    row.className = "h2h-game";
    const gameDate = game.date.replaceAll("-", "/");
    row.innerHTML =
      `<time>${gameDate}</time>` +
      `<span>${localTeamName(game.home)}</span>` +
      `<strong>${game.homeScore} : ${game.awayScore}</strong>` +
      `<span>${localTeamName(game.away)}</span>`;
    list.append(row);
  });
}

function statusText(match) {
  if (match.statusState === "in") return match.statusDetail || "進行中";
  if (match.completed) return "已完賽";
  return "未開賽";
}

function matchPassesFilter(match) {
  if (state.filter === "live") return match.statusState === "in";
  if (state.filter === "upcoming") return match.statusState === "pre";
  if (state.filter === "completed") return match.completed;
  return true;
}

function isKnockoutMatch(match) {
  return KNOCKOUT_STAGES.some((stage) => stage.slug === match.stageSlug);
}

function matchScoreText(match) {
  return match.statusState === "pre" ? "VS" : `${match.home.score} : ${match.away.score}`;
}

function toggleMatchCard(card, forceOpen) {
  const summary = card.querySelector(".match-summary");
  const details = card.querySelector(".match-details");
  const cue = card.querySelector(".expand-cue");
  const isOpen = forceOpen ?? details.hidden;
  details.hidden = !isOpen;
  summary.setAttribute("aria-expanded", String(isOpen));
  card.classList.toggle("is-expanded", isOpen);
  if (cue) cue.textContent = isOpen ? "收合詳情" : "點開看詳情";
}

function openMatchFromBracket(matchId) {
  state.filter = "all";
  document.querySelector(".filter-tab.active")?.classList.remove("active");
  document.querySelector('[data-filter="all"]').classList.add("active");
  render();
  requestAnimationFrame(() => {
    const card = document.querySelector(`#match-${CSS.escape(matchId)}`);
    if (!card) return;
    toggleMatchCard(card, true);
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function bracketTeamFlag(team, sideLabel) {
  const isKnown = team.sourceName !== "TBD" && Boolean(team.logo);
  const label = isKnown ? team.name : `${sideLabel}待定`;
  return (
    `<span class="bracket-flag-slot ${isKnown ? "" : "is-empty"}" title="${label}" aria-label="${label}">` +
      (isKnown ? `<img src="${team.logo}" alt="${team.name}">` : "") +
      `<span>${isKnown ? team.name : ""}</span>` +
    `</span>`
  );
}

function createBracketMatchButton(match, side = "center") {
  const item = document.createElement("button");
  item.type = "button";
  item.className =
    `bracket-match bracket-node-${side} ${match.statusState === "in" ? "is-live" : ""} ${match.completed ? "is-completed" : ""}`;
  item.setAttribute(
    "aria-label",
    `${match.stage}：${match.home.name} 對 ${match.away.name}，${matchScoreText(match)}，點擊查看比賽卡`
  );
  item.title = `${match.home.name} vs ${match.away.name}`;
  item.dataset.matchId = match.id;
  item.innerHTML =
    `<span class="bracket-time">${match.completed ? "已完賽" : fullDateTimeFormatter.format(match.date)}</span>` +
    `<span class="bracket-row">` +
      bracketTeamFlag(match.home, "主隊") +
      `<strong>${matchScoreText(match)}</strong>` +
      bracketTeamFlag(match.away, "客隊") +
    `</span>`;
  item.addEventListener("click", () => openMatchFromBracket(match.id));
  return item;
}

function splitBracket(matches) {
  const middle = Math.ceil(matches.length / 2);
  return {
    left: matches.slice(0, middle),
    right: matches.slice(middle)
  };
}

function createBracketStage(title, matches, side, stageClass) {
  const column = document.createElement("section");
  column.className = `bracket-stage bracket-stage-${stageClass} bracket-stage-${side}`;
  column.style.setProperty("--match-count", Math.max(matches.length, 1));
  column.innerHTML = `<h4>${title}</h4>`;

  const list = document.createElement("div");
  list.className = "bracket-stage-list";
  matches.forEach((match) => list.append(createBracketMatchButton(match, side)));
  column.append(list);
  return column;
}

function renderKnockoutBracket() {
  const bracket = elements.knockoutBracket;
  const knockoutMatches = state.events.filter(isKnockoutMatch);
  bracket.replaceChildren();

  if (!knockoutMatches.length) {
    bracket.hidden = true;
    return;
  }

  const byStage = Object.fromEntries(
    KNOCKOUT_STAGES.map((stage) => [
      stage.slug,
      knockoutMatches
        .filter((match) => match.stageSlug === stage.slug)
        .sort((a, b) => a.date - b.date)
    ])
  );
  const round32 = splitBracket(byStage["round-of-32"] || []);
  const round16 = splitBracket(byStage["round-of-16"] || []);
  const quarterfinals = splitBracket(byStage.quarterfinals || []);
  const semifinals = splitBracket(byStage.semifinals || []);
  const finalMatch = (byStage.final || [])[0];
  const thirdPlaceMatch = (byStage["third-place"] || [])[0];

  bracket.hidden = false;
  const heading = document.createElement("div");
  heading.className = "bracket-heading";
  heading.innerHTML =
    "<div><p class=\"section-kicker\">KNOCKOUT BRACKET</p><h3>2026 世界盃 32 強淘汰賽</h3></div>" +
    "<span>左右半區往中央決賽匯合，點擊任一格可看比賽詳情</span>";

  const shell = document.createElement("div");
  shell.className = "bracket-shell";

  const left = document.createElement("div");
  left.className = "bracket-side bracket-side-left";
  left.append(
    createBracketStage("32 強", round32.left, "left", "r32"),
    createBracketStage("16 強", round16.left, "left", "r16"),
    createBracketStage("8 強", quarterfinals.left, "left", "qf"),
    createBracketStage("4 強", semifinals.left, "left", "sf")
  );

  const center = document.createElement("div");
  center.className = "bracket-center";
  center.innerHTML = "<div class=\"bracket-trophy\" aria-hidden=\"true\">🏆</div><strong>決賽</strong>";
  if (finalMatch) {
    center.append(createBracketMatchButton(finalMatch, "center"));
  } else {
    center.insertAdjacentHTML("beforeend", "<div class=\"bracket-placeholder\">決賽待定</div>");
  }
  center.insertAdjacentHTML("beforeend", "<span class=\"third-label\">季軍賽</span>");
  if (thirdPlaceMatch) {
    center.append(createBracketMatchButton(thirdPlaceMatch, "center"));
  } else {
    center.insertAdjacentHTML("beforeend", "<div class=\"bracket-placeholder\">季軍賽待定</div>");
  }

  const right = document.createElement("div");
  right.className = "bracket-side bracket-side-right";
  right.append(
    createBracketStage("4 強", semifinals.right, "right", "sf"),
    createBracketStage("8 強", quarterfinals.right, "right", "qf"),
    createBracketStage("16 強", round16.right, "right", "r16"),
    createBracketStage("32 強", round32.right, "right", "r32")
  );

  shell.append(left, center, right);
  bracket.append(heading, shell);
}

function groupMatches(matches) {
  return matches.reduce((groups, match) => {
    if (!groups.has(match.dateKey)) groups.set(match.dateKey, []);
    groups.get(match.dateKey).push(match);
    return groups;
  }, new Map());
}

function createMatchCard(match) {
  const card = elements.template.content.firstElementChild.cloneNode(true);
  const status = card.querySelector(".match-status");
  const score = card.querySelector(".score");
  const kickoffLabel = card.querySelector(".kickoff-label");
  const kickoff = card.querySelector(".kickoff");

  card.dataset.matchId = match.id;
  card.id = `match-${match.id}`;
  card.classList.toggle("is-live", match.statusState === "in");
  card.querySelector(".match-stage").textContent = match.stage;
  status.textContent = statusText(match);
  status.classList.toggle("live", match.statusState === "in");
  score.textContent = matchScoreText(match);
  kickoffLabel.textContent = match.completed ? "開賽時間" : "台灣時間";
  kickoff.textContent = timeFormatter.format(match.date);
  card.querySelector(".venue").textContent = match.venue;

  const homeLogo = card.querySelector(".home-team .team-logo");
  homeLogo.src = match.home.logo;
  homeLogo.alt = `${match.home.name}隊徽`;
  homeLogo.hidden = !match.home.logo;
  card.querySelector(".home-team .team-name").textContent = match.home.name;

  const awayLogo = card.querySelector(".away-team .team-logo");
  awayLogo.src = match.away.logo;
  awayLogo.alt = `${match.away.name}隊徽`;
  awayLogo.hidden = !match.away.logo;
  card.querySelector(".away-team .team-name").textContent = match.away.name;
  renderTournamentStats(card, match);
  renderGoals(card, match);

  if (match.statusState === "pre") {
    const prediction = predictMatch(match);
    const panel = card.querySelector(".prediction");
    panel.hidden = false;
    panel.querySelector(".prob-home").style.width = `${prediction.home}%`;
    panel.querySelector(".prob-draw").style.width = `${prediction.draw}%`;
    panel.querySelector(".prob-away").style.width = `${prediction.away}%`;
    panel.querySelector(".prob-home-label").textContent = `${match.home.name} ${prediction.home}%`;
    panel.querySelector(".prob-draw-label").textContent = `和局 ${prediction.draw}%`;
    panel.querySelector(".prob-away-label").textContent = `${match.away.name} ${prediction.away}%`;
    renderH2H(card, match);
  }

  card.querySelector(".match-summary").addEventListener("click", () => toggleMatchCard(card));

  return card;
}

function createDateGroups(matches, limit = Infinity) {
  const fragment = document.createDocumentFragment();
  const entries = [...groupMatches(matches).entries()].slice(0, limit);
  entries.forEach(([dateKey, dateMatches]) => {
    const section = document.createElement("section");
    section.className = "date-group";
    section.id = `date-${dateKey}`;
    const heading = document.createElement("h3");
    heading.className = "date-heading";
    heading.innerHTML = `<strong>${dateFormatter.format(dateMatches[0].date)}</strong><span>${dateMatches.length} 場比賽</span>`;
    const grid = document.createElement("div");
    grid.className = "match-grid";
    dateMatches.forEach((match) => grid.append(createMatchCard(match)));
    section.append(heading, grid);
    fragment.append(section);
  });
  return fragment;
}

function createStatusSection(title, subtitle, className, matches) {
  if (!matches.length) return null;
  const section = document.createElement("section");
  section.className = `status-section ${className}`;
  const heading = document.createElement("div");
  heading.className = "status-section-heading";
  heading.innerHTML = `<div><span></span><strong>${title}</strong><small>${subtitle}</small></div><b>${matches.length} 場</b>`;
  section.append(heading, createDateGroups(matches));
  return section;
}

function render() {
  const filtered = state.events.filter(matchPassesFilter);
  const grouped = groupMatches(filtered);
  const entries = [...grouped.entries()];

  renderKnockoutBracket();
  elements.schedule.replaceChildren();

  if (state.filter === "all") {
    const sections = [
      createStatusSection("進行中", "比分每 60 秒更新", "live-section", state.events.filter((match) => match.statusState === "in")),
      createStatusSection("未來賽事", "含歷史數據勝率預測", "upcoming-section", state.events.filter((match) => match.statusState === "pre")),
      createStatusSection(
        "已完賽",
        "最終比分（最新優先）",
        "completed-section",
        state.events.filter((match) => match.completed).sort((a, b) => b.date - a.date)
      )
    ].filter(Boolean);
    sections.forEach((section) => elements.schedule.append(section));
    elements.loadMoreButton.hidden = true;
    return;
  }

  const visibleEntries = entries.slice(0, state.visibleGroups);

  if (!visibleEntries.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<strong>目前沒有符合條件的賽事</strong><span>請切換其他篩選條件。</span>";
    elements.schedule.append(empty);
    elements.loadMoreButton.hidden = true;
    return;
  }

  elements.schedule.append(createDateGroups(filtered, state.visibleGroups));

  elements.loadMoreButton.hidden = entries.length <= state.visibleGroups;
}

function updateOverview() {
  const completed = state.events.filter((match) => match.completed);
  const live = state.events.filter((match) => match.statusState === "in");
  const upcoming = state.events.find((match) => match.statusState === "pre");

  elements.completedCount.textContent = completed.length;
  elements.liveCount.textContent = live.length;
  elements.totalCount.textContent = state.events.length || 104;
  document.querySelector('[data-count="all"]').textContent = state.events.length;
  document.querySelector('[data-count="live"]').textContent = live.length;
  document.querySelector('[data-count="upcoming"]').textContent = state.events.filter((match) => match.statusState === "pre").length;
  document.querySelector('[data-count="completed"]').textContent = completed.length;

  if (live.length) {
    const firstLive = live[0];
    elements.nextMatchTime.textContent = "正在進行";
    elements.nextMatchTeams.textContent = `${firstLive.home.name} ${firstLive.home.score}：${firstLive.away.score} ${firstLive.away.name}`;
  } else if (upcoming) {
    elements.nextMatchTime.textContent = fullDateTimeFormatter.format(upcoming.date);
    elements.nextMatchTeams.textContent = `${upcoming.home.name} vs ${upcoming.away.name}`;
  } else {
    elements.nextMatchTime.textContent = "賽事已結束";
    elements.nextMatchTeams.textContent = "2026 世界盃";
  }
}

function setConnectionStatus(mode, text) {
  elements.connectionStatus.className = `connection-status ${mode}`;
  elements.connectionStatus.lastChild.textContent = text;
}

async function fetchMatches({ silent = false } = {}) {
  if (state.isLoading) return;
  state.isLoading = true;
  elements.refreshButton.classList.add("loading");
  elements.refreshButton.disabled = true;
  if (!silent) setConnectionStatus("", "正在連線");

  try {
    const h2hRequest = Object.keys(state.baseH2H).length
      ? Promise.resolve(null)
      : fetch("./h2h.json", { cache: "force-cache" })
          .then((response) => response.ok ? response.json() : null)
          .catch(() => null);
    const [response, h2hData] = await Promise.all([
      fetch(`${API_URL}&_=${Date.now()}`, { cache: "no-store" }),
      h2hRequest
    ]);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (h2hData) state.baseH2H = h2hData;
    state.events = (data.events || [])
      .map(normalizeEvent)
      .sort((a, b) => a.date - b.date);

    if (!state.events.length) throw new Error("資料中沒有賽事");

    rebuildRatings();
    rebuildTournamentStats();
    rebuildH2H();
    elements.errorMessage.hidden = true;
    setConnectionStatus("online", "即時資料已連線");
    elements.lastUpdated.textContent = `更新於 ${timeFormatter.format(new Date())}`;
    updateOverview();
    render();
  } catch (error) {
    console.error(error);
    elements.errorMessage.hidden = false;
    setConnectionStatus("offline", "連線中斷");
    if (!state.events.length) {
      elements.schedule.innerHTML =
        '<div class="empty-state"><strong>無法載入賽程</strong><span>請確認網路連線後再試一次。</span></div>';
    }
  } finally {
    state.isLoading = false;
    elements.refreshButton.classList.remove("loading");
    elements.refreshButton.disabled = false;
  }
}

document.querySelectorAll(".filter-tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(".filter-tab.active")?.classList.remove("active");
    button.classList.add("active");
    state.filter = button.dataset.filter;
    state.visibleGroups = INITIAL_DATE_GROUPS;
    render();
  });
});

elements.refreshButton.addEventListener("click", () => fetchMatches());

elements.loadMoreButton.addEventListener("click", () => {
  state.visibleGroups += INITIAL_DATE_GROUPS;
  render();
});

elements.datePicker.addEventListener("change", () => {
  const dateKey = elements.datePicker.value;
  state.filter = "all";
  document.querySelector(".filter-tab.active")?.classList.remove("active");
  document.querySelector('[data-filter="all"]').classList.add("active");
  state.visibleGroups = 99;
  render();
  requestAnimationFrame(() => {
    const target = document.querySelector(`#date-${CSS.escape(dateKey)}`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

fetchMatches();
setInterval(() => fetchMatches({ silent: true }), REFRESH_INTERVAL);
