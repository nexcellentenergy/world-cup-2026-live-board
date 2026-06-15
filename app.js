const API_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=200";
const REFRESH_INTERVAL = 60_000;
const INITIAL_DATE_GROUPS = 7;
const TAIWAN_TIME_ZONE = "Asia/Taipei";

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
      name: localTeamName(home?.team?.displayName || "待定"),
      score: home?.score ?? "-",
      logo: home?.team?.logo || ""
    },
    away: {
      name: localTeamName(away?.team?.displayName || "待定"),
      score: away?.score ?? "-",
      logo: away?.team?.logo || ""
    },
    venue: competition.venue?.fullName || "場地待定"
  };
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

  return card;
}

function render() {
  const filtered = state.events.filter(matchPassesFilter);
  const grouped = groupMatches(filtered);
  const entries = [...grouped.entries()];
  const visibleEntries = entries.slice(0, state.visibleGroups);

  elements.schedule.replaceChildren();

  if (!visibleEntries.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<strong>目前沒有符合條件的賽事</strong><span>請切換其他篩選條件。</span>";
    elements.schedule.append(empty);
    elements.loadMoreButton.hidden = true;
    return;
  }

  visibleEntries.forEach(([dateKey, matches]) => {
    const section = document.createElement("section");
    section.className = "date-group";
    section.id = `date-${dateKey}`;

    const heading = document.createElement("h3");
    heading.className = "date-heading";
    heading.innerHTML = `<strong>${dateFormatter.format(matches[0].date)}</strong><span>${matches.length} 場比賽</span>`;

    const grid = document.createElement("div");
    grid.className = "match-grid";
    matches.forEach((match) => grid.append(createMatchCard(match)));
    section.append(heading, grid);
    elements.schedule.append(section);
  });

  elements.loadMoreButton.hidden = entries.length <= state.visibleGroups;
}

function updateOverview() {
  const completed = state.events.filter((match) => match.completed);
  const live = state.events.filter((match) => match.statusState === "in");
  const upcoming = state.events.find((match) => match.statusState === "pre");

  elements.completedCount.textContent = completed.length;
  elements.liveCount.textContent = live.length;
  elements.totalCount.textContent = state.events.length || 104;

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
