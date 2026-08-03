/* ============================================================
   LATIHAN KUIS — logic (santai, tanpa nama/jadwal, instant feedback)
   Firestore:
   - latihan_topik { kelas, nama, deskripsi, urutan, aktif }
   - latihan_soal  { topikId, pertanyaan, audioUrl (opsional),
                      pilihan:{A,B,C,D,E}, jawabanBenar, urutan }
   ============================================================ */

const state = {
  kelas: null,
  topik: null,
  soalList: [],
  soalIndex: 0,
  skorBenar: 0,
  sudahDijawabSoalIni: false,
  editTopikId: null,
  editSoalId: null
};

function escapeHtml(str){
  return String(str).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}
function bannerOk(el, msg){ el.innerHTML = `<div class="banner banner-ok">${msg}</div>`; }
function bannerErr(el, msg){ el.innerHTML = `<div class="banner banner-error">${msg}</div>`; }
function isLinkAman(url){ return !url || /^https?:\/\//i.test(String(url).trim()); }
function acakArray(arr){
  const a = arr.slice();
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function showView(id){
  document.querySelectorAll('#studentApp > div').forEach(el => el.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  window.scrollTo({top:0, behavior:'smooth'});
}

/* ---------------- STUDENT: pilih kelas ---------------- */
document.querySelectorAll('#viewKelas .card').forEach(card => {
  card.setAttribute('role','button'); card.setAttribute('tabindex','0');
  const aktifkan = () => {
    state.kelas = card.dataset.kelas;
    document.getElementById('topikEyebrow').textContent = 'Kelas ' + state.kelas;
    showView('viewTopik');
    loadTopikSiswa(state.kelas);
  };
  card.addEventListener('click', aktifkan);
  card.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){ e.preventDefault(); aktifkan(); } });
});
document.getElementById('crumbKelas').addEventListener('click', () => showView('viewKelas'));
document.getElementById('crumbTopik').addEventListener('click', () => { showView('viewTopik'); loadTopikSiswa(state.kelas); });
document.getElementById('crumbSkorTopik').addEventListener('click', () => { showView('viewTopik'); loadTopikSiswa(state.kelas); });
document.getElementById('btnTopikLainSkor').addEventListener('click', () => { showView('viewTopik'); loadTopikSiswa(state.kelas); });

async function loadTopikSiswa(kelas){
  const box = document.getElementById('topikList');
  box.innerHTML = '<div class="loading">Memuat topik…</div>';
  try{
    const snap = await db.collection('latihan_topik')
      .where('kelas','==',kelas).where('aktif','==',true)
      .orderBy('urutan','asc').get();
    if(snap.empty){
      box.innerHTML = '<div class="empty">Belum ada topik latihan untuk kelas ini.</div>';
      return;
    }
    box.innerHTML = '';
    snap.forEach(doc => {
      const d = doc.data();
      const card = document.createElement('div');
      card.className = 'card'; card.tabIndex = 0; card.setAttribute('role','button');
      card.innerHTML = `<p class="k">${escapeHtml(d.nama)}</p><p class="d">${escapeHtml(d.deskripsi||'')}</p>`;
      const aktifkan = () => bukaTopik(doc.id, d);
      card.addEventListener('click', aktifkan);
      card.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){ e.preventDefault(); aktifkan(); } });
      box.appendChild(card);
    });
  }catch(err){
    box.innerHTML = `<div class="empty">Gagal memuat topik. ${escapeHtml(err.message)}</div>`;
  }
}

function bukaTopik(id, d){
  state.topik = {id, nama:d.nama, kelas:d.kelas};
  document.getElementById('kuisEyebrow').textContent = 'Kelas ' + d.kelas;
  document.getElementById('kuisTitle').textContent = d.nama;
  mulaiKuis(id);
}

async function mulaiKuis(topikId){
  const box = document.getElementById('kuisSoal');
  box.innerHTML = '<div class="loading">Memuat soal…</div>';
  document.getElementById('btnLanjutKuis').classList.add('hidden');
  showView('viewKuis');
  try{
    const snap = await db.collection('latihan_soal').where('topikId','==',topikId).orderBy('urutan','asc').get();
    let daftar = [];
    snap.forEach(doc => daftar.push({id:doc.id, ...doc.data()}));
    daftar = acakArray(daftar);
    state.soalList = daftar;
    state.soalIndex = 0;
    state.skorBenar = 0;
    if(!daftar.length){
      box.innerHTML = '<div class="empty">Belum ada soal untuk topik ini.</div>';
      return;
    }
    renderSoalKuis();
  }catch(err){
    box.innerHTML = `<div class="empty">Gagal memuat soal. ${escapeHtml(err.message)}</div>`;
  }
}

