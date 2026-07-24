import { requireAuthenticatedProfileContext } from "../_shared/buyerAuth.ts";
import { corsHeaders, jsonResponse, safeString } from "../_shared/http.ts";

type AdminClient = any;

function normalizeEmail(value: unknown) {
  return safeString(value).toLowerCase();
}

function uniqueStrings(values: unknown[]) {
  return Array.from(new Set(values.map((value) => safeString(value)).filter(Boolean)));
}

function uniqueEmails(values: unknown[]) {
  return uniqueStrings(values.map((value) => normalizeEmail(value)).filter(Boolean));
}

function uniqueById<T extends { id?: unknown }>(rows: T[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const id = safeString(row?.id);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function isMissingRowError(error: { code?: string } | null | undefined) {
  return safeString(error?.code) === "PGRST116";
}

function isMissingRelationError(error: { code?: string } | null | undefined) {
  return safeString(error?.code) === "42P01";
}

function isForeignKeyViolation(error: { code?: string } | null | undefined) {
  return safeString(error?.code) === "23503";
}

function archivedBuyerMarker(buyerId: string) {
  return `[SYSTEM_ARCHIVED_BUYER:${buyerId}]`;
}

async function deleteByIds(adminClient: AdminClient, table: string, ids: string[]) {
  const normalizedIds = uniqueStrings(ids);
  if (normalizedIds.length === 0) return;
  const { error } = await adminClient.from(table).delete().in("id", normalizedIds);
  if (error && !isMissingRowError(error)) throw new Error(`${table}: ${error.message}`);
}

async function deleteAppPushTokens(
  adminClient: AdminClient,
  profileIds: string[],
  buyerIds: string[],
) {
  const normalizedProfileIds = uniqueStrings(profileIds);
  const normalizedBuyerIds = uniqueStrings(buyerIds);

  if (normalizedProfileIds.length > 0) {
    const { error } = await adminClient.from("app_push_tokens").delete().in("user_id", normalizedProfileIds);
    if (error && !isMissingRowError(error)) throw new Error(`app_push_tokens by user_id: ${error.message}`);
  }

  if (normalizedBuyerIds.length > 0) {
    const { error } = await adminClient.from("app_push_tokens").delete().in("buyer_id", normalizedBuyerIds);
    if (error && !isMissingRowError(error)) throw new Error(`app_push_tokens by buyer_id: ${error.message}`);
  }
}

async function deleteBuyerOffersForBuyer(
  adminClient: AdminClient,
  buyerIds: string[],
  buyerEmails: string[],
) {
  const normalizedBuyerIds = uniqueStrings(buyerIds);
  const normalizedBuyerEmails = uniqueEmails(buyerEmails);

  if (normalizedBuyerIds.length > 0) {
    const { error } = await adminClient.from("buyer_offers").delete().in("buyer_id", normalizedBuyerIds);
    if (error && !isMissingRowError(error)) throw new Error(`buyer_offers by buyer_id: ${error.message}`);
  }

  if (normalizedBuyerEmails.length > 0) {
    const { error } = await adminClient.from("buyer_offers").delete().in("buyer_email", normalizedBuyerEmails);
    if (error && !isMissingRowError(error)) throw new Error(`buyer_offers by buyer_email: ${error.message}`);
  }
}

async function deactivateOrphanedBuyers(
  adminClient: AdminClient,
  buyerIds: string[],
  buyerEmails: string[],
  removedProfileIds: string[],
  removedAllowedUserIds: string[],
) {
  const normalizedBuyerIds = uniqueStrings(buyerIds);
  const normalizedBuyerEmails = uniqueEmails(buyerEmails);

  const buyerRowsById = normalizedBuyerIds.length > 0
    ? await adminClient
      .from("buyers")
      .select("id, email, billing_email, is_active")
      .in("id", normalizedBuyerIds)
    : { data: [], error: null };
  if (buyerRowsById.error && !isMissingRowError(buyerRowsById.error)) {
    throw new Error(`buyers by id: ${buyerRowsById.error.message}`);
  }

  const buyerRowsByEmail = normalizedBuyerEmails.length > 0
    ? await adminClient
      .from("buyers")
      .select("id, email, billing_email, is_active")
      .or(normalizedBuyerEmails.map((email) => `email.eq.${email},billing_email.eq.${email}`).join(","))
    : { data: [], error: null };
  if (buyerRowsByEmail.error && !isMissingRowError(buyerRowsByEmail.error)) {
    throw new Error(`buyers by email: ${buyerRowsByEmail.error.message}`);
  }

  const candidateBuyers = uniqueById([
    ...((buyerRowsById.data as Array<Record<string, unknown>>) || []),
    ...((buyerRowsByEmail.data as Array<Record<string, unknown>>) || []),
  ]);

  for (const buyer of candidateBuyers) {
    const buyerId = safeString(buyer.id);
    const candidateEmails = uniqueEmails([buyer.email, buyer.billing_email]);

    const linkedProfilesResult = await adminClient
      .from("profiles")
      .select("id")
      .eq("role", "buyer")
      .eq("buyer_id", buyerId);
    if (linkedProfilesResult.error && !isMissingRowError(linkedProfilesResult.error)) {
      throw new Error(`profiles by buyer_id: ${linkedProfilesResult.error.message}`);
    }

    const linkedProfilesByEmailResult = candidateEmails.length > 0
      ? await adminClient
        .from("profiles")
        .select("id")
        .eq("role", "buyer")
        .in("email", candidateEmails)
      : { data: [], error: null };
    if (linkedProfilesByEmailResult.error && !isMissingRowError(linkedProfilesByEmailResult.error)) {
      throw new Error(`profiles by email: ${linkedProfilesByEmailResult.error.message}`);
    }

    const linkedAllowedUsersResult = await adminClient
      .from("allowed_users")
      .select("id, is_active")
      .eq("role", "buyer")
      .eq("buyer_id", buyerId);
    if (linkedAllowedUsersResult.error && !isMissingRowError(linkedAllowedUsersResult.error)) {
      throw new Error(`allowed_users by buyer_id: ${linkedAllowedUsersResult.error.message}`);
    }

    const linkedAllowedUsersByEmailResult = candidateEmails.length > 0
      ? await adminClient
        .from("allowed_users")
        .select("id, is_active")
        .eq("role", "buyer")
        .in("email", candidateEmails)
      : { data: [], error: null };
    if (linkedAllowedUsersByEmailResult.error && !isMissingRowError(linkedAllowedUsersByEmailResult.error)) {
      throw new Error(`allowed_users by email: ${linkedAllowedUsersByEmailResult.error.message}`);
    }

    const remainingProfiles = uniqueById([
      ...((linkedProfilesResult.data as Array<Record<string, unknown>>) || []),
      ...((linkedProfilesByEmailResult.data as Array<Record<string, unknown>>) || []),
    ]).filter((row) => !removedProfileIds.includes(safeString(row.id)));

    const remainingAllowedUsers = uniqueById([
      ...((linkedAllowedUsersResult.data as Array<Record<string, unknown>>) || []),
      ...((linkedAllowedUsersByEmailResult.data as Array<Record<string, unknown>>) || []),
    ]).filter((row) => (
      !removedAllowedUserIds.includes(safeString(row.id)) &&
      row.is_active !== false
    ));

    if (remainingProfiles.length === 0 && remainingAllowedUsers.length === 0) {
      const { error: deactivateBuyerError } = await adminClient
        .from("buyers")
        .update({ is_active: false })
        .eq("id", buyerId);
      if (deactivateBuyerError && !isMissingRowError(deactivateBuyerError)) {
        throw new Error(`buyers deactivate: ${deactivateBuyerError.message}`);
      }

      await deleteAppPushTokens(adminClient, [], [buyerId]);
    }
  }
}

async function deleteSellerOwnedData(
  adminClient: AdminClient,
  profileIds: string[],
) {
  const normalizedProfileIds = uniqueStrings(profileIds);
  if (normalizedProfileIds.length === 0) return;

  const { data: processedBatchRows, error: processedBatchLookupError } = await adminClient
    .from("processed_batches")
    .select("id")
    .in("owner_user_id", normalizedProfileIds);
  if (processedBatchLookupError && !isMissingRowError(processedBatchLookupError) && !isMissingRelationError(processedBatchLookupError)) {
    throw new Error(`processed_batches lookup: ${processedBatchLookupError.message}`);
  }

  const processedBatchIds = uniqueStrings((processedBatchRows || []).map((row) => row.id));
  if (processedBatchIds.length > 0) {
    const { error } = await adminClient
      .from("processed_batch_sources")
      .delete()
      .in("processed_batch_id", processedBatchIds);
    if (error && !isMissingRowError(error) && !isMissingRelationError(error)) {
      throw new Error(`processed_batch_sources: ${error.message}`);
    }
  }

  const sellerOwnedDeletes: Array<Promise<{ error: { message?: string; code?: string } | null }>> = [
    adminClient.from("buyer_offers").delete().in("seller_user_id", normalizedProfileIds),
    adminClient.from("catch_entries").delete().in("owner_user_id", normalizedProfileIds),
    adminClient.from("processed_products").delete().in("owner_user_id", normalizedProfileIds),
    adminClient.from("processed_batches").delete().in("owner_user_id", normalizedProfileIds),
    adminClient.from("wholesale_offers").delete().in("created_by_user_id", normalizedProfileIds),
  ];

  const results = await Promise.all(sellerOwnedDeletes);
  const firstError = results.find((result) => result.error && !isMissingRowError(result.error) && !isMissingRelationError(result.error))?.error;
  if (firstError) {
    throw new Error(firstError.message || "Seller-owned data delete failed");
  }
}

async function deleteAuthUsers(adminClient: AdminClient, userIds: string[]) {
  const archivedUserIds: string[] = [];
  for (const userId of uniqueStrings(userIds)) {
    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (!error || safeString(error.message).toLowerCase().includes("not found")) {
      continue;
    }

    const normalizedMessage = safeString(error.message).toLowerCase();
    if (!normalizedMessage.includes("database error deleting user")) {
      throw new Error(`auth.users ${userId}: ${error.message}`);
    }

    // Huutokauppahistoria voi viitata auth.users-tunnukseen ON DELETE
    // RESTRICT -avaimella. Tällöin tunnus anonymisoidaan ja estetään,
    // jotta historia säilyy mutta alkuperäinen sähköposti vapautuu.
    const { error: archiveError } = await adminClient.auth.admin.updateUserById(userId, {
      email: `deleted+${userId}@invalid.local`,
      email_confirm: true,
      ban_duration: "876000h",
      user_metadata: {},
    });
    if (archiveError) {
      throw new Error(`auth.users archive ${userId}: ${archiveError.message}`);
    }
    archivedUserIds.push(userId);
  }
  return archivedUserIds;
}

async function findAuthUserIdsByEmails(adminClient: AdminClient, emails: string[]) {
  const targetEmails = new Set(uniqueEmails(emails));
  if (targetEmails.size === 0) return [];

  const matchingUserIds: string[] = [];
  const perPage = 1000;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`auth.users lookup: ${error.message}`);

    const users = Array.isArray(data?.users) ? data.users : [];
    for (const user of users) {
      if (targetEmails.has(normalizeEmail(user?.email))) {
        matchingUserIds.push(safeString(user?.id));
      }
    }
    if (users.length < perPage) break;
  }

  return uniqueStrings(matchingUserIds);
}

