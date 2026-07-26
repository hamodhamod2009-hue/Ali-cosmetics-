const express = require("express");
const session = require("express-session");
const Database = require("better-sqlite3");
const crypto = require("crypto");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database(process.env.DB_PATH || "ali_cosmetics.db");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  purchase_price REAL NOT NULL DEFAULT 0,
  sale_price REAL NOT NULL DEFAULT 0,
  quantity REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'AUD',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  total REAL NOT NULL,
  currency TEXT NOT NULL,
  username TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(product_id) REFERENCES products(id)
);
`);

function hashPassword(password) {
  return crypto.createHash("sha256").update(password, "utf8").digest("hex");
}

const admin = db.prepare("SELECT id FROM users WHERE username = ?").get("admin");
if (!admin) {
  db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)")
    .run("admin", hashPassword(process.env.ADMIN_PASSWORD || "admin123"), "admin");
}

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || "change-this-session-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: false }
}));
app.use(express.static(__dirname));

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "غير مسجل الدخول" });
  next();
}

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE username = ? AND is_active = 1").get(username);
  if (!user || hashPassword(password || "") !== user.password_hash) {
    return res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
  }
  req.session.user = { id: user.id, username: user.username, role: user.role };
  res.json({ user: req.session.user });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  res.json({ user: req.session.user || null });
});

app.get("/api/products", requireAuth, (req, res) => {
  res.json(db.prepare("SELECT * FROM products ORDER BY id DESC").all());
});

app.post("/api/products", requireAuth, (req, res) => {
  const { name, category = "", purchase_price, sale_price, quantity, currency = "AUD" } = req.body || {};
  if (!name || Number(purchase_price) < 0 || Number(sale_price) < 0 || Number(quantity) < 0) {
    return res.status(400).json({ error: "بيانات المنتج غير صحيحة" });
  }
  const result = db.prepare(`
    INSERT INTO products (name, category, purchase_price, sale_price, quantity, currency)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name.trim(), category.trim(), Number(purchase_price), Number(sale_price), Number(quantity), currency);
  res.json(db.prepare("SELECT * FROM products WHERE id = ?").get(result.lastInsertRowid));
});

app.get("/api/sales", requireAuth, (req, res) => {
  res.json(db.prepare(`
    SELECT sales.*, products.name AS product_name
    FROM sales JOIN products ON products.id = sales.product_id
    ORDER BY sales.id DESC
  `).all());
});

app.post("/api/sales", requireAuth, (req, res) => {
  const { product_id, quantity } = req.body || {};
  const qty = Number(quantity);
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(Number(product_id));
  if (!product || qty <= 0 || qty > product.quantity) {
    return res.status(400).json({ error: "الكمية غير صحيحة أو أكبر من المخزون" });
  }

  const total = qty * product.sale_price;
  const transaction = db.transaction(() => {
    db.prepare("UPDATE products SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(qty, product.id);
    db.prepare(`
      INSERT INTO sales (product_id, quantity, unit_price, total, currency, username)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(product.id, qty, product.sale_price, total, product.currency, req.session.user.username);
  });
  transaction();
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Ali Cosmetics running on port ${PORT}`));
