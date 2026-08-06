/* ============================================================
   RUANG CHAT KELAS — logic
   Firestore:
   - chat_pesan { kelasId, kelasNama, pengirimNama, pengirimTipe:'siswa'|'guru',
                  siswaId (khusus siswa), teks, waktu (serverTimestamp) }
   Aturan Firestore yang dibutuhkan:
     match /chat_pesan/{id} {
       allow read: if true;
       allow create: if true;
       allow delete: if request.auth != null;
       allow update: if false;
     }
   ============================================================ */

const MAKS_PANJANG_PESAN = 300;
const state = {
  kelas: null,
  kelasAbsensiId: null,
  kelasAbsensiNama: null,
  siswaTerpilihId: null,
  namaSaya: '',
  tipeSaya: 'siswa', // 'siswa' | 'guru'
  isAdmin: false,
  daftarSiswa: [],
  unsubChat: null
};

function escapeHtml(str){
  return String(str).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}
function bannerErr(el, msg){ el.innerHTML = `<div class="banner banner-error">${msg}</div>`; }

function showView(id){
  document.querySelectorAll('main > div').forEach(el => el.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  window.scrollTo({top:0, behavior:'smooth'});
}

/* ---------------- STUDENT: pilih jenjang kelas ---------------- */
document.querySelectorAll('#viewKelas .card').forEach(card => {
  card.setAttribute('role','button'); card.setAttribute('tabindex','0');
  const aktifkan = () => {
    state.kelas = card.dataset.kelas;
    document.getElementById('namaEyebrow').textContent = 'Kelas ' + state.kelas;
    resetLangkahNama();
    showView('viewNama');
    muatKelasAbsensiUntukChat(state.kelas);
  };
  card.addEventListener('click', aktifkan);
  card.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){ e.preventDefault(); aktifkan(); } });
});
document.getElementById('crumbKelas').addEventListener('click', () => showView('viewKelas'));

function resetLangkahNama(){
  state.namaSaya = '';
  state.siswaTerpilihId = null;
  state.kelasAbsensiId = null;
  state.kelasAbsensiNama = null;
  state.daftarSiswa = [];
  document.getElementById('inputNamaSiswa').value = '';
  document.getElementById('inputNamaSiswa').disabled = true;
  document.getElementById('hasilCariNama').innerHTML = '';
  document.getElementById('namaTerpilihInfo').textContent = '';
  document.getElementById('btnMasukChat').disabled = true;
}

async function muatKelasAbsensiUntukChat(jenjang){
  const sel = document.getElementById('selectKelasChat');
  sel.innerHTML = '<option value="">Memuat kelas…</option>';
  try{
    const snap = await db.collection('kelas_absensi')
      .where('jenjang','==',jenjang).where('aktif','==',true)
      .orderBy('urutan','asc').get();
    if(snap.empty){ sel.innerHTML = '<option value="">Belum ada data kelas terdaftar</option>'; return; }
    let opts = '<option value="">— pilih kelas —</option>';
    snap.forEach(doc => { opts += `<option value="${doc.id}">${escapeHtml(doc.data().nama)}</option>`; });
    sel.innerHTML = opts;
  }catch(err){
    sel.innerHTML = '<option value="">Gagal memuat kelas</option>';
  }
}

document.getElementById('selectKelasChat').addEventListener('change', async (e) => {
  const kelasAbsensiId = e.target.value;
  const inputNama = document.getElementById('inputNamaSiswa');
  const hasilCari = document.getElementById('hasilCariNama');
  document.getElementById('namaTerpilihInfo').textContent = '';
  document.getElementById('btnMasukChat').disabled = true;
  state.siswaTerpilihId = null;
  inputNama.value = '';
  hasilCari.innerHTML = '';

  if(!kelasAbsensiId){ inputNama.disabled = true; return; }
  state.kelasAbsensiId = kelasAbsensiId;
  state.kelasAbsensiNama = e.target.selectedOptions[0].textContent;
  inputNama.disabled = false;
  inputNama.placeholder = 'Ketik minimal 2 huruf…';

  try{
    const snap = await db.collection('siswa').where('kelasId','==',kelasAbsensiId).orderBy('urutan').get();
    state.daftarSiswa = [];
    snap.forEach(doc => state.daftarSiswa.push({id:doc.id, nama:doc.data().nama}));
  }catch(err){
    state.daftarSiswa = [];
  }
});

