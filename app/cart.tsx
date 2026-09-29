import React, { useEffect } from 'react';
import { View, StyleSheet, BackHandler, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { COLORS } from '../constants/theme';
import { ThemedAlertHost } from '../components/ThemedAlert';
import { useCheckoutFlow } from '../components/cart/useCheckoutFlow';
import CartHeader from '../components/cart/CartHeader';
import CartFooter from '../components/cart/CartFooter';
import StepItens from '../components/cart/StepItens';
import StepEntrega from '../components/cart/StepEntrega';
import StepPagamento from '../components/cart/StepPagamento';
import PaymentSelector from '../components/cart/PaymentSelector';
import MinOrderSheet from '../components/cart/MinOrderSheet';
import CardWizard from '../components/CardWizard';

export default function CartScreen() {
  const insets = useSafeAreaInsets();
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

  // Render current step component
  const renderStep = () => {
    switch (flow.step) {
      case 'itens':
        return (
          <Animated.View
            key="step-itens"
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            style={styles.stepContainer}
          >
            <StepItens
              items={flow.items}
              subtotal={flow.subtotal}
              deliveryFee={flow.deliveryFee}
              discount={flow.discount}
              total={flow.total}
              coupon={flow.coupon}
              deliveryType={flow.deliveryType}
              onUpdateQty={flow.updateQty}
              onRemoveItem={flow.removeFromCart}
              onRemoveCoupon={() => flow.setCoupon(null)}
              onAddQuickItem={flow.handleAddQuickItem}
              onEditItem={flow.onEditItem}
            />
          </Animated.View>
        );
      case 'entrega':
        return (
          <Animated.View
            key="step-entrega"
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            style={styles.stepContainer}
          >
            <StepEntrega
              deliveryType={flow.deliveryType}
              setDeliveryType={flow.setDeliveryType}
              selectedAddress={flow.selectedAddress}
              loadingAddress={flow.loadingAddress}
            />
          </Animated.View>
        );
      case 'pagamento':
        return (
          <Animated.View
            key="step-pagamento"
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            style={styles.stepContainer}
          >
            <StepPagamento
              paymentMethod={flow.paymentMethod}
              selectedSavedCard={flow.selectedSavedCard}
              savedCardCvv={flow.savedCardCvv}
              setSavedCardCvv={flow.setSavedCardCvv}
              useManualCardForm={flow.useManualCardForm}
              setUseManualCardForm={flow.setUseManualCardForm}
              cardName={flow.cardName}
              setCardName={flow.setCardName}
              cardNumber={flow.cardNumber}
              setCardNumber={flow.setCardNumber}
              cardExpiry={flow.cardExpiry}
              setCardExpiry={flow.setCardExpiry}
              cardCvv={flow.cardCvv}
              setCardCvv={flow.setCardCvv}
              cardCpf={flow.cardCpf}
              setCardCpf={flow.setCardCpf}
              wantsCutlery={flow.wantsCutlery}
              setWantsCutlery={flow.setWantsCutlery}
              cashChange={flow.cashChange}
              setCashChange={flow.setCashChange}
              orderNotes={flow.orderNotes}
              setOrderNotes={flow.setOrderNotes}
              name={flow.name}
              setName={flow.setName}
              phone={flow.phone}
              setPhone={flow.setPhone}
              subtotal={flow.subtotal}
              deliveryFee={flow.deliveryFee}
              discount={flow.discount}
              total={flow.total}
              coupon={flow.coupon}
              deliveryType={flow.deliveryType}
              onRemoveCoupon={() => flow.setCoupon(null)}
              onOpenPaymentSelector={() => flow.setShowPaymentSelector(true)}
            />
          </Animated.View>
        );
      default:
        return null;
    }
  };

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
      ) : flow.showPaymentSelector ? (
        <PaymentSelector
          currentMethod={flow.paymentMethod}
          selectedCard={flow.selectedSavedCard}
          savedCards={flow.savedCards}
          onSelectPayment={flow.selectPaymentMethod}
          onAddNewCard={() => {
            flow.setShowPaymentSelector(false);
            flow.setShowCardWizard(true);
          }}
          onBack={() => flow.setShowPaymentSelector(false)}
        />
      ) : (
        <>
          <CartHeader
            step={flow.step}
            onBack={flow.handleBack}
            onClear={flow.handleClearCart}
            showClear={flow.items.length > 0}
          />

          <View style={styles.content}>{renderStep()}</View>

          {flow.items.length > 0 && (
            <CartFooter
              step={flow.step}
              total={flow.total}
              deliveryType={flow.deliveryType}
              itemCount={flow.items.reduce((s, i) => s + (i.quantity || 1), 0)}
              submitting={flow.submitting}
              onContinue={flow.handleContinue}
            />
          )}
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
  stepContainer: {
    flex: 1,
  },
});
