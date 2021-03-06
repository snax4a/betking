import toastr from 'toastr';
import Vue from 'vue';
import BigNumber from 'bignumber.js';

import * as types from '../mutation-types';
import bus from 'src/bus';
import api from 'src/api';
import {addBetToList} from 'src/helpers';

const initialState = () => ({
  clientSeed: '',
  serverSeedHash: '',
  nonce: null,
  latestUserBets: [],
  minBetAmount: null,
  maxWin: null,
  isBettingDisabled: true,
  previousServerSeed: '',
  previousServerSeedHash: '',
  previousClientSeed: '',
  previousNonce: '',
  sessionStats: [],
  autoBettingEnabled: false,
  autoBetStarted: false,
  autoBetSettings: {}
});

// getters
const getters = {
  diceClientSeed: state => state.clientSeed,
  diceServerSeedHash: state => state.serverSeedHash,
  diceNonce: state => state.nonce,
  diceLatestBets: state => state.latestUserBets,
  diceMinBetAmount: state => state.minBetAmount,
  diceMaxWin: state => state.maxWin,
  diceIsBettingDisabled: state => state.isBettingDisabled,
  previousDiceServerSeed: state => state.previousServerSeed,
  previousDiceServerSeedHash: state => state.previousServerSeedHash,
  previousDiceClientSeed: state => state.previousClientSeed,
  previousDiceNonce: state => state.previousNonce,
  sessionStats: state => state.sessionStats,
  diceAutoBettingEnabled: state => state.autoBettingEnabled,
  diceAutoBetStarted: state => state.autoBetStarted,
  diceAutoBetSettings: state => state.autoBetSettings
};

// actions
const actions = {
  loadDiceState ({commit, rootState}, {clientSeed, currency}) {
    commit(types.DISABLE_DICE_BETTING);

    api.loadDiceState(clientSeed, currency)
      .then(res => {
        const currencyConfig = rootState.funds.currencies.find(c => c.id === currency);
        const scale = currencyConfig.scale;

        const data = Object.assign({}, res.data, {
          minBetAmount: new BigNumber(res.data.minBetAmount)
            .div(new BigNumber(10).pow(scale))
            .toNumber(),
          maxWin: new BigNumber(res.data.maxWin)
          .div(new BigNumber(10).pow(scale))
          .toNumber()
        });

        commit(types.SET_DICE_STATE, data);
      });
  },

  diceBet ({commit}, {betAmount, currency, target, chance}) {
    commit(types.DISABLE_DICE_BETTING);

    api.diceBet(betAmount, currency, target, chance)
      .then(res => {
        const {id, date, bet_amount, currency, profit, game_details, balance, nextNonce} = res.data;
        commit(types.ADD_DICE_BET, {id, date, bet_amount, currency, profit, game_details});
        commit(types.SET_BALANCE, {currency, balance});
        commit(types.SET_DICE_NONCE, nextNonce);
        commit(types.ENABLE_DICE_BETTING);

        bus.$emit('dice-bet-result', {currency, roll: game_details.roll, profit});
      })
      .catch(err => {
        if (err.response && err.response.data) {
          toastr.error(err.response.data.error);
          commit(types.ENABLE_DICE_BETTING);
          bus.$emit('bet-error');
        }

        throw err;
      });
  },

  setNewDiceClientSeed ({commit}, clientSeed) {
    api.setNewDiceClientSeed(clientSeed)
      .then(res => {
        toastr.success('Client seed changed');
        commit(types.SET_DICE_CLIENT_SEED, res.data.clientSeed);
      })
      .catch(err => {
        if (err.response && err.response.data && err.response.data.error) {
          toastr.error(err.response.data.error);
          return;
        }

        throw err;
      });
  },

  generateNewDiceSeed ({commit}, clientSeed) {
    api.generateNewDiceSeed(clientSeed)
      .then(res => {
        toastr.success('Seed generated');
        commit(types.UPDATE_PREVIOUS_AND_CURRENT_DICE_SEED, res.data);
      });
  },

  setAutoBetMode ({commit}, isEnabled) {
    commit(types.SET_AUTO_BET_MODE, isEnabled);
  },

  startAutoBet ({commit}) {
    commit(types.SET_AUTO_BET_STARTED, true);
  },

  stopAutoBet ({commit}) {
    commit(types.SET_AUTO_BET_STARTED, false);
  },

  setAutoBetSettings ({commit}, data) {
    commit(types.SET_AUTO_BET_SETTINGS, data);
  }
};

// mutations
const mutations = {
  [types.SET_DICE_STATE] (state, data) {
    state.clientSeed = data.clientSeed;
    state.serverSeedHash = data.serverSeedHash;
    state.nonce = data.nonce;
    state.latestUserBets = data.latestUserBets;
    state.minBetAmount = data.minBetAmount;
    state.maxWin = data.maxWin;
    state.isBettingDisabled = data.isBettingDisabled;
  },

  [types.DISABLE_DICE_BETTING] (state) {
    state.isBettingDisabled = true;
  },

  [types.ENABLE_DICE_BETTING] (state) {
    state.isBettingDisabled = false;
  },

  [types.ADD_DICE_BET] (state, bet) {
    addBetToList(state.latestUserBets, bet);

    const statIndex = state.sessionStats.findIndex(s => s.currency === bet.currency);
    if (statIndex === -1) {
      Vue.set(state.sessionStats, state.sessionStats.length, {
        currency: bet.currency,
        numBets: 1,
        profit: bet.profit,
        wagered: bet.bet_amount
      });
    } else {
      Vue.set(state.sessionStats, statIndex, {
        currency: bet.currency,
        numBets: state.sessionStats[statIndex].numBets + 1,
        profit: new BigNumber(state.sessionStats[statIndex].profit)
          .add(bet.profit)
          .toString(),
        wagered: new BigNumber(state.sessionStats[statIndex].wagered)
          .add(bet.bet_amount)
          .toString()
      });
    }
  },

  [types.SET_DICE_CLIENT_SEED] (state, clientSeed) {
    state.clientSeed = clientSeed;
  },

  [types.UPDATE_PREVIOUS_AND_CURRENT_DICE_SEED] (state, data) {
    state.clientSeed = data.clientSeed;
    state.serverSeedHash = data.serverSeedHash;
    state.nonce = data.nonce;
    state.previousServerSeed = data.previousServerSeed;
    state.previousServerSeedHash = data.previousServerSeedHash;
    state.previousClientSeed = data.previousClientSeed;
    state.previousNonce = data.previousNonce;
  },

  [types.SET_DICE_NONCE] (state, nonce) {
    state.nonce = nonce;
  },

  [types.SET_AUTO_BET_MODE] (state, isEnabled) {
    state.autoBettingEnabled = isEnabled;
  },

  [types.SET_AUTO_BET_STARTED] (state, autoBetStarted) {
    state.autoBetStarted = autoBetStarted;
  },

  [types.SET_AUTO_BET_SETTINGS] (state, autoBetSettings) {
    state.autoBetSettings = autoBetSettings;
  },

  [types.RESET_DICE_STORE] (state) {
    const s = initialState();
    Object.keys(s).forEach(key => {
      state[key] = s[key];
    });
  }
};

export default {
  state: initialState(),
  getters,
  actions,
  mutations
};
