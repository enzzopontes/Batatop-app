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
import StepEntrega from '../components/cart/StepEntrega';
import StepPagamento from '../components/cart/StepPagamento';
import PaymentModal from '../components/cart/PaymentModal';
import InstallmentsModal from '../components/cart/InstallmentsModal';
import ReviseOrderModal from '../components/cart/ReviseOrderModal';
import MinOrderSheet from '../components/cart/MinOrderSheet';
import CardWizard from '../components/CardWizard';

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const flow = useCheckoutFlow();

  // Android hardware back handler sincronizado com o fluxo de 3 passos
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
            {flow.step === 'itens' && (
              <StepItens
                items={flow.items}
                subtotal={flow.subtotal}
                deliveryFee={flow.deliveryFee}
                discount={flow.discount}
                total={flow.total}
                coupon={flow.coupon}
                deliveryType={flow.deliveryType}
                rankedProducts={flow.rankedProducts}
                onUpdateQty={flow.updateQty}
                onRemoveItem={flow.removeFromCart}
                onRemoveCoupon={() => flow.setCoupon(null)}
                onAddQuickItem={flow.handleAddQuickItem}
                onEditItem={flow.onEditItem}
              />
            )}

            {flow.step === 'entrega' && (
              <StepEntrega
                deliveryType={flow.deliveryType}
                setDeliveryType={flow.setDeliveryType}
                selectedAddress={flow.selectedAddress}
                loadingAddress={flow.loadingAddress}
              />
            )}

            {flow.step === 'pagamento' && (
              <StepPagamento
                paymentMethod={flow.paymentMethod}
                selectedSavedCard={flow.selectedSavedCard}
                subtotal={flow.subtotal}
                deliveryFee={flow.deliveryFee}
                discount={flow.discount}
                total={flow.total}
                coupon={flow.coupon}
                deliveryType={flow.deliveryType}
                onRemoveCoupon={() => flow.setCoupon(null)}
                onOpenPaymentSelector={() => flow.setShowPaymentSelector(true)}
                onOpenInstallments={flow.openInstallments}
                installmentText={flow.installmentLabel}
              />
            )}
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

          {/* Modal "Revise o seu pedido" */}
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
              flow.setStep('entrega');
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

          {/* Modal de Pagamento (bottom sheet aberto ao tocar no card da tela 3) */}
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

          {/* Modal de Parcelamento (bottom sheet cartão de crédito) */}
          <InstallmentsModal
            visible={flow.showInstallmentsModal}
            baseAmount={flow.baseTotal}
            options={flow.installmentOptions}
            selectedInstallments={flow.selectedInstallment?.installments || 1}
            loading={flow.loadingInstallments}
            error={flow.installmentsError}
            onClose={() => flow.setShowInstallmentsModal(false)}
            onSelectInstallment={flow.handleSelectInstallment}
            onRetry={flow.loadInstallments}
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
