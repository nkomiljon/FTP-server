// index.js
// Oddiy, lekin xavfsizlikka e'tibor qaratilgan SFTP server.
// Kutubxona: ssh2 (https://github.com/mscdex/ssh2)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import ssh2 from "ssh2";
const { Server, sftp: SFTP } = ssh2;
const { OPEN_MODE, STATUS_CODE } = SFTP;

import { findUser } from "./users.js";

// ES modullarda __dirname mavjud emas, shuning uchun o'zimiz hosil qilamiz
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOST_KEY_PATH = path.join(__dirname, "host.key");
const PORT = process.env.SFTP_PORT || 2222;

if (!fs.existsSync(HOST_KEY_PATH)) {
  console.error(
    "host.key topilmadi! Avval quyidagi buyruqni ishga tushiring:\n" +
      '  ssh-keygen -t rsa -b 4096 -f host.key -N ""',
  );
  process.exit(1);
}

// storage papkasini yaratib qo'yamiz (agar mavjud bo'lmasa)
const storageRoot = path.join(__dirname, "storage");
if (!fs.existsSync(storageRoot)) fs.mkdirSync(storageRoot, { recursive: true });

// --- Yordamchi: foydalanuvchi o'z papkasidan tashqariga chiqmasligini ta'minlash ---
// Bu "path traversal" hujumlarining oldini oladi (masalan, "../../etc/passwd")
function resolveSafePath(homeDir, requestedPath) {
  const normalized = path.normalize(path.join(homeDir, requestedPath));
  if (!normalized.startsWith(homeDir)) {
    return null; // ruxsatsiz urinish
  }
  return normalized;
}

