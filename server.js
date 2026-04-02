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
const Match = mongoose.model('Match', { 
    teams: String,      // ex: "France - Argentine"
    date: Date, 
    status: { type: String, default: 'open' }, // 'open' ou 'closed' (après le coup d'envoi)
    result: { type: String, default: null }    // Score final pour le calcul
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
    const bets = await Bet.find().sort({ _id: -1 });
    const matches = await Match.find({ status: 'open' }); // On ne montre que les matchs ouverts
    res.render('index', { user: req.session.user, bets, matches });
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
        const { matchId, prediction } = req.body;
        
        // On récupère le match pour avoir les noms et drapeaux
        const matchData = await Match.findById(matchId);
        
        const newBet = new Bet({ 
            user: req.session.user.username, 
            matchId: matchData._id, // Indispensable pour l'affichage visuel
            teams: matchData.teams, // ex: "🇫🇷 France - 🇩🇪 Allemagne"
            prediction: prediction // "1", "N" ou "2"
        });
        
        await newBet.save();
        res.redirect('/');
    } catch (err) {
        res.status(500).send("Erreur lors du pari");
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});
// Route pour afficher la page admin (protection par mot de passe simple)
app.get('/admin/:password', async (req, res) => {
    const secret = process.env.ADMIN_PASSWORD || "admin123"; // "admin123" par défaut si pas sur Render
    
    if (req.params.password !== secret) {
        return res.status(403).send("Accès refusé. Mauvais mot de passe dans l'URL.");
    }

    try {
        const allBets = await Bet.find().sort({ date: -1 });
        res.render('admin', { bets: allBets, adminPass: req.params.password });
    } catch (err) {
        res.status(500).send("Erreur serveur");
    }
});

// Route pour supprimer un pari (si un collègue fait une erreur)
app.post('/admin/delete/:id', async (req, res) => {
    // On pourrait vérifier le pass ici aussi pour plus de sécurité
    await Bet.findByIdAndDelete(req.params.id);
    res.redirect('back'); // Revient sur la page précédente
});
// Créer un match
app.post('/admin/match', async (req, res) => {
    const newMatch = new Match({ teams: req.body.teams, date: req.body.date });
    await newMatch.save();
    res.redirect('back');
});

// Supprimer un match
app.post('/admin/match/delete/:id', async (req, res) => {
    await Match.findByIdAndDelete(req.params.id);
    res.redirect('back');
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur lancé sur le port ${PORT}`);
});












