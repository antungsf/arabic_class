/* ============================================================
   MATERI BELAJAR — logic
   Firestore: materi_item { kelas, semester, skill, judul, tipe, link, urutan }
   tipe: 'audio' | 'video' | 'dokumen'
   ============================================================ */

const SKILL_LABEL = { istima: "Istima'", qiraah: "Qira'ah", kalam: "Kalam", qawaid: "Qawaid" };
const TIPE_LABEL = { audio: 'Audio', video: 'Video', dokumen: 'Dokumen' };
const TIPE_ICON = { audio: '&#127911;', video: '&#127909;', dokumen: '&#128196;' };

const state = {
  kelas: null,
  semester: null,
  skill: null,
  editId: null
};

function escapeHtml(str){
  return String(str).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}
function bannerOk(el, msg){ el.innerHTML = `<div class="banner banner-ok">${msg}</div>`; }
function bannerErr(el, msg){ el.innerHTML = `<div class="banner banner-error">${msg}</div>`; }

function showPublicView(id){
  document.querySelectorAll('#publicApp > div').forEach(el => el.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  window.scrollTo({top:0, behavior:'smooth'});
}

/* ---------------- STUDENT ---------------- */
document.querySelectorAll('#viewKelas .card').forEach(card => {
  card.addEventListener('click', () => {
    state.kelas = card.dataset.kelas;
    document.getElementById('semEyebrow').textContent = 'Kelas ' + state.kelas;
    showPublicView('viewSemester');
  });
});
document.getElementById('crumbKelas').addEventListener('click', () => showPublicView('viewKelas'));

document.querySelectorAll('#viewSemester .card').forEach(card => {
  card.addEventListener('click', () => {
    state.semester = card.dataset.sem;
    document.getElementById('skillEyebrow').textContent = `Kelas ${state.kelas} · Semester ${state.semester}`;
    showPublicView('viewSkill');
  });
});
document.getElementById('crumbSemester').addEventListener('click', () => showPublicView('viewSemester'));

document.querySelectorAll('#viewSkill .card').forEach(card => {
  card.addEventListener('click', () => {
    state.skill = card.dataset.skill;
    document.getElementById('materiEyebrow').textContent = `Kelas ${state.kelas} · Semester ${state.semester}`;
    document.getElementById('materiTitle').textContent = SKILL_LABEL[state.skill];
    showPublicView('viewMateriList');
    loadMateriSiswa();
  });
});
document.getElementById('crumbSkill').addEventListener('click', () => showPublicView('viewSkill'));

async function loadMateriSiswa(){
  const box = document.getElementById('materiList');
  box.innerHTML = '<div class="loading">Memuat materi…</div>';
  try{
    const snap = await db.collection('materi_item')
      .where('kelas','==',state.kelas)
      .where('semester','==',state.semester)
      .where('skill','==',state.skill)
      .orderBy('urutan','asc')
      .get();
    if(snap.empty){ box.innerHTML = '<div class="empty">Belum ada materi untuk Maharah ini.</div>'; return; }
    box.innerHTML = '';
    snap.forEach(doc => {
      const d = doc.data();
      const item = document.createElement('a');
      item.className = 'materi-item';
      item.href = d.link;
      item.target = '_blank';
      item.rel = 'noopener';
      item.innerHTML = `
        <div class="materi-icon ${d.tipe}">${TIPE_ICON[d.tipe] || '&#128196;'}</div>
        <div class="materi-info">
          <h4>${escapeHtml(d.judul)}</h4>
          <span class="tipe-label">${TIPE_LABEL[d.tipe] || d.tipe}</span>
        </div>`;
      box.appendChild(item);
    });
  }catch(err){
    box.innerHTML = `<div class="empty">Gagal memuat materi. ${escapeHtml(err.message)}</div>`;
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
}
document.getElementById('crumbAdminBack').addEventListener('click', backToStudent);
document.getElementById('crumbAdminBack2').addEventListener('click', backToStudent);

auth.onAuthStateChanged(user => {
  if(user){
    document.getElementById('viewLogin').classList.add('hidden');
    document.getElementById('viewDashboard').classList.remove('hidden');
    document.getElementById('adminWhoami').textContent = user.email;
  } else {
    document.getElementById('viewLogin').classList.remove('hidden');
    document.getElementById('viewDashboard').classList.add('hidden');
  }
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
document.getElementById('btnLogout').addEventListener('click', () => auth.signOut());

document.getElementById('btnMuatAdminMateri').addEventListener('click', loadMateriAdmin);

async function loadMateriAdmin(){
  const box = document.getElementById('materiAdminList');
  const kelas = document.getElementById('aKelas').value;
  const semester = document.getElementById('aSemester').value;
  const skill = document.getElementById('aSkill').value;
  box.innerHTML = '<div class="loading">Memuat…</div>';
  try{
    const snap = await db.collection('materi_item')
      .where('kelas','==',kelas).where('semester','==',semester).where('skill','==',skill)
      .orderBy('urutan','asc').get();
    if(snap.empty){ box.innerHTML = '<div class="empty">Belum ada materi. Klik "+ Tambah Materi".</div>'; return; }
    box.innerHTML = '';
    snap.forEach(doc => {
      const d = doc.data();
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <div class="list-item-head">
          <div>
            <h4 style="margin:0 0 4px;font-size:14px;font-family:'Poppins',sans-serif;color:var(--green-deep);">${escapeHtml(d.judul)}</h4>
            <div class="hint">${TIPE_LABEL[d.tipe] || d.tipe} · urutan ${d.urutan ?? '-'} · <a href="${d.link}" target="_blank" style="text-decoration:underline;">buka link</a></div>
          </div>
          <div>
            <button class="icon-btn" data-act="edit">Edit</button>
            <button class="icon-btn danger" data-act="hapus">Hapus</button>
          </div>
        </div>`;
      item.querySelector('[data-act="edit"]').addEventListener('click', () => openMateriModal(doc.id, d));
      item.querySelector('[data-act="hapus"]').addEventListener('click', () => hapusMateri(doc.id));
      box.appendChild(item);
    });
  }catch(err){
    box.innerHTML = `<div class="empty">Gagal memuat. ${escapeHtml(err.message)}</div>`;
  }
}

document.getElementById('btnTambahMateri').addEventListener('click', () => openMateriModal(null, {}));

function openMateriModal(id, d){
  state.editId = id;
  const tipe = d.tipe || 'audio';
  renderModal(`
    <h3>${id ? 'Edit' : 'Tambah'} Materi</h3>
    <div class="field"><label>Judul</label>
      <input type="text" id="mJudul" value="${escapeHtml(d.judul||'')}" placeholder="Contoh: Audio Dialog Perkenalan Diri"></div>
    <div class="field"><label>Tipe</label>
      <select id="mTipe">
        <option value="audio" ${tipe==='audio'?'selected':''}>Audio</option>
        <option value="video" ${tipe==='video'?'selected':''}>Video</option>
        <option value="dokumen" ${tipe==='dokumen'?'selected':''}>Dokumen</option>
      </select></div>
    <div class="field"><label>Link (YouTube / Google Drive / lainnya)</label>
      <input type="text" id="mLink" value="${escapeHtml(d.link||'')}" placeholder="https://..."></div>
    <div class="field"><label>Urutan tampil</label>
      <input type="number" id="mUrutan" value="${d.urutan ?? 1}"></div>
    <div id="mMateriBanner"></div>
    <div class="row">
      <button class="btn btn-solid" id="mMateriSimpan">Simpan</button>
      <button class="btn btn-outline" id="mCancel">Batal</button>
    </div>`);
  document.getElementById('mCancel').addEventListener('click', closeModal);
  document.getElementById('mMateriSimpan').addEventListener('click', simpanMateri);
}

async function simpanMateri(){
  const banner = document.getElementById('mMateriBanner');
  const judul = document.getElementById('mJudul').value.trim();
  const link = document.getElementById('mLink').value.trim();
  if(!judul){ bannerErr(banner, 'Judul wajib diisi.'); return; }
  if(!link){ bannerErr(banner, 'Link wajib diisi.'); return; }
  const payload = {
    kelas: document.getElementById('aKelas').value,
    semester: document.getElementById('aSemester').value,
    skill: document.getElementById('aSkill').value,
    judul,
    tipe: document.getElementById('mTipe').value,
    link,
    urutan: Number(document.getElementById('mUrutan').value) || 1
  };
  try{
    if(state.editId) await db.collection('materi_item').doc(state.editId).update(payload);
    else await db.collection('materi_item').add(payload);
    closeModal();
    loadMateriAdmin();
  }catch(err){
    bannerErr(banner, 'Gagal menyimpan: ' + escapeHtml(err.message));
  }
}

async function hapusMateri(id){
  if(!confirm('Hapus materi ini?')) return;
  try{
    await db.collection('materi_item').doc(id).delete();
    loadMateriAdmin();
  }catch(err){
    alert('Gagal menghapus: ' + err.message);
  }
}

/* ---------------- helpers ---------------- */
function renderModal(inner){
  document.getElementById('modalRoot').innerHTML = `<div class="modal-bg" id="modalBg"><div class="modal-box">${inner}</div></div>`;
  document.getElementById('modalBg').addEventListener('click', (e) => { if(e.target.id === 'modalBg') closeModal(); });
}
function closeModal(){ document.getElementById('modalRoot').innerHTML = ''; }
