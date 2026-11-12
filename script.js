// ===== CONEXIÓN A SUPABASE =====
const SUPABASE_URL = 'https://yvnwllznubeysbxkwndj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-sbcspzG9wUeGE7S_bklKA_hUapn-3Y';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== SESIÓN =====
let sessionToken = '';
try {
  sessionToken = JSON.parse(localStorage.getItem('chuzapop_session') || 'null')?.token || '';
} catch { sessionToken = ''; }
if (!sessionToken) window.location.href = 'login.html';

// ===== ESTADO =====
let balance = 0;
let nickname = '';
let userId = null;
let avatarUrl = '';
let transactions = [];
let registeredUsers = [];
let destinatarioSeleccionado = null;
let tieneMensajesNoLeidos = false;

let misAmigos = JSON.parse(localStorage.getItem('chuzapop_amigos') || '[]');
let misBloqueados = JSON.parse(localStorage.getItem('chuzapop_bloqueados') || '[]');
let historialMensajes = JSON.parse(localStorage.getItem('chuzapop_chats') || '{}'); 
let archivoAdjuntoTemp = null;

// ===== ATAJOS =====
const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('es-AR', { minimumFractionDigits: 2 });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeAvatar = (a) => (a && a.startsWith('data:image/')) ? a : 'moneda.png';

function logout() {
  localStorage.removeItem('chuzapop_session');
  window.location.href = 'login.html';
}

// ===== TIEMPO REAL =====
let escuchando = false;
function escucharAvisos(canal) {
  if (escuchando || !canal) return;
  escuchando = true;
  db.channel('player:' + canal)
    .on('broadcast', { event: 'recibido' }, () => { loadData(); })
    .on('broadcast', { event: 'nuevo_mensaje' }, (msg) => {
      tieneMensajesNoLeidos = true;
      actualizarNotificacionMensajes();
    })
    .subscribe();
}

function actualizarNotificacionMensajes() {
  const dot = $('msgNotificationDot');
  if (dot) {
    if (tieneMensajesNoLeidos) dot.classList.remove('hidden');
    else dot.classList.add('hidden');
  }
}

// ===== LEER DATOS DE LA BASE =====
async function loadData() {
  const { data: perfil, error: e1 } = await db.rpc('mi_perfil', { p_token: sessionToken });
  if (e1 || !perfil) {
    console.error('Error al leer el perfil:', e1);
    if (e1 && e1.message.includes('Sesión')) logout();
    return;
  }
  balance = Number(perfil.coins || 0);
  nickname = perfil.nickname;
  userId = perfil.id;
  avatarUrl = perfil.avatar_url;
  escucharAvisos(perfil.channel);

  const { data: movs } = await db.rpc('mis_movimientos', { p_token: sessionToken });
  transactions = movs || [];

  const { data: users } = await db.rpc('listar_jugadores', { p_token: sessionToken });
  registeredUsers = users || [];

  render();
}

// ===== DIBUJAR EN PANTALLA =====
function render() {
  $('who').textContent = '@' + nickname;
  $('userId').textContent = 'ID: ' + userId;
  $('balance').textContent = fmt(balance);
  $('myAvatar').src = safeAvatar(avatarUrl);
  actualizarNotificacionMensajes();
  renderizarAmigosYBloqueados();

  const ultimos20 = transactions.slice(0, 20);
  if (ultimos20.length === 0) {
    $('txList').innerHTML = '<p style="opacity:.6">Todavía no hay movimientos.</p>';
  } else {
    $('txList').innerHTML = ultimos20.map((tx, index) => `
      <div class="tx">
        <div>
          <strong>${tx.kind === 'enviado' ? 'Enviado a' : 'Recibido de'} @${esc(tx.other)}</strong><br>
          <small>${new Date(tx.created_at).toLocaleString('es-AR')}</small>
        </div>
        <div class="tx-actions">
          <span class="${tx.kind === 'recibido' ? 'plus' : ''}">
            ${tx.kind === 'recibido' ? '+' : '-'}${fmt(Number(tx.amount))}
          </span>
          <button class="ticket-btn" type="button" title="Generar Comprobante" onclick="generarYEnviarComprobantedeTx(${index})">
            🧾 <span>Ticket</span>
          </button>
        </div>
      </div>`).join('');
  }
}

