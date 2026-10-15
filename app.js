require('dotenv').config();

const express = require('express');
const expressLayout = require('express-ejs-layouts');
const methodOverride = require('method-override');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');

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
app.use('/modshub', createModshubRouter({
  store: createMongoStore(),
  jwtSecret: process.env.JWT_SECRET
}));

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