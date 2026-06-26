require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase Connection
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Frontend ko initialization ke liye keys dena
app.get('/api/config', (req, res) => {
    res.json({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseKey: process.env.SUPABASE_KEY
    });
});

// Download API with User Email tracking
app.post('/api/download', async (req, res) => {
    const { url, email } = req.body;

    if (!url) return res.status(400).json({ error: "URL is required" });
    if (!email) return res.status(401).json({ error: "Please login first" });

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
        
        let isSuccess = false;
        if (data && data[0] && data[0].urls && data[0].urls[0] && data[0].urls[0].url) {
            isSuccess = true;
        }

        // Supabase me entry save karna zindagi bhar ke liye
        await supabase.from('downloads').insert([
            { 
                user_email: email, 
                url: url, 
                status: isSuccess ? 'Success' : 'Failed' 
            }
        ]);

        res.json(data);
    } catch (error) {
        console.error("API Error:", error.message);
        res.status(500).json({ error: "Failed to fetch data from API" });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