// ===== GESTIÓN DE AMIGOS Y BLOQUEADOS =====
function renderizarAmigosYBloqueados() {
  $('friendsCount').textContent = misAmigos.length;
  $('blockedCount').textContent = misBloqueados.length;

  const friendsContainer = $('friendsListContainer');
  if (misAmigos.length === 0) {
    friendsContainer.innerHTML = '<p style="opacity:.6; font-size: 0.85rem;">No tienes amigos agregados aún.</p>';
  } else {
    friendsContainer.innerHTML = misAmigos.map(nick => {
      const uData = registeredUsers.find(u => u.nickname === nick) || { avatar_url: '', id: '...', nickname: nick };
      return `
        <div class="social-user-row" style="cursor: pointer;" onclick='abrirChatDesdeAmigo(${JSON.stringify(uData)})'>
          <div class="social-user-info">
            <img src="${safeAvatar(uData.avatar_url)}" alt="">
            <strong>@${esc(nick)}</strong>
          </div>
          <div class="social-actions-row" onclick="event.stopPropagation()">
            <button class="btn-small-action" title="Chatear" onclick='abrirChatDesdeAmigo(${JSON.stringify(uData)})'>💬</button>
            <button class="btn-small-action danger" title="Eliminar amigo" onclick="quitarAmigo('${esc(nick)}')">✕</button>
          </div>
        </div>`;
    }).join('');
  }

  const blockedContainer = $('blockedListContainer');
  if (misBloqueados.length === 0) {
    blockedContainer.innerHTML = '<p style="opacity:.6; font-size: 0.85rem;">No tienes usuarios bloqueados.</p>';
  } else {
    blockedContainer.innerHTML = misBloqueados.map(nick => {
      const uData = registeredUsers.find(u => u.nickname === nick) || { avatar_url: '' };
      return `
        <div class="social-user-row">
          <div class="social-user-info">
            <img src="${safeAvatar(uData.avatar_url)}" alt="">
            <span style="text-decoration: line-through; opacity: 0.7;">@${esc(nick)}</span>
          </div>
          <div class="social-actions-row">
            <button class="btn-small-action" onclick="desbloquearUsuario('${esc(nick)}')">Desbloquear</button>
          </div>
        </div>`;
    }).join('');
  }
}

document.querySelectorAll('.social-tab-btn').forEach(btn => {
  btn.onclick = (e) => {
    document.querySelectorAll('.social-tab-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    const tab = e.target.getAttribute('data-tab');
    if (tab === 'friends') {
      $('friendsListContainer').classList.remove('hidden');
      $('blockedListContainer').classList.add('hidden');
    } else {
      $('friendsListContainer').classList.add('hidden');
      $('blockedListContainer').classList.remove('hidden');
    }
  };
});

window.quitarAmigo = function(nick) {
  misAmigos = misAmigos.filter(n => n !== nick);
  localStorage.setItem('chuzapop_amigos', JSON.stringify(misAmigos));
  renderizarAmigosYBloqueados();
};

window.desbloquearUsuario = function(nick) {
  misBloqueados = misBloqueados.filter(n => n !== nick);
  localStorage.setItem('chuzapop_bloqueados', JSON.stringify(misBloqueados));
  renderizarAmigosYBloqueados();
};

window.abrirChatDesdeAmigo = function(uData) {
  if (!uData || !uData.nickname) return;
  abrirModalMensajesConUsuario(uData);
  $('messageModal').classList.remove('hidden');
};

// ===== FOTO DE PERFIL =====
function comprimirImagen(file, lado = 128) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = lado;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';          
      ctx.fillRect(0, 0, lado, lado);
      ctx.drawImage(img, sx, sy, min, min, 0, 0, lado, lado);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => reject(new Error('No se pudo leer la imagen'));
    img.src = url;
  });
}

$('editAvatarBtn').onclick = () => $('avatarInput').click();
$('avatarInput').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';                    
  if (!file) return;
  try {
    const dataUrl = await comprimirImagen(file);
    const { error } = await db.rpc('cambiar_avatar', { p_token: sessionToken, p_avatar: dataUrl });
    if (error) return alert('No se pudo guardar la foto: ' + error.message);
    await loadData();
  } catch (err) { alert(err.message); }
};

