const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
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
    firstName: { type: String, required: true },
    lastName: { type: String, required: true }, 
    password: { type: String, required: true } 
});

const Bet = mongoose.model('Bet', {
    user: String,
    matchId: String,
    teams: String,
    code1: String,
    code2: String,
    prediction: String
});

const Match = mongoose.model('Match', { 
    teams: String, 
    code1: String, 
    code2: String, 
    date: Date,
    result: { type: String, default: null }, 
    status: { type: String, default: 'open' } 
});

// 3. Configuration
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'secret-key-pour-les-paris',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: MONGO_URI }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// --- ROUTES UTILISATEURS ---

app.get('/', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    try {
        const matches = await Match.find();
        const myBets = await Bet.find({ user: req.session.user.username });
        const bettedMatchIds = myBets.filter(b => b.matchId).map(b => b.matchId.toString());

        res.render('index', { 
            user: req.session.user, 
            matches: matches, 
            bets: myBets,
            bettedMatchIds: bettedMatchIds 
        });
    } catch (err) { res.status(500).send("Erreur de chargement"); }
});

app.get('/login', (req, res) => res.render('login'));

app.post('/register', async (req, res) => {
    try {
        const { email, firstName, lastName, password } = req.body;
        const newUser = new User({ 
            username: email.toLowerCase(), 
            firstName, lastName, password 
        });
        await newUser.save();
        res.redirect('/');
    } catch (err) { res.status(500).send("Erreur inscription : " + err.message); }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username: username.toLowerCase(), password: password });
    if (user) {
        req.session.user = user;
        res.redirect('/');
    } else {
        res.send("Identifiants incorrects. <a href='/'>Réessayer</a>");
    }
});

app.post('/bet', async (req, res) => {
    try {
        const { matchId, prediction, betId } = req.body;
        const matchData = await Match.findById(matchId); 

        if (betId) {
            await Bet.findByIdAndUpdate(betId, { prediction: prediction });
        } else {
            const newBet = new Bet({ 
                user: req.session.user.username, 
                matchId: matchId,
                teams: matchData.teams,
                code1: matchData.code1,
                code2: matchData.code2,
                prediction: prediction 
            });
            await newBet.save();
        }
        res.redirect('/');
    } catch (err) { res.status(500).send("Erreur lors du pari"); }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// --- ROUTES ADMIN ---

app.get('/admin/:password', async (req, res) => {
    const secret = process.env.ADMIN_PASSWORD || "admin123";
    if (req.params.password !== secret) return res.status(403).send("Accès refusé.");

    try {
        const allBets = await Bet.find();
        const allMatches = await Match.find(); // CRUCIAL : On récupère les matchs !
        res.render('admin', { 
            bets: allBets, 
            matches: allMatches, 
            adminPass: req.params.password 
        });
    } catch (err) { res.status(500).send("Erreur serveur"); }
});

app.post('/admin/match', async (req, res) => {
    const { team1, code1, team2, code2, date } = req.body;
    const newMatch = new Match({ 
        teams: `${team1} - ${team2}`,
        code1: code1.toLowerCase(),
        code2: code2.toLowerCase(),
        date: date
    });
    await newMatch.save();
    res.redirect('back');
});

app.post('/admin/match/result', async (req, res) => {
    try {
        const { matchId, result } = req.body;
        await Match.findByIdAndUpdate(matchId, { result: result });
        res.redirect('back'); // Revient sur la page admin avec le bon mot de passe
    } catch (err) { res.status(500).send("Erreur résultat"); }
});

app.post('/admin/match/delete', async (req, res) => {
    await Match.findByIdAndDelete(req.body.matchId);
    res.redirect('back');
});

app.post('/admin/delete/:id', async (req, res) => {
    await Bet.findByIdAndDelete(req.params.id);
    res.redirect('back');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Serveur sur le port ${PORT}`));