async function handleDeleteBuyer(adminClient: AdminClient, body: Record<string, unknown>) {
  const buyerId = safeString(body.buyerId);
  if (!buyerId) {
    return jsonResponse(400, { error: "Missing buyerId" });
  }

  const { data: buyer, error: buyerError } = await adminClient
    .from("buyers")
    .select("id, email, billing_email, company_name, notes")
    .eq("id", buyerId)
    .maybeSingle();

  if (buyerError && !isMissingRowError(buyerError)) {
    return jsonResponse(500, { error: buyerError.message });
  }
  if (!buyer) {
    return jsonResponse(404, { error: "Buyer not found" });
  }

  const candidateEmails = uniqueEmails([buyer.email, buyer.billing_email, body.email]);

  const linkedProfilesByBuyerId = await adminClient
    .from("profiles")
    .select("id, email, role, buyer_id")
    .eq("buyer_id", buyerId);
  if (linkedProfilesByBuyerId.error && !isMissingRowError(linkedProfilesByBuyerId.error)) {
    return jsonResponse(500, { error: linkedProfilesByBuyerId.error.message });
  }

  const linkedProfilesByEmail = candidateEmails.length > 0
    ? await adminClient
      .from("profiles")
      .select("id, email, role, buyer_id")
      .eq("role", "buyer")
      .in("email", candidateEmails)
    : { data: [], error: null };
  if (linkedProfilesByEmail.error && !isMissingRowError(linkedProfilesByEmail.error)) {
    return jsonResponse(500, { error: linkedProfilesByEmail.error.message });
  }

  const linkedAllowedByBuyerId = await adminClient
    .from("allowed_users")
    .select("id, email, role, buyer_id")
    .eq("buyer_id", buyerId);
  if (linkedAllowedByBuyerId.error && !isMissingRowError(linkedAllowedByBuyerId.error)) {
    return jsonResponse(500, { error: linkedAllowedByBuyerId.error.message });
  }

  const linkedAllowedByEmail = candidateEmails.length > 0
    ? await adminClient
      .from("allowed_users")
      .select("id, email, role, buyer_id")
      .eq("role", "buyer")
      .in("email", candidateEmails)
    : { data: [], error: null };
  if (linkedAllowedByEmail.error && !isMissingRowError(linkedAllowedByEmail.error)) {
    return jsonResponse(500, { error: linkedAllowedByEmail.error.message });
  }

  const linkedProfiles = uniqueById([
    ...((linkedProfilesByBuyerId.data as Array<Record<string, unknown>>) || []),
    ...((linkedProfilesByEmail.data as Array<Record<string, unknown>>) || []),
  ]);
  const linkedAllowedUsers = uniqueById([
    ...((linkedAllowedByBuyerId.data as Array<Record<string, unknown>>) || []),
    ...((linkedAllowedByEmail.data as Array<Record<string, unknown>>) || []),
  ]);

  const profileIds = uniqueStrings(linkedProfiles.map((row) => row.id));
  let authUserIds: string[] = [];
  try {
    authUserIds = uniqueStrings([
      ...linkedProfiles.map((row) => row.id),
      ...await findAuthUserIdsByEmails(adminClient, candidateEmails),
    ]);
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const allowedUserIds = uniqueStrings(linkedAllowedUsers.map((row) => row.id));

  let archivedBuyer = false;
  let archivedAuthUserIds: string[] = [];
  try {
    await deleteAppPushTokens(adminClient, profileIds, [buyerId]);
    await deleteBuyerOffersForBuyer(adminClient, [buyerId], candidateEmails);
    await deleteByIds(adminClient, "allowed_users", allowedUserIds);
    await deleteByIds(adminClient, "profiles", profileIds);
    archivedAuthUserIds = await deleteAuthUsers(adminClient, authUserIds);

    const { error: buyerDeleteError } = await adminClient
      .from("buyers")
      .delete()
      .eq("id", buyerId);
    if (buyerDeleteError && !isMissingRowError(buyerDeleteError)) {
      if (!isForeignKeyViolation(buyerDeleteError)) {
        throw new Error(`buyers: ${buyerDeleteError.message}`);
      }

      // Huutokauppojen ja laskutuksen historia viittaa ostajaan. Säilytä
      // historiallinen rivi, mutta irrota se kirjautumisesta ja aktiivisesta
      // ostajarekisteristä, jotta sama sähköposti voidaan rekisteröidä uudelleen.
      const marker = archivedBuyerMarker(buyerId);
      const previousNotes = safeString(buyer.notes);
      const { error: archiveError } = await adminClient
        .from("buyers")
        .update({
          email: `deleted+${buyerId}@invalid.local`,
          billing_email: null,
          is_active: false,
          notes: previousNotes ? `${previousNotes}\n${marker}` : marker,
        })
        .eq("id", buyerId);
      if (archiveError) {
        throw new Error(`buyers archive: ${archiveError.message}`);
      }
      archivedBuyer = true;
    }
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "buyer",
    deletedBuyerId: buyerId,
    deletedAllowedUserCount: allowedUserIds.length,
    deletedProfileCount: profileIds.length,
    deletedAuthUserCount: authUserIds.length,
    archivedAuthUserCount: archivedAuthUserIds.length,
    archivedBuyer,
  });
}

