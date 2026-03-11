/**
 * Auth Router
 * Handles Formbar OAuth login and logout.
 * No database — session only.
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const FORMBAR_URL = process.env.formbarUrl;
const THIS_URL = process.env.thisURL;
const AUTH_URL = `${FORMBAR_URL}/oauth`;

// GET /login
// If ?token= is present, decode and store in session then redirect home.
// Otherwise redirect to Formbar OAuth.
router.get('/login', (req, res) => {
    if (req.query.token) {
        const rawToken = req.query.token;
        const tokenData = jwt.decode(rawToken);

        req.session.token = tokenData;
        req.session.user = tokenData.displayName;
        req.session.userId = tokenData.id;
        req.session.rawToken = rawToken;

        console.log(`[Auth] Logged in: ${tokenData.displayName} (ID: ${tokenData.id})`);
        res.redirect('/');
    } else {
        res.redirect(`${AUTH_URL}?redirectURL=${THIS_URL}/login`);
    }
});

// GET /logout
router.get('/logout', (req, res) => {
    const name = req.session.user;
    req.session.destroy();
    console.log(`[Auth] Logged out: ${name}`);
    res.redirect('/login');
});

module.exports = router;