// ===== EDITAR NOMBRE Y LÍMITE DE 10 CARACTERES =====
function editNameMsg(text) {
  const fb = $('editNameFeedback');
  fb.textContent = text;
  fb.className = 'feedback error';
  fb.classList.remove('hidden');
}

$('editNameBtn').onclick = () => {
  const currentNick = nickname.slice(0, 10);
  $('newNameInput').value = currentNick;
  if ($('charCount')) $('charCount').textContent = `${currentNick.length}/10`;
  $('editNameFeedback').classList.add('hidden');
  $('editNameModal').classList.remove('hidden');
};

$('cancelEditNameBtn').onclick = () => $('editNameModal').classList.add('hidden');

const newNameInput = $('newNameInput');
if (newNameInput) {
  newNameInput.addEventListener('input', () => {
    if (newNameInput.value.length > 10) newNameInput.value = newNameInput.value.slice(0, 10);
    if ($('charCount')) $('charCount').textContent = `${newNameInput.value.length}/10`;
  });
}

$('saveNameBtn').onclick = async () => {
  const nuevo = newNameInput.value.trim().replace(/^@/, '');
  if (!nuevo) return editNameMsg('El nombre no puede estar vacío.');
  if (nuevo.length > 10) return editNameMsg('El nombre no puede superar los 10 caracteres.');

  const { error } = await db.rpc('cambiar_apodo', { p_token: sessionToken, p_nick: nuevo });
  if (error) return editNameMsg(error.message);

  $('editNameModal').classList.add('hidden');
  await loadData();
};

// ===== ACORDEÓN DE MOVIMIENTOS =====
const toggleTxBtn = $('toggleTxBtn');
const txCard = document.querySelector('.tx-card');
if (toggleTxBtn && txCard) {
  toggleTxBtn.onclick = () => {
    txCard.classList.toggle('open');
    const isOpen = txCard.classList.contains('open');
    toggleTxBtn.setAttribute('aria-expanded', isOpen);
  };
}

// ===== MODO CLARO / OSCURO Y SALIR =====
$('themeBtn').onclick = () => {
  const dark = document.body.classList.toggle('dark');
  document.body.classList.toggle('light', !dark);
  $('themeBtn').textContent = dark ? '☀️' : '🌙';
};
$('logoutBtn').onclick = logout;

// ===== ENVIAR MONEDAS =====
function showFeedback(type, text) {
  const f = $('feedback');
  f.className = `feedback ${type}`;
  f.textContent = text;
  f.classList.remove('hidden');
}
document.querySelector('[data-action="enviar"]').onclick = () => {
  $('form').reset();
  $('feedback').classList.add('hidden');
  $('modal').classList.remove('hidden');
};
$('cancelBtn').onclick = () => $('modal').classList.add('hidden');

$('form').onsubmit = async (e) => {
  e.preventDefault();
  const amount = parseFloat($('amount').value);
  const dest = $('destination').value.trim().replace(/^@/, '');

  if (isNaN(amount) || amount <= 0) return showFeedback('error', 'Ingresá un monto válido.');
  if (amount > balance) return showFeedback('error', 'No tenés tantas monedas.');
  if (!dest) return showFeedback('error', 'Escribí el apodo del jugador.');

  const { error } = await db.rpc('enviar_monedas', { p_token: sessionToken, p_to: dest, p_amount: amount });
  if (error) return showFeedback('error', error.message);

  await loadData();
  showFeedback('success', '¡Monedas enviadas!');
  setTimeout(() => $('modal').classList.add('hidden'), 1200);
};

