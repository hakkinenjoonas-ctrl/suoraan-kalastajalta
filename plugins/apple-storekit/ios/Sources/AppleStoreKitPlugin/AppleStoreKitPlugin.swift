import Foundation
import Capacitor
import StoreKit

@objc(AppleStoreKitPlugin)
public class AppleStoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleStoreKitPlugin"
    public let jsName = "AppleStoreKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getBuildEnvironment", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSubscriptionProduct", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchaseSubscription", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getActiveSubscriptions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishTransaction", returnType: CAPPluginReturnPromise)
    ]

    @objc func getBuildEnvironment(_ call: CAPPluginCall) {
        call.resolve(["debug": _isDebugAssertConfiguration()])
    }

    private func product(with identifier: String) async throws -> Product {
        guard let product = try await Product.products(for: [identifier]).first else {
            throw StoreKitBridgeError.productNotFound
        }
        return product
    }

    private func transactionPayload(
        verification: VerificationResult<Transaction>
    ) throws -> [String: Any] {
        guard case .verified(let transaction) = verification else {
            throw StoreKitBridgeError.unverifiedTransaction
        }

        var payload: [String: Any] = [
            "productId": transaction.productID,
            "transactionId": String(transaction.id),
            "originalTransactionId": String(transaction.originalID),
            "purchaseDate": ISO8601DateFormatter().string(from: transaction.purchaseDate),
            "signedTransactionInfo": verification.jwsRepresentation
        ]
        if let expirationDate = transaction.expirationDate {
            payload["expirationDate"] = ISO8601DateFormatter().string(from: expirationDate)
        }
        if let revocationDate = transaction.revocationDate {
            payload["revocationDate"] = ISO8601DateFormatter().string(from: revocationDate)
        }
        if let appAccountToken = transaction.appAccountToken {
            payload["appAccountToken"] = appAccountToken.uuidString.lowercased()
        }
        return payload
    }

    @objc func getSubscriptionProduct(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId"), !productId.isEmpty else {
            call.reject("App Store -tuotetunnus puuttuu.")
            return
        }
        Task {
            do {
                let product = try await product(with: productId)
                await MainActor.run {
                    call.resolve([
                        "productId": product.id,
                        "displayName": product.displayName,
                        "description": product.description,
                        "displayPrice": product.displayPrice,
                        "price": NSDecimalNumber(decimal: product.price).doubleValue
                    ])
                }
            } catch {
                await MainActor.run { call.reject(error.localizedDescription) }
            }
        }
    }

    @objc func purchaseSubscription(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId"), !productId.isEmpty else {
            call.reject("App Store -tuotetunnus puuttuu.")
            return
        }
        guard let accountTokenValue = call.getString("appAccountToken"),
              let accountToken = UUID(uuidString: accountTokenValue) else {
            call.reject("Käyttäjätilin tunniste puuttuu.")
            return
        }

        Task {
            do {
                let product = try await product(with: productId)
                let result = try await product.purchase(options: [.appAccountToken(accountToken)])
                switch result {
                case .success(let verification):
                    let purchase = try transactionPayload(verification: verification)
                    await MainActor.run { call.resolve(["purchase": purchase]) }
                case .pending:
                    await MainActor.run { call.resolve(["pending": true]) }
                case .userCancelled:
                    await MainActor.run { call.reject("Osto peruutettiin.", "USER_CANCELED") }
                @unknown default:
                    await MainActor.run { call.reject("Tuntematon App Store -ostotulos.") }
                }
            } catch {
                await MainActor.run { call.reject(error.localizedDescription) }
            }
        }
    }

    @objc func getActiveSubscriptions(_ call: CAPPluginCall) {
        let synchronize = call.getBool("synchronize") ?? false
        Task {
            do {
                if synchronize {
                    try await AppStore.sync()
                }
                var purchases: [[String: Any]] = []
                for await verification in Transaction.currentEntitlements {
                    if let payload = try? transactionPayload(verification: verification) {
                        purchases.append(payload)
                    }
                }
                await MainActor.run { call.resolve(["purchases": purchases]) }
            } catch {
                await MainActor.run { call.reject(error.localizedDescription) }
            }
        }
    }

    @objc func finishTransaction(_ call: CAPPluginCall) {
        guard let transactionId = call.getString("transactionId"),
              let expectedId = UInt64(transactionId) else {
            call.reject("App Store -tapahtumatunnus puuttuu.")
            return
        }
        Task {
            for await verification in Transaction.unfinished {
                guard case .verified(let transaction) = verification,
                      transaction.id == expectedId else { continue }
                await transaction.finish()
                await MainActor.run { call.resolve(["finished": true]) }
                return
            }
            await MainActor.run { call.resolve(["finished": false]) }
        }
    }
}

private enum StoreKitBridgeError: LocalizedError {
    case productNotFound
    case unverifiedTransaction

    var errorDescription: String? {
        switch self {
        case .productNotFound:
            return "Premium-tilausta ei löytynyt App Storesta."
        case .unverifiedTransaction:
            return "App Store ei pystynyt vahvistamaan ostosta."
        }
    }
}
