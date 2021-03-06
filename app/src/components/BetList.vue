<template>
  <b-table
    id="dice-bet-results"
    class="dice-bet-results"
    responsive striped small outlined hover fixed
    :items="bets"
    :fields="fields"
    :show-empty="true">

    <template v-if="isAuthenticated" slot="empty">
      <div class="text-center">You have not placed any bets yet.</div>
    </template>
    <template v-else slot="empty">
      <div class="text-center">
        <a href="#" v-b-modal.loginModal>Login</a> or <a href="#" v-b-modal.registerModal>Register</a> to place bets.
      </div>
    </template>

    <template slot="username" slot-scope="data">
      <b-link href="#" @click="showUserDetails(data.value)" :class="{'username-hidden': data.value === '[HIDDEN]'}" >
        {{data.value}}
      </b-link>
    </template>

    <template slot="id" slot-scope="data">
      <b-link href="#" @click="showBetDetails(data.value)">{{data.value}}</b-link>
    </template>

    <template slot="profit" slot-scope="data">
      <span v-html="formatProfit(data.item.profit, 'profit', data.item)"></span>
      <CurrencyIcon :id="data.item.currency" :width="15" />
    </template>

  </b-table>
</template>

<style lang="scss">
  .dice-bet-results {
    // width: 60%;
    margin: 0 auto;
  }

  .dice-bet-results th{
    text-align:center!important;
  }

  .username-hidden:hover {
    text-decoration: none;
    cursor: auto;
  }
</style>


<script>
  import bTable from 'bootstrap-vue/es/components/table/table';
  import bLink from 'bootstrap-vue/es/components/link/link';
  import vBModal from 'bootstrap-vue/es/directives/modal/modal';

  import CurrencyIcon from 'components/CurrencyIcon';
  import moment from 'moment';

  import {mapGetters} from 'vuex';
  import {formatBigAmount, gameDetailsToTarget, gameDetailsToRoll, gameDetailsToPayout} from 'src/helpers';
  import bus from 'src/bus';

  export default {
    name: 'DiceBetResults',
    components: {
      'b-table': bTable,
      'b-link': bLink,
      CurrencyIcon
    },
    directives: {
      'b-modal': vBModal
    },
    props: {
      bets: {
        type: Array,
        default: []
      },
      showUsername: {
        type: Boolean,
        default: false
      }
    },
    computed: {
      ...mapGetters({
        currencies: 'currencies',
        isAuthenticated: 'isAuthenticated'
      }),
      fields () {
        return [
          ...this.$mq === 'desktop' ? [{
            key: 'id',
            label: 'Bet Id',
            class: 'text-center'
          }] : [],
          ...this.showUsername ? [{
            key: 'username',
            label: 'Username',
            class: 'text-center'
          }] : [],
          ...this.$mq === 'desktop' ? [{
            key: 'date',
            label: 'Time',
            formatter: 'formatTime',
            class: 'text-center'
          }] : [], {
            key: 'bet_amount',
            label: 'Bet Amount',
            formatter: 'formatAmount',
            class: 'text-right'
          },
          ...this.$mq === 'desktop' ? [{
            key: 'chance',
            label: 'Payout',
            formatter: 'formatPayout',
            class: 'text-center'
          }] : [], {
            key: 'target',
            label: 'Target',
            formatter: 'formatTarget',
            class: 'text-center'
          }, {
            key: 'roll',
            label: 'Roll',
            formatter: 'formatRoll',
            class: 'text-center'
          }, {
            key: 'profit',
            label: 'Profit',
            class: 'text-right no-wrap'
          }];
      }
    },
    methods: {
      formatBigAmount,
      gameDetailsToTarget,
      gameDetailsToRoll,
      gameDetailsToPayout,
      formatPayout (value, key, item) {
        return this.gameDetailsToPayout(item.game_details);
      },
      formatTarget (value, key, item) {
        return this.gameDetailsToTarget(item.game_details);
      },
      formatRoll (value, key, item) {
        return this.gameDetailsToRoll(item.game_details);
      },
      formatAmount (value, key, item) {
        return this.darkenZero(this.formatBigAmount(value, item.currency));
      },
      formatProfit (value, key, item) {
        const amount = this.formatAmount(value, key, item);
        const className = value > 0 ? 'text-green' : 'text-red';

        return `<span class="${className}">${amount}</span>`;
      },
      formatTime (value) {
        return moment(value).format('mm:ss');
      },
      darkenZero (x) {
        const parts = x.split('.');
        let newX = x;
        let decimalPart = '';

        if (parts.length === 2) {
          decimalPart = parts[1].replace(/(0+)$/, '<span class="darken">$1</span>');
          newX = decimalPart.length > 0 ? `${parts[0]}.${decimalPart}` : parts[0];
        }

        return newX;
      },
      showBetDetails (id) {
        bus.$emit('show-bet-details-modal', id);
      },
      showUserDetails (username) {
        if (username === '[HIDDEN]') {
          return;
        }
        bus.$emit('show-user-lookup-modal', username);
      }
    }
  };
</script>
