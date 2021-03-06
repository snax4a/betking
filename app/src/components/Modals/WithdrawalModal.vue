<template>
  <b-modal id="withdrawalModal" v-model="showModal" ref="modal" @hide="onModalHide" hide-footer>
    <template slot="modal-header-close"><i class="fa fa-close"/></template>
    <template slot="modal-title">Withdraw {{formatCurrency(withdrawalModalCurrency, 'name')}}</template>

    <div class="alert alert-danger" v-if="errors.global">{{errors.global}}</div>
    <b-container fluid>
      <b-row>
        <b-col cols="8">Available Balance</b-col>
        <b-col>{{addCommas(formatAmount(balance, withdrawalModalCurrency))}}</b-col>
      </b-row>
      <b-row v-if="withdrawalModalCurrency !== 0">
        <b-col cols="8">Withdrawal Fee</b-col>
        <b-col>{{addCommas(formatAmount(withdrawalFee, withdrawalModalCurrency))}}</b-col>
      </b-row>
      <b-row>
        <b-col cols="8">Minimum Withdrawal Amount</b-col>
        <b-col>{{addCommas(formatAmount(minWithdrawalLimit, withdrawalModalCurrency))}}</b-col>
      </b-row>
      <set-withdrawal-fee @onFeeChange="onFeeChange" v-if="withdrawalModalCurrency === 0" />
      <b-row v-if="isAmountValid">
        <b-col cols="8">Amount Received</b-col>
        <b-col>{{addCommas(formatAmount(amountReceived, withdrawalModalCurrency))}}</b-col>
      </b-row>
      <br />
      <b-row>
        <b-col cols="12">
          <b-form v-on:submit.prevent="onSubmit" @reset="onModalHide">

            <b-form-group label="Amount" label-for="amount" :invalid-feedback="errors.amount" :state="!errors.amount">
              <b-form-input type="text"
                            id="amount"
                            placeholder="Amount"
                            name="amount"
                            v-model="withdrawAmount"
                            autocomplete="off"
                            :state="isAmountValid"
                            @input="handleAmountChange"/>
            </b-form-group>

            <b-form-group label="Address" label-for="address" :invalid-feedback="errors.address" :state="!errors.address">
              <b-form-input type="text"
                            id="address"
                            placeholder="Address"
                            name="address"
                            autocomplete="off"
                            v-model="withdrawAddress"
                            :state="isAddresValid"/>
            </b-form-group>

            <b-form-group v-if="is2faEnabled" label="Two factor code" label-for="otp" :invalid-feedback="errors.otp"
              :state="!errors.otp">
              <b-form-input id="otpWithdrawalModal" type="text" placeholder="OTP" name="otp" v-model="otp"/>
            </b-form-group>

            <div class="submit-buttons pull-right">
              <button class="btn btn-danger" type="button" @click.prevent="hideModal">Cancel</button>
              <button class="btn btn-success" type="submit" :disabled="isSubmitDisabled">Submit</button>
            </div>
          </b-form>
        </b-col>
      </b-row>
    </b-container>
  </b-modal>
</template>

