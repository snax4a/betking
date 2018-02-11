const config = require('config');
const promise = require('bluebird');
const uuidV4 = require('uuid/v4');
const BigNumber = require('bignumber.js');
const helpers = require('./helpers');
const dice = require('./games/dice');

const initOptions = {
  promiseLib: promise, // overriding the default (ES6 Promise);
  error (error, e) {
    error.DB_ERROR = true;
  }
};

const pgp = require('pg-promise')(initOptions);
const db = pgp(config.get('DB_CONNECTION_STRING'));

// Case-insensitive
const isEmailAlreadyTaken = async (email) => {
  const existingEmail = await db.oneOrNone('SELECT email FROM users WHERE lower(email) = lower($1)', email);
  return !!existingEmail;
};

// Case-insensitive
const isUserNameAlreadyTaken = async (username) => {
  const existingUserName = await db.oneOrNone('SELECT username FROM users WHERE lower(username) = lower($1)', username);
  return !!existingUserName;
};

// Case-insensitive
const getUserByName = async (username) => {
  const user = await db.oneOrNone('SELECT * FROM users WHERE lower(username) = lower($1)', username);
  return user;
};

const getUserBySessionId = async (sessionId) => {
  const user = await db.oneOrNone('SELECT users.* FROM users JOIN active_sessions ON users.id = active_sessions.user_id WHERE active_sessions.id = $1 GROUP BY users.id', sessionId);
  return user;
};

const getUserByEmail = async (email) => {
  const user = await db.oneOrNone('SELECT * FROM users WHERE lower(email) = lower($1)', email);
  return user;
};

const createUser = async (username, password, email, affiliateId) => {
  const result = await db.one('INSERT INTO users (username, password, email, affiliate_id) VALUES ($1, $2, $3, $4) RETURNING *', [username, password, email, affiliateId]);
  return result;
};

const createSession = async (userId, expires, ip, fingerprint) => {
  const result = await db.one('INSERT INTO sessions (id, user_id, expired_at, ip_address, fingerprint) VALUES ($1, $2, NOW() + $3::interval, $4, $5) RETURNING *', [uuidV4(), userId, expires, ip, fingerprint]);
  return result;
};

const logoutSession = async (userId, sessionId) => {
  await db.none('UPDATE sessions set logged_out_at = NOW() WHERE user_id = $1 AND id = $2', [userId, sessionId]);
};

const logoutAllSessions = async (userId) => {
  await db.none('UPDATE sessions set logged_out_at = NOW() WHERE user_id = $1', userId);
};

