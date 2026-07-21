import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const favoriteButton = document.querySelector('#favorite-button');
const message = document.querySelector('#message');
const movie = { title: 'Дюна: Часть вторая', release_year: 2024 };
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let favoriteId = null;

function setMessage(text = '') { message.textContent = text; }
function paintSaved(saved) {
  favoriteButton.classList.toggle('is-saved', saved);
  favoriteButton.querySelector('i').className = saved ? 'ph ph-bookmark-simple-fill' : 'ph ph-bookmark-simple';
  favoriteButton.querySelector('span').textContent = saved ? 'В избранном' : 'Сохранить в избранное';
}
async function ensureSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (session) return session;
  const { error: signInError } = await supabase.auth.signInAnonymously();
  if (signInError) throw signInError;
}
async function checkFavorite() {
  const { data, error } = await supabase.from('favorites').select('id').eq('title', movie.title).eq('release_year', movie.release_year).maybeSingle();
  if (error) throw error;
  favoriteId = data?.id ?? null;
  paintSaved(Boolean(favoriteId));
}
favoriteButton.addEventListener('click', async () => {
  favoriteButton.disabled = true;
  setMessage();
  try {
    if (favoriteId) {
      const { error } = await supabase.from('favorites').delete().eq('id', favoriteId);
      if (error) throw error;
      favoriteId = null;
      paintSaved(false);
      setMessage('Удалено из избранного');
    } else {
      const { data, error } = await supabase.from('favorites').insert(movie).select('id').single();
      if (error) throw error;
      favoriteId = data.id;
      paintSaved(true);
      setMessage('Сохранено в избранное');
    }
  } catch (error) {
    console.error(error);
    setMessage('Не удалось обновить избранное. Попробуйте ещё раз.');
  } finally { favoriteButton.disabled = false; }
});
try { await ensureSession(); await checkFavorite(); } catch (error) { console.error(error); setMessage('Избранное временно недоступно.'); }
