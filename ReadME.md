# SFTP Server (Node.js)

Bu — production uchun boshlang'ich nuqta bo'ladigan oddiy SFTP server. `ssh2` kutubxonasi asosida qurilgan.

## O'rnatish (Windows)

1. **Paketlarni o'rnating:**

   ```
   npm install
   ```

2. **Server kalitini (host key) yarating.**
   Windows'da `ssh-keygen` odatda Git Bash yoki WSL orqali mavjud. Loyiha papkasida quyidagini ishga tushiring:

   ```
   ssh-keygen -t rsa -b 4096 -f host.key -N ""
   ```

   Agar `ssh-keygen` topilmasa — Git for Windows o'rnating (u bilan birga keladi), yoki WSL (Windows Subsystem for Linux) ishlating.

3. **Test foydalanuvchisi bilan parolni tekshirish:**
   `users.js` faylidagi standart foydalanuvchi:
   - username: `testuser`
   - parol: `parol123`

   Yangi foydalanuvchi qo'shish uchun avval hash yarating:

   ```
   node -e "console.log(require('bcryptjs').hashSync('yangi_parol', 10))"
   ```

   Natijani `users.js` ichidagi `passwordHash` maydoniga qo'ying.

4. **Serverni ishga tushiring:**
   ```
   npm start
   ```
   Server standart holda `2222`-portda ishlaydi (root huquqisiz 21-portni ochish qiyin, shuning uchun 2222 tanlangan).

## FileZilla bilan ulanish

- Protokol: **SFTP - SSH File Transfer Protocol**
- Host: `sftp://localhost` (yoki server IP manzili)
- Port: `2222`
- Username / Password: `users.js` dagi ma'lumotlar

## Muhim — production uchun keyingi qadamlar

Bu kod **boshlang'ich nuqta**, quyidagilarsiz productionga chiqarmang:

1. **Foydalanuvchilarni bazadan olish** — hozir `users.js` statik massiv, buni PostgreSQL/MongoDB kabi bazaga almashtiring.
2. **Public key autentifikatsiya** qo'shish — parol o'rniga (yoki qo'shimcha) SSH kalit orqali kirish xavfsizroq.
3. **Rate limiting / fail2ban** — ketma-ket noto'g'ri urinishlarni cheklash.
4. **Loglash tizimi** — kim, qachon, qaysi faylni yuklagani/olganini yozib boring (masalan, `winston` kutubxonasi bilan).
5. **PM2 bilan ishga tushirish** — server yiqilib qolsa avtomatik qayta ishga tushishi uchun:
   ```
   npm install -g pm2
   pm2 start index.js --name sftp-server
   ```
6. **AWS EC2'da Security Group**da faqat kerakli portni (masalan 2222) va faqat kerakli IP manzillardan ochish.
7. **FSTAT, SETSTAT** kabi ba'zi buyruqlar bu kodda soddalashtirilgan — real yuklamada to'liq ishlab chiqish kerak bo'ladi.

## Kelajakdagi Web (drag-and-drop) qismi uchun

Web orqali yuklashni qo'shganda, alohida Express.js REST API yozib, u ham xuddi shu `storage/<username>/` papkasiga yozadigan qilib loyihalashtiring — shunda SFTP va Web orqali yuklangan fayllar bitta joyda saqlanadi.