function renderSoalKuis(){
  const box = document.getElementById('kuisSoal');
  const progress = document.getElementById('kuisProgress');
  const total = state.soalList.length;
  const i = state.soalIndex;
  const d = state.soalList[i];
  state.sudahDijawabSoalIni = false;
  progress.textContent = `Soal ${i + 1} dari ${total} · Skor sementara: ${state.skorBenar}`;

  if(!d._kunciAcak){
    const kunciTersedia = ['A','B','C','D','E'].filter(k => d.pilihan && d.pilihan[k]);
    d._kunciAcak = acakArray(kunciTersedia);
  }

  let inner = `<div class="kuis-block">`;
  if(d.audioUrl){
    inner += `<audio controls preload="none" src="${escapeHtml(d.audioUrl)}"></audio>`;
  }
  inner += `<p class="kuis-text">${escapeHtml(d.pertanyaan)}</p>`;
  d._kunciAcak.forEach(k => {
    inner += `<div class="kuis-opsi" data-key="${k}">${escapeHtml(d.pilihan[k])}</div>`;
  });
  inner += `<div class="kuis-feedback" id="kuisFeedback"></div><div class="kuis-penjelasan hidden" id="kuisPenjelasan"></div></div>`;
  box.innerHTML = inner;
  document.getElementById('btnLanjutKuis').classList.add('hidden');

  box.querySelectorAll('.kuis-opsi').forEach(opt => {
    opt.addEventListener('click', () => {
      if(state.sudahDijawabSoalIni) return;
      state.sudahDijawabSoalIni = true;
      const dipilih = opt.dataset.key;
      const benar = dipilih === d.jawabanBenar;
      if(benar) state.skorBenar++;
      box.querySelectorAll('.kuis-opsi').forEach(o => {
        o.classList.add('locked');
        if(o.dataset.key === d.jawabanBenar) o.classList.add('benar');
        else if(o === opt) o.classList.add('salah');
      });
      const fb = document.getElementById('kuisFeedback');
      fb.textContent = benar ? '✓ Benar!' : `✗ Kurang tepat. Jawaban benar: ${d.pilihan[d.jawabanBenar] || '-'}`;
      fb.className = 'kuis-feedback ' + (benar ? 'ok' : 'err');
      if(d.penjelasan){
        const pj = document.getElementById('kuisPenjelasan');
        pj.innerHTML = '<b>Penjelasan:</b> ' + escapeHtml(d.penjelasan);
        pj.classList.remove('hidden');
      }
      progress.textContent = `Soal ${i + 1} dari ${total} · Skor sementara: ${state.skorBenar}`;
      const lanjutBtn = document.getElementById('btnLanjutKuis');
      lanjutBtn.textContent = (i === total - 1) ? 'Lihat Skor Akhir' : 'Soal Berikutnya \u2192';
      lanjutBtn.classList.remove('hidden');
    });
  });
}

document.getElementById('btnLanjutKuis').addEventListener('click', () => {
  if(state.soalIndex < state.soalList.length - 1){
    state.soalIndex++;
    renderSoalKuis();
  } else {
    tampilkanSkorAkhir();
  }
});

function tampilkanSkorAkhir(){
  const total = state.soalList.length;
  document.getElementById('skorAngka').textContent = `${state.skorBenar}/${total}`;
  const persen = total ? Math.round((state.skorBenar/total)*100) : 0;
  let ket = 'Terus berlatih ya!';
  if(persen === 100) ket = 'Sempurna! Semua jawaban benar.';
  else if(persen >= 70) ket = 'Bagus! Sedikit lagi sempurna.';
  document.getElementById('skorKeterangan').textContent = `${persen}% benar — ${ket}`;
  showView('viewSkor');
}
document.getElementById('btnUlangiKuis').addEventListener('click', () => mulaiKuis(state.topik.id));

/* ---------------- ADMIN ---------------- */
document.getElementById('btnShowAdmin').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('studentApp').classList.add('hidden');
  document.getElementById('adminApp').classList.remove('hidden');
});
function backToStudent(){
  document.getElementById('adminApp').classList.add('hidden');
  document.getElementById('studentApp').classList.remove('hidden');
  showView('viewKelas');
}
document.getElementById('crumbAdminBack').addEventListener('click', backToStudent);
document.getElementById('crumbAdminBack2').addEventListener('click', backToStudent);

