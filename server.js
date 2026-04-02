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
    teams: String, 
    code1: String, // ex: fr
    code2: String, // ex: de
    date: Date, 
    status: { type: String, default: 'open' } 
});

function getFlag(country) {
    const flags = {
        "France": "🇫🇷", "Belgique": "🇧🇪", "Allemagne": "🇩🇪", 
        "Espagne": "🇪🇸", "Italie": "🇮🇹", "Portugal": "🇵🇹", 
        "Angleterre": "🇬🇧", "Argentine": "🇦🇷", "Bresil": "🇧🇷",
        "Maroc": "🇲🇦", "Suisse": "🇨🇭"
    };
    return flags[country] || "🏳️"; // Drapeau blanc si inconnu
}

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
    
    const matches = await Match.find();
    const myBets = await Bet.find({ user: req.session.user.username });
    
    // On crée une liste simple des IDs de matchs déjà pariés
    const bettedMatchIds = myBets
    .filter(b => b.matchId) 
    .map(b => b.matchId.toString());

    res.render('index', { 
        user: req.session.user, 
        matches: matches, 
        bets: myBets,
        bettedMatchIds: bettedMatchIds // On envoie ça à la vue
    });
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
    try {
        const { matchId, prediction, betId } = req.body;
        
        // On récupère les infos du match pour les copier dans le pari
        const matchData = await Match.findById(matchId); 

        if (betId) {
            // Mise à jour
            await Bet.findByIdAndUpdate(betId, {
                prediction: prediction,
                teams: matchData.teams, // On enregistre le nom ici
                code1: matchData.code1, // On enregistre le code pays ici
                code2: matchData.code2  // On enregistre le code pays ici
            });
        } else {
            // Nouveau pari
            const newBet = new Bet({ 
                user: req.session.user.username, 
                matchId: matchId,
                teams: matchData.teams, // CRUCIAL
                code1: matchData.code1, // CRUCIAL
                code2: matchData.code2, // CRUCIAL
                prediction: prediction 
            });
            await newBet.save();
        }
        res.redirect('/');
    } catch (err) {
        res.status(500).send("Erreur");
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
    const { team1, code1, team2, code2, date } = req.body;
    const newMatch = new Match({ 
        teams: `${team1} - ${team2}`,
        code1: code1.toLowerCase(),
        code2: code2.toLowerCase(),
        date: date
		status: 'open'
    });
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












