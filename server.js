require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Public folder ko frontend ke roop me serve karna
app.use(express.static(path.join(__dirname, 'public')));

// Frontend is '/api/download' par URL bhejega
app.post('/api/download', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: "Please provide an Instagram URL" });
    }

    // RapidAPI setup (Yahan env variable use ho raha hai)
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
        res.json(response.data);
    } catch (error) {
        console.error("API Error details:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "Failed to fetch media from RapidAPI." });
    }
});

app.listen(PORT, () => {
    console.log(`Server is successfully running on port ${PORT}`);
});