auth.onAuthStateChanged(user => {
  if(user){
    document.getElementById('viewLogin').classList.add('hidden');
    document.getElementById('viewDashboard').classList.remove('hidden');
    document.getElementById('adminWhoami').textContent = user.email;
    loadTopikAdmin();
    loadSelectTopikSoal();
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

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ['topik','soal'].forEach(t => {
      document.getElementById('tab'+t.charAt(0).toUpperCase()+t.slice(1)).classList.toggle('hidden', t !== btn.dataset.tab);
    });
  });
});

/* ---- Admin: Topik ---- */
async function loadTopikAdmin(){
  const box = document.getElementById('topikAdminList');
  box.innerHTML = '<div class="loading">Memuat…</div>';
  try{
    const snap = await db.collection('latihan_topik').orderBy('kelas').orderBy('urutan').get();
    if(snap.empty){ box.innerHTML = '<div class="empty">Belum ada topik. Klik "+ Tambah Topik".</div>'; return; }
    box.innerHTML = '';
    snap.forEach(doc => {
      const d = doc.data();
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <div class="list-item-head">
          <div>
            <h4 style="margin:0 0 4px;font-size:14.5px;font-family:'Poppins',sans-serif;color:var(--green-deep);">${escapeHtml(d.nama)} <span class="badge badge-wait">${d.aktif!==false?'Aktif':'Nonaktif'}</span></h4>
            <div class="hint">Kelas ${escapeHtml(d.kelas)} · urutan ${d.urutan ?? '-'} · ${escapeHtml(d.deskripsi||'')}</div>
          </div>
          <div>
            <button class="icon-btn" data-act="edit">Edit</button>
            <button class="icon-btn danger" data-act="hapus">Hapus</button>
          </div>
        </div>`;
      item.querySelector('[data-act="edit"]').addEventListener('click', () => openTopikModal(doc.id, d));
      item.querySelector('[data-act="hapus"]').addEventListener('click', () => hapusTopik(doc.id, d.nama));
      box.appendChild(item);
    });
  }catch(err){
    box.innerHTML = `<div class="empty">Gagal memuat. ${escapeHtml(err.message)}</div>`;
  }
}
document.getElementById('btnTambahTopik').addEventListener('click', () => openTopikModal(null, {}));

function openTopikModal(id, d){
  state.editTopikId = id;
  renderModal(`
    <h3>${id ? 'Edit' : 'Tambah'} Topik Latihan</h3>
    <div class="field"><label>Kelas</label>
      <select id="mKelas">
        <option value="X" ${d.kelas==='X'?'selected':''}>X</option>
        <option value="XI" ${d.kelas==='XI'?'selected':''}>XI</option>
        <option value="XII" ${d.kelas==='XII'?'selected':''}>XII</option>
      </select></div>
    <div class="field"><label>Nama Topik</label>
      <input type="text" id="mNama" value="${escapeHtml(d.nama||'')}" placeholder="Contoh: Huruf Jar 1"></div>
    <div class="field"><label>Deskripsi singkat</label>
      <textarea id="mDeskripsi">${escapeHtml(d.deskripsi||'')}</textarea></div>
    <div class="field"><label>Urutan tampil</label>
      <input type="number" id="mUrutan" value="${d.urutan ?? 1}"></div>
    <div class="field"><label><input type="checkbox" id="mAktif" ${d.aktif!==false?'checked':''} style="width:auto;margin-right:8px;">Tampilkan ke siswa</label></div>
    <div id="mBanner"></div>
    <div class="row">
      <button class="btn btn-solid" id="mSimpan">Simpan</button>
      <button class="btn btn-outline" id="mCancel">Batal</button>
    </div>`);
  document.getElementById('mCancel').addEventListener('click', closeModal);
  document.getElementById('mSimpan').addEventListener('click', simpanTopik);
}

async function simpanTopik(){
  const banner = document.getElementById('mBanner');
  const nama = document.getElementById('mNama').value.trim();
  if(!nama){ bannerErr(banner, 'Nama topik wajib diisi.'); return; }
  const payload = {
    kelas: document.getElementById('mKelas').value,
    nama,
    deskripsi: document.getElementById('mDeskripsi').value.trim(),
    urutan: Number(document.getElementById('mUrutan').value) || 1,
    aktif: document.getElementById('mAktif').checked
  };
  try{
    if(state.editTopikId) await db.collection('latihan_topik').doc(state.editTopikId).update(payload);
    else await db.collection('latihan_topik').add(payload);
    closeModal(); loadTopikAdmin(); loadSelectTopikSoal();
  }catch(err){ bannerErr(banner, 'Gagal menyimpan: ' + escapeHtml(err.message)); }
}

async function hapusTopik(id, nama){
  if(!confirm(`Hapus topik "${nama}"? Soal yang terkait tidak ikut terhapus otomatis.`)) return;
  try{ await db.collection('latihan_topik').doc(id).delete(); loadTopikAdmin(); loadSelectTopikSoal(); }
  catch(err){ alert('Gagal menghapus: ' + err.message); }
}

/* ---- Admin: Soal ---- */
async function loadSelectTopikSoal(){
  const sel = document.getElementById('selectTopikSoal');
  try{
    const snap = await db.collection('latihan_topik').orderBy('kelas').orderBy('urutan').get();
    sel.innerHTML = '<option value="">— pilih topik —</option>';
    snap.forEach(doc => {
      const d = doc.data();
      const opt = document.createElement('option');
      opt.value = doc.id; opt.textContent = `Kelas ${d.kelas} · ${d.nama}`;
      sel.appendChild(opt);
    });
  }catch(err){ sel.innerHTML = '<option>Gagal memuat</option>'; }
}
document.getElementById('selectTopikSoal').addEventListener('change', e => {
  if(e.target.value) loadSoalAdmin(e.target.value);
  else document.getElementById('soalAdminList').innerHTML = '<div class="empty">Pilih topik dahulu.</div>';
});

async function loadSoalAdmin(topikId){
  const box = document.getElementById('soalAdminList');
  box.innerHTML = '<div class="loading">Memuat…</div>';
  try{
    const snap = await db.collection('latihan_soal').where('topikId','==',topikId).orderBy('urutan','asc').get();
    if(snap.empty){ box.innerHTML = '<div class="empty">Belum ada soal untuk topik ini.</div>'; return; }
    box.innerHTML = '';
    snap.forEach(doc => {
      const d = doc.data();
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <div class="list-item-head">
          <div>
            <h4 style="margin:0 0 4px;font-size:14px;">Soal #${d.urutan ?? '-'} ${d.audioUrl ? '<span class="badge badge-wait">Audio</span>' : ''}</h4>
            <div class="hint">${escapeHtml(d.pertanyaan)}</div>
          </div>
          <div>
            <button class="icon-btn" data-act="edit">Edit</button>
            <button class="icon-btn danger" data-act="hapus">Hapus</button>
          </div>
        </div>`;
      item.querySelector('[data-act="edit"]').addEventListener('click', () => openSoalModal(doc.id, d, topikId));
      item.querySelector('[data-act="hapus"]').addEventListener('click', () => hapusSoal(doc.id, topikId));
      box.appendChild(item);
    });
  }catch(err){
    box.innerHTML = `<div class="empty">Gagal memuat. ${escapeHtml(err.message)}</div>`;
  }
}

