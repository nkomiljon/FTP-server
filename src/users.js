// users.js
// Real loyihada bu ma'lumotlar bazadan (masalan, PostgreSQL, MongoDB) kelishi kerak.
// Hozircha oddiy misol uchun statik massiv ishlatamiz.
//
// Parolni hech qachon ochiq matnda saqlamang — bcrypt bilan hash qiling.
// Hash yaratish uchun: node -e "console.log(require('bcryptjs').hashSync('parolingiz', 10))"

import path from "path";

const USERS = [
  {
    username: "testuser",
    // bu hash "parol123" so'ziga mos keladi — FAQAT SINOV UCHUN, productionda o'zgartiring!
    passwordHash:
      "$2a$10$CwTycUXWue0Thq9StjUM0uJ8gJn5cGZfDy2vJ3xJTMYbXOL5vI2Sa",
    // Har bir foydalanuvchi faqat o'z papkasiga kira oladi (chroot-simulyatsiya)
    homeDir: path.join(__dirname, "storage", "testuser"),
  },
];

function findUser(username) {
  return USERS.find((u) => u.username === username);
}

export default { findUser, USERS };
