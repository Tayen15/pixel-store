import * as serverActions from '@/app/actions';

export * from '@/app/actions';

export const actions = {
  ...serverActions,
  createCheckoutOrder: serverActions.checkout,
};

export default actions;