document.getElementById('btnTambahSoal').addEventListener('click', () => {
  const topikId = document.getElementById('selectTopikSoal').value;
  if(!topikId){ alert('Pilih topik dahulu di dropdown atas.'); return; }
  openSoalModal(null, {}, topikId);
});

function openSoalModal(id, d, topikId){
  state.editSoalId = id;
  const p = d.pilihan || {};
  renderModal(`
    <h3>${id ? 'Edit' : 'Tambah'} Soal</h3>
    <div class="field"><label>Pertanyaan</label>
      <textarea id="mPertanyaan" placeholder="Tulis pertanyaan…">${escapeHtml(d.pertanyaan||'')}</textarea></div>
    <div class="field"><label>Link Audio <span class="hint">(opsional, untuk soal listening)</span></label>
      <input type="text" id="mAudio" value="${escapeHtml(d.audioUrl||'')}" placeholder="https://..."></div>
    <div class="field"><label>Pilihan A</label><input type="text" id="mA" value="${escapeHtml(p.A||'')}"></div>
    <div class="field"><label>Pilihan B</label><input type="text" id="mB" value="${escapeHtml(p.B||'')}"></div>
    <div class="field"><label>Pilihan C</label><input type="text" id="mC" value="${escapeHtml(p.C||'')}"></div>
    <div class="field"><label>Pilihan D</label><input type="text" id="mD" value="${escapeHtml(p.D||'')}"></div>
    <div class="field"><label>Pilihan E <span class="hint">(opsional)</span></label><input type="text" id="mE" value="${escapeHtml(p.E||'')}"></div>
    <div class="field"><label>Jawaban Benar</label>
      <select id="mJawaban">
        <option value="">—</option>
        <option value="A" ${d.jawabanBenar==='A'?'selected':''}>A</option>
        <option value="B" ${d.jawabanBenar==='B'?'selected':''}>B</option>
        <option value="C" ${d.jawabanBenar==='C'?'selected':''}>C</option>
        <option value="D" ${d.jawabanBenar==='D'?'selected':''}>D</option>
        <option value="E" ${d.jawabanBenar==='E'?'selected':''}>E</option>
      </select></div>
    <div class="field"><label>Penjelasan Jawaban <span class="hint">(opsional, tampil ke siswa setelah menjawab)</span></label>
      <textarea id="mPenjelasan" placeholder="Contoh: Untuk bilangan 3-10, ma'dud wajib berbentuk jamak majrur...">${escapeHtml(d.penjelasan||'')}</textarea></div>
    <div class="field"><label>Urutan tampil</label><input type="number" id="mUrutanSoal" value="${d.urutan ?? 1}"></div>
    <div id="mBanner"></div>
    <div class="row">
      <button class="btn btn-solid" id="mSimpan">Simpan</button>
      <button class="btn btn-outline" id="mCancel">Batal</button>
    </div>`);
  document.getElementById('mCancel').addEventListener('click', closeModal);
  document.getElementById('mSimpan').addEventListener('click', () => simpanSoal(topikId));
}

