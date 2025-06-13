// configs gerais
const clientId = '23cd83a8778d4274a8721e203c4dba70';
const redirectUri = window.location.origin + window.location.pathname;
let accessToken = null, user = null, animeTracks = [], playerAudio = null, currentTrackIndex = 0;
const CATEGORY_CACHE = {}, SEARCH_CACHE = {};
const PROXIES = [
  "https://thingproxy.freeboard.io/fetch/",
  "https://api.allorigins.win/raw?url="
];

// proxy
async function proxyFetch(url) {
  let lastError;
  for (let proxy of PROXIES) {
    try {
      let fullUrl = proxy.endsWith('=') ? proxy + encodeURIComponent(url) : proxy + url;
      let res = await fetch(fullUrl);
      if (!res.ok) throw new Error(res.status + " " + res.statusText);
      return await res.json();
    } catch (e) { lastError = e; }
  }
  throw lastError;
}

// spot login
async function generateCodeChallenge(v) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function generateRandomString(len) {
  const p = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array(len).fill().map(() => p[Math.floor(Math.random() * p.length)]).join('');
}

// player
function renderPlayer() {
  if (document.getElementById('player')) return;
  document.querySelector('.container').insertAdjacentHTML('beforeend', `
    <footer id="player" class="hidden">
      <div class="track-info">
        <img id="album-cover" src="" alt="Album Cover" />
        <div class="track-text">
          <span id="track-title">---</span>
          <span id="track-artist">---</span>
        </div>
      </div>
      <div class="controls">
        <button id="prev"><i class="fas fa-backward"></i></button>
        <button id="play"><i class="fas fa-play"></i></button>
        <button id="next"><i class="fas fa-forward"></i></button>
        <div class="volume-container">
          <span id="volume-icon"><svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20"><path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h3.6a.5.5 0 0 0 .35-.14l3.35-3.22a.5.5 0 0 1 .85.36v12a.5.5 0 0 1-.85.36l-3.35-3.22A.5.5 0 0 0 8.6 13H5a1.5 1.5 0 0 1-1.5-1.5v-3z"/></svg></span>
          <input type="range" id="volume-control" min="0" max="1" step="0.01" value="0.8" title="Volume"/>
        </div>
      </div>
      <div class="lyrics-toggle">
        <button id="toggle-lyrics"><i class="fas fa-chevron-up"></i></button>
      </div>
    </footer>
  `);
  setupPlayerEventListeners();
}
function removePlayer() {
  const player = document.getElementById('player');
  if (player) player.remove();
}
function setupPlayerEventListeners() {
  document.getElementById('toggle-lyrics')?.addEventListener('click', () => {
    document.getElementById('lyrics-panel')?.classList.toggle('hidden');
  });
  document.getElementById('prev')?.addEventListener('click', () => {
    if (!animeTracks.length) return;
    currentTrackIndex = (currentTrackIndex - 1 + animeTracks.length) % animeTracks.length;
    playPreview();
  });
  document.getElementById('next')?.addEventListener('click', () => {
    if (!animeTracks.length) return;
    currentTrackIndex = (currentTrackIndex + 1) % animeTracks.length;
    playPreview();
  });
  document.getElementById('play')?.addEventListener('click', () => {
    if (!playerAudio) return;
    if (playerAudio.paused) {
      playerAudio.play();
      document.getElementById('play').innerHTML = '<i class="fas fa-pause"></i>';
    } else {
      playerAudio.pause();
      document.getElementById('play').innerHTML = '<i class="fas fa-play"></i>';
    }
  });
  document.getElementById('volume-control')?.addEventListener('input', function () {
    if (playerAudio) playerAudio.volume = parseFloat(this.value);
    const volIcon = document.getElementById('volume-icon');
    if (volIcon) {
      if (this.value <= 0.01) volIcon.style.color = '#888';
      else if (this.value < 0.4) volIcon.style.color = '#f6e96b';
      else volIcon.style.color = '#2196f3';
    }
  });
}