// ===== SISTEMA DE CHAT, HISTORIAL Y ARCHIVOS =====
const openMessageModalBtn = $('openMessageModalBtn');
const messageModal = $('messageModal');
const cancelMessageBtn = $('cancelMessageBtn');
const messageSearchUser = $('messageSearchUser');
const messageUsersDropdown = $('messageUsersDropdown');
const searchSection = $('searchSection');
const chatHistorySection = $('chatHistorySection');
const chatHistoryList = $('chatHistoryList');
const activeChatSection = $('activeChatSection');
const selectedDestAvatar = $('selectedDestAvatar');
const selectedDestName = $('selectedDestName');
const clearSelectedDest = $('clearSelectedDest');
const sendMessageBtn = $('sendMessageBtn');
const toggleFriendBtn = $('toggleFriendBtn');
const toggleBlockBtn = $('toggleBlockBtn');
const toggleChatHistoryBtn = $('toggleChatHistoryBtn');
const chatBubblesContainer = $('chatBubblesContainer');
const chatFileInput = $('chatFileInput');
const attachFileBtn = $('attachFileBtn');
const attachedFilePreview = $('attachedFilePreview');
const attachedFileName = $('attachedFileName');
const removeAttachedFile = $('removeAttachedFile');

if (openMessageModalBtn) {
  openMessageModalBtn.onclick = () => {
    tieneMensajesNoLeidos = false;
    actualizarNotificacionMensajes();
    abrirVistaBuscador();
    messageModal.classList.remove('hidden');
  };
}

if (cancelMessageBtn) {
  cancelMessageBtn.onclick = () => messageModal.classList.add('hidden');
}

function abrirVistaBuscador() {
  destinatarioSeleccionado = null;
  messageSearchUser.value = '';
  $('messageText').value = '';
  limpiarArchivoAdjunto();
  
  searchSection.classList.remove('hidden');
  chatHistorySection.classList.add('hidden');
  activeChatSection.classList.add('hidden');
  $('messageFeedback').classList.add('hidden');
  renderizarOpcionesBusqueda('');
}

function abrirModalMensajesConUsuario(uData) {
  destinatarioSeleccionado = uData;
  selectedDestAvatar.src = safeAvatar(uData.avatar_url);
  selectedDestName.textContent = '@' + uData.nickname;
  actualizarBotonesAccionSocial(uData.nickname);

  searchSection.classList.add('hidden');
  chatHistorySection.classList.add('hidden');
  activeChatSection.classList.remove('hidden');
  $('messageFeedback').classList.add('hidden');
  
  renderizarBurbujasChat(uData.nickname);
}

if (toggleChatHistoryBtn) {
  toggleChatHistoryBtn.onclick = () => {
    if (!chatHistorySection.classList.contains('hidden')) {
      abrirVistaBuscador();
    } else {
      searchSection.classList.add('hidden');
      activeChatSection.classList.add('hidden');
      chatHistorySection.classList.remove('hidden');
      renderizarHistorialChats();
    }
  };
}

function renderizarOpcionesBusqueda(filtro = '') {
  const filtrados = registeredUsers.filter(u => 
    u.nickname !== nickname && 
    !misBloqueados.includes(u.nickname) &&
    u.nickname.toLowerCase().includes(filtro.toLowerCase())
  );

  if (filtrados.length === 0) {
    messageUsersDropdown.innerHTML = '<div class="message-user-option" style="opacity:.6; cursor:default;">No se encontraron usuarios</div>';
    return;
  }

  messageUsersDropdown.innerHTML = filtrados.map(u => `
    <div class="message-user-option" onclick='abrirModalMensajesConUsuario(${JSON.stringify(u)})'>
      <img src="${safeAvatar(u.avatar_url)}" alt="">
      <div>
        <strong>@${esc(u.nickname)}</strong>
        <small style="display:block; opacity:0.6;">ID: ${esc(u.id)}</small>
      </div>
    </div>
  `).join('');
}

function renderizarHistorialChats() {
  const nicksChats = Object.keys(historialMensajes);
  if (nicksChats.length === 0) {
    chatHistoryList.innerHTML = '<p style="opacity:.6; font-size: 0.85rem; padding:10px;">No hay historial de chats recientes.</p>';
    return;
  }

  chatHistoryList.innerHTML = nicksChats.map(nick => {
    const uData = registeredUsers.find(u => u.nickname === nick) || { avatar_url: '', nickname: nick };
    const msgs = historialMensajes[nick] || [];
    const ultimoMsg = msgs[msgs.length - 1] || { text: 'Archivo adjunto', time: '' };
    return `
      <div class="chat-history-item" onclick='abrirModalMensajesConUsuario(${JSON.stringify(uData)})'>
        <img src="${safeAvatar(uData.avatar_url)}" alt="">
        <div style="flex:1; min-width:0;">
          <strong>@${esc(nick)}</strong>
          <small style="display:block; opacity:0.6; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(ultimoMsg.text || 'Imagen adjunta')}</small>
        </div>
      </div>`;
  }).join('');
}