document.getElementById('inputNamaSiswa').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  const hasilCari = document.getElementById('hasilCariNama');
  document.getElementById('namaTerpilihInfo').textContent = '';
  document.getElementById('btnMasukChat').disabled = true;
  state.siswaTerpilihId = null;
  if(q.length < 2){ hasilCari.innerHTML = ''; return; }
  const cocok = state.daftarSiswa.filter(s => s.nama.toLowerCase().includes(q)).slice(0,6);
  if(!cocok.length){ hasilCari.innerHTML = '<div class="empty">Nama tidak ditemukan di kelas ini.</div>'; return; }
  hasilCari.innerHTML = cocok.map(s => `<div class="list-item" data-id="${s.id}" data-nama="${escapeHtml(s.nama)}">${escapeHtml(s.nama)}</div>`).join('');
  hasilCari.querySelectorAll('[data-id]').forEach(el => {
    el.addEventListener('click', () => {
      state.siswaTerpilihId = el.dataset.id;
      state.namaSaya = el.dataset.nama;
      document.getElementById('inputNamaSiswa').value = el.dataset.nama;
      hasilCari.innerHTML = '';
      document.getElementById('namaTerpilihInfo').innerHTML = `<span style="color:var(--green-deep);">✓ Terpilih: ${escapeHtml(state.namaSaya)}</span>`;
      document.getElementById('btnMasukChat').disabled = false;
    });
  });
});

document.getElementById('btnMasukChat').addEventListener('click', () => {
  if(!state.siswaTerpilihId) return;
  state.tipeSaya = 'siswa';
  bukaRuangChat(state.kelasAbsensiId, state.kelasAbsensiNama);
});

/* ---------------- Ruang chat (dipakai siswa maupun guru) ---------------- */
document.getElementById('crumbChat').addEventListener('click', keluarRuangChat);

function keluarRuangChat(){
  if(state.unsubChat){ state.unsubChat(); state.unsubChat = null; }
  if(state.isAdmin) showView('viewAdminKelas');
  else showView('viewKelas');
}

function bukaRuangChat(kelasAbsensiId, kelasAbsensiNama){
  state.kelasAbsensiId = kelasAbsensiId;
  state.kelasAbsensiNama = kelasAbsensiNama;
  document.getElementById('chatEyebrow').textContent = kelasAbsensiNama;
  document.getElementById('chatNamaSaya').textContent = state.namaSaya + (state.tipeSaya === 'guru' ? ' (Guru)' : '');
  showView('viewChat');
  dengarkanChat(kelasAbsensiId);
}

function dengarkanChat(kelasAbsensiId){
  const box = document.getElementById('chatBox');
  box.innerHTML = '<div class="loading">Memuat percakapan…</div>';
  if(state.unsubChat) state.unsubChat();
  state.unsubChat = db.collection('chat_pesan')
    .where('kelasId','==',kelasAbsensiId)
    .orderBy('waktu','asc')
    .limitToLast(100)
    .onSnapshot(function(snap){
      if(snap.empty){
        box.innerHTML = '<div class="empty">Belum ada pesan. Mulai percakapan pertama di kelas ini.</div>';
        return;
      }
      let html = '';
      snap.forEach(function(doc){
        const d = doc.data();
        const dariGuru = d.pengirimTipe === 'guru';
        const milikSendiri = (state.tipeSaya === 'siswa' && d.siswaId === state.siswaTerpilihId) ||
                              (state.tipeSaya === 'guru' && dariGuru && d.pengirimNama === state.namaSaya);
        const waktuStr = d.waktu && d.waktu.toDate ? d.waktu.toDate().toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) : '';
        html += `<div class="chat-msg${dariGuru ? ' dari-guru' : ''}${milikSendiri ? ' milik-sendiri' : ''}">`;
        if(state.isAdmin){
          html += `<button class="del-btn" data-id="${doc.id}" title="Hapus pesan">&times;</button>`;
        }
        html += `<span class="nm">${escapeHtml(d.pengirimNama)}${dariGuru ? ' · Guru' : ''}</span>`;
        html += `<span class="tx">${escapeHtml(d.teks)}</span>`;
        html += `<span class="wk">${waktuStr}</span>`;
        html += `</div>`;
      });
      box.innerHTML = html;
      box.scrollTop = box.scrollHeight;

      if(state.isAdmin){
        box.querySelectorAll('.del-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            if(!confirm('Hapus pesan ini?')) return;
            try{ await db.collection('chat_pesan').doc(btn.dataset.id).delete(); }
            catch(err){ alert('Gagal menghapus: ' + err.message); }
          });
        });
      }
    }, function(err){
      box.innerHTML = `<div class="empty">Gagal memuat percakapan. ${escapeHtml(err.message)}</div>`;
    });
}

