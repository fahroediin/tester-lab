import express from 'express';

const app = express();
const port = 4000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Render Login Page HTML
app.get('/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>Login System Demo</title>
      <style>
        body { font-family: sans-serif; padding: 40px; background: #f4f6f8; }
        .card { max-width: 400px; margin: 0 auto; background: white; padding: 24px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .form-group { margin-bottom: 16px; }
        label { display: block; margin-bottom: 6px; font-weight: bold; }
        input[type="text"], input[type="password"] { width: 100%; padding: 8px; box-sizing: border-box; }
        button { background: #0066cc; color: white; border: none; padding: 10px 16px; border-radius: 4px; cursor: pointer; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>Masuk Ke Akun</h2>
        <form action="/login" method="POST">
          <div class="form-group">
            <label for="username">Email / Username</label>
            <input type="text" id="username" name="username" placeholder="user@example.com" data-testid="email-input" />
          </div>
          <div class="form-group">
            <label for="password">Kata Sandi</label>
            <input type="password" id="password" name="password" placeholder="Masukkan password" data-testid="password-input" />
          </div>
          <button type="submit" data-testid="btn-login">Masuk Ke Akun</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

// Process Login Form Submission
app.post('/login', (req, res) => {
  res.redirect('/dashboard');
});

// Render Dashboard Page HTML
app.get('/dashboard', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>Dashboard</title>
    </head>
    <body>
      <div style="padding: 40px;">
        <h1 data-testid="dashboard-header">Selamat Datang Kembali</h1>
        <p>Anda telah berhasil masuk ke dashboard pengujian.</p>
      </div>
    </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`[Demo Server] Running at http://localhost:${port}/login`);
});