function actualizarBotonesAccionSocial(nick) {
  const esAmigo = misAmigos.includes(nick);
  toggleFriendBtn.textContent = esAmigo ? '⭐' : '☆';
  toggleFriendBtn.title = esAmigo ? 'Quitar de amigos' : 'Agregar a amigos';
}

if (clearSelectedDest) {
  clearSelectedDest.onclick = () => abrirVistaBuscador();
}

if (messageSearchUser) {
  messageSearchUser.oninput = (e) => {
    renderizarOpcionesBusqueda(e.target.value.trim().replace(/^@/, ''));
  };
}

if (toggleFriendBtn) {
  toggleFriendBtn.onclick = () => {
    if (!destinatarioSeleccionado) return;
    const nick = destinatarioSeleccionado.nickname;
    if (misAmigos.includes(nick)) misAmigos = misAmigos.filter(n => n !== nick);
    else misAmigos.push(nick);
    localStorage.setItem('chuzapop_amigos', JSON.stringify(misAmigos));
    actualizarBotonesAccionSocial(nick);
    renderizarAmigosYBloqueados();
  };
}

if (toggleBlockBtn) {
  toggleBlockBtn.onclick = () => {
    if (!destinatarioSeleccionado) return;
    const nick = destinatarioSeleccionado.nickname;
    if (!misBloqueados.includes(nick)) {
      misBloqueados.push(nick);
      localStorage.setItem('chuzapop_bloqueados', JSON.stringify(misBloqueados));
      misAmigos = misAmigos.filter(n => n !== nick);
      localStorage.setItem('chuzapop_amigos', JSON.stringify(misAmigos));
      renderizarAmigosYBloqueados();
      abrirVistaBuscador();
      alert(`Has bloqueado a @${nick}`);
    }
  };
}

if (attachFileBtn) attachFileBtn.onclick = () => chatFileInput.click();

if (chatFileInput) {
  chatFileInput.onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      archivoAdjuntoTemp = await comprimirImagen(file, 400);
      attachedFileName.textContent = file.name || 'Imagen adjunta';
      attachedFilePreview.classList.remove('hidden');
    } catch (err) { alert('No se pudo cargar la imagen'); }
  };
}

if (removeAttachedFile) {
  removeAttachedFile.onclick = () => limpiarArchivoAdjunto();
}

function limpiarArchivoAdjunto() {
  archivoAdjuntoTemp = null;
  attachedFilePreview.classList.add('hidden');
  attachedFileName.textContent = '';
}

function renderizarBurbujasChat(nick) {
  const msgs = historialMensajes[nick] || [];
  if (msgs.length === 0) {
    chatBubblesContainer.innerHTML = '<p style="opacity:.5; text-align:center; font-size:0.85rem; margin:auto;">No hay mensajes aún. ¡Comienza la conversación!</p>';
    return;
  }
  chatBubblesContainer.innerHTML = msgs.map(m => `
    <div class="chat-bubble ${m.sender === nickname ? 'mine' : 'theirs'}">
      ${m.text ? `<p>${esc(m.text)}</p>` : ''}
      ${m.image ? `<img src="${m.image}" alt="Adjunto">` : ''}
      <small style="display:block; font-size:0.65rem; opacity:0.6; text-align:right; margin-top:2px;">${m.time || ''}</small>
    </div>
  `).join('');
  chatBubblesContainer.scrollTop = chatBubblesContainer.scrollHeight;
}