const server = new Server(
  {
    hostKeys: [fs.readFileSync(HOST_KEY_PATH)],
  },
  (client) => {
    console.log("Yangi ulanish so'raldi");
    let authenticatedUser = null;

    client
      .on("authentication", (ctx) => {
        const user = findUser(ctx.username);

        if (!user) {
          return ctx.reject(["password"]);
        }

        if (ctx.method === "password") {
          const ok = bcrypt.compareSync(ctx.password, user.passwordHash);
          if (!ok) return ctx.reject(["password"]);

          // Foydalanuvchi papkasi mavjudligiga ishonch hosil qilamiz
          if (!fs.existsSync(user.homeDir)) {
            fs.mkdirSync(user.homeDir, { recursive: true });
          }

          authenticatedUser = user;
          return ctx.accept();
        }

        return ctx.reject(["password"]);
      })
      .on("ready", () => {
        console.log(
          `Foydalanuvchi tizimga kirdi: ${authenticatedUser.username}`,
        );

        client.on("session", (accept) => {
          const session = accept();

          session.on("sftp", (accept2) => {
            const sftpStream = accept2();
            const openHandles = new Map();
            let handleCount = 0;

            const homeDir = authenticatedUser.homeDir;

            // --- Fayl ochish ---
            sftpStream.on("OPEN", (reqid, filename, flags) => {
              const safePath = resolveSafePath(homeDir, filename);
              if (!safePath)
                return sftpStream.status(reqid, STATUS_CODE.PERMISSION_DENIED);

              let fsFlags = "r";
              if (flags & OPEN_MODE.WRITE)
                fsFlags = flags & OPEN_MODE.APPEND ? "a" : "w";

              fs.open(safePath, fsFlags, (err, fd) => {
                if (err) return sftpStream.status(reqid, STATUS_CODE.FAILURE);
                const handle = Buffer.alloc(4);
                handleCount++;
                handle.writeUInt32BE(handleCount, 0);
                openHandles.set(handleCount, { fd, path: safePath });
                sftpStream.handle(reqid, handle);
              });
            });

            // --- O'qish ---
            sftpStream.on("READ", (reqid, handle, offset, length) => {
              const h = openHandles.get(handle.readUInt32BE(0));
              if (!h) return sftpStream.status(reqid, STATUS_CODE.FAILURE);

              const buffer = Buffer.alloc(length);
              fs.read(h.fd, buffer, 0, length, offset, (err, bytesRead) => {
                if (err) return sftpStream.status(reqid, STATUS_CODE.FAILURE);
                if (bytesRead === 0)
                  return sftpStream.status(reqid, STATUS_CODE.EOF);
                sftpStream.data(reqid, buffer.slice(0, bytesRead));
              });
            });

            // --- Yozish ---
            sftpStream.on("WRITE", (reqid, handle, offset, data) => {
              const h = openHandles.get(handle.readUInt32BE(0));
              if (!h) return sftpStream.status(reqid, STATUS_CODE.FAILURE);

              fs.write(h.fd, data, 0, data.length, offset, (err) => {
                if (err) return sftpStream.status(reqid, STATUS_CODE.FAILURE);
                sftpStream.status(reqid, STATUS_CODE.OK);
              });
            });

            // --- Yopish ---
            sftpStream.on("CLOSE", (reqid, handle) => {
              const key = handle.readUInt32BE(0);
              const h = openHandles.get(key);
              if (!h) return sftpStream.status(reqid, STATUS_CODE.FAILURE);

              fs.close(h.fd, (err) => {
                openHandles.delete(key);
                sftpStream.status(
                  reqid,
                  err ? STATUS_CODE.FAILURE : STATUS_CODE.OK,
                );
              });
            });

            // --- Papka tarkibini ko'rish ---
            let dirListings = new Map();
            let dirHandleCount = 0;

            sftpStream.on("OPENDIR", (reqid, dirPath) => {
              const safePath = resolveSafePath(homeDir, dirPath);
              if (!safePath)
                return sftpStream.status(reqid, STATUS_CODE.PERMISSION_DENIED);

              fs.readdir(safePath, { withFileTypes: true }, (err, files) => {
                if (err) return sftpStream.status(reqid, STATUS_CODE.FAILURE);
                const handle = Buffer.alloc(4);
                dirHandleCount++;
                handle.writeUInt32BE(dirHandleCount, 0);
                dirListings.set(dirHandleCount, {
                  files,
                  path: safePath,
                  sent: false,
                });
                sftpStream.handle(reqid, handle);
              });
            });

            sftpStream.on("READDIR", (reqid, handle) => {
              const key = handle.readUInt32BE(0);
              const listing = dirListings.get(key);
              if (!listing)
                return sftpStream.status(reqid, STATUS_CODE.FAILURE);
              if (listing.sent)
                return sftpStream.status(reqid, STATUS_CODE.EOF);

              listing.sent = true;
              const names = listing.files.map((f) => {
                const stat = fs.statSync(path.join(listing.path, f.name));
                return {
                  filename: f.name,
                  longname: `${f.isDirectory() ? "d" : "-"}rwxr-xr-x 1 user user ${stat.size} ${f.name}`,
                  attrs: {
                    mode: f.isDirectory() ? 0o040755 : 0o100644,
                    size: stat.size,
                    uid: 0,
                    gid: 0,
                    atime: Math.floor(stat.atimeMs / 1000),
                    mtime: Math.floor(stat.mtimeMs / 1000),
                  },
                };
              });
              sftpStream.name(reqid, names);
            });

            sftpStream.on("REALPATH", (reqid, reqPath) => {
              const safePath = resolveSafePath(homeDir, reqPath);
              const relative =
                "/" + path.relative(homeDir, safePath || homeDir);
              sftpStream.name(reqid, [
                { filename: relative, longname: relative, attrs: {} },
              ]);
            });

            sftpStream.on("LSTAT", (reqid, reqPath) => {
              const safePath = resolveSafePath(homeDir, reqPath);
              if (!safePath)
                return sftpStream.status(reqid, STATUS_CODE.PERMISSION_DENIED);
              fs.stat(safePath, (err, stats) => {
                if (err)
                  return sftpStream.status(reqid, STATUS_CODE.NO_SUCH_FILE);
                sftpStream.attrs(reqid, {
                  mode: stats.isDirectory() ? 0o040755 : 0o100644,
                  size: stats.size,
                  uid: 0,
                  gid: 0,
                  atime: Math.floor(stats.atimeMs / 1000),
                  mtime: Math.floor(stats.mtimeMs / 1000),
                });
              });
            });
            sftpStream.on("FSTAT", (reqid, handle) => {
              sftpStream.emit("LSTAT", reqid, "."); // soddalashtirilgan
            });

            // --- Papka yaratish / o'chirish, fayl o'chirish, nomini o'zgartirish ---
            sftpStream.on("MKDIR", (reqid, dirPath) => {
              const safePath = resolveSafePath(homeDir, dirPath);
              if (!safePath)
                return sftpStream.status(reqid, STATUS_CODE.PERMISSION_DENIED);
              fs.mkdir(safePath, (err) =>
                sftpStream.status(
                  reqid,
                  err ? STATUS_CODE.FAILURE : STATUS_CODE.OK,
                ),
              );
            });

            sftpStream.on("RMDIR", (reqid, dirPath) => {
              const safePath = resolveSafePath(homeDir, dirPath);
              if (!safePath)
                return sftpStream.status(reqid, STATUS_CODE.PERMISSION_DENIED);
              fs.rmdir(safePath, (err) =>
                sftpStream.status(
                  reqid,
                  err ? STATUS_CODE.FAILURE : STATUS_CODE.OK,
                ),
              );
            });

            sftpStream.on("REMOVE", (reqid, filePath) => {
              const safePath = resolveSafePath(homeDir, filePath);
              if (!safePath)
                return sftpStream.status(reqid, STATUS_CODE.PERMISSION_DENIED);
              fs.unlink(safePath, (err) =>
                sftpStream.status(
                  reqid,
                  err ? STATUS_CODE.FAILURE : STATUS_CODE.OK,
                ),
              );
            });

            sftpStream.on("RENAME", (reqid, oldPath, newPath) => {
              const safeOld = resolveSafePath(homeDir, oldPath);
              const safeNew = resolveSafePath(homeDir, newPath);
              if (!safeOld || !safeNew)
                return sftpStream.status(reqid, STATUS_CODE.PERMISSION_DENIED);
              fs.rename(safeOld, safeNew, (err) =>
                sftpStream.status(
                  reqid,
                  err ? STATUS_CODE.FAILURE : STATUS_CODE.OK,
                ),
              );
            });
          });
        });
      })
      .on("error", (err) => console.error("Client xatosi:", err.message))
      .on("end", () => console.log("Ulanish tugadi"));
  },
);

server.listen(PORT, "0.0.0.0", function () {
  console.log(`SFTP server ${this.address().port}-portda ishga tushdi`);
});
