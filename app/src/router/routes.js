import AppShell from 'components/AppShell/AppShell';

const routes = [
  /* Pages which need user session to be fetched */
  {
    path: '/',
    components: {
      default: AppShell,
      // menu: Menu
    },
    meta: {requiresUser: true},
    children: [
      /* Pages which render for both user logged in or logged out state */
      {path: '', name: 'home', component: () => import('pages/Home/Home')},
      {path: '/dice', component: () => import('pages/Dice/Dice')},
      {path: '/stats', component: () => import('pages/Stats')},

      /* Pages which need user to be logged out */

      /* Pages which need user authentication */
      {path: 'settings', component: () => import('pages/Settings/Settings'), meta: {requiresAuth: true}},
      {path: 'wallet', component: () => import('pages/Wallet/Wallet'), meta: {requiresAuth: true}},
      {path: 'security', component: () => import('pages/Security/Security'), meta: {requiresAuth: true}}
    ]
  },
  /* Pages which do not need user session to be fetched */
  {path: '/reset-password', component: () => import('pages/ResetPassword')},
  {path: '/verify-email', component: () => import('pages/VerifyEmail')},
  {path: '/confirm-withdrawal', component: () => import('pages/ConfirmWithdrawal')},

  /* Shows PageNotFound component in dev mode, redirects to /404 route in prod */
  {path: '/404', component: () => import('pages/PageNotFound'), alias: '*'},
];

export default routes;
