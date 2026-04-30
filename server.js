require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const db = require('./db');
const startCronJobs = require('./cron/notifications');

const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir);
}

app.use('/uploads', express.static(uploadsDir));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/groups', require('./routes/groups'));

// File Upload Route (US6)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });
const authenticateToken = require('./middleware/auth');

app.post('/api/tasks/:id/upload', authenticateToken, upload.single('file'), (req, res) => {
    const taskId = req.params.id;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    db.get('SELECT * FROM tasks WHERE id = ? AND (user_id = ? OR assignee_id = ?)', [taskId, req.user.id, req.user.id], (err, task) => {
        if (!task) return res.status(403).json({ error: 'Unauthorized to attach to this task' });

        const stmt = db.prepare('INSERT INTO attachments (task_id, file_name, file_path) VALUES (?, ?, ?)');
        stmt.run([taskId, req.file.originalname, `/uploads/${req.file.filename}`], function(err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ message: 'File uploaded successfully', attachment_id: this.lastID });
        });
        stmt.finalize();
    });
});

// Notifications Route (US5 UI check)
app.get('/api/notifications', authenticateToken, (req, res) => {
    db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [req.user.id], (err, notifs) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(notifs);
    });
});

// Start Background Jobs
startCronJobs();

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
