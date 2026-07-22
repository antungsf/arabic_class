/* ============================================================
   ABSENSI & NILAI — logic
   Struktur Firestore:
   - kelas_absensi { nama, jenjang, urutan, aktif }
   - siswa         { kelasId, nama, jk:'L'|'P', urutan }
   - pertemuan     { kelasId, tanggal:'YYYY-MM-DD', materi,
                      kehadiran: { [siswaId]: 'H'|'S'|'I'|'A' } }
     doc id = `${kelasId}_${tanggal}` (upsert per kelas+tanggal)
   - nilai         { kelasId, siswaId, tp, nilai, tanggal }
     doc id = `${kelasId}_${siswaId}_${tp}` (upsert per siswa+tp)
   ============================================================ */

const TP_LIST = ['TP1','TP2','TP3','TP4','TP5','TP6','TP7','TP8'];
const state = {
  kelasPublik: null,
  editKelasId: null,
  adminKelasCache: [],
  siswaCacheByKelas: {},
  lastRekap: null,
  lastJurnal: null,
  editJurnalId: null,
  pengaturanGuru: { namaGuru: '', nipGuru: '' },
  pengaturanSekolah: { namaKamad: '', nipKamad: '', kota: '' }
};

function bannerOk(el, msg){ el.innerHTML = `<div class="banner banner-ok">${msg}</div>`; }
function bannerErr(el, msg){ el.innerHTML = `<div class="banner banner-error">${msg}</div>`; }
function escapeHtml(str){
  return String(str).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}

