const API_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=200";
const REFRESH_INTERVAL = 60_000;
const INITIAL_DATE_GROUPS = 7;
const TAIWAN_TIME_ZONE = "Asia/Taipei";

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

const state = {
  events: [],
  ratings: { ...BASE_ELO },
  filter: "all",
  visibleGroups: INITIAL_DATE_GROUPS,
  isLoading: false
};

const elements = {
  schedule: document.querySelector("#schedule"),
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

  return {
    id: event.id,
    date: new Date(event.date),
    dateKey: taiwanDateKey(event.date),
    stage: stageNames[event.season?.slug] || event.season?.slug || "世界盃",
    statusState: status.state || "pre",
    statusDetail: status.shortDetail || status.detail || "",
    completed: Boolean(status.completed),
    home: {
      sourceName: home?.team?.displayName || "TBD",
      name: localTeamName(home?.team?.displayName || "待定"),
      score: home?.score ?? "-",
      logo: home?.team?.logo || ""
    },
    away: {
      sourceName: away?.team?.displayName || "TBD",
      name: localTeamName(away?.team?.displayName || "待定"),
      score: away?.score ?? "-",
      logo: away?.team?.logo || ""
    },
    venue: competition.venue?.fullName || "場地待定"
  };
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
  card.classList.toggle("is-live", match.statusState === "in");
  card.querySelector(".match-stage").textContent = match.stage;
  status.textContent = statusText(match);
  status.classList.toggle("live", match.statusState === "in");
  score.textContent =
    match.statusState === "pre" ? "VS" : `${match.home.score} : ${match.away.score}`;
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
  }

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
    const response = await fetch(`${API_URL}&_=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.events = (data.events || [])
      .map(normalizeEvent)
      .sort((a, b) => a.date - b.date);

    if (!state.events.length) throw new Error("資料中沒有賽事");

    rebuildRatings();
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
