// --- CONFIG ---
const clientId = '23cd83a8778d4274a8721e203c4dba70';
const redirectUri = window.location.origin + window.location.pathname;
let accessToken = null;
let user = null;

let animeTracks = [];
let playerAudio = null;
let currentTrackIndex = 0;
let animeTracksLoaded = false;

// spa navigation
let currentRoute = 'home';

// spotify login
async function generateCodeChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
function generateRandomString(length) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// player
function renderPlayer() {
  if (document.getElementById('player')) return;
  const playerHTML = `
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
  `;
  document.querySelector('.container').insertAdjacentHTML('beforeend', playerHTML);
  setupPlayerEventListeners();
}

function removePlayer() {
  const player = document.getElementById('player');
  if (player) player.remove();
}

function setupPlayerEventListeners() {
  const toggleLyricsBtn = document.getElementById('toggle-lyrics');
  if (toggleLyricsBtn) {
    toggleLyricsBtn.onclick = () => {
      const lyricsPanel = document.getElementById('lyrics-panel');
      if (lyricsPanel) lyricsPanel.classList.toggle('hidden');
    };
  }
  const prevBtn = document.getElementById('prev');
  if (prevBtn) {
    prevBtn.onclick = () => {
      if (!animeTracks.length) return;
      currentTrackIndex = (currentTrackIndex - 1 + animeTracks.length) % animeTracks.length;
      playPreview();
    };
  }
  const nextBtn = document.getElementById('next');
  if (nextBtn) {
    nextBtn.onclick = () => {
      if (!animeTracks.length) return;
      currentTrackIndex = (currentTrackIndex + 1) % animeTracks.length;
      playPreview();
    };
  }
  const playBtn = document.getElementById('play');
  if (playBtn) {
    playBtn.onclick = () => {
      if (!playerAudio) return;
      if (playerAudio.paused) {
        playerAudio.play();
        playBtn.innerHTML = '<i class="fas fa-pause"></i>';
      } else {
        playerAudio.pause();
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
      }
    };
  }
  // controle de volume
  const volumeControl = document.getElementById('volume-control');
  if (volumeControl) {
    volumeControl.addEventListener('input', function () {
      if (playerAudio) {
        playerAudio.volume = parseFloat(this.value);
      }
      const volIcon = document.getElementById('volume-icon');
      if (volIcon) {
        if (this.value <= 0.01) volIcon.style.color = '#888';
        else if (this.value < 0.4) volIcon.style.color = '#f6e96b';
        else volIcon.style.color = '#2196f3';
      }
    });
  }
}

// pesquisa
const OTAKU_TERMS = [
  "anime opening", "anime ending", "anime ost", "anime soundtrack", "anime instrumental", "anisong",
  "anime battle", "anime remix", "anime cover", "anime theme", "anime version",
  "jpop", "kpop", "j-rock", "k-rock", "japanese pop", "korean pop", "japanese rock", "korean rock",
  "japanese song", "korean song", "j-music", "k-music", "j-trap", "j-rap", "k-rap",
  "アニメ", "オープニング", "エンディング", "サウンドトラック", "主題歌", "挿入歌", "カバー", "リミックス", "ボーカロイド",
  "anime love song", "anime sad song", "anime happy song", "anime fight", "anime dance", "anime romance", 
  "anime nostalgia", "anime classics", "anime emotional", "anime nightcore", "anime piano", "anime acoustic",
  "Naruto", "Naruto Shippuden", "Blue Bird", "Silhouette", "One Piece", "Dragon Ball", "Dragon Ball Z", 
  "Dragon Ball Super", "Attack on Titan", "Shingeki no Kyojin", "Guren no Yumiya", "Kimetsu no Yaiba", "Demon Slayer",
  "Gurenge", "My Hero Academia", "Boku no Hero Academia", "Peace Sign", "Unravel", "Tokyo Ghoul",
  "Sword Art Online", "Crossing Field", "Fairy Tail", "Bleach", "Asterisk", "Evangelion", "JoJo", "Jojo's Bizarre Adventure",
  "Chainsaw Man", "KICK BACK", "Spy x Family", "Hunter x Hunter", "Haikyuu", "Black Clover", "Fullmetal Alchemist", 
  "FMA Brotherhood", "Death Note", "Monster", "Mob Psycho", "Your Name", "Kimi no Na wa", "Suzume",
  "K-On", "Yuru Camp", "Re:Zero", "No Game No Life", "Made in Abyss", "Violet Evergarden", "Steins;Gate", "Clannad",
  "LiSA", "Aimer", "Yoko Kanno", "Linked Horizon", "Eir Aoi", "Hikaru Utada", "FLOW", "Asian Kung-Fu Generation", 
  "Eve", "YOASOBI", "RADWIMPS", "UVERworld", "Kenshi Yonezu", "King Gnu", "Reona", "TrySail", "Kalafina",
  "Kpop", "Jpop", "rap de anime", "akatsuki", "boku no pico", "otaku song", "anime trap", "anime lo-fi", 
  "anime chill", "anime jazz", "anime guitar", "anime edm", "anime nightcore", "anime synthwave"
];

