import { AES, enc } from 'crypto-js';
const LocalStrategy = require('passport-local');
import { Request, Response } from 'express';
const PromiseRouter = require('express-promise-router');
import * as session from 'express-session';
const MySQLStore = require('express-mysql-session')(session);
import * as passport from 'passport';
import UserClient from './lib/model/user-client';
import { getConfig } from './config-helper';
import * as express from 'express';
const bodyParser = require('body-parser');

const {
  ENVIRONMENT,
  MYSQLHOST,
  MYSQLDBNAME,
  MYSQLUSER,
  MYSQLPASS,
  PROD,
  SECRET,
} = getConfig();

const router = PromiseRouter();

router.use(require('cookie-parser')());
router.use(
  session({
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      secure: PROD,
    },
    secret: SECRET,
    store: new MySQLStore({
      host: MYSQLHOST,
      user: MYSQLUSER,
      password: MYSQLPASS,
      database: MYSQLDBNAME,
      createDatabaseTable: false,
    }),
    proxy: true,
    resave: false,
    saveUninitialized: false,
  })
);
router.use(passport.initialize());
router.use(passport.session());

router.use(bodyParser.json()); // to support JSON-encoded bodies
router.use(
  bodyParser.urlencoded({
    // to support URL-encoded bodies
    extended: true,
  })
);
router.use(express.json()); // to support JSON-encoded bodies
router.use(express.urlencoded()); // to support URL-encoded bodies

passport.serializeUser((user: any, done: Function) => done(null, user));
passport.deserializeUser((sessionUser: any, done: Function) =>
  done(null, sessionUser)
);

//AUTH STRATEGY
passport.use(
  new LocalStrategy(
    {
      usernameField: 'email',
      passwordField: 'password',
      passReqToCallback: true,
    },
    (req: Request, email: string, password: string, done: any) => {
      if (!email || !password) {
        return done(null, false);
      }

      var salt =
        'FEP`3s2^:E0DV(Mcz&=k:q3qD|9<_r^F0ETonL >EE{ rjc#Ga1E0p8z7pX.XO|?';

      UserClient.findAccount(email)
        .then(user => {
          if (!user || !UserClient.validatePassword(user, password)) {
            return done(null, false, {
              errors: { 'email or password': 'is invalid' },
            });
          }

          return done(null, user);
        })
        .catch(done);
    }
  )
);

//register
router.post('/register', (req: Request, res: Response) => {
  console.log(req.body.email);
  const user = req.body;

  if (!user.email) {
    return res.status(422).json({
      errors: {
        email: 'is required',
      },
    });
  }

  if (!user.password) {
    return res.status(422).json({
      errors: {
        password: 'is required',
      },
    });
  }

  // const finalUser = new UserClient(user);

  // finalUser.setPassword(user.password);

  // return finalUser.saveAccount()
  //     .then(() => res.json({ user: finalUser.toAuthJSON() }));
});

router.post(
  '/signin',
  passport.authenticate('local', {
    successRedirect: '/profile',
    failureRedirect: '/login',
    failureFlash: false,
  }),
  function(req: Request, res: Response, info: any) {
    console.log(res.statusMessage);
    info();
  }
);

router.post('/login', (request: Request, response: Response) => {
  console.log(request.body);
  passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login',
    failureFlash: false,
  } as any)(request, response);
});

router.get('/logout', (request: Request, response: Response) => {
  response.clearCookie('connect.sid');
  response.redirect('/');
});

export default router;