/* ---------------- PUBLIC ---------------- */
function showPublicView(id){
  document.querySelectorAll('#publicApp > div').forEach(el => el.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  window.scrollTo({top:0, behavior:'smooth'});
}

async function loadKelasPublik(){
  const box = document.getElementById('kelasPublikList');
  box.innerHTML = '<div class="loading">Memuat daftar kelas…</div>';
  try{
    const snap = await db.collection('kelas_absensi').where('aktif','==',true).orderBy('jenjang').orderBy('urutan').get();
    if(snap.empty){ box.innerHTML = '<div class="empty">Belum ada kelas terdaftar.</div>'; return; }
    box.innerHTML = '<div class="grid-cards" id="gridKelasPublik"></div>';
    const grid = document.getElementById('gridKelasPublik');
    snap.forEach(doc => {
      const d = doc.data();
      const c = document.createElement('div');
      c.className = 'card';
      c.innerHTML = `<p class="k">${escapeHtml(d.nama)}</p><p class="d">Kelas ${escapeHtml(d.jenjang)}</p>`;
      c.addEventListener('click', () => bukaRekapPublik(doc.id, d));
      grid.appendChild(c);
    });
  }catch(err){
    box.innerHTML = `<div class="empty">Gagal memuat. ${escapeHtml(err.message)}</div>`;
  }
}
document.getElementById('crumbKelasPublik').addEventListener('click', () => { showPublicView('viewKelasPublik'); loadKelasPublik(); });

async function bukaRekapPublik(kelasId, d){
  state.kelasPublik = {id:kelasId, ...d};
  document.getElementById('rekapEyebrow').textContent = 'Kelas ' + d.jenjang;
  document.getElementById('rekapTitle').textContent = d.nama;
  showPublicView('viewRekapPublik');
  await renderRekapPublikCari(kelasId, document.getElementById('rekapTable'));
}

async function renderRekapPublikCari(kelasId, box){
  box.innerHTML = '<div class="loading">Memuat data…</div>';
  try{
    const [siswaSnap, pertemuanSnap, nilaiSnap] = await Promise.all([
      db.collection('siswa').where('kelasId','==',kelasId).orderBy('urutan').get(),
      db.collection('pertemuan').where('kelasId','==',kelasId).get(),
      db.collection('nilai').where('kelasId','==',kelasId).get()
    ]);
    if(siswaSnap.empty){ box.innerHTML = '<div class="empty">Belum ada siswa terdaftar di kelas ini.</div>'; return; }

    const siswaList = [];
    siswaSnap.forEach(doc => siswaList.push({id:doc.id, ...doc.data()}));

    const rekapHadir = {};
    siswaList.forEach(s => rekapHadir[s.id] = {H:0,S:0,I:0,A:0});
    let jumlahPertemuan = 0;
    pertemuanSnap.forEach(doc => {
      jumlahPertemuan++;
      const keh = doc.data().kehadiran || {};
      siswaList.forEach(s => {
        const st = keh[s.id] || 'H';
        if(rekapHadir[s.id][st] !== undefined) rekapHadir[s.id][st]++;
      });
    });

    const nilaiMap = {};
    siswaList.forEach(s => nilaiMap[s.id] = {});
    nilaiSnap.forEach(doc => {
      const d2 = doc.data();
      if(!nilaiMap[d2.siswaId]) nilaiMap[d2.siswaId] = {};
      nilaiMap[d2.siswaId][d2.tp] = d2.nilai;
    });

    box.innerHTML = `
      <p class="hint" style="margin-bottom:10px;">Untuk menjaga privasi, ketik namamu untuk melihat rekap kehadiran &amp; nilai milikmu sendiri.</p>
      <div class="field" style="max-width:360px;"><label>Cari Nama Kamu</label><input type="text" id="cariNamaSiswa" placeholder="Ketik minimal 2 huruf…" autocomplete="off"></div>
      <div id="hasilCariSiswa"></div>
      <div id="hasilDataSiswa" style="margin-top:16px;"></div>`;

    const inputCari = document.getElementById('cariNamaSiswa');
    const hasilCari = document.getElementById('hasilCariSiswa');
    const hasilData = document.getElementById('hasilDataSiswa');

    inputCari.addEventListener('input', () => {
      const q = inputCari.value.trim().toLowerCase();
      hasilData.innerHTML = '';
      if(q.length < 2){ hasilCari.innerHTML = ''; return; }
      const cocok = siswaList.filter(s => s.nama.toLowerCase().includes(q)).slice(0,6);
      if(!cocok.length){ hasilCari.innerHTML = '<div class="empty">Nama tidak ditemukan.</div>'; return; }
      hasilCari.innerHTML = cocok.map(s => `<div class="list-item" data-id="${s.id}" style="cursor:pointer;padding:10px 14px;">${escapeHtml(s.nama)}</div>`).join('');
      hasilCari.querySelectorAll('[data-id]').forEach(el => {
        el.addEventListener('click', () => {
          const s = siswaList.find(x => x.id === el.dataset.id);
          tampilkanDataSendiri(s, rekapHadir[s.id], nilaiMap[s.id]||{}, jumlahPertemuan, hasilData);
          hasilCari.innerHTML = '';
          inputCari.value = s.nama;
        });
      });
    });

    function tampilkanDataSendiri(s, r, nilaiSiswa, jumlahPertemuan, target){
      const pct = jumlahPertemuan ? Math.round((r.H/jumlahPertemuan)*100) : 0;
      let total=0, count=0;
      let tpHtml = '';
      TP_LIST.forEach(tp => {
        const v = nilaiSiswa[tp];
        tpHtml += `<div class="list-item" style="text-align:center;padding:10px 4px;margin:0;"><div class="hint" style="margin:0;">${tp}</div><b>${v!==undefined && v!==null ? v : '-'}</b></div>`;
        if(v!==undefined && v!==null){ total+=Number(v); count++; }
      });
      const rataRata = count ? Math.round(total/count) : '-';
      target.innerHTML = `
        <div class="list-item">
          <h4 style="font-size:16px;">${escapeHtml(s.nama)}</h4>
          <div class="row" style="margin:10px 0;">
            <div class="list-item" style="margin:0;padding:10px 14px;"><div class="hint" style="margin:0;">Hadir</div><b>${r.H}/${jumlahPertemuan}</b></div>
            <div class="list-item" style="margin:0;padding:10px 14px;"><div class="hint" style="margin:0;">% Hadir</div><b>${pct}%</b></div>
            <div class="list-item" style="margin:0;padding:10px 14px;"><div class="hint" style="margin:0;">S</div><b>${r.S}</b></div>
            <div class="list-item" style="margin:0;padding:10px 14px;"><div class="hint" style="margin:0;">I</div><b>${r.I}</b></div>
            <div class="list-item" style="margin:0;padding:10px 14px;"><div class="hint" style="margin:0;">A</div><b>${r.A}</b></div>
          </div>
          <div class="hint" style="margin-bottom:6px;">Nilai Asesmen Formatif</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">${tpHtml}</div>
          <div class="list-item" style="margin-top:10px;padding:10px 14px;background:var(--bg-alt);"><div class="hint" style="margin:0;">Rata-rata</div><b style="font-size:18px;">${rataRata}</b></div>
        </div>`;
    }
  }catch(err){
    box.innerHTML = `<div class="empty">Gagal memuat. ${escapeHtml(err.message)}</div>`;
  }
}

async function renderRekap(kelasId, box, isAdmin){
  box.innerHTML = '<div class="loading">Memuat data…</div>';
  try{
    const [siswaSnap, pertemuanSnap, nilaiSnap] = await Promise.all([
      db.collection('siswa').where('kelasId','==',kelasId).orderBy('urutan').get(),
      db.collection('pertemuan').where('kelasId','==',kelasId).get(),
      db.collection('nilai').where('kelasId','==',kelasId).get()
    ]);
    if(siswaSnap.empty){ box.innerHTML = '<div class="empty">Belum ada siswa terdaftar di kelas ini.</div>'; return; }

    const siswaList = [];
    siswaSnap.forEach(doc => siswaList.push({id:doc.id, ...doc.data()}));

    const rekapHadir = {}; // siswaId -> {H,S,I,A}
    siswaList.forEach(s => rekapHadir[s.id] = {H:0,S:0,I:0,A:0});
    let jumlahPertemuan = 0;
    pertemuanSnap.forEach(doc => {
      jumlahPertemuan++;
      const d = doc.data();
      const keh = d.kehadiran || {};
      siswaList.forEach(s => {
        const st = keh[s.id] || 'H';
        if(rekapHadir[s.id][st] !== undefined) rekapHadir[s.id][st]++;
      });
    });

    const nilaiMap = {}; // siswaId -> {tp: nilai}
    siswaList.forEach(s => nilaiMap[s.id] = {});
    nilaiSnap.forEach(doc => {
      const d = doc.data();
      if(!nilaiMap[d.siswaId]) nilaiMap[d.siswaId] = {};
      nilaiMap[d.siswaId][d.tp] = d.nilai;
    });

    let html = `<div class="hint" style="margin-bottom:10px;">Jumlah pertemuan tercatat: ${jumlahPertemuan}</div>`;
    html += '<div class="table-scroll"><table><thead><tr><th>No</th><th>Nama</th><th>Hadir</th><th>S</th><th>I</th><th>A</th><th>% Hadir</th>';
    TP_LIST.forEach(tp => html += `<th>${tp}</th>`);
    html += '<th>Rata-rata</th></tr></thead><tbody>';

    siswaList.forEach((s,i) => {
      const r = rekapHadir[s.id];
      const pct = jumlahPertemuan ? Math.round((r.H/jumlahPertemuan)*100) : 0;
      html += `<tr><td>${i+1}</td><td>${escapeHtml(s.nama)}</td><td>${r.H}</td><td>${r.S}</td><td>${r.I}</td><td>${r.A}</td><td>${pct}%</td>`;
      const nilaiSiswa = nilaiMap[s.id] || {};
      let total=0, count=0;
      TP_LIST.forEach(tp => {
        const v = nilaiSiswa[tp];
        html += `<td>${v!==undefined && v!==null ? v : '-'}</td>`;
        if(v!==undefined && v!==null){ total+=Number(v); count++; }
      });
      html += `<td><b>${count ? Math.round(total/count) : '-'}</b></td>`;
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    box.innerHTML = html;

    if(isAdmin){
      const kelasInfo = state.adminKelasCache.find(k => k.id === kelasId) || {nama:'kelas'};
      state.lastRekap = { kelasNama: kelasInfo.nama, siswaList, rekapHadir, jumlahPertemuan, nilaiMap };
      const btnDownload = document.getElementById('btnDownloadRekap');
      if(btnDownload) btnDownload.disabled = false;
    }
  }catch(err){
    box.innerHTML = `<div class="empty">Gagal memuat rekap. ${escapeHtml(err.message)}</div>`;
  }
}

function downloadRekapCSV(){
  const r = state.lastRekap;
  if(!r) return;
  const header = ['No','Nama','Hadir','S','I','A','% Hadir', ...TP_LIST, 'Rata-rata'];
  const rows = [header];
  r.siswaList.forEach((s,i) => {
    const rh = r.rekapHadir[s.id];
    const pct = r.jumlahPertemuan ? Math.round((rh.H/r.jumlahPertemuan)*100) : 0;
    const nilaiSiswa = r.nilaiMap[s.id] || {};
    let total=0, count=0;
    const nilaiCols = TP_LIST.map(tp => {
      const v = nilaiSiswa[tp];
      if(v!==undefined && v!==null){ total+=Number(v); count++; return v; }
      return '';
    });
    const rataRata = count ? Math.round(total/count) : '';
    rows.push([i+1, s.nama, rh.H, rh.S, rh.I, rh.A, pct, ...nilaiCols, rataRata]);
  });

  const namaFile = `rekap-${r.kelasNama.replace(/\s+/g,'_')}.xlsx`;

  if(typeof XLSX === 'undefined'){
    // fallback ke CSV kalau library Excel gagal dimuat (mis. tidak ada koneksi internet)
    const csv = rows.map(row => row.map(cell => {
      const val = String(cell ?? '');
      return /[;"\n]/.test(val) ? '"' + val.replaceAll('"','""') + '"' : val;
    }).join(';')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = namaFile.replace('.xlsx','.csv');
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    {wch:4}, {wch:30}, {wch:7}, {wch:5}, {wch:5}, {wch:5}, {wch:9},
    ...TP_LIST.map(()=>({wch:6})), {wch:10}
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, r.kelasNama.substring(0,31) || 'Rekap');
  XLSX.writeFile(wb, namaFile);
}
document.getElementById('btnDownloadRekap').addEventListener('click', downloadRekapCSV);

/* ---------------- ADMIN: shell ---------------- */
document.getElementById('btnShowAdmin').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('publicApp').classList.add('hidden');
  document.getElementById('adminApp').classList.remove('hidden');
});
function backToPublic(){
  document.getElementById('adminApp').classList.add('hidden');
  document.getElementById('publicApp').classList.remove('hidden');
  showPublicView('viewKelasPublik');
  loadKelasPublik();
}
document.getElementById('crumbAdminBack').addEventListener('click', backToPublic);
document.getElementById('crumbAdminBack2').addEventListener('click', backToPublic);

auth.onAuthStateChanged(user => {
  if(user){
    document.getElementById('viewLogin').classList.add('hidden');
    document.getElementById('viewDashboard').classList.remove('hidden');
    document.getElementById('adminWhoami').textContent = user.email;
    loadKelasAdmin();
    loadKelasSelects();
    kosongkanFormJurnal();
    muatPengaturan(user.uid);
  } else {
    document.getElementById('viewLogin').classList.remove('hidden');
    document.getElementById('viewDashboard').classList.add('hidden');
  }
});

document.getElementById('btnLogin').addEventListener('click', async () => {
  const email = document.getElementById('adminEmail').value.trim();
  const pass = document.getElementById('adminPassword').value;
  const banner = document.getElementById('loginBanner');
  if(CONFIG_BELUM_DIISI){ bannerErr(banner, 'Konfigurasi Firebase belum diisi di absensi.html.'); return; }
  try{ await auth.signInWithEmailAndPassword(email, pass); }
  catch(err){ bannerErr(banner, 'Login gagal: ' + escapeHtml(err.message)); }
});
document.getElementById('btnLogout').addEventListener('click', () => auth.signOut());

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ['kelas','absen','nilai','rekap','jurnal','pengaturan'].forEach(t => {
      document.getElementById('tab'+capitalize(t)).classList.toggle('hidden', t !== btn.dataset.tab);
    });
    if(btn.dataset.tab === 'jurnal') loadJurnalBulan();
  });
});
function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

