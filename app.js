import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

let movie = { title: 'Дюна: Часть вторая', release_year: 2024 };
const catalog = [
  { title: 'Дюна: Часть вторая', meta: '2024 · фильм · в цифровом релизе', match: ['дюна', 'dune', 'часть'] },
  { title: 'Оппенгеймер', meta: '2023 · фильм · в цифровом релизе', match: ['оппенгеймер', 'oppenheimer'] },
  { title: 'Сёгун', meta: '2024 · сериал · в цифровом релизе', match: ['сёгун', 'сегун', 'shogun'] }
];
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const searchPage = document.querySelector('#search-page');
const favoritesPage = document.querySelector('#favorites-page');
const detailPage = document.querySelector('#detail-page');
const searchForm = document.querySelector('#search-form');
const searchInput = document.querySelector('#search-input');
const results = document.querySelector('#search-results');
const resultList = document.querySelector('#results-list');
const resultCount = document.querySelector('#results-count');
const resultTemplate = document.querySelector('#result-template');
const favoritesList = document.querySelector('#favorites-list');
const favoritesCount = document.querySelector('#favorites-count');
const favoritesEmpty = document.querySelector('#favorites-empty');
const favoriteTemplate = document.querySelector('#favorite-template');
const favoriteButton = document.querySelector('#favorite-button');
const favoritesButton = document.querySelector('#favorites-button');
const message = document.querySelector('#message');
let favoriteId = null;
let tmdbApiKey = null;
let poiskinoApiKey = null;
let detailRequest = 0;
let returnView = 'search';
const favoriteRatingsCache = new Map();
try { ({ TMDB_API_KEY: tmdbApiKey } = await import('./tmdb.local.js')); } catch { console.info('TMDB local key is not configured.'); }
try { ({ POISKINO_API_KEY: poiskinoApiKey } = await import('./poiskino.local.js')); } catch { console.info('Poiskino local key is not configured.'); }

