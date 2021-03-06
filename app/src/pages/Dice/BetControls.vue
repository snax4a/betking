<template>
  <div class="dice__bet-controls">
    <b-row>

      <b-col cols="6">
        <b-form-group id="dice-fg-betamount" label="Bet Amount" label-for="dice-betamount">
          <b-input-group>
            <input class="form-control" id="dice-betamount" v-model="betAmount" @keyup="updateProfit" type="text"
              autocomplete="off" />
            <template slot="append">
              <CurrencyIcon :id="activeCurrency" :width="20" />
            </template>
          </b-input-group>
        </b-form-group>
      </b-col>

      <b-col cols="6">
        <b-form-group id="dice-fg-betprofit" label="Potential Profit" label-for="dice-betprofit">
          <b-input-group>
            <input class="form-control" id="dice-betprofit" v-model="betProfit" @keyup="updateBetAmount" type="text"
              autocomplete="off" />
            <template slot="append">
              <CurrencyIcon :id="activeCurrency" :width="20" />
            </template>
          </b-input-group>
        </b-form-group>
      </b-col>
    </b-row>

    <b-row>
      <b-col cols="6">
        <b-form-group id="dice-fg-chance" label="Chance" label-for="dice-chance">
          <b-input-group :class="{invalid: !isChanceValid}">
            <input class="form-control" id="dice-chance" v-model="chance" v-on:keyup="updateChance" @blur="onBlurChance"
              type="text" autocomplete="off" />
            <template slot="append"><i class="fa fa-percent" /></template>
          </b-input-group>
        </b-form-group>
      </b-col>

      <b-col cols="6">
        <b-form-group id="dice-fg-payout" label="Payout" label-for="dice-payout">
          <b-input-group :class="{invalid: !isPayoutValid}">
            <input class="form-control" id="dice-payout" v-model="payout" v-on:keyup="updatePayout" @blur="onBlurPayout"
              type="text" autocomplete="off" />
            <template slot="append"><i class="fa fa-close" /></template>
          </b-input-group>
        </b-form-group>
      </b-col>

      <b-col cols="12">
        <b-alert variant="danger" :show="!isPayoutValid || !isChanceValid">
          Chance must be greater than 0.0001 and less than 98.99.
        </b-alert>
      </b-col>

      <b-col cols="12">
        <b-alert variant="warning" :show="showPayoutWarning" max="3" @dismiss-count-down="countDownChanged">
          Exact payout multiplier cannot be found. The closest available multiplier will be selected if you stop typing for 3 seconds.
          <b-progress variant="warning" :max="3" :value="showPayoutWarning" height="4px" />
        </b-alert>
      </b-col>
    </b-row>

    <b-row class="dice__bet-controls__result">
      <b-col cols="8" offset="2" :class="`text-${winColour}`">
        {{ rollMessage }} <br>
        {{ winMessage }}
        <CurrencyIcon  v-if="winCurrency !== null" :id="winCurrency" :color="winColour"  />
      </b-col>
    </b-row>

    <b-row class="dice__bet-controls__bet-buttons" id="dice-bet-buttons">
      <template v-if="!autoBettingEnabled">
        <b-col sm="3" offset-sm="3" cols="6">
          <b-button variant="danger" :disabled="bettingDisabled" @click="diceBet(1)">
            Hi<span class="shortcut" v-if="shortcutsEnabled">h</span><br>
            <small>&gt; {{ hiTarget }}</small>
          </b-button>
        </b-col>

        <b-col cols="3" sm="3">
          <b-button variant="danger" :disabled="bettingDisabled" @click="diceBet(0)">
            Lo<span class="shortcut" v-if="shortcutsEnabled">l</span><br>
            <small>&lt; {{ loTarget }}</small>
          </b-button>
        </b-col>

        <b-col cols="3">
          <b-button size="sm" variant="primary" @click="showProvablyFairDialog">
            <i class="fa fa-balance-scale" />
          </b-button>
        </b-col>
      </template>

      <template v-else>
        <b-col sm="3" offset-sm="3" cols="6">
          <b-button variant="danger" :disabled="autoBetStarted" @click="startAutoBet">
            Start<br>
          </b-button>
        </b-col>

        <b-col cols="3" sm="3">
          <b-button variant="danger" @click="stopAutoBet">
            Stop
          </b-button>
        </b-col>
      </template>
    </b-row>

    <b-row>
      <b-col cols="12" id="bet-amount-controls">
        <template v-if="!autoBettingEnabled">
          <b-button size="sm" variant="primary" @click="halvedBetAmount">1/2<span class="shortcut" v-if="shortcutsEnabled">x</span></b-button>
          <b-button size="sm" variant="primary" @click="doubleBetAmount">x2<span class="shortcut" v-if="shortcutsEnabled">c</span></b-button>
          <b-button size="sm" variant="primary" @click="setMinBetAmount">min<span class="shortcut" v-if="shortcutsEnabled">z</span></b-button>
          <b-button size="sm" variant="primary" @click="maxBetAmountClicked">max<span class="shortcut" v-if="shortcutsEnabled">b</span></b-button>
          <b-button size="sm" class="d-none d-sm-inline-block" variant="primary" @click="activateShortcuts">
            <i class="fa fa-keyboard-o"></i>
          </b-button>
          <b-button size="sm" variant="primary" @click="showDemo">
            <span class='d-none d-sm-inline'>How to play</span>
            <span class='d-inline d-sm-none'><i class='fa fa-question-circle'></i></span>
            </b-button>
          <b-button size="sm" variant="primary" @click="enableAutoBet">Auto</b-button>
        </template>

        <template v-else>
          <b-button size="sm" variant="primary" @click="editAutoBetSettings" :disabled="autoBetStarted">Edit</b-button>
          <b-button size="sm" variant="primary" @click="disableAutoBet">Manual</b-button>
        </template>
      </b-col>
    </b-row>

    <div class="dice__bet-controls--modals">
      <MaxBetWarningModal @maxbet="allowMaxBet"></MaxBetWarningModal>
      <ProvablyFairModal></ProvablyFairModal>
      <AutoBetModal></AutoBetModal>
    </div>
  </div>