if (sendMessageBtn) {
  sendMessageBtn.onclick = async () => {
    if (!destinatarioSeleccionado) return;
    const texto = $('messageText').value.trim();
    if (!texto && !archivoAdjuntoTemp) return;

    const nickDest = destinatarioSeleccionado.nickname;
    if (!historialMensajes[nickDest]) historialMensajes[nickDest] = [];

    const nuevoMensaje = {
      sender: nickname,
      text: texto,
      image: archivoAdjuntoTemp,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    historialMensajes[nickDest].push(nuevoMensaje);
    localStorage.setItem('chuzapop_chats', JSON.stringify(historialMensajes));

    $('messageText').value = '';
    limpiarArchivoAdjunto();
    renderizarBurbujasChat(nickDest);
  };
}

// ===== GENERADOR DE COMPROBANTE (TICKET CON CANVAS Y LÍNEAS CURVAS) =====
window.generarYEnviarComprobantedeTx = async function(index) {
  const tx = transactions[index];
  if (!tx) return;

  const canvas = $('ticketCanvas');
  const ctx = canvas.getContext('2d');

  canvas.width = 600;
  canvas.height = 800;

  // 1. Fondo oscuro
  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. Líneas curvas decorativas (Azul cristal y Violeta)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(200, 150, 400, 50, 600, 200);
  ctx.lineTo(600, 0);
  ctx.closePath();
  ctx.fillStyle = 'rgba(168, 85, 247, 0.25)';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, 800);
  ctx.bezierCurveTo(250, 600, 400, 750, 600, 550);
  ctx.lineTo(600, 800);
  ctx.closePath();
  ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
  ctx.fill();
  ctx.restore();

  // 3. Tarjeta central
  ctx.fillStyle = 'rgba(30, 10, 60, 0.6)';
  ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(50, 80, 500, 640, 24);
  ctx.fill();
  ctx.stroke();

  // 4. Logo
  const imgLogo = new Image();
  imgLogo.src = 'moneda.png';
  
  imgLogo.onload = () => {
    ctx.drawImage(imgLogo, 260, 120, 80, 80);
    dibujarTextoTicket(canvas, ctx, tx);
  };

  imgLogo.onerror = () => {
    dibujarTextoTicket(canvas, ctx, tx);
  };
};

function dibujarTextoTicket(canvas, ctx, tx) {
  ctx.fillStyle = '#faf5ff';
  ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CHUZAPOP', canvas.width / 2, 235);

  ctx.fillStyle = '#c084fc';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText('COMPROBANTE DE TRANSACCIÓN', canvas.width / 2, 260);

  ctx.strokeStyle = 'rgba(168, 85, 247, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(100, 290);
  ctx.lineTo(500, 290);
  ctx.stroke();

  ctx.textAlign = 'left';
  
  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('MONTO TRANSFERIDO', 100, 340);

  ctx.fillStyle = tx.kind === 'recibido' ? '#34d399' : '#f472b6';
  ctx.font = 'bold 36px system-ui, sans-serif';
  ctx.fillText(`${tx.kind === 'recibido' ? '+' : '-'}${fmt(Number(tx.amount))} CHZ`, 100, 385);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px system-ui, sans-serif';
  
  const esEnvio = tx.kind === 'enviado';
  ctx.fillText(esEnvio ? 'DESTINATARIO' : 'REMITENTE', 100, 445);
  ctx.fillStyle = '#faf5ff';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillText('@' + tx.other, 100, 470);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('FECHA Y HORA', 100, 530);
  ctx.fillStyle = '#faf5ff';
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText(new Date(tx.created_at).toLocaleString('es-AR'), 100, 555);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('ESTADO', 100, 615);
  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText('✔ EXITOSO', 100, 640);

  ctx.fillStyle = 'rgba(250, 245, 255, 0.5)';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Generado de forma segura en Chuzapop', canvas.width / 2, 680);

  const dataUrl = canvas.toDataURL('image/png');
  const usuarioDest = tx.other;
  const uData = registeredUsers.find(u => u.nickname === usuarioDest);

  if (uData) {
    if (confirm(`¿Deseas adjuntar y enviar este comprobante por chat a @${usuarioDest}?`)) {
      abrirModalMensajesConUsuario(uData);
      $('messageModal').classList.remove('hidden');
      
      archivoAdjuntoTemp = dataUrl;
      attachedFileName.textContent = `Comprobante_${tx.other}.png`;
      attachedFilePreview.classList.remove('hidden');
      $('messageText').value = `Hola! Te comparto el comprobante de la transferencia de ${fmt(Number(tx.amount))} CHZ.`;
    }
  } else {
    const link = document.createElement('a');
    link.download = `Comprobante_Chuzapop_${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  }
}

// ===== AL ABRIR LA PÁGINA =====
loadData();