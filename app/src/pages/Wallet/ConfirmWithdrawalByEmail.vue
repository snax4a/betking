<template>
  <div>
    <div v-if="errors.confirmWithdrawal" class="alert alert-danger">{{ errors.confirmWithdrawal }}</div>
    <p>
      Should withdrawals require confirmation via email?
    </p>
    <div class="text-left">
      <b-button variant="danger" size="sm"
        v-if="profile.confirmWithdrawals"
        @click="toggleEmailWithdrawalConfirmation(false)">
        Disable
      </b-button>
      <b-button variant="success" size="sm"
        v-if="!profile.confirmWithdrawals"
        @click="toggleEmailWithdrawalConfirmation(true)">
        Enable
      </b-button>
    </div>
  </div>
</template>

<script>
  import bButton from 'bootstrap-vue/es/components/button/button';

  import {mapGetters} from 'vuex';
  import api from 'src/api';
  import {getSecondFactorAuth} from 'src/helpers';

  export default {
    name: 'ConfirmWithdrawalByEmail',
    components: {
      'b-button': bButton
    },
    data: () => ({
      errors: {}
    }),
    computed: mapGetters({
      profile: 'profile',
      is2faEnabled: 'is2faEnabled'
    }),
    methods: {
      getSecondFactorAuth,
      async toggleEmailWithdrawalConfirmation (option) {
        let otp = null;
        if (!option) {
          otp = await this.getSecondFactorAuth();
        }

        api.toggleEmailWithdrawalConfirmation(option, otp)
          .then(() => {
            this.$store.dispatch('fetchUser');
            this.errors = {};
          })
          .catch(e => {
            if (!e.response || !e.response.data || !e.response.data.error) {
              throw e;
            }

            if (e.response.data.error === 'VALID_USER_NOT_FOUND') {
              this.errors = {
                confirmWithdrawal: 'You must add an email id to profile and verify it'
              };

              return;
            }

            this.errors = {
              confirmWithdrawal: e.response.data.error
            };
          });
      }
    }
  };
</script>