async function handleDeleteUser(adminClient: AdminClient, body: Record<string, unknown>) {
  const allowedUserId = safeString(body.allowedUserId);
  const directUserId = safeString(body.userId);
  const directEmail = normalizeEmail(body.email);

  if (!allowedUserId && !directUserId && !directEmail) {
    return jsonResponse(400, { error: "Missing allowedUserId, userId or email" });
  }

  const allowedRowResult = allowedUserId
    ? await adminClient
      .from("allowed_users")
      .select("id, email, role, buyer_id")
      .eq("id", allowedUserId)
      .maybeSingle()
    : { data: null, error: null };
  if (allowedRowResult.error && !isMissingRowError(allowedRowResult.error)) {
    return jsonResponse(500, { error: allowedRowResult.error.message });
  }

  const candidateEmails = uniqueEmails([directEmail, allowedRowResult.data?.email]);
  const candidateProfileIds = uniqueStrings([directUserId]);

  const profileRowsById = candidateProfileIds.length > 0
    ? await adminClient
      .from("profiles")
      .select("id, email, role, buyer_id")
      .in("id", candidateProfileIds)
    : { data: [], error: null };
  if (profileRowsById.error && !isMissingRowError(profileRowsById.error)) {
    return jsonResponse(500, { error: profileRowsById.error.message });
  }

  const profileRowsByEmail = candidateEmails.length > 0
    ? await adminClient
      .from("profiles")
      .select("id, email, role, buyer_id")
      .in("email", candidateEmails)
    : { data: [], error: null };
  if (profileRowsByEmail.error && !isMissingRowError(profileRowsByEmail.error)) {
    return jsonResponse(500, { error: profileRowsByEmail.error.message });
  }

  const linkedProfiles = uniqueById([
    ...((profileRowsById.data as Array<Record<string, unknown>>) || []),
    ...((profileRowsByEmail.data as Array<Record<string, unknown>>) || []),
  ]);

  const profileIds = uniqueStrings(linkedProfiles.map((row) => row.id));
  let authUserIds: string[] = [];
  let archivedAuthUserIds: string[] = [];
  try {
    authUserIds = uniqueStrings([
      ...linkedProfiles.map((row) => row.id),
      ...await findAuthUserIdsByEmails(adminClient, candidateEmails),
    ]);
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const allowedUserRowsByEmail = candidateEmails.length > 0
    ? await adminClient
      .from("allowed_users")
      .select("id")
      .in("email", candidateEmails)
    : { data: [], error: null };
  if (allowedUserRowsByEmail.error && !isMissingRowError(allowedUserRowsByEmail.error)) {
    return jsonResponse(500, { error: allowedUserRowsByEmail.error.message });
  }

  const allowedUserIds = uniqueStrings([
    allowedUserId,
    ...(((allowedUserRowsByEmail.data as Array<Record<string, unknown>>) || []).map((row) => row.id)),
  ]);

  const candidateBuyerIds = uniqueStrings([
    allowedRowResult.data?.buyer_id,
    ...linkedProfiles.map((row) => row.buyer_id),
  ]);

  try {
    await deleteAppPushTokens(adminClient, profileIds, []);
    await deleteSellerOwnedData(adminClient, profileIds);
    await deleteByIds(adminClient, "allowed_users", allowedUserIds);
    await deleteByIds(adminClient, "profiles", profileIds);
    archivedAuthUserIds = await deleteAuthUsers(adminClient, authUserIds);
    await deactivateOrphanedBuyers(adminClient, candidateBuyerIds, candidateEmails, profileIds, allowedUserIds);
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "user",
    deletedAllowedUserCount: allowedUserIds.length,
    deletedProfileCount: profileIds.length,
    deletedAuthUserCount: authUserIds.length,
    archivedAuthUserCount: archivedAuthUserIds.length,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const authContext = await requireAuthenticatedProfileContext(req);
  if (!authContext.ok) {
    return authContext.response;
  }

  if (safeString(authContext.profile?.role) !== "owner") {
    return jsonResponse(403, { error: "Only owner can delete users or buyers" });
  }

  const body = await req.json().catch(() => ({}));
  const type = safeString(body.type).toLowerCase();

  if (type === "buyer") {
    return handleDeleteBuyer(authContext.adminClient, body as Record<string, unknown>);
  }

  if (type === "user") {
    return handleDeleteUser(authContext.adminClient, body as Record<string, unknown>);
  }

  return jsonResponse(400, { error: "Missing or invalid type" });
});
