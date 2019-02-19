import { AES, enc } from 'crypto-js';
import { Request, Response } from 'express';
import * as session from 'express-session';
import * as passport from 'passport';
import UserClient from './lib/model/user-client';
import { getConfig } from './config-helper';
import * as express from 'express';
import { getMySQLInstance } from './lib/model/db/mysql';
const LocalStrategy = require('passport-local');
const PromiseRouter = require('express-promise-router');
const MySQLStore = require('express-mysql-session')(session);
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

const db = getMySQLInstance();

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
    async (req: Request, email: string, password: string, done: any) => {
      let user = null;

      await db.query(
        "SELECT * FROM `user_clients` WHERE `email` = '" + email + "'",
        function(err: any, rows: any) {
          if (err) return done(err);
          if (!rows.length) {
            done({ type: 'email', message: 'No such user found' }, false);
            return;
          }

          // if the user is found but the password is wrong
          if (!UserClient.passwordIsValid(rows[0], password)) {
            done(
              { type: 'loginMessage', message: 'Oops! Wrong password.' },
              false
            );
          }

          // all is well, return successful user
          return done(null, rows[0]);
        }
      );
    }
  )
);

//register
router.post('/register', (req: Request, res: Response) => {
  const { client_id, email, password } = req.body;

  if (!email) {
    return res.status(422).json({
      errors: {
        email: 'is required',
      },
    });
  }

  if (!password) {
    return res.status(422).json({
      errors: {
        password: 'is required',
      },
    });
  }

  const finalUser = UserClient.save({
    client_id,
    email,
    age: '',
    gender: 'm',
    password,
  }).then(result => {
    if (result) {
      const user = UserClient.findAccount(email).then(user => {
        res.json(user);
      });
    }
  });
});

router.post('/login', (req: Request, res: Response) => {
  const { client_id, email, password } = req.body;

  passport.authenticate('local', {
    // successRedirect: '/profile',
    // failureRedirect: '/login',
    // failureFlash: false,
  }),
    function(req: Request, res: Response, info: any) {
      console.log(res.statusMessage);
      console.log(req.user);
      res.json(req.user.toAuthJSON());
    };
});

router.get('/logout', (request: Request, response: Response) => {
  response.clearCookie('connect.sid');
  response.redirect('/');
});

export default router;
