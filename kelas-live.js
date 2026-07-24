/* ============================================================
   KELAS LIVE — logic
   Firestore: kelas_live { kelasId, kelasNama, tanggal:'YYYY-MM-DD',
                           jamMulai:'HH:MM', jamSelesai:'HH:MM', topik, link }
   ============================================================ */

const state = {
  kelasList: [],
  kelasPublik: null,
  editId: null
};

function escapeHtml(str){
  return String(str).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}
function bannerOk(el, msg){ el.innerHTML = `<div class="banner banner-ok">${msg}</div>`; }
function bannerErr(el, msg){ el.innerHTML = `<div class="banner banner-error">${msg}</div>`; }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function nowHM(){ const d = new Date(); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }

function showPublicView(id){
  document.querySelectorAll('#publicApp > div').forEach(el => el.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  window.scrollTo({top:0, behavior:'smooth'});
}

/* ---------------- STUDENT ---------------- */
async function loadKelasPublik(){
  const box = document.getElementById('kelasPublikList');
  box.innerHTML = '<div class="loading">Memuat daftar kelas…</div>';
  try{
    const snap = await db.collection('kelas_absensi').where('aktif','==',true).orderBy('jenjang').orderBy('urutan').get();
    state.kelasList = [];
    snap.forEach(doc => state.kelasList.push({id:doc.id, ...doc.data()}));
    if(!state.kelasList.length){ box.innerHTML = '<div class="empty">Belum ada kelas terdaftar.</div>'; return; }
    box.innerHTML = '<div class="grid-cards" id="gridKelasPublik"></div>';
    const grid = document.getElementById('gridKelasPublik');
    state.kelasList.forEach(d => {
      const c = document.createElement('div');
      c.className = 'card';
      c.innerHTML = `<p class="k">${escapeHtml(d.nama)}</p><p class="d">Kelas ${escapeHtml(d.jenjang)}</p>`;
      c.addEventListener('click', () => cekStatusKelas(d.id, d));
      grid.appendChild(c);
    });
  }catch(err){
    box.innerHTML = `<div class="empty">Gagal memuat. ${escapeHtml(err.message)}</div>`;
  }
}
document.getElementById('crumbKelas').addEventListener('click', () => { showPublicView('viewKelas'); loadKelasPublik(); });

async function cekStatusKelas(kelasId, d){
  state.kelasPublik = {id:kelasId, ...d};
  document.getElementById('statusEyebrow').textContent = 'Kelas ' + d.jenjang;
  document.getElementById('statusTitle').textContent = d.nama;
  showPublicView('viewStatus');
  const box = document.getElementById('statusBox');
  box.innerHTML = '<div class="loading">Mengecek jadwal…</div>';
  try{
    const snap = await db.collection('kelas_live')
      .where('kelasId','==',kelasId).where('tanggal','==',todayStr()).get();
    const rows = [];
    snap.forEach(doc => rows.push({id:doc.id, ...doc.data()}));
    const jam = nowHM();
    const aktif = rows.find(r => jam >= r.jamMulai && jam <= r.jamSelesai);
    const akanDatang = rows.filter(r => jam < r.jamMulai).sort((a,b) => a.jamMulai < b.jamMulai ? -1 : 1);

    let html = '';
    if(aktif){
      html += `
        <div class="live-card">
          <span class="live-badge"><span class="live-dot"></span> Sedang Berlangsung</span>
          <h3>${escapeHtml(aktif.topik || 'Kelas Live')}</h3>
          <p>${escapeHtml(aktif.jamMulai)} &ndash; ${escapeHtml(aktif.jamSelesai)}</p>
          <a class="btn btn-gold" href="${aktif.link}" target="_blank" rel="noopener">Gabung Kelas Live &rarr;</a>
        </div>`;
    } else {
      html += '<div class="empty">Belum ada kelas live yang sedang berlangsung untuk kelas ini saat ini.</div>';
    }
    if(akanDatang.length){
      html += '<div style="margin-top:20px;"><p class="hint" style="margin-bottom:8px;">Jadwal kelas live lainnya hari ini:</p>';
      akanDatang.forEach(r => {
        html += `<div class="list-item"><b>${escapeHtml(r.jamMulai)} - ${escapeHtml(r.jamSelesai)}</b> &middot; ${escapeHtml(r.topik||'')} <span class="badge badge-upcoming">Akan Datang</span></div>`;
      });
      html += '</div>';
    }
    box.innerHTML = html;
  }catch(err){
    box.innerHTML = `<div class="empty">Gagal memuat. ${escapeHtml(err.message)}</div>`;
  }
}

/* ---------------- ADMIN ---------------- */
document.getElementById('btnShowAdmin').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('publicApp').classList.add('hidden');
  document.getElementById('adminApp').classList.remove('hidden');
});
function backToStudent(){
  document.getElementById('adminApp').classList.add('hidden');
  document.getElementById('publicApp').classList.remove('hidden');
  showPublicView('viewKelas');
  loadKelasPublik();
}
document.getElementById('crumbAdminBack').addEventListener('click', backToStudent);
document.getElementById('crumbAdminBack2').addEventListener('click', backToStudent);