const chatInput = document.getElementById('chatInput');
const chatCounter = document.getElementById('chatCounter');
chatInput.addEventListener('input', () => {
  chatCounter.textContent = chatInput.value.length;
});
chatInput.addEventListener('keydown', (e) => {
  if(e.key === 'Enter' && !e.shiftKey){
    e.preventDefault();
    kirimPesanChat();
  }
});
document.getElementById('btnKirimChat').addEventListener('click', kirimPesanChat);

async function kirimPesanChat(){
  const teks = chatInput.value.trim();
  if(!teks) return;
  if(teks.length > MAKS_PANJANG_PESAN) return;
  const payload = {
    kelasId: state.kelasAbsensiId,
    kelasNama: state.kelasAbsensiNama,
    pengirimNama: state.namaSaya,
    pengirimTipe: state.tipeSaya,
    siswaId: state.tipeSaya === 'siswa' ? state.siswaTerpilihId : null,
    teks,
    waktu: firebase.firestore.FieldValue.serverTimestamp()
  };
  const btn = document.getElementById('btnKirimChat');
  btn.disabled = true;
  try{
    await db.collection('chat_pesan').add(payload);
    chatInput.value = '';
    chatCounter.textContent = '0';
    chatInput.focus();
  }catch(err){
    alert('Gagal mengirim pesan: ' + err.message);
  }finally{
    btn.disabled = false;
  }
}

/* ---------------- GURU / ADMIN ---------------- */
document.getElementById('btnShowAdmin').addEventListener('click', (e) => {
  e.preventDefault();
  if(auth.currentUser){
    if(state.unsubChat){ state.unsubChat(); state.unsubChat = null; }
    showView('viewAdminKelas');
    loadAdminKelasList();
  } else {
    showView('viewGuruLogin');
  }
});
document.getElementById('crumbGuruBack').addEventListener('click', () => showView('viewKelas'));

document.getElementById('btnKeluarModeGuru').addEventListener('click', async () => {
  if(!confirm('Keluar dari Mode Guru? Kamu akan kembali ke tampilan siswa biasa.')) return;
  try{ await auth.signOut(); }catch(err){}
  showView('viewKelas');
});

document.getElementById('btnLogin').addEventListener('click', async () => {
  const email = document.getElementById('adminEmail').value.trim();
  const pass = document.getElementById('adminPassword').value;
  const banner = document.getElementById('loginBanner');
  try{
    await auth.signInWithEmailAndPassword(email, pass);
  }catch(err){
    bannerErr(banner, 'Login gagal: ' + escapeHtml(err.message));
  }
});

auth.onAuthStateChanged(user => {
  if(user){
    state.isAdmin = true;
    state.tipeSaya = 'guru';
    state.namaSaya = user.email.split('@')[0];
    document.getElementById('btnShowAdmin').textContent = 'Mode Guru Aktif';
    document.getElementById('btnShowAdmin').classList.add('tampak');
    if(state.unsubChat){ state.unsubChat(); state.unsubChat = null; }
    showView('viewAdminKelas');
    loadAdminKelasList();
  } else {
    state.isAdmin = false;
    if(state.tipeSaya === 'guru') state.tipeSaya = 'siswa';
    document.getElementById('btnShowAdmin').textContent = 'Guru';
    document.getElementById('btnShowAdmin').classList.remove('tampak');
  }
});

async function loadAdminKelasList(){
  const box = document.getElementById('adminKelasList');
  box.innerHTML = '<div class="loading">Memuat daftar kelas…</div>';
  try{
    const snap = await db.collection('kelas_absensi').orderBy('jenjang').orderBy('urutan').get();
    if(snap.empty){ box.innerHTML = '<div class="empty">Belum ada kelas terdaftar.</div>'; return; }
    let html = '';
    snap.forEach(doc => {
      const d = doc.data();
      html += `<div class="list-item" data-id="${doc.id}" data-nama="${escapeHtml(d.nama)}" style="padding:14px 16px;"><b>${escapeHtml(d.nama)}</b> <span class="hint" style="margin:0;">— Jenjang ${escapeHtml(d.jenjang)}</span></div>`;
    });
    box.innerHTML = html;
    box.querySelectorAll('[data-id]').forEach(el => {
      el.addEventListener('click', () => {
        bukaRuangChat(el.dataset.id, el.dataset.nama);
      });
    });
  }catch(err){
    box.innerHTML = `<div class="empty">Gagal memuat. ${escapeHtml(err.message)}</div>`;
  }
}

/* ---------------- Akses Guru Tersembunyi (opsional: tap logo) ---------------- */
(function(){
  const logo = document.getElementById("brandLogoTap");
  if(!logo) return;
  logo.style.cursor = "default";
})();