async function loadOtakuTracksGrid(userQuery) {
  animeTracks = [];
  document.getElementById('animeTracksGrid').innerHTML = '<div style="color:#fff;opacity:0.7;">Buscando músicas otaku...</div>';

  let query = OTAKU_TERMS.find(term =>
    userQuery && term.toLowerCase().includes(userQuery.toLowerCase())
  ) || "anime ost";

  if (userQuery) {
    const safeQuery = OTAKU_TERMS.some(term => userQuery.toLowerCase().includes(term.toLowerCase()));
    if (safeQuery) query = userQuery;
  }

  try {
    const proxy = "https://corsproxy.io/?";
    const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=20`;
    const res = await fetch(proxy + url);
    const json = await res.json();

    animeTracks = (json.data || []).filter(t =>
      t.preview &&
      (
        (t.artist && (
          /japan|korea|anime|j-pop|k-pop|ost|anisong|アニメ|オープニング|エンディング|サウンドトラック/i.test(t.artist.name) ||
          OTAKU_TERMS.some(term => t.artist.name.toLowerCase().includes(term.toLowerCase()))
        )) ||
        (t.title && (
          /anime|ost|opening|ending|battle|japan|korea|jpop|kpop|anisong|アニメ|オープニング|エンディング|サウンドトラック/i.test(t.title) ||
          OTAKU_TERMS.some(term => t.title.toLowerCase().includes(term.toLowerCase()))
        )) ||
        (t.album && (
          /anime|ost|opening|ending|battle|japan|korea|jpop|kpop|anisong|アニメ|オープニング|エンディング|サウンドトラック/i.test(t.album.title)
        ))
      )
    );
    animeTracks = animeTracks.sort((a, b) => {
      return (
        (/anime|ost/i.test(b.title) ? 1 : 0) -
        (/anime|ost/i.test(a.title) ? 1 : 0)
      );
    });
    renderAnimeTracksGrid(animeTracks);
  } catch (e) {
    document.getElementById('animeTracksGrid').innerHTML = '<div style="color:#fff;opacity:0.7;">Erro ao buscar músicas.</div>';
  }
}

// spa
function showHome() {
  currentRoute = 'home';
  document.getElementById('mainHeader').style.display = 'flex';
  document.getElementById('mainContentArea').style.display = 'flex';
  removePlayer();
  const lyricsPanel = document.getElementById('lyrics-panel');
  if (lyricsPanel) lyricsPanel.classList.add('hidden');
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
  if (user) {
    document.getElementById('startListeningBtn').onclick = showExplore;
  } else {
    document.getElementById('exploreBtn').onclick = () => alert('Faça login com o Spotify primeiro!');
  }
  setupUserAvatarMenu();
}

// musicas
function showExplore() {
  document.getElementById('mainHeader').style.display = "none";
  document.getElementById('mainContentArea').style.display = "none";

  if (document.getElementById('musicNavMain')) {
    document.getElementById('musicNavMain').remove();
  }

  document.body.insertAdjacentHTML('beforeend', `
    <div class="music-nav-fullscreen" id="musicNavMain">
      <div class="music-nav-main">
        <div class="music-nav-header">
          <div class="music-nav-search" style="width: 370px; display: flex; align-items: center;">
            <input type="text" placeholder="Buscar" id="animeTrackSearchInput" style="width: 100%; max-width: 320px; margin-right: 10px;"/>
            <i class="fas fa-search" id="animeSearchBtn" style="cursor:pointer; font-size:1.1em;"></i>
          </div>
          <div class="music-nav-user">
            <span>${user?.display_name?.split(' ')[0] || "usuário"}</span>
            <img class="user-avatar" src="${user?.images?.[0]?.url || 'https://ui-avatars.com/api/?name=AnimeBeat'}" alt="Avatar">
          </div>
        </div>
        <div class="music-nav-content">
          <div class="music-section-title">Músicas de Anime</div>
          <div id="animeTracksGrid" class="anime-section"></div>
        </div>
      </div>
    </div>
  `);

  // Busca inicial padrão
  loadOtakuTracksGrid("anime musicas");

  // Busca APENAS ao pressionar Enter ou clicar na lupa
  const searchInput = document.getElementById('animeTrackSearchInput');
  const searchBtn = document.getElementById('animeSearchBtn');
  let lastSearch = searchInput.value.trim() || "anime musicas";

  function executeSearch() {
    const term = searchInput.value.trim() || "anime musicas";
    if (term !== lastSearch) {
      lastSearch = term;
      loadOtakuTracksGrid(term);
    }
  }
  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') executeSearch();
  });
  searchBtn.addEventListener('click', executeSearch);

  setTimeout(() => {
    renderPlayer();
    document.getElementById('player').classList.remove('hidden');
    setupUserAvatarMenu();
  }, 500);
}

function renderAnimeTracksGrid(tracks) {
  const grid = document.getElementById('animeTracksGrid');
  if (!tracks || tracks.length === 0) {
    grid.innerHTML = '<div style="color:#fff;opacity:0.7;">Nenhuma música encontrada.</div>';
    return;
  }
  let html = '<div class="music-track-grid">';
  for (const [i, track] of tracks.entries()) {
    html += `
      <div class="music-track-card" onclick="playThisTrack(${i})">
        <img class="cover" src="${track.album.cover_medium}" alt="${track.title}">
        <div class="track-title">${track.title}</div>
        <div class="track-artist">${track.artist.name}</div>
      </div>
    `;
  }

  const minCol = 2;
  if (tracks.length < minCol) {
    for (let j = tracks.length; j < minCol; j++) {
      html += `<div class="music-track-card placeholder"></div>`;
    }
  }
  html += '</div>';
  grid.innerHTML = html;
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

  if (playerAudio) {
    playerAudio.pause();
    playerAudio.currentTime = 0;
  }
  playerAudio = new Audio(track.preview);
  const volumeSlider = document.getElementById('volume-control');
  if (volumeSlider) {
    playerAudio.volume = parseFloat(volumeSlider.value);
  }
  playerAudio.onended = () => {
    const playBtn = document.getElementById('play');
    if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';
  };
  playerAudio.play();

  const playBtn = document.getElementById('play');
  if (playBtn) {
    playBtn.innerHTML = '<i class="fas fa-pause"></i>';
    playBtn.onclick = () => {
      if (playerAudio.paused) {
        playerAudio.play();
        playBtn.innerHTML = '<i class="fas fa-pause"></i>';
      } else {
        playerAudio.pause();
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
      }
    };
  }

  const player = document.getElementById('player');
  if (player) player.classList.remove('hidden');
}

function updatePlayerUI(track) {
  const albumCover = document.getElementById('album-cover');
  const trackTitle = document.getElementById('track-title');
  const trackArtist = document.getElementById('track-artist');
  const lyrics = document.getElementById('lyrics');
  if (albumCover) albumCover.src = track.album.cover_medium;
  if (trackTitle) trackTitle.textContent = track.title;
  if (trackArtist) trackArtist.textContent = track.artist.name;
  if (lyrics) lyrics.textContent = 'Letra indisponível para prévias.';
}

// auth spotify
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
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
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
  setupUserAvatarMenu();
}

// popup
function showUserMenu(anchorElement) {
  const existing = document.getElementById('userMenuPopup');
  if (existing) {
    existing.classList.add('menu-exit');
    setTimeout(() => existing.remove(), 170);
    return;
  }
  const menu = document.createElement('div');
  menu.id = 'userMenuPopup';
  menu.className = 'user-menu-popup';
  menu.innerHTML = `
    <button id="goProfileBtn">Perfil Spotify</button>
    <button id="logoutMenuBtn">Sair</button>
  `;
  document.body.appendChild(menu);

  // Melhor posicionamento responsivo
  const rect = anchorElement.getBoundingClientRect();
  const menuWidth = 180;
  const menuHeight = 90;
  let top = rect.bottom + window.scrollY + 8;
  let left = rect.left + window.scrollX - 30;

  // Ajusta se ficar fora da tela à direita
  if (left + menuWidth > window.scrollX + window.innerWidth - 12) {
    left = window.scrollX + window.innerWidth - menuWidth - 12;
  }
  // Ajusta se ficar para fora à esquerda
  if (left < window.scrollX + 6) {
    left = window.scrollX + 6;
  }
  // Ajusta se ficar fora embaixo
  if (top + menuHeight > window.scrollY + window.innerHeight - 8) {
    top = rect.top + window.scrollY - menuHeight - 8;
    if (top < window.scrollY + 4) top = window.scrollY + 4;
  }

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  document.getElementById('goProfileBtn').onclick = () => {
    if (user && user.external_urls && user.external_urls.spotify) {
      window.open(user.external_urls.spotify, '_blank');
      menu.classList.add('menu-exit');
      setTimeout(() => menu.remove(), 170);
    }
  };
  document.getElementById('logoutMenuBtn').onclick = () => {
    localStorage.removeItem('access_token');
    user = null;
    accessToken = null;
    animeTracks = [];
    animeTracksLoaded = false;
    menu.classList.add('menu-exit');
    setTimeout(() => {
      menu.remove();
      window.location.href = window.location.origin + window.location.pathname;
    }, 170);
    removePlayer();
  };

  // fecha se clicar fora
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!menu.contains(e.target) && e.target !== anchorElement) {
        menu.classList.add('menu-exit');
        setTimeout(() => menu.remove(), 170);
        document.removeEventListener('click', handler);
      }
    });
  }, 0);
}

function setupUserAvatarMenu() {
  const loginAvatar = document.getElementById('userAvatar');
  if (loginAvatar) {
    loginAvatar.onclick = (e) => {
      e.stopPropagation();
      showUserMenu(loginAvatar);
    };
  }
  const musicNavAvatars = document.querySelectorAll('.music-nav-user .user-avatar');
  musicNavAvatars.forEach((musicAvatar) => {
    musicAvatar.onclick = (e) => {
      e.stopPropagation();
      showUserMenu(musicAvatar);
    };
  });
}

// init
window.addEventListener('DOMContentLoaded', async () => {
  accessToken = localStorage.getItem('access_token');
  if (new URLSearchParams(window.location.search).get('code')) {
    await handleRedirect();
    return;
  }
  if (accessToken) {
    await loadSpotifyProfile();
  }
  removePlayer();
  showHome();
});