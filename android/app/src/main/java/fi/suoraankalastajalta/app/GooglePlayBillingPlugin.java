package fi.suoraankalastajalta.app;

import androidx.annotation.NonNull;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.android.billingclient.api.Purchase;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Collections;
import java.util.List;

@CapacitorPlugin(name = "GooglePlayBilling")
public class GooglePlayBillingPlugin extends Plugin {
    private BillingClient billingClient;
    private PluginCall pendingPurchaseCall;

    @Override
    public void load() {
        billingClient = BillingClient.newBuilder(getContext())
            .setListener(this::handlePurchasesUpdated)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection()
            .build();
    }

    private void withReadyClient(PluginCall call, Runnable action) {
        if (billingClient != null && billingClient.isReady()) {
            action.run();
            return;
        }
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) action.run();
                else call.reject("Google Play Billing ei ole käytettävissä: " + result.getDebugMessage());
            }

            @Override
            public void onBillingServiceDisconnected() {
                // Auto reconnect is enabled; a later request will retry.
            }
        });
    }

    private QueryProductDetailsParams productQuery(String productId) {
        QueryProductDetailsParams.Product product = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(productId)
            .setProductType(BillingClient.ProductType.SUBS)
            .build();
        return QueryProductDetailsParams.newBuilder().setProductList(Collections.singletonList(product)).build();
    }

    @PluginMethod
    public void getSubscriptionProduct(PluginCall call) {
        String productId = call.getString("productId", "");
        if (productId.isEmpty()) {
            call.reject("Tuotetunnus puuttuu");
            return;
        }
        withReadyClient(call, () -> billingClient.queryProductDetailsAsync(productQuery(productId), (result, queryResult) -> {
            List<ProductDetails> products = queryResult.getProductDetailsList();
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || products.isEmpty()) {
                call.reject("Tilaustuotetta ei löytynyt Google Playsta: " + result.getDebugMessage());
                return;
            }
            call.resolve(productToJson(products.get(0)));
        }));
    }

    @PluginMethod
    public void purchaseSubscription(PluginCall call) {
        String productId = call.getString("productId", "");
        String requestedOfferToken = call.getString("offerToken", "");
        if (productId.isEmpty()) {
            call.reject("Tuotetunnus puuttuu");
            return;
        }
        withReadyClient(call, () -> billingClient.queryProductDetailsAsync(productQuery(productId), (result, queryResult) -> {
            List<ProductDetails> products = queryResult.getProductDetailsList();
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || products.isEmpty()) {
                call.reject("Tilaustuotetta ei löytynyt Google Playsta: " + result.getDebugMessage());
                return;
            }
            ProductDetails details = products.get(0);
            String offerToken = requestedOfferToken;
            List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
            if (offerToken.isEmpty() && offers != null && !offers.isEmpty()) offerToken = offers.get(0).getOfferToken();
            if (offerToken.isEmpty()) {
                call.reject("Tilaustuotteella ei ole aktiivista peruspakettia");
                return;
            }
            BillingFlowParams.ProductDetailsParams productParams = BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(details)
                .setOfferToken(offerToken)
                .build();
            BillingFlowParams flowParams = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(Collections.singletonList(productParams))
                .build();
            pendingPurchaseCall = call;
            BillingResult launchResult = billingClient.launchBillingFlow(getActivity(), flowParams);
            if (launchResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                pendingPurchaseCall = null;
                call.reject("Oston avaaminen epäonnistui: " + launchResult.getDebugMessage());
            }
        }));
    }

    @PluginMethod
    public void getActiveSubscriptions(PluginCall call) {
        withReadyClient(call, () -> billingClient.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
            (result, purchases) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject("Tilausten palautus epäonnistui: " + result.getDebugMessage());
                    return;
                }
                JSObject response = new JSObject();
                response.put("purchases", purchasesToJson(purchases));
                call.resolve(response);
            }
        ));
    }

    private void handlePurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        PluginCall call = pendingPurchaseCall;
        if (call == null) return;
        pendingPurchaseCall = null;
        if (result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            call.reject("Osto peruttiin", "USER_CANCELED");
            return;
        }
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null || purchases.isEmpty()) {
            call.reject("Osto epäonnistui: " + result.getDebugMessage());
            return;
        }
        JSObject response = new JSObject();
        response.put("purchase", purchaseToJson(purchases.get(0)));
        call.resolve(response);
    }

    private JSObject productToJson(ProductDetails details) {
        JSObject json = new JSObject();
        json.put("productId", details.getProductId());
        json.put("name", details.getName());
        json.put("description", details.getDescription());
        JSArray offersJson = new JSArray();
        List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
        if (offers != null) for (ProductDetails.SubscriptionOfferDetails offer : offers) {
            JSObject offerJson = new JSObject();
            offerJson.put("offerToken", offer.getOfferToken());
            offerJson.put("basePlanId", offer.getBasePlanId());
            JSArray phasesJson = new JSArray();
            for (ProductDetails.PricingPhase phase : offer.getPricingPhases().getPricingPhaseList()) {
                JSObject phaseJson = new JSObject();
                phaseJson.put("formattedPrice", phase.getFormattedPrice());
                phaseJson.put("billingPeriod", phase.getBillingPeriod());
                phasesJson.put(phaseJson);
            }
            offerJson.put("pricingPhases", phasesJson);
            offersJson.put(offerJson);
        }
        json.put("offers", offersJson);
        return json;
    }

    private JSArray purchasesToJson(List<Purchase> purchases) {
        JSArray json = new JSArray();
        for (Purchase purchase : purchases) json.put(purchaseToJson(purchase));
        return json;
    }

    private JSObject purchaseToJson(Purchase purchase) {
        JSObject json = new JSObject();
        json.put("purchaseToken", purchase.getPurchaseToken());
        json.put("orderId", purchase.getOrderId());
        json.put("products", new JSArray(purchase.getProducts()));
        json.put("purchaseState", purchase.getPurchaseState());
        json.put("acknowledged", purchase.isAcknowledged());
        return json;
    }
}