</template>

<style lang="scss">
  $input-border-radius: 4px;
  $bet-controls-bg: rgba(0,0,0,.8);
  $error-color: #8c0000;
  $error-color-light: #f2dede;
  $error-color-dark: #a94442;

  @import url('/static/css/bootstrap-tour-standalone.min.css');
  @import '../../scss/custom/btn';


  .dice__bet-controls {
    width: 100%;
    max-width: 520px;
    background-color: $bet-controls-bg;
    color: #fff;
    margin: 0 auto;
    text-align: center;
    position: relative;
    padding: 20px 30px;

    &--modals {
      color: initial;
      text-align: initial;
    }

    .form-control {
      border: 1px solid $bet-controls-bg;
      border-top-left-radius: $input-border-radius;
      border-bottom-left-radius: $input-border-radius;
      text-align: right;
    }

    .input-group {
      &.invalid {
        input {
          background-color: $error-color;
          color: $error-color-light;
          border-color: $error-color-dark;
        }
        .input-group-append {
          background-color: $error-color-light;
          color: $error-color-dark;
          border-color: $error-color-dark;
        }
      }

      &-append {
        min-width: 40px;
        display: flex;
        flex-flow: row nowrap;
        align-items: center;
        justify-content: center;
        border: 1px solid $bet-controls-bg;
        border-top-right-radius: $input-border-radius;
        border-bottom-right-radius: $input-border-radius;
        background-color: #f0f3f5;
        color: #3f3f40;
        padding: 0 5px;
      }
  }

    &__result {
      margin-bottom: 1rem;
      min-height: 42px;
    }

    &__bet-buttons {
      margin-bottom: 1rem;
      .btn-danger {
        max-width: 75px;
        width: 75px;
        height: 54px;
        padding: 6px;
        text-overflow: ellipsis;
        overflow: hidden;
      }
    }

    .shortcut {
      border: 1px dotted white;
      text-transform: uppercase;
      padding: 2px;
      margin-left: 4px;
    }

    .tour-backdrop {
      opacity: 0.6;
    }

    .tour-step-background {
      opacity: 0;
      border-radius: 2px;
    }

    .popover.tour .btn-default:focus:hover {
      color: #333;
    }
  }
