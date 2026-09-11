// ftps-server.js
// FTPS (FTP over TLS) server. Oddiy FTP'dan farqli o'laroq,
// login/parol va fayllar shifrlangan holda uzatiladi.
//
// Kutubxona: ftp-srv (https://github.com/autovance/ftp-srv)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import { FtpSrv } from "ftp-srv";

import { findUser } from "./users.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTROL_PORT = process.env.FTPS_PORT || 990;
// Passiv rejim uchun port oralig'i — Security Group'da shu oraliqni ochish kerak
const PASV_MIN = 1024;
const PASV_MAX = 1048;

// Serverning tashqi (public) IP manzili — passiv rejimda mijozga
// qaysi manzilga ulanishni aytish uchun MAJBURIY. O'zingizning
// EC2 Public IP (yoki Elastic IP) manzilingizni shu yerga yozing.
const PUBLIC_IP = process.env.PUBLIC_IP || "52.211.226.76";

const TLS_KEY_PATH = path.join(__dirname, "ftps-key.pem");
const TLS_CERT_PATH = path.join(__dirname, "ftps-cert.pem");

if (!fs.existsSync(TLS_KEY_PATH) || !fs.existsSync(TLS_CERT_PATH)) {
  console.error(
    "TLS sertifikatlari topilmadi! Avval quyidagi buyruqni ishga tushiring:\n" +
      "  npm run gencert",
  );
  process.exit(1);
}

if (PUBLIC_IP === "SIZNING_PUBLIC_IP_MANZILINGIZ") {
  console.warn(
    "\n⚠️  OGOHLANTIRISH: PUBLIC_IP hali sozlanmagan!\n" +
      "   ftps-server.js faylida PUBLIC_IP qiymatini o'zgartiring,\n" +
      "   yoki server ishga tushirishda: PUBLIC_IP=1.2.3.4 npm run start:ftps\n",
  );
}

const ftpServer = new FtpSrv({
  // "ftps://" = IMPLICIT TLS (TLS handshake darhol ulanishda boshlanadi).
  // Eslatma: ftp-srv kutubxonasidagi "explicit" (AUTH TLS) rejimi TLS
  // handshake'da xatolik beradi (kutubxonaning ma'lum kamchiligi),
  // shuning uchun ishonchli ishlaydigan IMPLICIT rejim tanlandi.
  url: `ftps://0.0.0.0:${CONTROL_PORT}`,
  pasv_url: PUBLIC_IP,
  pasv_min: PASV_MIN,
  pasv_max: PASV_MAX,
  tls: {
    key: fs.readFileSync(TLS_KEY_PATH),
    cert: fs.readFileSync(TLS_CERT_PATH),
  },
  // Oddiy (shifrlanmagan) FTP orqali ham ulanishga ruxsat bermaslik —
  // faqat FTPS (TLS bilan) qabul qilinadi
  greeting: ["SFTP loyihamiz FTPS serveriga xush kelibsiz"],
});

ftpServer.on("login", ({ connection, username, password }, resolve, reject) => {
  const user = findUser(username);

  if (!user) {
    return reject(new Error("Foydalanuvchi topilmadi"));
  }

  const ok = bcrypt.compareSync(password, user.passwordHash);
  if (!ok) {
    return reject(new Error("Parol noto'g'ri"));
  }

  if (!fs.existsSync(user.homeDir)) {
    fs.mkdirSync(user.homeDir, { recursive: true });
  }

  console.log(`Foydalanuvchi tizimga kirdi (FTPS): ${username}`);
  resolve({ root: user.homeDir });
});

ftpServer.on("client-error", ({ connection, context, error }) => {
  console.error("Klient xatosi:", error.message);
});

ftpServer
  .listen()
  .then(() => {
    console.log(`FTPS server ${CONTROL_PORT}-portda ishga tushdi`);
    console.log(`Passiv port oralig'i: ${PASV_MIN}-${PASV_MAX}`);
  })
  .catch((err) => {
    console.error("Serverni ishga tushirishda xatolik:", err);
    process.exit(1);
  });