async function simpanSoal(topikId){
  const banner = document.getElementById('mBanner');
  const pertanyaan = document.getElementById('mPertanyaan').value.trim();
  if(!pertanyaan){ bannerErr(banner, 'Pertanyaan wajib diisi.'); return; }
  const audioUrl = document.getElementById('mAudio').value.trim();
  if(!isLinkAman(audioUrl)){ bannerErr(banner, 'Link audio harus diawali http:// atau https://'); return; }
  const jawabanBenar = document.getElementById('mJawaban').value;
  if(!jawabanBenar){ bannerErr(banner, 'Pilih jawaban benar.'); return; }
  const payload = {
    topikId, pertanyaan,
    audioUrl: audioUrl || null,
    penjelasan: document.getElementById('mPenjelasan').value.trim() || null,
    pilihan: {
      A: document.getElementById('mA').value.trim(),
      B: document.getElementById('mB').value.trim(),
      C: document.getElementById('mC').value.trim(),
      D: document.getElementById('mD').value.trim(),
      E: document.getElementById('mE').value.trim()
    },
    jawabanBenar,
    urutan: Number(document.getElementById('mUrutanSoal').value) || 1
  };
  try{
    if(state.editSoalId) await db.collection('latihan_soal').doc(state.editSoalId).update(payload);
    else await db.collection('latihan_soal').add(payload);
    closeModal(); loadSoalAdmin(topikId);
  }catch(err){ bannerErr(banner, 'Gagal menyimpan: ' + escapeHtml(err.message)); }
}

async function hapusSoal(id, topikId){
  if(!confirm('Hapus soal ini?')) return;
  try{ await db.collection('latihan_soal').doc(id).delete(); loadSoalAdmin(topikId); }
  catch(err){ alert('Gagal menghapus: ' + err.message); }
}

/* ---- helpers ---- */
function renderModal(inner){
  document.getElementById('modalRoot').innerHTML = `<div class="modal-bg" id="modalBg"><div class="modal-box">${inner}</div></div>`;
  document.getElementById('modalBg').addEventListener('click', e => { if(e.target.id === 'modalBg') closeModal(); });
}
function closeModal(){ document.getElementById('modalRoot').innerHTML = ''; }

/* ---- Akses Admin Tersembunyi ---- */
(function(){
  const btn = document.getElementById("btnShowAdmin");
  const logo = document.getElementById("brandLogoTap");
  if(!btn) return;
  function tampilkanTombolAdmin(){ btn.classList.add("tampak"); }
  if(window.location.hash === "#admin") tampilkanTombolAdmin();
  if(logo){
    let jumlahTap = 0, timerReset = null;
    logo.style.cursor = "default";
    logo.addEventListener("click", function(){
      jumlahTap++;
      clearTimeout(timerReset);
      timerReset = setTimeout(function(){ jumlahTap = 0; }, 3000);
      if(jumlahTap >= 5){ tampilkanTombolAdmin(); jumlahTap = 0; }
    });
  }
})();