/* ---------------- ADMIN: Kelas & Siswa ---------------- */
async function loadKelasAdmin(){
  const box = document.getElementById('kelasAdminList');
  box.innerHTML = '<div class="loading">Memuat…</div>';
  try{
    const snap = await db.collection('kelas_absensi').orderBy('jenjang').orderBy('urutan').get();
    state.adminKelasCache = [];
    if(snap.empty){ box.innerHTML = '<div class="empty">Belum ada kelas. Klik "+ Tambah Kelas".</div>'; return; }
    box.innerHTML = '';
    snap.forEach(doc => {
      const d = doc.data();
      state.adminKelasCache.push({id:doc.id, ...d});
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <div class="list-item-head">
          <div>
            <h4>${escapeHtml(d.nama)} <span class="badge ${d.aktif?'badge-h':'badge-a'}">${d.aktif?'Aktif':'Nonaktif'}</span></h4>
            <div class="meta">Jenjang ${escapeHtml(d.jenjang)} · urutan ${d.urutan ?? '-'}</div>
          </div>
          <div>
            <button class="icon-btn" data-act="siswa">Kelola Siswa</button>
            <button class="icon-btn" data-act="edit">Edit</button>
            <button class="icon-btn danger" data-act="hapus">Hapus</button>
          </div>
        </div>`;
      item.querySelector('[data-act="edit"]').addEventListener('click', () => openKelasModal(doc.id, d));
      item.querySelector('[data-act="hapus"]').addEventListener('click', () => hapusKelas(doc.id, d.nama));
      item.querySelector('[data-act="siswa"]').addEventListener('click', () => openSiswaModal(doc.id, d));
      box.appendChild(item);
    });
  }catch(err){
    box.innerHTML = `<div class="empty">Gagal memuat. ${escapeHtml(err.message)}</div>`;
  }
}

document.getElementById('btnTambahKelas').addEventListener('click', () => openKelasModal(null, {}));
document.getElementById('btnUrutkanKelas').addEventListener('click', urutkanKelasAZ);

async function urutkanKelasAZ(){
  const btn = document.getElementById('btnUrutkanKelas');
  btn.disabled = true; btn.textContent = 'Mengurutkan…';
  try{
    const snap = await db.collection('kelas_absensi').get();
    const list = [];
    snap.forEach(doc => list.push({id:doc.id, ...doc.data()}));
    // urutkan alfabetis dalam masing-masing jenjang (X, XI, XII)
    const jenjangOrder = {X:1, XI:2, XII:3};
    list.sort((a,b) => {
      const ja = jenjangOrder[a.jenjang] || 9;
      const jb = jenjangOrder[b.jenjang] || 9;
      if(ja !== jb) return ja - jb;
      return a.nama.localeCompare(b.nama, 'id', {numeric:true, sensitivity:'base'});
    });
    const batch = db.batch();
    let counter = {};
    list.forEach(k => {
      counter[k.jenjang] = (counter[k.jenjang] || 0) + 1;
      batch.update(db.collection('kelas_absensi').doc(k.id), { urutan: counter[k.jenjang] });
    });
    await batch.commit();
    loadKelasAdmin();
    loadKelasSelects();
  }catch(err){
    alert('Gagal mengurutkan: ' + err.message);
  }finally{
    btn.disabled = false; btn.textContent = 'Urutkan A-Z';
  }
}

function openKelasModal(id, d){
  state.editKelasId = id;
  renderModal(`
    <h3>${id ? 'Edit' : 'Tambah'} Kelas</h3>
    <div class="field"><label>Nama Kelas</label>
      <input type="text" id="mKelasNama" value="${escapeHtml(d.nama||'')}" placeholder="Contoh: XII A 1.1"></div>
    <div class="field"><label>Jenjang</label>
      <select id="mKelasJenjang">
        <option value="X" ${d.jenjang==='X'?'selected':''}>X</option>
        <option value="XI" ${d.jenjang==='XI'?'selected':''}>XI</option>
        <option value="XII" ${d.jenjang==='XII'?'selected':''}>XII</option>
      </select></div>
    <div class="field"><label>Urutan tampil</label>
      <input type="number" id="mKelasUrutan" value="${d.urutan ?? 1}"></div>
    <div class="field"><label><input type="checkbox" id="mKelasAktif" ${d.aktif!==false?'checked':''} style="width:auto;margin-right:8px;">Tampilkan ke publik (aktif)</label></div>
    <div id="mKelasBanner"></div>
    <div class="row">
      <button class="btn btn-solid" id="mKelasSimpan">Simpan</button>
      <button class="btn btn-outline" id="mCancel">Batal</button>
    </div>`);
  document.getElementById('mCancel').addEventListener('click', closeModal);
  document.getElementById('mKelasSimpan').addEventListener('click', simpanKelas);
}

async function simpanKelas(){
  const banner = document.getElementById('mKelasBanner');
  const nama = document.getElementById('mKelasNama').value.trim();
  if(!nama){ bannerErr(banner, 'Nama kelas wajib diisi.'); return; }
  const payload = {
    nama,
    jenjang: document.getElementById('mKelasJenjang').value,
    urutan: Number(document.getElementById('mKelasUrutan').value) || 1,
    aktif: document.getElementById('mKelasAktif').checked
  };
  try{
    if(state.editKelasId) await db.collection('kelas_absensi').doc(state.editKelasId).update(payload);
    else await db.collection('kelas_absensi').add(payload);
    closeModal(); loadKelasAdmin(); loadKelasSelects();
  }catch(err){ bannerErr(banner, 'Gagal menyimpan: ' + escapeHtml(err.message)); }
}

async function hapusKelas(id, nama){
  if(!confirm(`Hapus kelas "${nama}"? Data siswa/absensi/nilai terkait tidak otomatis ikut terhapus.`)) return;
  try{ await db.collection('kelas_absensi').doc(id).delete(); loadKelasAdmin(); loadKelasSelects(); }
  catch(err){ alert('Gagal menghapus: ' + err.message); }
}

function openSiswaModal(kelasId, kelasData){
  renderModal(`
    <h3>Kelola Siswa — ${escapeHtml(kelasData.nama)}</h3>
    <div class="row" style="margin-bottom:10px;">
      <button class="btn btn-outline btn-sm" id="mBersihkanData">Bersihkan Data Siswa</button>
    </div>
    <div id="mBersihBanner"></div>
    <div id="siswaListWrap"><div class="loading">Memuat…</div></div>
    <hr style="border:none;border-top:1px solid var(--line);margin:18px 0;">
    <p class="hint">Tambah cepat: paste langsung dari Excel (kolom Nama + L/P), atau tulis 1 nama per baris (opsional akhiri dengan koma L/P, contoh: <i>Ahmad Fauzan, L</i>).</p>
    <div class="field"><textarea id="mSiswaBulk" placeholder="Ahmad Fauzan, L
Siti Aisyah, P"></textarea></div>
    <div id="mSiswaBanner"></div>
    <div class="row">
      <button class="btn btn-gold btn-sm" id="mSiswaTambahBulk">+ Tambahkan Daftar Ini</button>
      <button class="btn btn-outline btn-sm" id="mCancel">Tutup</button>
    </div>`);
  document.getElementById('mCancel').addEventListener('click', closeModal);
  document.getElementById('mSiswaTambahBulk').addEventListener('click', () => tambahSiswaBulk(kelasId));
  document.getElementById('mBersihkanData').addEventListener('click', () => bersihkanDataSiswa(kelasId));
  loadSiswaList(kelasId);
}

async function bersihkanDataSiswa(kelasId){
  const banner = document.getElementById('mBersihBanner');
  const btn = document.getElementById('mBersihkanData');
  btn.disabled = true; btn.textContent = 'Membersihkan…';
  try{
    const snap = await db.collection('siswa').where('kelasId','==',kelasId).get();
    const batch = db.batch();
    let jumlahDiperbaiki = 0;
    const namaBersih = [];
    snap.forEach(doc => {
      const d = doc.data();
      let nama = d.nama || '';
      let jk = d.jk || '';
      let berubah = false;
      // pisahkan tab/spasi ganda + L/P yang nempel di akhir nama
      const match = nama.match(/^(.*?)[\t]+([LP])$/) || nama.match(/^(.*?)\s+([LP])$/);
      if(match && (!jk || jk==='')){
        nama = match[1].trim();
        jk = match[2];
        berubah = true;
      } else if(nama.includes('\t')){
        nama = nama.replace(/\t+/g,' ').trim();
        berubah = true;
      }
      if(berubah){
        jumlahDiperbaiki++;
        batch.update(db.collection('siswa').doc(doc.id), { nama, jk });
      }
      namaBersih.push(nama.toUpperCase());
    });
    if(jumlahDiperbaiki > 0) await batch.commit();

    // deteksi duplikat (nama sama persis setelah dibersihkan)
    const hitung = {};
    namaBersih.forEach(n => { hitung[n] = (hitung[n]||0)+1; });
    const duplikat = Object.keys(hitung).filter(n => hitung[n] > 1);

    let msg = `${jumlahDiperbaiki} nama diperbaiki (tab dihapus, L/P dipisahkan).`;
    if(duplikat.length){
      msg += ` <br><b>Ditemukan nama duplikat, cek manual:</b> ${duplikat.map(escapeHtml).join(', ')}`;
    }
    bannerOk(banner, msg);
    loadSiswaList(kelasId);
  }catch(err){
    bannerErr(banner, 'Gagal membersihkan: ' + escapeHtml(err.message));
  }finally{
    btn.disabled = false; btn.textContent = 'Bersihkan Data Siswa';
  }
}

async function loadSiswaList(kelasId){
  const wrap = document.getElementById('siswaListWrap');
  try{
    const snap = await db.collection('siswa').where('kelasId','==',kelasId).orderBy('urutan').get();
    if(snap.empty){ wrap.innerHTML = '<div class="empty">Belum ada siswa.</div>'; return; }
    let html = '';
    snap.forEach(doc => {
      const d = doc.data();
      html += `<div class="list-item" style="padding:10px 14px;">
        <div class="list-item-head">
          <div style="font-size:13.5px;"><b>${escapeHtml(d.nama)}</b> <span class="hint">(${escapeHtml(d.jk||'-')})</span></div>
          <div>
            <button class="icon-btn" data-act="edit" data-id="${doc.id}" data-nama="${escapeHtml(d.nama)}" data-jk="${escapeHtml(d.jk||'')}">Edit</button>
            <button class="icon-btn danger" data-act="hapus" data-id="${doc.id}">Hapus</button>
          </div>
        </div></div>`;
    });
    wrap.innerHTML = html;
    wrap.querySelectorAll('[data-act="hapus"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if(!confirm('Hapus siswa ini?')) return;
        await db.collection('siswa').doc(btn.dataset.id).delete();
        loadSiswaList(kelasId);
      });
    });
    wrap.querySelectorAll('[data-act="edit"]').forEach(btn => {
      btn.addEventListener('click', () => openEditSiswaMini(btn.dataset.id, btn.dataset.nama, btn.dataset.jk, kelasId));
    });
  }catch(err){
    wrap.innerHTML = `<div class="empty">Gagal memuat. ${escapeHtml(err.message)}</div>`;
  }
}

function openEditSiswaMini(siswaId, nama, jk, kelasId){
  const wrap = document.getElementById('siswaListWrap');
  const editBox = document.createElement('div');
  editBox.className = 'list-item';
  editBox.style.background = 'var(--bg-alt)';
  editBox.innerHTML = `
    <div class="field" style="margin-bottom:8px;"><label>Nama</label><input type="text" id="editSiswaNama" value="${escapeHtml(nama)}"></div>
    <div class="field" style="margin-bottom:8px;max-width:140px;"><label>L/P</label>
      <select id="editSiswaJk">
        <option value="" ${jk===''?'selected':''}>-</option>
        <option value="L" ${jk==='L'?'selected':''}>L</option>
        <option value="P" ${jk==='P'?'selected':''}>P</option>
      </select></div>
    <div class="row">
      <button class="btn btn-solid btn-sm" id="btnSimpanEditSiswa">Simpan</button>
      <button class="btn btn-outline btn-sm" id="btnBatalEditSiswa">Batal</button>
    </div>`;
  wrap.prepend(editBox);
  document.getElementById('btnBatalEditSiswa').addEventListener('click', () => loadSiswaList(kelasId));
  document.getElementById('btnSimpanEditSiswa').addEventListener('click', async () => {
    const namaBaru = document.getElementById('editSiswaNama').value.trim();
    const jkBaru = document.getElementById('editSiswaJk').value;
    if(!namaBaru) return;
    await db.collection('siswa').doc(siswaId).update({ nama: namaBaru, jk: jkBaru });
    loadSiswaList(kelasId);
  });
}

async function tambahSiswaBulk(kelasId){
  const banner = document.getElementById('mSiswaBanner');
  const raw = document.getElementById('mSiswaBulk').value.trim();
  if(!raw){ bannerErr(banner, 'Tulis minimal 1 nama.'); return; }
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  try{
    const existingSnap = await db.collection('siswa').where('kelasId','==',kelasId).get();
    let urutan = existingSnap.size + 1;
    const batch = db.batch();
    lines.forEach(line => {
      // dukung paste dari Excel (pemisah TAB) maupun ketik manual (pemisah koma)
      const parts = line.includes('\t') ? line.split('\t') : line.split(',');
      const nama = parts[0].trim();
      const jk = (parts[1]||'').trim().toUpperCase();
      const ref = db.collection('siswa').doc();
      batch.set(ref, { kelasId, nama, jk: (jk==='L'||jk==='P') ? jk : '', urutan: urutan++ });
    });
    await batch.commit();
    document.getElementById('mSiswaBulk').value = '';
    bannerOk(banner, `${lines.length} siswa ditambahkan.`);
    loadSiswaList(kelasId);
  }catch(err){
    bannerErr(banner, 'Gagal menambahkan: ' + escapeHtml(err.message));
  }
}

/* ---------------- ADMIN: shared kelas selects ---------------- */
async function loadKelasSelects(){
  try{
    const snap = await db.collection('kelas_absensi').orderBy('jenjang').orderBy('urutan').get();
    const optsBody = [];
    snap.forEach(doc => {
      const d = doc.data();
      optsBody.push(`<option value="${doc.id}">${escapeHtml(d.jenjang)} · ${escapeHtml(d.nama)}</option>`);
    });
    ['selectKelasAbsen','selectKelasNilai','selectKelasRekap'].forEach(id => {
      document.getElementById(id).innerHTML = '<option value="">— pilih kelas —</option>' + optsBody.join('');
    });
    const jSel = document.getElementById('jKelasSumber');
    if(jSel) jSel.innerHTML = '<option value="">— tanpa data absensi —</option>' + optsBody.join('');
  }catch(err){ /* silent */ }
}

/* ---------------- ADMIN: Ambil Absensi ---------------- */
document.getElementById('tanggalAbsen').valueAsDate = new Date();
document.getElementById('btnMuatAbsen').addEventListener('click', muatAbsen);

async function muatAbsen(){
  const kelasId = document.getElementById('selectKelasAbsen').value;
  const tanggal = document.getElementById('tanggalAbsen').value;
  const box = document.getElementById('absenForm');
  const banner = document.getElementById('absenBanner');
  banner.innerHTML = '';
  if(!kelasId || !tanggal){ alert('Pilih kelas dan tanggal dahulu.'); return; }
  box.innerHTML = '<div class="loading">Memuat…</div>';
  try{
    const siswaSnap = await db.collection('siswa').where('kelasId','==',kelasId).orderBy('urutan').get();
    if(siswaSnap.empty){ box.innerHTML = '<div class="empty">Belum ada siswa di kelas ini. Tambahkan lewat tab "Kelas & Siswa".</div>'; return; }
    const pertemuanId = `${kelasId}_${tanggal}`;
    const pertemuanDoc = await db.collection('pertemuan').doc(pertemuanId).get();
    const existing = pertemuanDoc.exists ? pertemuanDoc.data() : {kehadiran:{}, materi:''};

    let html = `<div class="field"><label>Materi/Kegiatan (opsional)</label><input type="text" id="fMateri" value="${escapeHtml(existing.materi||'')}" placeholder="Contoh: Qawaid Bilangan (Adad)"></div>`;
    siswaSnap.forEach(doc => {
      const d = doc.data();
      const st = (existing.kehadiran && existing.kehadiran[doc.id]) || 'H';
      html += `<div class="attend-row" data-siswa="${doc.id}">
        <span class="nm">${escapeHtml(d.nama)}</span>
        <div class="seg">
          <button data-v="H" class="${st==='H'?'active':''}">H</button>
          <button data-v="S" class="${st==='S'?'active':''}">S</button>
          <button data-v="I" class="${st==='I'?'active':''}">I</button>
          <button data-v="A" class="${st==='A'?'active':''}">A</button>
        </div>
      </div>`;
    });
    html += `<button class="btn btn-solid" id="btnSimpanAbsen" style="margin-top:14px;">Simpan Absensi</button>`;
    box.innerHTML = html;

    box.querySelectorAll('.attend-row').forEach(row => {
      row.querySelectorAll('.seg button').forEach(btn => {
        btn.addEventListener('click', () => {
          row.querySelectorAll('.seg button').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });
    });
    document.getElementById('btnSimpanAbsen').addEventListener('click', () => simpanAbsen(kelasId, tanggal, pertemuanId));
  }catch(err){
    box.innerHTML = `<div class="empty">Gagal memuat. ${escapeHtml(err.message)}</div>`;
  }
}

async function simpanAbsen(kelasId, tanggal, pertemuanId){
  const banner = document.getElementById('absenBanner');
  const materi = document.getElementById('fMateri').value.trim();
  const kehadiran = {};
  document.querySelectorAll('#absenForm .attend-row').forEach(row => {
    const siswaId = row.dataset.siswa;
    const active = row.querySelector('.seg button.active');
    kehadiran[siswaId] = active ? active.dataset.v : 'H';
  });
  try{
    await db.collection('pertemuan').doc(pertemuanId).set({ kelasId, tanggal, materi, kehadiran }, {merge:true});
    bannerOk(banner, 'Absensi tersimpan.');
  }catch(err){
    bannerErr(banner, 'Gagal menyimpan: ' + escapeHtml(err.message));
  }
}

/* ---------------- ADMIN: Input Nilai ---------------- */
document.getElementById('btnMuatNilai').addEventListener('click', muatNilai);

async function muatNilai(){
  const kelasId = document.getElementById('selectKelasNilai').value;
  const tp = document.getElementById('selectTP').value;
  const box = document.getElementById('nilaiForm');
  const banner = document.getElementById('nilaiBanner');
  banner.innerHTML = '';
  if(!kelasId){ alert('Pilih kelas dahulu.'); return; }
  box.innerHTML = '<div class="loading">Memuat…</div>';
  try{
    const siswaSnap = await db.collection('siswa').where('kelasId','==',kelasId).orderBy('urutan').get();
    if(siswaSnap.empty){ box.innerHTML = '<div class="empty">Belum ada siswa di kelas ini.</div>'; return; }
    const nilaiSnap = await db.collection('nilai').where('kelasId','==',kelasId).where('tp','==',tp).get();
    const nilaiMap = {};
    nilaiSnap.forEach(doc => { nilaiMap[doc.data().siswaId] = doc.data().nilai; });

    let html = '';
    siswaSnap.forEach(doc => {
      const d = doc.data();
      const v = nilaiMap[doc.id];
      html += `<div class="attend-row" data-siswa="${doc.id}">
        <span class="nm">${escapeHtml(d.nama)}</span>
        <input type="number" min="0" max="100" style="width:90px;padding:8px 10px;border:1.5px solid var(--line);border-radius:6px;" value="${v!==undefined?v:''}" placeholder="0-100">
      </div>`;
    });
    html += `<button class="btn btn-solid" id="btnSimpanNilai" style="margin-top:14px;">Simpan Nilai ${tp}</button>`;
    box.innerHTML = html;
    document.getElementById('btnSimpanNilai').addEventListener('click', () => simpanNilaiBulk(kelasId, tp));
  }catch(err){
    box.innerHTML = `<div class="empty">Gagal memuat. ${escapeHtml(err.message)}</div>`;
  }
}

async function simpanNilaiBulk(kelasId, tp){
  const banner = document.getElementById('nilaiBanner');
  const rows = document.querySelectorAll('#nilaiForm .attend-row');
  try{
    const batch = db.batch();
    const tanggal = new Date().toISOString().slice(0,10);
    rows.forEach(row => {
      const siswaId = row.dataset.siswa;
      const input = row.querySelector('input');
      const val = input.value.trim();
      if(val === '') return;
      const ref = db.collection('nilai').doc(`${kelasId}_${siswaId}_${tp}`);
      batch.set(ref, { kelasId, siswaId, tp, nilai: Number(val), tanggal });
    });
    await batch.commit();
    bannerOk(banner, `Nilai ${tp} tersimpan.`);
  }catch(err){
    bannerErr(banner, 'Gagal menyimpan: ' + escapeHtml(err.message));
  }
}

/* ---------------- ADMIN: Rekap ---------------- */
document.getElementById('selectKelasRekap').addEventListener('change', (e) => {
  const box = document.getElementById('rekapAdminTable');
  if(e.target.value){
    renderRekap(e.target.value, box, true);
  } else {
    box.innerHTML = '<div class="empty">Pilih kelas untuk melihat rekap.</div>';
    state.lastRekap = null;
    document.getElementById('btnDownloadRekap').disabled = true;
  }
});

/* ---------------- ADMIN: Pengaturan (Nama & NIP Guru + Kepala Madrasah) ---------------- */
async function muatPengaturan(uid){
  try{
    const guruDoc = await db.collection('pengaturan_guru').doc(uid).get();
    if(guruDoc.exists){
      state.pengaturanGuru = guruDoc.data();
    } else {
      // default awal (kompatibel dengan data yang sudah ada sebelumnya)
      state.pengaturanGuru = { namaGuru: 'Antung Sobri Fattah, S.Ag.', nipGuru: 'NIP. 197402222003121002' };
    }
    document.getElementById('pgNamaGuru').value = state.pengaturanGuru.namaGuru || '';
    document.getElementById('pgNipGuru').value = state.pengaturanGuru.nipGuru || '';

    const sekolahDoc = await db.collection('pengaturan_sekolah').doc('default').get();
    if(sekolahDoc.exists){
      state.pengaturanSekolah = sekolahDoc.data();
    } else {
      state.pengaturanSekolah = { namaKamad: 'Roihanun, S.Pd., M.Pd.', nipKamad: 'NIP. 196812011992032001', kota: 'Balikpapan' };
    }
    document.getElementById('pgNamaKamad').value = state.pengaturanSekolah.namaKamad || '';
    document.getElementById('pgNipKamad').value = state.pengaturanSekolah.nipKamad || '';
    document.getElementById('pgKota').value = state.pengaturanSekolah.kota || '';
  }catch(err){ /* biarkan default kalau gagal muat */ }
}

document.getElementById('btnSimpanPengaturanGuru').addEventListener('click', async () => {
  const banner = document.getElementById('pgGuruBanner');
  const namaGuru = document.getElementById('pgNamaGuru').value.trim();
  const nipGuru = document.getElementById('pgNipGuru').value.trim();
  if(!namaGuru){ bannerErr(banner, 'Nama guru wajib diisi.'); return; }
  try{
    const uid = auth.currentUser.uid;
    await db.collection('pengaturan_guru').doc(uid).set({ namaGuru, nipGuru }, {merge:true});
    state.pengaturanGuru = { namaGuru, nipGuru };
    bannerOk(banner, 'Data guru tersimpan.');
  }catch(err){
    bannerErr(banner, 'Gagal menyimpan: ' + escapeHtml(err.message));
  }
});

document.getElementById('btnSimpanPengaturanSekolah').addEventListener('click', async () => {
  const banner = document.getElementById('pgSekolahBanner');
  const namaKamad = document.getElementById('pgNamaKamad').value.trim();
  const nipKamad = document.getElementById('pgNipKamad').value.trim();
  const kota = document.getElementById('pgKota').value.trim();
  if(!namaKamad){ bannerErr(banner, 'Nama Kepala Madrasah wajib diisi.'); return; }
  try{
    await db.collection('pengaturan_sekolah').doc('default').set({ namaKamad, nipKamad, kota }, {merge:true});
    state.pengaturanSekolah = { namaKamad, nipKamad, kota };
    bannerOk(banner, 'Data madrasah tersimpan.');
  }catch(err){
    bannerErr(banner, 'Gagal menyimpan: ' + escapeHtml(err.message));
  }
});

/* ---------------- ADMIN: Jurnal Guru ---------------- */
const BULAN_NAMA = {1:'JANUARI',2:'FEBRUARI',3:'MARET',4:'APRIL',5:'MEI',6:'JUNI',7:'JULI',8:'AGUSTUS',9:'SEPTEMBER',10:'OKTOBER',11:'NOVEMBER',12:'DESEMBER'};
const NAMA_HARI_ID = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const NAMA_BULAN_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function tanggalIndonesiaHariIni(kota){
  const now = new Date();
  return `${kota || 'Balikpapan'}, ${now.getDate()} ${NAMA_BULAN_ID[now.getMonth()]} ${now.getFullYear()}`;
}

// isi pilihan Tahun secara dinamis (tidak hardcode) — rentang wajar dari 2 tahun lalu s/d 3 tahun ke depan
(function isiSelectTahunJurnal(){
  const sel = document.getElementById('selectTahunJurnal');
  const tahunSekarang = new Date().getFullYear();
  let opsi = '';
  for(let y = tahunSekarang - 2; y <= tahunSekarang + 3; y++){
    opsi += `<option value="${y}" ${y===tahunSekarang?'selected':''}>${y}</option>`;
  }
  sel.innerHTML = opsi;
})();

document.getElementById('jTanggal').valueAsDate = new Date();
document.getElementById('jTanggal').addEventListener('change', () => {
  if(document.getElementById('jKelasSumber').value) tarikDataAbsensiKeJurnal();
});
document.getElementById('jKelasSumber').addEventListener('change', tarikDataAbsensiKeJurnal);

async function tarikDataAbsensiKeJurnal(){
  const kelasId = document.getElementById('jKelasSumber').value;
  const tanggal = document.getElementById('jTanggal').value;
  const badge = document.getElementById('jOtomatisBadge');
  const hint = document.getElementById('jKelasHint');
  if(!kelasId){ badge.style.display = 'none'; hint.textContent = ''; return; }
  if(!tanggal){ hint.textContent = 'Pilih tanggal dahulu.'; return; }
  hint.textContent = 'Menarik data absensi…';
  try{
    const kelasDoc = await db.collection('kelas_absensi').doc(kelasId).get();
    const kelasNama = kelasDoc.exists ? kelasDoc.data().nama : '';
    const pertemuanDoc = await db.collection('pertemuan').doc(`${kelasId}_${tanggal}`).get();
    if(!pertemuanDoc.exists){
      hint.textContent = `Belum ada data Ambil Absensi untuk kelas ${kelasNama} pada tanggal ini.`;
      badge.style.display = 'none';
      return;
    }
    const pertemuan = pertemuanDoc.data();
    const siswaSnap = await db.collection('siswa').where('kelasId','==',kelasId).orderBy('urutan').get();
    const kehadiran = pertemuan.kehadiran || {};
    const tidakHadir = [];
    let s=0, i=0, a=0;
    siswaSnap.forEach(doc => {
      const st = kehadiran[doc.id] || 'H';
      if(st === 'S'){ s++; tidakHadir.push(`${doc.data().nama} (S)`); }
      else if(st === 'I'){ i++; tidakHadir.push(`${doc.data().nama} (I)`); }
      else if(st === 'A'){ a++; tidakHadir.push(`${doc.data().nama} (A)`); }
    });
    document.getElementById('jTempat').value = kelasNama;
    if(pertemuan.materi) document.getElementById('jMateri').value = pertemuan.materi;
    document.getElementById('jSiswaTidakHadir').value = tidakHadir.join(', ');
    document.getElementById('jS').value = s;
    document.getElementById('jI').value = i;
    document.getElementById('jA').value = a;
    badge.style.display = 'inline';
    hint.textContent = `Data ditarik dari Ambil Absensi kelas ${kelasNama} (${tanggal}).`;
  }catch(err){
    hint.textContent = 'Gagal menarik data: ' + err.message;
  }
}

function kosongkanFormJurnal(){
  state.editJurnalId = null;
  document.getElementById('jTanggal').valueAsDate = new Date();
  document.getElementById('jPukul').value = '07:00 - 15:30';
  document.getElementById('jTempat').value = 'MANBPN';
  document.getElementById('jKegiatan').value = '';
  document.getElementById('jMateri').value = '';
  document.getElementById('jIndikator').value = '';
  document.getElementById('jSiswaTidakHadir').value = '';
  document.getElementById('jS').value = 0;
  document.getElementById('jI').value = 0;
  document.getElementById('jA').value = 0;
  document.getElementById('jKeterangan').value = '';
  document.getElementById('jKelasSumber').value = '';
  document.getElementById('jOtomatisBadge').style.display = 'none';
  document.getElementById('jKelasHint').textContent = '';
  document.getElementById('jFormTitle').textContent = 'Tambah Entri Baru';
  document.getElementById('btnSimpanJurnal').textContent = 'Simpan Entri';
  document.getElementById('btnBatalEditJurnal').style.display = 'none';
  document.getElementById('btnHapusJurnal').style.display = 'none';
  document.getElementById('jBanner').innerHTML = '';
}
document.getElementById('btnBatalEditJurnal').addEventListener('click', kosongkanFormJurnal);

document.getElementById('btnHapusJurnal').addEventListener('click', async () => {
  if(!state.editJurnalId) return;
  if(!confirm('Hapus entri jurnal ini? Tindakan ini tidak bisa dibatalkan.')) return;
  try{
    await db.collection('jurnal_guru').doc(state.editJurnalId).delete();
    kosongkanFormJurnal();
    loadJurnalBulan();
  }catch(err){
    alert('Gagal menghapus: ' + err.message);
  }
});

function muatEntriKeForm(id, d){
  state.editJurnalId = id;
  document.getElementById('jTanggal').value = d.tanggal;
  document.getElementById('jPukul').value = d.pukul || '';
  document.getElementById('jTempat').value = d.tempat || '';
  document.getElementById('jKegiatan').value = d.kegiatan || '';
  document.getElementById('jMateri').value = d.materi || '';
  document.getElementById('jIndikator').value = d.indikator || '';
  document.getElementById('jSiswaTidakHadir').value = d.siswaTidakHadir || '';
  document.getElementById('jS').value = d.s ?? 0;
  document.getElementById('jI').value = d.i ?? 0;
  document.getElementById('jA').value = d.a ?? 0;
  document.getElementById('jKeterangan').value = d.keterangan || '';
  document.getElementById('jKelasSumber').value = d.kelasSumberId || '';
  document.getElementById('jOtomatisBadge').style.display = d.kelasSumberId ? 'inline' : 'none';
  document.getElementById('jKelasHint').textContent = '';
  document.getElementById('jFormTitle').textContent = 'Edit Entri (' + d.tanggal + ')';
  document.getElementById('btnSimpanJurnal').textContent = 'Update Entri';
  document.getElementById('btnBatalEditJurnal').style.display = 'inline-block';
  document.getElementById('btnHapusJurnal').style.display = 'inline-block';
  document.getElementById('jBanner').innerHTML = '';
  window.scrollTo({top: document.getElementById('jTanggal').getBoundingClientRect().top + window.scrollY - 100, behavior:'smooth'});
}

document.getElementById('btnSimpanJurnal').addEventListener('click', async () => {
  const banner = document.getElementById('jBanner');
  const tanggal = document.getElementById('jTanggal').value;
  if(!tanggal){ bannerErr(banner, 'Pilih tanggal dahulu.'); return; }
  const payload = {
    tanggal,
    pukul: document.getElementById('jPukul').value.trim(),
    tempat: document.getElementById('jTempat').value.trim(),
    kegiatan: document.getElementById('jKegiatan').value.trim(),
    materi: document.getElementById('jMateri').value.trim(),
    indikator: document.getElementById('jIndikator').value.trim(),
    siswaTidakHadir: document.getElementById('jSiswaTidakHadir').value.trim(),
    s: Number(document.getElementById('jS').value) || 0,
    i: Number(document.getElementById('jI').value) || 0,
    a: Number(document.getElementById('jA').value) || 0,
    keterangan: document.getElementById('jKeterangan').value.trim(),
    kelasSumberId: document.getElementById('jKelasSumber').value || null
  };
  try{
    if(state.editJurnalId){
      await db.collection('jurnal_guru').doc(state.editJurnalId).update(payload);
      bannerOk(banner, 'Entri jurnal berhasil diperbarui.');
    } else {
      await db.collection('jurnal_guru').add(payload);
      bannerOk(banner, 'Entri jurnal baru tersimpan. Form dikosongkan untuk entri berikutnya.');
    }
    kosongkanFormJurnal();
    bannerOk(document.getElementById('jBanner'), 'Tersimpan.');
    loadJurnalBulan();
  }catch(err){
    bannerErr(banner, 'Gagal menyimpan: ' + escapeHtml(err.message));
  }
});

document.getElementById('selectBulanJurnal').addEventListener('change', loadJurnalBulan);
document.getElementById('selectTahunJurnal').addEventListener('change', loadJurnalBulan);

function bulanDefaultSekarang(){
  const m = new Date().getMonth()+1; // 1-12
  return m;
}
document.getElementById('selectBulanJurnal').value = bulanDefaultSekarang();

async function loadJurnalBulan(){
  const box = document.getElementById('jurnalTable');
  const bulanNum = Number(document.getElementById('selectBulanJurnal').value);
  const tahun = Number(document.getElementById('selectTahunJurnal').value);
  box.innerHTML = '<div class="loading">Memuat…</div>';
  try{
    const mm = String(bulanNum).padStart(2,'0');
    const awal = `${tahun}-${mm}-01`;
    const akhir = `${tahun}-${mm}-31`;
    const snap = await db.collection('jurnal_guru')
      .where('tanggal','>=',awal).where('tanggal','<=',akhir)
      .orderBy('tanggal','asc').get();
    if(snap.empty){ box.innerHTML = '<div class="empty">Belum ada entri jurnal bulan ini.</div>'; state.lastJurnal = null; return; }
    const rows = [];
    snap.forEach(doc => rows.push({id:doc.id, ...doc.data()}));

    // urutkan berdasarkan tanggal, lalu jam mulai (dari kolom "Pukul", format "HH:MM - HH:MM")
    function menitMulai(pukul){
      const m = String(pukul||'').match(/(\d{1,2})[.:](\d{2})/);
      if(!m) return 99999; // tanpa jam valid ditaruh di akhir
      return Number(m[1]) * 60 + Number(m[2]);
    }
    rows.sort((a, b) => {
      if(a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? -1 : 1;
      return menitMulai(a.pukul) - menitMulai(b.pukul);
    });

    state.lastJurnal = { bulanNum, tahun, rows };

    let html = '<p class="hint" style="margin-bottom:8px;">Klik salah satu baris untuk mengedit entri itu.</p><div class="table-scroll"><table><thead><tr><th>Tgl</th><th>Pukul</th><th>Kelas/Tempat</th><th>Kegiatan Guru</th><th>No.KD/Materi</th><th>Indikator</th><th>Tdk Hadir</th><th>S</th><th>I</th><th>A</th><th>Keterangan</th></tr></thead><tbody>';
    rows.forEach(r => {
      html += `<tr class="clickable" data-id="${r.id}"><td>${escapeHtml(r.tanggal)}</td><td>${escapeHtml(r.pukul||'')}</td><td>${escapeHtml(r.tempat||'')}</td><td>${escapeHtml(r.kegiatan||'')}</td><td>${escapeHtml(r.materi||'')}</td><td>${escapeHtml(r.indikator||'')}</td><td>${escapeHtml(r.siswaTidakHadir||'')}</td><td>${r.s||0}</td><td>${r.i||0}</td><td>${r.a||0}</td><td>${escapeHtml(r.keterangan||'')}</td></tr>`;
    });
    html += '</tbody></table></div>';
    box.innerHTML = html;
    box.querySelectorAll('tr.clickable').forEach(tr => {
      tr.addEventListener('click', () => {
        const r = rows.find(x => x.id === tr.dataset.id);
        muatEntriKeForm(r.id, r);
      });
    });
  }catch(err){
    box.innerHTML = `<div class="empty">Gagal memuat. ${escapeHtml(err.message)}</div>`;
  }
}

document.getElementById('btnDownloadJurnal').addEventListener('click', () => {
  const j = state.lastJurnal;
  if(!j || !j.rows.length){ alert('Belum ada data jurnal bulan ini untuk didownload.'); return; }
  if(typeof XLSX === 'undefined'){ alert('Gagal memuat modul Excel, coba lagi saat koneksi internet stabil.'); return; }

  const orientasi = document.getElementById('selectOrientasiJurnal').value; // 'landscape' | 'portrait'
  const header = ['HARI/TGL','PUKUL','KELAS/TEMPAT','1.KEGIATAN GURU','2.NO.KD/MATERI PELAJARAN','3.INDIKATOR KOMPETENSI','NAMA SISWA TIDAK HADIR','S','I','A','KETERANGAN/OUTPUT KEGIATAN'];
  const rows = [
    [`AGENDA DAN JURNAL KEGIATAN GURU`],
    [`BULAN : ${BULAN_NAMA[j.bulanNum]} ${j.tahun}`],
    header
  ];
  j.rows.forEach(r => {
    rows.push([r.tanggal, r.pukul||'', r.tempat||'', r.kegiatan||'', r.materi||'', r.indikator||'', r.siswaTidakHadir||'', r.s||0, r.i||0, r.a||0, r.keterangan||'']);
  });

  // baris kosong pemisah sebelum blok tanda tangan
  rows.push([]);
  rows.push([]);
  // "Balikpapan, [tanggal cetak]" — rata kolom terakhir
  rows.push(['', '', '', '', '', '', '', '', '', '', tanggalIndonesiaHariIni(state.pengaturanSekolah.kota)]);
  rows.push([]);
  rows.push(['Mengetahui,', '', '', '', '', '', '', '', '', '', 'Guru Mata Pelajaran,']);
  rows.push(['Kepala Madrasah', '', '', '', '', '', '', '', '', '', '']);
  rows.push([]);
  rows.push([]);
  rows.push([]);
  rows.push([state.pengaturanSekolah.namaKamad || '', '', '', '', '', '', '', '', '', '', state.pengaturanGuru.namaGuru || '']);
  rows.push([state.pengaturanSekolah.nipKamad || '', '', '', '', '', '', '', '', '', '', state.pengaturanGuru.nipGuru || '']);

  const namaFile = `jurnal-guru-${BULAN_NAMA[j.bulanNum]}-${j.tahun}.xlsx`;
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:11},{wch:14},{wch:12},{wch:28},{wch:22},{wch:26},{wch:22},{wch:5},{wch:5},{wch:5},{wch:26}];

  // pengaturan halaman: ukuran A4, orientasi sesuai pilihan, muat pas lebar 1 halaman
  ws['!pageSetup'] = { paperSize: 9, orientation: orientasi, fitToWidth: 1, fitToHeight: 0, scale: 100 };
  ws['!margins'] = { left:0.4, right:0.4, top:0.5, bottom:0.5, header:0.2, footer:0.2 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${BULAN_NAMA[j.bulanNum]} ${j.tahun}`.substring(0,31));
  XLSX.writeFile(wb, namaFile, {cellStyles:true});
});
function renderModal(inner){
  document.getElementById('modalRoot').innerHTML = `<div class="modal-bg" id="modalBg"><div class="modal-box">${inner}</div></div>`;
  document.getElementById('modalBg').addEventListener('click', (e) => { if(e.target.id === 'modalBg') closeModal(); });
}
function closeModal(){ document.getElementById('modalRoot').innerHTML = ''; }

if(CONFIG_BELUM_DIISI){
  document.getElementById('kelasPublikList').innerHTML =
    '<div class="empty">Konfigurasi Firebase belum diisi. Admin perlu mengisi <code>firebaseConfig</code> di absensi.html (samakan dengan ruang-ujian.html).</div>';
} else {
  loadKelasPublik();
}
