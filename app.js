import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

let movie = { title: 'Дюна: Часть вторая', release_year: 2024 };
const catalog = [
  { title: 'Дюна: Часть вторая', meta: '2024 · фильм · в цифровом релизе', match: ['дюна', 'dune', 'часть'] },
  { title: 'Оппенгеймер', meta: '2023 · фильм · в цифровом релизе', match: ['оппенгеймер', 'oppenheimer'] },
  { title: 'Сёгун', meta: '2024 · сериал · в цифровом релизе', match: ['сёгун', 'сегун', 'shogun'] }
];
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const movieFunctionUrl = `${SUPABASE_URL}/functions/v1/kinoradar-search`;
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
let detailRequest = 0;
let returnView = 'search';
const favoriteRatingsCache = new Map();

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
    loadMovieDetails(item, requestId).catch(error => { console.error(error); if (requestId === detailRequest) { document.querySelectorAll('.rating small').forEach(node => { node.textContent = 'нет данных'; }); document.querySelector('#availability').textContent = 'Не подтверждено'; document.querySelector('#release-date').textContent = 'Не подтверждено'; document.querySelector('#release-platforms').textContent = 'Нет данных о платформах'; } });
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
async function callMovieService(payload) {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(movieFunctionUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session?.access_token ?? SUPABASE_ANON_KEY}` },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Movie service failed: ${response.status}`);
  return response.json();
}
function mapMovie(item) {
  const isSeries = item.type === 'tv-series' || item.type === 'tv';
  return { title: item.name || item.alternativeName, year: item.year, kind: isSeries ? 'Сериал' : 'Фильм', meta: `${item.year || 'год не указан'} · ${isSeries ? 'сериал' : 'фильм'} · Poiskino`, overview: item.description, poster: item.poster?.url || null, id: item.id };
}
async function searchMovies(query) {
  const { docs = [] } = await callMovieService({ action: 'search', query });
  return docs.filter(item => item.type === 'movie' || item.type === 'tv-series' || item.type === 'tv').slice(0, 8).map(mapMovie);
}
function formatDate(date) { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date.slice(0, 10)}T00:00:00Z`)); }
function displayScore(value, digits = 1) { return Number.isFinite(Number(value)) ? Number(value).toFixed(digits).replace('.', ',') : '—'; }
function setRating(selector, value, caption) { const rating = document.querySelector(selector); rating.querySelector('strong').textContent = displayScore(value); rating.querySelector('small').textContent = Number.isFinite(Number(value)) ? caption : 'нет данных'; }
function criticsScore(rating) { return Number.isFinite(Number(rating?.filmCritics)) ? rating.filmCritics : Number.isFinite(Number(rating?.russianFilmCritics)) ? Number(rating.russianFilmCritics) / 10 : null; }
async function loadMovieDetails(item, requestId) {
  if (!item.id) throw new Error('Movie id is not configured');
  const details = await callMovieService({ action: 'details', id: item.id });
  if (requestId !== detailRequest) return;
  setRating('.imdb', details.rating?.imdb, 'зрители · Poiskino');
  setRating('.critics', criticsScore(details.rating), 'критики · Poiskino');
  setRating('.tmdb', details.rating?.tmdb, 'зрители · Poiskino');
  setRating('.kino', details.rating?.kp, 'зрители · Poiskino');
  document.querySelector('.section-heading span').textContent = 'Рейтинги: Poiskino';
  const date = details.premiere?.digital;
  const providers = (details.watchability?.items ?? []).map(provider => provider.name).filter((name, index, list) => name && list.indexOf(name) === index).slice(0, 4);
  document.querySelector('#availability').textContent = date ? 'В цифре' : 'Не подтверждено';
  document.querySelector('#release-date').textContent = date ? `Доступен с ${formatDate(date)}` : 'Не подтверждено';
  document.querySelector('#release-platforms').textContent = providers.length ? providers.join(' · ') : 'Нет данных о платформах';
  document.querySelector('#provider-attribution').textContent = 'Данные: Poiskino';
}
async function ensureSession() { const { data: { session }, error } = await supabase.auth.getSession(); if (error) throw error; if (!session) { const { error: signInError } = await supabase.auth.signInAnonymously(); if (signInError) throw signInError; } }
async function checkFavorite() { const { data, error } = await supabase.from('favorites').select('id').eq('title', movie.title).eq('release_year', movie.release_year).maybeSingle(); if (error) throw error; favoriteId = data?.id ?? null; paintSaved(Boolean(favoriteId)); }
async function openFavorite(entry) {
  try {
    const matches = await searchMovies(entry.title);
    const item = matches?.find(candidate => candidate.title.toLowerCase() === entry.title.toLowerCase() && Number(candidate.year) === Number(entry.release_year)) || matches?.find(candidate => candidate.title.toLowerCase() === entry.title.toLowerCase()) || { title: entry.title, year: entry.release_year, kind: 'Фильм', overview: '', poster: null };
    showDetails(item, 'favorites');
  } catch (error) { console.error(error); showDetails({ title: entry.title, year: entry.release_year, kind: 'Фильм', overview: '', poster: null }, 'favorites'); }
}
async function loadFavoriteRatings(entry) {
  const cacheKey = `${entry.title}:${entry.release_year ?? ''}`;
  if (favoriteRatingsCache.has(cacheKey)) return favoriteRatingsCache.get(cacheKey);
  const matches = await searchMovies(entry.title);
  const item = matches?.find(candidate => candidate.title.toLowerCase() === entry.title.toLowerCase() && Number(candidate.year) === Number(entry.release_year)) || matches?.find(candidate => candidate.title.toLowerCase() === entry.title.toLowerCase());
  if (!item?.id) return null;
  const rating = (await callMovieService({ action: 'details', id: item.id }))?.rating ?? null;
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
async function performSearch(query) { const normalized = query.trim(); if (!normalized) return; resultCount.textContent = 'Ищем…'; results.hidden = false; resultList.replaceChildren(); try { renderResults(await searchMovies(normalized), normalized); } catch (error) { console.error(error); renderResults(null, normalized); } }
searchForm.addEventListener('submit', event => { event.preventDefault(); performSearch(searchInput.value); });
document.querySelector('#back-button').addEventListener('click', () => returnView === 'favorites' ? showFavorites() : showSearch()); document.querySelector('#favorites-back-button').addEventListener('click', showSearch); document.querySelector('#home-button').addEventListener('click', showSearch); favoritesButton.addEventListener('click', showFavorites);
favoriteButton.addEventListener('click', async () => { favoriteButton.disabled = true; setMessage(); try { if (favoriteId) { const { error } = await supabase.from('favorites').delete().eq('id', favoriteId); if (error) throw error; favoriteId = null; paintSaved(false); setMessage('Удалено из избранного'); } else { const { data, error } = await supabase.from('favorites').insert(movie).select('id').single(); if (error) throw error; favoriteId = data.id; paintSaved(true); setMessage('Сохранено в избранное'); } await loadFavorites(); } catch (error) { console.error(error); setMessage('Не удалось обновить избранное. Попробуйте ещё раз.'); } finally { favoriteButton.disabled = false; } });
try { await ensureSession(); await checkFavorite(); await loadFavorites(); } catch (error) { console.error(error); setMessage('Избранное временно недоступно.'); }
