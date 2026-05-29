import ExpoModulesCore
import StoreKit
import UIKit
struct NoraBillingProductRecord: Record {
  @Field
  var id: String = ""

  @Field
  var title: String = ""

  @Field
  var description: String = ""

  @Field
  var displayPrice: String = ""
}

struct NoraBillingEntitlementRecord: Record {
  @Field
  var transactionId: String = ""

  @Field
  var originalTransactionId: String = ""

  @Field
  var productId: String = ""

  @Field
  var purchaseDate: String = ""

  @Field
  var expirationDate: String? = nil

  @Field
  var revocationDate: String? = nil

  @Field
  var appAccountToken: String? = nil

  @Field
  var environment: String? = nil

  @Field
  var signedTransactionInfo: String = ""
}

public class NoraBillingModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NoraBilling")

    AsyncFunction("getProducts") { (productIds: [String]) async throws -> [NoraBillingProductRecord] in
      let products = try await Product.products(for: productIds)
      return products.map { product in
        NoraBillingProductRecord(
          id: product.id,
          title: product.displayName,
          description: product.description,
          displayPrice: product.displayPrice
        )
      }
    }

    AsyncFunction("purchase") { (productId: String, appAccountToken: String) async throws -> NoraBillingEntitlementRecord in
      let products = try await Product.products(for: [productId])
      guard let product = products.first else {
        throw NSError(domain: "NoraBilling", code: 404, userInfo: [NSLocalizedDescriptionKey: "Product not found"])
      }
      guard let token = UUID(uuidString: appAccountToken) else {
        throw NSError(domain: "NoraBilling", code: 400, userInfo: [NSLocalizedDescriptionKey: "Invalid app account token"])
      }

      let result = try await product.purchase(options: [.appAccountToken(token)])
      switch result {
      case .success(let verification):
        let transaction = try self.unwrap(verification)
        await transaction.finish()
        return self.serialize(verification)
      case .pending:
        throw NSError(domain: "NoraBilling", code: 202, userInfo: [NSLocalizedDescriptionKey: "Purchase pending approval"])
      case .userCancelled:
        throw NSError(domain: "NoraBilling", code: 499, userInfo: [NSLocalizedDescriptionKey: "Purchase cancelled"])
      @unknown default:
        throw NSError(domain: "NoraBilling", code: 500, userInfo: [NSLocalizedDescriptionKey: "Unknown purchase result"])
      }
    }

    AsyncFunction("restore") { () async throws -> [NoraBillingEntitlementRecord] in
      try await AppStore.sync()
      return try await self.collectCurrentEntitlements()
    }

    AsyncFunction("getCurrentEntitlements") { () async throws -> [NoraBillingEntitlementRecord] in
      try await self.collectCurrentEntitlements()
    }

    AsyncFunction("manageSubscriptions") { () async throws in
      guard let scene = self.getActiveScene() else {
        throw NSError(domain: "NoraBilling", code: 500, userInfo: [NSLocalizedDescriptionKey: "No active scene"])
      }
      try await AppStore.showManageSubscriptions(in: scene)
    }
  }

  private func unwrap<T>(_ verification: VerificationResult<T>) throws -> T {
    switch verification {
    case .verified(let value):
      return value
    case .unverified(_, let error):
      throw error
    }
  }

  private func collectCurrentEntitlements() async throws -> [NoraBillingEntitlementRecord] {
    var records: [NoraBillingEntitlementRecord] = []
    for await verification in StoreKit.Transaction.currentEntitlements {
      _ = try unwrap(verification)
      records.append(serialize(verification))
    }
    return records
  }

  private func serialize(_ verification: VerificationResult<StoreKit.Transaction>) -> NoraBillingEntitlementRecord {
    let transaction: StoreKit.Transaction
    switch verification {
    case .verified(let value):
      transaction = value
    case .unverified(let value, _):
      transaction = value
    }

    return NoraBillingEntitlementRecord(
      transactionId: String(transaction.id),
      originalTransactionId: String(transaction.originalID),
      productId: transaction.productID,
      purchaseDate: transaction.purchaseDate.ISO8601Format(),
      expirationDate: transaction.expirationDate?.ISO8601Format(),
      revocationDate: transaction.revocationDate?.ISO8601Format(),
      appAccountToken: transaction.appAccountToken?.uuidString.lowercased(),
      environment: transaction.environmentStringRepresentation,
      signedTransactionInfo: verification.jwsRepresentation
    )
  }

  private func getActiveScene() -> UIWindowScene? {
    UIApplication.shared.connectedScenes
      .first { $0.activationState == .foregroundActive } as? UIWindowScene
  }
}