</style>


<script>
  import bContainer from 'bootstrap-vue/es/components/layout/container';
  import bRow from 'bootstrap-vue/es/components/layout/row';
  import bCol from 'bootstrap-vue/es/components/layout/col';
  import bFormGroup from 'bootstrap-vue/es/components/form-group/form-group';
  import bInputGroup from 'bootstrap-vue/es/components/input-group/input-group';
  import bFormInput from 'bootstrap-vue/es/components/form-input/form-input';
  import bButton from 'bootstrap-vue/es/components/button/button';
  import bAlert from 'bootstrap-vue/es/components/alert/alert';
  import bProgress from 'bootstrap-vue/es/components/progress/progress';

  import {mapGetters} from 'vuex';
  import Cookies from 'js-cookie';

  // eslint-disable-next-line no-unused-vars
  import jQuery from 'jquery';
  import BigNumber from 'bignumber.js';
  import CurrencyIcon from 'components/CurrencyIcon';
  import MaxBetWarningModal from './MaxBetWarningModal';
  import ProvablyFairModal from './ProvablyFairModal';
  import AutoBetModal from './AutoBetModal';
  import bus from 'src/bus';
  import {loadBootstrapTour} from 'src/helpers';
  import {template, createSteps} from './diceTour';

  import {
    updateTargets,
    updateChance,
    updatePayout,
    onBlurChance,
    onBlurPayout,
    updateProfit,
    updateBetAmount,
    halvedBetAmount,
    doubleBetAmount,
    setMinBetAmount,
    setMaxBetAmount,
    maxBetAmountClicked,
    activateShortcuts,
    keyUp,
    diceBet,
    startAutoBetLoop,
    autoBet,
    onAutoBetResult
  } from './bet-controls';

  export default {
    name: 'DicePage',
    components: {
      'b-container': bContainer,
      'b-row': bRow,
      'b-col': bCol,
      'b-form-group': bFormGroup,
      'b-input-group': bInputGroup,
      'b-form-input': bFormInput,
      'b-button': bButton,
      'b-alert': bAlert,
      'b-progress': bProgress,
      CurrencyIcon,
      MaxBetWarningModal,
      ProvablyFairModal,
      AutoBetModal
    },
    data: () => ({
      betAmount: 0,
      betProfit: 0,
      chance: 49.5,
      payout: 2,
      hiTarget: '50.4999',
      loTarget: '49.5000',
      isPayoutValid: true,
      isChanceValid: true,
      showPayoutWarning: 0,
      demoModeOn: false,
      timerId: null,
      shortcutsEnabled: false,
      showMaxBetWarning: true,
      rollMessage: '',
      winMessage: '',
      winColour: '',
      winCurrency: null,
      rollCount: 0
    }),
    created () {
      window.addEventListener('keyup', this.keyUp);

      window.jQuery = jQuery;
      loadBootstrapTour();

      if (typeof Cookies.get('showMaxBetWarning') !== 'undefined') {
        this.showMaxBetWarning = false;
      }
    },
    beforeDestroy () {
      window.removeEventListener('keyup', this.keyUp);
    },
    computed: {
      ...mapGetters({
        isAuthenticated: 'isAuthenticated',
        currencies: 'currencies',
        activeCurrency: 'activeCurrency',
        balance: 'activeCurrencyBalance',
        maxWin: 'diceMaxWin',
        minBetAmount: 'diceMinBetAmount',
        isBettingDisabled: 'diceIsBettingDisabled',
        autoBettingEnabled: 'diceAutoBettingEnabled',
        autoBetStarted: 'diceAutoBetStarted',
        autoBetSettings: 'diceAutoBetSettings'
      }),
      currency () {
        return this.currencies.find(c => c.id === this.activeCurrency);
      },
      bettingDisabled () {
        return this.isBettingDisabled || !this.isPayoutValid || !this.isChanceValid || this.demoModeOn;
      }
    },
    mounted () {
      bus.$on('dice-bet-result', (result) => {
        this.showDiceBetResult(result);

        if (this.autoBetStarted) {
          this.onAutoBetResult(result);
        }
      });

      bus.$on('bet-error', () => {
        if (this.autoBetStarted) {
          this.stopAutoBet();
        }
      });

      bus.$on('leaving-dice-page', () => {
        this.$store.dispatch('setAutoBetMode', false);
      });
    },
    watch: {
      autoBetStarted: function (newValue) { // eslint-disable-line object-shorthand
        if (newValue) {
          this.startAutoBetLoop();
        }
      },
      activeCurrency: function () { // eslint-disable-line object-shorthand
        this.winMessage = '';
        this.winCurrency = null;
        this.rollMessage = '';
      }
    },
    methods: {
      updateProfit,
      updateBetAmount,
      onBlurChance,
      onBlurPayout,
      updateChance,
      updatePayout,
      updateTargets,
      halvedBetAmount,
      doubleBetAmount,
      setMinBetAmount,
      setMaxBetAmount,
      activateShortcuts,
      keyUp,
      maxBetAmountClicked,
      diceBet,
      startAutoBetLoop,
      autoBet,
      onAutoBetResult,
      enableAutoBet () {
        this.$store.dispatch('setAutoBetMode', true);
        this.$root.$emit('bv::show::modal', 'dice-auto-bet');
      },
      disableAutoBet (e) {
        this.$store.dispatch('setAutoBetMode', false);
        e.target.blur();
      },
      editAutoBetSettings () {
        this.$root.$emit('bv::show::modal', 'dice-auto-bet');
      },
      startAutoBet () {
        if (this.autoBetSettings.betAmount && this.autoBetSettings.chance) {
          this.$store.dispatch('startAutoBet');
        } else {
          this.$root.$emit('bv::show::modal', 'dice-auto-bet');
        }
      },
      stopAutoBet () {
        this.clearTimeout();
        this.$store.dispatch('stopAutoBet');
      },
      clearTimeout () {
        if (this.timeoutId !== null) {
          clearTimeout(this.timeoutId);
        }
      },
      countDownChanged (dismissCountDown) {
        this.showPayoutWarning = dismissCountDown;
      },
      allowMaxBet (stopWarning) {
        if (stopWarning === true) {
          this.showMaxBetWarning = false;
          Cookies.set('showMaxBetWarning', false, {expires: 1});
        }

        this.setMaxBetAmount();
        this.$root.$emit('bv::hide::modal', 'maxBetModal');
      },
      showProvablyFairDialog () {
        this.$root.$emit('bv::show::modal', 'diceProvablyFairModal');
      },
      showDiceBetResult (msg) {
        if (msg.currency !== this.activeCurrency) {
          return;
        }

        this.rollMessage = `Roll: ${msg.roll}`;
        this.winCurrency = msg.currency;

        const profit = new BigNumber(msg.profit)
          .dividedBy(new BigNumber(10).pow(this.currency.scale));

        if (profit.gt(0)) {
          this.winColour = 'green';
          this.winMessage = `You won ${profit.toFixed(this.currency.scale, BigNumber.ROUND_DOWN)}`;
        } else {
          this.winMessage = `You lost ${profit.times(-1).toFixed(this.currency.scale, BigNumber.ROUND_DOWN)}`;
          this.winColour = 'red';
        }
      },
      showDemo () {
        const steps = createSteps();
        const that = this;
        if (window.innerWidth < 768) {
          steps.forEach(step => {
            step.placement = 'bottom';
          });
        }
        const tour = new window.Tour({
          steps,
          template,
          onEnd (tour) {
            that.demoModeOn = false;
          },
          onShown (tour) {
            that.demoModeOn = true;
          },
          onHidden (tour) {
            that.demoModeOn = false;
          }
        });
        tour.init();
        tour.start(true);
      }
    }

  };
</script>
