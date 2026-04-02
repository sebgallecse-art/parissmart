const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path'); // Nécessaire pour gérer les chemins de dossiers

const app = express(); // <--- CETTE LIGNE DOIT ÊTRE AVANT TOUT LE RESTE !

// Maintenant tu peux configurer 'app' car elle est initialisée
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'secret-key-pour-les-paris',
    resave: false,
    saveUninitialized: true
}));

// ... le reste de ton code (routes, etc.)

// "Base de données" temporaire
const users = [];
const bets = [];

// Middleware pour vérifier si l'utilisateur est connecté
const isAuthenticated = (req, res, next) => {
    if (req.session.user) return next();
    res.redirect('/login');
};

// ROUTES
app.get('/', isAuthenticated, (req, res) => {
    res.render('index', { user: req.session.user, bets: bets });
});

app.get('/login', (req, res) => res.render('login'));

app.post('/register', async (req, res) => {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    users.push({ username: req.body.username, password: hashedPassword });
    res.redirect('/login');
});

app.post('/login', async (req, res) => {
    const user = users.find(u => u.username === req.body.username);
    if (user && await bcrypt.compare(req.body.password, user.password)) {
        req.session.user = user;
        res.redirect('/');
    } else {
        res.send('Identifiants incorrects');
    }
});

app.post('/bet', isAuthenticated, (req, res) => {
    bets.push({ 
        user: req.session.user.username, 
        match: req.body.match, 
        prediction: req.body.prediction 
    });
    res.redirect('/');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Serveur lancé sur le port ${PORT}`));

/*app.listen(3000, () => console.log('Serveur lancé sur http://localhost:3000'));*/



