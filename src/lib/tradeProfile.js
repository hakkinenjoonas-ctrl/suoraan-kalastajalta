function hasValue(value) {
  return String(value || "").trim().length > 0;
}

export function getMissingSellerSaleFields(profileLike) {
  const checks = [
    { label: "yrityksen nimi", value: profileLike?.company_name || profileLike?.companyName },
    { label: "Y-tunnus", value: profileLike?.business_id || profileLike?.businessId },
    { label: "yhteyshenkilön nimi", value: profileLike?.display_name || profileLike?.displayName },
    { label: "puhelinnumero", value: profileLike?.phone },
    { label: "yhteyssähköposti", value: profileLike?.contact_email || profileLike?.contactEmail || profileLike?.email },
    { label: "katuosoite", value: profileLike?.address },
    { label: "postinumero", value: profileLike?.postcode },
    { label: "postitoimipaikka", value: profileLike?.city },
    {
      label: "kaupallisen kalastajan tunnus",
      value: profileLike?.commercial_fishing_id || profileLike?.commercialFishingId,
    },
  ];

  return checks.filter((item) => !hasValue(item.value)).map((item) => item.label);
}

export function getMissingBuyerPurchaseFields(buyerLike, profileLike) {
  const checks = [
    { label: "yrityksen nimi", value: buyerLike?.company_name || profileLike?.company_name || profileLike?.companyName },
    { label: "Y-tunnus", value: buyerLike?.business_id || profileLike?.business_id || profileLike?.businessId },
    { label: "yhteyshenkilön nimi", value: buyerLike?.contact_name || profileLike?.display_name || profileLike?.displayName },
    { label: "yhteyssähköposti", value: buyerLike?.contact_email || buyerLike?.email || profileLike?.contact_email || profileLike?.contactEmail || profileLike?.email },
    { label: "puhelinnumero", value: buyerLike?.phone || profileLike?.phone },
    { label: "toimitusosoite", value: buyerLike?.delivery_address || profileLike?.delivery_address || profileLike?.deliveryAddress },
    { label: "toimituksen postinumero", value: buyerLike?.delivery_postcode || profileLike?.delivery_postcode || profileLike?.deliveryPostcode },
    { label: "toimituskaupunki", value: buyerLike?.delivery_city || profileLike?.delivery_city || profileLike?.deliveryCity },
    { label: "laskutusosoite", value: buyerLike?.billing_address || profileLike?.billing_address || profileLike?.billingAddress },
    { label: "laskutuksen postinumero", value: buyerLike?.billing_postcode || profileLike?.billing_postcode || profileLike?.billingPostcode },
    { label: "laskutuskaupunki", value: buyerLike?.billing_city || profileLike?.billing_city || profileLike?.billingCity },
    { label: "laskutussähköposti", value: buyerLike?.billing_email || profileLike?.billing_email || profileLike?.billingEmail },
  ];

  return checks.filter((item) => !hasValue(item.value)).map((item) => item.label);
}
