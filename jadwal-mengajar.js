/* ============================================================
   JADWAL MENGAJAR — logic
   Struktur Firestore:
   - jadwal_mengajar { hari, kelasId, kelasNama, jamMulai, jamSelesai, catatan }
     doc id = auto
   - kelas_absensi (dipakai ulang untuk daftar Kelas, sama seperti Absensi & Nilai)
   Halaman ini privat sepenuhnya: hanya guru yang login yang bisa lihat & ubah.
   ============================================================ */

const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const state = {
  kelasCache: [],
  jadwalCache: []
};

function bannerOk(el, msg){ el.innerHTML = `<div class="banner banner-ok">${msg}</div>`; }
function bannerErr(el, msg){ el.innerHTML = `<div class="banner banner-error">${msg}</div>`; }
function escapeHtml(str){
  return String(str).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}

/* ---------------- AUTH ---------------- */
auth.onAuthStateChanged(user => {
  if(user){
    document.getElementById('viewLogin').classList.add('hidden');
    document.getElementById('viewDashboard').classList.remove('hidden');
    document.getElementById('adminWhoami').textContent = user.email;
    loadKelas().then(loadJadwal);
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

/* ---------------- Kelas (dipakai ulang dari koleksi kelas_absensi) ---------------- */
async function loadKelas(){
  try{
    const snap = await db.collection('kelas_absensi').orderBy('jenjang').orderBy('urutan').get();
    state.kelasCache = [];
    snap.forEach(doc => state.kelasCache.push({ id: doc.id, ...doc.data() }));
  }catch(err){
    state.kelasCache = [];
  }
}

/* ---------------- Jadwal: load & render ---------------- */
async function loadJadwal(){
  const box = document.getElementById('jadwalList');
  box.innerHTML = '<div class="loading">Memuat jadwal…</div>';
  try{
    const snap = await db.collection('jadwal_mengajar').get();
    state.jadwalCache = [];
    snap.forEach(doc => state.jadwalCache.push({ id: doc.id, ...doc.data() }));
    renderJadwal();
  }catch(err){
    box.innerHTML = `<div class="empty">Gagal memuat. ${escapeHtml(err.message)}</div>`;
  }
}

function renderJadwal(){
  const box = document.getElementById('jadwalList');
  if(state.kelasCache.length === 0){
    box.innerHTML = '<div class="empty">Tambahkan kelas dulu di menu Absensi &amp; Nilai (tab Kelas &amp; Siswa), lalu kembali ke sini.</div>';
    return;
  }
  box.innerHTML = '';
  HARI.forEach(hari => {
    const items = state.jadwalCache
      .filter(j => j.hari === hari)
      .sort((a, b) => (a.jamMulai || '').localeCompare(b.jamMulai || ''));

    const block = document.createElement('div');
    block.className = 'day-block';
    block.innerHTML = `<h3>${hari}</h3>`;

    if(items.length === 0){
      block.innerHTML += '<p class="hint">Tidak ada jadwal.</p>';
    } else {
      items.forEach(j => {
        const row = document.createElement('div');
        row.className = 'list-item';
        row.innerHTML = `
          <div>
            <h4>${escapeHtml(j.kelasNama || '-')}</h4>
            <div class="meta">${escapeHtml(j.jamMulai || '-')}–${escapeHtml(j.jamSelesai || '-')}${j.catatan ? ' · ' + escapeHtml(j.catatan) : ''}</div>
          </div>
          <div>
            <button class="icon-btn" data-act="edit">Edit</button>
            <button class="icon-btn danger" data-act="hapus">Hapus</button>
          </div>`;
        row.querySelector('[data-act="edit"]').addEventListener('click', () => openJadwalModal(j));
        row.querySelector('[data-act="hapus"]').addEventListener('click', () => hapusJadwal(j.id));
        block.appendChild(row);
      });
    }
    box.appendChild(block);
  });
}

/* ---------------- Jadwal: tambah / edit ---------------- */
document.getElementById('btnTambahJadwal').addEventListener('click', () => {
  if(state.kelasCache.length === 0){
    bannerErr(document.getElementById('jadwalBanner'), 'Belum ada kelas. Tambahkan kelas dulu di menu Absensi &amp; Nilai.');
    return;
  }
  openJadwalModal(null);
});

function openJadwalModal(data){
  const isEdit = !!data;
  const d = data || { hari: HARI[0], kelasId: state.kelasCache[0]?.id, jamMulai: '07:00', jamSelesai: '08:30', catatan: '' };

  renderModal(`
    <h3>${isEdit ? 'Ubah Jadwal' : 'Tambah Jadwal'}</h3>
    <div class="field"><label>Hari</label>
      <select id="mHari">${HARI.map(h => `<option value="${h}" ${h===d.hari?'selected':''}>${h}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Kelas</label>
      <select id="mKelas">${state.kelasCache.map(k => `<option value="${k.id}" ${k.id===d.kelasId?'selected':''}>${escapeHtml(k.nama)}</option>`).join('')}</select>
    </div>
    <div class="row">
      <div class="field" style="flex:1;min-width:120px;"><label>Jam Mulai</label><input type="time" id="mMulai" value="${d.jamMulai || ''}"></div>
      <div class="field" style="flex:1;min-width:120px;"><label>Jam Selesai</label><input type="time" id="mSelesai" value="${d.jamSelesai || ''}"></div>
    </div>
    <div class="field"><label>Catatan <span class="hint">(opsional, mis. materi/ruang)</span></label>
      <input type="text" id="mCatatan" value="${escapeHtml(d.catatan || '')}" placeholder="Contoh: Qawaid, Ruang 12">
    </div>
    <div id="mBanner"></div>
    <button class="btn btn-solid" id="btnSimpanJadwal">Simpan</button>
    ${isEdit ? '<button class="btn btn-outline btn-sm" id="btnHapusJadwalModal" style="margin-left:8px;">Hapus</button>' : ''}
  `);

  document.getElementById('btnSimpanJadwal').addEventListener('click', () => simpanJadwal(isEdit ? d.id : null));
  if(isEdit){
    document.getElementById('btnHapusJadwalModal').addEventListener('click', () => { closeModal(); hapusJadwal(d.id); });
  }
}

async function simpanJadwal(id){
  const hari = document.getElementById('mHari').value;
  const kelasId = document.getElementById('mKelas').value;
  const jamMulai = document.getElementById('mMulai').value;
  const jamSelesai = document.getElementById('mSelesai').value;
  const catatan = document.getElementById('mCatatan').value.trim();
  const banner = document.getElementById('mBanner');

  if(!hari || !kelasId || !jamMulai || !jamSelesai){
    bannerErr(banner, 'Hari, kelas, jam mulai, dan jam selesai wajib diisi.');
    return;
  }
  const kelasNama = state.kelasCache.find(k => k.id === kelasId)?.nama || '';
  const payload = { hari, kelasId, kelasNama, jamMulai, jamSelesai, catatan };

  try{
    if(id) await db.collection('jadwal_mengajar').doc(id).update(payload);
    else await db.collection('jadwal_mengajar').add(payload);
    closeModal();
    loadJadwal();
  }catch(err){
    bannerErr(banner, 'Gagal menyimpan: ' + escapeHtml(err.message));
  }
}

async function hapusJadwal(id){
  if(!confirm('Hapus jadwal ini?')) return;
  try{
    await db.collection('jadwal_mengajar').doc(id).delete();
    loadJadwal();
  }catch(err){
    bannerErr(document.getElementById('jadwalBanner'), 'Gagal menghapus: ' + escapeHtml(err.message));
  }
}

/* ---------------- Modal helper ---------------- */
function renderModal(inner){
  document.getElementById('modalRoot').innerHTML = `<div class="modal-bg" id="modalBg"><div class="modal-box">${inner}</div></div>`;
  document.getElementById('modalBg').addEventListener('click', (e) => { if(e.target.id === 'modalBg') closeModal(); });
}
function closeModal(){ document.getElementById('modalRoot').innerHTML = ''; }
