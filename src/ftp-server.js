// plain-ftp-server.js
//
// ⚠️ OGOHLANTIRISH: Bu — ODDIY, SHIFRLANMAGAN FTP server.
// Login va parol, shuningdek barcha fayllar TARMOQ ORQALI OCHIQ
// (shifrlanmagan) holda uzatiladi. Buni FAQAT Windows Explorer
// moslik talab qilingani uchun, va faqat ishonchli/yopiq tarmoqda
// ishlatish tavsiya etiladi. Real hamkorlar bilan ishlashda
// buning o'rniga FTPS (ftps-server.js) yoki SFTP (index.js)
// ishlatishni maslahat beramiz.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { FtpSrv } from 'ftp-srv';

import { findUser } from './users.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTROL_PORT = process.env.PLAIN_FTP_PORT || 21;
const PASV_MIN = 1024;
const PASV_MAX = 1048;

// Serverning (EC2) Public IP manzili — Windows Explorer/har qanday
// FTP klient passiv rejimda shu manzilga ulanadi.
const PUBLIC_IP = process.env.PUBLIC_IP || 'SIZNING_PUBLIC_IP_MANZILINGIZ';

if (PUBLIC_IP === 'SIZNING_PUBLIC_IP_MANZILINGIZ') {
  console.warn(
    '\n⚠️  OGOHLANTIRISH: PUBLIC_IP hali sozlanmagan!\n' +
      '   PUBLIC_IP=1.2.3.4 npm run start:plainftp tarzida ishga tushiring.\n'
  );
}

const ftpServer = new FtpSrv({
  // "ftp://" + tls YO'Q = oddiy, shifrlanmagan FTP
  url: `ftp://0.0.0.0:${CONTROL_PORT}`,
  pasv_url: PUBLIC_IP,
  pasv_min: PASV_MIN,
  pasv_max: PASV_MAX,
  greeting: ['Oddiy FTP serveriga xush kelibsiz (SHIFRLANMAGAN — faqat sinov uchun)'],
});

ftpServer.on('login', ({ connection, username, password }, resolve, reject) => {
  const user = findUser(username);

  if (!user) {
    return reject(new Error('Foydalanuvchi topilmadi'));
  }

  const ok = bcrypt.compareSync(password, user.passwordHash);
  if (!ok) {
    return reject(new Error('Parol noto\'g\'ri'));
  }

  if (!fs.existsSync(user.homeDir)) {
    fs.mkdirSync(user.homeDir, { recursive: true });
  }

  console.log(`Foydalanuvchi tizimga kirdi (Plain FTP): ${username}`);
  resolve({ root: user.homeDir });
});

ftpServer.on('client-error', ({ connection, context, error }) => {
  console.error('Klient xatosi:', error.message);
});

ftpServer
  .listen()
  .then(() => {
    console.log(`Oddiy FTP server ${CONTROL_PORT}-portda ishga tushdi (SHIFRLANMAGAN)`);
    console.log(`Passiv port oralig'i: ${PASV_MIN}-${PASV_MAX}`);
  })
  .catch((err) => {
    console.error('Serverni ishga tushirishda xatolik:', err);
    process.exit(1);
  });