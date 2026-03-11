const express    = require('express');
const router     = express.Router();
const { isAuthenticated } = require('../utils/middleware');

const FORMPIX_URL = process.env.formpixUrl;
const API_KEY     = process.env.apiKey;

// GET /api/getSounds — fetch sound list from Formpix
router.get('/api/getSounds', isAuthenticated, async (req, res) => {
    try {
        const { type } = req.query;
        
        // Validate type parameter if provided
        if (type && !['formbar', 'meme'].includes(type)) {
            return res.status(400).json({ error: 'Invalid type value. Accepted values: formbar, meme.' });
        }
        
        let url = `${FORMPIX_URL}/api/getSounds`;
        if (type) {
            url += `?type=${encodeURIComponent(type)}`;
        }
        
        console.log(`[Formpix] GET ${url}`);
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'API': API_KEY, 'Content-Type': 'application/json' }
        });
        console.log(`[Formpix] getSounds: ${response.status} ${response.statusText}`);
        const data = await response.json();
        console.log('[Formpix] getSounds response:', data);
        res.json(data);
    } catch (err) {
        console.error('[Formpix] getSounds error:', err);
        res.status(500).json({ error: 'Failed to fetch sounds from Formpix.' });
    }
});

module.exports = router;
