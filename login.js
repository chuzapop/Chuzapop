const SUPABASE_URL = 'https://yvnwllznubeysbxkwndj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-sbcspzG9wUeGE7S_bklKA_hUapn-3Y';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);
let registrando = false;

function show(type, text) {
  const f = $('feedback');
  f.className = `feedback ${type}`;
  f.textContent = text;
}

// Cambiar entre "Entrar" y "Registrarme"
$('toggle').onclick = () => {
  registrando = !registrando;
  $('title').textContent = registrando ? 'Crear cuenta' : 'Entrar';
  $('submitBtn').textContent = registrando ? 'Registrarme' : 'Entrar';
  $('toggle').textContent = registrando ? 'Ya tengo cuenta' : '¿No tenés cuenta? Registrate';
  $('feedback').classList.add('hidden');
};

$('form').onsubmit = async (e) => {
  e.preventDefault();
  const nick = $('nick').value.trim();
  const pass = $('pass').value;

  // Llama a la función SQL que corresponda
  const fn = registrando ? 'registrar_jugador' : 'entrar_jugador';
  const { data, error } = await db.rpc(fn, { p_nick: nick, p_pass: pass });
  if (error) return show('error', error.message);

  // Guardamos el "pase" en el navegador para recordar quién sos
  localStorage.setItem('chuzapop_session', JSON.stringify(data));
  window.location.href = 'index.html';
};