<script>
  import bModal from 'components/modal/modal';
  import bForm from 'bootstrap-vue/es/components/form/form';
  import bFormGroup from 'bootstrap-vue/es/components/form-group/form-group';
  import bFormInput from 'bootstrap-vue/es/components/form-input/form-input';
  import bContainer from 'bootstrap-vue/es/components/layout/container';
  import bRow from 'bootstrap-vue/es/components/layout/row';
  import bCol from 'bootstrap-vue/es/components/layout/col';
  import BigNumber from 'bignumber.js';
  import SetWithdrawalFee from 'components/SetWithdrawalFee';

  import toastr from 'toastr';
  import {formatCurrency, addCommas, formatAmount, toBigInt, formatBigAmount} from 'src/helpers';
  import api from 'src/api';
  import bus from 'src/bus';

  import {mapGetters} from 'vuex';

  export default {
    name: 'WithdrawalModal',
    components: {
      'b-modal': bModal,
      'b-form': bForm,
      'b-form-group': bFormGroup,
      'b-form-input': bFormInput,
      'b-container': bContainer,
      'b-row': bRow,
      'b-col': bCol,
      'set-withdrawal-fee': SetWithdrawalFee
    },
    data: () => ({
      showModal: false,
      errors: {},
      withdrawAmount: '',
      withdrawAddress: '',
      otp: '',
      fee: 0
    }),
    computed: {
      ...mapGetters({
        isWithdrawalModalVisible: 'isWithdrawalModalVisible',
        withdrawalModalCurrency: 'withdrawalModalCurrency',
        currencies: 'currencies',
        is2faEnabled: 'is2faEnabled'
      }),
      currency () {
        return this.currencies.find(c => c.id === this.withdrawalModalCurrency);
      },
      balance () {
        return this.currency && this.currency.balance;
      },
      withdrawalFee () {
        return this.currency && this.currency.withdrawalFee;
      },
      minWithdrawalLimit () {
        return this.currency && this.currency.minWithdrawalLimit;
      },
      isAmountValid () {
        if (!this.withdrawAmount) {
          return null;
        } else {
          return this.isWithdrawalAmountGreaterThanMinimum && this.isWithdrawalAmountLessThanBalance;
        }
      },
      isAddresValid () {
        return this.withdrawAddress ? true : null;
      },
      isSubmitDisabled () {
        return !this.withdrawAmount || !this.isAmountValid || !this.withdrawAddress;
      },
      amountReceived () {
        if (!this.isAmountValid) {
          return null;
        } else {
          return new BigNumber(this.withdrawAmount).minus(new BigNumber(this.withdrawalFee))
            .toString();
        }
      },
      isWithdrawalAmountGreaterThanMinimum () {
        return new BigNumber(this.withdrawAmount).gte(new BigNumber(this.minWithdrawalLimit));
      },
      isWithdrawalAmountLessThanBalance () {
        return new BigNumber(this.withdrawAmount).lte(new BigNumber(this.balance));
      }
    },
    watch: {
      isWithdrawalModalVisible (newValue) {
        this.showModal = newValue;
      }
    },
    methods: {
      formatCurrency,
      addCommas,
      formatAmount,
      toBigInt,
      formatBigAmount,
      hideModal () {
        this.$refs.modal && this.$refs.modal.hide();
      },
      onModalHide () {
        this.errors = {};
        this.withdrawAmount = '';
        this.withdrawAddress = '';
        this.$store.dispatch('hideWithdrawalModal');
      },
      onSubmit (e) {
        const data = {
          currency: this.withdrawalModalCurrency,
          amount: this.toBigInt(this.withdrawAmount, this.currency.scale),
          address: this.withdrawAddress,
          otp: this.otp,
          withdrawalFeePerByte: this.fee
        };
        api.withdrawCurrency(data)
          .then(res => {
            toastr.success(`Withdrawal request for ${this.withdrawAmount} ${this.currency.name} submitted`);
            bus.$emit('WITHDRAWAL_REQUESTED');
            this.$store.dispatch('fetchAllBalances');
            this.hideModal();
          })
          .catch(error => {
            if (error.response) {
              this.buildErrors(error.response);
              return;
            }

            throw error;
          });
      },
      buildErrors (response) {
        if (response && response.status === 400) {
          if (response.data.errors) {
            const newErrors = {};

            response.data.errors.forEach(error => {
              newErrors[error.param] = newErrors[error.param]
                ? `${newErrors[error.param]} / ${error.msg}` : error.msg;
            });

            this.errors = newErrors;
            return;
          }

          if (response.data.error) {
            this.errors = {
              global: response.data.error
            };
          }
        }
      },
      handleAmountChange (value) {
        if (this.withdrawAmount && !this.isWithdrawalAmountLessThanBalance) {
          this.errors = {amount: 'balance too low'};
        } else {
          this.errors = {amount: null};
        }
      },
      fetchBitcoinWithdrawalCost () {
        if (this.fee) {
          return this.formatBigAmount(this.fee * 226, 0);
        }
        return 0;
      },
      onFeeChange (fee) {
        this.fee = fee;
      }
    }
  };
</script>
