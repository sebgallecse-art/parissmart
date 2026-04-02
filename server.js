const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();

// 1. Connexion MongoDB
const MONGO_URI = "mongodb+srv://sebgalle:0603734703aA!@cluster0.jq6f9sg.mongodb.net/paris?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ Connecté à MongoDB !"))
  .catch(err => console.error("❌ Erreur de connexion :", err));

// 2. Modèles de données
const User = mongoose.model('User', { 
    username: String, 
    password: { type: String, required: true } 
});

const Bet = mongoose.model('Bet', { 
    user: String, 
    match: String, 
    prediction: String 
});

// 3. Configuration de l'application
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));

// Configuration UNIQUE de la session
app.use(session({
    secret: 'secret-key-pour-les-paris',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: MONGO_URI }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 24 heures
}));

// --- ROUTES ---

// Accueil (avec correction de la syntaxe async)
app.get('/', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    try {
        const betsFromDB = await Bet.find(); 
        res.render('index', { user: req.session.user, bets: betsFromDB });
    } catch (err) {
        res.status(500).send("Erreur lors de la récupération des paris");
    }
});

app.get('/login', (req, res) => res.render('login'));

// Inscription
app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.send("Ce nom d'utilisateur est déjà pris.");

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();
        res.redirect('/login');
    } catch (err) {
        res.status(500).send("Erreur lors de l'inscription");
    }
});

// Connexion
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });

        if (user && await bcrypt.compare(password, user.password)) {
            req.session.user = { id: user._id, username: user.username };
            res.redirect('/');
        } else {
            res.send("Identifiants incorrects. <a href='/login'>Réessayer</a>");
        }
    } catch (err) {
        res.status(500).send("Erreur lors de la connexion");
    }
});

// Paris (Correction : enregistrement dans MongoDB et pas dans un tableau vide)
app.post('/bet', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    try {
        const newBet = new Bet({ 
            user: req.session.user.username, 
            match: req.body.match, 
            prediction: req.body.prediction 
        });
        await newBet.save();
        res.redirect('/');
    } catch (err) {
        res.status(500).send("Erreur lors de l'enregistrement du pari");
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Serveur lancé sur le port ${PORT}`));












