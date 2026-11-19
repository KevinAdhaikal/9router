# 🚀 Deploying 9Router to Vercel (with Neon Serverless PostgreSQL)

Panduan lengkap untuk men-deploy **9Router** secara 100% serverless di **Vercel** menggunakan database **Neon Serverless PostgreSQL**.

---

## 📋 Daftar Isi
1. [Arsitektur & Keunggulan](#arsitektur--keunggulan)
2. [Prasyarat](#prasyarat)
3. [Variabel Lingkungan (Environment Variables)](#variabel-lingkungan-environment-variables)
4. [Cara 1: Deploy via Vercel CLI (Paling Cepat)](#cara-1-deploy-via-vercel-cli-paling-cepat)
5. [Cara 2: Deploy via Vercel Dashboard (GitHub Integration)](#cara-2-deploy-via-vercel-dashboard-github-integration)
6. [Otomasi Token Refresh (Google Apps Script)](#otomasi-token-refresh-google-apps-script)
7. [Verifikasi Setelah Deploy](#verifikasi-setelah-deploy)
8. [Troubleshooting & Solusi](#troubleshooting--solusi)

---

## 🏛️ Arsitektur & Keunggulan

Versi ini telah dioptimalkan khusus untuk lingkungan Vercel Serverless:
- **Database**: Menggantikan SQLite lokal dengan **Neon Serverless PostgreSQL** menggunakan koneksi pooler (`@neondatabase/serverless`).
- **Filesystem**: File logs dan cache MITM dialihkan ke direktori writable sementara `/tmp/.9router` (`os.tmpdir()`), sehingga aman dari *read-only filesystem* error pada Vercel.
- **Dynamic Origin Testing**: Pengetesan model (`/api/models/test`) mendeteksi domain Vercel secara dinamis tanpa mengandalkan port localhost lokal `127.0.0.1:20128`.
- **Serverless Background Cron**: Endpoint `/api/cron/refresh-tokens` diamankan dengan `CRON_SECRET` untuk sinkronisasi token upstream secara otomatis.

---

## 📦 Prasyarat

Sebelum memulai, pastikan Anda telah menyiapkan:
1. Akun [Vercel](https://vercel.com).
2. Akun [Neon Database](https://neon.tech) (atau buat langsung dari Vercel Storage Marketplace).
3. [Node.js](https://nodejs.org) versi 20 atau yang lebih baru di mesin lokal Anda.
4. Akun [GitHub](https://github.com) jika memilih metode Git deployment.

---

## 🔑 Variabel Lingkungan (Environment Variables)

Berikut adalah variabel lingkungan wajib yang perlu Anda konfigurasikan di Vercel:

| Variabel | Wajib? | Contoh / Deskripsi |
| :--- | :---: | :--- |
| `DATABASE_URL` | **Ya** | Connection string Neon PostgreSQL (contoh: `postgresql://user:pass@ep-xyz-pooler.region.neon.tech/neondb?sslmode=require`) |
| `JWT_SECRET` | **Ya** | String acak panjang 32+ karakter untuk enkripsi session dashboard. Generate dengan: `openssl rand -hex 32` |
| `INITIAL_PASSWORD` | **Ya** | Password awal untuk login pertama kali ke Dashboard 9Router |
| `CRON_SECRET` | **Ya** | Kunci rahasia untuk mengamankan endpoint cron refresh token `/api/cron/refresh-tokens` |
| `MACHINE_ID` | Opsional | Identifier konsisten untuk instance serverless (misal: `9router-vercel-prod`) |
| `NODE_ENV` | Opsional | Nilai default: `production` |

---

## 🛠️ Cara 1: Deploy via Vercel CLI (Paling Cepat)

### Langkah 1: Install Vercel CLI & Login
```bash
npm install -g vercel
vercel login
```

### Langkah 2: Hubungkan Project ke Vercel
Jalankan perintah berikut di folder repositori:
```bash
vercel link
```
Ikuti petunjuk di terminal untuk membuat project baru atau menghubungkan ke project yang sudah ada.

### Langkah 3: Setup Neon Database
Anda bisa membuat database Neon langsung dari Vercel:
1. Buka dashboard Vercel pada project Anda.
2. Masuk ke tab **Storage** -> klik **Connect Store** -> pilih **Neon** (atau **Vercel Postgres**).
3. Vercel akan otomatis menyuntikkan variabel `DATABASE_URL`, `POSTGRES_URL`, dll. ke project Anda.

Tarik variabel lingkungan ke mesin lokal untuk verifikasi (file `.env.local` otomatis diabaikan oleh `.gitignore`):
```bash
vercel env pull .env.local
```

### Langkah 4: Tambahkan Environment Variables Tambahan
Tambahkan variabel rahasia ke environment Vercel Production:
```bash
# Tambahkan JWT_SECRET
vercel env add JWT_SECRET production

# Tambahkan INITIAL_PASSWORD
vercel env add INITIAL_PASSWORD production

# Tambahkan CRON_SECRET
vercel env add CRON_SECRET production

# (Opsional) Tambahkan MACHINE_ID
vercel env add MACHINE_ID production
```

### Langkah 5: Deploy ke Production
```bash
vercel --prod
```
Setelah proses selesai, Vercel akan menampilkan URL live production Anda (misal: `https://your-project.vercel.app`).

---

## 🌐 Cara 2: Deploy via Vercel Dashboard (GitHub Integration)

### Langkah 1: Push Repositori ke GitHub Anda
```bash
git add .
git commit -m "feat: vercel serverless support with neon postgresql"
git remote set-url origin https://github.com/USERNAME/REPO_NAME.git
git branch -M main
git push -u origin main
```

### Langkah 2: Import ke Vercel Dashboard
1. Buka [Vercel Dashboard](https://vercel.com/dashboard).
2. Klik tombol **Add New...** -> pilih **Project**.
3. Pilih repository GitHub Anda, lalu klik **Import**.

### Langkah 3: Konfigurasi Project & Build Settings
- **Framework Preset**: Pilih **Next.js**.
- **Root Directory**: `./` (biarkan default).
- File [`vercel.json`](file:///home/kevinadhaikal/Documents/9router-vercel/vercel.json) sudah mengonfigurasi `next build --webpack` dan `maxDuration: 60` detik untuk Serverless Functions.

### Langkah 4: Hubungkan Database Neon
1. Di halaman konfigurasi atau tab **Storage**, tambahkan integrasi **Neon Postgres**.
2. Pastikan variabel `DATABASE_URL` sudah terisi dengan connection string pooled Neon Anda.

### Langkah 5: Masukkan Environment Variables
Pada bagian **Environment Variables**, tambahkan:
- `JWT_SECRET`: *(string acak aman)*
- `INITIAL_PASSWORD`: *(password login dashboard Anda)*
- `CRON_SECRET`: *(token rahasia untuk cron)*
- `MACHINE_ID`: `9router-vercel-prod`

### Langkah 6: Klik Deploy
Klik tombol **Deploy** dan tunggu build hingga selesai.

---

## ⏰ Otomasi Token Refresh (Google Apps Script)

Upstream AI provider (seperti Claude OAuth, Codex, dll.) membutuhkan penyegaran token secara periodik. Karena Vercel Hobby plan membatasi cron job harian, Anda dapat menggunakan **Google Apps Script** (100% gratis) untuk memicu pembaruan token setiap jam atau setiap 15 menit.

### Langkah Membuat Google Apps Script:
1. Buka [script.google.com](https://script.google.com) dan buat project baru.
2. Salin kode berikut ke editor:

```javascript
function refreshTokens() {
  const VERCEL_URL = "https://your-project.vercel.app"; // Ganti dengan URL Vercel Anda
  const CRON_SECRET = "YOUR_CRON_SECRET"; // Ganti dengan nilai CRON_SECRET Anda

  const endpoint = `${VERCEL_URL}/api/cron/refresh-tokens?secret=${CRON_SECRET}`;
  
  const options = {
    method: "POST",
    muteHttpExceptions: true,
    headers: {
      "Content-Type": "application/json"
    }
  };

  try {
    const response = UrlFetchApp.fetch(endpoint, options);
    Logger.log("Response Code: " + response.getResponseCode());
    Logger.log("Response Body: " + response.getContentText());
  } catch (err) {
    Logger.log("Error: " + err.toString());
  }
}
```

3. Klik ikon **Triggers** (gambar jam di sebelah kiri).
4. Klik **Add Trigger**:
   - **Choose which function to run**: `refreshTokens`
   - **Select event source**: `Time-driven`
   - **Select type of based timer**: `Minutes timer` atau `Hour timer`
   - **Select interval**: Setiap `15 minutes` atau `Every hour`
5. Simpan (Save). Google Apps Script sekarang akan otomatis me-refresh token Anda di latar belakang.

---

## ✅ Verifikasi Setelah Deploy

Setelah deploy sukses:
1. Buka URL project Anda di browser: `https://your-project.vercel.app/dashboard`.
2. Masukkan password dari `INITIAL_PASSWORD` Anda untuk login.
3. Masuk ke menu **Providers** -> Tambahkan provider (misal: Nvidia, OpenAI, Anthropic, OpenRouter, dll.).
4. Masukkan API Key Anda lalu simpan.
5. Klik tombol **Test** pada salah satu model untuk menguji koneksi:
   - Respon sukses akan menampilkan status **HTTP 200** dengan ikon centang hijau (`check_circle`).
6. Siap digunakan! Anda dapat mengarahkan client seperti Cursor, Claude Code, Cline, atau OpenCode ke endpoint Vercel Anda.

---

## ❓ Troubleshooting & Solusi

### 1. Error: `Missing DATABASE_URL or POSTGRES_URL environment variable`
- **Penyebab**: Environment variable database belum terpasang di Vercel.
- **Solusi**: Pastikan `DATABASE_URL` sudah ditambahkan pada menu **Settings** -> **Environment Variables** di Vercel dashboard, lalu lakukan *Redeploy*.

### 2. Error: `EROFS: read-only file system`
- **Penyebab**: Serverless container Vercel memiliki filesystem yang read-only kecuali direktori `/tmp`.
- **Solusi**: Sudah diatasi secara otomatis pada versi ini. Semua penulisan log dan MITM cache telah diarahkan ke `os.tmpdir()` (`/tmp/.9router`).

### 3. Error saat Test Model: `fetch failed`
- **Penyebab**: Request diarahkan ke port lokal `http://127.0.0.1:20128`.
- **Solusi**: Sudah diatasi secara otomatis dengan `resolveBaseUrl(request)`. Pastikan Anda mengakses dashboard melalui protokol HTTPS resmi Vercel Anda.

### 4. Build Error: `Command "next build --webpack" exited with 135 (SIGBUS)`
- **Penyebab**: Kehabisan memori atau disk lokal saat build.
- **Solusi**: Pada Vercel Cloud, build runner memiliki kapasitas memori yang cukup. Jika terjadi di lokal, hapus `.next` dan `node_modules`, lalu install ulang dengan `npm install`.