// carrossel
const OTAKU_CATEGORIES = [
  { title: "Encerramentos Marcantes", queries: ["anime ending", "anime ending song", "animê encerramento", "アニメ エンディング", "ending anime", "ending anisong", "Blue Bird", "Unravel", "Mikazuki", "Uso", "Namae no Nai Kaibutsu", "Parade", "Sign"] },
  { title: "Atemporais", queries: ["classic anime song", "anime timeless", "anime classic", "アニメ 名曲", "jpop classic", "Cruel Angel's Thesis", "We Are", "Moonlight Densetsu", "Sobakasu", "Tank!", "Pegasus Fantasy", "Again", "Guren no Yumiya"] },
  { title: "Favoritas da Comunidade", queries: ["anime community favorite", "anime top songs", "anime most loved", "anime hits", "jpop anime", "Kpop anime", "Gurenge", "Silhouette", "My Dearest", "Peace Sign", "Crossing Field", "History Maker", "Departure!"] },
  { title: "Músicas de Batalha/Temas Emocionais", queries: ["anime battle theme", "anime emotional song", "anime ost", "anime fight", "アニメ 戦闘", "anime epic", "Libera Me From Hell", "You Say Run", "Inferno", "Brave Shine", "Kyouran Hey Kids!!", "Battlecry", "Lilium"] },
  { title: "Aberturas Românticas", queries: ["anime romance opening", "romantic anime song", "anime love opening", "アニメ 恋愛", "Kiss of Death", "Renai Circulation", "Kaibutsu", "Kimi no Shiranai Monogatari", "Hikaru Nara", "Sugar Song to Bitter Step", "Orange", "Sincerely"] }
];
async function fetchCategoryTracks(queries, limit = 8, catKey = "") {
  if (catKey && CATEGORY_CACHE[catKey]) return CATEGORY_CACHE[catKey];
  let tracks = [];
  for (let q of queries) {
    if (tracks.length >= limit) break;
    try {
      if (tracks.length > 0) await new Promise(res => setTimeout(res, 400));
      const url = `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=8`;
      const json = await proxyFetch(url);
      for (const t of (json.data || [])) {
        if (
          t.preview &&
          /anime|japan|korea|ost|anisong|アニメ|オープニング|エンディング|サウンドトラック|romance|battle|emotional|ending|opening|love/i.test(t.title + ' ' + t.artist.name + ' ' + t.album.title) &&
          !tracks.find(tt => tt.id === t.id)
        ) {
          tracks.push(t);
          if (tracks.length >= limit) break;
        }
      }
    } catch (e) { }
  }
  if (catKey) CATEGORY_CACHE[catKey] = tracks.slice(0, limit);
  return tracks.slice(0, limit);
}
async function renderOtakuCarousels() {
  const carouselRoot = document.getElementById('animeTracksGrid');
  carouselRoot.innerHTML = '';
  for (let catIdx = 0; catIdx < OTAKU_CATEGORIES.length; catIdx++) {
    const cat = OTAKU_CATEGORIES[catIdx];
    carouselRoot.insertAdjacentHTML('beforeend', `
      <div class="anime-carousel" id="carousel-${catIdx}">
        <div class="carousel-title">${cat.title}</div>
        <div class="carousel-arrows">
          <button class="carousel-arrow left" data-cat="${catIdx}" data-page="0" disabled>&lt;</button>
          <button class="carousel-arrow right" data-cat="${catIdx}" data-page="1">&gt;</button>
        </div>
        <div class="carousel-track" id="carousel-track-${catIdx}">
          <div style="color:#fff;opacity:0.7;padding:18px;">Carregando músicas...</div>
        </div>
      </div>
    `);
    fetchCategoryTracks(cat.queries, 8, cat.title).then(tracks => {
      cat.tracks = tracks;
      renderCarouselPage(catIdx, 0);
      if (!tracks || tracks.length === 0) {
        document.getElementById(`carousel-track-${catIdx}`).innerHTML =
          '<div style="color:#fff;opacity:0.7;padding:18px;">Nenhuma música encontrada nesta categoria.</div>';
      }
    });
  }
  carouselRoot.onclick = function(e) {
    if (e.target.classList.contains('carousel-arrow')) {
      const catIdx = +e.target.getAttribute('data-cat');
      let page = +e.target.getAttribute('data-page');
      renderCarouselPage(catIdx, page);
      document.querySelector(`#carousel-${catIdx} .carousel-arrow.left`).disabled = (page === 0);
      document.querySelector(`#carousel-${catIdx} .carousel-arrow.right`).disabled = (page === 1);
    }
  };
}
function renderCarouselPage(catIdx, page) {
  const cat = OTAKU_CATEGORIES[catIdx];
  if (!cat.tracks) return;
  const start = page * 4, end = start + 4;
  let html = '<div class="carousel-page">';
  cat.tracks.slice(start, end).forEach((track, i) => {
    html += `
      <div class="music-track-card" onclick="playThisTrackCar(${catIdx},${start+i})">
        <img class="cover" src="${track.album.cover_medium}" alt="${track.title}">
        <div class="track-title">${track.title}</div>
        <div class="track-artist">${track.artist.name}</div>
      </div>
    `;
  });
  html += '</div>';
  document.getElementById(`carousel-track-${catIdx}`).innerHTML = html;
}
window.playThisTrackCar = function(catIdx, trackIdx) {
  const cat = OTAKU_CATEGORIES[catIdx];
  if (!cat.tracks || !cat.tracks[trackIdx]) return;
  animeTracks = cat.tracks;
  currentTrackIndex = trackIdx;
  playPreview();
};

