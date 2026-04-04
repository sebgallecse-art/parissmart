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
    username: { type: String, unique: true, required: true }, 
    firstName: { type: String, required: true }, // Ajoute required: true pour être sûr
    lastName: { type: String, required: true }, 
    password: { type: String, required: true } 
});

const Bet = mongoose.model('Bet', {
    user: String,
    matchId: String,
    teams: String,   // Indispensable pour afficher le nom du match
    code1: String,   // Indispensable pour le drapeau
    code2: String,   // Indispensable pour le drapeau
    prediction: String
});
const Match = mongoose.model('Match', { 
    teams: String, 
    code1: String, // ex: fr
    code2: String, // ex: de
    date: Date,
	result: { type: String, default: null } // Sera '1', 'N' ou '2'
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
        const { email, firstName, lastName, password } = req.body;
        console.log("Données reçues :", req.body); // Regarde tes logs Render pour voir ça

        const newUser = new User({ 
            username: email.toLowerCase(), 
            firstName, 
            lastName, 
            password 
        });

        await newUser.save();
        res.redirect('/');
    } catch (err) {
        console.error("ERREUR INSCRIPTION :", err); // <--- Très important pour débugger
        res.status(500).send("Erreur lors de l'inscription : " + err.message);
    }
});

// Connexion
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        // On force la recherche en minuscules pour correspondre à l'inscription
        const user = await User.findOne({ 
            username: username.toLowerCase(), 
            password: password 
        });

        if (user) {
            req.session.user = user;
            res.redirect('/');
        } else {
            // C'est ce message que tu vois
            res.send("Identifiants incorrects. <a href='/'>Réessayer</a>");
        }
    } catch (err) {
        res.status(500).send("Erreur serveur");
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
        date: date,
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












