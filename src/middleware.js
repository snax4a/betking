const config = require('config');
const db = require('./db');
const helpers = require('./helpers');

const attachCurrentUserToRequest = async (req, res, next) => {
  const sessionId = req.cookies.session;

  if (sessionId && helpers.isValidUuid(sessionId)) {
    const user = await db.getUserBySessionId(sessionId);
    if (user) {
      req.currentUser = user; // TODO - make sure this is not available client side
    }
  }

  next();
};

// TODO - review the comments
const requireLoggedIn = async (req, res, next) => {
  if (!req.currentUser) {
    // this should maybe return login url?
    res.status(401).send('Unauthorized');
    return; // should this be here? do we need   res.end();?
  }

  next();
};

const require2fa = async (req, res, next) => {
  if (req.currentUser.mfa_key) {
    /* If user has 2fa enabled, check if req.body.otp is valid */
    req.check('otp').exists()
      .isInt()
      .isLength({min: 6, max: 6});

    const validationResult = await req.getValidationResult();
    if (!validationResult.isEmpty()) {
      return res.status(400).json({error: 'Invalid two factor code'});
    }

    const isOtpValid = helpers.isOtpValid(req.currentUser.mfa_key, req.body.otp);

    if (isOtpValid) {
      try {
        await db.insertTwoFactorCode(req.currentUser.id, req.body.otp);
        next();
      } catch (e) {
        if (e.message === 'CODE_ALREADY_USED') {
          res.status(400).json({error: 'You have used this two factor code recently. Wait until it refreshes (30 seconds usually)'});
        } else {
          throw e;
        }
      }
    } else {
      res.status(400).json({error: 'Invalid two factor code'});
    }

    return;
  }

  next();
};

const requireWhitelistedIp = async (req, res, next) => {
  const ip = helpers.getIp(req);

  const isIpWhitelisted = await db.isIpWhitelisted(ip, req.currentUser.id);
  if (!isIpWhitelisted) {
    await db.logoutAllSessionsWithoutWhitelistedIps(req.currentUser.id); // TODO should we just logout all sessions?
    return res.status(401).json({error: 'IP not whitelisted'});
  }

  next();
};

const requireAdminSecret = async (req, res, next) => {
  if (req.body.secret !== config.get('ADMIN_ACCESS_SECRET')) {
    return res.status(403).json({error: 'Unauthorized'});
  }

  next();
};

module.exports = {
  attachCurrentUserToRequest,
  requireLoggedIn,
  require2fa,
  requireWhitelistedIp,
  requireAdminSecret
};
