import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const status = document.querySelector('#connection-status');
const form = document.querySelector('#favorite-form');
const list = document.querySelector('#favorites-list');
const emptyState = document.querySelector('#empty-state');
const message = document.querySelector('#message');
const template = document.querySelector('#favorite-template');
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function setMessage(text = '') {
  message.hidden = !text;
  message.textContent = text;
}

function setStatus(text, state) {
  status.textContent = text;
  status.className = `status ${state}`;
}

async function ensureSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (session) return session;
  const { data, error: signInError } = await supabase.auth.signInAnonymously();
  if (signInError) throw signInError;
  return data.session;
}

function render(favorites) {
  list.replaceChildren();
  emptyState.hidden = favorites.length !== 0;
  for (const favorite of favorites) {
    const item = template.content.cloneNode(true);
    item.querySelector('.favorite-title').textContent = favorite.title;
    item.querySelector('.favorite-meta').textContent = favorite.release_year ? String(favorite.release_year) : 'Год не указан';
    const remove = item.querySelector('.remove-button');
    remove.addEventListener('click', () => removeFavorite(favorite.id, remove));
    list.append(item);
  }
}

async function loadFavorites() {
  const { data, error } = await supabase.from('favorites').select('id, title, release_year, created_at').order('created_at', { ascending: false });
  if (error) throw error;
  render(data);
}

async function removeFavorite(id, button) {
  button.disabled = true;
  setMessage();
  const { error } = await supabase.from('favorites').delete().eq('id', id);
  if (error) { setMessage(`Не удалось удалить: ${error.message}`); button.disabled = false; return; }
  await loadFavorites();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = form.querySelector('button[type="submit"]');
  const title = document.querySelector('#title').value.trim();
  const yearText = document.querySelector('#release-year').value.trim();
  const release_year = yearText ? Number(yearText) : null;
  if (release_year && (release_year < 1888 || release_year > 2100)) { setMessage('Укажите год в диапазоне 1888–2100.'); return; }
  submit.disabled = true; setMessage();
  const { error } = await supabase.from('favorites').insert({ title, release_year });
  submit.disabled = false;
  if (error) { setMessage(`Не удалось добавить: ${error.message}`); return; }
  form.reset();
  await loadFavorites();
});

try {
  await ensureSession();
  await loadFavorites();
  setStatus('Синхронизация включена', 'ready');
} catch (error) {
  console.error(error);
  setStatus('Нет подключения', 'error');
  setMessage(`Не удалось подключиться к избранному: ${error.message}`);
  form.querySelector('button[type="submit"]').disabled = true;
}
