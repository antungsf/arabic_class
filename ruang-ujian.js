/* ============================================================
   RUANG UJIAN — logic
   Struktur Firestore:
   - topik    { kelas, nama, deskripsi, urutan, aktif }
   - soal     { topikId, tipe: 'pilihan_ganda'|'esai', pertanyaan,
                pilihan: {A,B,C,D} (khusus pilihan_ganda), jawabanBenar,
                urutan }
   - hasil_ujian { topikId, topikNama, kelas, namaSiswa, jawaban:[...],
                   waktuSubmit, status: 'belum_dinilai'|'sudah_dinilai',
                   nilai, catatanGuru }
   ============================================================ */

const state = {
  kelas: null,
  topik: null,      // {id, nama, kelas}
  namaSiswa: "",
  soalList: [],      // soal aktif yang sedang dikerjakan
  jawaban: {},       // soalId -> jawaban
  editTopikId: null,
  editSoalId: null,
  hasilOpenId: null,
  adminTopikCache: []
};

function showView(id){
  document.querySelectorAll('#studentApp > div').forEach(el => el.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  window.scrollTo({top:0, behavior:'smooth'});
}

function bannerOk(el, msg){ el.innerHTML = `<div class="banner banner-ok">${msg}</div>`; }
function bannerErr(el, msg){ el.innerHTML = `<div class="banner banner-error">${msg}</div>`; }

/* ---------------- STUDENT: pilih kelas ---------------- */
document.querySelectorAll('#viewKelas .card').forEach(card => {
  card.addEventListener('click', () => {
    state.kelas = card.dataset.kelas;
    document.getElementById('topikEyebrow').textContent = 'Kelas ' + state.kelas;
    showView('viewTopik');
    loadTopikSiswa(state.kelas);
  });
});

document.getElementById('crumbKelas').addEventListener('click', () => showView('viewKelas'));
document.getElementById('crumbTopik').addEventListener('click', () => {
  showView('viewTopik');
  loadTopikSiswa(state.kelas);
});

async function loadTopikSiswa(kelas){
  const box = document.getElementById('topikList');
  box.innerHTML = '<div class="loading">Memuat daftar materi…</div>';
  try{
    const snap = await db.collection('topik')
      .where('kelas','==',kelas)
      .where('aktif','==',true)
      .orderBy('urutan','asc')
      .get();
    if(snap.empty){
      box.innerHTML = '<div class="empty">Belum ada materi asesmen untuk kelas ini. Silakan cek lagi nanti.</div>';
      return;
    }
    box.innerHTML = '';
    snap.forEach(doc => {
      const d = doc.data();
      const card = document.createElement('div');
      card.className = 'topik-card';
      card.innerHTML = `
        <div>
          <div class="topik-meta">Kelas ${d.kelas}</div>
          <h3>${escapeHtml(d.nama)}</h3>
          <p>${escapeHtml(d.deskripsi||'')}</p>
        </div>
        <button class="btn btn-solid btn-sm">Mulai</button>`;
      card.querySelector('button').addEventListener('click', () => bukaTopik(doc.id, d));
      box.appendChild(card);
    });
  }catch(err){
    box.innerHTML = `<div class="empty">Gagal memuat materi. ${escapeHtml(err.message)}</div>`;
  }
}

function bukaTopik(id, d){
  state.topik = {id, nama:d.nama, kelas:d.kelas};
  document.getElementById('namaEyebrow').textContent = 'Kelas ' + d.kelas + ' · ' + d.nama;
  document.getElementById('namaTitle').textContent = 'Mulai: ' + d.nama;
  document.getElementById('inputNamaSiswa').value = '';
  showView('viewNama');
}

document.getElementById('btnMulaiUjian').addEventListener('click', async () => {
  const nama = document.getElementById('inputNamaSiswa').value.trim();
  if(!nama){ alert('Isi nama lengkap dulu ya.'); return; }
  state.namaSiswa = nama;
  document.getElementById('ujianEyebrow').textContent = 'Kelas ' + state.topik.kelas + ' · ' + state.topik.nama;
  document.getElementById('ujianTitle').textContent = state.topik.nama;
  showView('viewUjian');
  await loadSoalSiswa(state.topik.id);
});

async function loadSoalSiswa(topikId){
  const box = document.getElementById('soalList');
  box.innerHTML = '<div class="loading">Memuat soal…</div>';
  document.getElementById('banner').innerHTML = '';
  try{
    const snap = await db.collection('soal').where('topikId','==',topikId).orderBy('urutan','asc').get();
    state.soalList = [];
    state.jawaban = {};
    if(snap.empty){
      box.innerHTML = '<div class="empty">Belum ada soal untuk materi ini.</div>';
      document.getElementById('btnKumpulkan').disabled = true;
      return;
    }
    document.getElementById('btnKumpulkan').disabled = false;
    box.innerHTML = '';
    let no = 1;
    snap.forEach(doc => {
      const d = doc.data();
      state.soalList.push({id:doc.id, ...d});
      const block = document.createElement('div');
      block.className = 'soal-block';
      let inner = `<div class="soal-no">Soal ${no}</div><p class="soal-text">${escapeHtml(d.pertanyaan)}</p>`;
      if(d.tipe === 'pilihan_ganda'){
        ['A','B','C','D'].forEach(k => {
          if(d.pilihan && d.pilihan[k]){
            inner += `
              <label class="opsi" data-key="${k}" data-soal="${doc.id}">
                <input type="radio" name="soal_${doc.id}" value="${k}">
                <span><b>${k}.</b> ${escapeHtml(d.pilihan[k])}</span>
              </label>`;
          }
        });
      } else {
        inner += `<textarea class="soal-esai" data-soal="${doc.id}" placeholder="Tulis jawaban kamu di sini…"></textarea>`;
      }
      block.innerHTML = inner;
      box.appendChild(block);
      no++;
    });

    box.querySelectorAll('.opsi').forEach(opt => {
      opt.addEventListener('click', () => {
        const soalId = opt.dataset.soal;
        box.querySelectorAll(`.opsi[data-soal="${soalId}"]`).forEach(o => o.classList.remove('checked'));
        opt.classList.add('checked');
        opt.querySelector('input').checked = true;
        state.jawaban[soalId] = opt.dataset.key;
      });
    });
    box.querySelectorAll('.soal-esai').forEach(ta => {
      ta.addEventListener('input', () => { state.jawaban[ta.dataset.soal] = ta.value; });
    });
  }catch(err){
    box.innerHTML = `<div class="empty">Gagal memuat soal. ${escapeHtml(err.message)}</div>`;
  }
}

document.getElementById('btnKumpulkan').addEventListener('click', async () => {
  const banner = document.getElementById('banner');
  const belumDijawab = state.soalList.filter(s => !state.jawaban[s.id] || String(state.jawaban[s.id]).trim()==='');
  if(belumDijawab.length){
    bannerErr(banner, `Masih ada ${belumDijawab.length} soal yang belum dijawab.`);
    return;
  }
  const btn = document.getElementById('btnKumpulkan');
  btn.disabled = true; btn.textContent = 'Mengirim…';
  try{
    const jawabanArr = state.soalList.map(s => ({
      soalId: s.id,
      pertanyaan: s.pertanyaan,
      tipe: s.tipe,
      jawabanSiswa: state.jawaban[s.id]
    }));
    await db.collection('hasil_ujian').add({
      topikId: state.topik.id,
      topikNama: state.topik.nama,
      kelas: state.topik.kelas,
      namaSiswa: state.namaSiswa,
      jawaban: jawabanArr,
      waktuSubmit: firebase.firestore.FieldValue.serverTimestamp(),
      status: 'belum_dinilai',
      nilai: null,
      catatanGuru: null
    });
    showView('viewSelesai');
  }catch(err){
    bannerErr(banner, 'Gagal mengirim jawaban: ' + escapeHtml(err.message));
    btn.disabled = false; btn.textContent = 'Kumpulkan Jawaban';
  }
});

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
    loadHasilAdmin();
  } else {
    document.getElementById('viewLogin').classList.remove('hidden');
    document.getElementById('viewDashboard').classList.add('hidden');
  }
});

