require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security Headers ──
app.use(helmet({
    contentSecurityPolicy: false, 
    crossOriginEmbedderPolicy: false
}));

// ── CORS Config (FIXED) ──
// Ab ye Render aur kisi bhi domain par bina error ke chalega
app.use(cors());

// ── Body Parser ──
app.use(express.json({ limit: '10kb' }));

// ── Request Logger ──
if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// ── Rate Limiter — Global ──
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a few minutes.' }
});
app.use(globalLimiter);

// ── Rate Limiter — API route (stricter) ──
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 15,
    message: { error: 'API rate limit reached. Try again in a minute.' }
});

// ── Static Files ──
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
}));

// ── Instagram URL Validator ──
function isValidInstagramUrl(url) {
    try {
        const parsed = new URL(url);
        return (
            parsed.hostname === 'www.instagram.com' ||
            parsed.hostname === 'instagram.com'
        ) && parsed.pathname.length > 1;
    } catch {
        return false;
    }
}

// ── Health Check ──
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
    });
});

// ── Main Download Endpoint ──
app.post('/api/download', apiLimiter, async (req, res) => {
    const { url } = req.body;

    // Validation
    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL is required.' });
    }
    if (url.length > 500) {
        return res.status(400).json({ error: 'URL is too long.' });
    }
    if (!isValidInstagramUrl(url)) {
        return res.status(400).json({ error: 'Invalid Instagram URL.' });
    }
    if (!process.env.RAPIDAPI_KEY) {
        console.error('RAPIDAPI_KEY is not set in .env');
        return res.status(500).json({ error: 'Server configuration error.' });
    }

    try {
        const response = await axios.request({
            method: 'POST',
            url: 'https://instagram120.p.rapidapi.com/api/instagram/links',
            headers: {
                'Content-Type': 'application/json',
                'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'instagram120.p.rapidapi.com'
            },
            data: { url },
            timeout: 15000 // 15s timeout
        });

        // Empty / unexpected response check
        if (!response.data || (Array.isArray(response.data) && response.data.length === 0)) {
            return res.status(404).json({ error: 'No media found for this link.' });
        }

        return res.json(response.data);

    } catch (error) {
        // RapidAPI-specific errors
        if (error.response) {
            const status = error.response.status;
            if (status === 401 || status === 403) {
                console.error('RapidAPI auth error:', status);
                return res.status(500).json({ error: 'API authentication failed.' });
            }
            if (status === 429) {
                return res.status(429).json({ error: 'API quota exceeded. Try again later.' });
            }
            if (status === 404) {
                return res.status(404).json({ error: 'Post not found or may be private.' });
            }
        }

        // Timeout
        if (error.code === 'ECONNABORTED') {
            return res.status(504).json({ error: 'Request timed out. Please try again.' });
        }

        console.error('Download API error:', error.message);
        return res.status(500).json({ error: 'Failed to fetch media. Please try again.' });
    }
});

// ── 404 Handler ──
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found.' });
});

// ── Global Error Handler ──
app.use((err, req, res, _next) => {
    console.error('Unhandled error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
});

// ── Start Server ──
const server = app.listen(PORT, () => {
    console.log(`🚀 ReelSave Pro server running on port ${PORT}`);
});

// ── Graceful Shutdown ──
function gracefulShutdown(signal) {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(() => {
        console.log('✅ Server closed.');
        process.exit(0);
    });
    // Force kill after 10s
    setTimeout(() => process.exit(1), 10000);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
