require('dotenv').config();

const express = require('express');
const expressLayout = require('express-ejs-layouts');
const methodOverride = require('method-override');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');

const mongoose = require('mongoose');
const User = require('./server/models/User');
const connectDB = require('./server/config/db');
const { isActiveRoute } = require('./server/helpers/routeHelpers');
const { createModshubRouter } = require('./server/modshub');
const { createMongoStore } = require('./server/modshub/store.mongo');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;


// Connect to DB
connectDB();

// ModsHub Post Studio (/modshub). Mounted before the global body parsers
// because it needs larger JSON limits and does its own cookie/auth handling.
const modshubStore = createMongoStore();
const MODSHUB_WORKSPACE = process.env.MODSHUB_WORKSPACE || 'shared';
app.use('/modshub', createModshubRouter({
  store: modshubStore,
  jwtSecret: process.env.JWT_SECRET,
  // Every admin works in one shared calendar.
  workspaceId: MODSHUB_WORKSPACE,
  resolveUsername: async (userId) => {
    const user = await User.findById(userId).select('username').lean();
    return user ? user.username : userId;
  }
}));
// One-off, idempotent: move calendars created before sharing into the shared one.
mongoose.connection.once('open', () => {
  modshubStore.adoptWorkspace(MODSHUB_WORKSPACE)
    .then((moved) => { if (moved) console.log(`ModsHub Studio: moved ${moved} documents into the shared calendar`); })
    .catch((error) => console.error('ModsHub Studio: workspace merge failed', error));
});

app.use(express.urlencoded({ extended: true })); // turn on HTML Forms
app.use(express.json()); // turn on JSON
app.use(cookieParser());
app.use(methodOverride('_method'));


app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI
  }),
  cookie: { httpOnly: true,
  //  secure: true,
  //  maxAge: new Date ( Date.now() + (3600000))
  },
}))

app.use(express.static('public'));

// Templating engine
app.use(expressLayout);
app.set('layout', './layouts/main');
app.set('view engine', 'ejs');

app.locals.isActiveRoute = isActiveRoute;
app.locals.siteUrl = process.env.SITE_URL || 'http://localhost:3000';

app.use((req, res, next) => {
  res.locals.currentUrl = req.originalUrl;
  next();
});

app.use('/', require('./server/routes/main'));
app.use('/', require('./server/routes/admin'));

app.use((req, res) => {
  res.status(404).render('404', {
    locals: { title: '404', description: 'Page not found' },
    currentRoute: ''
  });
});

app.use((err, req, res, next) => { console.error(err); res.status(500).send('Server error'); });

app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
});