document.getElementById('btnLogin').addEventListener('click', async () => {
  const email = document.getElementById('adminEmail').value.trim();
  const pass = document.getElementById('adminPassword').value;
  const banner = document.getElementById('loginBanner');
  if(CONFIG_BELUM_DIISI){
    bannerErr(banner, 'Konfigurasi Firebase belum diisi di ruang-ujian.html (firebaseConfig).');
    return;
  }
  try{
    await auth.signInWithEmailAndPassword(email, pass);
  }catch(err){
    bannerErr(banner, 'Login gagal: ' + escapeHtml(err.message));
  }
});
document.getElementById('btnLogout').addEventListener('click', () => auth.signOut());

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ['topik','soal','hasil'].forEach(t => {
      document.getElementById('tab'+capitalize(t)).classList.toggle('hidden', t !== btn.dataset.tab);
    });
  });
});
function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

/* ---- Admin: Topik ---- */
async function loadTopikAdmin(){
  const box = document.getElementById('topikAdminList');
  box.innerHTML = '<div class="loading">Memuat…</div>';
  try{
    const snap = await db.collection('topik').orderBy('kelas').orderBy('urutan').get();
    state.adminTopikCache = [];
    if(snap.empty){ box.innerHTML = '<div class="empty">Belum ada materi. Klik "+ Tambah Materi".</div>'; return; }
    box.innerHTML = '';
    snap.forEach(doc => {
      const d = doc.data();
      state.adminTopikCache.push({id:doc.id, ...d});
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <div class="list-item-head">
          <div>
            <h4>${escapeHtml(d.nama)} <span class="badge ${d.aktif?'badge-done':'badge-wait'}">${d.aktif?'Aktif':'Nonaktif'}</span></h4>
            <div class="meta">Kelas ${d.kelas} · urutan ${d.urutan ?? '-'} · ${escapeHtml(d.deskripsi||'')}</div>
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
    <h3>${id ? 'Edit' : 'Tambah'} Materi</h3>
    <div class="field"><label>Kelas</label>
      <select id="mTopikKelas">
        <option value="X" ${d.kelas==='X'?'selected':''}>X</option>
        <option value="XI" ${d.kelas==='XI'?'selected':''}>XI</option>
        <option value="XII" ${d.kelas==='XII'?'selected':''}>XII</option>
      </select>
    </div>
    <div class="field"><label>Nama Materi</label>
      <input type="text" id="mTopikNama" value="${escapeHtml(d.nama||'')}" placeholder="Contoh: Qawaid Bilangan (Adad)"></div>
    <div class="field"><label>Deskripsi singkat</label>
      <textarea id="mTopikDeskripsi" placeholder="Contoh: Angka 1-100 dalam Bahasa Arab">${escapeHtml(d.deskripsi||'')}</textarea></div>
    <div class="field"><label>Urutan tampil (angka)</label>
      <input type="number" id="mTopikUrutan" value="${d.urutan ?? 1}"></div>
    <div class="field">
      <label><input type="checkbox" id="mTopikAktif" ${d.aktif!==false?'checked':''} style="width:auto;margin-right:8px;">Tampilkan ke siswa (aktif)</label>
    </div>
    <div id="mTopikBanner"></div>
    <div class="row">
      <button class="btn btn-solid" id="mTopikSimpan">Simpan</button>
      <button class="btn btn-outline" id="mCancel">Batal</button>
    </div>
  `);
  document.getElementById('mCancel').addEventListener('click', closeModal);
  document.getElementById('mTopikSimpan').addEventListener('click', simpanTopik);
}

async function simpanTopik(){
  const banner = document.getElementById('mTopikBanner');
  const nama = document.getElementById('mTopikNama').value.trim();
  if(!nama){ bannerErr(banner, 'Nama materi wajib diisi.'); return; }
  const payload = {
    kelas: document.getElementById('mTopikKelas').value,
    nama,
    deskripsi: document.getElementById('mTopikDeskripsi').value.trim(),
    urutan: Number(document.getElementById('mTopikUrutan').value) || 1,
    aktif: document.getElementById('mTopikAktif').checked
  };
  try{
    if(state.editTopikId){
      await db.collection('topik').doc(state.editTopikId).update(payload);
    } else {
      await db.collection('topik').add(payload);
    }
    closeModal();
    loadTopikAdmin();
    loadSelectTopikSoal();
  }catch(err){
    bannerErr(banner, 'Gagal menyimpan: ' + escapeHtml(err.message));
  }
}

async function hapusTopik(id, nama){
  if(!confirm(`Hapus materi "${nama}"? Soal yang terkait materi ini tidak ikut terhapus otomatis — hapus juga manual di tab Soal bila perlu.`)) return;
  try{
    await db.collection('topik').doc(id).delete();
    loadTopikAdmin();
    loadSelectTopikSoal();
  }catch(err){
    alert('Gagal menghapus: ' + err.message);
  }
}

/* ---- Admin: Soal ---- */
async function loadSelectTopikSoal(){
  const sel = document.getElementById('selectTopikSoal');
  try{
    const snap = await db.collection('topik').orderBy('kelas').orderBy('urutan').get();
    sel.innerHTML = '<option value="">— pilih materi —</option>';
    snap.forEach(doc => {
      const d = doc.data();
      const opt = document.createElement('option');
      opt.value = doc.id;
      opt.textContent = `Kelas ${d.kelas} · ${d.nama}`;
      sel.appendChild(opt);
    });
  }catch(err){
    sel.innerHTML = '<option>Gagal memuat</option>';
  }
}
document.getElementById('selectTopikSoal').addEventListener('change', (e) => {
  if(e.target.value) loadSoalAdmin(e.target.value);
  else document.getElementById('soalAdminList').innerHTML = '<div class="empty">Pilih materi dahulu.</div>';
});

async function loadSoalAdmin(topikId){
  const box = document.getElementById('soalAdminList');
  box.innerHTML = '<div class="loading">Memuat…</div>';
  try{
    const snap = await db.collection('soal').where('topikId','==',topikId).orderBy('urutan','asc').get();
    if(snap.empty){ box.innerHTML = '<div class="empty">Belum ada soal untuk materi ini.</div>'; return; }
    box.innerHTML = '';
    snap.forEach(doc => {
      const d = doc.data();
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <div class="list-item-head">
          <div>
            <h4>Soal #${d.urutan ?? '-'} <span class="badge badge-wait">${d.tipe === 'pilihan_ganda' ? 'Pilihan Ganda' : 'Esai'}</span></h4>
            <div class="meta">${escapeHtml(d.pertanyaan)}</div>
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
  if(!topikId){ alert('Pilih materi dahulu di dropdown atas.'); return; }
  openSoalModal(null, {}, topikId);
});

function openSoalModal(id, d, topikId){
  state.editSoalId = id;
  const tipe = d.tipe || 'pilihan_ganda';
  const p = d.pilihan || {};
  renderModal(`
    <h3>${id ? 'Edit' : 'Tambah'} Soal</h3>
    <div class="field"><label>Tipe Soal</label>
      <select id="mSoalTipe">
        <option value="pilihan_ganda" ${tipe==='pilihan_ganda'?'selected':''}>Pilihan Ganda</option>
        <option value="esai" ${tipe==='esai'?'selected':''}>Esai</option>
      </select>
    </div>
    <div class="field"><label>Pertanyaan</label>
      <textarea id="mSoalPertanyaan" placeholder="Tulis pertanyaan…">${escapeHtml(d.pertanyaan||'')}</textarea></div>
    <div id="mSoalOpsiWrap" class="${tipe==='pilihan_ganda'?'':'hidden'}">
      <div class="field"><label>Pilihan A</label><input type="text" id="mOpsiA" value="${escapeHtml(p.A||'')}"></div>
      <div class="field"><label>Pilihan B</label><input type="text" id="mOpsiB" value="${escapeHtml(p.B||'')}"></div>
      <div class="field"><label>Pilihan C</label><input type="text" id="mOpsiC" value="${escapeHtml(p.C||'')}"></div>
      <div class="field"><label>Pilihan D</label><input type="text" id="mOpsiD" value="${escapeHtml(p.D||'')}"></div>
      <div class="field"><label>Jawaban Benar (referensi guru saja, tidak auto-koreksi)</label>
        <select id="mJawabanBenar">
          <option value="">—</option>
          <option value="A" ${d.jawabanBenar==='A'?'selected':''}>A</option>
          <option value="B" ${d.jawabanBenar==='B'?'selected':''}>B</option>
          <option value="C" ${d.jawabanBenar==='C'?'selected':''}>C</option>
          <option value="D" ${d.jawabanBenar==='D'?'selected':''}>D</option>
        </select>
      </div>
    </div>
    <div class="field"><label>Urutan tampil (angka)</label>
      <input type="number" id="mSoalUrutan" value="${d.urutan ?? 1}"></div>
    <div id="mSoalBanner"></div>
    <div class="row">
      <button class="btn btn-solid" id="mSoalSimpan">Simpan</button>
      <button class="btn btn-outline" id="mCancel">Batal</button>
    </div>
  `);
  document.getElementById('mCancel').addEventListener('click', closeModal);
  document.getElementById('mSoalTipe').addEventListener('change', (e) => {
    document.getElementById('mSoalOpsiWrap').classList.toggle('hidden', e.target.value !== 'pilihan_ganda');
  });
  document.getElementById('mSoalSimpan').addEventListener('click', () => simpanSoal(topikId));
}

async function simpanSoal(topikId){
  const banner = document.getElementById('mSoalBanner');
  const pertanyaan = document.getElementById('mSoalPertanyaan').value.trim();
  if(!pertanyaan){ bannerErr(banner, 'Pertanyaan wajib diisi.'); return; }
  const tipe = document.getElementById('mSoalTipe').value;
  const payload = {
    topikId,
    tipe,
    pertanyaan,
    urutan: Number(document.getElementById('mSoalUrutan').value) || 1
  };
  if(tipe === 'pilihan_ganda'){
    payload.pilihan = {
      A: document.getElementById('mOpsiA').value.trim(),
      B: document.getElementById('mOpsiB').value.trim(),
      C: document.getElementById('mOpsiC').value.trim(),
      D: document.getElementById('mOpsiD').value.trim()
    };
    payload.jawabanBenar = document.getElementById('mJawabanBenar').value || null;
  } else {
    payload.pilihan = null;
    payload.jawabanBenar = null;
  }
  try{
    if(state.editSoalId){
      await db.collection('soal').doc(state.editSoalId).update(payload);
    } else {
      await db.collection('soal').add(payload);
    }
    closeModal();
    loadSoalAdmin(topikId);
  }catch(err){
    bannerErr(banner, 'Gagal menyimpan: ' + escapeHtml(err.message));
  }
}

async function hapusSoal(id, topikId){
  if(!confirm('Hapus soal ini?')) return;
  try{
    await db.collection('soal').doc(id).delete();
    loadSoalAdmin(topikId);
  }catch(err){
    alert('Gagal menghapus: ' + err.message);
  }
}

/* ---- Admin: Hasil Ujian ---- */
document.getElementById('filterStatusHasil').addEventListener('change', () => loadHasilAdmin());

async function loadHasilAdmin(){
  const box = document.getElementById('hasilAdminList');
  box.innerHTML = '<div class="loading">Memuat…</div>';
  const filter = document.getElementById('filterStatusHasil').value;
  try{
    const snap = await db.collection('hasil_ujian').orderBy('waktuSubmit','desc').get();
    let rows = [];
    snap.forEach(doc => rows.push({id:doc.id, ...doc.data()}));
    if(filter !== 'semua') rows = rows.filter(r => r.status === filter);
    if(!rows.length){ box.innerHTML = '<div class="empty">Belum ada data.</div>'; return; }

    let html = `<table><thead><tr>
      <th>Nama</th><th>Kelas</th><th>Materi</th><th>Waktu</th><th>Status</th><th>Nilai</th>
      </tr></thead><tbody>`;
    rows.forEach(r => {
      const waktu = r.waktuSubmit && r.waktuSubmit.toDate ? r.waktuSubmit.toDate().toLocaleString('id-ID') : '-';
      html += `<tr class="clickable" data-id="${r.id}">
        <td>${escapeHtml(r.namaSiswa)}</td>
        <td>${escapeHtml(r.kelas)}</td>
        <td>${escapeHtml(r.topikNama)}</td>
        <td>${waktu}</td>
        <td><span class="badge ${r.status==='sudah_dinilai'?'badge-done':'badge-wait'}">${r.status==='sudah_dinilai'?'Sudah Dinilai':'Belum Dinilai'}</span></td>
        <td>${r.nilai ?? '-'}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    box.innerHTML = html;
    box.querySelectorAll('tr.clickable').forEach(tr => {
      tr.addEventListener('click', () => bukaHasilDetail(tr.dataset.id, rows.find(r=>r.id===tr.dataset.id)));
    });
  }catch(err){
    box.innerHTML = `<div class="empty">Gagal memuat. ${escapeHtml(err.message)}</div>`;
  }
}

function bukaHasilDetail(id, r){
  state.hasilOpenId = id;
  let jawabanHtml = '';
  (r.jawaban||[]).forEach((j, i) => {
    jawabanHtml += `<div class="list-item">
      <div class="meta">Soal ${i+1} (${j.tipe==='pilihan_ganda'?'Pilihan Ganda':'Esai'})</div>
      <h4>${escapeHtml(j.pertanyaan)}</h4>
      <div><b>Jawaban:</b> ${escapeHtml(String(j.jawabanSiswa ?? '-'))}</div>
    </div>`;
  });
  renderModal(`
    <h3>Hasil: ${escapeHtml(r.namaSiswa)}</h3>
    <p class="hint">Kelas ${escapeHtml(r.kelas)} · ${escapeHtml(r.topikNama)}</p>
    <div style="max-height:280px;overflow:auto;margin-bottom:16px;">${jawabanHtml}</div>
    <div class="field"><label>Nilai</label>
      <input type="number" id="mNilai" min="0" max="100" value="${r.nilai ?? ''}"></div>
    <div class="field"><label>Catatan untuk siswa (opsional)</label>
      <textarea id="mCatatan">${escapeHtml(r.catatanGuru||'')}</textarea></div>
    <div id="mHasilBanner"></div>
    <div class="row">
      <button class="btn btn-solid" id="mSimpanNilai">Simpan Penilaian</button>
      <button class="btn btn-outline" id="mCancel">Tutup</button>
    </div>
  `);
  document.getElementById('mCancel').addEventListener('click', closeModal);
  document.getElementById('mSimpanNilai').addEventListener('click', simpanNilai);
}

async function simpanNilai(){
  const banner = document.getElementById('mHasilBanner');
  const nilai = document.getElementById('mNilai').value;
  const catatan = document.getElementById('mCatatan').value.trim();
  try{
    await db.collection('hasil_ujian').doc(state.hasilOpenId).update({
      nilai: nilai === '' ? null : Number(nilai),
      catatanGuru: catatan || null,
      status: 'sudah_dinilai'
    });
    closeModal();
    loadHasilAdmin();
  }catch(err){
    bannerErr(banner, 'Gagal menyimpan: ' + escapeHtml(err.message));
  }
}

/* ---- helpers ---- */
function renderModal(inner){
  document.getElementById('modalRoot').innerHTML = `
    <div class="modal-bg" id="modalBg">
      <div class="modal-box">${inner}</div>
    </div>`;
  document.getElementById('modalBg').addEventListener('click', (e) => {
    if(e.target.id === 'modalBg') closeModal();
  });
}
function closeModal(){ document.getElementById('modalRoot').innerHTML = ''; }

function escapeHtml(str){
  return String(str)
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');
}

if(CONFIG_BELUM_DIISI){
  document.getElementById('topikList').innerHTML =
    '<div class="empty">Konfigurasi Firebase belum diisi. Admin perlu mengisi <code>firebaseConfig</code> di ruang-ujian.html.</div>';
}
