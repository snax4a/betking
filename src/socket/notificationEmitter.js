const BaseEventEmitter = require('events');

const types = {
  STATS_UPDATE: 'statsUpdate',
  DICE_BET: 'diceBet',
  LOAD_ALL_BETS: 'loadAllBets',
  DEPOSIT_CONFIRMED: 'depositConfirmed'
};

class NotificationEmitter extends BaseEventEmitter {
  emit (type, payload) {
    super.emit(type, {type, payload});
  }

  addListener (listener) {
    Object.keys(types).forEach(key => {
      super.addListener(types[key], listener);
    });
  }
}

const notificationEmitter = new NotificationEmitter();

module.exports = {
  notificationEmitter,
  types
};
