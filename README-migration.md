Migration to Node.js

Quick start:

1. Install dependencies

```bash
cd Simple_Reviewer
npm install
```

2. Start the server

```bash
npm start
```

3. Open the app in a browser:

http://localhost:3000/index.html

Notes:
- The server exposes the legacy endpoint `/process.php` so the existing frontend `assets/js/app.js` continues to work.
- The server uses MySQL with user `root` and empty password and will create the `simple_reviewer` database and tables if missing.