// nav musicas
function showExplore() {
  document.getElementById('mainHeader').style.display = "none";
  document.getElementById('mainContentArea').style.display = "none";
  document.getElementById('musicNavMain')?.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="music-nav-fullscreen" id="musicNavMain">
      <div class="music-nav-main">
        <div class="music-nav-header">
          <div class="music-nav-search">
            <input type="text" placeholder="Buscar" id="animeTrackSearchInput"/>
            <i class="fas fa-search"></i>
          </div>
          <div class="music-nav-user">
            <span>${user?.display_name?.split(' ')[0] || "usuário"}</span>
            <img class="user-avatar" src="${user?.images?.[0]?.url || 'https://ui-avatars.com/api/?name=AnimeBeat'}" alt="Avatar"
              style="cursor:pointer"
              onclick="if(window.user?.external_urls?.spotify) window.open(window.user.external_urls.spotify,'_blank')"
            >
          </div>
        </div>
        <div class="music-nav-content">
          <div class="music-section-title">Descubra Músicas Otaku</div>
          <div id="animeTracksGrid" class="anime-section"></div>
        </div>
      </div>
    </div>
  `);
  renderOtakuCarousels();
  let searchDebounceTimer = null;
  document.getElementById('animeTrackSearchInput').addEventListener('input', e => {
    clearTimeout(searchDebounceTimer);
    const searchTerm = e.target.value.trim();
    searchDebounceTimer = setTimeout(() => { refinedOtakuSearch(searchTerm); }, 600);
  });
  setTimeout(() => {
    renderPlayer();
    document.getElementById('player').classList.remove('hidden');
  }, 500);
}

// api query
async function refinedOtakuSearch(userQuery) {
  let found = [];
  const cacheKey = (userQuery || '').toLowerCase().trim();
  if (SEARCH_CACHE[cacheKey]) {
    found = SEARCH_CACHE[cacheKey];
  } else {
    const SEARCH_TERMS = [
      "anime opening", "anime ending", "anime ost", "anisong", "jpop", "kpop", "anime battle theme", "anime emotional", "anime romance", "anime best",
      "アニメ", "オープニング", "エンディング", "サウンドトラック", "名曲", "戦闘", "恋愛", "神曲",
      "Naruto", "One Piece", "Dragon Ball", "Attack on Titan", "Kimetsu no Yaiba", "Your Lie in April", "Tokyo Ghoul", "Fullmetal Alchemist", "Evangelion", "JoJo", "Haikyuu", "Spy x Family", "Chainsaw Man"
    ];
    let queries = [userQuery];
    if (!SEARCH_TERMS.some(term => (userQuery||"").toLowerCase().includes(term.toLowerCase()))) {
      queries = [userQuery, ...SEARCH_TERMS];
    }
    for (let q of queries) {
      if (!q) continue;
      try {
        if (found.length > 0) await new Promise(res => setTimeout(res, 400));
        const url = `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=18`;
        const json = await proxyFetch(url);
        for (const t of (json.data || [])) {
          if (
            t.preview &&
            /anime|japan|korea|ost|anisong|アニメ|オープニング|エンディング|サウンドトラック|romance|battle|emotional|ending|opening|love|名曲|戦闘|恋愛|神曲|song/i.test(t.title + ' ' + t.artist.name + ' ' + t.album.title) &&
            !found.find(tt => tt.id === t.id)
          ) found.push(t);
          if (found.length >= 12) break;
        }
        if (found.length >= 12) break;
      } catch (e) {}
    }
    SEARCH_CACHE[cacheKey] = found;
  }
  let html = found.length ? '<div class="music-track-grid">' + found.map((track, i) => `
      <div class="music-track-card" onclick="playThisTrackSearch(${i})">
        <img class="cover" src="${track.album.cover_medium}" alt="${track.title}">
        <div class="track-title">${track.title}</div>
        <div class="track-artist">${track.artist.name}</div>
      </div>
    `).join('') + '</div>'
    : '<div style="color:#fff;opacity:0.7;padding:18px;">Nenhuma música encontrada.</div>';
  document.getElementById('animeTracksGrid').innerHTML = html;
  window.playThisTrackSearch = function(idx) { animeTracks = found; currentTrackIndex = idx; playPreview(); };
}

// home
function showHome() {
  document.getElementById('mainHeader').style.display = 'flex';
  document.getElementById('mainContentArea').style.display = 'flex';
  removePlayer();
  document.getElementById('lyrics-panel')?.classList.add('hidden');
  document.getElementById('view-root').innerHTML = `
    <div class="text-content" id="mainText">
      ${user ? `
        <h1>Bem-vindo, ${user.display_name || 'usuário'}!</h1>
        <p>Explore o mundo dos animes e músicas agora.</p>
        <button id="startListeningBtn">Começar a Ouvir</button>
      ` : `
        <h1>DESCUBRA NOVOS SONS,<br>EMOÇÕES E MUNDOS</h1>
        <p>SINTONIZE AGORA COM O MELHOR DA MÚSICA,<br>ANIME E CULTURA JOVEM.</p>
        <button id="exploreBtn">Explorar</button>
      `}
    </div>
  `;
  if (user) document.getElementById('startListeningBtn').onclick = showExplore;
  else document.getElementById('exploreBtn').onclick = () => alert('Faça login com o Spotify primeiro!');
}

// player
window.playThisTrack = function(index) {
  if (!animeTracks[index]) return;
  currentTrackIndex = index;
  playPreview();
};
function playPreview() {
  if (!animeTracks.length) return;
  const track = animeTracks[currentTrackIndex];
  updatePlayerUI(track);
  if (playerAudio) { playerAudio.pause(); playerAudio.currentTime = 0; }
  playerAudio = new Audio(track.preview);
  const volumeSlider = document.getElementById('volume-control');
  if (volumeSlider) playerAudio.volume = parseFloat(volumeSlider.value);
  playerAudio.onended = () => { const playBtn = document.getElementById('play'); if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>'; };
  playerAudio.play();
  const playBtn = document.getElementById('play');
  if (playBtn) {
    playBtn.innerHTML = '<i class="fas fa-pause"></i>';
    playBtn.onclick = () => {
      if (playerAudio.paused) { playerAudio.play(); playBtn.innerHTML = '<i class="fas fa-pause"></i>'; }
      else { playerAudio.pause(); playBtn.innerHTML = '<i class="fas fa-play"></i>'; }
    };
  }
  document.getElementById('player')?.classList.remove('hidden');
}
function updatePlayerUI(track) {
  document.getElementById('album-cover').src = track.album.cover_medium;
  document.getElementById('track-title').textContent = track.title;
  document.getElementById('track-artist').textContent = track.artist.name;
  const lyrics = document.getElementById('lyrics'); if (lyrics) lyrics.textContent = 'Letra indisponível para prévias.';
}

// login
document.getElementById('spotifyLoginBtn').addEventListener('click', async () => {
  const codeVerifier = generateRandomString(128);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  localStorage.setItem('code_verifier', codeVerifier);
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    scope: 'user-read-private user-read-email'
  });
  window.location = `https://accounts.spotify.com/authorize?${params}`;
});
async function handleRedirect() {
  const code = new URLSearchParams(window.location.search).get('code');
  if (!code) return;
  const codeVerifier = localStorage.getItem('code_verifier');
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
  });
  const data = await res.json();
  accessToken = data.access_token;
  localStorage.setItem('access_token', accessToken);
  window.history.replaceState({}, document.title, redirectUri);
  await loadSpotifyProfile();
  showHome();
}
async function loadSpotifyProfile() {
  accessToken = accessToken || localStorage.getItem('access_token');
  if (!accessToken) return;
  const res = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: 'Bearer ' + accessToken }
  });
  user = await res.json();
  document.getElementById('loginArea').style.display = 'none';
  document.getElementById('userInfo').style.display = 'flex';
  document.getElementById('userNickname').textContent = user.display_name || 'Usuário';
  document.getElementById('userAvatar').src = user.images?.[0]?.url || 'https://ui-avatars.com/api/?name=AnimeBeat';
  document.getElementById('userAvatar').onclick = () => {
    if (user && user.external_urls && user.external_urls.spotify) window.open(user.external_urls.spotify, '_blank');
  };
}

// logout
document.getElementById('logoutBtn').onclick = () => {
  localStorage.removeItem('access_token');
  user = null; accessToken = null; animeTracks = [];
  document.getElementById('loginArea').style.display = '';
  document.getElementById('userInfo').style.display = 'none';
  removePlayer();
  showHome();
};

// init
window.addEventListener('DOMContentLoaded', async () => {
  accessToken = localStorage.getItem('access_token');
  if (new URLSearchParams(window.location.search).get('code')) { await handleRedirect(); return; }
  if (accessToken) await loadSpotifyProfile();
  removePlayer();
  showHome();
});