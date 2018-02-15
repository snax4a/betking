import socketIo from 'socket.io-client';

import * as types from '../mutation-types';
import {addBetToList} from 'src/helpers';

const state = {
  webSocket: null,
  watchBetsSocket: null,
  isSocketConnected: false,
  reconnectionCount: 0,
  watchBetsPaused: false,
  allBets: [],
  highrollerBets: []
};

// getters
const getters = {
  webSocket: state => state.webSocket,
  isSocketConnected: state => state.isSocketConnected,
  reconnectionCount: state => state.reconnectionCount,
  allBets: state => state.allBets,
  highrollerBets: state => state.highrollerBets,
  watchBetsPaused: state => state.watchBetsPaused
};

// actions
const actions = {
  setupSocket ({commit, state}) {
    if (!state.webSocket) {
      const socket = socketIo('/');

      socket.on('connect', () => {
        commit(types.SET_SOCKET_CONNECTION, true);
      });

      socket.on('connect_error', () => {
        socket.disconnect();
        commit(types.SET_SOCKET_CONNECTION, false);
        commit(types.SET_SOCKET_RECONNECTION_COUNT, state.reconnectionCount + 1);
      });

      socket.on('disconnect', () => {
        socket.disconnect();
        commit(types.SET_SOCKET_CONNECTION, false);
        commit(types.SET_SOCKET_RECONNECTION_COUNT, state.reconnectionCount + 1);
      });

      commit(types.SET_WEBSOCKET, socket);
    }
  },

  restartSocket ({commit, state}) {
    if (state.webSocket) {
      state.webSocket.disconnect();
      state.webSocket.connect();
    }
  },

  setSocketReconnectionCount ({commit}, count) {
    commit(types.SET_SOCKET_RECONNECTION_COUNT, count);
  },

  watchBets ({commit, state}) {
    if (state.watchBetsSocket) {
      state.watchBetsSocket.connect();
      state.watchBetsSocket.emit('loadBets');
      return;
    }

    if (!state.watchBetsSocket) {
      const watchBetsSocket = socketIo('/watch-bets');

      watchBetsSocket.on('connect', () => {
        console.log('watch bets socket connected');
        watchBetsSocket.emit('loadBets');
      });

      watchBetsSocket.on('loadAllBets', (response) => {
        commit(types.SET_ALL_BETS, response.allBets);
        commit(types.SET_HIGHROLLER_BETS, response.highrollerBets);
      });

      watchBetsSocket.on('diceBet', (bet) => {
        if (state.watchBetsPaused) {
          return;
        }

        if (bet.isHighrollerBet) {
          commit(types.ADD_TO_HIGHROLLER_BETS, bet);
        }

        commit(types.ADD_TO_ALL_BETS, bet);
      });

      watchBetsSocket.on('disconnect', () => {
        console.log('watch bets socket disconnected');
      });

      commit(types.SET_WATCH_BETS_WEBSOCKET, watchBetsSocket);
    }
  },

  stopWatchingBets ({commit, state}) {
    if (!state.watchBetsSocket) {
      return;
    }

    state.watchBetsSocket.disconnect();
  },

  toggleWatchBetsPaused ({commit}, shouldPause) {
    commit(types.SET_WATCH_BETS_PAUSED, shouldPause);
  }
};

// mutations
const mutations = {
  [types.SET_WEBSOCKET] (state, socket) {
    state.webSocket = socket;
  },

  [types.SET_SOCKET_CONNECTION] (state, isSocketConnected) {
    state.isSocketConnected = isSocketConnected;
  },

  [types.SET_SOCKET_RECONNECTION_COUNT] (state, reconnectionCount) {
    state.reconnectionCount = reconnectionCount;
  },

  [types.SET_WATCH_BETS_WEBSOCKET] (state, socket) {
    state.watchBetsSocket = socket;
  },

  [types.SET_ALL_BETS] (state, bets) {
    state.allBets = bets;
  },

  [types.SET_HIGHROLLER_BETS] (state, bets) {
    state.highrollerBets = bets;
  },

  [types.ADD_TO_ALL_BETS] (state, bet) {
    addBetToList(state.allBets, bet);
  },

  [types.ADD_TO_HIGHROLLER_BETS] (state, bet) {
    addBetToList(state.highrollerBets, bet);
  },

  [types.SET_WATCH_BETS_PAUSED] (state, shouldPause) {
    state.watchBetsPaused = shouldPause;
  }
};

export default {
  state,
  getters,
  actions,
  mutations
};
