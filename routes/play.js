const express    = require('express');
const router     = express.Router();
const { isAuthenticated }      = require('../utils/middleware');
const { isOwner }              = require('../utils/owners');
const { transfer }             = require('../utils/transferManager');
const { getTickets, deductTickets, addTickets } = require('../utils/db');

const FORMPIX_URL      = process.env.formpixUrl;
const API_KEY          = process.env.apiKey;
const POOL_ID          = Number(process.env.poolID);
const TICKETS_PER_PLAY = 5;
const FLAT_PRICE       = 25;

// POST /api/playSound
router.post('/api/playSound', isAuthenticated, async (req, res) => {
    const { formbar, meme, pin, useTickets } = req.body;
    const userId = req.session.userId;
    const owner   = isOwner(userId);

    if (!formbar && !meme) {
        return res.status(400).json({ error: 'You must provide at least one of formbar or meme.' });
    }
    
    if (formbar && meme) {
        return res.status(400).json({ error: 'You can only play one sound at a time. If both formbar and meme are provided, the request will be rejected.' });
    }

    if (!owner) {
        if (!POOL_ID || isNaN(POOL_ID)) {
            return res.status(500).json({ error: 'Server misconfigured: POOL_ID not set.' });
        }

        if (useTickets) {
            // --- Ticket path ---
            try {
                const balance = await getTickets(userId);
                if (balance < TICKETS_PER_PLAY) {
                    return res.status(402).json({ error: `Not enough tickets (have ${balance}, need ${TICKETS_PER_PLAY}).` });
                }
                await deductTickets(userId, TICKETS_PER_PLAY);
                console.log(`[Payment] Deducted ${TICKETS_PER_PLAY} tickets from ${userId} — ${balance - TICKETS_PER_PLAY} remaining`);
            } catch (err) {
                console.error('[Payment] Ticket deduction failed:', err.message);
                return res.status(402).json({ error: err.message });
            }
        } else {
            // --- Flat digipog path ---
            if (!pin) {
                return res.status(400).json({ error: 'PIN is required.' });
            }
            try {
                console.log(`[Payment] Charging ${FLAT_PRICE} digi from ${userId} to pool ${POOL_ID}`);
                await transfer({
                    from:   Number(userId),
                    to:     POOL_ID,
                    amount: FLAT_PRICE,
                    pin:    Number(pin),
                    reason: `Soundbar — ${formbar || meme}`
                });
                console.log('[Payment] Transfer successful');
            } catch (err) {
                console.error('[Payment] Transfer failed:', err.message);
                return res.status(402).json({ error: err.message || 'Payment failed.' });
            }
        }
    } else {
        console.log(`[Payment] Owner ${userId} (${req.session.user}) — bypassing payment`);
    }

    // Play the sound on Formpix
    const params = new URLSearchParams();
    if (formbar) params.append('formbar', formbar);
    if (meme) params.append('meme', meme);
    const url = `${FORMPIX_URL}/api/playSound?${params.toString()}`;
    console.log('[Formpix] Playing:', url);

    try {
        const response = await fetch(url, {
            method:  'POST',
            headers: { 'API': API_KEY, 'Content-Type': 'application/json' }
        });
        console.log('[Formpix] playSound response:', response.status, response.statusText);
        
        // If request failed, refund tickets (only if user paid with tickets)
        if (response.status !== 200 && !owner && useTickets) {
            try {
                await addTickets(userId, TICKETS_PER_PLAY);
                console.log(`[Payment] Refunded ${TICKETS_PER_PLAY} tickets to ${userId} due to playSound failure (status ${response.status})`);
            } catch (refundErr) {
                console.error('[Payment] Ticket refund failed:', refundErr.message);
            }
        }
        
        // Return updated ticket balance so client can refresh display immediately
        const ticketBalance = owner ? null : await getTickets(userId).catch(() => null);
        res.status(response.status).json({ status: response.status, tickets: ticketBalance });
    } catch (err) {
        console.error('[Formpix] playSound error:', err);
        
        // If request errored, refund tickets (only if user paid with tickets)
        if (!owner && useTickets) {
            try {
                await addTickets(userId, TICKETS_PER_PLAY);
                console.log(`[Payment] Refunded ${TICKETS_PER_PLAY} tickets to ${userId} due to network error`);
            } catch (refundErr) {
                console.error('[Payment] Ticket refund failed:', refundErr.message);
            }
        }
        
        res.status(500).json({ error: 'Failed to contact Formpix.' });
    }
});

module.exports = router;