const logLoginAttempt = async (userId, isSuccess, ip, fingerprint, userAgent) => {
  const result = await db.one('INSERT INTO login_attempts (id, user_id, is_success, ip_address, fingerprint, user_agent) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [uuidV4(), userId, isSuccess, ip, fingerprint, userAgent]);
  return result;
};

const log2faAttempt = async (userId, isSuccess, ip, fingerprint, userAgent) => {
  const result = await db.one('INSERT INTO mfa_attempts (user_id, is_success, ip_address, fingerprint, user_agent) VALUES ($1, $2, $3, $4, $5) RETURNING *', [userId, isSuccess, ip, fingerprint, userAgent]);
  return result;
};

const getConsecutiveFailedLogins = async (userId) => {
  const result = await db.one('select count(*) from login_attempts where created_at > NOW() - interval \'60 seconds\' AND is_success = false AND user_id = $1;', userId);
  return result.count;
};

const lockUserAccount = async (userId) => {
  await db.none('UPDATE users SET locked_at = NOW() WHERE id = $1', userId);
};

const updateEmail = async (userId, email) => {
  await db.tx(t => {
    return t.batch([
      t.none('UPDATE users set email = $2, email_verified = false WHERE id = $1', [userId, email]),
      t.none('UPDATE reset_tokens SET expired_at = NOW() WHERE user_id = $1 AND expired_at > NOW()', userId)
    ]);
  });
};

const updatePassword = async (userId, hash, currentSessionId) => {
  await db.tx(t => {
    return t.batch([
      t.none('UPDATE users set password = $2 WHERE id = $1', [userId, hash]),
      t.none('UPDATE sessions set logged_out_at = NOW() WHERE user_id = $1 AND id != $2', [userId, currentSessionId])
    ]);
  });
};

const getActiveSessions = async (userId) => {
  const result = await db.any('SELECT * FROM active_sessions WHERE user_id = $1', userId);
  return result;
};

const addTemp2faSecret = async (userId, tempSecret) => {
  const result = await db.one('UPDATE users set temp_mfa_key = $1 where id = $2 returning temp_mfa_key', [tempSecret, userId]);
  return result;
};

const enableTwofactor = async (userId) => {
  await db.none('UPDATE users set mfa_key = temp_mfa_key, temp_mfa_key = NULL where id = $1', userId);
};

const disableTwoFactor = async (userId) => {
  await db.none('UPDATE users set mfa_key = NULL, temp_mfa_key = NULL where id = $1', userId);
};

const insertTwoFactorCode = async (userId, code) => {
  await db.none('INSERT INTO mfa_passcodes (user_id, passcode) values ($1, $2)', [userId, code])
    .catch(e => {
      if (e.code === '23505') {
        throw new Error('CODE_ALREADY_USED');
      }

      throw e;
    });
};

const findLatestActiveResetToken = async (userId) => {
  const result = await db.oneOrNone('SELECT * from reset_tokens WHERE user_id = $1 AND expired_at > NOW() ORDER BY created_at DESC LIMIT 1', userId);
  return result;
};

const createResetToken = async (userId) => {
  const result = await db.one('INSERT INTO reset_tokens (id, user_id) VALUES ($1, $2) RETURNING *', [uuidV4(), userId]);
  return result;
};

const createVerifyEmailToken = async (userId, email) => {
  const result = await db.one('INSERT INTO verify_email_tokens (id, user_id, email) VALUES ($1, $2, $3) RETURNING *', [uuidV4(), userId, email]);
  return result;
};

const resetUserPasswordByToken = async (token, newPasswordHash) => {
  await db.tx(t => {
    return t.one('UPDATE reset_tokens SET used = true, expired_at = NOW() where id = $1 AND used = false AND expired_at > NOW() RETURNING user_id', token)
      .then(result => t.one('UPDATE users SET password = $1 WHERE id = $2 RETURNING *', [newPasswordHash, result.user_id]))
      .then(user => t.batch([
        t.none('UPDATE reset_tokens SET expired_at = NOW() WHERE user_id = $1 AND expired_at > NOW()', user.id),
        t.none('UPDATE sessions set logged_out_at = NOW() WHERE user_id = $1', user.id)
      ]));
  });
};

const addIpInWhitelist = async (ipAddress, userId) => {
  await db.none('INSERT INTO whitelisted_ips (ip_address, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [ipAddress, userId]);
};

const removeIpFromWhitelist = async (ipAddress, userId) => {
  await db.none('DELETE FROM whitelisted_ips WHERE ip_address = $1 AND user_id = $2', [ipAddress, userId]);
};

const getWhitelistedIps = async (userId) => {
  const result = await db.any('SELECT * FROM whitelisted_ips WHERE user_id = $1', userId);
  return result;
};

const isIpWhitelisted = async (ip, userId) => {
  /* Return true if user has no whitelisted ip entry OR if whitelisted ip matches ip, else false */
  const result = await db.oneOrNone('SELECT ip_address = $1 as whitelisted FROM whitelisted_ips WHERE user_id = $2', [ip, userId])
    .then(row => (!row || row.whitelisted));

  return result;
};

const logoutAllSessionsWithoutWhitelistedIps = async (userId) => {
  await db.none('UPDATE sessions set logged_out_at = NOW() FROM whitelisted_ips WHERE sessions.user_id = whitelisted_ips.user_id AND sessions.ip_address != whitelisted_ips.ip_address AND sessions.user_id = $1 AND sessions.logged_out_at IS NULL', userId);
};

const logError = async (msg, stack, reqId, userId, source, query, code) => {
  await db.none('INSERT INTO error_logs (msg, stack, req_id, user_id, source, db_query, db_code) VALUES ($1, $2, $3, $4, $5, $6, $7)', [msg, stack, reqId, userId, source, query, code])
    .catch(error => {
      // Do not throw error from here to prevent infinite loop
      console.log('Error writing to error logs', error);
    });
};

const logUnhandledRejectionError = async (msg, stack) => {
  await db.none('INSERT INTO error_logs (msg, stack, req_id, user_id, source, db_query, db_code) VALUES ($1, $2, $3, $4, $5, $6, $7)', [msg, stack, null, null, 'unhandledRejection', null, null])
    .catch(error => {
      // Do not throw error from here to prevent infinite loop
      console.log('Error writing to error logs', error);
    });
};

const logUncaughtExceptionError = async (msg, stack) => {
  await db.none('INSERT INTO error_logs (msg, stack, req_id, user_id, source, db_query, db_code) VALUES ($1, $2, $3, $4, $5, $6, $7)', [msg, stack, null, null, 'uncaughtException', null, null])
    .catch(error => {
      // Do not throw error from here to prevent infinite loop
      console.log('Error writing to error logs', error);
    });
};

const logEmailError = async (msg, stack, address, info) => {
  await db.none('INSERT INTO error_logs (msg, stack, to_email, mail_info, source) VALUES ($1, $2, $3, $4, $5)', [msg, stack, address, info, 'MAIL_ERROR'])
    .catch(error => {
      // Do not throw error from here to prevent infinite loop
      console.log('Error writing to error logs', error);
    });
};

const getLoginAttempts = async (userId) => {
  const results = await db.any('SELECT * FROM login_attempts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10', userId);
  return results;
};

const markEmailAsVerified = async (token) => {
  await db.tx(t => {
    return t.one('SELECT u.email, e.user_id FROM users AS u INNER JOIN verify_email_tokens AS e ON u.id = e.user_id WHERE e.id = $1', token)
      .then(res => t.batch([
        t.one('UPDATE verify_email_tokens SET used = $1, expired_at = NOW() where id = $2 AND used = false AND expired_at > NOW() AND email = $3 RETURNING email', [true, token, res.email]),
        t.none('UPDATE users SET email_verified = $1 WHERE id = $2', [true, res.user_id]),
        t.none('UPDATE verify_email_tokens SET expired_at = NOW() WHERE user_id = $1 AND expired_at > NOW() AND id != $2', [res.user_id, token])
      ]));
  });
};

/* CRYPTO */
const getAllCurrencies = async () => {
  const result = await db.any('SELECT * FROM currencies');
  return result;
};

const getAllBalancesForUser = async (userId) => {
  const result = await db.any('SELECT balance, currency from user_balances where user_id = $1', userId);
  return result;
};

const createWithdrawalEntry = async (userId, currency, withdrawalFee, amount, address) => {
  // TODO: totalFee should be calculated inside the query.
  const amountDeducted = new BigNumber(amount).toString();
  const amountReceived = new BigNumber(amount).minus(withdrawalFee)
    .toString();

  const result = await db.tx(t => {
    return t.oneOrNone('UPDATE user_balances SET balance = balance - $1 WHERE user_id = $2 AND currency = $3 AND balance >= $1 RETURNING balance', [amountDeducted, userId, currency])
      .then(res => {
        if (!res) {
          throw new Error('INSUFFICIENT_BALANCE');
        }

        // Check if user has enabled confirm withdrawals by email
        return t.one('SELECT confirm_wd from users where id = $1', userId);
      })
      .then(res => {
        const wdStatus = res.confirm_wd ? 'pending_email_verification' : 'pending';
        const verificationToken = res.confirm_wd ? uuidV4() : null;

        return t.one('INSERT INTO user_withdrawals (id, user_id, currency, amount, fee, status, address, verification_token) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *', [uuidV4(), userId, currency, amountReceived, withdrawalFee, wdStatus, address, verificationToken]);
      });
  });

  return result;
};

const setConfirmWithdrawalByEmail = async (userId, confirmWd) => {
  await db.oneOrNone('UPDATE users SET confirm_wd = $1 WHERE id = $2 AND email IS NOT NULL AND email_verified = true RETURNING *', [confirmWd, userId])
    .then(row => {
      if (!row) {
        throw new Error('VALID_USER_NOT_FOUND');
      }
    });
};

const confirmWithdrawByToken = async (token) => {
  await db.oneOrNone('UPDATE user_withdrawals SET status = $1, verified_at = NOW() WHERE verification_token = $2 AND status = $3 RETURNING *', ['pending', token, 'pending_email_verification'])
    .then(row => {
      if (!row) {
        throw new Error('INVALID_TOKEN');
      }
    });
};

const addDeposit = async (currency, amount, address, txid) => {
  // currencyToQuery is ETH if currency is an eth-token
  const currencyToQuery = helpers.getCurrencyToQueryFromAddressTable(currency);

  await db.tx(t => {
    return t.oneOrNone('SELECT user_id from user_addresses WHERE currency = $1 AND address = $2', [currencyToQuery, address])
      .then(row => {
        if (!row || !row.user_id) {
          throw new Error('USER_NOT_FOUND_FOR_ADDRESS');
        }

        const userId = row.user_id;

        // If tx already added, throw error
        return t.oneOrNone('SELECT COUNT(*) > 0 as tx_exists FROM user_deposits WHERE txid = $1 AND user_id = $2', [txid, userId])
          .then(row => {
            if (row && row.tx_exists) {
              throw new Error('TRANSACTION_EXISTS');
            }

            return userId;
          });
      })
      .then(userId => {
        // Add a tx entry in user_deposits
        return t.one('INSERT INTO user_deposits (id, user_id, currency, amount, address, txid) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [uuidV4(), userId, currency, amount, address, txid]);
      })
      .then(row => {
        /* Update or Insert Balance */
        // TODO: We can have a better query for this which uses upsert / on conflict update ?
        return t.oneOrNone('SELECT id FROM user_balances WHERE user_id = $1 AND currency = $2', [row.user_id, row.currency])
          .then(res => {
            if (!res) {
              return t.none('INSERT INTO user_balances (user_id, currency, balance) VALUES ($1, $2, $3)', [row.user_id, row.currency, row.amount]);
            }

            return t.none('UPDATE user_balances SET balance = balance + $1 WHERE id = $2', [row.amount, res.id]);
          });
      });
  });
};

const getDepositAddress = async (userId, currency) => {
  // currencyToQuery is ETH if currency is an eth-token
  const currencyToQuery = helpers.getCurrencyToQueryFromAddressTable(currency);

  const result = await db.tx(t => {
    return t.oneOrNone('SELECT address FROM user_addresses WHERE user_id = $1 AND currency = $2', [userId, currencyToQuery])
      .then(res => {
        if (res) {
          return res.address;
        }

        // Address not found in db. Find an available address
        return t.oneOrNone('SELECT id FROM user_addresses WHERE user_id IS NULL AND currency = $1 ORDER BY id LIMIT 1', currencyToQuery)
          .then(res => {
            if (!res) {
              /* No address is free in db for the currency. Log this ? */
              return null;
            }

            // Assign the available address to current user (revalidate that the address is free) and return address
            return t.oneOrNone('UPDATE user_addresses SET user_id = $1 WHERE id = $2 AND user_id IS NULL RETURNING address', [userId, res.id]);
          })
          .then(res => {
            if (!res) {
              /* TODO: Race condition? No address was updated */
              return null;
            }

            return res.address;
          });
      });
  });

  return result;
};

const getPendingWithdrawals = async (userId, limit, skip, sort) => {
  const results = await db.any('SELECT * FROM user_withdrawals WHERE user_id = $1 AND status IN ($2, $3, $4) ORDER BY $5~ DESC LIMIT $6 OFFSET $7', [userId, 'pending', 'pending_email_verification', 'processing', sort, limit, skip]);
  const total = await db.one('SELECT COUNT(*) FROM user_withdrawals WHERE user_id = $1 AND status IN ($2, $3, $4)', [userId, 'pending', 'pending_email_verification', 'processing']);

  return {results, count: total.count};
};

const getWithdrawalHistory = async (userId, limit, skip, sort) => {
  const results = await db.any('SELECT * FROM user_withdrawals WHERE user_id = $1 AND status = $2 ORDER BY $3~ DESC LIMIT $4 OFFSET $5', [userId, 'processed', sort, limit, skip]);
  const total = await db.one('SELECT COUNT(*) FROM user_withdrawals WHERE user_id = $1 AND status = $2', [userId, 'processed']);

  return {results, count: total.count};
};

const getDepositHistory = async (userId, limit, skip, sort) => {
  const results = await db.any('SELECT * FROM user_deposits WHERE user_id = $1 ORDER BY $2~ DESC LIMIT $3 OFFSET $4', [userId, sort, limit, skip]);
  const total = await db.one('SELECT COUNT(*) FROM user_deposits WHERE user_id = $1', [userId, 'processed']);

  return {results, count: total.count};
};

const getWhitelistedAddresses = async (userId) => {
  const result = await db.any('SELECT * from whitelisted_addresses where user_id = $1', userId);
  return result;
};

const addWhitelistedAddress = async (userId, currency, address) => {
  await db.none('INSERT INTO whitelisted_addresses (user_id, currency, address) VALUES ($1, $2, $3)', [userId, currency, address])
    .catch(e => {
      if (e.code === '23505') {
        throw new Error('CURRENCY_ALREADY_WHITELISTED');
      }

      throw e;
    });
};

const removeWhitelistedAddress = async (userId, currency) => {
  await db.none('DELETE FROM whitelisted_addresses WHERE user_id = $1 AND currency = $2', [userId, currency]);
};

const isAddressWhitelisted = async (userId, currency, address) => {
  /* Return true if user has no whitelisted address entry OR if whitelisted address matches address, else false */
  const result = await db.oneOrNone('SELECT address = $1 as whitelisted FROM whitelisted_addresses WHERE user_id = $2 AND currency = $3', [address, userId, currency])
    .then(row => (!row || row.whitelisted));

  return result;
};

/* DICE */
const getLatestUserDiceBets = async (userId) => {
  const result = await db.any('SELECT id, date, bet_amount, currency, profit, game_details->>\'roll\' as roll, game_details->>\'chance\' as chance, game_details->>\'target\' as target FROM bets WHERE player_id = $1 AND game_type = $2 ORDER BY date desc LIMIT 50', [userId, 'dice']);
  return result;
};

const getBankrollByCurrency = async (currency) => {
  const result = await db.one('SELECT * FROM bankrolls WHERE currency = $1', currency);
  return result;
};

const getActiveDiceSeed = async (userId, newClientSeed) => {
  const result = await db.tx(t => {
    /* check if user has an active seed */
    return t.oneOrNone('SELECT * from dice_seeds WHERE player_id = $1 AND in_use = $2', [userId, true])
      .then(res => {
        if (res) {
          return res;
        }

        // generate new if they don't have a seed
        const serverSeed = dice.generateServerSeed();

        return t.one('INSERT INTO dice_seeds (player_id, in_use, client_seed, server_seed, nonce) VALUES ($1, $2, $3, $4, $5) RETURNING *', [userId, true, newClientSeed, serverSeed, 0]);
      })
      .then(res => ({
        clientSeed: res.client_seed,
        serverSeedHash: dice.hashServerSeed(res.server_seed),
        nonce: res.nonce
      }));
  });

  return result;
};

const doDiceBet = async (userId, betAmount, currency, target, chance) => {
  const result = await db.tx(t => {
    /* Deduct balance and throw error if insufficient balance */
    return t.oneOrNone('UPDATE user_balances SET balance = balance - $1 WHERE user_id = $2 AND currency = $3 AND balance >= $1 RETURNING balance', [betAmount, userId, currency])
      .then(res => {
        if (!res) {
          throw new Error('INSUFFICIENT_BALANCE');
        }

        /* Get user seed in use */
        return t.one('SELECT * FROM dice_seeds WHERE player_id = $1 AND in_use = $2', [userId, true]);
      })
      .then(seed => {
        /* Calculate dice roll and profit */
        const roll = dice.calculateDiceRoll(seed.server_seed, seed.client_seed, seed.nonce);
        const profit = dice.calculateProfit(roll, chance, betAmount, target);

        /* Increment nonce and update bets table */
        return t.none('UPDATE dice_seeds SET nonce = nonce + 1 WHERE id = $1', seed.id)
          .then(() => {
            const gameDetails = {chance, roll, target};
            const seedDetails = {seed_id: seed.id, nonce: seed.nonce};
            return t.one('INSERT INTO bets (player_id, date, bet_amount, currency, profit, game_type, game_details, seed_details) VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7) RETURNING *', [userId, betAmount, currency, profit, 'dice', gameDetails, seedDetails]);
          });
      })
      .then(bet => {
        /* Now update balance */
        const userProfit = new BigNumber(betAmount)
          .add(bet.profit)
          .toString();
        return t.one('UPDATE user_balances SET balance = balance + $1 WHERE user_id = $2 AND currency = $3 RETURNING balance', [userProfit, userId, currency])
          .then(res => {
            return {
              id: bet.id,
              date: bet.date,
              bet_amount: bet.bet_amount,
              currency: bet.currency,
              chance: bet.game_details.chance,
              roll: bet.game_details.roll,
              profit: bet.profit,
              target: bet.game_details.target,
              balance: res.balance,
              nextNonce: bet.seed_details.nonce + 1
            };
          });
      });
  });

  return result;
};

const setNewDiceClientSeed = async (userId, newClientSeed) => {
  return db.tx(t => {
    /* Set in_use = false for current active seed */
    return t.one('UPDATE dice_seeds SET in_use = false WHERE player_id = $1 AND in_use = true RETURNING *', userId)
      .then(seed => {
        /* Create new seed with using old server seed and old nonce but new client seed */
        return t.one('INSERT INTO dice_seeds (player_id, in_use, client_seed, server_seed, nonce) VALUES ($1, $2, $3, $4, $5) RETURNING client_seed', [userId, true, newClientSeed, seed.server_seed, seed.nonce]);
      })
      .then(res => ({
        clientSeed: res.client_seed
      }));
  });
};

const generateNewSeed = async (userId, newClientSeed) => {
  const result = await db.tx(t => {
    /* Invalidate seeds in use */
    return t.oneOrNone('UPDATE dice_seeds SET in_use = false WHERE player_id = $1 AND in_use = true RETURNING *', userId)
      .then(oldSeed => {
        /* Use old client seed if exists else use new client seed */
        const clientSeed = oldSeed ? oldSeed.client_seed : newClientSeed;
        const serverSeed = dice.generateServerSeed();

        return t.one('INSERT INTO dice_seeds (player_id, in_use, client_seed, server_seed, nonce) VALUES ($1, $2, $3, $4, $5) RETURNING *', [userId, true, clientSeed, serverSeed, 0])
          .then(res => ({
            clientSeed: res.client_seed,
            serverSeedHash: dice.hashServerSeed(res.server_seed),
            nonce: res.nonce,
            previousServerSeed: oldSeed.server_seed,
            previousServerSeedHash: dice.hashServerSeed(oldSeed.server_seed),
            previousClientSeed: oldSeed.client_seed,
            previousNonce: oldSeed.nonce === 0 ? 0 : oldSeed.nonce - 1
          }));
      });
  });

  return result;
};

module.exports = {
  isEmailAlreadyTaken,
  isUserNameAlreadyTaken,
  createUser,
  createSession,
  getUserByName,
  getUserByEmail,
  logLoginAttempt,
  log2faAttempt,
  getConsecutiveFailedLogins,
  getUserBySessionId,
  logoutSession,
  updateEmail,
  updatePassword,
  getActiveSessions,
  logoutAllSessions,
  addTemp2faSecret,
  enableTwofactor,
  disableTwoFactor,
  createResetToken,
  findLatestActiveResetToken,
  resetUserPasswordByToken,
  insertTwoFactorCode,
  addIpInWhitelist,
  removeIpFromWhitelist,
  getWhitelistedIps,
  isIpWhitelisted,
  logoutAllSessionsWithoutWhitelistedIps,
  lockUserAccount,
  logError,
  logUnhandledRejectionError,
  logUncaughtExceptionError,
  logEmailError,
  getLoginAttempts,
  createVerifyEmailToken,
  markEmailAsVerified,
  /* CRYPTO */
  getAllCurrencies,
  getAllBalancesForUser,
  createWithdrawalEntry,
  addDeposit,
  getDepositAddress,
  getPendingWithdrawals,
  getWithdrawalHistory,
  getDepositHistory,
  getWhitelistedAddresses,
  removeWhitelistedAddress,
  addWhitelistedAddress,
  isAddressWhitelisted,
  setConfirmWithdrawalByEmail,
  confirmWithdrawByToken,
  /* DICE */
  getLatestUserDiceBets,
  getBankrollByCurrency,
  getActiveDiceSeed,
  doDiceBet,
  setNewDiceClientSeed,
  generateNewSeed
};