auth.onAuthStateChanged(user => {
  if(user){
    document.getElementById('viewLogin').classList.add('hidden');
    document.getElementById('viewDashboard').classList.remove('hidden');
    document.getElementById('adminWhoami').textContent = user.email;
    loadKelasSelectAdmin();
    kosongkanForm();
    loadJadwalAdmin();
  } else {
    document.getElementById('viewLogin').classList.remove('hidden');
    document.getElementById('viewDashboard').classList.add('hidden');
  }
});

document.getElementById('btnLogin').addEventListener('click', async () => {
  const email = document.getElementById('adminEmail').value.trim();
  const pass = document.getElementById('adminPassword').value;
  const banner = document.getElementById('loginBanner');
  try{ await auth.signInWithEmailAndPassword(email, pass); }
  catch(err){ bannerErr(banner, 'Login gagal: ' + escapeHtml(err.message)); }
});
document.getElementById('btnLogout').addEventListener('click', () => auth.signOut());

async function loadKelasSelectAdmin(){
  try{
    const snap = await db.collection('kelas_absensi').orderBy('jenjang').orderBy('urutan').get();
    const sel = document.getElementById('fKelas');
    sel.innerHTML = '';
    snap.forEach(doc => {
      const d = doc.data();
      const opt = document.createElement('option');
      opt.value = doc.id;
      opt.dataset.nama = d.nama;
      opt.textContent = `${d.jenjang} · ${d.nama}`;
      sel.appendChild(opt);
    });
  }catch(err){ /* silent */ }
}

function kosongkanForm(){
  state.editId = null;
  document.getElementById('fTanggal').value = todayStr();
  document.getElementById('fJamMulai').value = '';
  document.getElementById('fJamSelesai').value = '';
  document.getElementById('fTopik').value = '';
  document.getElementById('fLink').value = '';
  document.getElementById('formTitle').textContent = 'Tambah Jadwal Baru';
  document.getElementById('btnSimpanJadwal').textContent = 'Simpan Jadwal';
  document.getElementById('btnBatalEdit').style.display = 'none';
  document.getElementById('btnHapusJadwal').style.display = 'none';
  document.getElementById('formBanner').innerHTML = '';
}
document.getElementById('btnBatalEdit').addEventListener('click', kosongkanForm);

function muatKeForm(id, d){
  state.editId = id;
  document.getElementById('fKelas').value = d.kelasId;
  document.getElementById('fTanggal').value = d.tanggal;
  document.getElementById('fJamMulai').value = d.jamMulai;
  document.getElementById('fJamSelesai').value = d.jamSelesai;
  document.getElementById('fTopik').value = d.topik || '';
  document.getElementById('fLink').value = d.link || '';
  document.getElementById('formTitle').textContent = 'Edit Jadwal (' + d.tanggal + ')';
  document.getElementById('btnSimpanJadwal').textContent = 'Update Jadwal';
  document.getElementById('btnBatalEdit').style.display = 'inline-block';
  document.getElementById('btnHapusJadwal').style.display = 'inline-block';
  document.getElementById('formBanner').innerHTML = '';
  window.scrollTo({top:0, behavior:'smooth'});
}

