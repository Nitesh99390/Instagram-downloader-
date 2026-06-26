require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase Setup (Render Environment Variables se aayega)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
let supabase = null;
if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log("✅ Supabase Connected!");
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate Limiter: Spam rokne ke liye (5 minute me max 10 downloads per user)
const apiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, 
    max: 10,
    message: { error: "❌ Aapne limit cross kar di hai. 5 minute baad try karein." }
});

app.post('/api/download', apiLimiter, async (req, res) => {
    const { url } = req.body;

    if (!url) return res.status(400).json({ error: "URL is required" });

    const options = {
        method: 'POST',
        url: 'https://instagram120.p.rapidapi.com/api/instagram/links',
        headers: {
            'Content-Type': 'application/json',
            'X-RapidAPI-Key': process.env.RAPIDAPI_KEY, 
            'X-RapidAPI-Host': 'instagram120.p.rapidapi.com'
        },
        data: { url: url }
    };

    try {
        const response = await axios.request(options);
        const data = response.data;
        
        // Agar aap Supabase me history save karna chahte hain toh yahan logic aayega
        if (supabase && data && data[0] && data[0].urls) {
            // Example: Insert into a table named 'downloads'
            /*
            await supabase.from('downloads').insert([
                { url: url, status: 'success', timestamp: new Date() }
            ]);
            */
        }

        res.json(data);
    } catch (error) {
        console.error("API Error:", error.message);
        res.status(500).json({ error: "Failed to fetch data from API" });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
