# Panduan Lengkap Deploy 9Router ke Cloudflare Workers & Cloudflare D1 (Dari Awal Hingga Akhir)

Dokumen ini berisi panduan langkah demi langkah lengkap untuk mendeploy **9Router** ke **Cloudflare Workers** menggunakan database **Cloudflare D1 SQLite** dan **OpenNext**.

---

## Daftar Isi
1. [Prasyarat](#1-prasyarat)
2. [Langkah 1: Login ke Cloudflare via Wrangler](#langkah-1-login-ke-cloudflare-via-wrangler)
3. [Langkah 2: Buat Database Cloudflare D1 Baru](#langkah-2-buat-database-cloudflare-d1-baru)
4. [Langkah 3: Perbarui File `wrangler.jsonc`](#langkah-3-perbarui-file-wranglerjsonc)
5. [Langkah 4: Terapkan Skema Database SQL ke D1](#langkah-4-terapkan-skema-database-sql-ke-d1)
6. [Langkah 5: Build Worker Menggunakan OpenNext](#langkah-5-build-worker-menggunakan-opennext)
7. [Langkah 6: Deploy ke Cloudflare Workers](#langkah-6-deploy-ke-cloudflare-workers)
8. [Langkah 7: Login dan Akses Dashboard](#langkah-7-login-dan-akses-dashboard)
9. [Langkah 8: Setup Cron Job Refresh Token (Google Apps Script)](#langkah-8-setup-cron-job-refresh-token-google-apps-script)
10. [Catatan Penting: Mengatasi Masalah RAM & Isolate Restart](#10-catatan-penting-mengatasi-masalah-ram--isolate-restart)

---

## 1. Prasyarat
- **Node.js**: Versi 20 atau 22 (LTS disarankan).
- **Package Manager**: `npm` sudah terpasang.
- **Akun Cloudflare**: Akun aktif Cloudflare.
- **Wrangler**: Sudah terinstall dalam dependensi proyek (`npm install`).

---

## Langkah 1: Login ke Cloudflare via Wrangler
Pastikan komputer Anda sudah terautentikasi ke akun Cloudflare:
```bash
npx wrangler login
```
*Jika sudah login sebelumnya, Anda bisa mengecek status akun dengan menjalankan `npx wrangler whoami`.*

---

## Langkah 2: Buat Database Cloudflare D1 Baru
Jalankan perintah berikut untuk membuat database D1 baru bernama `9router-db`:
```bash
npx wrangler d1 create 9router-db
```

Output di terminal akan menghasilkan informasi konfigurasi seperti berikut:
```json
{
  "binding": "DB",
  "database_name": "9router-db",
  "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```
> **PENTING:** Salin nilai `database_id` (UUID) tersebut untuk digunakan pada langkah selanjutnya.

---

## Langkah 3: Perbarui File `wrangler.jsonc`
Buka file `wrangler.jsonc` di root folder proyek, lalu perbarui nilai `database_id` di bagian `d1_databases` dengan UUID baru yang didapatkan dari Langkah 2:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "9router",
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-11-18",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "9router-db",
      "database_id": "MASUKKAN_DATABASE_ID_BARU_DI_SINI"
    }
  ],
  "vars": {
    "CLOUDFLARE_WORKERS": "1",
    "NEXT_DIST_DIR": ".next",
    "INITIAL_PASSWORD": "admin123456",
    "JWT_SECRET": "9router-cfworker-jwt-secret-key-32chars",
    "CRON_SECRET": "9router-cron-refresh-token-secret"
  },
  "observability": {
    "enabled": true
  }
}
```

### Variabel Lingkungan (`vars`):
- `INITIAL_PASSWORD`: Password login default pertama kali (misalnya `admin123456`).
- `JWT_SECRET`: Kunci enkripsi statis minimal 32 karakter agar sesi login browser tidak logout tiba-tiba saat worker mengalami restart/cold-start.
- `CRON_SECRET`: Kunci rahasia untuk trigger endpoint background refresh token.

---

## Langkah 4: Terapkan Skema Database SQL ke D1
Inisialisasi tabel, indeks relasional, pengaturan awal, dan API key bawaan menggunakan skema `scripts/d1-schema.sql`.

### 1. Terapkan ke Database Remote (Cloudflare D1 Live):
```bash
npx wrangler d1 execute 9router-db --remote --file=scripts/d1-schema.sql
```

### 2. Terapkan ke Database Lokal (Miniflare Emulator untuk proses build):
```bash
npx wrangler d1 execute 9router-db --local --file=scripts/d1-schema.sql
```

*Verifikasi tabel remote:*
```bash
npx wrangler d1 execute 9router-db --remote --command="SELECT name FROM sqlite_master WHERE type='table';"
```
*(Harus menampilkan 11 tabel: `settings`, `providerConnections`, `providerNodes`, `proxyPools`, `apiKeys`, `combos`, `kv`, `usageHistory`, `usageDaily`, `requestDetails`, `_meta`)*.

---

## Langkah 5: Build Worker Menggunakan OpenNext
Jalankan proses kompilasi Next.js SSR menjadi Cloudflare Worker bundle:
```bash
npm run build:worker
```
*Tunggu hingga proses build selesai dan menghasilkan pesan:*
```
Worker saved in `.open-next/worker.js` 🚀
OpenNext build complete.
```

---

## Langkah 6: Deploy ke Cloudflare Workers
Upload bundle worker dan seluruh aset statis ke Cloudflare edge:
```bash
npm run deploy:worker
```

Setelah selesai, terminal akan menampilkan URL publik Worker Anda, contoh:
```
Deployed 9router triggers
  https://9router.<subdomain>.workers.dev
Current Version ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

---

## Langkah 7: Login dan Akses Dashboard
1. Buka browser dan buka:
   ```
   https://<subdomain>.workers.dev/login
   ```
2. Masukkan password:
   ```
   admin123456
   ```
3. Klik tombol **Login**. Anda akan diarahkan ke halaman utama Dashboard 9Router.
4. Anda dapat menambahkan Provider (misal: NVIDIA NIM, OpenAI, Anthropic, Gemini, Groq, dll.) di menu **Providers**.

---

## Langkah 8: Setup Cron Job Refresh Token (Google Apps Script)
Untuk menjaga token OAuth provider tetap aktif secara otomatis:

1. Kunjungi [https://script.google.com](https://script.google.com) lalu klik **New Project**.
2. Beri nama proyek: `9Router Token Refresh Cron`.
3. Ganti isi `Code.gs` dengan kode berikut:

```javascript
const ROUTER_CRON_URL = "https://<subdomain>.workers.dev/api/cron/refresh-token";
const CRON_SECRET = "9router-cron-refresh-token-secret";

function triggerTokenRefresh() {
  const url = ROUTER_CRON_URL + "?secret=" + encodeURIComponent(CRON_SECRET);
  const options = {
    method: "post",
    headers: {
      "x-cron-secret": CRON_SECRET,
      "User-Agent": "GoogleAppsScript-Cron/1.0"
    },
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    Logger.log("Status: " + response.getResponseCode());
    Logger.log("Response: " + response.getContentText());
  } catch (err) {
    Logger.log("Error: " + err.toString());
  }
}
```
4. Klik **Triggers** (ikon jam di panel kiri) ➔ **Add Trigger**:
   - Function: `triggerTokenRefresh`
   - Event source: `Time-driven`
   - Type of based timer: `Minutes timer`
   - Interval: `Every 10 minutes` atau `Every 15 minutes`
   - Klik **Save**.

---

## 10. Catatan Penting: Mengatasi Masalah RAM & Isolate Restart

### Mengapa sebelumnya terjadi error saat RAM limit / tidak bisa login?
1. **Batas Memori Cloudflare Workers (128 MB pada Free tier):**
   Saat worker menjalankan tugas berat atau cold-start isolate baru, isolate sebelumnya bisa di-recycle oleh Cloudflare.
2. **Sesi Login Terputus:**
   Jika `JWT_SECRET` tidak didefinisikan secara statis di `vars` `wrangler.jsonc`, sistem sebelumnya akan men-generate random string baru setiap isolate me-restart di memori RAM. Akibatnya, cookie sesi browser lama langsung dianggap tidak valid (*401 Unauthorized*).
3. **Password Default Ditolak Remote:**
   Jika `INITIAL_PASSWORD` tidak terdaftar di `vars` `wrangler.jsonc`, worker menganggap password adalah public default `123456`, sehingga `admin123456` ditolak, dan saat dimasukkan `123456` diblokir oleh proteksi keamanan remote (*mustChangePassword: true*).

### Solusi Permanen yang Sudah Diterapkan:
1. Variabel `INITIAL_PASSWORD`, `JWT_SECRET`, dan `CRON_SECRET` sekarang **wajib** dimasukkan di blok `"vars"` pada `wrangler.jsonc`.
2. Fallback statis telah ditambahkan pada kode sumber (`dashboardSession.js` dan `login/route.js`). Dengan demikian, **kapan pun worker isolate me-restart atau membersihkan RAM, sesi login tetap konsisten dan kredensial login selalu valid.**

---

## 11. Keamanan & Panduan Publish ke GitHub (Apakah Aman?)

### 1. Apakah ada API Key atau Kredensial Pribadi di Kode Sumber?
**TIDAK ADA.** 
- Semua API key provider (misal token NVIDIA NIM, OpenAI, Groq, Anthropic, dll.) yang Anda tambahkan melalui Dashboard disimpan di dalam database **Cloudflare D1 di cloud**, bukan di file kode sumber atau git.
- Riwayat chat dan penggunaan token juga tersimpan di D1.
- File konfigurasi lokal sensitif seperti `.dev.vars`, `.env`, `.wrangler/`, dan file sementara telah diabaikan melalui `.gitignore`.

### 2. Aturan untuk Repositori Privat vs Publik:
- **Jika Repositori Bersifat PRIVAT (Private Repo):**
  Anda **aman 100%** untuk langsung meng-commit dan mem-push seluruh file termasuk `wrangler.jsonc`. Hanya Anda yang memiliki akses ke repositori tersebut.
- **Jika Repositori Bersifat PUBLIK (Public Repo):**
  Perhatikan bahwa di dalam `wrangler.jsonc` terdapat:
  - `database_id`: ID unik D1 database Anda.
  - `INITIAL_PASSWORD`: `"admin123456"`.
  - `JWT_SECRET`: `"9router-cfworker-jwt-secret-key-32chars"`.
  - `CRON_SECRET`: `"9router-cron-refresh-token-secret"`.
  
  **Rekomendasi untuk Public Repo:**
  1. Buat file `wrangler.example.jsonc` (sudah disediakan) dengan placeholder seperti `"database_id": "YOUR_D1_DATABASE_ID_HERE"`.
  2. Jangan menuliskan password atau secret produksi Anda langsung di `wrangler.jsonc` yang di-push ke publik.
  3. Gunakan fitur **Cloudflare Secrets** di Cloudflare Dashboard:
     - Masuk ke Cloudflare Dashboard ➔ **Workers & Pages** ➔ Pilih Worker `9router` ➔ **Settings** ➔ **Variables and Secrets**.
     - Tambahkan sebagai Secret terenkripsi: `INITIAL_PASSWORD`, `JWT_SECRET`, dan `CRON_SECRET`.
     - Rahasia yang diset melalui Cloudflare Dashboard dienkripsi dan **tidak akan pernah muncul di GitHub**.

---

## 12. Menghubungkan Cloudflare Workers Langsung ke GitHub (CI/CD Otomatis)

Anda bisa menghubungkan repositori GitHub Anda langsung ke Cloudflare sehingga setiap kali Anda melakukan `git push`, Cloudflare akan otomatis mem-build dan mendeploy worker terbaru.

Terdapat 2 opsi yang bisa Anda gunakan:

### Opsi A: Cloudflare Workers Builds (Git Integration Langsung di Cloudflare Dashboard)
1. **Push Repository ke GitHub:**
   Pastikan kode proyek sudah di-push ke repository GitHub Anda (bisa private atau public).
2. **Buka Cloudflare Dashboard:**
   - Navigasi ke menu **Workers & Pages** ➔ klik tombol **Create application**.
   - Pilih tab **Workers** ➔ pilih **Connect to Git**.
3. **Pilih Repository:**
   - Sambungkan akun GitHub Anda dan pilih repository `9router-cfworkers`.
4. **Konfigurasi Pengaturan Build:**
   - **Framework preset:** `None`
   - **Build command:** `npm run build:worker`
   - **Deploy command:** (biarkan default `npx wrangler deploy`)
5. **Tambahkan D1 Database Binding:**
   - Buka worker yang baru dibuat ➔ Masuk ke **Settings** ➔ **Bindings**.
   - Klik **Add** ➔ pilih **D1 Database**.
   - Variable name: `DB`.
   - Pilih database D1: `9router-db`.
6. **Tambahkan Environment Variables / Secrets:**
   - Masuk ke **Settings** ➔ **Variables and Secrets**.
   - Tambahkan variabel:
     - `INITIAL_PASSWORD`: `admin123456`
     - `JWT_SECRET`: `9router-cfworker-jwt-secret-key-32chars`
     - `CRON_SECRET`: `9router-cron-refresh-token-secret`
     - `CLOUDFLARE_WORKERS`: `1`
7. **Selesai!** Setiap ada commit/push baru ke GitHub, Cloudflare akan otomatis mendeploy versi terbaru.

---

### Opsi B: Menggunakan GitHub Actions (Workflow File yang Sudah Tersedia)
File workflow GitHub Actions telah disiapkan di [.github/workflows/deploy.yml](file://.github/workflows/deploy.yml).

1. Buka repository Anda di GitHub ➔ masuk ke menu **Settings** ➔ **Secrets and variables** ➔ **Actions**.
2. Klik **New repository secret** dan tambahkan 2 rahasia:
   - `CLOUDFLARE_API_TOKEN`: API Token Cloudflare Anda (dibuat di Cloudflare Dashboard ➔ My Profile ➔ API Tokens ➔ Template "Edit Cloudflare Workers").
   - `CLOUDFLARE_ACCOUNT_ID`: Account ID Cloudflare Anda
3. Setiap kali Anda melakukan `git push origin main` (atau `master`), GitHub Actions akan secara otomatis menjalankan proses build dan deployment ke Cloudflare Workers.

---

## 13. Deploy ke Cloudflare Pages (Opsi Alternatif)

Selain dideploy sebagai Cloudflare Worker, 9Router kini **mendukung penuh Cloudflare Pages** (menggunakan arsitektur Pages Advanced Mode `_worker.js` + static assets CDN `_routes.json`).

### Kelebihan Cloudflare Pages:
1. **Asset CDN Otomatis (0 CPU Cost):** Seluruh file frontend statis (CSS, JS bundle, Font Material Icons, SVG) disajikan langsung oleh CDN Cloudflare melalui aturan `_routes.json` tanpa memakan jatah CPU limit worker sama sekali.
2. **SPA Routing Mulus:** Rute client-side seperti `/combos`, `/providers`, `/settings` otomatis memiliki fallback ke `index.html`.
3. **Backend API & D1 Tetap Berjalan di Edge:** Seluruh endpoint `/v1/*`, `/api/*`, `/v1beta/*` ditangani oleh `_worker.js` yang terhubung langsung ke database D1.

---

### Metode 1: Deploy Langsung via Terminal (Wrangler CLI)

Cukup jalankan satu perintah:
```bash
npm run deploy:pages
```
Perintah ini akan secara otomatis:
1. Mem-build frontend SPA React ke folder `dist/`.
2. Mem-bundle backend Hono worker ke `dist/_worker.js`.
3. Menyertakan aturan routing `_routes.json` dan `.assetsignore`.
4. Mengunggah dan mendeploy ke Cloudflare Pages menggunakan konfigurasi `wrangler.pages.jsonc`.

*Untuk menguji Cloudflare Pages secara lokal di komputer Anda:*
```bash
npm run dev:pages
```

---

### Metode 2: Deploy Otomatis via Cloudflare Dashboard (Git Integration)

Jika repositori GitHub Anda dihubungkan ke Cloudflare Pages:
1. Buka Cloudflare Dashboard ➔ **Workers & Pages** ➔ **Create application** ➔ Tab **Pages** ➔ **Connect to Git**.
2. Pilih repository GitHub 9Router Anda (branch: `feat/cloudflare-pages`).
3. Pada halaman **Build Settings**:
   - **Framework preset:** `None` (atau `Vite`)
   - **Build command:** `npm run build:pages`
   - **Build output directory:** `dist`
4. Di bagian **Environment variables (Advanced)**, tambahkan:
   - `CLOUDFLARE_WORKERS` = `1`
   - `INITIAL_PASSWORD` = `admin123456`
   - `JWT_SECRET` = `9router-cfworker-jwt-secret-key-32chars`
   - `CRON_SECRET` = `9router-cron-refresh-token-secret`
5. Klik **Save and Deploy**.
6. **Pengaturan Wajib di Dashboard (Compatibility Flag & D1 Binding):**
   - Setelah project Pages terbuat, masuk ke project Pages tersebut ➔ **Settings** ➔ **Functions**:
     - **Compatibility Flags:** Scroll ke bagian **Compatibility Flags**, pastikan `nodejs_compat` aktif untuk Production dan Preview.
     - **D1 Database Bindings:** Scroll ke bagian **D1 database bindings** ➔ klik **Add binding**:
       - Variable name: `DB`
       - D1 database: pilih database `9router-db`.
   - Simpan dan trigger **Retry deployment**.