function setMessage(text = '') { message.textContent = text; }
function paintSaved(saved) { favoriteButton.classList.toggle('is-saved', saved); favoriteButton.querySelector('i').className = saved ? 'ph ph-bookmark-simple-fill' : 'ph ph-bookmark-simple'; favoriteButton.querySelector('span').textContent = saved ? 'В избранном' : 'Сохранить в избранное'; }
function reveal(view) { view.classList.remove('view-fade'); void view.offsetWidth; view.classList.add('view-fade'); }
function showSearch() { detailPage.hidden = true; favoritesPage.hidden = true; searchPage.hidden = false; reveal(searchPage); searchInput.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
async function showFavorites() { detailPage.hidden = true; searchPage.hidden = true; favoritesPage.hidden = false; reveal(favoritesPage); window.scrollTo({ top: 0, behavior: 'smooth' }); try { await loadFavorites(); } catch (error) { console.error(error); } }
function showDetails(item, origin = 'search') {
  returnView = origin;
  document.querySelector('#back-button-label').textContent = origin === 'favorites' ? 'Назад в избранное' : 'Назад к поиску';
  if (item) {
    const requestId = ++detailRequest;
    movie = { title: item.title, release_year: item.year ? Number(item.year) : null };
    document.querySelector('#film-name').textContent = item.title;
    document.querySelector('.movie-type').textContent = `${item.kind} · ${item.year || 'год не указан'}`;
    document.querySelector('.synopsis').textContent = item.overview || 'Описание пока не добавлено в каталоге.';
    document.querySelector('.poster').src = item.poster || 'assets/desert-moon-poster.png';
    document.querySelector('.poster').alt = `Постер: ${item.title}`;
    document.querySelectorAll('.rating').forEach(rating => {
      rating.querySelector('strong').textContent = '—';
      rating.querySelector('small').textContent = 'загружаем';
    });
    document.querySelector('.section-heading span').textContent = 'Проверяем источники';
    document.querySelector('#availability').textContent = 'Проверяем';
    document.querySelector('#release-label').textContent = 'Цифровой релиз';
    document.querySelector('#release-date').textContent = 'Проверяем данные';
    delete document.querySelector('#release-date').dataset.source;
    document.querySelector('#release-platforms').textContent = 'Платформы загружаются';
    document.querySelector('#provider-attribution').textContent = '';
    loadPoiskinoDetails(item, requestId).catch(error => { console.error(error); if (requestId === detailRequest) { document.querySelector('.imdb small').textContent = 'нет данных'; document.querySelector('.critics small').textContent = 'нет данных'; document.querySelector('.kino small').textContent = 'нет данных'; } });
    loadTmdbDetails(item, requestId).catch(error => { console.error(error); if (requestId === detailRequest) { document.querySelector('.tmdb small').textContent = 'нет данных'; document.querySelector('#availability').textContent = 'Не подтверждено'; document.querySelector('#release-date').textContent = 'Не подтверждено'; document.querySelector('#release-platforms').textContent = 'Нет данных о платформах'; } });
    checkFavorite().catch(() => {});
  }
  searchPage.hidden = true; favoritesPage.hidden = true; detailPage.hidden = false; reveal(detailPage); window.scrollTo({ top: 0, behavior: 'smooth' });
}
function renderResults(items, query) {
  const term = query.trim().toLowerCase();
  const matches = items ?? (term ? catalog.filter(item => [item.title.toLowerCase(), ...item.match].some(value => value.includes(term) || term.includes(value))) : []);
  results.hidden = false; resultList.replaceChildren();
  resultCount.textContent = matches.length ? `${matches.length} найдено` : '';
  if (!matches.length) { const empty = document.createElement('p'); empty.className = 'empty-results'; empty.textContent = 'Ничего не нашли. Попробуйте другое название.'; resultList.append(empty); return; }
  for (const item of matches) {
    const card = resultTemplate.content.cloneNode(true); const button = card.querySelector('.result-card');
    button.querySelector('img').src = item.poster || 'assets/desert-moon-poster.png';
    button.querySelector('small').textContent = item.meta; button.querySelector('strong').textContent = item.title; button.querySelector('.result-copy > span').textContent = item.title === movie.title ? 'IMDb 8,5 · Кинопоиск 8,3' : 'Карточка с рейтингами и релизом';
    button.addEventListener('click', () => showDetails(item)); resultList.append(card);
  }
}
async function searchTmdb(query) {
  if (!tmdbApiKey) return null;
  const url = new URL('https://api.themoviedb.org/3/search/multi');
  url.search = new URLSearchParams({ api_key: tmdbApiKey, query, language: 'ru-RU', include_adult: 'false' });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`TMDB search failed: ${response.status}`);
  const { results: tmdbResults } = await response.json();
  return tmdbResults.filter(item => item.media_type === 'movie' || item.media_type === 'tv').slice(0, 8).map(item => ({
    title: item.title || item.name,
    year: (item.release_date || item.first_air_date || '').slice(0, 4),
    kind: item.media_type === 'tv' ? 'Сериал' : 'Фильм',
    meta: `${(item.release_date || item.first_air_date || '').slice(0, 4) || 'год не указан'} · ${item.media_type === 'tv' ? 'сериал' : 'фильм'} · TMDB`,
    overview: item.overview,
    poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
    id: item.id,
    mediaType: item.media_type
  }));
}
function formatDate(date) { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date.slice(0, 10)}T00:00:00Z`)); }
function digitalDate(details) {
  const countries = details.release_dates?.results ?? [];
  const originalRelease = details.release_date || details.first_air_date || '';
  const valid = release => release.type === 4 && (!originalRelease || release.release_date.slice(0, 10) >= originalRelease);
  const inCountry = country => countries.find(item => item.iso_3166_1 === country)?.release_dates?.find(valid)?.release_date;
  return inCountry('RU') || inCountry('US') || countries.flatMap(item => item.release_dates).find(valid)?.release_date || null;
}
function displayScore(value, digits = 1) { return Number.isFinite(Number(value)) ? Number(value).toFixed(digits).replace('.', ',') : '—'; }
function setRating(selector, value, caption) { const rating = document.querySelector(selector); rating.querySelector('strong').textContent = displayScore(value); rating.querySelector('small').textContent = Number.isFinite(Number(value)) ? caption : 'нет данных'; }
function selectPoiskinoMatch(docs) { return docs?.find(item => item.name && (Number.isFinite(Number(item.rating?.kp)) || Number.isFinite(Number(item.rating?.imdb)) || Number.isFinite(Number(item.rating?.filmCritics)))) || docs?.find(item => item.name) || docs?.[0] || null; }
function normalizeTitle(title) { return title.trim().toLocaleLowerCase('ru-RU'); }
async function findPoiskinoMatch(item) {
  const lookup = new URL('https://api.poiskkino.dev/v1.4/movie');
  lookup.search = new URLSearchParams({ 'externalId.tmdb': item.id, limit: '10' });
  const response = await fetch(lookup, { headers: { 'X-API-KEY': poiskinoApiKey } });
  if (!response.ok) throw new Error(`Poiskino lookup failed: ${response.status}`);
  const { docs } = await response.json();
  const byExternalId = selectPoiskinoMatch(docs);
  if (byExternalId) return byExternalId;
  const search = new URL('https://api.poiskkino.dev/v1.4/movie/search');
  search.search = new URLSearchParams({ query: item.title, limit: '10' });
  const searchResponse = await fetch(search, { headers: { 'X-API-KEY': poiskinoApiKey } });
  if (!searchResponse.ok) return null;
  const { docs: searchDocs } = await searchResponse.json();
  return selectPoiskinoMatch(searchDocs?.filter(candidate => normalizeTitle(candidate.name ?? '') === normalizeTitle(item.title) && (!item.year || Number(candidate.year) === Number(item.year))));
}
async function loadPoiskinoDetails(item, requestId) {
  if (!poiskinoApiKey || !item.id) throw new Error('Poiskino key is not configured');
  const match = await findPoiskinoMatch(item);
  if (!match) throw new Error('Poiskino title not found');
  if (requestId !== detailRequest) return;
  setRating('.imdb', match.rating?.imdb, 'зрители · Poiskino');
  const criticsRating = Number.isFinite(Number(match.rating?.filmCritics)) ? match.rating.filmCritics : Number.isFinite(Number(match.rating?.russianFilmCritics)) ? Number(match.rating.russianFilmCritics) / 10 : null;
  setRating('.critics', criticsRating, 'критики · Poiskino');
  setRating('.kino', match.rating?.kp, 'зрители · Poiskino');
  document.querySelector('.section-heading span').textContent = 'Рейтинги: Poiskino';
  if (!match.id) return;
  const detailsResponse = await fetch(`https://api.poiskkino.dev/v1.4/movie/${match.id}`, { headers: { 'X-API-KEY': poiskinoApiKey } });
  if (!detailsResponse.ok) return;
  const details = await detailsResponse.json();
  if (requestId !== detailRequest) return;
  const date = details.premiere?.digital;
  const providers = (details.watchability?.items ?? []).map(item => item.name).filter((name, index, list) => name && list.indexOf(name) === index).slice(0, 4);
  if (date) {
    document.querySelector('#availability').textContent = 'В цифре';
    document.querySelector('#release-date').textContent = `Доступен с ${formatDate(date)}`;
    document.querySelector('#release-platforms').textContent = providers.length ? providers.join(' · ') : 'Платформы не подтверждены';
    document.querySelector('#provider-attribution').textContent = 'Релиз: Poiskino';
    document.querySelector('#release-date').dataset.source = 'poiskino';
  }
}
async function loadTmdbDetails(item, requestId) {
  if (!tmdbApiKey || !item.id) return;
  const path = item.mediaType === 'tv' ? `tv/${item.id}` : `movie/${item.id}`;
  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  url.search = new URLSearchParams({ api_key: tmdbApiKey, language: 'ru-RU', append_to_response: 'release_dates,watch/providers' });
  const response = await fetch(url); if (!response.ok) throw new Error(`TMDB details failed: ${response.status}`);
  const details = await response.json();
  if (requestId !== detailRequest) return;
  document.querySelector('.tmdb strong').textContent = details.vote_average ? details.vote_average.toFixed(1).replace('.', ',') : '—';
  document.querySelector('.tmdb small').textContent = details.vote_count ? `${new Intl.NumberFormat('ru-RU').format(details.vote_count)} голосов` : 'нет голосов';
  if (document.querySelector('#release-date').dataset.source === 'poiskino') return;
  const date = item.mediaType === 'movie' ? digitalDate(details) : null;
  document.querySelector('#availability').textContent = date ? 'В цифре' : 'Не подтверждено';
  document.querySelector('#release-date').textContent = date ? `Доступен с ${formatDate(date)}` : 'Не подтверждено';
  const region = details['watch/providers']?.results?.RU || details['watch/providers']?.results?.US;
  const providers = [...(region?.flatrate || []), ...(region?.rent || []), ...(region?.buy || [])].map(provider => provider.provider_name).filter((name, index, list) => list.indexOf(name) === index).slice(0, 4);
  document.querySelector('#release-platforms').textContent = providers.length ? providers.join(' · ') : 'Нет данных о платформах';
  document.querySelector('#provider-attribution').textContent = providers.length ? 'Релиз и платформы: TMDB / JustWatch' : 'Релиз: TMDB';
}
async function ensureSession() { const { data: { session }, error } = await supabase.auth.getSession(); if (error) throw error; if (!session) { const { error: signInError } = await supabase.auth.signInAnonymously(); if (signInError) throw signInError; } }
async function checkFavorite() { const { data, error } = await supabase.from('favorites').select('id').eq('title', movie.title).eq('release_year', movie.release_year).maybeSingle(); if (error) throw error; favoriteId = data?.id ?? null; paintSaved(Boolean(favoriteId)); }
async function openFavorite(entry) {
  try {
    const matches = await searchTmdb(entry.title);
    const item = matches?.find(candidate => candidate.title.toLowerCase() === entry.title.toLowerCase() && Number(candidate.year) === Number(entry.release_year)) || matches?.find(candidate => candidate.title.toLowerCase() === entry.title.toLowerCase()) || { title: entry.title, year: entry.release_year, kind: 'Фильм', overview: '', poster: null };
    showDetails(item, 'favorites');
  } catch (error) { console.error(error); showDetails({ title: entry.title, year: entry.release_year, kind: 'Фильм', overview: '', poster: null }, 'favorites'); }
}
async function loadFavoriteRatings(entry) {
  const cacheKey = `${entry.title}:${entry.release_year ?? ''}`;
  if (favoriteRatingsCache.has(cacheKey)) return favoriteRatingsCache.get(cacheKey);
  if (!poiskinoApiKey) return null;
  const matches = await searchTmdb(entry.title);
  const item = matches?.find(candidate => candidate.title.toLowerCase() === entry.title.toLowerCase() && Number(candidate.year) === Number(entry.release_year)) || matches?.find(candidate => candidate.title.toLowerCase() === entry.title.toLowerCase());
  if (!item?.id) return null;
  const rating = (await findPoiskinoMatch(item))?.rating ?? null;
  favoriteRatingsCache.set(cacheKey, rating);
  return rating;
}
function renderFavorites(entries) {
  favoritesList.replaceChildren();
  favoritesCount.textContent = entries.length ? `${entries.length} сохранено` : '';
  favoritesEmpty.hidden = Boolean(entries.length);
  for (const entry of entries) {
    const card = favoriteTemplate.content.cloneNode(true);
    const button = card.querySelector('.favorite-card');
    button.querySelector('strong').textContent = entry.title;
    const caption = button.querySelector('small');
    caption.textContent = entry.release_year ? `${entry.release_year} · Рейтинги загружаются` : 'Рейтинги загружаются';
    button.addEventListener('click', () => openFavorite(entry));
    favoritesList.append(card);
    loadFavoriteRatings(entry).then(rating => {
      if (!rating || !button.isConnected) { caption.textContent = entry.release_year ? `${entry.release_year} · Открыть карточку` : 'Открыть карточку'; return; }
      const scores = [];
      if (Number.isFinite(Number(rating.kp))) scores.push(`КП ${displayScore(rating.kp)}`);
      if (Number.isFinite(Number(rating.imdb))) scores.push(`IMDb ${displayScore(rating.imdb)}`);
      const critics = Number.isFinite(Number(rating.filmCritics)) ? rating.filmCritics : Number.isFinite(Number(rating.russianFilmCritics)) ? Number(rating.russianFilmCritics) / 10 : null;
      if (critics !== null) scores.push(`Критики ${displayScore(critics)}`);
      caption.textContent = [entry.release_year, scores.join(' · ') || 'Открыть карточку'].filter(Boolean).join(' · ');
    }).catch(error => { console.error(error); if (button.isConnected) caption.textContent = entry.release_year ? `${entry.release_year} · Открыть карточку` : 'Открыть карточку'; });
  }
}
async function loadFavorites() { const { data, error } = await supabase.from('favorites').select('title, release_year').order('created_at', { ascending: false }); if (error) throw error; renderFavorites(data ?? []); }
async function performSearch(query) { const normalized = query.trim(); if (!normalized) return; resultCount.textContent = 'Ищем…'; results.hidden = false; resultList.replaceChildren(); try { renderResults(await searchTmdb(normalized), normalized); } catch (error) { console.error(error); renderResults(null, normalized); } }
searchForm.addEventListener('submit', event => { event.preventDefault(); performSearch(searchInput.value); });
document.querySelector('#back-button').addEventListener('click', () => returnView === 'favorites' ? showFavorites() : showSearch()); document.querySelector('#favorites-back-button').addEventListener('click', showSearch); document.querySelector('#home-button').addEventListener('click', showSearch); favoritesButton.addEventListener('click', showFavorites);
favoriteButton.addEventListener('click', async () => { favoriteButton.disabled = true; setMessage(); try { if (favoriteId) { const { error } = await supabase.from('favorites').delete().eq('id', favoriteId); if (error) throw error; favoriteId = null; paintSaved(false); setMessage('Удалено из избранного'); } else { const { data, error } = await supabase.from('favorites').insert(movie).select('id').single(); if (error) throw error; favoriteId = data.id; paintSaved(true); setMessage('Сохранено в избранное'); } await loadFavorites(); } catch (error) { console.error(error); setMessage('Не удалось обновить избранное. Попробуйте ещё раз.'); } finally { favoriteButton.disabled = false; } });
try { await ensureSession(); await checkFavorite(); await loadFavorites(); } catch (error) { console.error(error); setMessage('Избранное временно недоступно.'); }
