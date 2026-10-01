import React, { useEffect } from 'react';
import { View, StyleSheet, BackHandler, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS } from '../constants/theme';
import { ThemedAlertHost } from '../components/ThemedAlert';
import { useCheckoutFlow } from '../components/cart/useCheckoutFlow';
import CartHeader from '../components/cart/CartHeader';
import CartFooter from '../components/cart/CartFooter';
import StepItens from '../components/cart/StepItens';
import PaymentModal from '../components/cart/PaymentModal';
import ReviseOrderModal from '../components/cart/ReviseOrderModal';
import MinOrderSheet from '../components/cart/MinOrderSheet';
import CardWizard from '../components/CardWizard';

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const flow = useCheckoutFlow();

  // Android hardware back handler
  useEffect(() => {
    const onBackPress = () => {
      flow.handleBack();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [flow]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <ThemedAlertHost />

      {flow.showCardWizard ? (
        <CardWizard
          cardType={flow.paymentMethod === 'cartão de débito' ? 'cartão de débito' : 'cartão de crédito'}
          existingCardsCount={flow.savedCards.length}
          addCard={flow.addCard}
          savingCard={flow.savingCard}
          onClose={() => flow.setShowCardWizard(false)}
          onSaved={async () => {
            const reloadedCards = await flow.loadSavedCards();
            if (reloadedCards && reloadedCards.length > 0) {
              const latest = reloadedCards[0];
              flow.selectPaymentMethod(latest.card_type, latest);
            }
            flow.setShowCardWizard(false);
          }}
        />
      ) : (
        <>
          <CartHeader
            step={flow.step}
            onBack={flow.handleBack}
            onClear={flow.handleClearCart}
            showClear={flow.items.length > 0}
          />

          <View style={styles.content}>
            <StepItens
              items={flow.items}
              subtotal={flow.subtotal}
              deliveryFee={flow.deliveryFee}
              discount={flow.discount}
              total={flow.total}
              coupon={flow.coupon}
              deliveryType={flow.deliveryType}
              paymentMethod={flow.paymentMethod}
              selectedSavedCard={flow.selectedSavedCard}
              wantsCutlery={flow.wantsCutlery}
              setWantsCutlery={flow.setWantsCutlery}
              rankedProducts={flow.rankedProducts}
              onUpdateQty={flow.updateQty}
              onRemoveItem={flow.removeFromCart}
              onRemoveCoupon={() => flow.setCoupon(null)}
              onAddQuickItem={flow.handleAddQuickItem}
              onEditItem={flow.onEditItem}
              onOpenPaymentSelector={() => flow.setShowPaymentSelector(true)}
            />
          </View>

          {flow.items.length > 0 && (
            <CartFooter
              step={flow.step}
              total={flow.total}
              deliveryType={flow.deliveryType}
              deliveryFee={flow.deliveryFee}
              itemCount={flow.items.reduce((s, i) => s + (i.quantity || 1), 0)}
              submitting={flow.submitting}
              onContinue={flow.handleContinue}
            />
          )}

          {/* Modal "Revise o seu pedido" (Imagem 1) */}
          <ReviseOrderModal
            visible={flow.showReviseModal}
            total={flow.total}
            deliveryType={flow.deliveryType}
            selectedAddress={flow.selectedAddress}
            coupon={flow.coupon}
            paymentMethod={flow.paymentMethod}
            selectedSavedCard={flow.selectedSavedCard}
            savedCardCvv={flow.savedCardCvv}
            setSavedCardCvv={flow.setSavedCardCvv}
            wantsCutlery={flow.wantsCutlery}
            setWantsCutlery={flow.setWantsCutlery}
            submitting={flow.submitting}
            onClose={() => flow.setShowReviseModal(false)}
            onSubmitOrder={flow.submitOrder}
            onEditAddress={() => {
              flow.setShowReviseModal(false);
              router.push('/addresses');
            }}
            onEditCoupon={() => {
              flow.setShowReviseModal(false);
              router.push('/cupons');
            }}
            onEditPayment={() => {
              flow.setShowReviseModal(false);
              flow.setShowPaymentSelector(true);
            }}
            onToggleDeliveryType={flow.toggleDeliveryType}
          />

          {/* Modal de Pagamento estilo profile (Imagens 3 e 4) */}
          <PaymentModal
            visible={flow.showPaymentSelector}
            currentMethod={flow.paymentMethod}
            selectedCard={flow.selectedSavedCard}
            savedCards={flow.savedCards}
            onClose={() => flow.setShowPaymentSelector(false)}
            onSelectPayment={flow.selectPaymentMethod}
            onAddNewCard={() => {
              flow.setShowPaymentSelector(false);
              flow.setShowCardWizard(true);
            }}
          />
        </>
      )}

      {/* Sheet de valor mínimo */}
      <MinOrderSheet
        visible={flow.minOrderSheetVisible}
        onClose={() => flow.setMinOrderSheetVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  content: {
    flex: 1,
  },
});