document.getElementById('btnSimpanJadwal').addEventListener('click', async () => {
  const banner = document.getElementById('formBanner');
  const kelasSel = document.getElementById('fKelas');
  const kelasId = kelasSel.value;
  const kelasNama = kelasSel.selectedOptions[0] ? kelasSel.selectedOptions[0].dataset.nama : '';
  const tanggal = document.getElementById('fTanggal').value;
  const jamMulai = document.getElementById('fJamMulai').value;
  const jamSelesai = document.getElementById('fJamSelesai').value;
  const topik = document.getElementById('fTopik').value.trim();
  const link = document.getElementById('fLink').value.trim();

  if(!kelasId){ bannerErr(banner, 'Pilih kelas dahulu.'); return; }
  if(!tanggal || !jamMulai || !jamSelesai){ bannerErr(banner, 'Tanggal, jam mulai, dan jam selesai wajib diisi.'); return; }
  if(jamSelesai <= jamMulai){ bannerErr(banner, 'Jam selesai harus setelah jam mulai.'); return; }
  if(!link){ bannerErr(banner, 'Link Google Meet wajib diisi.'); return; }

  const payload = { kelasId, kelasNama, tanggal, jamMulai, jamSelesai, topik, link };
  try{
    if(state.editId){
      await db.collection('kelas_live').doc(state.editId).update(payload);
      bannerOk(banner, 'Jadwal berhasil diperbarui.');
    } else {
      await db.collection('kelas_live').add(payload);
      bannerOk(banner, 'Jadwal baru tersimpan.');
    }
    kosongkanForm();
    loadJadwalAdmin();
  }catch(err){
    bannerErr(banner, 'Gagal menyimpan: ' + escapeHtml(err.message));
  }
});

document.getElementById('btnHapusJadwal').addEventListener('click', async () => {
  if(!state.editId) return;
  if(!confirm('Hapus jadwal ini?')) return;
  try{
    await db.collection('kelas_live').doc(state.editId).delete();
    kosongkanForm();
    loadJadwalAdmin();
  }catch(err){
    alert('Gagal menghapus: ' + err.message);
  }
});

async function loadJadwalAdmin(){
  const box = document.getElementById('adminJadwalList');
  box.innerHTML = '<div class="loading">Memuat…</div>';
  try{
    const snap = await db.collection('kelas_live')
      .where('tanggal','>=', todayStr())
      .orderBy('tanggal','asc').get();
    const rows = [];
    snap.forEach(doc => rows.push({id:doc.id, ...doc.data()}));
    rows.sort((a,b) => (a.tanggal+a.jamMulai) < (b.tanggal+b.jamMulai) ? -1 : 1);
    if(!rows.length){ box.innerHTML = '<div class="empty">Belum ada jadwal kelas live mendatang.</div>'; return; }
    box.innerHTML = '';
    rows.forEach(r => {
      const isToday = r.tanggal === todayStr();
      const isActiveNow = isToday && nowHM() >= r.jamMulai && nowHM() <= r.jamSelesai;
      const item = document.createElement('div');
      item.className = 'list-item';
      item.style.cursor = 'pointer';
      item.innerHTML = `
        <div class="list-item-head">
          <div>
            <h4 style="margin:0 0 4px;font-size:14px;font-family:'Poppins',sans-serif;color:var(--green-deep);">
              ${escapeHtml(r.kelasNama)} ${isActiveNow ? '<span class="badge badge-live">Live Sekarang</span>' : ''}
            </h4>
            <div class="hint">${escapeHtml(r.tanggal)} &middot; ${escapeHtml(r.jamMulai)}-${escapeHtml(r.jamSelesai)} &middot; ${escapeHtml(r.topik||'(tanpa topik)')}</div>
          </div>
        </div>`;
      item.addEventListener('click', () => muatKeForm(r.id, r));
      box.appendChild(item);
    });
  }catch(err){
    box.innerHTML = `<div class="empty">Gagal memuat. ${escapeHtml(err.message)}</div>`;
  }
}

loadKelasPublik();
